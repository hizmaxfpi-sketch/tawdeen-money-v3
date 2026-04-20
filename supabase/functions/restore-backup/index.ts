import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const asArray = (value: unknown) => Array.isArray(value) ? value : [];
const asString = (value: unknown) => typeof value === "string" && value.trim().length > 0 ? value : null;
const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const validEnum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contacts = asArray(body?.contacts);
    const funds = asArray(body?.funds);
    const transactions = asArray(body?.transactions);
    const debts = asArray(body?.debts);
    const projects = asArray(body?.projects);
    const containers = asArray(body?.containers);
    const shipments = asArray(body?.shipments);
    const shipmentPayments = asArray(body?.shipment_payments ?? body?.shipmentPayments);
    const currencies = asArray(body?.currencies);
    const companySettings = asArray(body?.company_settings ?? body?.companySettings);
    const ledgerAccounts = asArray(body?.ledger_accounts ?? body?.ledgerAccounts);

    const totalItems = contacts.length + funds.length + transactions.length + debts.length + projects.length + containers.length + shipments.length + currencies.length;
    if (totalItems === 0) {
      return new Response(JSON.stringify({ error: "Backup payload is empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============= حماية متعددة الشركات =============
    // امنع استعادة أي سجل id موجود حالياً لمستخدم آخر (شركة أخرى)
    // حتى لا يتم الكتابة فوق بياناتهم عبر upsert.
    const collectIds = (rows: any[]) =>
      rows.map(r => asString(r?.id)).filter((v): v is string => !!v);

    const checkOwnership = async (table: string, ids: string[]): Promise<Set<string>> => {
      const conflicts = new Set<string>();
      if (!ids.length) return conflicts;
      // batch in chunks of 200 to avoid URL limits
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data } = await supabase.from(table).select("id,user_id").in("id", chunk);
        (data || []).forEach((row: any) => {
          if (row.user_id && row.user_id !== userId) conflicts.add(row.id);
        });
      }
      return conflicts;
    };

    const tablesToCheck: Array<[string, any[]]> = [
      ["contacts", contacts],
      ["funds", funds],
      ["transactions", transactions],
      ["debts", debts],
      ["projects", projects],
      ["containers", containers],
      ["shipments", shipments],
      ["currencies", currencies],
      ["ledger_accounts", ledgerAccounts],
      ["company_settings", companySettings],
      ["shipment_payments", shipmentPayments],
    ];
    const foreignIdsByTable: Record<string, Set<string>> = {};
    let foreignTotal = 0;
    for (const [table, rows] of tablesToCheck) {
      const conflicts = await checkOwnership(table, collectIds(rows));
      if (conflicts.size) {
        foreignIdsByTable[table] = conflicts;
        foreignTotal += conflicts.size;
      }
    }
    if (foreignTotal > 0) {
      console.warn("Restore blocked - cross-company id conflicts:", JSON.stringify(
        Object.fromEntries(Object.entries(foreignIdsByTable).map(([k, v]) => [k, v.size]))
      ));
      return new Response(JSON.stringify({
        error: "تم رفض الاستعادة: ملف النسخة الاحتياطية يحتوي معرفات تخص شركة أخرى. الرجاء استخدام نسخة احتياطية تخص شركتك فقط.",
        conflicts: Object.fromEntries(Object.entries(foreignIdsByTable).map(([k, v]) => [k, Array.from(v)])),
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Restore: contacts=${contacts.length}, funds=${funds.length}, tx=${transactions.length}, debts=${debts.length}, projects=${projects.length}, containers=${containers.length}, shipments=${shipments.length}, currencies=${currencies.length}`);

    const results: Record<string, { success: number; errors: number }> = {};
    const validContactIds = new Set<string>();
    const validFundIds = new Set<string>();
    const validProjectIds = new Set<string>();
    const validContainerIds = new Set<string>();
    const validShipmentIds = new Set<string>();

    // 1. Contacts
    if (contacts.length) {
      let success = 0, errors = 0;
      for (const c of contacts) {
        const contactId = asString(c.id) ?? crypto.randomUUID();
        const { error } = await supabase.from("contacts").upsert({
          id: contactId,
          user_id: userId,
          name: asString(c.name) ?? "جهة اتصال",
          type: validEnum(c.type, ["client", "vendor", "shipping_agent", "employee", "partner", "other"] as const, "other"),
          custom_type: asString(c.custom_type ?? c.customType),
          phone: asString(c.phone),
          email: asString(c.email),
          company: asString(c.company),
          address: asString(c.address),
          notes: asString(c.notes),
          parent_contact_id: null,
          linked_contacts: asArray(c.linked_contacts ?? c.linkedContacts),
          total_transactions: asNumber(c.total_transactions ?? c.totalTransactions),
          total_debit: asNumber(c.total_debit ?? c.totalDebit),
          total_credit: asNumber(c.total_credit ?? c.totalCredit),
          balance: asNumber(c.balance),
          status: asString(c.status) ?? "active",
          created_by_name: asString(c.created_by_name ?? c.createdByName),
        }, { onConflict: "id" });
        if (error) { console.error("Contact:", JSON.stringify(error)); errors++; }
        else { success++; validContactIds.add(contactId); }
      }
      // Update parent relations
      for (const c of contacts) {
        const contactId = asString(c.id);
        const parentId = asString(c.parent_contact_id ?? c.parentContactId);
        if (!contactId || !parentId || !validContactIds.has(parentId)) continue;
        await supabase.from("contacts").update({ parent_contact_id: parentId }).eq("id", contactId).eq("user_id", userId);
      }
      results.contacts = { success, errors };
    }

    // 2. Ledger accounts
    if (ledgerAccounts.length) {
      let success = 0, errors = 0;
      for (const la of ledgerAccounts) {
        const { error } = await supabase.from("ledger_accounts").upsert({
          id: asString(la.id) ?? crypto.randomUUID(),
          user_id: userId,
          name: asString(la.name) ?? "حساب",
          type: validEnum(la.type, ["client", "vendor", "partner", "investor", "employee", "custom"] as const, "client"),
          custom_type: asString(la.custom_type ?? la.customType),
          phone: asString(la.phone),
          email: asString(la.email),
          address: asString(la.address),
          notes: asString(la.notes),
          balance: asNumber(la.balance),
        }, { onConflict: "id" });
        if (error) { console.error("LedgerAccount:", JSON.stringify(error)); errors++; } else success++;
      }
      results.ledger_accounts = { success, errors };
    }

    // 3. Currencies
    if (currencies.length) {
      let success = 0, errors = 0;
      for (const cur of currencies) {
        const { error } = await supabase.from("currencies").upsert({
          id: asString(cur.id) ?? crypto.randomUUID(),
          user_id: userId,
          code: asString(cur.code) ?? "USD",
          name: asString(cur.name) ?? "عملة",
          symbol: asString(cur.symbol) ?? "$",
          exchange_rate: asNumber(cur.exchange_rate ?? cur.exchangeRate, 1),
          is_default: cur.is_default ?? cur.isDefault ?? false,
        }, { onConflict: "id" });
        if (error) { console.error("Currency:", JSON.stringify(error)); errors++; } else success++;
      }
      results.currencies = { success, errors };
    }

    // 4. Company settings
    if (companySettings.length) {
      let success = 0, errors = 0;
      for (const cs of companySettings) {
        const { error } = await supabase.from("company_settings").upsert({
          id: asString(cs.id) ?? crypto.randomUUID(),
          user_id: userId,
          company_name: asString(cs.company_name ?? cs.companyName),
          company_address: asString(cs.company_address ?? cs.companyAddress),
          company_phone: asString(cs.company_phone ?? cs.companyPhone),
          company_email: asString(cs.company_email ?? cs.companyEmail),
          tax_number: asString(cs.tax_number ?? cs.taxNumber),
          company_logo_url: asString(cs.company_logo_url ?? cs.companyLogoUrl),
        }, { onConflict: "id" });
        if (error) { console.error("CompanySettings:", JSON.stringify(error)); errors++; } else success++;
      }
      results.company_settings = { success, errors };
    }

    // 5. Funds
    if (funds.length) {
      let success = 0, errors = 0;
      for (const f of funds) {
        const fundId = asString(f.id) ?? crypto.randomUUID();
        const { error } = await supabase.from("funds").upsert({
          id: fundId,
          user_id: userId,
          name: asString(f.name) ?? "صندوق",
          type: validEnum(f.type, ["cash", "bank", "wallet", "safe", "other"] as const, "cash"),
          balance: asNumber(f.balance),
          description: asString(f.description),
          currency_code: asString(f.currency_code ?? f.currencyCode) ?? "USD",
          icon: asString(f.icon),
        }, { onConflict: "id" });
        if (error) { console.error("Fund:", JSON.stringify(error)); errors++; }
        else { success++; validFundIds.add(fundId); }
      }
      results.funds = { success, errors };
    }

    // 6. Projects
    if (projects.length) {
      let success = 0, errors = 0;
      for (const p of projects) {
        const projectId = asString(p.id) ?? crypto.randomUUID();
        const clientId = asString(p.clientId ?? p.client_id);
        const vendorId = asString(p.vendorId ?? p.vendor_id);
        const { error } = await supabase.from("projects").upsert({
          id: projectId,
          user_id: userId,
          name: asString(p.name) ?? "مشروع",
          notes: asString(p.description ?? p.notes),
          client_id: clientId && validContactIds.has(clientId) ? clientId : null,
          vendor_id: vendorId && validContactIds.has(vendorId) ? vendorId : null,
          contract_value: asNumber(p.contractValue ?? p.contract_value),
          expenses: asNumber(p.expenses),
          received_amount: asNumber(p.receivedAmount ?? p.received_amount),
          commission: asNumber(p.commission),
          currency_difference: asNumber(p.currencyDifference ?? p.currency_difference),
          profit: asNumber(p.profit),
          status: asString(p.status) ?? "active",
          start_date: asString(p.startDate ?? p.start_date),
          end_date: asString(p.endDate ?? p.end_date),
          completion_date: asString(p.completionDate ?? p.completion_date),
          created_by_name: asString(p.created_by_name ?? p.createdByName),
          attachments: asArray(p.attachments),
        }, { onConflict: "id" });
        if (error) { console.error("Project:", JSON.stringify(error)); errors++; }
        else { success++; validProjectIds.add(projectId); }
      }
      results.projects = { success, errors };
    }

    // 7. Containers
    if (containers.length) {
      let success = 0, errors = 0;
      for (const ct of containers) {
        const containerId = asString(ct.id) ?? crypto.randomUUID();
        const agentId = asString(ct.shipping_agent_id ?? ct.shippingAgentId);
        const { error } = await supabase.from("containers").upsert({
          id: containerId,
          user_id: userId,
          container_number: asString(ct.container_number ?? ct.containerNumber) ?? "CONT-???",
          type: asString(ct.type) ?? "40ft",
          capacity: asNumber(ct.capacity, 67),
          used_capacity: asNumber(ct.used_capacity ?? ct.usedCapacity),
          route: asString(ct.route) ?? "",
          origin_country: asString(ct.origin_country ?? ct.originCountry),
          destination_country: asString(ct.destination_country ?? ct.destinationCountry),
          status: validEnum(ct.status, ["loading", "shipped", "arrived", "cleared", "delivered"] as const, "loading"),
          shipping_agent_id: agentId && validContactIds.has(agentId) ? agentId : null,
          shipping_cost: asNumber(ct.shipping_cost ?? ct.shippingCost),
          customs_cost: asNumber(ct.customs_cost ?? ct.customsCost),
          port_cost: asNumber(ct.port_cost ?? ct.portCost),
          other_costs: asNumber(ct.other_costs ?? ct.otherCosts),
          container_price: asNumber(ct.container_price ?? ct.containerPrice),
          glass_fees: asNumber(ct.glass_fees ?? ct.glassFees),
          cost_per_meter: asNumber(ct.cost_per_meter ?? ct.costPerMeter),
          total_cost: asNumber(ct.total_cost ?? ct.totalCost),
          total_revenue: asNumber(ct.total_revenue ?? ct.totalRevenue),
          profit: asNumber(ct.profit),
          is_manually_closed: ct.is_manually_closed ?? ct.isManullyClosed ?? false,
          departure_date: asString(ct.departure_date ?? ct.departureDate),
          arrival_date: asString(ct.arrival_date ?? ct.arrivalDate),
          clearance_date: asString(ct.clearance_date ?? ct.clearanceDate),
          rental_date: asString(ct.rental_date ?? ct.rentalDate),
          rental_days: asNumber(ct.rental_days ?? ct.rentalDays),
          loading_days: asNumber(ct.loading_days ?? ct.loadingDays),
          notes: asString(ct.notes),
          attachments: asArray(ct.attachments),
          created_by_name: asString(ct.created_by_name ?? ct.createdByName),
        }, { onConflict: "id" });
        if (error) { console.error("Container:", JSON.stringify(error)); errors++; }
        else { success++; validContainerIds.add(containerId); }
      }
      results.containers = { success, errors };
    }

    // 8. Shipments
    if (shipments.length) {
      let success = 0, errors = 0;
      for (const s of shipments) {
        const shipmentId = asString(s.id) ?? crypto.randomUUID();
        const containerId = asString(s.container_id ?? s.containerId);
        const clientId = asString(s.client_id ?? s.clientId);
        if (!containerId || !validContainerIds.has(containerId)) { errors++; continue; }
        const { error } = await supabase.from("shipments").upsert({
          id: shipmentId,
          user_id: userId,
          container_id: containerId,
          client_id: clientId && validContactIds.has(clientId) ? clientId : null,
          client_name: asString(s.client_name ?? s.clientName) ?? "",
          client_code: asString(s.client_code ?? s.clientCode),
          recipient_name: asString(s.recipient_name ?? s.recipientName),
          goods_type: asString(s.goods_type ?? s.goodsType) ?? "",
          manual_cargo_code: asString(s.manual_cargo_code ?? s.manualCargoCode) ?? ("CARGO-" + crypto.randomUUID().substring(0, 8)),
          package_number: asString(s.package_number ?? s.packageNumber),
          length: asNumber(s.length),
          width: asNumber(s.width),
          height: asNumber(s.height),
          quantity: asNumber(s.quantity, 1),
          weight: asNumber(s.weight),
          cbm: asNumber(s.cbm),
          price_per_meter: asNumber(s.price_per_meter ?? s.pricePerMeter),
          contract_price: asNumber(s.contract_price ?? s.contractPrice),
          amount_paid: asNumber(s.amount_paid ?? s.amountPaid),
          remaining_amount: asNumber(s.remaining_amount ?? s.remainingAmount),
          payment_status: validEnum(s.payment_status ?? s.paymentStatus, ["unpaid", "partial", "paid"] as const, "unpaid"),
          tracking_number: asString(s.tracking_number ?? s.trackingNumber),
          notes: asString(s.notes),
          attachments: asArray(s.attachments),
          china_expenses: asNumber(s.china_expenses ?? s.chinaExpenses),
          sea_freight: asNumber(s.sea_freight ?? s.seaFreight),
          port_delivery_fees: asNumber(s.port_delivery_fees ?? s.portDeliveryFees),
          customs_fees: asNumber(s.customs_fees ?? s.customsFees),
          internal_transport_fees: asNumber(s.internal_transport_fees ?? s.internalTransportFees),
          domestic_shipping_cost: asNumber(s.domestic_shipping_cost ?? s.domesticShippingCost),
          transit_cost: asNumber(s.transit_cost ?? s.transitCost),
          created_by_name: asString(s.created_by_name ?? s.createdByName),
        }, { onConflict: "id" });
        if (error) { console.error("Shipment:", JSON.stringify(error)); errors++; }
        else { success++; validShipmentIds.add(shipmentId); }
      }
      results.shipments = { success, errors };
    }

    // 9. Shipment payments
    if (shipmentPayments.length) {
      let success = 0, errors = 0;
      for (const sp of shipmentPayments) {
        const shipmentId = asString(sp.shipment_id ?? sp.shipmentId);
        const fundId = asString(sp.fund_id ?? sp.fundId);
        if (!shipmentId || !validShipmentIds.has(shipmentId)) { errors++; continue; }
        const { error } = await supabase.from("shipment_payments").upsert({
          id: asString(sp.id) ?? crypto.randomUUID(),
          user_id: userId,
          shipment_id: shipmentId,
          amount: asNumber(sp.amount),
          date: asString(sp.date) ?? new Date().toISOString(),
          fund_id: fundId && validFundIds.has(fundId) ? fundId : null,
          note: asString(sp.note),
        }, { onConflict: "id" });
        if (error) { console.error("ShipmentPayment:", JSON.stringify(error)); errors++; } else success++;
      }
      results.shipment_payments = { success, errors };
    }

    // 10. Transactions (after all references exist)
    if (transactions.length) {
      let success = 0, errors = 0;
      for (const t of transactions) {
        const contactId = asString(t.contactId ?? t.contact_id);
        const projectId = asString(t.projectId ?? t.project_id);
        const fundId = asString(t.fundId ?? t.fund_id);
        const shipmentId = asString(t.shipment_id ?? t.shipmentId);
        const { error } = await supabase.from("transactions").upsert({
          id: asString(t.id) ?? crypto.randomUUID(),
          user_id: userId,
          type: validEnum(t.type, ["in", "out"] as const, "out"),
          category: asString(t.category) ?? "general",
          amount: asNumber(t.amount),
          description: asString(t.description),
          date: asString(t.date) ?? new Date().toISOString().split("T")[0],
          fund_id: fundId && validFundIds.has(fundId) ? fundId : null,
          account_id: null,
          contact_id: contactId && validContactIds.has(contactId) ? contactId : null,
          project_id: projectId && validProjectIds.has(projectId) ? projectId : null,
          shipment_id: shipmentId && validShipmentIds.has(shipmentId) ? shipmentId : null,
          notes: asString(t.notes),
          attachments: asArray(t.attachments).length ? asArray(t.attachments) : (asString(t.attachment) ? [t.attachment] : null),
          currency_code: asString(t.currencyCode ?? t.currency_code) ?? "USD",
          exchange_rate: asNumber(t.exchangeRate ?? t.exchange_rate, 1),
          source_type: asString(t.sourceType ?? t.source_type) ?? "manual",
          idempotency_key: asString(t.idempotency_key ?? t.idempotencyKey),
          posting_batch_id: asString(t.posting_batch_id ?? t.postingBatchId),
          reference_id: asString(t.reference_id ?? t.referenceId),
          created_by_name: asString(t.created_by_name ?? t.createdByName),
        }, { onConflict: "id" });
        if (error) { console.error("Transaction:", JSON.stringify(error)); errors++; } else success++;
      }
      results.transactions = { success, errors };
    }

    // 11. Debts + debt payments
    if (debts.length) {
      let success = 0, errors = 0;
      for (const d of debts) {
        const debtId = asString(d.id) ?? crypto.randomUUID();
        const contactId = asString(d.contactId ?? d.contact_id ?? d.accountId ?? d.account_id);
        const projectId = asString(d.projectId ?? d.project_id);
        const { error } = await supabase.from("debts").upsert({
          id: debtId,
          user_id: userId,
          type: validEnum(d.type, ["receivable", "payable"] as const, "receivable"),
          contact_id: contactId && validContactIds.has(contactId) ? contactId : null,
          account_id: null,
          project_id: projectId && validProjectIds.has(projectId) ? projectId : null,
          description: asString(d.description),
          original_amount: asNumber(d.originalAmount ?? d.original_amount ?? d.amount),
          remaining_amount: asNumber(d.remainingAmount ?? d.remaining_amount),
          due_date: asString(d.dueDate ?? d.due_date),
          status: validEnum(d.status, ["pending", "partial", "paid", "overdue"] as const, "pending"),
          created_by_name: asString(d.created_by_name ?? d.createdByName),
        }, { onConflict: "id" });
        if (error) { console.error("Debt:", JSON.stringify(error)); errors++; }
        else {
          success++;
          for (const p of asArray(d.payments)) {
            const paymentFundId = asString(p.fundId ?? p.fund_id);
            await supabase.from("debt_payments").upsert({
              id: asString(p.id) ?? crypto.randomUUID(),
              user_id: userId,
              debt_id: debtId,
              amount: asNumber(p.amount),
              date: asString(p.date) ?? new Date().toISOString(),
              fund_id: paymentFundId && validFundIds.has(paymentFundId) ? paymentFundId : null,
              note: asString(p.note),
            }, { onConflict: "id" });
          }
        }
      }
      results.debts = { success, errors };
    }

    // 12. Sync contact balances
    await supabase.rpc("sync_contact_balances_admin", { p_user_id: userId });

    console.log("Restore complete:", JSON.stringify(results));

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Restore error:", err?.message, err?.stack);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
