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
  createdAt: string;
  supplier_id?: string;
  is_installment?: boolean;
  installment_total_amount?: number;
  fund_id?: string;
}

export function useAssets() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('assets' as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setAssets((data as any[]).map(mapAsset));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const addAsset = useCallback(async (input: {
    name: string;
    value: number;
    purchaseDate: string;
    depreciationRate: number;
    notes?: string;
    supplier_id?: string | null;
    is_installment?: boolean;
    installment_total_amount?: number;
    fundId?: string;
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
      supplier_id: input.supplier_id,
      is_installment: input.is_installment,
      installment_total_amount: input.installment_total_amount,
      fund_id: input.fundId
    }).select('id').single();

    if (error) { toast.error('فشل إضافة الأصل'); return; }

    // If not installment and fund is linked, create deduction transaction
    if (!input.is_installment && input.fundId && data) {
      const { error: txError } = await supabase.rpc('process_transaction', {
        p_type: 'out',
        p_category: 'business_expense',
        p_amount: input.value,
        p_description: `شراء أصل: ${input.name}`,
        p_date: input.purchaseDate,
        p_fund_id: input.fundId,
        p_asset_id: data.id,
        p_source_type: 'general_ledger'
      });
      if (txError) {
        console.error('Failed to create purchase transaction:', txError);
        toast.error('تم إضافة الأصل ولكن فشل تسجيل العملية المالية');
      }
    }

    toast.success('تم إضافة الأصل');
    await fetchAssets();
  }, [user, fetchAssets]);

  const deleteAsset = useCallback(async (id: string) => {
    const { error } = await (supabase.from('assets' as any) as any).delete().eq('id', id);
    if (error) { toast.error('فشل حذف الأصل'); return; }
    toast.success('تم حذف الأصل');
    await fetchAssets();
  }, [fetchAssets]);

  const totalAssetValue = assets.reduce((s, a) => s + a.currentValue, 0);
  const totalDepreciation = assets.reduce((s, a) => s + a.totalDepreciation, 0);
  const totalAssetRevenue = 0; // placeholder for future asset revenue tracking

  return { assets, loading, addAsset, deleteAsset, fetchAssets, totalAssetValue, totalDepreciation, totalAssetRevenue };
}

function mapAsset(row: any): Asset {
  return {
    id: row.id,
    name: row.name,
    value: Number(row.value),
    purchaseDate: row.purchase_date,
    depreciationRate: Number(row.depreciation_rate),
    monthlyDepreciation: Number(row.monthly_depreciation),
    totalDepreciation: Number(row.total_depreciation),
    currentValue: Number(row.current_value),
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    supplier_id: row.supplier_id,
    is_installment: row.is_installment,
    installment_total_amount: Number(row.installment_total_amount),
    fund_id: row.fund_id,
  };
}

function getMonthsSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}
