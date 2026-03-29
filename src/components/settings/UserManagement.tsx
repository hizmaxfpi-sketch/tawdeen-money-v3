import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Crown, ShieldCheck, Shield, Eye, Truck, UserPlus, UserX, UserCheck, ArrowRightLeft, Trash2, Mail, Settings2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { PermissionsEditor } from '@/components/admin/PermissionsEditor';

type AppRole = 'owner' | 'admin' | 'accountant' | 'shipping_staff' | 'viewer';

interface UserWithRole {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  role_id: string;
  is_active: boolean;
}

const roleLabels: Record<AppRole, string> = {
  owner: 'مالك',
  admin: 'مدير',
  accountant: 'محاسب',
  shipping_staff: 'عمليات',
  viewer: 'مشاهد',
};

const roleIcons: Record<AppRole, any> = {
  owner: Crown,
  admin: ShieldCheck,
  accountant: Shield,
  shipping_staff: Truck,
  viewer: Eye,
};

const roleColors: Record<AppRole, string> = {
  owner: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  accountant: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  shipping_staff: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  viewer: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
};

const roleBadgeColors: Record<AppRole, string> = {
  owner: 'bg-purple-500 text-white border-purple-500',
  admin: 'bg-red-500 text-white border-red-500',
  accountant: 'bg-blue-500 text-white border-blue-500',
  shipping_staff: 'bg-amber-500 text-white border-amber-500',
  viewer: 'bg-gray-400 text-white border-gray-400',
};

