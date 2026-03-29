import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Loader2, Building2, Users, Shield, LogOut,
  CheckCircle2, XCircle, Clock, Ban, Crown,
  Search, RefreshCw, Plus, UserPlus, Eye, Trash2
} from 'lucide-react';
import { CreateCompanyDialog } from '@/components/admin/CreateCompanyDialog';
import { AddUserToCompanyDialog } from '@/components/admin/AddUserToCompanyDialog';
import { CompanyDetailsDialog } from '@/components/admin/CompanyDetailsDialog';

interface CompanyRow {
  id: string;
  name: string;
  status: string;
  plan: string;
  max_users: number;
  owner_user_id: string;
  created_at: string;
  subscription_expires_at: string | null;
  owner_name?: string;
  user_count?: number;
}

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  active: { label: 'نشط', icon: CheckCircle2, color: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400' },
  pending: { label: 'بانتظار التفعيل', icon: Clock, color: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400' },
  suspended: { label: 'معلّق', icon: Ban, color: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { label: 'ملغي', icon: XCircle, color: 'bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-900/30 dark:text-gray-400' },
};

const planLabels: Record<string, string> = {
  basic: 'أساسي',
  pro: 'احترافي',
  enterprise: 'مؤسسات',
};

export default function SuperAdmin() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editCompany, setEditCompany] = useState<CompanyRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ status: '', plan: '', max_users: 5 });
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [addUserTarget, setAddUserTarget] = useState<{ id: string; name: string } | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (user) checkAccess();
  }, [user]);

  const checkAccess = async () => {
    const { data } = await supabase
      .from('platform_admins')
      .select('id')
      .eq('user_id', user!.id)
      .maybeSingle();
    setIsPlatformAdmin(!!data);
    if (data) loadCompanies();
    else setLoading(false);
  };

  const loadCompanies = async () => {
    setLoading(true);
    const { data: companiesData } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });

    if (!companiesData) { setLoading(false); return; }

    const ownerIds = companiesData.map(c => c.owner_user_id);
    const companyIds = companiesData.map(c => c.id);

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', ownerIds);

    const { data: roleCounts } = await supabase
      .from('user_roles')
      .select('company_id')
      .in('company_id', companyIds);

    const countMap: Record<string, number> = {};
    roleCounts?.forEach(r => {
      if (r.company_id) countMap[r.company_id] = (countMap[r.company_id] || 0) + 1;
    });

    const merged: CompanyRow[] = companiesData.map(c => ({
      ...c,
      owner_name: profiles?.find(p => p.user_id === c.owner_user_id)?.full_name || 'غير معروف',
      user_count: countMap[c.id] || 0,
    }));

    setCompanies(merged);
    setLoading(false);
  };

  const handleEdit = (company: CompanyRow) => {
    setEditCompany(company);
    setEditForm({ status: company.status, plan: company.plan, max_users: company.max_users });
  };

  const handleSave = async () => {
    if (!editCompany) return;
    setSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({ status: editForm.status, plan: editForm.plan, max_users: editForm.max_users })
      .eq('id', editCompany.id);

    setSaving(false);
    if (error) {
      toast.error('فشل تحديث الشركة');
    } else {
      toast.success('تم تحديث الشركة بنجاح');
      setEditCompany(null);
      loadCompanies();
    }
  };

  const handleDeleteCompany = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Delete all related data: user_roles, then company
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('company_id', deleteTarget.id);

      // Delete user permissions for this company
      await supabase
        .from('user_permissions')
        .delete()
        .eq('company_id', deleteTarget.id);

      // Delete user_roles for this company
      await supabase
        .from('user_roles')
        .delete()
        .eq('company_id', deleteTarget.id);

      // Delete the company
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', deleteTarget.id);

      if (error) throw error;

      toast.success('تم حذف الشركة بنجاح');
      setDeleteTarget(null);
      loadCompanies();
    } catch (err: any) {
      toast.error(err.message || 'فشل حذف الشركة');
    }
    setDeleting(false);
  };

  if (authLoading || isPlatformAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <Card className="max-w-sm">
          <CardContent className="p-6 text-center space-y-3">
            <Shield className="h-12 w-12 mx-auto text-destructive" />
            <h2 className="text-lg font-bold">غير مصرح</h2>
            <p className="text-sm text-muted-foreground">ليس لديك صلاحية الوصول لهذه الصفحة</p>
            <Button variant="outline" onClick={() => window.location.href = '/'}>العودة للرئيسية</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filtered = companies.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return c.name.toLowerCase().includes(s) || c.owner_name?.toLowerCase().includes(s);
    }
    return true;
  });

  const stats = {
    total: companies.length,
    active: companies.filter(c => c.status === 'active').length,
    pending: companies.filter(c => c.status === 'pending').length,
    suspended: companies.filter(c => c.status === 'suspended').length,
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">لوحة تحكم المنصة</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="default" onClick={() => setShowCreateCompany(true)} className="gap-1.5 text-xs">
              <Plus className="h-4 w-4" />
              شركة جديدة
            </Button>
            <Button size="sm" variant="ghost" onClick={signOut} className="gap-1.5 text-muted-foreground">
              <LogOut className="h-4 w-4" />
              خروج
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">إجمالي الشركات</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            <p className="text-xs text-muted-foreground">نشط</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">بانتظار التفعيل</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.suspended}</p>
            <p className="text-xs text-muted-foreground">معلّق</p>
          </CardContent></Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9 h-9 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="pending">بانتظار</SelectItem>
              <SelectItem value="suspended">معلّق</SelectItem>
              <SelectItem value="cancelled">ملغي</SelectItem>
            </SelectContent>
          </Select>
          <Button size="icon" variant="outline" className="h-9 w-9" onClick={loadCompanies}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Companies List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">
            لا توجد شركات
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(company => {
              const sc = statusConfig[company.status] || statusConfig.pending;
              const StatusIcon = sc.icon;
              return (
                <Card key={company.id} className={company.status === 'suspended' || company.status === 'cancelled' ? 'opacity-60' : ''}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm text-foreground">{company.name}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Crown className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{company.owner_name}</span>
                          </div>
                        </div>
                      </div>
                      <Badge className={`text-[10px] ${sc.color}`}>
                        <StatusIcon className="h-3 w-3 ml-1" />
                        {sc.label}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {company.user_count}/{company.max_users} مستخدم
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {planLabels[company.plan] || company.plan}
                        </Badge>
                      </div>
                      <span>{new Date(company.created_at).toLocaleDateString('ar-SA')}</span>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1 h-8 text-xs gap-1"
                        onClick={() => setDetailsTarget({ id: company.id, name: company.name })}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        عرض التفاصيل
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => handleEdit(company)}
                      >
                        إدارة
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1"
                        onClick={() => setAddUserTarget({ id: company.id, name: company.name })}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(company)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Company Dialog */}
      <Dialog open={!!editCompany} onOpenChange={() => setEditCompany(null)}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              إدارة: {editCompany?.name}
            </DialogTitle>
            <DialogDescription className="text-right">
              المالك: {editCompany?.owner_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">حالة الشركة</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">✅ نشط</SelectItem>
                  <SelectItem value="pending">⏳ بانتظار التفعيل</SelectItem>
                  <SelectItem value="suspended">🚫 معلّق</SelectItem>
                  <SelectItem value="cancelled">❌ ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الخطة</Label>
              <Select value={editForm.plan} onValueChange={v => setEditForm(p => ({ ...p, plan: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">أساسي</SelectItem>
                  <SelectItem value="pro">احترافي</SelectItem>
                  <SelectItem value="enterprise">مؤسسات</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الحد الأقصى للمستخدمين</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={editForm.max_users}
                onChange={e => setEditForm(p => ({ ...p, max_users: parseInt(e.target.value) || 5 }))}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2 mt-2">
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              حفظ
            </Button>
            <Button variant="outline" onClick={() => setEditCompany(null)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Company Dialog */}
      <CreateCompanyDialog
        open={showCreateCompany}
        onOpenChange={setShowCreateCompany}
        onSuccess={loadCompanies}
      />

      {/* Add User to Company Dialog */}
      {addUserTarget && (
        <AddUserToCompanyDialog
          open={!!addUserTarget}
          onOpenChange={(open) => !open && setAddUserTarget(null)}
          companyId={addUserTarget.id}
          companyName={addUserTarget.name}
          onSuccess={loadCompanies}
        />
      )}

      {/* Company Details Dialog */}
      {detailsTarget && (
        <CompanyDetailsDialog
          open={!!detailsTarget}
          onOpenChange={(open) => !open && setDetailsTarget(null)}
          companyId={detailsTarget.id}
          companyName={detailsTarget.name}
          onRefresh={loadCompanies}
        />
      )}

      {/* Delete Company Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-right text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              حذف الشركة
            </DialogTitle>
            <DialogDescription className="text-right">
              هل أنت متأكد من حذف شركة <strong>{deleteTarget?.name}</strong> وجميع بياناتها؟
              <br /><br />
              <span className="text-destructive font-semibold">⚠️ هذا الإجراء لا يمكن التراجع عنه وسيتم حذف جميع المستخدمين والأدوار المرتبطة.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse gap-2 mt-2">
            <Button variant="destructive" onClick={handleDeleteCompany} disabled={deleting} className="gap-1.5">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              تأكيد الحذف
            </Button>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
