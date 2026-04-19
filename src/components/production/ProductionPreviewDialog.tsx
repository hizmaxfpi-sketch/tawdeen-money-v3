import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, FileText } from 'lucide-react';
import type { ProductionMaterial, ProductionProduct, ProductionService } from '@/hooks/useProduction';

export type PreviewKind = 'materials' | 'products' | 'services' | 'sales';

export interface SaleRowPreview {
  id: string;
  date: string;
  source_type: 'product' | 'material';
  itemName: string;
  contactName?: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  cost_at_sale: number;
  services_total: number;
  expenses_total: number;
  profit: number;
  paid_amount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: PreviewKind;
  materials?: ProductionMaterial[];
  products?: ProductionProduct[];
  services?: ProductionService[];
  sales?: SaleRowPreview[];
}

const TITLES: Record<PreviewKind, string> = {
  materials: 'معاينة المواد الخام',
  products: 'معاينة المنتجات الجاهزة',
  services: 'معاينة الخدمات',
  sales: 'معاينة المبيعات',
};

const UNIT_LABEL: Record<string, string> = {
  piece: 'قطعة', hour: 'ساعة', day: 'يوم', meter: 'متر', custom: 'مخصص',
};

export function ProductionPreviewDialog({ open, onOpenChange, kind, materials = [], products = [], services = [], sales = [] }: Props) {
  const data = useMemo(() => {
    switch (kind) {
      case 'materials': {
        const totalValue = materials.reduce((s, m) => s + m.quantity * m.avg_cost, 0);
        return { count: materials.length, totalValue };
      }
      case 'products': {
        const totalValue = products.reduce((s, p) => s + p.quantity * p.unit_cost, 0);
        const totalSellValue = products.reduce((s, p) => s + p.quantity * p.sell_price, 0);
        return { count: products.length, totalValue, totalSellValue };
      }
      case 'services':
        return { count: services.length };
      case 'sales': {
        const totalSales = sales.reduce((s, x) => s + x.total_amount, 0);
        const totalCost = sales.reduce((s, x) => s + x.cost_at_sale, 0);
        const totalProfit = sales.reduce((s, x) => s + x.profit, 0);
        const totalPaid = sales.reduce((s, x) => s + x.paid_amount, 0);
        return { count: sales.length, totalSales, totalCost, totalProfit, totalPaid };
      }
    }
  }, [kind, materials, products, services, sales]);

  const handlePrint = () => {
    const node = document.getElementById('production-preview-content');
    if (!node) return;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${TITLES[kind]}</title>
      <style>
        body{font-family:'Segoe UI',Tahoma,sans-serif;padding:24px;color:#0f172a}
        h2{margin:0 0 12px;border-bottom:2px solid #0ea5e9;padding-bottom:8px}
        table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
        th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:right}
        th{background:#f1f5f9;font-weight:700}
        tfoot td{background:#fef3c7;font-weight:700}
        .summary{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}
        .stat{flex:1;min-width:140px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px}
        .stat .label{font-size:11px;color:#64748b}
        .stat .value{font-size:16px;font-weight:700;margin-top:4px}
      </style></head><body>${node.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><FileText className="h-4 w-4" />{TITLES[kind]}</span>
            <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1">
              <Printer className="h-3.5 w-3.5" /> طباعة / PDF
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div id="production-preview-content">
          <h2>{TITLES[kind]} — {new Date().toLocaleDateString('en-CA')}</h2>

          {/* Summary cards */}
          <div className="summary grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <div className="stat rounded-md bg-muted p-2 border border-border">
              <div className="label text-[10px] text-muted-foreground">العدد</div>
              <div className="value text-sm font-bold">{(data as any).count}</div>
            </div>
            {kind === 'materials' && (
              <div className="stat rounded-md bg-muted p-2 border border-border">
                <div className="label text-[10px] text-muted-foreground">قيمة المخزون</div>
                <div className="value text-sm font-bold">${(data as any).totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
              </div>
            )}
            {kind === 'products' && (
              <>
                <div className="stat rounded-md bg-muted p-2 border border-border">
                  <div className="label text-[10px] text-muted-foreground">قيمة المخزون (تكلفة)</div>
                  <div className="value text-sm font-bold">${(data as any).totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                </div>
                <div className="stat rounded-md bg-muted p-2 border border-border">
                  <div className="label text-[10px] text-muted-foreground">قيمة المخزون (بيع)</div>
                  <div className="value text-sm font-bold">${(data as any).totalSellValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                </div>
              </>
            )}
            {kind === 'sales' && (
              <>
                <div className="stat rounded-md bg-muted p-2 border border-border">
                  <div className="label text-[10px] text-muted-foreground">إجمالي المبيعات</div>
                  <div className="value text-sm font-bold">${(data as any).totalSales.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                </div>
                <div className="stat rounded-md bg-muted p-2 border border-border">
                  <div className="label text-[10px] text-muted-foreground">تكلفة المباع</div>
                  <div className="value text-sm font-bold">${(data as any).totalCost.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                </div>
                <div className="stat rounded-md bg-muted p-2 border border-border">
                  <div className="label text-[10px] text-muted-foreground">صافي الربح</div>
                  <div className="value text-sm font-bold">${(data as any).totalProfit.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                </div>
              </>
            )}
          </div>

          {/* Tables */}
          {kind === 'materials' && (
            <table>
              <thead><tr><th>#</th><th>الاسم</th><th>الكود</th><th>الوحدة</th><th>الكمية</th><th>متوسط التكلفة</th><th>القيمة</th></tr></thead>
              <tbody>
                {materials.map((m, i) => (
                  <tr key={m.id}>
                    <td>{i + 1}</td><td>{m.name}</td><td>{m.code || '-'}</td><td>{m.unit}</td>
                    <td>{m.quantity.toLocaleString('en-US')}</td>
                    <td>${m.avg_cost.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    <td>${(m.quantity * m.avg_cost).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={6}>الإجمالي</td><td>${(data as any).totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td></tr></tfoot>
            </table>
          )}

          {kind === 'products' && (
            <table>
              <thead><tr><th>#</th><th>الاسم</th><th>الكود</th><th>الوحدة</th><th>الكمية</th><th>تكلفة الوحدة</th><th>سعر البيع</th><th>قيمة المخزون</th></tr></thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={p.id}>
                    <td>{i + 1}</td><td>{p.name}</td><td>{p.code || '-'}</td><td>{p.unit}</td>
                    <td>{p.quantity.toLocaleString('en-US')}</td>
                    <td>${p.unit_cost.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    <td>${p.sell_price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    <td>${(p.quantity * p.unit_cost).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {kind === 'services' && (
            <table>
              <thead><tr><th>#</th><th>الاسم</th><th>الكود</th><th>الوحدة</th><th>السعر الافتراضي</th></tr></thead>
              <tbody>
                {services.map((s, i) => (
                  <tr key={s.id}>
                    <td>{i + 1}</td><td>{s.name}</td><td>{s.code || '-'}</td>
                    <td>{s.unit_type === 'custom' ? (s.custom_unit || 'مخصص') : (UNIT_LABEL[s.unit_type] || s.unit_type)}</td>
                    <td>${s.default_price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {kind === 'sales' && (
            <table>
              <thead><tr><th>#</th><th>التاريخ</th><th>النوع</th><th>الصنف</th><th>العميل</th><th>الكمية</th><th>الإجمالي</th><th>التكلفة</th><th>المصاريف</th><th>الربح</th><th>المسدد</th></tr></thead>
              <tbody>
                {sales.map((s, i) => (
                  <tr key={s.id}>
                    <td>{i + 1}</td>
                    <td>{s.date}</td>
                    <td>{s.source_type === 'product' ? 'منتج' : 'مادة خام'}</td>
                    <td>{s.itemName}</td>
                    <td>{s.contactName || '-'}</td>
                    <td>{s.quantity}</td>
                    <td>${s.total_amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    <td>${s.cost_at_sale.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    <td>${s.expenses_total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    <td>${s.profit.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    <td>${s.paid_amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6}>الإجماليات</td>
                  <td>${(data as any).totalSales.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td>${(data as any).totalCost.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td colSpan={1}></td>
                  <td>${(data as any).totalProfit.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td>${(data as any).totalPaid.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