export function UserManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<AppRole>('viewer');
  const [companyOwnerId, setCompanyOwnerId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', fullName: '', role: 'viewer' as AppRole });
  const [transferTarget, setTransferTarget] = useState<UserWithRole | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserWithRole | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [permTarget, setPermTarget] = useState<UserWithRole | null>(null);
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);

  const isOwner = companyOwnerId === user?.id;
  const isAdmin = myRole === 'admin' || myRole === 'owner';

  useEffect(() => {
    loadUsers();
  }, [user]);

  const loadUsers = async () => {
    if (!user) return;
    setLoading(true);

    const { data: myRoleData } = await supabase
      .from('user_roles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .maybeSingle();
    
    setMyRole((myRoleData?.role as AppRole) || 'viewer');
    setMyCompanyId(myRoleData?.company_id || null);

    if (myRoleData?.company_id) {
      const { data: companyData } = await supabase
        .from('companies')
        .select('owner_user_id')
        .eq('id', myRoleData.company_id)
        .maybeSingle();
      setCompanyOwnerId(companyData?.owner_user_id || null);
    }

    const canSeeEmails = myRoleData?.role === 'admin' || myRoleData?.role === 'owner';

    if (canSeeEmails) {
      // Use edge function to get full user data with emails
      try {
        const { data, error } = await supabase.functions.invoke('get-company-users', {
          body: { companyId: myRoleData?.company_id },
        });

        if (!error && data?.users) {
          const merged: UserWithRole[] = data.users.map((u: any) => ({
            user_id: u.user_id,
            role: u.role as AppRole,
            role_id: u.role_id,
            is_active: u.is_active ?? true,
            full_name: u.full_name || 'مستخدم',
            email: u.email || null,
          }));

          const order: AppRole[] = ['owner', 'admin', 'accountant', 'shipping_staff', 'viewer'];
          merged.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));

          setUsers(merged);
          setLoading(false);
          return;
        }
      } catch {
        // Fallback to basic loading
      }
    }

    // Fallback: basic loading without emails
    const { data: roles } = await supabase
      .from('user_roles')
      .select('id, user_id, role, is_active, company_id')
      .eq('company_id', myRoleData?.company_id || '');
    
    if (!roles) { setLoading(false); return; }

    const userIds = roles.map(r => r.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', userIds);

    const merged: UserWithRole[] = roles.map(r => {
      const profile = profiles?.find(p => p.user_id === r.user_id);
      return {
        user_id: r.user_id,
        role: r.role as AppRole,
        role_id: r.id,
        is_active: r.is_active ?? true,
        full_name: profile?.full_name || 'مستخدم',
        email: r.user_id === user.id ? user.email || null : null,
      };
    });

    const order: AppRole[] = ['owner', 'admin', 'accountant', 'shipping_staff', 'viewer'];
    merged.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));

    setUsers(merged);
    setLoading(false);
  };

  const handleRoleChange = async (roleId: string, targetUserId: string, newRole: AppRole) => {
    if (newRole === 'owner') return;
    if (targetUserId === user?.id) {
      toast.error('لا يمكنك تغيير صلاحيتك بنفسك');
      return;
    }
    setUpdatingId(roleId);
    const { error } = await supabase
      .from('user_roles')
      .update({ role: newRole })
      .eq('id', roleId);
    
    setUpdatingId(null);
    if (error) {
      toast.error('فشل تحديث الصلاحية');
    } else {
      toast.success('تم تحديث الصلاحية');
      loadUsers();
    }
  };

  const handleToggleActive = async (roleId: string, targetUserId: string, currentActive: boolean) => {
    if (targetUserId === user?.id) {
      toast.error('لا يمكنك تعطيل حسابك بنفسك');
      return;
    }
    if (targetUserId === companyOwnerId) {
      toast.error('لا يمكن تعطيل حساب المالك');
      return;
    }
    setUpdatingId(roleId);
    const { error } = await supabase
      .from('user_roles')
      .update({ is_active: !currentActive })
      .eq('id', roleId);
    
    setUpdatingId(null);
    if (error) {
      toast.error('فشل تحديث الحالة');
    } else {
      toast.success(currentActive ? 'تم تعطيل المستخدم' : 'تم تفعيل المستخدم');
      loadUsers();
    }
  };

  const handleTransferOwnership = async () => {
    if (!transferTarget || !user) return;
    setUpdatingId(transferTarget.role_id);
    
    const { data: myRoleData } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (myRoleData?.company_id) {
      const { error: companyErr } = await supabase
        .from('companies')
        .update({ owner_user_id: transferTarget.user_id })
        .eq('id', myRoleData.company_id);
      
      if (companyErr) {
        toast.error('فشل نقل الملكية');
        setUpdatingId(null);
        setTransferTarget(null);
        return;
      }
    }

    await supabase
      .from('user_roles')
      .update({ role: 'admin' })
      .eq('user_id', user.id);
    
    await supabase
      .from('user_roles')
      .update({ role: 'owner' })
      .eq('id', transferTarget.role_id);
    
    setUpdatingId(null);
    setTransferTarget(null);
    toast.success('تم نقل الملكية بنجاح');
    loadUsers();
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeletingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { targetUserId: deleteTarget.user_id, action: 'delete' },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('تم حذف المستخدم بنجاح');
      setDeleteTarget(null);
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'فشل حذف المستخدم');
    }
    setDeletingUser(false);
  };

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.password) {
      toast.error('البريد الإلكتروني وكلمة المرور مطلوبان');
      return;
    }
    if (newUser.password.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    setAddingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: newUser.email,
          password: newUser.password,
          fullName: newUser.fullName || newUser.email,
          role: newUser.role === 'owner' ? 'admin' : newUser.role,
        },
      });

      if (error) {
        const message = await (error as any).context?.json?.().then((v: any) => v?.error).catch(() => null);
        throw new Error(message || error.message || 'فشل إضافة المستخدم');
      }
      if (data?.error) throw new Error(data.error);

      toast.success(data?.reused_existing_user ? 'تم ربط المستخدم الحالي بالشركة بنجاح' : 'تم إضافة المستخدم بنجاح');
      setShowAddDialog(false);
      setNewUser({ email: '', password: '', fullName: '', role: 'viewer' });
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'فشل إضافة المستخدم');
    }
    setAddingUser(false);
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {isAdmin ? `إدارة المستخدمين والصلاحيات (${users.length} مستخدم)` : 'يمكنك مشاهدة المستخدمين فقط.'}
        </p>
        {isAdmin && (
          <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => setShowAddDialog(true)}>
            <UserPlus className="h-3.5 w-3.5" />
            إضافة مستخدم
          </Button>
        )}
      </div>

      {users.map(u => {
        const Icon = roleIcons[u.role];
        const isSelf = u.user_id === user?.id;
        const isCompanyOwner = u.user_id === companyOwnerId;
        return (
          <Card key={u.role_id} className={!u.is_active ? 'opacity-50' : ''}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`p-1.5 rounded-full shrink-0 ${roleColors[u.role]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      {u.full_name}
                      {isSelf && <span className="text-xs text-muted-foreground">(أنت)</span>}
                    </p>
                    {u.email && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 truncate" dir="ltr">
                        <Mail className="h-2.5 w-2.5 shrink-0" />
                        {u.email}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isCompanyOwner && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-purple-500 text-white border-purple-500">
                      <Crown className="h-2.5 w-2.5 ml-0.5" />
                      مالك
                    </Badge>
                  )}
                  <Badge className={`text-[10px] px-2 py-0.5 ${roleBadgeColors[u.role]}`}>
                    {roleLabels[u.role]}
                  </Badge>
                </div>
              </div>

              {isAdmin && !isSelf && !isCompanyOwner && (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <Select
                      value={u.role}
                      onValueChange={(val) => handleRoleChange(u.role_id, u.user_id, val as AppRole)}
                      disabled={updatingId === u.role_id}
                    >
                      <SelectTrigger className="w-24 h-7 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">مدير</SelectItem>
                        <SelectItem value="accountant">محاسب</SelectItem>
                        <SelectItem value="shipping_staff">عمليات</SelectItem>
                        <SelectItem value="viewer">مشاهد</SelectItem>
                      </SelectContent>
                    </Select>

                    {isOwner && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-purple-500 hover:text-purple-700"
                        title="نقل الملكية"
                        onClick={() => setTransferTarget(u)}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-primary hover:text-primary/80"
                      title="إدارة الصلاحيات"
                      onClick={() => setPermTarget(u)}
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive/80"
                      title="حذف المستخدم"
                      onClick={() => setDeleteTarget(u)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {u.is_active ? (
                      <UserCheck className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <UserX className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <Switch
                      checked={u.is_active}
                      onCheckedChange={() => handleToggleActive(u.role_id, u.user_id, u.is_active)}
                      disabled={updatingId === u.role_id}
                      className="scale-75"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-right">إضافة مستخدم جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">الاسم الكامل</Label>
              <Input value={newUser.fullName} onChange={e => setNewUser(prev => ({ ...prev, fullName: e.target.value }))} placeholder="اسم المستخدم" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">البريد الإلكتروني *</Label>
              <Input type="email" value={newUser.email} onChange={e => setNewUser(prev => ({ ...prev, email: e.target.value }))} placeholder="user@example.com" className="h-9 text-sm" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">كلمة المرور *</Label>
              <Input type="password" value={newUser.password} onChange={e => setNewUser(prev => ({ ...prev, password: e.target.value }))} placeholder="6 أحرف على الأقل" className="h-9 text-sm" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الصلاحية</Label>
              <Select value={newUser.role} onValueChange={(val) => setNewUser(prev => ({ ...prev, role: val as AppRole }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">مدير</SelectItem>
                  <SelectItem value="accountant">محاسب</SelectItem>
                  <SelectItem value="shipping_staff">عمليات</SelectItem>
                  <SelectItem value="viewer">مشاهد</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2 mt-2">
            <Button onClick={handleAddUser} disabled={addingUser} className="gap-1.5">
              {addingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              إضافة
            </Button>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-right text-destructive">حذف مستخدم</DialogTitle>
            <DialogDescription className="text-right">
              هل أنت متأكد من حذف المستخدم <strong>{deleteTarget?.full_name}</strong>؟
              <br /><br />
              <span className="text-destructive font-semibold">⚠️ سيتم حذف الحساب نهائياً ولا يمكن استرجاعه.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse gap-2 mt-2">
            <Button variant="destructive" onClick={handleDeleteUser} disabled={deletingUser} className="gap-1.5">
              {deletingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              تأكيد الحذف
            </Button>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Ownership Dialog */}
      <Dialog open={!!transferTarget} onOpenChange={() => setTransferTarget(null)}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-right text-destructive">نقل الملكية</DialogTitle>
            <DialogDescription className="text-right">
              هل أنت متأكد من نقل ملكية النظام إلى <strong>{transferTarget?.full_name}</strong>؟
              <br />ستتحول صلاحيتك إلى مدير.
              <br /><br />
              <span className="text-destructive font-semibold">⚠️ هذا الإجراء لا يمكن التراجع عنه إلا من المالك الجديد.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse gap-2 mt-2">
            <Button variant="destructive" onClick={handleTransferOwnership} disabled={updatingId === transferTarget?.role_id}>
              {updatingId === transferTarget?.role_id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تأكيد النقل'}
            </Button>
            <Button variant="outline" onClick={() => setTransferTarget(null)}>إلغاء</Button>
          </DialogFooter>
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
            <DialogDescription className="text-right">
              تحديد الصلاحيات التفصيلية لهذا المستخدم
            </DialogDescription>
          </DialogHeader>
          {permTarget && myCompanyId && (
            <PermissionsEditor
              userId={permTarget.user_id}
              companyId={myCompanyId}
              userRole={permTarget.role}
              onSaved={() => setPermTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
