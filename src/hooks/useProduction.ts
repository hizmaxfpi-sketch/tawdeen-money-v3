import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ProductionMaterial {
  id: string; name: string; code?: string | null; unit: string;
  quantity: number; avg_cost: number; notes?: string | null; created_at: string;
}
export interface ProductionProduct {
  id: string; name: string; code?: string | null; unit: string;
  quantity: number; unit_cost: number; sell_price: number; notes?: string | null; created_at: string;
}
export type ServiceUnitType = 'piece' | 'hour' | 'day' | 'meter' | 'custom';
export interface ProductionService {
  id: string; name: string; code?: string | null; default_price: number;
  unit_type: ServiceUnitType; custom_unit?: string | null;
  notes?: string | null; created_at: string;
}
export interface BomEntry {
  id: string; product_id: string; material_id: string; qty_per_unit: number;
}
export interface ProductionSummary {
  materialsValue: number; productsValue: number; totalSales: number;
  totalCost: number; totalExpenses: number; netProfit: number;
}
export interface SaleService { service_id?: string; name: string; amount: number; quantity?: number; unit_price?: number; unit_type?: ServiceUnitType }
export interface SaleExpense { description: string; amount: number; fund_id?: string; treat_as_business?: boolean }

export function useProduction() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<ProductionMaterial[]>([]);
  const [products, setProducts] = useState<ProductionProduct[]>([]);
  const [services, setServices] = useState<ProductionService[]>([]);
  const [bom, setBom] = useState<BomEntry[]>([]);
  const [summary, setSummary] = useState<ProductionSummary>({
    materialsValue: 0, productsValue: 0, totalSales: 0, totalCost: 0, totalExpenses: 0, netProfit: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [mRes, pRes, svRes, bRes, sRes] = await Promise.all([
      supabase.from('production_materials').select('*').order('name'),
      supabase.from('production_products').select('*').order('name'),
      (supabase as any).from('production_services').select('*').order('name'),
      supabase.from('product_bom').select('*'),
      supabase.rpc('get_production_summary'),
    ]);
    setMaterials((mRes.data as ProductionMaterial[]) || []);
    setProducts((pRes.data as ProductionProduct[]) || []);
    setServices((svRes.data as ProductionService[]) || []);
    setBom((bRes.data as BomEntry[]) || []);
    if (sRes.data) setSummary(sRes.data as unknown as ProductionSummary);
    setLoading(false);
  }, [user]);

  // Debounced reload to coalesce many realtime events into one fetch
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      loadAll();
    }, 1500);
  }, [loadAll]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('production-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_materials' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_products' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_sales' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_bom' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_services' as any }, scheduleReload)
      .subscribe();
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      supabase.removeChannel(ch);
    };
  }, [user, scheduleReload]);

  // Materials
  const addMaterial = async (data: { name: string; code?: string; unit: string; notes?: string }): Promise<void> => {
    if (!user) return;
    const { error } = await supabase.from('production_materials').insert({ ...data, user_id: user.id, quantity: 0, avg_cost: 0 });
    if (error) { toast.error('فشل إضافة المادة'); return; }
    toast.success('تمت إضافة المادة'); scheduleReload();
  };
  const updateMaterial = async (id: string, patch: Partial<ProductionMaterial>): Promise<void> => {
    const { error } = await supabase.from('production_materials').update(patch).eq('id', id);
    if (error) { toast.error('فشل التحديث'); return; }
    toast.success('تم التحديث'); scheduleReload();
  };
  const deleteMaterial = async (id: string): Promise<void> => {
    const { error } = await supabase.from('production_materials').delete().eq('id', id);
    if (error) { toast.error('فشل الحذف'); return; }
    toast.success('تم الحذف'); scheduleReload();
  };
  const purchaseMaterial = async (params: any) => {
    const { error } = await supabase.rpc('purchase_material', {
      p_material_id: params.material_id, p_quantity: params.quantity, p_unit_price: params.unit_price,
      p_contact_id: params.contact_id || undefined, p_fund_id: params.fund_id || undefined,
      p_paid_amount: params.paid_amount || 0,
      p_date: params.date || new Date().toISOString().slice(0, 10), p_notes: params.notes,
    });
    if (error) { toast.error(error.message || 'فشل الشراء'); return false; }
    toast.success('تم تسجيل الشراء'); scheduleReload(); return true;
  };

  // Products
  const addProduct = async (data: any): Promise<void> => {
    if (!user) return;
    const { error } = await supabase.from('production_products').insert({ ...data, user_id: user.id, quantity: 0, unit_cost: 0 });
    if (error) { toast.error('فشل الإضافة'); return; }
    toast.success('تمت الإضافة'); scheduleReload();
  };
  const updateProduct = async (id: string, patch: Partial<ProductionProduct>): Promise<void> => {
    const { error } = await supabase.from('production_products').update(patch).eq('id', id);
    if (error) { toast.error('فشل التحديث'); return; }
    toast.success('تم التحديث'); scheduleReload();
  };
  const deleteProduct = async (id: string): Promise<void> => {
    const { error } = await supabase.from('production_products').delete().eq('id', id);
    if (error) { toast.error('فشل الحذف'); return; }
    toast.success('تم الحذف'); scheduleReload();
  };

  // Services
  const addService = async (data: { name: string; code?: string; default_price: number; notes?: string; unit_type?: ServiceUnitType; custom_unit?: string }): Promise<void> => {
    if (!user) return;
    const { error } = await (supabase as any).from('production_services').insert({ ...data, unit_type: data.unit_type || 'piece', user_id: user.id });
    if (error) { toast.error('فشل إضافة الخدمة'); return; }
    toast.success('تمت إضافة الخدمة'); scheduleReload();
  };
  const updateService = async (id: string, patch: Partial<ProductionService>): Promise<void> => {
    const { error } = await (supabase as any).from('production_services').update(patch).eq('id', id);
    if (error) { toast.error('فشل التحديث'); return; }
    toast.success('تم التحديث'); scheduleReload();
  };
  const deleteService = async (id: string): Promise<void> => {
    const { error } = await (supabase as any).from('production_services').delete().eq('id', id);
    if (error) { toast.error('فشل الحذف'); return; }
    toast.success('تم الحذف'); scheduleReload();
  };

  // BOM
  const setProductBom = async (productId: string, entries: { material_id: string; qty_per_unit: number }[]): Promise<void> => {
    if (!user) return;
    await supabase.from('product_bom').delete().eq('product_id', productId);
    if (entries.length > 0) {
      const rows = entries.map(e => ({ ...e, product_id: productId, user_id: user.id }));
      const { error } = await supabase.from('product_bom').insert(rows);
      if (error) { toast.error('فشل حفظ المكونات'); return; }
    }
    toast.success('تم حفظ مكونات المنتج'); scheduleReload();
  };

  const produceProduct = async (params: { product_id: string; quantity: number; date?: string; notes?: string }) => {
    const { error } = await supabase.rpc('produce_product', {
      p_product_id: params.product_id, p_quantity: params.quantity,
      p_date: params.date || new Date().toISOString().slice(0, 10), p_notes: params.notes,
    });
    if (error) { toast.error(error.message || 'فشل التصنيع'); return false; }
    toast.success('تم تسجيل عملية الإنتاج'); scheduleReload(); return true;
  };

  // Sell Product (with services & expenses)
  const sellProduct = async (params: {
    product_id: string; quantity: number; unit_price: number;
    contact_id?: string; fund_id?: string; paid_amount?: number; date?: string; notes?: string;
    services?: SaleService[]; expenses?: SaleExpense[];
  }) => {
    const { error } = await (supabase.rpc as any)('sell_product', {
      p_product_id: params.product_id, p_quantity: params.quantity, p_unit_price: params.unit_price,
      p_contact_id: params.contact_id || undefined, p_fund_id: params.fund_id || undefined,
      p_paid_amount: params.paid_amount || 0,
      p_date: params.date || new Date().toISOString().slice(0, 10), p_notes: params.notes,
      p_services: params.services || [], p_expenses: params.expenses || [],
    });
    if (error) { toast.error(error.message || 'فشل البيع'); return false; }
    toast.success('تم تسجيل البيع'); scheduleReload(); return true;
  };

  // Sell Raw Material directly
  const sellRawMaterial = async (params: {
    material_id: string; quantity: number; unit_price: number;
    contact_id?: string; fund_id?: string; paid_amount?: number; date?: string; notes?: string;
    services?: SaleService[]; expenses?: SaleExpense[];
  }) => {
    const { error } = await (supabase.rpc as any)('sell_raw_material', {
      p_material_id: params.material_id, p_quantity: params.quantity, p_unit_price: params.unit_price,
      p_contact_id: params.contact_id || undefined, p_fund_id: params.fund_id || undefined,
      p_paid_amount: params.paid_amount || 0,
      p_date: params.date || new Date().toISOString().slice(0, 10), p_notes: params.notes,
      p_services: params.services || [], p_expenses: params.expenses || [],
    });
    if (error) { toast.error(error.message || 'فشل البيع المباشر'); return false; }
    toast.success('تم تسجيل البيع المباشر'); scheduleReload(); return true;
  };

  const updateSale = async (saleId: string, params: any) => {
    const { error } = await (supabase.rpc as any)('update_production_sale', {
      p_sale_id: saleId, p_quantity: params.quantity, p_unit_price: params.unit_price,
      p_contact_id: params.contact_id || null, p_fund_id: params.fund_id || null,
      p_paid_amount: params.paid_amount || 0, p_date: params.date || null, p_notes: params.notes || null,
    });
    if (error) { toast.error(error.message || 'فشل التعديل'); return false; }
    toast.success('تم التعديل'); scheduleReload(); return true;
  };
  const deleteSale = async (saleId: string) => {
    const { error } = await (supabase.rpc as any)('reverse_production_sale', { p_sale_id: saleId });
    if (error) { toast.error(error.message || 'فشل الحذف'); return false; }
    toast.success('تم حذف البيع وعكس أثره'); scheduleReload(); return true;
  };
  const deleteRun = async (runId: string) => {
    const { error } = await (supabase.rpc as any)('reverse_production_run', { p_run_id: runId });
    if (error) { toast.error(error.message || 'فشل الإلغاء'); return false; }
    toast.success('تم الإلغاء'); scheduleReload(); return true;
  };
  const deletePurchase = async (purchaseId: string) => {
    const { error } = await (supabase.rpc as any)('reverse_material_purchase', { p_purchase_id: purchaseId });
    if (error) { toast.error(error.message || 'فشل الإلغاء'); return false; }
    toast.success('تم الإلغاء'); scheduleReload(); return true;
  };

  return {
    materials, products, services, bom, summary, loading,
    addMaterial, updateMaterial, deleteMaterial, purchaseMaterial,
    addProduct, updateProduct, deleteProduct, setProductBom,
    addService, updateService, deleteService,
    produceProduct, sellProduct, sellRawMaterial,
    updateSale, deleteSale, deleteRun, deletePurchase,
    refresh: loadAll,
  };
}
