import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function ResetSettings() {
  const { user } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (confirmText !== 'تأكيد الحذف') {
      toast.error('يرجى كتابة "تأكيد الحذف" للمتابعة');
      return;
    }
    if (!user) return;

    setResetting(true);
    try {
      // حذف بالترتيب الصحيح لاحترام المفاتيح الأجنبية
      // 1. حذف دفعات الشحن أولاً (تعتمد على الشحنات والصناديق)
      await supabase.from('shipment_payments' as any).delete().eq('user_id', user.id);
      
      // 2. حذف دفعات الديون (تعتمد على الديون والصناديق)
      await supabase.from('debt_payments' as any).delete().eq('user_id', user.id);
      
      // 3. حذف العمليات المالية (تعتمد على الصناديق والحسابات والمشاريع والشحنات)
      await supabase.from('transactions' as any).delete().eq('user_id', user.id);
      
      // 4. حذف الشحنات (تعتمد على الحاويات والحسابات)
      await supabase.from('shipments' as any).delete().eq('user_id', user.id);
      
      // 5. حذف الحاويات (تعتمد على الحسابات)
      await supabase.from('containers' as any).delete().eq('user_id', user.id);
      
      // 6. حذف الديون (تعتمد على الحسابات والمشاريع)
      await supabase.from('debts' as any).delete().eq('user_id', user.id);
      
      // 7. حذف المشاريع (تعتمد على الحسابات)
      await supabase.from('projects' as any).delete().eq('user_id', user.id);
      
      // 8. حذف الحسابات
      await supabase.from('contacts' as any).delete().eq('user_id', user.id);
      
      // 9. حذف البيانات المساعدة
      await supabase.from('currencies' as any).delete().eq('user_id', user.id);
      await supabase.from('activity_log' as any).delete().eq('user_id', user.id);
      await supabase.from('company_settings' as any).delete().eq('user_id', user.id);

      // الاحتفاظ بالصندوق الافتراضي وتصفيره
      const { data: funds } = await supabase.from('funds').select('id').eq('user_id', user.id).order('created_at', { ascending: true });
      if (funds && funds.length > 1) {
        const keepId = funds[0].id;
        await supabase.from('funds').delete().eq('user_id', user.id).neq('id', keepId);
        await supabase.from('funds').update({ balance: 0, name: 'الصندوق النقدي' } as any).eq('id', keepId);
      } else if (funds && funds.length === 1) {
        await supabase.from('funds').update({ balance: 0 } as any).eq('id', funds[0].id);
      }

      toast.success('تم إعادة تهيئة البرنامج بنجاح');
      setConfirmText('');
      window.location.reload();
    } catch (err) {
      toast.error('حدث خطأ أثناء إعادة التهيئة');
    }
    setResetting(false);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>تحذير خطير!</AlertTitle>
        <AlertDescription>
          إعادة التهيئة ستحذف جميع البيانات المالية والشحنات والحاويات والمشاريع والحسابات نهائياً. لا يمكن التراجع عن هذا الإجراء.
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          لتأكيد إعادة التهيئة، اكتب <strong className="text-destructive">"تأكيد الحذف"</strong> في الحقل أدناه:
        </p>
        <Input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder='اكتب "تأكيد الحذف"'
          className="text-center"
        />
        
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              className="w-full gap-2"
              disabled={confirmText !== 'تأكيد الحذف' || resetting}
            >
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              إعادة تهيئة البرنامج
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>هل أنت متأكد تماماً؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم حذف جميع البيانات نهائياً ولا يمكن استرجاعها. هل تريد المتابعة؟
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                نعم، احذف كل شيء
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
