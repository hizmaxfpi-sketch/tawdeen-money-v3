import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, CheckCircle, Clock, Wrench, DollarSign } from 'lucide-react';
import { Asset, AssetPayment, AssetImprovement } from '@/hooks/useAssets';
import { FundOption } from '@/types/finance';
import { cn } from '@/lib/utils';

interface AssetDetailsSheetProps {
  asset: Asset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payments: AssetPayment[];
  improvements: AssetImprovement[];
  fundOptions: FundOption[];
  onPayInstallment: (paymentId: string, fundId?: string) => void;
  onAddImprovement: (data: { assetId: string; name: string; amount: number; fundId?: string; note?: string }) => void;
}

export function AssetDetailsSheet({
  asset, open, onOpenChange, payments, improvements,
  fundOptions, onPayInstallment, onAddImprovement,
}: AssetDetailsSheetProps) {
  const [showAddImprovement, setShowAddImprovement] = useState(false);
  const [improvementForm, setImprovementForm] = useState({ name: '', amount: '', fundId: '', note: '' });

  if (!asset) return null;

  const depPercent = asset.value > 0 ? Math.min(100, (asset.totalDepreciation / asset.value) * 100) : 0;
  const paidPercent = asset.value > 0 ? Math.min(100, (asset.paidAmount / asset.value) * 100) : 0;

  const handleAddImprovement = () => {
    if (!improvementForm.name || !improvementForm.amount) return;
    onAddImprovement({
      assetId: asset.id,
      name: improvementForm.name,
      amount: Number(improvementForm.amount),
      fundId: improvementForm.fundId || undefined,
      note: improvementForm.note || undefined,
    });
    setImprovementForm({ name: '', amount: '', fundId: '', note: '' });
    setShowAddImprovement(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-right">{asset.name}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2">
            <InfoCard label="القيمة الأصلية" value={`$${asset.value.toLocaleString('en-US')}`} />
            <InfoCard label="القيمة الحالية" value={`$${asset.currentValue.toLocaleString('en-US')}`} color="text-primary" />
            <InfoCard label="الإهلاك المجمع" value={`$${asset.totalDepreciation.toLocaleString('en-US')}`} color="text-expense" />
            <InfoCard label="الإهلاك الشهري" value={`$${asset.monthlyDepreciation.toLocaleString('en-US', { maximumFractionDigits: 2 })}`} />
          </div>

          {/* Depreciation Progress */}
          <Card>
            <CardContent className="py-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">نسبة الإهلاك</span>
                <span className="font-bold">{depPercent.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-expense h-2 rounded-full transition-all" style={{ width: `${depPercent}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>تاريخ الشراء: {asset.purchaseDate}</span>
                <span>{asset.depreciationRate}% سنوياً</span>
              </div>
              {asset.depreciationFundId && (
                <p className="text-[10px] text-primary">صندوق التطوير: {fundOptions.find(f => f.id === asset.depreciationFundId)?.name || 'محدد'}</p>
              )}
            </CardContent>
          </Card>

          {/* Payment Info */}
          {asset.paymentType === 'installment' && (
            <Card>
              <CardContent className="py-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold">الأقساط</span>
                  <Badge variant={paidPercent >= 100 ? 'default' : 'secondary'} className="text-[10px]">
                    {paidPercent >= 100 ? 'مسدد بالكامل' : `${paidPercent.toFixed(0)}% مسدد`}
                  </Badge>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div className="bg-primary h-1.5 rounded-full" style={{ width: `${paidPercent}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>المدفوع: ${asset.paidAmount.toLocaleString('en-US')}</span>
                  <span>المتبقي: ${(asset.value - asset.paidAmount).toLocaleString('en-US')}</span>
                </div>

                {payments.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    {payments.map(p => (
                      <div key={p.id} className="flex items-center justify-between bg-muted/50 rounded-lg p-2">
                        <div className="flex items-center gap-2">
                          {p.status === 'paid' ? (
                            <CheckCircle className="h-3.5 w-3.5 text-income" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <div>
                            <p className="text-[10px] font-medium">{p.note || 'قسط'}</p>
                            <p className="text-[9px] text-muted-foreground">{p.dueDate}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold">${p.amount.toLocaleString('en-US')}</span>
                          {p.status === 'pending' && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                              onClick={() => onPayInstallment(p.id)}>
                              سداد
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Improvements */}
          <Card>
            <CardContent className="py-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold flex items-center gap-1">
                  <Wrench className="h-3.5 w-3.5" /> التطويرات
                </span>
                <Dialog open={showAddImprovement} onOpenChange={setShowAddImprovement}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1">
                      <Plus className="h-3 w-3" /> إضافة
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>إضافة تطوير</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>الوصف *</Label>
                        <Input value={improvementForm.name} onChange={e => setImprovementForm(f => ({ ...f, name: e.target.value }))} placeholder="مثل: صيانة شاملة" />
                      </div>
                      <div>
                        <Label>المبلغ *</Label>
                        <Input type="number" value={improvementForm.amount} onChange={e => setImprovementForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
                      </div>
                      <div>
                        <Label>الصندوق</Label>
                        <Select value={improvementForm.fundId} onValueChange={v => setImprovementForm(f => ({ ...f, fundId: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
                          <SelectContent>
                            {fundOptions.map(f => (
                              <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>ملاحظة</Label>
                        <Textarea value={improvementForm.note} onChange={e => setImprovementForm(f => ({ ...f, note: e.target.value }))} rows={2} />
                      </div>
                      <Button onClick={handleAddImprovement} className="w-full">حفظ</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {improvements.length === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center py-2">لا توجد تطويرات</p>
              ) : (
                improvements.map(imp => (
                  <div key={imp.id} className="flex justify-between items-center bg-muted/50 rounded-lg p-2">
                    <div>
                      <p className="text-xs font-medium">{imp.name}</p>
                      <p className="text-[9px] text-muted-foreground">{imp.date}</p>
                    </div>
                    <span className="text-xs font-bold">${imp.amount.toLocaleString('en-US')}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          {asset.notes && (
            <Card>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground">{asset.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2.5">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm font-bold", color)}>{value}</p>
    </div>
  );
}
