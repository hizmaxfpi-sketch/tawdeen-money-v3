// ============= أنواع موسعة لنظام الشحن =============

// بلدان شائعة للمنشأ والوصول
export const ORIGIN_COUNTRIES = [
  { id: 'china', label: 'الصين', labelEn: 'China' },
  { id: 'turkey', label: 'تركيا', labelEn: 'Turkey' },
  { id: 'india', label: 'الهند', labelEn: 'India' },
  { id: 'uae', label: 'الإمارات', labelEn: 'UAE' },
  { id: 'korea', label: 'كوريا', labelEn: 'Korea' },
  { id: 'japan', label: 'اليابان', labelEn: 'Japan' },
  { id: 'usa', label: 'أمريكا', labelEn: 'USA' },
  { id: 'germany', label: 'ألمانيا', labelEn: 'Germany' },
  { id: 'other', label: 'أخرى', labelEn: 'Other' },
];

export const DESTINATION_COUNTRIES = [
  { id: 'saudi', label: 'السعودية', labelEn: 'Saudi Arabia' },
  { id: 'uae', label: 'الإمارات', labelEn: 'UAE' },
  { id: 'kuwait', label: 'الكويت', labelEn: 'Kuwait' },
  { id: 'qatar', label: 'قطر', labelEn: 'Qatar' },
  { id: 'bahrain', label: 'البحرين', labelEn: 'Bahrain' },
  { id: 'oman', label: 'عمان', labelEn: 'Oman' },
  { id: 'iraq', label: 'العراق', labelEn: 'Iraq' },
  { id: 'jordan', label: 'الأردن', labelEn: 'Jordan' },
  { id: 'egypt', label: 'مصر', labelEn: 'Egypt' },
  { id: 'other', label: 'أخرى', labelEn: 'Other' },
];

// أنواع البضائع الموسعة
export const GOODS_CATEGORIES_EXTENDED = [
  { id: 'clothes', label: 'ملابس', icon: 'Shirt' },
  { id: 'machines', label: 'ماكينات', icon: 'Cog' },
  { id: 'food', label: 'مواد غذائية', icon: 'Apple' },
  { id: 'electronics', label: 'إلكترونيات', icon: 'Smartphone' },
  { id: 'furniture', label: 'أثاث', icon: 'Sofa' },
  { id: 'cosmetics', label: 'مستحضرات تجميل', icon: 'Sparkles' },
  { id: 'toys', label: 'ألعاب', icon: 'Gamepad2' },
  { id: 'spare_parts', label: 'قطع غيار', icon: 'Wrench' },
  { id: 'building_materials', label: 'مواد بناء', icon: 'Hammer' },
  { id: 'fabrics', label: 'أقمشة', icon: 'Layers' },
  { id: 'glass', label: 'زجاج', icon: 'Square' },
  { id: 'other', label: 'أخرى', icon: 'Package' },
];

// أسعار المتر الشائعة الموسعة
export const COMMON_PRICES_EXTENDED = [80, 100, 120, 150, 180, 200, 250, 300];

// بيانات الحاوية الموسعة (للنموذج)
export interface ContainerFormData {
  // بيانات أساسية
  containerNumber: string;
  type: '20ft' | '40ft' | '40hc';
  
  // بلد المنشأ والوصول
  originCountry: string;
  destinationCountry: string;
  
  // التواريخ
  departureDate?: string;
  rentalDate?: string;
  arrivalDate?: string;
  
  // أيام الإيجار والتحميل
  rentalDays: number;
  loadingDays: number;
  
  // السعة والحجم
  capacity: number;
  occupiedVolume: number;
  occupiedArea: number;
  
  // التكاليف
  containerPrice: number;
  shippingCost: number;
  customsCost: number;
  portCost: number;
  glassFees: number;
  otherCosts: number;
  totalCost: number;
  costPerMeter: number;
  
  // الحالة والملاحظات
  status: 'loading' | 'shipped' | 'arrived' | 'cleared' | 'delivered';
  notes?: string;
}

// بيانات الشحنة الموسعة (للنموذج)
export interface ShipmentFormData {
  // ربط الحاوية
  containerId: string;
  
  // بيانات العميل
  clientId?: string;
  clientCode?: string;
  clientName: string;
  recipientName?: string;
  
  // نوع البضاعة
  goodsType: string;
  
  // الأبعاد والحجم
  length: number;
  width: number;
  height: number;
  quantity: number;
  cbm: number;
  weight: number;
  
  // التسعير
  pricePerMeter: number;
  contractPrice: number;
  
  // المصاريف الإضافية
  chinaExpenses: number;
  seaFreight: number;
  portDeliveryFees: number;
  customsFees: number;
  internalTransportFees: number;
  
  // المدفوعات
  amountPaid: number;
  remainingAmount: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  
  // تفاصيل إضافية
  trackingNumber?: string;
  notes?: string;
}

// حساب إجمالي مصاريف الشحنة
export function calculateShipmentTotalExpenses(data: Partial<ShipmentFormData>): number {
  return (
    (data.chinaExpenses || 0) +
    (data.seaFreight || 0) +
    (data.portDeliveryFees || 0) +
    (data.customsFees || 0) +
    (data.internalTransportFees || 0)
  );
}

// حساب CBM
export function calculateCBM(length: number, width: number, height: number, quantity: number): number {
  return length * width * height * quantity;
}

// حساب سعر المقاولة
export function calculateContractPrice(cbm: number, pricePerMeter: number): number {
  return cbm * pricePerMeter;
}

// حساب تكلفة المتر للحاوية
export function calculateCostPerMeter(totalCost: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return totalCost / capacity;
}
