// ============= نموذج المحاسبة الاحترافي =============
// Fund-Account-Project Accounting Model

// ============= 1. الصناديق (Funds) - أماكن المال الفعلي =============
export type FundType = 'cash' | 'bank' | 'wallet';

export interface Fund {
  id: string;
  name: string;
  type: FundType;
  balance: number; // الرصيد الفعلي
  description?: string;
  isDefault?: boolean;
  createdAt: Date;
}

// ============= 2. الحسابات الدفترية (Ledger Accounts) =============
export type LedgerAccountType = 'client' | 'vendor' | 'partner' | 'expense' | 'investor' | 'employee' | 'government' | 'custom';

export interface LedgerAccount {
  id: string;
  name: string;
  type: LedgerAccountType;
  customType?: string; // للنوع المخصص
  phone?: string;
  email?: string;
  notes?: string;
  // الأرصدة الدفترية
  debitBalance: number;  // مدين (لنا)
  creditBalance: number; // دائن (علينا)
  createdAt: Date;
}

// ============= 4. العمليات المالية (Transactions) =============
export type TransactionType = 'in' | 'out';
export type TransactionCategory = 
  | 'client_collection'   // تحصيل من عميل
  | 'vendor_payment'      // دفع لمورد
  | 'expense'             // مصروفات عامة
  | 'partner_payment'     // دفع لشريك
  | 'partner_collection'  // تحصيل من شريك
  | 'fund_transfer'       // تحويل بين صناديق
  | 'debt_payment'        // سداد مديونية
  | 'debt_collection'     // تحصيل مديونية
  | 'other';

export interface Transaction {
  id: string;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  description: string;
  date: string;
  // المراجع الإلزامية (Double-Entry)
  fundId: string;              // الصندوق المتأثر
  accountId?: string;          // الحساب الدفتري المتأثر (Ledger Account)
  contactId?: string;          // جهة الاتصال المتأثرة (Contact)
  projectId?: string;          // المشروع المتأثر
  // تفاصيل إضافية
  attachment?: string;
  notes?: string;
  // مصدر القيد
  sourceType?: string;
  // العملة الأصلية
  currencyCode?: string;
  exchangeRate?: number;
  // لتحويلات الصناديق
  toFundId?: string;
  createdByName?: string;
  createdAt: Date;
}

// ============= 5. المديونيات (Debts) =============
export type DebtType = 'receivable' | 'payable';
export type DebtStatus = 'pending' | 'partial' | 'paid';

export interface DebtPayment {
  id: string;
  amount: number;
  date: Date;
  fundId: string;
  note?: string;
}

export interface Debt {
  id: string;
  type: DebtType;
  accountId: string;
  accountName: string;
  amount: number;
  remainingAmount: number;
  description: string;
  dueDate?: string;
  status: DebtStatus;
  payments: DebtPayment[];
  createdByName?: string;
  createdAt: Date;
}

// ============= 6. المشاريع (Projects) =============
export type ProjectStatus = 'active' | 'completed' | 'paused' | 'cancelled';

export interface Project {
  id: string;
  name: string;
  description?: string;
  clientId?: string;
  clientName?: string;
  vendorId?: string;
  vendorName?: string;
  contractValue: number;       // قيمة العقد
  expenses: number;            // المصروفات
  receivedAmount: number;      // المبلغ المستلم
  commission: number;          // العمولة
  currencyDifference: number;  // فرق العملة
  profit: number;              // الربح = قيمة العقد - المصروفات + العمولة + فرق العملة
  status: ProjectStatus;
  startDate?: string;
  endDate?: string;
  notes?: string;
  attachments?: string[];
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============= 7. الإحصائيات والتقارير =============
export interface FinanceStats {
  // السيولة
  totalLiquidity: number;        // إجمالي أرصدة الصناديق
  // الأرباح
  totalExpenses: number;         // إجمالي المصروفات العامة
  netCompanyProfit: number;      // صافي ربح الشركة
  // المديونيات
  totalReceivables: number;      // إجمالي المستحقات (لنا)
  totalPayables: number;         // إجمالي الالتزامات (علينا)
  // التغيرات
  liquidityChange: number;
  profitChange: number;
}

export interface ProjectStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  expectedProfit: number;
  realizedProfit: number;
}

// ============= 8. خيارات القوائم المنسدلة =============
export interface FundOption {
  id: string;
  name: string;
  type: FundType;
  balance: number;
}

export interface AccountOption {
  id: string;
  name: string;
  type: LedgerAccountType;
  balance: number; // debit - credit
  phone?: string;
}

