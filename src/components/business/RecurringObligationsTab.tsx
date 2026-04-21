import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Pencil, Trash2, Power, ChevronDown, ChevronUp, CheckCircle2, X, Calendar, Users, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useRecurringObligations, ObligationType, RecurringObligation, ObligationItem, ObligationDraft } from '@/hooks/useRecurringObligations';
import { FundOption, AccountOption } from '@/types/finance';
import { cn } from '@/lib/utils';

const OBLIGATION_TYPES: { value: ObligationType; label: string; category: string; icon: any }[] = [
  { value: 'salary', label: 'رواتب', category: 'salary', icon: Users },
  { value: 'rent', label: 'إيجار', category: 'rent', icon: Receipt },
  { value: 'subscription', label: 'اشتراك/خدمة', category: 'utilities', icon: Receipt },
  { value: 'installment', label: 'قسط', category: 'other_expense', icon: Calendar },
  { value: 'other', label: 'التزام آخر', category: 'business_expense', icon: Receipt },
];

const MONTH_NAMES = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

interface Props {
  fundOptions: FundOption[];
  accountOptions: AccountOption[];
}

export function RecurringObligationsTab({ fundOptions, accountOptions }: Props) {
  const obs = useRecurringObligations();
  const [tab, setTab] = useState<'pending' | 'active' | 'history'>('pending');
  const [showForm, setShowForm] = useState(false);
  const [editingObligation, setEditingObligation] = useState<RecurringObligation | null>(null);
  const [expandedObligation, setExpandedObligation] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<ObligationDraft | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'obligation' | 'draft'; id: string } | null>(null);

  const pendingDrafts = useMemo(() => obs.drafts.filter(d => d.status === 'draft'), [obs.drafts]);
  const postedDrafts = useMemo(() => obs.drafts.filter(d => d.status !== 'draft'), [obs.drafts]);

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={(v: any) => setTab(v)} className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="pending" className="text-xs gap-1">
            مستحق
            {pendingDrafts.length > 0 && <Badge variant="destructive" className="h-4 px-1 text-[9px]">{pendingDrafts.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="active" className="text-xs">الالتزامات</TabsTrigger>
          <TabsTrigger value="history" className="text-xs">السجل</TabsTrigger>
        </TabsList>

        {/* PENDING DRAFTS */}
        <TabsContent value="pending" className="space-y-2 mt-3">
          {pendingDrafts.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-xs text-muted-foreground">
              لا توجد التزامات مستحقة هذا الشهر. ستظهر تلقائياً عند حلول تاريخ الاستحقاق.
            </CardContent></Card>
          ) : (
            pendingDrafts.map(draft => {
              const ob = obs.obligations.find(o => o.id === draft.obligation_id);
              if (!ob) return null;
              const items = obs.draftItems.filter(d => d.draft_id === draft.id);
              return (
                <Card key={draft.id} className="border-amber-500/40 bg-amber-500/5">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm">{ob.name}</CardTitle>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {MONTH_NAMES[draft.period_month - 1]} {draft.period_year} • مستحق {draft.due_date}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[9px]">مسودة</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <div className="flex justify-between items-center bg-background rounded-lg px-2 py-1.5">
                      <span className="text-xs text-muted-foreground">الإجمالي الصافي</span>
                      <span className="text-base font-bold text-expense">${draft.total_amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">{items.length} بند</div>
                    <div className="flex gap-1.5">
                      <Button size="sm" className="flex-1 h-7 text-xs gap-1" onClick={() => setEditingDraft(draft)}>
                        <Pencil className="h-3 w-3" /> مراجعة وتعديل
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => obs.skipDraft(draft.id)}>
                        تخطي
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ACTIVE OBLIGATIONS */}
        <TabsContent value="active" className="space-y-2 mt-3">
          <Button size="sm" className="w-full h-8 gap-1" onClick={() => { setEditingObligation(null); setShowForm(true); }}>
            <Plus className="h-3.5 w-3.5" /> إضافة التزام شهري
          </Button>
          {obs.obligations.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-xs text-muted-foreground">
              لا توجد التزامات. أنشئ التزاماً شهرياً (راتب، إيجار، اشتراك) ليُرحَّل تلقائياً كل شهر.
            </CardContent></Card>
          ) : (
            obs.obligations.map(ob => {
              const items = obs.items.filter(i => i.obligation_id === ob.id && i.is_active);
              const total = items.reduce((s, i) => s + i.base_amount, 0);
              const expanded = expandedObligation === ob.id;
              const typeLabel = OBLIGATION_TYPES.find(t => t.value === ob.obligation_type)?.label || ob.obligation_type;
              return (
                <Card key={ob.id} className={cn(!ob.is_active && 'opacity-60')}>
                  <CardContent className="py-2.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold truncate">{ob.name}</span>
                          <Badge variant="secondary" className="text-[9px]">{typeLabel}</Badge>
                          {!ob.is_active && <Badge variant="outline" className="text-[9px]">متوقف</Badge>}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {items.length} بند • يوم {ob.due_day} من كل شهر • {ob.posted_count} مرحّل
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-expense">${total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                        <p className="text-[9px] text-muted-foreground">شهرياً</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] flex-1"
                        onClick={() => setExpandedObligation(expanded ? null : ob.id)}>
                        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {expanded ? 'إخفاء البنود' : 'عرض البنود'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => obs.updateObligation(ob.id, { is_active: !ob.is_active })}>
                        <Power className={cn('h-3 w-3', ob.is_active ? 'text-income' : 'text-muted-foreground')} />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => { setEditingObligation(ob); setShowForm(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive"
                        onClick={() => setDeleteConfirm({ type: 'obligation', id: ob.id })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    {expanded && (
                      <ItemsManager obligation={ob} items={obs.items.filter(i => i.obligation_id === ob.id)}
                        accountOptions={accountOptions} obs={obs} />
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* HISTORY */}
        <TabsContent value="history" className="space-y-2 mt-3">
          {postedDrafts.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-xs text-muted-foreground">لا يوجد سجل بعد</CardContent></Card>
          ) : (
            postedDrafts.map(d => {
              const ob = obs.obligations.find(o => o.id === d.obligation_id);
              return (
                <Card key={d.id}>
                  <CardContent className="py-2.5 flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-xs font-bold">{ob?.name || 'محذوف'}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {MONTH_NAMES[d.period_month - 1]} {d.period_year}
                        {d.posted_at && ` • رُحّل ${new Date(d.posted_at).toLocaleDateString('en-US')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-expense">${d.total_amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                      <Badge variant={d.status === 'posted' ? 'default' : 'outline'} className="text-[9px]">
                        {d.status === 'posted' ? 'مرحّل' : 'متخطى'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      {/* Obligation Form */}
      {showForm && (
        <ObligationFormDialog
          obligation={editingObligation}
          fundOptions={fundOptions}
          accountOptions={accountOptions}
          obs={obs}
          onClose={() => { setShowForm(false); setEditingObligation(null); }}
        />
      )}

      {/* Draft Edit Dialog */}
      {editingDraft && (
        <DraftEditDialog
          draft={editingDraft}
          obligation={obs.obligations.find(o => o.id === editingDraft.obligation_id)!}
          draftItems={obs.draftItems.filter(d => d.draft_id === editingDraft.id)}
          fundOptions={fundOptions}
          obs={obs}
          onClose={() => setEditingDraft(null)}
        />
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الالتزام وجميع بنوده ومسوداته غير المرحّلة. المعاملات المرحّلة لن تتأثر.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (deleteConfirm?.type === 'obligation') obs.deleteObligation(deleteConfirm.id);
              setDeleteConfirm(null);
            }} className="bg-destructive">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =============== Items Manager (inline expanded) ===============
function ItemsManager({ obligation, items, accountOptions, obs }: {
  obligation: RecurringObligation;
  items: ObligationItem[];
  accountOptions: AccountOption[];
  obs: ReturnType<typeof useRecurringObligations>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ObligationItem | null>(null);

  return (
    <div className="border-t border-border pt-2 space-y-1.5">
      {items.length === 0 ? (
        <p className="text-[10px] text-muted-foreground text-center py-2">لا توجد بنود</p>
      ) : (
        items.map(item => (
          <div key={item.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-2 py-1.5">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{item.name}</p>
              {item.account_id && (
                <p className="text-[9px] text-muted-foreground">
                  {accountOptions.find(a => a.id === item.account_id)?.name || 'حساب'}
                </p>
              )}
            </div>
            <span className="text-xs font-bold mx-2">${item.base_amount.toLocaleString('en-US')}</span>
            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setEditing(item)}>
              <Pencil className="h-2.5 w-2.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" onClick={() => obs.deleteItem(item.id)}>
              <Trash2 className="h-2.5 w-2.5" />
            </Button>
          </div>
        ))
      )}
      <Button size="sm" variant="outline" className="w-full h-6 text-[10px] gap-1" onClick={() => setShowAdd(true)}>
        <Plus className="h-3 w-3" /> إضافة بند
      </Button>

      {(showAdd || editing) && (
        <ItemFormDialog
          obligation={obligation}
          item={editing}
          accountOptions={accountOptions}
          obs={obs}
          onClose={() => { setShowAdd(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// =============== Item Form Dialog ===============
function ItemFormDialog({ obligation, item, accountOptions, obs, onClose }: {
  obligation: RecurringObligation;
  item: ObligationItem | null;
  accountOptions: AccountOption[];
  obs: ReturnType<typeof useRecurringObligations>;
  onClose: () => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [amount, setAmount] = useState(item?.base_amount.toString() || '');
  const [workingDays, setWorkingDays] = useState(item?.working_days.toString() || '30');
  const [accountId, setAccountId] = useState(item?.account_id || '');
  const [notes, setNotes] = useState(item?.notes || '');

  const save = async () => {
    if (!name || !amount) return;
    const payload = {
      name, base_amount: Number(amount), working_days: Number(workingDays) || 30,
      account_id: accountId || null, is_active: true, notes: notes || null,
    };
    if (item) {
      await obs.updateItem(item.id, payload);
    } else {
      await obs.addItem(obligation.id, payload);
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-sm">{item ? 'تعديل بند' : 'إضافة بند'}</DialogTitle></DialogHeader>
        <div className="space-y-2.5">
          <div>
            <Label className="text-xs">الاسم *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-8 text-xs"
              placeholder={obligation.obligation_type === 'salary' ? 'اسم الموظف' : 'اسم البند'} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">المبلغ الأساسي *</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">أيام الدوام/شهر</Label>
              <Input type="number" value={workingDays} onChange={e => setWorkingDays(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          {obligation.obligation_type === 'salary' && (
            <div>
              <Label className="text-xs">حساب دفتري (اختياري)</Label>
              <Select value={accountId || 'none'} onValueChange={v => setAccountId(v === 'none' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="بدون ربط" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">بدون ربط</SelectItem>
                  {accountOptions.map(a => <SelectItem key={a.id} value={a.id} className="text-xs">{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[9px] text-muted-foreground mt-0.5">للربط بحساب الموظف لتتبع السلف</p>
            </div>
          )}
          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="text-xs min-h-[50px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>إلغاء</Button>
          <Button size="sm" onClick={save}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============== Obligation Form Dialog ===============
function ObligationFormDialog({ obligation, fundOptions, accountOptions, obs, onClose }: {
  obligation: RecurringObligation | null;
  fundOptions: FundOption[];
  accountOptions: AccountOption[];
  obs: ReturnType<typeof useRecurringObligations>;
  onClose: () => void;
}) {
  const [name, setName] = useState(obligation?.name || '');
  const [type, setType] = useState<ObligationType>(obligation?.obligation_type || 'salary');
  const [dueDay, setDueDay] = useState((obligation?.due_day || 1).toString());
  const [fundId, setFundId] = useState(obligation?.default_fund_id || '');
  const [startDate, setStartDate] = useState(obligation?.start_date || new Date().toISOString().slice(0, 10));
  const [hasLimit, setHasLimit] = useState(!!obligation?.total_months);
  const [totalMonths, setTotalMonths] = useState(obligation?.total_months?.toString() || '12');
  const [notes, setNotes] = useState(obligation?.notes || '');

  // Quick item entry on creation
  const [quickItems, setQuickItems] = useState<{ name: string; amount: string; accountId: string }[]>([]);
  const [qiName, setQiName] = useState('');
  const [qiAmount, setQiAmount] = useState('');
  const [qiAccount, setQiAccount] = useState('');
  const [saving, setSaving] = useState(false);

  const addQuickItem = () => {
    if (!qiName || !qiAmount) return;
    setQuickItems(prev => [...prev, { name: qiName, amount: qiAmount, accountId: qiAccount }]);
    setQiName(''); setQiAmount(''); setQiAccount('');
  };

  const save = async () => {
    if (!name || saving) return;
    setSaving(true);
    try {
      const typeData = OBLIGATION_TYPES.find(t => t.value === type)!;
      const payload = {
        name, obligation_type: type, category: typeData.category,
        default_fund_id: fundId || null,
        due_day: Math.min(28, Math.max(1, Number(dueDay) || 1)),
        start_date: startDate,
        total_months: hasLimit ? Number(totalMonths) || null : null,
        is_active: obligation?.is_active ?? true,
        notes: notes || null,
      };
      if (obligation) {
        await obs.updateObligation(obligation.id, payload);
      } else {
        const items = quickItems.map(qi => ({
          name: qi.name, base_amount: Number(qi.amount), working_days: 30,
          account_id: qi.accountId || null, is_active: true, notes: null,
        }));
        await obs.addObligation(payload, items);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{obligation ? 'تعديل التزام' : 'التزام شهري جديد'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">النوع *</Label>
            <Select value={type} onValueChange={(v: ObligationType) => setType(v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OBLIGATION_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">اسم الالتزام *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-8 text-xs"
              placeholder={type === 'salary' ? 'رواتب الموظفين' : type === 'rent' ? 'إيجار المكتب' : 'اسم الالتزام'} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">يوم الاستحقاق (1-28) *</Label>
              <Input type="number" min="1" max="28" value={dueDay} onChange={e => setDueDay(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">تاريخ البداية</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs">الصندوق الافتراضي للدفع</Label>
            <Select value={fundId || 'none'} onValueChange={v => setFundId(v === 'none' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر عند الترحيل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">اختر عند الترحيل</SelectItem>
                {fundOptions.map(f => <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between bg-muted/40 rounded-lg p-2">
            <div>
              <Label className="text-xs">مدة محددة</Label>
              <p className="text-[9px] text-muted-foreground">للأقساط فقط - يتوقف بعد عدد معين من الأشهر</p>
            </div>
            <Switch checked={hasLimit} onCheckedChange={setHasLimit} />
          </div>
          {hasLimit && (
            <div>
              <Label className="text-xs">عدد الأشهر</Label>
              <Input type="number" value={totalMonths} onChange={e => setTotalMonths(e.target.value)} className="h-8 text-xs" />
            </div>
          )}

          {/* Quick items only when creating */}
          {!obligation && (
            <div className="border-t border-border pt-2.5 space-y-2">
              <Label className="text-xs font-bold">البنود (اختياري - يمكنك إضافتها لاحقاً)</Label>
              {quickItems.length > 0 && (
                <div className="space-y-1">
                  {quickItems.map((qi, i) => (
                    <div key={i} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1">
                      <span className="text-xs">{qi.name}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold">${qi.amount}</span>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                          onClick={() => setQuickItems(prev => prev.filter((_, idx) => idx !== i))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-[1fr_80px_auto] gap-1">
                <Input placeholder="الاسم" value={qiName} onChange={e => setQiName(e.target.value)} className="h-7 text-xs" />
                <Input type="number" placeholder="مبلغ" value={qiAmount} onChange={e => setQiAmount(e.target.value)} className="h-7 text-xs" />
                <Button size="sm" className="h-7 px-2" onClick={addQuickItem}><Plus className="h-3 w-3" /></Button>
              </div>
              {type === 'salary' && accountOptions.length > 0 && (
                <Select value={qiAccount || 'none'} onValueChange={v => setQiAccount(v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="ربط بحساب (اختياري للبند التالي)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">بدون ربط</SelectItem>
                    {accountOptions.map(a => <SelectItem key={a.id} value={a.id} className="text-xs">{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="text-xs min-h-[50px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button size="sm" onClick={save} disabled={saving || !name}>
            {saving ? 'جاري الحفظ...' : (obligation ? 'تحديث' : 'إنشاء')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============== Draft Edit Dialog (Review monthly amounts) ===============
function DraftEditDialog({ draft, obligation, draftItems, fundOptions, obs, onClose }: {
  draft: ObligationDraft;
  obligation: RecurringObligation;
  draftItems: any[];
  fundOptions: FundOption[];
  obs: ReturnType<typeof useRecurringObligations>;
  onClose: () => void;
}) {
  const [fundId, setFundId] = useState(draft.fund_id || obligation.default_fund_id || '');
  const [postDate, setPostDate] = useState(draft.due_date);
  const [posting, setPosting] = useState(false);

  const total = draftItems.reduce((s, d) => s + (d.net_amount || 0), 0);

  const handlePost = async () => {
    if (!fundId) { return; }
    setPosting(true);
    const ok = await obs.postDraft(draft.id, fundId, postDate);
    setPosting(false);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">{obligation.name} - {MONTH_NAMES[draft.period_month - 1]} {draft.period_year}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {draftItems.map(item => (
            <DraftItemRow key={item.id} item={item} obs={obs} />
          ))}

          {draftItems.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد بنود</p>
          )}

          <div className="bg-primary/10 rounded-lg p-3 border border-primary/30">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold">الإجمالي الصافي</span>
              <span className="text-lg font-bold text-expense">${total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <div>
              <Label className="text-xs">تاريخ الترحيل</Label>
              <Input type="date" value={postDate} onChange={e => setPostDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">الصندوق *</Label>
              <Select value={fundId} onValueChange={setFundId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  {fundOptions.map(f => (
                    <SelectItem key={f.id} value={f.id} className="text-xs">
                      {f.name} (${f.balance.toLocaleString('en-US')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-1">
          <Button variant="outline" size="sm" onClick={onClose}>إغلاق</Button>
          <Button size="sm" onClick={handlePost} disabled={!fundId || posting || total <= 0} className="gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> ترحيل واعتماد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DraftItemRow({ item, obs }: { item: any; obs: ReturnType<typeof useRecurringObligations> }) {
  const [base, setBase] = useState(item.base_amount.toString());
  const [absence, setAbsence] = useState(item.absence_days.toString());
  const [advance, setAdvance] = useState(item.advance_deduction.toString());
  const [bonus, setBonus] = useState(item.bonus.toString());

  const dailyRate = Number(base) / 30;
  const absDeduction = dailyRate * (Number(absence) || 0);
  const net = (Number(base) || 0) - absDeduction - (Number(advance) || 0) + (Number(bonus) || 0);

  const save = () => {
    obs.updateDraftItem(item.id, {
      base_amount: Number(base) || 0,
      absence_days: Number(absence) || 0,
      absence_deduction: absDeduction,
      advance_deduction: Number(advance) || 0,
      bonus: Number(bonus) || 0,
      net_amount: net,
    });
  };

  return (
    <div className="border border-border rounded-lg p-2 space-y-1.5 bg-muted/30">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold">{item.name}</span>
        <span className="text-sm font-bold text-expense">${net.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <div>
          <Label className="text-[9px] text-muted-foreground">الأساسي</Label>
          <Input type="number" value={base} onChange={e => setBase(e.target.value)} onBlur={save} className="h-6 text-[10px] px-1" />
        </div>
        <div>
          <Label className="text-[9px] text-muted-foreground">غياب (يوم)</Label>
          <Input type="number" value={absence} onChange={e => setAbsence(e.target.value)} onBlur={save} className="h-6 text-[10px] px-1" />
        </div>
        <div>
          <Label className="text-[9px] text-muted-foreground">سلفة</Label>
          <Input type="number" value={advance} onChange={e => setAdvance(e.target.value)} onBlur={save} className="h-6 text-[10px] px-1" />
        </div>
        <div>
          <Label className="text-[9px] text-muted-foreground">علاوة</Label>
          <Input type="number" value={bonus} onChange={e => setBonus(e.target.value)} onBlur={save} className="h-6 text-[10px] px-1" />
        </div>
      </div>
      {(Number(absence) > 0 || Number(advance) > 0 || Number(bonus) > 0) && (
        <p className="text-[9px] text-muted-foreground">
          {Number(absence) > 0 && `خصم غياب: $${absDeduction.toFixed(2)} `}
          {Number(advance) > 0 && `• سلفة: $${Number(advance).toFixed(2)} `}
          {Number(bonus) > 0 && `• علاوة: +$${Number(bonus).toFixed(2)}`}
        </p>
      )}
    </div>
  );
}
