import { useState, useCallback, useEffect } from 'react';
import { 
  Container, 
  Shipment, 
  ShipmentPayment,
  ShippingStats,
  ContainerType,
  ContainerStatus,
  ShipmentPaymentStatus 
} from '@/types/finance';

// مفاتيح التخزين المحلي
const STORAGE_KEYS = {
  containers: 'shipping_containers',
  shipments: 'shipping_shipments',
};

// السعة الافتراضية حسب نوع الحاوية
export const CONTAINER_CAPACITIES: Record<ContainerType, number> = {
  '20ft': 33,
  '40ft': 67,
  '40hc': 76,
};

// أسعار المتر المكعب الشائعة
export const COMMON_PRICES = [100, 150, 200, 250, 300];

// أنواع البضائع
export const GOODS_CATEGORIES = [
  { id: 'clothes', label: 'ملابس', icon: 'Shirt' },
  { id: 'machines', label: 'ماكينات', icon: 'Cog' },
  { id: 'food', label: 'مواد غذائية', icon: 'Apple' },
  { id: 'electronics', label: 'إلكترونيات', icon: 'Smartphone' },
  { id: 'furniture', label: 'أثاث', icon: 'Sofa' },
  { id: 'other', label: 'أخرى', icon: 'Package' },
];

// البيانات الافتراضية
const defaultContainers: Container[] = [];
const defaultShipments: Shipment[] = [];

// وظائف التخزين
function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored).map((item: any) => ({
        ...item,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        payments: item.payments?.map((p: any) => ({
          ...p,
          date: p.date ? new Date(p.date) : new Date(),
        })) || [],
      }));
    }
  } catch (error) {
    console.error(`Error loading ${key}:`, error);
  }
  return defaultValue;
}

