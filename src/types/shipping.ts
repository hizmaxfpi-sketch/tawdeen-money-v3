export interface Container {
  id: string;
  containerNumber: string;
  type: string;
  capacity: number;
  usedCapacity: number;
  route: string;
  status: 'loading' | 'shipped' | 'arrived' | 'cleared' | 'delivered';
  departureDate?: string;
  arrivalDate?: string;
  clearanceDate?: string;
  shippingCost: number;
  customsCost: number;
  portCost: number;
  otherCosts: number;
  totalCost: number;
  totalRevenue: number;
  profit: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShipmentPayment {
  id: string;
  amount: number;
  fundId?: string;
  note?: string;
  date: Date;
}

export interface Shipment {
  id: string;
  containerId: string;
  clientId?: string;
  clientName: string;
  goodsType: string;
  length: number;
  width: number;
  height: number;
  quantity: number;
  cbm: number;
  pricePerMeter: number;
  contractPrice: number;
  amountPaid: number;
  remainingAmount: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  trackingNumber?: string;
  notes?: string;
  payments: ShipmentPayment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ShippingStats {
  totalContainers: number;
  activeContainers: number;
  totalShipments: number;
  totalRevenue: number;
  totalCosts: number;
  totalProfit: number;
  totalReceivables: number;
  capacityUtilization: number;
}

export interface GoodsCategory {
  id: string;
  label: string;
  icon: string;
}

export const GOODS_CATEGORIES: GoodsCategory[] = [
  { id: 'electronics', label: 'إلكترونيات', icon: 'Smartphone' },
  { id: 'clothes', label: 'ملابس', icon: 'Shirt' },
  { id: 'furniture', label: 'أثاث', icon: 'Armchair' },
  { id: 'food', label: 'مواد غذائية', icon: 'Apple' },
  { id: 'machinery', label: 'معدات', icon: 'Cog' },
  { id: 'spare_parts', label: 'قطع غيار', icon: 'Wrench' },
  { id: 'toys', label: 'ألعاب', icon: 'Gamepad2' },
  { id: 'cosmetics', label: 'مستحضرات تجميل', icon: 'Sparkles' },
  { id: 'other', label: 'أخرى', icon: 'Package' },
];

export const CONTAINER_CAPACITIES: Record<string, number> = {
  '40ft': 67,
  '20ft': 33,
  '40hc': 76,
};
