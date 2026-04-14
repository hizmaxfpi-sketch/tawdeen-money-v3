import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Container, Shipment, ShippingStats } from '@/types/finance';
import { useRealtimeSync } from './useRealtimeSync';

export function useSupabaseShipping() {
  const { user } = useAuth();
  const PAGE_SIZE = 50;
  const [containers, setContainers] = useState<Container[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [containersLoading, setContainersLoading] = useState(true);
  const [shipmentsLoading, setShipmentsLoading] = useState(true);
  const [hasMoreContainers, setHasMoreContainers] = useState(true);
  const [hasMoreShipments, setHasMoreShipments] = useState(true);
  const [containerPage, setContainerPage] = useState(0);
  const [shipmentPage, setShipmentPage] = useState(0);
  const [loadingMoreContainers, setLoadingMoreContainers] = useState(false);
  const [loadingMoreShipments, setLoadingMoreShipments] = useState(false);
  const [containersInitial, setContainersInitial] = useState(false);
  const [shipmentsInitial, setShipmentsInitial] = useState(false);
  const realtimeRef = useRef<{ suppressNext: (ms?: number) => void }>({ suppressNext: () => {} });

  const fetchContainers = useCallback(async (reset = false) => {
    if (!user) return;
    const currentPage = reset ? 0 : containerPage;
    if (!containersInitial || reset) setContainersLoading(true);
    else if (!reset) setLoadingMoreContainers(true);

    const { data, error } = await supabase
      .from('containers')
      .select('id, container_number, type, capacity, used_capacity, route, status, is_manually_closed, departure_date, arrival_date, clearance_date, shipping_cost, customs_cost, port_cost, other_costs, total_cost, total_revenue, profit, notes, attachments, created_at, updated_at, created_by_name')
      .order('created_at', { ascending: false })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    if (error) { console.error('Error fetching containers:', error); }
    else {
      const mapped = (data || []).map(c => ({
        id: c.id,
        containerNumber: c.container_number,
        type: c.type as any,
        capacity: Number(c.capacity),
        usedCapacity: Number(c.used_capacity),
        route: c.route,
        status: c.status as any,
        isManullyClosed: c.is_manually_closed || false,
        departureDate: c.departure_date || undefined,
        arrivalDate: c.arrival_date || undefined,
        clearanceDate: c.clearance_date || undefined,
        shippingCost: Number(c.shipping_cost),
        customsCost: Number(c.customs_cost),
        portCost: Number(c.port_cost),
        otherCosts: Number(c.other_costs),
        totalCost: Number(c.total_cost),
        totalRevenue: Number(c.total_revenue),
        profit: Number(c.profit),
        notes: c.notes || undefined,
        attachments: c.attachments || [],
        createdByName: (c as any).created_by_name || undefined,
        createdAt: new Date(c.created_at),
        updatedAt: new Date(c.updated_at),
      }));
      if (reset || currentPage === 0) {
        setContainers(mapped);
        setContainerPage(0);
      } else {
        setContainers(prev => [...prev, ...mapped]);
      }
      setHasMoreContainers((data || []).length === PAGE_SIZE);
    }
    setContainersLoading(false);
    setLoadingMoreContainers(false);
    setContainersInitial(true);
  }, [user, containerPage, containersInitial]);

  const fetchShipments = useCallback(async (reset = false) => {
    if (!user) return;
    const currentPage = reset ? 0 : shipmentPage;
    if (!shipmentsInitial || reset) setShipmentsLoading(true);
    else if (!reset) setLoadingMoreShipments(true);

    const { data, error } = await supabase
      .from('shipments')
      .select('id, container_id, client_id, client_name, goods_type, length, width, height, quantity, weight, cbm, price_per_meter, contract_price, amount_paid, remaining_amount, payment_status, tracking_number, notes, attachments, created_at, updated_at, created_by_name, shipment_payments(id, amount, date, fund_id, note)')
      .order('created_at', { ascending: false })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    if (error) { console.error('Error fetching shipments:', error); }
    else {
      const mapped = (data || []).map(s => ({
        id: s.id,
        containerId: s.container_id,
        clientId: s.client_id || undefined,
        clientName: s.client_name,
        goodsType: s.goods_type,
        length: Number(s.length),
        width: Number(s.width),
        height: Number(s.height),
        quantity: Number(s.quantity),
        weight: Number((s as any).weight || 0),
        cbm: Number(s.cbm),
        pricePerMeter: Number(s.price_per_meter),
        contractPrice: Number(s.contract_price),
        amountPaid: Number(s.amount_paid),
        remainingAmount: Number(s.remaining_amount),
        paymentStatus: s.payment_status as any,
        trackingNumber: s.tracking_number || undefined,
        notes: s.notes || undefined,
        attachments: (s as any).attachments || [],
        payments: (s.shipment_payments || []).map((p: any) => ({
          id: p.id,
          amount: Number(p.amount),
          date: new Date(p.date),
          fundId: p.fund_id || undefined,
          note: p.note || undefined,
        })),
        createdByName: (s as any).created_by_name || undefined,
        createdAt: new Date(s.created_at),
        updatedAt: new Date(s.updated_at),
      }));
      if (reset || currentPage === 0) {
        setShipments(mapped);
        setShipmentPage(0);
      } else {
        setShipments(prev => [...prev, ...mapped]);
      }
      setHasMoreShipments((data || []).length === PAGE_SIZE);
    }
    setShipmentsLoading(false);
    setLoadingMoreShipments(false);
    setShipmentsInitial(true);
  }, [user, shipmentPage, shipmentsInitial]);

  useEffect(() => {
    if (user) { fetchContainers(true); fetchShipments(true); }
  }, [user]);

  // Realtime: auto-refresh when containers or shipments change
  const rt = useRealtimeSync(['containers', 'shipments'], () => {
    fetchContainers(true);
    fetchShipments(true);
  });
  realtimeRef.current = rt;

  const loadMoreContainers = useCallback(() => {
    if (hasMoreContainers && !loadingMoreContainers) setContainerPage(prev => prev + 1);
  }, [hasMoreContainers, loadingMoreContainers]);

  const loadMoreShipments = useCallback(() => {
    if (hasMoreShipments && !loadingMoreShipments) setShipmentPage(prev => prev + 1);
  }, [hasMoreShipments, loadingMoreShipments]);

  useEffect(() => { if (containerPage > 0) fetchContainers(); }, [containerPage]);
  useEffect(() => { if (shipmentPage > 0) fetchShipments(); }, [shipmentPage]);

  // ============= إضافة حاوية =============
  const addContainer = useCallback(async (data: {
    containerNumber: string;
    type?: string;
    capacity?: number;
    route?: string;
    originCountry?: string;
    destinationCountry?: string;
    shippingCost?: number;
    customsCost?: number;
    portCost?: number;
    otherCosts?: number;
    containerPrice?: number;
    glassFees?: number;
    rentalDays?: number;
    loadingDays?: number;
    costPerMeter?: number;
    status?: string;
    departureDate?: string;
    rentalDate?: string;
    arrivalDate?: string;
    notes?: string;
    shippingAgentId?: string;
  }) => {
    if (!user) return;
    const { error } = await supabase.rpc('create_container_with_accounting', {
      p_container_number: data.containerNumber,
      p_type: data.type || '40ft',
      p_capacity: data.capacity || 67,
      p_route: data.route || '',
      p_origin_country: data.originCountry || 'الصين',
      p_destination_country: data.destinationCountry || 'السعودية',
      p_shipping_cost: data.shippingCost || 0,
      p_customs_cost: data.customsCost || 0,
      p_port_cost: data.portCost || 0,
      p_other_costs: data.otherCosts || 0,
      p_container_price: data.containerPrice || 0,
      p_glass_fees: data.glassFees || 0,
      p_rental_days: data.rentalDays || 0,
      p_loading_days: data.loadingDays || 0,
      p_cost_per_meter: data.costPerMeter || 0,
      p_status: data.status || 'loading',
      p_departure_date: data.departureDate || null,
      p_rental_date: data.rentalDate || null,
      p_arrival_date: data.arrivalDate || null,
      p_notes: data.notes || null,
      p_shipping_agent_id: data.shippingAgentId || null,
    });
    if (error) { toast.error('خطأ في إضافة الحاوية'); console.error(error); throw error; }
    realtimeRef.current.suppressNext();
    await fetchContainers(true);
  }, [user, fetchContainers]);

  const updateContainer = useCallback(async (id: string, updates: Partial<Container>) => {
    // جلب البيانات الحالية من DB مباشرة
    const { data: current } = await supabase.from('containers').select('*').eq('id', id).single();
    if (!current) return;
    
    const { error } = await supabase.from('containers').update({
      container_number: updates.containerNumber ?? current.container_number,
      type: updates.type ?? current.type,
      route: updates.route ?? current.route,
      status: updates.status ?? current.status,
      departure_date: updates.departureDate ?? current.departure_date,
      arrival_date: updates.arrivalDate ?? current.arrival_date,
      clearance_date: updates.clearanceDate ?? current.clearance_date,
      shipping_cost: updates.shippingCost ?? current.shipping_cost,
      customs_cost: updates.customsCost ?? current.customs_cost,
      port_cost: updates.portCost ?? current.port_cost,
      other_costs: updates.otherCosts ?? current.other_costs,
      total_cost: (updates.shippingCost ?? Number(current.shipping_cost)) + (updates.customsCost ?? Number(current.customs_cost)) + (updates.portCost ?? Number(current.port_cost)) + (updates.otherCosts ?? Number(current.other_costs)),
      profit: Number(current.total_revenue) - ((updates.shippingCost ?? Number(current.shipping_cost)) + (updates.customsCost ?? Number(current.customs_cost)) + (updates.portCost ?? Number(current.port_cost)) + (updates.otherCosts ?? Number(current.other_costs))),
      notes: updates.notes ?? current.notes,
      attachments: updates.attachments ?? current.attachments,
    }).eq('id', id);
    if (error) { toast.error('خطأ في تحديث الحاوية'); return; }
    toast.success('تم تحديث الحاوية بنجاح');
    realtimeRef.current.suppressNext();
    await fetchContainers(true);
  }, [fetchContainers]);

  const deleteContainer = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('delete_container_with_shipments', { p_container_id: id });
    if (error) { toast.error('خطأ في حذف الحاوية'); console.error(error); return; }
    toast.success('تم حذف الحاوية وجميع شحناتها بنجاح');
    if (user) await (supabase.rpc as any)('sync_contact_balances');
    realtimeRef.current.suppressNext();
    await Promise.all([fetchContainers(), fetchShipments()]);
  }, [user, fetchContainers, fetchShipments]);

  // ============= إضافة شحنة =============
  const addShipment = useCallback(async (data: Partial<Shipment> & {
    clientCode?: string; recipientName?: string; weight?: number;
    chinaExpenses?: number; seaFreight?: number; portDeliveryFees?: number;
    customsFees?: number; internalTransportFees?: number;
    domesticShippingCost?: number; transitCost?: number; packageNumber?: string;
    fundId?: string;
  }) => {
    if (!user) return;

    // رقم الباكج التلقائي إذا لم يُحدد
    let pkgNum = data.packageNumber;
    if (!pkgNum) {
      pkgNum = `PKG-${Date.now().toString(36).toUpperCase()}`;
    }
    
    // إرسال كل البيانات في طلب واحد - لا تحديثات لاحقة
    const { data: shipmentId, error } = await supabase.rpc('create_shipment_with_accounting', {
      p_container_id: data.containerId || '',
      p_client_id: data.clientId || null,
      p_client_name: data.clientName || '',
      p_client_code: data.clientCode || null,
      p_recipient_name: data.recipientName || null,
      p_goods_type: data.goodsType || '',
      p_length: data.length || 0,
      p_width: data.width || 0,
      p_height: data.height || 0,
      p_quantity: data.quantity || 1,
      p_weight: data.weight || 0,
      p_cbm: data.cbm || null,
      p_price_per_meter: data.pricePerMeter || 0,
      p_amount_paid: data.amountPaid || 0,
      p_tracking_number: data.trackingNumber || null,
      p_notes: data.notes || null,
      p_china_expenses: data.chinaExpenses || 0,
      p_sea_freight: data.seaFreight || 0,
      p_port_delivery_fees: data.portDeliveryFees || 0,
      p_customs_fees: data.customsFees || 0,
      p_internal_transport_fees: data.internalTransportFees || 0,
      p_fund_id: data.fundId || null,
      p_domestic_shipping_cost: data.domesticShippingCost || 0,
      p_transit_cost: data.transitCost || 0,
      p_package_number: pkgNum || null,
    } as any);
    
    if (error) { toast.error('خطأ في إضافة الشحنة'); console.error(error); return null; }

    // Save attachments separately
    if (shipmentId && data.attachments && data.attachments.length > 0) {
      await supabase.from('shipments').update({ attachments: data.attachments }).eq('id', shipmentId as string);
    }

    toast.success(`تم إضافة الشحنة بنجاح - ${pkgNum}`);
    realtimeRef.current.suppressNext();
    await Promise.all([fetchShipments(), fetchContainers()]);
    return shipmentId;
    
  }, [user, fetchShipments, fetchContainers]);

  const updateShipment = useCallback(async (id: string, updates: Partial<Shipment>) => {
    const { error } = await supabase.rpc('update_shipment_with_accounting', {
      p_shipment_id: id,
      p_client_name: updates.clientName || null,
      p_goods_type: updates.goodsType || null,
      p_length: updates.length ?? null,
      p_width: updates.width ?? null,
      p_height: updates.height ?? null,
      p_quantity: updates.quantity ?? null,
      p_price_per_meter: updates.pricePerMeter ?? null,
      p_amount_paid: updates.amountPaid ?? null,
      p_tracking_number: updates.trackingNumber || null,
      p_notes: updates.notes || null,
    });
    if (error) { toast.error('خطأ في تحديث الشحنة'); console.error(error); return; }
    // Update attachments separately
    if (updates.attachments !== undefined) {
      await supabase.from('shipments').update({ attachments: updates.attachments }).eq('id', id);
    }
    toast.success('تم تحديث الشحنة بنجاح');
    realtimeRef.current.suppressNext();
    await Promise.all([fetchShipments(), fetchContainers()]);
  }, [fetchShipments, fetchContainers]);

  const deleteShipment = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('delete_shipment_with_accounting', { p_shipment_id: id });
    if (error) { toast.error('خطأ في حذف الشحنة'); console.error(error); return; }
    toast.success('تم حذف الشحنة بنجاح');
    if (user) await (supabase.rpc as any)('sync_contact_balances');
    realtimeRef.current.suppressNext();
    await Promise.all([fetchShipments(), fetchContainers()]);
  }, [user, fetchShipments, fetchContainers]);

  const addShipmentPayment = useCallback(async (
    shipmentId: string, amount: number, fundId?: string, note?: string,
    _updateFundBalance?: (fundId: string, amount: number) => Promise<void>
  ) => {
    if (!user) return;
    const { error } = await supabase.rpc('process_shipment_payment', {
      p_shipment_id: shipmentId,
      p_amount: amount,
      p_fund_id: fundId || null,
      p_note: note || null,
    } as any);
    if (error) { toast.error('خطأ في تسجيل الدفعة'); console.error(error); return; }
    toast.success('تم تسجيل الدفعة بنجاح');
    if (user) await (supabase.rpc as any)('sync_contact_balances');
    realtimeRef.current.suppressNext();
    await fetchShipments();
  }, [user, fetchShipments]);

  // ============= الإحصائيات =============
  const getShippingStats = useCallback((): ShippingStats => {
    const totalContainers = containers.length;
    const totalShipments = shipments.length;
    const activeContainers = containers.filter(c => c.status === 'loading' || c.status === 'shipped').length;
    const totalRevenue = containers.reduce((sum, c) => sum + c.totalRevenue, 0);
    const totalCosts = containers.reduce((sum, c) => sum + c.totalCost, 0);
    const totalProfit = containers.reduce((sum, c) => sum + c.profit, 0);
    const totalReceivables = shipments.reduce((sum, s) => sum + s.remainingAmount, 0);
    const totalCapacity = containers.reduce((sum, c) => sum + c.capacity, 0);
    const usedCapacity = containers.reduce((sum, c) => sum + c.usedCapacity, 0);
    const capacityUtilization = totalCapacity > 0 ? (usedCapacity / totalCapacity) * 100 : 0;
    return { totalContainers, totalShipments, activeContainers, totalRevenue, totalCosts, totalProfit, totalReceivables, capacityUtilization };
  }, [containers, shipments]);

  const getShipmentsByContainer = useCallback((containerId: string) =>
    shipments.filter(s => s.containerId === containerId), [shipments]);
  const getContainerShipments = getShipmentsByContainer;

  const getContainerById = useCallback((id: string) =>
    containers.find(c => c.id === id), [containers]);

  const getRemainingCapacity = useCallback((containerId: string): number => {
    const container = containers.find(c => c.id === containerId);
    return container ? container.capacity - container.usedCapacity : 0;
  }, [containers]);

  // ============= إقفال/فتح الحاوية يدوياً =============
  const toggleContainerClosed = useCallback(async (id: string, isClosed: boolean) => {
    const { error } = await supabase.from('containers').update({
      is_manually_closed: isClosed,
    }).eq('id', id);
    if (error) { toast.error('خطأ في تحديث حالة الحاوية'); return; }
    toast.success(isClosed ? 'تم إقفال الحاوية' : 'تم فتح الحاوية');
    await fetchContainers();
  }, [fetchContainers]);

  return {
    containers, shipments, containersLoading, shipmentsLoading,
    hasMoreContainers, hasMoreShipments, loadingMoreContainers, loadingMoreShipments,
    loadMoreContainers, loadMoreShipments,
    addContainer, updateContainer, deleteContainer, toggleContainerClosed,
    addShipment, updateShipment, deleteShipment, addShipmentPayment,
    getShippingStats, getShipmentsByContainer, getContainerShipments,
    getContainerById, getRemainingCapacity,
    fetchContainers, fetchShipments,
  };
}
