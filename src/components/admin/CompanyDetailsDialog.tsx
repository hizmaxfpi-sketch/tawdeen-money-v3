import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Loader2, Building2, Users, Crown, Mail, Phone, Calendar,
  ShieldCheck, Shield, Eye, Truck, UserX, UserCheck, Trash2, Clock, Settings2,
  MapPin, Save, RefreshCw
} from 'lucide-react';
import { PermissionsEditor } from './PermissionsEditor';
import { CompanyModulesEditor } from './CompanyModulesEditor';

type AppRole = 'owner' | 'admin' | 'accountant' | 'shipping_staff' | 'viewer';

interface CompanyUser {
  user_id: string;
  role_id: string;
  role: AppRole;
  is_active: boolean;
  full_name: string;
  phone: string | null;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
}

interface CompanyInfo {
  id: string;
  name: string;
  status: string;
  plan: string;
  max_users: number;
  owner_user_id: string;
  created_at: string;
  phone?: string;
  email?: string;
  address?: string;
}

const roleLabels: Record<AppRole, string> = {
  owner: 'مالك', admin: 'مدير', accountant: 'محاسب', shipping_staff: 'عمليات', viewer: 'مشاهد',
};

const roleIcons: Record<AppRole, any> = {
  owner: Crown, admin: ShieldCheck, accountant: Shield, shipping_staff: Truck, viewer: Eye,
};

const roleColors: Record<AppRole, string> = {
  owner: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  accountant: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  shipping_staff: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  viewer: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  onRefresh?: () => void;
}

export function CompanyDetailsDialog({ open, onOpenChange, companyId, companyName, onRefresh }: Props) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [permTarget, setPermTarget] = useState<CompanyUser | null>(null);
  const [contactForm, setContactForm] = useState({ phone: '', email: '', address: '' });
  const [savingContact, setSavingContact] = useState(false);

  useEffect(() => {
    if (open && companyId) loadData();
  }, [open, companyId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-company-users', {
        body: { companyId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setUsers(data.users || []);
      setCompany(data.company || null);

      // Load company contact info
      const { data: companyData } = await supabase
        .from('companies')
        .select('phone, email, address')
        .eq('id', companyId)
        .maybeSingle();

      if (companyData) {
        setContactForm({
          phone: companyData.phone || '',
          email: companyData.email || '',
          address: companyData.address || '',
        });
      }
    } catch (err: any) {
      toast.error('فشل تحميل بيانات الشركة');
      console.error(err);
    }
    setLoading(false);
  };

  const handleSaveContact = async () => {
    setSavingContact(true);
    const { error } = await supabase
      .from('companies')
      .update({
        phone: contactForm.phone,
        email: contactForm.email,
        address: contactForm.address,
      })
      .eq('id', companyId);

    setSavingContact(false);
    if (error) {
      toast.error('فشل حفظ معلومات التواصل');
    } else {
      toast.success('تم حفظ معلومات التواصل');
    }
  };

  const handleDeleteUser = async (targetUser: CompanyUser) => {
    if (targetUser.role === 'owner') {
      toast.error('لا يمكن حذف مالك الشركة');
      return;
    }
    setDeletingId(targetUser.user_id);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { targetUserId: targetUser.user_id, action: 'delete' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('تم حذف المستخدم بنجاح');
      loadData();
      onRefresh?.();
    } catch (err: any) {
      toast.error(err.message || 'فشل حذف المستخدم');
    }
    setDeletingId(null);
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatDateTime = (d: string | null) => {
    if (!d) return 'لم يسجل دخول بعد';
    return new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const order: AppRole[] = ['owner', 'admin', 'accountant', 'shipping_staff', 'viewer'];
  const sorted = [...users].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            تفاصيل: {companyName}
          </DialogTitle>
          {company && (
            <DialogDescription className="text-right">
              الخطة: {company.plan} • الحد الأقصى: {company.max_users} مستخدم • تاريخ الإنشاء: {formatDate(company.created_at)}
            </DialogDescription>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Company Contact Info */}
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Phone className="h-4 w-4 text-primary" />
                    معلومات التواصل
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    onClick={handleSaveContact}
                    disabled={savingContact}
                  >
                    {savingContact ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    حفظ
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Input
                      value={contactForm.phone}
                      onChange={e => setContactForm(p => ({ ...p, phone: e.target.value }))}
                      placeholder="رقم الهاتف"
                      className="h-8 text-xs"
                      dir="ltr"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Input
                      value={contactForm.email}
                      onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))}
                      placeholder="البريد الإلكتروني"
                      className="h-8 text-xs"
                      dir="ltr"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Input
                      value={contactForm.address}
                      onChange={e => setContactForm(p => ({ ...p, address: e.target.value }))}
                      placeholder="العنوان"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Enabled Modules */}
            <CompanyModulesEditor companyId={companyId} onRefresh={onRefresh} onSaved={() => onRefresh?.()} />

            {/* Users */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Users className="h-4 w-4 text-primary" />
                المستخدمون ({users.length})
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={loadData}>
                <RefreshCw className="h-3 w-3" />
                تحديث
              </Button>
            </div>

            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">لا يوجد مستخدمون</p>
            ) : (
              sorted.map((u) => {
                const Icon = roleIcons[u.role];
                return (
                  <Card key={u.user_id} className={!u.is_active ? 'opacity-50' : ''}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`p-1.5 rounded-full shrink-0 ${roleColors[u.role]}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                              {u.full_name}
                              {!u.is_active && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 text-destructive border-destructive/30">
                                  معطّل
                                </Badge>
                              )}
                            </p>
                            <Badge className={`text-[10px] px-1.5 py-0 mt-0.5 ${roleColors[u.role]}`}>
                              {roleLabels[u.role]}
                            </Badge>
                          </div>
                        </div>
                        {u.role !== 'owner' && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-primary hover:text-primary/80"
                              onClick={() => setPermTarget(u)}
                              title="إدارة الصلاحيات"
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive/80"
                              onClick={() => handleDeleteUser(u)}
                              disabled={deletingId === u.user_id}
                            >
                              {deletingId === u.user_id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-1 text-[11px] text-muted-foreground pr-9">
                        {u.email && (
                          <div className="flex items-center gap-1.5" dir="ltr">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">{u.email}</span>
                          </div>
                        )}
                        {u.phone && (
                          <div className="flex items-center gap-1.5" dir="ltr">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span>{u.phone}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span>تاريخ الإنشاء: {formatDate(u.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>آخر دخول: {formatDateTime(u.last_sign_in_at)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Permissions Dialog */}
    <Dialog open={!!permTarget} onOpenChange={() => setPermTarget(null)}>
      <DialogContent dir="rtl" className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            صلاحيات: {permTarget?.full_name}
          </DialogTitle>
        </DialogHeader>
        {permTarget && (
          <PermissionsEditor
            userId={permTarget.user_id}
            companyId={companyId}
            userRole={permTarget.role}
            onSaved={() => setPermTarget(null)}
          />
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
