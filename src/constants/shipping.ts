import { ContainerType } from '@/types/finance';

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