// ============= 8. بيانات المخططات =============
export interface ChartData {
  label: string;
  value: number;
  color?: string;
}

export interface TrendData {
  month: string;
  income: number;
  expense: number;
  balance: number;
}

// ============= 9. السندات =============
export interface Voucher {
  id: string;
  type: 'receipt' | 'payment';
  transactionId: string;
  amount: number;
  date: string;
  fromEntity: string;
  toEntity: string;
  description: string;
  createdAt: Date;
}

// ============= 10. النسخ الاحتياطي =============
export interface BackupData {
  funds: Fund[];
  accounts: LedgerAccount[];
  transactions: Transaction[];
  debts: Debt[];
  containers?: Container[];
  shipments?: Shipment[];
  exportedAt: Date;
  version: string;
}

// ============= 11. نظام الشحن (Shipping System) =============
export type ContainerType = '20ft' | '40ft' | '40hc';
export type ContainerStatus = 'loading' | 'shipped' | 'arrived' | 'cleared' | 'delivered';
export type GoodsCategory = 'clothes' | 'machines' | 'food' | 'electronics' | 'furniture' | 'other';
export type ShipmentPaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface Container {
  id: string;
  containerNumber: string;           // رقم الحاوية
  type: ContainerType;               // نوع الحاوية
  capacity: number;                  // السعة الكلية CBM
  usedCapacity: number;              // المستخدم CBM
  route: string;                     // المسار (من - إلى)
  originCountry?: string;            // بلد المنشأ
  destinationCountry?: string;       // بلد الوصول
  containerPrice: number;            // سعر الحاوية
  shippingCost: number;              // تكلفة الشحن الإجمالية
  customsCost: number;               // تكلفة الجمارك
  portCost: number;                  // مصاريف الميناء
  glassFees: number;                 // رسوم الزجاج
  otherCosts: number;                // مصاريف أخرى
  totalCost: number;                 // إجمالي التكاليف
  totalRevenue: number;              // إجمالي الإيرادات (من الشحنات)
  profit: number;                    // الربح = الإيرادات - التكاليف
  status: ContainerStatus;
  isManullyClosed: boolean;          // إقفال يدوي
  departureDate?: string;
  arrivalDate?: string;
  clearanceDate?: string;            // تاريخ التخليص
  rentalDate?: string;               // تاريخ الإيجار
  shippingAgentId?: string;          // وكيل الشحن
  notes?: string;
  attachments?: string[];
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Shipment {
  id: string;
  containerId: string;               // الحاوية الأم
  clientId?: string;                 // العميل (مرتبط بالحسابات الدفترية)
  clientName: string;                // اسم العميل
  goodsType: string;                 // نوع البضاعة
  // الأبعاد
  length: number;                    // الطول (متر)
  width: number;                     // العرض (متر)
  height: number;                    // الارتفاع (متر)
  cbm: number;                       // الحجم المحسوب CBM
  quantity: number;                  // عدد الطرود/الوحدات
  weight: number;                    // الوزن
  // التكاليف والإيرادات
  pricePerMeter: number;             // سعر المتر المكعب
  contractPrice: number;             // سعر المقاولة = CBM × سعر المتر
  amountPaid: number;                // المبلغ المستلم
  remainingAmount: number;           // المتبقي (الاسم الموحد)
  paymentStatus: ShipmentPaymentStatus;
  // تفاصيل إضافية
  trackingNumber?: string;
  notes?: string;
  attachments?: string[];
  payments: ShipmentPayment[];
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShipmentPayment {
  id: string;
  amount: number;
  date: Date;
  fundId?: string;
  note?: string;
}

export interface ShippingStats {
  totalContainers: number;
  activeContainers: number;          // الحاويات النشطة
  totalShipments: number;
  totalRevenue: number;
  totalCosts: number;
  totalProfit: number;
  totalReceivables: number;          // المستحقات من الشحنات
  capacityUtilization: number;       // نسبة استخدام السعة
}

// ============= أنواع قديمة للتوافقية =============
// سيتم إزالتها لاحقاً
export type AccountType = 'main' | 'project' | 'general';
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  totalIncome: number;
  totalExpense: number;
  linkedIndividuals: string[];
  mainIndividualId?: string;
  createdAt: Date;
}

export interface Individual {
  id: string;
  name: string;
  role: string;
  phone?: string;
  email?: string;
  notes?: string;
  totalIncome: number;
  totalExpense: number;
  createdAt: Date;
}

export interface EntityOption {
  id: string;
  name: string;
  type: 'account' | 'individual' | 'fund' | 'ledger';
  balance?: number;
}
