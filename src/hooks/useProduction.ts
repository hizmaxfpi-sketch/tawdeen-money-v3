import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ProductionMaterial {
  id: string;
  name: string;
  code?: string | null;
  unit: string;
  quantity: number;
  avg_cost: number;
  notes?: string | null;
  created_at: string;
}

export interface ProductionProduct {
  id: string;
  name: string;
  code?: string | null;
  unit: string;
  quantity: number;
  unit_cost: number;
  sell_price: number;
  notes?: string | null;
  created_at: string;
}

export interface BomEntry {
  id: string;
  product_id: string;
  material_id: string;
  qty_per_unit: number;
}

export interface ProductionSummary {
  materialsValue: number;
  productsValue: number;
  totalSales: number;
  totalCost: number;
  netProfit: number;
}

export function useProduction() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<ProductionMaterial[]>([]);
  const [products, setProducts] = useState<ProductionProduct[]>([]);
  const [bom, setBom] = useState<BomEntry[]>([]);
  const [summary, setSummary] = useState<ProductionSummary>({
    materialsValue: 0, productsValue: 0, totalSales: 0, totalCost: 0, netProfit: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [mRes, pRes, bRes, sRes] = await Promise.all([
      supabase.from('production_materials').select('*').order('name'),
      supabase.from('production_products').select('*').order('name'),
      supabase.from('product_bom').select('*'),
      supabase.rpc('get_production_summary'),
    ]);
    setMaterials((mRes.data as ProductionMaterial[]) || []);
    setProducts((pRes.data as ProductionProduct[]) || []);
    setBom((bRes.data as BomEntry[]) || []);
    if (sRes.data) setSummary(sRes.data as unknown as ProductionSummary);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('production-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_materials' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_products' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_sales' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_bom' }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadAll]);

  // ====== Materials ======
  const addMaterial = async (data: { name: string; code?: string; unit: string; notes?: string }) => {
    if (!user) return;
    const { error } = await supabase.from('production_materials').insert({ ...data, user_id: user.id, quantity: 0, avg_cost: 0 });
    if (error) { toast.error('فشل إضافة المادة'); return; }
    toast.success('تمت إضافة المادة');
    loadAll();
  };

  const updateMaterial = async (id: string, patch: Partial<ProductionMaterial>) => {
    const { error } = await supabase.from('production_materials').update(patch).eq('id', id);
    if (error) { toast.error('فشل التحديث'); return; }
    toast.success('تم التحديث');
    loadAll();
  };

  const deleteMaterial = async (id: string) => {
    const { error } = await supabase.from('production_materials').delete().eq('id', id);
    if (error) { toast.error('فشل الحذف - تأكد من عدم وجود حركات مرتبطة'); return; }
    toast.success('تم الحذف');
    loadAll();
  };

  const purchaseMaterial = async (params: {
    material_id: string;
    quantity: number;
    unit_price: number;
    contact_id?: string;
    fund_id?: string;
    paid_amount?: number;
    date?: string;
    notes?: string;
  }) => {
    const { error } = await supabase.rpc('purchase_material', {
      p_material_id: params.material_id,
      p_quantity: params.quantity,
      p_unit_price: params.unit_price,
      p_contact_id: params.contact_id || undefined,
      p_fund_id: params.fund_id || undefined,
      p_paid_amount: params.paid_amount || 0,
      p_date: params.date || new Date().toISOString().slice(0, 10),
      p_notes: params.notes,
    });
    if (error) { toast.error(error.message || 'فشل الشراء'); return false; }
    toast.success('تم تسجيل الشراء');
    loadAll();
    return true;
  };

  // ====== Products ======
  const addProduct = async (data: { name: string; code?: string; unit: string; sell_price: number; notes?: string }) => {
    if (!user) return;
    const { error } = await supabase.from('production_products').insert({
      ...data, user_id: user.id, quantity: 0, unit_cost: 0,
    });
    if (error) { toast.error('فشل الإضافة'); return; }
    toast.success('تمت الإضافة');
    loadAll();
  };

  const updateProduct = async (id: string, patch: Partial<ProductionProduct>) => {
    const { error } = await supabase.from('production_products').update(patch).eq('id', id);
    if (error) { toast.error('فشل التحديث'); return; }
    toast.success('تم التحديث');
    loadAll();
  };

  const deleteProduct = async (id: string) => {
    const { error } = await supabase.from('production_products').delete().eq('id', id);
    if (error) { toast.error('فشل الحذف'); return; }
    toast.success('تم الحذف');
    loadAll();
  };

  // ====== BOM ======
  const setProductBom = async (productId: string, entries: { material_id: string; qty_per_unit: number }[]) => {
    if (!user) return;
    await supabase.from('product_bom').delete().eq('product_id', productId);
    if (entries.length > 0) {
      const rows = entries.map(e => ({ ...e, product_id: productId, user_id: user.id }));
      const { error } = await supabase.from('product_bom').insert(rows);
      if (error) { toast.error('فشل حفظ المكونات'); return; }
    }
    toast.success('تم حفظ مكونات المنتج');
    loadAll();
  };

  // ====== Production Run ======
  const produceProduct = async (params: { product_id: string; quantity: number; date?: string; notes?: string }) => {
    const { error } = await supabase.rpc('produce_product', {
      p_product_id: params.product_id,
      p_quantity: params.quantity,
      p_date: params.date || new Date().toISOString().slice(0, 10),
      p_notes: params.notes,
    });
    if (error) { toast.error(error.message || 'فشل التصنيع'); return false; }
    toast.success('تم تسجيل عملية الإنتاج');
    loadAll();
    return true;
  };

  // ====== Sales ======
  const sellProduct = async (params: {
    product_id: string;
    quantity: number;
    unit_price: number;
    contact_id?: string;
    fund_id?: string;
    paid_amount?: number;
    date?: string;
    notes?: string;
  }) => {
    const { error } = await supabase.rpc('sell_product', {
      p_product_id: params.product_id,
      p_quantity: params.quantity,
      p_unit_price: params.unit_price,
      p_contact_id: params.contact_id || undefined,
      p_fund_id: params.fund_id || undefined,
      p_paid_amount: params.paid_amount || 0,
      p_date: params.date || new Date().toISOString().slice(0, 10),
      p_notes: params.notes,
    });
    if (error) { toast.error(error.message || 'فشل البيع'); return false; }
    toast.success('تم تسجيل البيع');
    loadAll();
    return true;
  };

  return {
    materials, products, bom, summary, loading,
    addMaterial, updateMaterial, deleteMaterial, purchaseMaterial,
    addProduct, updateProduct, deleteProduct, setProductBom,
    produceProduct, sellProduct,
    refresh: loadAll,
  };
}
