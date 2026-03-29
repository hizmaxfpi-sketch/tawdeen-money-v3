// ============= نظام جهات الاتصال (Contacts Hub) =============

// أنواع جهات الاتصال
export type ContactType = 'client' | 'vendor' | 'shipping_agent' | 'employee' | 'partner' | 'other';

// حالة جهة الاتصال
export type ContactStatus = 'active' | 'inactive' | 'blocked';

// نموذج جهة الاتصال الأساسي
export interface Contact {
  id: string;
  name: string;
  type: ContactType;
  customType?: string; // للنوع المخصص
  phone?: string;
  whatsapp?: string; // رقم واتساب منفصل إن وجد
  email?: string;
  address?: string;
  company?: string; // اسم الشركة
  // الربط بجهات اتصال أخرى (التبعية)
  parentContactId?: string; // تابع لجهة اتصال أخرى
  linkedContacts?: string[]; // جهات اتصال مرتبطة
  // البيانات المالية المحسوبة
  totalTransactions: number; // إجمالي العمليات
  totalDebit: number; // إجمالي المدين (لنا)
  totalCredit: number; // إجمالي الدائن (علينا)
  balance: number; // الرصيد = المدين - الدائن
  // معلومات إضافية
  notes?: string;
  tags?: string[];
  avatar?: string;
  status: ContactStatus;
  createdAt: Date;
  updatedAt: Date;
}

// نموذج إنشاء جهة اتصال جديدة
export interface CreateContactInput {
  name: string;
  type: ContactType;
  customType?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  company?: string;
  parentContactId?: string;
  linkedContacts?: string[];
  notes?: string;
  tags?: string[];
}

// خيارات القوائم المنسدلة
export interface ContactOption {
  id: string;
  name: string;
  type: ContactType;
  phone?: string;
  balance: number;
}

// إحصائيات جهات الاتصال
export interface ContactsStats {
  totalContacts: number;
  clients: number;
  vendors: number;
  shippingAgents: number;
  employees: number;
  totalReceivables: number; // إجمالي المستحقات (لنا)
  totalPayables: number; // إجمالي الالتزامات (علينا)
}

// عملية مرتبطة بجهة اتصال
export interface ContactTransaction {
  id: string;
  type: 'in' | 'out';
  amount: number;
  description: string;
  date: string;
  category: string;
}

// تسميات أنواع جهات الاتصال
export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  client: 'عميل',
  vendor: 'مورد',
  shipping_agent: 'وكيل شحن',
  employee: 'موظف',
  partner: 'شريك',
  other: 'أخرى',
};

// أيقونات أنواع جهات الاتصال
export const CONTACT_TYPE_ICONS: Record<ContactType, string> = {
  client: 'UserCheck',
  vendor: 'Truck',
  shipping_agent: 'Ship',
  employee: 'Briefcase',
  partner: 'Handshake',
  other: 'User',
};

// ألوان أنواع جهات الاتصال
export const CONTACT_TYPE_COLORS: Record<ContactType, string> = {
  client: 'bg-green-500/10 text-green-600 border-green-500/30',
  vendor: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  shipping_agent: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
  employee: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
  partner: 'bg-pink-500/10 text-pink-600 border-pink-500/30',
  other: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
};