function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Error saving ${key}:`, error);
  }
}

export function useShippingStore() {
  const [containers, setContainers] = useState<Container[]>(() =>
    loadFromStorage(STORAGE_KEYS.containers, defaultContainers)
  );
  const [shipments, setShipments] = useState<Shipment[]>(() =>
    loadFromStorage(STORAGE_KEYS.shipments, defaultShipments)
  );

  // حفظ عند التغيير
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.containers, containers);
  }, [containers]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.shipments, shipments);
  }, [shipments]);

  // ============= إدارة الحاويات =============

  const addContainer = useCallback((container: Omit<Container, 'id' | 'createdAt' | 'updatedAt' | 'usedCapacity' | 'totalRevenue' | 'profit'>) => {
    const totalCost = container.shippingCost + container.customsCost + container.portCost + container.otherCosts;
    const newContainer: Container = {
      ...container,
      id: `cont-${Date.now()}`,
      usedCapacity: 0,
      totalCost,
      totalRevenue: 0,
      profit: -totalCost,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setContainers(prev => [...prev, newContainer]);
    return newContainer;
  }, []);

  const updateContainer = useCallback((id: string, updates: Partial<Container>) => {
    setContainers(prev => prev.map(c => {
      if (c.id === id) {
        const updated = { ...c, ...updates };
        // إعادة حساب التكاليف إذا تغيرت
        if (updates.shippingCost !== undefined || updates.customsCost !== undefined || 
            updates.portCost !== undefined || updates.otherCosts !== undefined) {
          updated.totalCost = (updates.shippingCost ?? c.shippingCost) + 
                              (updates.customsCost ?? c.customsCost) + 
                              (updates.portCost ?? c.portCost) + 
                              (updates.otherCosts ?? c.otherCosts);
          updated.profit = updated.totalRevenue - updated.totalCost;
        }
        return updated;
      }
      return c;
    }));
  }, []);

  const deleteContainer = useCallback((id: string) => {
    // حذف الشحنات المرتبطة أيضاً
    setShipments(prev => prev.filter(s => s.containerId !== id));
    setContainers(prev => prev.filter(c => c.id !== id));
  }, []);

  const recalculateContainer = useCallback((containerId: string) => {
    const containerShipments = shipments.filter(s => s.containerId === containerId);
    const usedCapacity = containerShipments.reduce((sum, s) => sum + s.cbm, 0);
    const totalRevenue = containerShipments.reduce((sum, s) => sum + s.contractPrice, 0);
    
    setContainers(prev => prev.map(c => {
      if (c.id === containerId) {
        return {
          ...c,
          usedCapacity,
          totalRevenue,
          profit: totalRevenue - c.totalCost,
        };
      }
      return c;
    }));
  }, [shipments]);

  // ============= إدارة الشحنات =============

  const addShipment = useCallback((shipment: Omit<Shipment, 'id' | 'createdAt' | 'updatedAt' | 'cbm' | 'contractPrice' | 'remainingAmount' | 'paymentStatus' | 'payments'>) => {
    // حساب الحجم والسعر
    const cbm = shipment.length * shipment.width * shipment.height * shipment.quantity;
    const contractPrice = cbm * shipment.pricePerMeter;
    const remainingAmount = contractPrice - shipment.amountPaid;
    const paymentStatus: ShipmentPaymentStatus = 
      shipment.amountPaid >= contractPrice ? 'paid' : 
      shipment.amountPaid > 0 ? 'partial' : 'unpaid';

    const newShipment: Shipment = {
      ...shipment,
      id: `ship-${Date.now()}`,
      cbm,
      contractPrice,
      remainingAmount,
      paymentStatus,
      payments: shipment.amountPaid > 0 ? [{
        id: `pay-${Date.now()}`,
        amount: shipment.amountPaid,
        date: new Date(),
        fundId: '',
        note: 'دفعة أولية',
      }] : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setShipments(prev => [...prev, newShipment]);

    // تحديث الحاوية الأم
    setTimeout(() => recalculateContainer(shipment.containerId), 0);

    return newShipment;
  }, [recalculateContainer]);

  const updateShipment = useCallback((id: string, updates: Partial<Shipment>) => {
    let containerId = '';
    
    setShipments(prev => prev.map(s => {
      if (s.id === id) {
        const updated = { ...s, ...updates };
        containerId = s.containerId;
        
        // إعادة حساب الحجم والسعر إذا تغيرت الأبعاد
        if (updates.length !== undefined || updates.width !== undefined || 
            updates.height !== undefined || updates.quantity !== undefined ||
            updates.pricePerMeter !== undefined) {
          updated.cbm = (updates.length ?? s.length) * 
                        (updates.width ?? s.width) * 
                        (updates.height ?? s.height) * 
                        (updates.quantity ?? s.quantity);
          updated.contractPrice = updated.cbm * (updates.pricePerMeter ?? s.pricePerMeter);
          updated.remainingAmount = updated.contractPrice - updated.amountPaid;
          updated.paymentStatus = 
            updated.amountPaid >= updated.contractPrice ? 'paid' : 
            updated.amountPaid > 0 ? 'partial' : 'unpaid';
        }
        return updated;
      }
      return s;
    }));

    if (containerId) {
      setTimeout(() => recalculateContainer(containerId), 0);
    }
  }, [recalculateContainer]);

  const deleteShipment = useCallback((id: string) => {
    const shipment = shipments.find(s => s.id === id);
    if (!shipment) return;
    
    setShipments(prev => prev.filter(s => s.id !== id));
    setTimeout(() => recalculateContainer(shipment.containerId), 0);
  }, [shipments, recalculateContainer]);

  const addShipmentPayment = useCallback((
    shipmentId: string, 
    amount: number, 
    fundId: string, 
    note?: string,
    onFundUpdate?: (fundId: string, amount: number) => void
  ) => {
    const shipment = shipments.find(s => s.id === shipmentId);
    if (!shipment) return;

    const newPayment: ShipmentPayment = {
      id: `pay-${Date.now()}`,
      amount,
      date: new Date(),
      fundId,
      note,
    };

    const newAmountPaid = shipment.amountPaid + amount;
    const newRemaining = shipment.contractPrice - newAmountPaid;
    const isFullyPaid = newRemaining <= 0;

    setShipments(prev => prev.map(s => {
      if (s.id === shipmentId) {
        return {
          ...s,
          amountPaid: newAmountPaid,
          remainingAmount: Math.max(0, newRemaining),
          paymentStatus: isFullyPaid ? 'paid' : 'partial',
          payments: [...s.payments, newPayment],
        };
      }
      return s;
    }));

    // تحديث رصيد الصندوق إذا توفرت الدالة
    if (onFundUpdate) {
      onFundUpdate(fundId, amount);
    }
  }, [shipments]);

  // ============= الإحصائيات =============

  const getShippingStats = useCallback((): ShippingStats => {
    const totalContainers = containers.length;
    const activeContainers = containers.filter(c => c.status !== 'delivered').length;
    const totalShipments = shipments.length;
    const totalRevenue = containers.reduce((sum, c) => sum + c.totalRevenue, 0);
    const totalCosts = containers.reduce((sum, c) => sum + c.totalCost, 0);
    const totalProfit = totalRevenue - totalCosts;
    const totalReceivables = shipments.reduce((sum, s) => sum + s.remainingAmount, 0);
    const totalCapacity = containers.reduce((sum, c) => sum + c.capacity, 0);
    const totalUsed = containers.reduce((sum, c) => sum + c.usedCapacity, 0);
    const capacityUtilization = totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : 0;

    return {
      totalContainers,
      activeContainers,
      totalShipments,
      totalRevenue,
      totalCosts,
      totalProfit,
      totalReceivables,
      capacityUtilization,
    };
  }, [containers, shipments]);

  // الحصول على شحنات حاوية معينة
  const getContainerShipments = useCallback((containerId: string) => {
    return shipments.filter(s => s.containerId === containerId);
  }, [shipments]);

  // الحصول على شحنات عميل معين
  const getClientShipments = useCallback((clientId: string) => {
    return shipments.filter(s => s.clientId === clientId);
  }, [shipments]);

  // التحقق من تجاوز السعة
  const checkCapacityOverflow = useCallback((containerId: string, additionalCbm: number = 0): boolean => {
    const container = containers.find(c => c.id === containerId);
    if (!container) return false;
    return (container.usedCapacity + additionalCbm) > container.capacity;
  }, [containers]);

  // حساب المساحة المتبقية
  const getRemainingCapacity = useCallback((containerId: string): number => {
    const container = containers.find(c => c.id === containerId);
    if (!container) return 0;
    return container.capacity - container.usedCapacity;
  }, [containers]);

  return {
    containers,
    shipments,
    // إدارة الحاويات
    addContainer,
    updateContainer,
    deleteContainer,
    recalculateContainer,
    // إدارة الشحنات
    addShipment,
    updateShipment,
    deleteShipment,
    addShipmentPayment,
    // الاستعلامات
    getShippingStats,
    getContainerShipments,
    getClientShipments,
    checkCapacityOverflow,
    getRemainingCapacity,
  };
}
