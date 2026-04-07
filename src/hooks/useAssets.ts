import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Asset {
  id: string;
  name: string;
  value: number;
  purchaseDate: string;
  depreciationRate: number;
  monthlyDepreciation: number;
  totalDepreciation: number;
  currentValue: number;
  notes?: string;
  status: string;
  fundId?: string;
  vendorId?: string;
  paymentType: string;
  installmentCount: number;
  paidAmount: number;
  depreciationFundId?: string;
  createdAt: string;
}

export interface AssetPayment {
  id: string;
  assetId: string;
  fundId?: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: string;
  note?: string;
}

export interface AssetImprovement {
  id: string;
  assetId: string;
  name: string;
  amount: number;
  fundId?: string;
  date: string;
  note?: string;
}

export function useAssets() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [payments, setPayments] = useState<AssetPayment[]>([]);
  const [improvements, setImprovements] = useState<AssetImprovement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: aData }, { data: pData }, { data: iData }] = await Promise.all([
      supabase.from('assets' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('asset_payments' as any).select('*').order('due_date', { ascending: true }),
      supabase.from('asset_improvements' as any).select('*').order('date', { ascending: false }),
    ]);
    if (aData) setAssets((aData as any[]).map(mapAsset));
    if (pData) setPayments((pData as any[]).map(mapPayment));
    if (iData) setImprovements((iData as any[]).map(mapImprovement));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const addAsset = useCallback(async (input: {
    name: string;
    value: number;
    purchaseDate: string;
    depreciationRate: number;
    notes?: string;
    fundId?: string;
    vendorId?: string;
    paymentType: string;
    installmentCount: number;
    depreciationFundId?: string;
  }) => {
    if (!user) return;
    const monthlyDep = (input.value * input.depreciationRate / 100) / 12;
    const monthsSincePurchase = getMonthsSince(input.purchaseDate);
    const totalDep = Math.min(monthlyDep * monthsSincePurchase, input.value);
    const currentVal = Math.max(0, input.value - totalDep);

    const { data, error } = await (supabase.from('assets' as any) as any).insert({
      user_id: user.id,
      name: input.name,
      value: input.value,
      purchase_date: input.purchaseDate,
      depreciation_rate: input.depreciationRate,
      monthly_depreciation: monthlyDep,
      total_depreciation: totalDep,
      current_value: currentVal,
      notes: input.notes || null,
      fund_id: input.fundId || null,
      vendor_id: input.vendorId || null,
      payment_type: input.paymentType,
      installment_count: input.installmentCount || 1,
      paid_amount: 0,
      depreciation_fund_id: input.depreciationFundId || null,
    }).select().single();

    if (error) { toast.error('فشل إضافة الأصل'); return; }

    const assetId = (data as any).id;

    // 1) Register FULL asset value as DEBIT (out) to vendor — vendor becomes creditor
    // This is ONLY in the vendor's ledger, NOT in business operations
    if (input.vendorId) {
      await supabase.rpc('process_transaction', {
        p_type: 'out', p_category: 'asset_purchase',
        p_amount: input.value,
        p_description: 'شراء أصل: ' + input.name,
        p_date: input.purchaseDate,
        p_contact_id: input.vendorId,
        p_notes: 'قيد مدين - قيمة الأصل الكاملة',
      });
    }

    // 2) Process payment based on type
    if (input.fundId) {
      if (input.paymentType === 'full') {
        // Full payment: deduct from fund + credit vendor (reduce his balance)
        await supabase.rpc('process_transaction', {
          p_type: 'in', p_category: 'asset_payment',
          p_amount: input.value,
          p_description: 'سداد أصل: ' + input.name,
          p_date: input.purchaseDate,
          p_fund_id: input.fundId,
          p_contact_id: input.vendorId || null,
          p_notes: 'سداد كامل - تخفيض رصيد المورد',
        });

        await (supabase.from('assets' as any) as any)
          .update({ paid_amount: input.value })
          .eq('id', assetId);
      } else {
        // Installment: pay first installment
        const perInstallment = input.value / input.installmentCount;
        const firstPayment = Number(perInstallment.toFixed(2));

        // Credit vendor for first payment (reduce his balance) + deduct from fund
        await supabase.rpc('process_transaction', {
          p_type: 'in', p_category: 'asset_payment',
          p_amount: firstPayment,
          p_description: 'دفعة أولى - أصل: ' + input.name,
          p_date: input.purchaseDate,
          p_fund_id: input.fundId,
          p_contact_id: input.vendorId || null,
          p_notes: 'قسط 1 من ' + input.installmentCount,
        });

        await (supabase.from('assets' as any) as any)
          .update({ paid_amount: firstPayment })
          .eq('id', assetId);

        // Generate remaining installment schedule
        for (let i = 1; i < input.installmentCount; i++) {
          const dueDate = new Date(input.purchaseDate);
          dueDate.setMonth(dueDate.getMonth() + i);
          await (supabase.from('asset_payments' as any) as any).insert({
            user_id: user.id,
            asset_id: assetId,
            fund_id: input.fundId,
            amount: Number(perInstallment.toFixed(2)),
            due_date: dueDate.toISOString().slice(0, 10),
            status: 'pending',
            note: `قسط ${i + 1} من ${input.installmentCount}`,
          });
        }
      }
    }

    // Sync contact balances
    await (supabase.rpc as any)('sync_contact_balances');

    toast.success('تم إضافة الأصل');
    await fetchAssets();
  }, [user, fetchAssets]);

  const payInstallment = useCallback(async (paymentId: string, fundId?: string) => {
    const payment = payments.find(p => p.id === paymentId);
    if (!payment || !user) return;
    const asset = assets.find(a => a.id === payment.assetId);
    const useFund = fundId || payment.fundId;

    // Credit vendor (reduce balance) + deduct from fund
    await supabase.rpc('process_transaction', {
      p_type: 'in', p_category: 'asset_payment',
      p_amount: payment.amount,
      p_description: 'سداد قسط - أصل: ' + (asset?.name || ''),
      p_date: new Date().toISOString().slice(0, 10),
      p_fund_id: useFund || null,
      p_contact_id: asset?.vendorId || null,
      p_notes: payment.note || 'سداد قسط',
    });

    await (supabase.from('asset_payments' as any) as any)
      .update({ status: 'paid', paid_date: new Date().toISOString().slice(0, 10) })
      .eq('id', paymentId);

    const newPaid = (asset?.paidAmount || 0) + payment.amount;
    await (supabase.from('assets' as any) as any)
      .update({ paid_amount: newPaid })
      .eq('id', payment.assetId);

    await (supabase.rpc as any)('sync_contact_balances');

    toast.success('تم سداد القسط');
    await fetchAssets();
  }, [user, payments, assets, fetchAssets]);

  const addImprovement = useCallback(async (input: {
    assetId: string;
    name: string;
    amount: number;
    fundId?: string;
    note?: string;
  }) => {
    if (!user) return;
    const asset = assets.find(a => a.id === input.assetId);

    await (supabase.from('asset_improvements' as any) as any).insert({
      user_id: user.id,
      asset_id: input.assetId,
      name: input.name,
      amount: input.amount,
      fund_id: input.fundId || null,
      note: input.note || null,
    });

    if (asset) {
      await (supabase.from('assets' as any) as any)
        .update({ value: asset.value + input.amount, current_value: asset.currentValue + input.amount })
        .eq('id', input.assetId);
    }

    if (input.fundId) {
      await supabase.rpc('process_transaction', {
        p_type: 'out', p_category: 'asset_improvement',
        p_amount: input.amount,
        p_description: 'تطوير أصل: ' + (asset?.name || '') + ' - ' + input.name,
        p_date: new Date().toISOString().slice(0, 10),
        p_fund_id: input.fundId,
        p_notes: input.note || '',
      });
    }

    toast.success('تم إضافة التطوير');
    await fetchAssets();
  }, [user, assets, fetchAssets]);

  const updateAsset = useCallback(async (id: string, updates: Partial<{
    name: string;
    value: number;
    depreciationRate: number;
    notes: string;
    depreciationFundId: string;
  }>) => {
    if (!user) return;
    const asset = assets.find(a => a.id === id);
    if (!asset) return;

    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.depreciationFundId !== undefined) updateData.depreciation_fund_id = updates.depreciationFundId || null;

    const newValue = updates.value ?? asset.value;
    const newRate = updates.depreciationRate ?? asset.depreciationRate;

    if (updates.depreciationRate !== undefined || updates.value !== undefined) {
      updateData.monthly_depreciation = (newValue * newRate / 100) / 12;
    }
    if (updates.value !== undefined) {
      updateData.value = updates.value;
      // Recalculate depreciation
      const monthlyDep = (updates.value * newRate / 100) / 12;
      const months = getMonthsSince(asset.purchaseDate);
      const totalDep = Math.min(monthlyDep * months, updates.value);
      updateData.total_depreciation = totalDep;
      updateData.current_value = Math.max(0, updates.value - totalDep);

      // If vendor exists and value changed, update the vendor's debit transaction
      if (asset.vendorId) {
        // Delete old asset_purchase transaction for this asset from vendor
        const { data: oldTxs } = await supabase.from('transactions')
          .select('id')
          .eq('contact_id', asset.vendorId)
          .eq('category', 'asset_purchase')
          .ilike('description', '%' + asset.name + '%');

        if (oldTxs && oldTxs.length > 0) {
          for (const tx of oldTxs) {
            await supabase.rpc('reverse_transaction', { p_transaction_id: tx.id });
          }
        }

        // Re-register with new value
        await supabase.rpc('process_transaction', {
          p_type: 'out', p_category: 'asset_purchase',
          p_amount: updates.value,
          p_description: 'شراء أصل: ' + (updates.name || asset.name),
          p_date: asset.purchaseDate,
          p_contact_id: asset.vendorId,
          p_notes: 'قيد مدين - قيمة الأصل المعدلة',
        });

        await (supabase.rpc as any)('sync_contact_balances');
      }
    }
    if (updates.depreciationRate !== undefined) {
      updateData.depreciation_rate = updates.depreciationRate;
    }

    await (supabase.from('assets' as any) as any).update(updateData).eq('id', id);
    toast.success('تم تعديل الأصل');
    await fetchAssets();
  }, [user, assets, fetchAssets]);

  const deleteAsset = useCallback(async (id: string) => {
    const asset = assets.find(a => a.id === id);

    // Delete all related transactions (asset_purchase + asset_payment for this vendor/asset)
    if (asset?.vendorId) {
      // Find and reverse all transactions related to this asset
      const { data: relatedTxs } = await supabase.from('transactions')
        .select('id')
        .eq('contact_id', asset.vendorId)
        .in('category', ['asset_purchase', 'asset_payment'])
        .ilike('description', '%' + asset.name + '%');

      if (relatedTxs) {
        for (const tx of relatedTxs) {
          await supabase.rpc('reverse_transaction', { p_transaction_id: tx.id });
        }
      }
    }

    // Delete improvement transactions
    const assetImprovements = improvements.filter(i => i.assetId === id);
    for (const imp of assetImprovements) {
      if (imp.fundId) {
        const { data: impTxs } = await supabase.from('transactions')
          .select('id')
          .eq('category', 'asset_improvement')
          .ilike('description', '%' + imp.name + '%');
        if (impTxs) {
          for (const tx of impTxs) {
            await supabase.rpc('reverse_transaction', { p_transaction_id: tx.id });
          }
        }
      }
    }

    // Delete related records
    await (supabase.from('asset_payments' as any) as any).delete().eq('asset_id', id);
    await (supabase.from('asset_improvements' as any) as any).delete().eq('asset_id', id);
    await (supabase.from('assets' as any) as any).delete().eq('id', id);

    await (supabase.rpc as any)('sync_contact_balances');

    toast.success('تم حذف الأصل');
    await fetchAssets();
  }, [assets, improvements, fetchAssets]);

  const totalAssetValue = assets.reduce((s, a) => s + a.currentValue, 0);
  const totalDepreciation = assets.reduce((s, a) => s + a.totalDepreciation, 0);
  const totalAssetRevenue = 0;

  const getAssetPayments = (assetId: string) => payments.filter(p => p.assetId === assetId);
  const getAssetImprovements = (assetId: string) => improvements.filter(i => i.assetId === assetId);

  return {
    assets, loading, addAsset, updateAsset, deleteAsset, fetchAssets,
    totalAssetValue, totalDepreciation, totalAssetRevenue,
    payments, improvements,
    payInstallment, addImprovement,
    getAssetPayments, getAssetImprovements,
  };
}

function mapAsset(row: any): Asset {
  return {
    id: row.id, name: row.name, value: Number(row.value),
    purchaseDate: row.purchase_date,
    depreciationRate: Number(row.depreciation_rate),
    monthlyDepreciation: Number(row.monthly_depreciation),
    totalDepreciation: Number(row.total_depreciation),
    currentValue: Number(row.current_value),
    notes: row.notes, status: row.status,
    fundId: row.fund_id, vendorId: row.vendor_id,
    paymentType: row.payment_type || 'full',
    installmentCount: row.installment_count || 1,
    paidAmount: Number(row.paid_amount || 0),
    depreciationFundId: row.depreciation_fund_id,
    createdAt: row.created_at,
  };
}

function mapPayment(row: any): AssetPayment {
  return {
    id: row.id, assetId: row.asset_id, fundId: row.fund_id,
    amount: Number(row.amount), dueDate: row.due_date,
    paidDate: row.paid_date, status: row.status, note: row.note,
  };
}

function mapImprovement(row: any): AssetImprovement {
  return {
    id: row.id, assetId: row.asset_id, name: row.name,
    amount: Number(row.amount), fundId: row.fund_id,
    date: row.date, note: row.note,
  };
}

function getMonthsSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}
