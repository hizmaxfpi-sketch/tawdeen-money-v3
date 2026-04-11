import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  ASSET_TRANSACTION_CATEGORIES,
  createAssetTransaction,
  getAssetDepreciationSnapshot,
  listAssetTransactionIds,
} from '@/lib/assetAccounting';

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
  const actionLocks = useRef<Record<'add' | 'pay' | 'improve' | 'update' | 'delete' | 'sync', boolean>>({
    add: false,
    pay: false,
    improve: false,
    update: false,
    delete: false,
    sync: false,
  });

  const syncDepreciationForAssets = useCallback(async (assetRows: Asset[]) => {
    if (actionLocks.current.sync) return false;

    actionLocks.current.sync = true;
    let changed = false;

    try {
      for (const asset of assetRows) {
        if (asset.status !== 'active') continue;

        const snapshot = getAssetDepreciationSnapshot(
          asset.value,
          asset.depreciationRate,
          asset.purchaseDate,
          asset.totalDepreciation,
        );

        const updatePayload: Record<string, number> = {};

        if (Math.abs(asset.monthlyDepreciation - snapshot.monthlyDepreciation) > 0.01) {
          updatePayload.monthly_depreciation = snapshot.monthlyDepreciation;
        }

        const hasExpectedDepreciation = snapshot.expectedTotal > 0.01;
        const depreciationTxIds = hasExpectedDepreciation
          ? await listAssetTransactionIds(asset.id, asset.name, ['asset_depreciation'])
          : [];
        const needsRepairPosting = hasExpectedDepreciation && depreciationTxIds.length === 0;
        const amountToPost = needsRepairPosting ? snapshot.expectedTotal : snapshot.unpostedAmount;

        if (amountToPost > 0.01) {
          await createAssetTransaction({
            assetId: asset.id,
            kind: 'depreciation',
            type: 'out',
            category: 'asset_depreciation',
            amount: amountToPost,
            description: `إهلاك أصل: ${asset.name}`,
            date: new Date().toISOString().slice(0, 10),
            note: `إهلاك محاسبي بلا تأثير على الصندوق - ${snapshot.monthsSincePurchase} شهر`,
          });

          updatePayload.total_depreciation = snapshot.expectedTotal;
          updatePayload.current_value = snapshot.currentValue;
        } else {
          if (Math.abs(asset.currentValue - snapshot.currentValue) > 0.01) {
            updatePayload.current_value = snapshot.currentValue;
          }
        }

        if (Object.keys(updatePayload).length > 0) {
          changed = true;
          await (supabase.from('assets' as any) as any)
            .update(updatePayload)
            .eq('id', asset.id);
        }
      }
    } finally {
      actionLocks.current.sync = false;
    }

    return changed;
  }, []);

  const fetchAssets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: aData }, { data: pData }, { data: iData }] = await Promise.all([
        supabase.from('assets' as any).select('*').order('created_at', { ascending: false }),
        supabase.from('asset_payments' as any).select('*').order('due_date', { ascending: true }),
        supabase.from('asset_improvements' as any).select('*').order('date', { ascending: false }),
      ]);

      const mappedAssets = aData ? (aData as any[]).map(mapAsset) : [];

      if (pData) setPayments((pData as any[]).map(mapPayment));
      if (iData) setImprovements((iData as any[]).map(mapImprovement));

      const didChange = await syncDepreciationForAssets(mappedAssets);

      if (didChange) {
        const { data: refreshed } = await supabase
          .from('assets' as any)
          .select('*')
          .order('created_at', { ascending: false });

        setAssets(refreshed ? (refreshed as any[]).map(mapAsset) : mappedAssets);
      } else {
        setAssets(mappedAssets);
      }
    } finally {
      setLoading(false);
    }
  }, [user, syncDepreciationForAssets]);

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
    if (!user || actionLocks.current.add) return;

    actionLocks.current.add = true;

    try {
      const depreciationSnapshot = getAssetDepreciationSnapshot(input.value, input.depreciationRate, input.purchaseDate, 0);

      const { data, error } = await (supabase.from('assets' as any) as any)
        .insert({
          user_id: user.id,
          name: input.name,
          value: input.value,
          purchase_date: input.purchaseDate,
          depreciation_rate: input.depreciationRate,
          monthly_depreciation: depreciationSnapshot.monthlyDepreciation,
          total_depreciation: 0,
          current_value: input.value,
          notes: input.notes || null,
          fund_id: input.fundId || null,
          vendor_id: input.vendorId || null,
          payment_type: input.paymentType,
          installment_count: Math.max(1, input.installmentCount || 1),
          paid_amount: 0,
          depreciation_fund_id: input.depreciationFundId || null,
        })
        .select()
        .single();

      if (error || !data) {
        toast.error('فشل إضافة الأصل');
        return;
      }

      const assetId = (data as any).id as string;
      const installmentCount = Math.max(1, input.installmentCount || 1);
      let paidAmount = 0;

      if (input.vendorId) {
        await createAssetTransaction({
          assetId,
          kind: 'purchase',
          type: 'out',
          category: 'asset_purchase',
          amount: input.value,
          description: `شراء أصل: ${input.name}`,
          date: input.purchaseDate,
          contactId: input.vendorId,
          note: 'إثبات قيمة الأصل على حساب المورد فقط',
        });
      }

      if (input.fundId && input.paymentType === 'full') {
        await createAssetTransaction({
          assetId,
          kind: 'payment',
          type: 'out',
          category: 'asset_payment',
          amount: input.value,
          description: `سداد أصل: ${input.name}`,
          date: input.purchaseDate,
          fundId: input.fundId,
          note: 'سداد كامل من الصندوق',
        });

        if (input.vendorId) {
          await createAssetTransaction({
            assetId,
            kind: 'payment',
            type: 'in',
            category: 'asset_payment',
            amount: input.value,
            description: `سداد أصل: ${input.name}`,
            date: input.purchaseDate,
            contactId: input.vendorId,
            note: 'تخفيض رصيد المورد بعد السداد الكامل',
          });
        }

        paidAmount = input.value;
      }

      if (input.paymentType === 'installment') {
        const perInstallment = Number((input.value / installmentCount).toFixed(2));

        if (input.fundId) {
          await createAssetTransaction({
            assetId,
            kind: 'payment',
            type: 'out',
            category: 'asset_payment',
            amount: perInstallment,
            description: `دفعة أولى - أصل: ${input.name}`,
            date: input.purchaseDate,
            fundId: input.fundId,
            note: `قسط 1 من ${installmentCount}`,
          });

          if (input.vendorId) {
            await createAssetTransaction({
              assetId,
              kind: 'payment',
              type: 'in',
              category: 'asset_payment',
              amount: perInstallment,
              description: `سداد قسط 1 - أصل: ${input.name}`,
              date: input.purchaseDate,
              contactId: input.vendorId,
              note: `تخفيض رصيد المورد - قسط 1 من ${installmentCount}`,
            });
          }

          paidAmount = perInstallment;
        }

        const scheduleRows = [];

        for (let i = 1; i < installmentCount; i++) {
          const dueDate = new Date(input.purchaseDate);
          dueDate.setMonth(dueDate.getMonth() + i);
          scheduleRows.push({
            user_id: user.id,
            asset_id: assetId,
            fund_id: input.fundId || null,
            amount: perInstallment,
            due_date: dueDate.toISOString().slice(0, 10),
            status: 'pending',
            note: `قسط ${i + 1} من ${installmentCount}`,
          });
        }

        if (scheduleRows.length > 0) {
          await (supabase.from('asset_payments' as any) as any).insert(scheduleRows);
        }
      }

      if (paidAmount > 0) {
        await (supabase.from('assets' as any) as any)
          .update({ paid_amount: paidAmount })
          .eq('id', assetId);
      }

      await (supabase.rpc as any)('sync_contact_balances');
      toast.success('تم إضافة الأصل');
      await fetchAssets();
    } finally {
      actionLocks.current.add = false;
    }
  }, [user, fetchAssets]);

  const payInstallment = useCallback(async (paymentId: string, fundId?: string) => {
    if (actionLocks.current.pay) return;

    const payment = payments.find(p => p.id === paymentId);
    if (!payment || !user) return;
    const asset = assets.find(a => a.id === payment.assetId);
    const useFund = fundId || payment.fundId;

    actionLocks.current.pay = true;

    try {
      const paymentDate = new Date().toISOString().slice(0, 10);

      if (useFund) {
        await createAssetTransaction({
          assetId: payment.assetId,
          kind: 'payment',
          type: 'out',
          category: 'asset_payment',
          amount: payment.amount,
          description: `سداد قسط - أصل: ${asset?.name || ''}`,
          date: paymentDate,
          fundId: useFund,
          note: payment.note || 'سداد قسط من الصندوق',
        });
      }

      if (asset?.vendorId) {
        await createAssetTransaction({
          assetId: payment.assetId,
          kind: 'payment',
          type: 'in',
          category: 'asset_payment',
          amount: payment.amount,
          description: `سداد قسط - أصل: ${asset.name}`,
          date: paymentDate,
          contactId: asset.vendorId,
          note: payment.note || 'تخفيض رصيد المورد بعد سداد القسط',
        });
      }

      await (supabase.from('asset_payments' as any) as any)
        .update({ status: 'paid', paid_date: paymentDate, fund_id: useFund || null })
        .eq('id', paymentId);

      const newPaid = (asset?.paidAmount || 0) + payment.amount;
      await (supabase.from('assets' as any) as any)
        .update({ paid_amount: newPaid })
        .eq('id', payment.assetId);

      await (supabase.rpc as any)('sync_contact_balances');
      toast.success('تم سداد القسط');
      await fetchAssets();
    } finally {
      actionLocks.current.pay = false;
    }
  }, [user, payments, assets, fetchAssets]);

  const addImprovement = useCallback(async (input: {
    assetId: string;
    name: string;
    amount: number;
    fundId?: string;
    note?: string;
  }) => {
    if (!user || actionLocks.current.improve) return;
    const asset = assets.find(a => a.id === input.assetId);

    actionLocks.current.improve = true;

    try {
      await (supabase.from('asset_improvements' as any) as any).insert({
        user_id: user.id,
        asset_id: input.assetId,
        name: input.name,
        amount: input.amount,
        fund_id: input.fundId || null,
        note: input.note || null,
      });

      if (asset) {
        const nextValue = asset.value + input.amount;
        const nextMonthlyDep = Number(((nextValue * asset.depreciationRate / 100) / 12).toFixed(2));

        await (supabase.from('assets' as any) as any)
          .update({
            value: nextValue,
            current_value: Math.max(0, asset.currentValue + input.amount),
            monthly_depreciation: nextMonthlyDep,
          })
          .eq('id', input.assetId);
      }

      if (input.fundId) {
        await createAssetTransaction({
          assetId: input.assetId,
          kind: 'improvement',
          type: 'out',
          category: 'asset_improvement',
          amount: input.amount,
          description: `تطوير أصل: ${asset?.name || ''} - ${input.name}`,
          date: new Date().toISOString().slice(0, 10),
          fundId: input.fundId,
          note: input.note || 'تطوير أصل',
        });
      }

      toast.success('تم إضافة التطوير');
      await fetchAssets();
    } finally {
      actionLocks.current.improve = false;
    }
  }, [user, assets, fetchAssets]);

  const updateAsset = useCallback(async (id: string, updates: Partial<{
    name: string;
    value: number;
    purchaseDate: string;
    depreciationRate: number;
    notes: string;
    depreciationFundId: string;
    fundId: string;
    vendorId: string;
    paymentType: string;
    installmentCount: number;
  }>) => {
    if (!user || actionLocks.current.update) return;
    const asset = assets.find(a => a.id === id);
    if (!asset) return;

    actionLocks.current.update = true;

    try {
      const nextValue = updates.value ?? asset.value;
      const nextRate = updates.depreciationRate ?? asset.depreciationRate;
      const nextPurchaseDate = updates.purchaseDate ?? asset.purchaseDate;
      const snapshot = getAssetDepreciationSnapshot(nextValue, nextRate, nextPurchaseDate, asset.totalDepreciation);

      const updateData: Record<string, any> = {
        name: updates.name ?? asset.name,
        notes: updates.notes ?? asset.notes ?? null,
        purchase_date: nextPurchaseDate,
        depreciation_rate: nextRate,
        monthly_depreciation: snapshot.monthlyDepreciation,
        current_value: Math.max(0, nextValue - asset.totalDepreciation),
      };

      if (updates.value !== undefined) updateData.value = updates.value;
      if (updates.depreciationFundId !== undefined) updateData.depreciation_fund_id = updates.depreciationFundId || null;
      if (updates.fundId !== undefined) updateData.fund_id = updates.fundId || null;
      if (updates.vendorId !== undefined) updateData.vendor_id = updates.vendorId || null;
      if (updates.paymentType !== undefined) updateData.payment_type = updates.paymentType;
      if (updates.installmentCount !== undefined) updateData.installment_count = Math.max(1, updates.installmentCount || 1);

      await (supabase.from('assets' as any) as any)
        .update(updateData)
        .eq('id', id);

      if (updates.name && updates.name !== asset.name) {
        const relatedTxIds = await listAssetTransactionIds(id, asset.name);

        if (relatedTxIds.length > 0) {
          const { data: relatedTxs } = await (supabase.from('transactions') as any)
            .select('id, category, description')
            .in('id', relatedTxIds);

          for (const tx of relatedTxs || []) {
            let description = tx.description;

            if (tx.category === 'asset_purchase') description = `شراء أصل: ${updates.name}`;
            if (tx.category === 'asset_depreciation') description = `إهلاك أصل: ${updates.name}`;
            if (tx.category === 'asset_payment') {
              description = tx.description?.includes('دفعة أولى')
                ? `دفعة أولى - أصل: ${updates.name}`
                : tx.description?.includes('قسط')
                  ? `سداد قسط - أصل: ${updates.name}`
                  : `سداد أصل: ${updates.name}`;
            }
            if (tx.category === 'asset_improvement') {
              const parts = String(tx.description || '').split(' - ');
              description = parts.length > 1 ? `تطوير أصل: ${updates.name} - ${parts.slice(1).join(' - ')}` : `تطوير أصل: ${updates.name}`;
            }

            await (supabase.from('transactions') as any)
              .update({ description, reference_id: id })
              .eq('id', tx.id);
          }
        }
      }

      await fetchAssets();
      toast.success('تم تعديل الأصل');
    } finally {
      actionLocks.current.update = false;
    }
  }, [user, assets, fetchAssets]);

  const deleteAsset = useCallback(async (id: string) => {
    if (actionLocks.current.delete) return;
    const asset = assets.find(a => a.id === id);

    actionLocks.current.delete = true;

    try {
      const relatedTxIds = asset
        ? await listAssetTransactionIds(asset.id, asset.name, ASSET_TRANSACTION_CATEGORIES)
        : [];

      for (const txId of relatedTxIds) {
        await supabase.rpc('reverse_transaction', { p_transaction_id: txId });
      }

      await Promise.all([
        (supabase.from('asset_payments' as any) as any).delete().eq('asset_id', id),
        (supabase.from('asset_improvements' as any) as any).delete().eq('asset_id', id),
      ]);

      await (supabase.from('assets' as any) as any).delete().eq('id', id);
      await (supabase.rpc as any)('sync_contact_balances');

      toast.success('تم حذف الأصل');
      await fetchAssets();
    } finally {
      actionLocks.current.delete = false;
    }
  }, [assets, fetchAssets]);

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
