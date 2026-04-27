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

    // Verify authorization: platform admin OR company admin/owner can restore
    const [{ data: platformAdmin }, { data: roleRow }] = await Promise.all([
      supabase.from("platform_admins").select("id").eq("user_id", userId).maybeSingle(),
      supabase
        .from("user_roles")
        .select("role, company_id, is_active")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    const isPlatformAdmin = !!platformAdmin;
    const userRole = (roleRow as any)?.role as string | undefined;
    const isCompanyAdmin = userRole === "admin" || userRole === "owner";

    if (!isPlatformAdmin && !isCompanyAdmin) {
      console.warn(`Unauthorized restore attempt by user ${userId} (role=${userRole ?? 'none'})`);
      return new Response(JSON.stringify({
        error: "غير مصرح: تحتاج صلاحيات مدير الشركة أو المسؤول العام لاستعادة النسخ الاحتياطية",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const containerExpenses = asArray(body?.container_expenses ?? body?.containerExpenses);
    // Production module
    const productionMaterials = asArray(body?.production_materials ?? body?.productionMaterials);
    const productionProducts = asArray(body?.production_products ?? body?.productionProducts);
    const productionServices = asArray(body?.production_services ?? body?.productionServices);
    const materialPurchases = asArray(body?.material_purchases ?? body?.materialPurchases);
    const productionRuns = asArray(body?.production_runs ?? body?.productionRuns);
    const productionSales = asArray(body?.production_sales ?? body?.productionSales);
    const productBom = asArray(body?.product_bom ?? body?.productBom);
    const productionSaleServices = asArray(body?.production_sale_services ?? body?.productionSaleServices);
    const productionSaleExpenses = asArray(body?.production_sale_expenses ?? body?.productionSaleExpenses);
    // Assets module
    const assets = asArray(body?.assets);
    const assetPayments = asArray(body?.asset_payments ?? body?.assetPayments);
    const assetImprovements = asArray(body?.asset_improvements ?? body?.assetImprovements);
    // Obligations module
    const recurringObligations = asArray(body?.recurring_obligations ?? body?.recurringObligations);
    const obligationItems = asArray(body?.obligation_items ?? body?.obligationItems);
    const obligationDrafts = asArray(body?.obligation_drafts ?? body?.obligationDrafts);
    const obligationDraftItems = asArray(body?.obligation_draft_items ?? body?.obligationDraftItems);
    const backupMeta = body?.backupMeta ?? body?.backup_meta ?? {};

    const totalItems = contacts.length + funds.length + transactions.length + debts.length + projects.length + containers.length + shipments.length + currencies.length + productionMaterials.length + productionProducts.length + productionSales.length + assets.length;
    if (totalItems === 0) {
      return new Response(JSON.stringify({ error: "Backup payload is empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentCompanyId = (roleRow as any)?.company_id ?? null;
    if (!currentCompanyId && !isPlatformAdmin) {
      return new Response(JSON.stringify({ error: "لم يتم العثور على شركة مرتبطة بحسابك" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: companyMembers } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("company_id", currentCompanyId)
      .eq("is_active", true);

    const allowedCompanyUserIds = Array.from(new Set([
      userId,
      ...(companyMembers || []).map((row: any) => row.user_id).filter(Boolean),
    ]));
    const allowedCompanyUserIdSet = new Set(allowedCompanyUserIds);

    const resolveRowUserId = (candidate: unknown): string => {
      const resolved = asString(candidate);
      return resolved && allowedCompanyUserIdSet.has(resolved) ? resolved : userId;
    };

    const backupCompanyId = asString(backupMeta?.companyId);
    if (backupCompanyId && backupCompanyId !== currentCompanyId) {
      return new Response(JSON.stringify({
        error: "تم رفض الاستعادة: هذه النسخة الاحتياطية تخص شركة مختلفة.",
        backupCompanyId,
        currentCompanyId,
      }), {
        status: 409,
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
          if (row.user_id && !allowedCompanyUserIdSet.has(row.user_id)) conflicts.add(row.id);
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
          user_id: resolveRowUserId(c.user_id),
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

    // 2. Ledger accounts (Legacy - Merged into contacts)
    // We only restore these if they don't already exist as contacts to prevent data loss,
    // but they are officially deprecated.
    if (ledgerAccounts.length) {
      let success = 0, errors = 0;
      for (const la of ledgerAccounts) {
        const id = asString(la.id);
        if (id && validContactIds.has(id)) continue; // Skip if already handled by contacts

        const { error } = await supabase.from("contacts").upsert({
          id: id ?? crypto.randomUUID(),
          user_id: resolveRowUserId(la.user_id),
          name: asString(la.name) ?? "حساب مستعاد",
          type: validEnum(la.type, ["client", "vendor", "partner", "investor", "employee", "other"] as any, "other"),
          phone: asString(la.phone),
          email: asString(la.email),
          address: asString(la.address),
          notes: asString(la.notes),
          balance: asNumber(la.balance),
          status: "active",
        }, { onConflict: "id" });
        if (error) { console.error("LegacyLedgerAccount:", JSON.stringify(error)); errors++; } else success++;
      }
      results.legacy_ledger_migrated = { success, errors };
    }

    // 3. Currencies
    if (currencies.length) {
      let success = 0, errors = 0;
      for (const cur of currencies) {
        const { error } = await supabase.from("currencies").upsert({
          id: asString(cur.id) ?? crypto.randomUUID(),
          user_id: resolveRowUserId(cur.user_id),
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
          user_id: resolveRowUserId(cs.user_id),
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
          user_id: resolveRowUserId(f.user_id),
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
          user_id: resolveRowUserId(p.user_id),
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
          user_id: resolveRowUserId(ct.user_id),
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
          is_manually_closed: ct.is_manually_closed ?? ct.isManuallyClosed ?? false,
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
          user_id: resolveRowUserId(s.user_id),
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
          user_id: resolveRowUserId(sp.user_id),
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
          user_id: resolveRowUserId(t.user_id),
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
          user_id: resolveRowUserId(d.user_id),
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
              user_id: resolveRowUserId(p.user_id ?? d.user_id),
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

    // ============= Production Module =============
    const validMaterialIds = new Set<string>();
    const validProductIds = new Set<string>();
    const validServiceIds = new Set<string>();
    const validSaleIds = new Set<string>();
    const validAssetIds = new Set<string>();

    // Production materials
    if (productionMaterials.length) {
      let success = 0, errors = 0;
      for (const m of productionMaterials) {
        const id = asString(m.id) ?? crypto.randomUUID();
        const { error } = await supabase.from("production_materials").upsert({
          id,
          user_id: resolveRowUserId(m.user_id),
          name: asString(m.name) ?? "مادة",
          code: asString(m.code),
          unit: asString(m.unit) ?? "pcs",
          quantity: asNumber(m.quantity),
          avg_cost: asNumber(m.avg_cost ?? m.avgCost),
          notes: asString(m.notes),
          created_by_name: asString(m.created_by_name ?? m.createdByName),
        }, { onConflict: "id" });
        if (error) { console.error("Material:", JSON.stringify(error)); errors++; }
        else { success++; validMaterialIds.add(id); }
      }
      results.production_materials = { success, errors };
    }

    // Production products
    if (productionProducts.length) {
      let success = 0, errors = 0;
      for (const p of productionProducts) {
        const id = asString(p.id) ?? crypto.randomUUID();
        const { error } = await supabase.from("production_products").upsert({
          id,
          user_id: resolveRowUserId(p.user_id),
          name: asString(p.name) ?? "منتج",
          code: asString(p.code),
          unit: asString(p.unit) ?? "pcs",
          quantity: asNumber(p.quantity),
          unit_cost: asNumber(p.unit_cost ?? p.unitCost),
          sell_price: asNumber(p.sell_price ?? p.sellPrice),
          notes: asString(p.notes),
          created_by_name: asString(p.created_by_name ?? p.createdByName),
        }, { onConflict: "id" });
        if (error) { console.error("Product:", JSON.stringify(error)); errors++; }
        else { success++; validProductIds.add(id); }
      }
      results.production_products = { success, errors };
    }

    // Production services
    if (productionServices.length) {
      let success = 0, errors = 0;
      for (const s of productionServices) {
        const id = asString(s.id) ?? crypto.randomUUID();
        const { error } = await supabase.from("production_services").upsert({
          id,
          user_id: resolveRowUserId(s.user_id),
          name: asString(s.name) ?? "خدمة",
          code: asString(s.code),
          default_price: asNumber(s.default_price ?? s.defaultPrice),
          unit_type: asString(s.unit_type ?? s.unitType) ?? "piece",
          custom_unit: asString(s.custom_unit ?? s.customUnit),
          notes: asString(s.notes),
          created_by_name: asString(s.created_by_name ?? s.createdByName),
        }, { onConflict: "id" });
        if (error) { console.error("Service:", JSON.stringify(error)); errors++; }
        else { success++; validServiceIds.add(id); }
      }
      results.production_services = { success, errors };
    }

    // Product BOM
    if (productBom.length) {
      let success = 0, errors = 0;
      for (const b of productBom) {
        const productId = asString(b.product_id ?? b.productId);
        const materialId = asString(b.material_id ?? b.materialId);
        if (!productId || !validProductIds.has(productId)) { errors++; continue; }
        if (!materialId || !validMaterialIds.has(materialId)) { errors++; continue; }
        const { error } = await supabase.from("product_bom").upsert({
          id: asString(b.id) ?? crypto.randomUUID(),
          user_id: resolveRowUserId(b.user_id),
          product_id: productId,
          material_id: materialId,
          qty_per_unit: asNumber(b.qty_per_unit ?? b.qtyPerUnit),
        }, { onConflict: "id" });
        if (error) { console.error("BOM:", JSON.stringify(error)); errors++; } else success++;
      }
      results.product_bom = { success, errors };
    }

    // Material purchases
    if (materialPurchases.length) {
      let success = 0, errors = 0;
      for (const mp of materialPurchases) {
        const materialId = asString(mp.material_id ?? mp.materialId);
        if (!materialId || !validMaterialIds.has(materialId)) { errors++; continue; }
        const contactId = asString(mp.contact_id ?? mp.contactId);
        const fundId = asString(mp.fund_id ?? mp.fundId);
        const { error } = await supabase.from("material_purchases").upsert({
          id: asString(mp.id) ?? crypto.randomUUID(),
          user_id: resolveRowUserId(mp.user_id),
          material_id: materialId,
          contact_id: contactId && validContactIds.has(contactId) ? contactId : null,
          fund_id: fundId && validFundIds.has(fundId) ? fundId : null,
          quantity: asNumber(mp.quantity),
          unit_price: asNumber(mp.unit_price ?? mp.unitPrice),
          total_amount: asNumber(mp.total_amount ?? mp.totalAmount),
          paid_amount: asNumber(mp.paid_amount ?? mp.paidAmount),
          date: asString(mp.date) ?? new Date().toISOString().split("T")[0],
          notes: asString(mp.notes),
          created_by_name: asString(mp.created_by_name ?? mp.createdByName),
        }, { onConflict: "id" });
        if (error) { console.error("MaterialPurchase:", JSON.stringify(error)); errors++; } else success++;
      }
      results.material_purchases = { success, errors };
    }

    // Production runs
    if (productionRuns.length) {
      let success = 0, errors = 0;
      for (const r of productionRuns) {
        const productId = asString(r.product_id ?? r.productId);
        if (!productId || !validProductIds.has(productId)) { errors++; continue; }
        const { error } = await supabase.from("production_runs").upsert({
          id: asString(r.id) ?? crypto.randomUUID(),
          user_id: resolveRowUserId(r.user_id),
          product_id: productId,
          quantity: asNumber(r.quantity),
          unit_cost: asNumber(r.unit_cost ?? r.unitCost),
          total_cost: asNumber(r.total_cost ?? r.totalCost),
          date: asString(r.date) ?? new Date().toISOString().split("T")[0],
          notes: asString(r.notes),
          created_by_name: asString(r.created_by_name ?? r.createdByName),
        }, { onConflict: "id" });
        if (error) { console.error("Run:", JSON.stringify(error)); errors++; } else success++;
      }
      results.production_runs = { success, errors };
    }

    // Production sales
    if (productionSales.length) {
      let success = 0, errors = 0;
      for (const s of productionSales) {
        const id = asString(s.id) ?? crypto.randomUUID();
        const productId = asString(s.product_id ?? s.productId);
        const materialId = asString(s.material_id ?? s.materialId);
        const contactId = asString(s.contact_id ?? s.contactId);
        const fundId = asString(s.fund_id ?? s.fundId);
        const { error } = await supabase.from("production_sales").upsert({
          id,
          user_id: resolveRowUserId(s.user_id),
          source_type: asString(s.source_type ?? s.sourceType) ?? "product",
          product_id: productId && validProductIds.has(productId) ? productId : null,
          material_id: materialId && validMaterialIds.has(materialId) ? materialId : null,
          contact_id: contactId && validContactIds.has(contactId) ? contactId : null,
          fund_id: fundId && validFundIds.has(fundId) ? fundId : null,
          quantity: asNumber(s.quantity),
          unit_price: asNumber(s.unit_price ?? s.unitPrice),
          total_amount: asNumber(s.total_amount ?? s.totalAmount),
          paid_amount: asNumber(s.paid_amount ?? s.paidAmount),
          cost_at_sale: asNumber(s.cost_at_sale ?? s.costAtSale),
          services_total: asNumber(s.services_total ?? s.servicesTotal),
          expenses_total: asNumber(s.expenses_total ?? s.expensesTotal),
          expenses_as_business: s.expenses_as_business ?? s.expensesAsBusiness ?? true,
          profit: asNumber(s.profit),
          date: asString(s.date) ?? new Date().toISOString().split("T")[0],
          notes: asString(s.notes),
          created_by_name: asString(s.created_by_name ?? s.createdByName),
        }, { onConflict: "id" });
        if (error) { console.error("Sale:", JSON.stringify(error)); errors++; }
        else { success++; validSaleIds.add(id); }
      }
      results.production_sales = { success, errors };
    }

    // Production sale services
    if (productionSaleServices.length) {
      let success = 0, errors = 0;
      for (const ss of productionSaleServices) {
        const saleId = asString(ss.sale_id ?? ss.saleId);
        if (!saleId || !validSaleIds.has(saleId)) { errors++; continue; }
        const serviceId = asString(ss.service_id ?? ss.serviceId);
        const { error } = await supabase.from("production_sale_services").upsert({
          id: asString(ss.id) ?? crypto.randomUUID(),
          user_id: resolveRowUserId(ss.user_id),
          sale_id: saleId,
          service_id: serviceId && validServiceIds.has(serviceId) ? serviceId : null,
          name: asString(ss.name) ?? "خدمة",
          amount: asNumber(ss.amount),
        }, { onConflict: "id" });
        if (error) { console.error("SaleService:", JSON.stringify(error)); errors++; } else success++;
      }
      results.production_sale_services = { success, errors };
    }

    // Production sale expenses
    if (productionSaleExpenses.length) {
      let success = 0, errors = 0;
      for (const se of productionSaleExpenses) {
        const saleId = asString(se.sale_id ?? se.saleId);
        if (!saleId || !validSaleIds.has(saleId)) { errors++; continue; }
        const fundId = asString(se.fund_id ?? se.fundId);
        const { error } = await supabase.from("production_sale_expenses").upsert({
          id: asString(se.id) ?? crypto.randomUUID(),
          user_id: resolveRowUserId(se.user_id),
          sale_id: saleId,
          description: asString(se.description) ?? "مصروف",
          amount: asNumber(se.amount),
          fund_id: fundId && validFundIds.has(fundId) ? fundId : null,
          treat_as_business: se.treat_as_business ?? se.treatAsBusiness ?? true,
        }, { onConflict: "id" });
        if (error) { console.error("SaleExpense:", JSON.stringify(error)); errors++; } else success++;
      }
      results.production_sale_expenses = { success, errors };
    }

    // ============= Assets Module =============
    if (assets.length) {
      let success = 0, errors = 0;
      for (const a of assets) {
        const id = asString(a.id) ?? crypto.randomUUID();
        const fundId = asString(a.fund_id ?? a.fundId);
        const depFundId = asString(a.depreciation_fund_id ?? a.depreciationFundId);
        const vendorId = asString(a.vendor_id ?? a.vendorId);
        const { error } = await supabase.from("assets").upsert({
          id,
          user_id: resolveRowUserId(a.user_id),
          name: asString(a.name) ?? "أصل",
          value: asNumber(a.value),
          current_value: asNumber(a.current_value ?? a.currentValue),
          paid_amount: asNumber(a.paid_amount ?? a.paidAmount),
          installment_count: asNumber(a.installment_count ?? a.installmentCount, 1),
          payment_type: asString(a.payment_type ?? a.paymentType) ?? "full",
          purchase_date: asString(a.purchase_date ?? a.purchaseDate) ?? new Date().toISOString().split("T")[0],
          depreciation_rate: asNumber(a.depreciation_rate ?? a.depreciationRate),
          monthly_depreciation: asNumber(a.monthly_depreciation ?? a.monthlyDepreciation),
          total_depreciation: asNumber(a.total_depreciation ?? a.totalDepreciation),
          fund_id: fundId && validFundIds.has(fundId) ? fundId : null,
          depreciation_fund_id: depFundId && validFundIds.has(depFundId) ? depFundId : null,
          vendor_id: vendorId && validContactIds.has(vendorId) ? vendorId : null,
          status: asString(a.status) ?? "active",
          notes: asString(a.notes),
        }, { onConflict: "id" });
        if (error) { console.error("Asset:", JSON.stringify(error)); errors++; }
        else { success++; validAssetIds.add(id); }
      }
      results.assets = { success, errors };
    }

    if (assetPayments.length) {
      let success = 0, errors = 0;
      for (const ap of assetPayments) {
        const assetId = asString(ap.asset_id ?? ap.assetId);
        if (!assetId || !validAssetIds.has(assetId)) { errors++; continue; }
        const fundId = asString(ap.fund_id ?? ap.fundId);
        const { error } = await supabase.from("asset_payments").upsert({
          id: asString(ap.id) ?? crypto.randomUUID(),
          user_id: resolveRowUserId(ap.user_id),
          asset_id: assetId,
          due_date: asString(ap.due_date ?? ap.dueDate) ?? new Date().toISOString().split("T")[0],
          paid_date: asString(ap.paid_date ?? ap.paidDate),
          amount: asNumber(ap.amount),
          fund_id: fundId && validFundIds.has(fundId) ? fundId : null,
          status: asString(ap.status) ?? "pending",
          note: asString(ap.note),
        }, { onConflict: "id" });
        if (error) { console.error("AssetPayment:", JSON.stringify(error)); errors++; } else success++;
      }
      results.asset_payments = { success, errors };
    }

    if (assetImprovements.length) {
      let success = 0, errors = 0;
      for (const ai of assetImprovements) {
        const assetId = asString(ai.asset_id ?? ai.assetId);
        if (!assetId || !validAssetIds.has(assetId)) { errors++; continue; }
        const fundId = asString(ai.fund_id ?? ai.fundId);
        const { error } = await supabase.from("asset_improvements").upsert({
          id: asString(ai.id) ?? crypto.randomUUID(),
          user_id: resolveRowUserId(ai.user_id),
          asset_id: assetId,
          name: asString(ai.name) ?? "تحسين",
          amount: asNumber(ai.amount),
          fund_id: fundId && validFundIds.has(fundId) ? fundId : null,
          date: asString(ai.date) ?? new Date().toISOString().split("T")[0],
          note: asString(ai.note),
        }, { onConflict: "id" });
        if (error) { console.error("AssetImprovement:", JSON.stringify(error)); errors++; } else success++;
      }
      results.asset_improvements = { success, errors };
    }

    // Container expenses
    if (containerExpenses.length) {
      let success = 0, errors = 0;
      for (const ce of containerExpenses) {
        const containerId = asString(ce.container_id ?? ce.containerId);
        if (!containerId || !validContainerIds.has(containerId)) { errors++; continue; }
        const contactId = asString(ce.contact_id ?? ce.contactId);
        const fundId = asString(ce.fund_id ?? ce.fundId);
        const { error } = await supabase.from("container_expenses").upsert({
          id: asString(ce.id) ?? crypto.randomUUID(),
          user_id: resolveRowUserId(ce.user_id),
          container_id: containerId,
          contact_id: contactId && validContactIds.has(contactId) ? contactId : null,
          fund_id: fundId && validFundIds.has(fundId) ? fundId : null,
          description: asString(ce.description) ?? "",
          amount: asNumber(ce.amount),
          date: asString(ce.date) ?? new Date().toISOString().split("T")[0],
          notes: asString(ce.notes),
        }, { onConflict: "id" });
        if (error) { console.error("ContainerExpense:", JSON.stringify(error)); errors++; } else success++;
      }
      results.container_expenses = { success, errors };
    }

    // Recurring Obligations + Items + Drafts
    const validObligationIds = new Set<string>();
    const validObligationItemIds = new Set<string>();
    const validDraftIds = new Set<string>();

    if (recurringObligations.length) {
      let success = 0, errors = 0;
      for (const ob of recurringObligations) {
        const id = asString(ob.id) ?? crypto.randomUUID();
        const fundId = asString(ob.default_fund_id ?? ob.defaultFundId);
        const { error } = await supabase.from("recurring_obligations").upsert({
          id,
          user_id: resolveRowUserId(ob.user_id),
          name: asString(ob.name) ?? "التزام",
          category: asString(ob.category) ?? "salaries",
          obligation_type: asString(ob.obligation_type ?? ob.obligationType) ?? "salary",
          start_date: asString(ob.start_date ?? ob.startDate) ?? new Date().toISOString().split("T")[0],
          due_day: asNumber(ob.due_day ?? ob.dueDay, 1),
          total_months: ob.total_months ?? ob.totalMonths ?? null,
          posted_count: asNumber(ob.posted_count ?? ob.postedCount),
          is_active: ob.is_active ?? ob.isActive ?? true,
          default_fund_id: fundId && validFundIds.has(fundId) ? fundId : null,
          notes: asString(ob.notes),
          created_by_name: asString(ob.created_by_name ?? ob.createdByName),
        }, { onConflict: "id" });
        if (error) { console.error("Obligation:", JSON.stringify(error)); errors++; }
        else { success++; validObligationIds.add(id); }
      }
      results.recurring_obligations = { success, errors };
    }

    if (obligationItems.length) {
      let success = 0, errors = 0;
      for (const it of obligationItems) {
        const obId = asString(it.obligation_id ?? it.obligationId);
        if (!obId || !validObligationIds.has(obId)) { errors++; continue; }
        const id = asString(it.id) ?? crypto.randomUUID();
        const { error } = await supabase.from("obligation_items").upsert({
          id,
          user_id: resolveRowUserId(it.user_id),
          obligation_id: obId,
          name: asString(it.name) ?? "بند",
          base_amount: asNumber(it.base_amount ?? it.baseAmount),
          working_days: asNumber(it.working_days ?? it.workingDays, 30),
          account_id: asString(it.account_id ?? it.accountId),
          is_active: it.is_active ?? it.isActive ?? true,
          notes: asString(it.notes),
        }, { onConflict: "id" });
        if (error) { console.error("ObligationItem:", JSON.stringify(error)); errors++; }
        else { success++; validObligationItemIds.add(id); }
      }
      results.obligation_items = { success, errors };
    }

    if (obligationDrafts.length) {
      let success = 0, errors = 0;
      for (const d of obligationDrafts) {
        const obId = asString(d.obligation_id ?? d.obligationId);
        if (!obId || !validObligationIds.has(obId)) { errors++; continue; }
        const id = asString(d.id) ?? crypto.randomUUID();
        const fundId = asString(d.fund_id ?? d.fundId);
        const { error } = await supabase.from("obligation_drafts").upsert({
          id,
          user_id: resolveRowUserId(d.user_id),
          obligation_id: obId,
          period_year: asNumber(d.period_year ?? d.periodYear),
          period_month: asNumber(d.period_month ?? d.periodMonth),
          due_date: asString(d.due_date ?? d.dueDate) ?? new Date().toISOString().split("T")[0],
          total_amount: asNumber(d.total_amount ?? d.totalAmount),
          status: asString(d.status) ?? "draft",
          fund_id: fundId && validFundIds.has(fundId) ? fundId : null,
          transaction_id: asString(d.transaction_id ?? d.transactionId),
          posted_at: asString(d.posted_at ?? d.postedAt),
          notes: asString(d.notes),
        }, { onConflict: "id" });
        if (error) { console.error("ObligationDraft:", JSON.stringify(error)); errors++; }
        else { success++; validDraftIds.add(id); }
      }
      results.obligation_drafts = { success, errors };
    }

    if (obligationDraftItems.length) {
      let success = 0, errors = 0;
      for (const di of obligationDraftItems) {
        const draftId = asString(di.draft_id ?? di.draftId);
        if (!draftId || !validDraftIds.has(draftId)) { errors++; continue; }
        const itemId = asString(di.item_id ?? di.itemId);
        const { error } = await supabase.from("obligation_draft_items").upsert({
          id: asString(di.id) ?? crypto.randomUUID(),
          user_id: resolveRowUserId(di.user_id),
          draft_id: draftId,
          item_id: itemId && validObligationItemIds.has(itemId) ? itemId : null,
          name: asString(di.name) ?? "بند",
          base_amount: asNumber(di.base_amount ?? di.baseAmount),
          absence_days: asNumber(di.absence_days ?? di.absenceDays),
          absence_deduction: asNumber(di.absence_deduction ?? di.absenceDeduction),
          advance_deduction: asNumber(di.advance_deduction ?? di.advanceDeduction),
          bonus: asNumber(di.bonus),
          net_amount: asNumber(di.net_amount ?? di.netAmount),
          account_id: asString(di.account_id ?? di.accountId),
          notes: asString(di.notes),
        }, { onConflict: "id" });
        if (error) { console.error("ObligationDraftItem:", JSON.stringify(error)); errors++; } else success++;
      }
      results.obligation_draft_items = { success, errors };
    }

    // 12. Recalculate fund balances from actual ledger entries
    const fundIdsToReconcile = new Set<string>(validFundIds);
    const { data: companyFunds } = await supabase
      .from("funds")
      .select("id")
      .in("user_id", allowedCompanyUserIds);

    (companyFunds || []).forEach((row: any) => {
      if (row?.id) fundIdsToReconcile.add(row.id);
    });

    if (fundIdsToReconcile.size > 0) {
      const fundIdList = Array.from(fundIdsToReconcile);
      const ledgerEffectByFund = new Map<string, number>();

      for (let i = 0; i < fundIdList.length; i += 200) {
        const chunk = fundIdList.slice(i, i + 200);
        const { data: txRows } = await supabase
          .from("transactions")
          .select("fund_id,type,amount,user_id")
          .in("fund_id", chunk)
          .in("user_id", allowedCompanyUserIds);

        for (const row of txRows || []) {
          if (!row?.fund_id) continue;
          const signedAmount = row.type === "in" ? asNumber(row.amount) : -asNumber(row.amount);
          ledgerEffectByFund.set(row.fund_id, (ledgerEffectByFund.get(row.fund_id) || 0) + signedAmount);
        }
      }

      let success = 0, errors = 0;
      for (const fundId of fundIdList) {
        const balance = Number((ledgerEffectByFund.get(fundId) || 0).toFixed(6));
        const { error } = await supabase
          .from("funds")
          .update({ balance })
          .eq("id", fundId);

        if (error) {
          console.error("Fund reconcile:", JSON.stringify(error));
          errors++;
        } else {
          success++;
        }
      }
      results.funds_reconciled = { success, errors };
    }

    // 13. Sync contact balances
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
