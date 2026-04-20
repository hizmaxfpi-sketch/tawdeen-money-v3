import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Database, Download, Upload, Cloud, RefreshCw, 
  AlertCircle, HardDrive, Clock, Loader2, CheckCircle2, XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { GoogleDriveBackup } from './GoogleDriveBackup';
import { AutoBackupCard } from './AutoBackupCard';

interface BackupSectionProps {
  onExportData: () => Promise<object> | object;
  onImportData?: (data: any) => Promise<any> | void;
}

export function BackupSection({ onExportData, onImportData }: BackupSectionProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [lastBackup, setLastBackup] = useState<Date | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJSON = async () => {
    setIsExporting(true);
    try {
      const data = await onExportData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const fileName = `smart-budget-backup-${new Date().toISOString().split('T')[0]}.json`;

      // Mobile-compatible download
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        try {
          const file = new File([blob], fileName, { type: 'application/json' });
          await navigator.share({ files: [file], title: 'نسخة احتياطية' });
          setLastBackup(new Date());
          toast.success('تم مشاركة النسخة الاحتياطية بنجاح');
          return;
        } catch (shareErr) {
          // Fall through to standard download if share fails/cancelled
          if ((shareErr as any)?.name === 'AbortError') {
            setIsExporting(false);
            return;
          }
        }
      }

      // Standard download approach
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Cleanup after a delay for mobile browsers
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
      
      setLastBackup(new Date());
      toast.success('تم تصدير النسخة الاحتياطية بنجاح');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('حدث خطأ أثناء تصدير البيانات');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportJSON = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportData) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        toast.error('الملف غير صالح - يجب أن يكون ملف JSON');
        setIsImporting(false);
        return;
      }

      // Validate backup structure
      if (!data.contacts && !data.funds && !data.transactions && !data.debts && !data.projects) {
        toast.error('ملف النسخة الاحتياطية لا يحتوي على بيانات صالحة');
        setIsImporting(false);
        return;
      }

      await onImportData(data);
      toast.success('تم استيراد البيانات بنجاح');
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error('حدث خطأ أثناء استيراد البيانات: ' + (error?.message || 'خطأ غير معروف'));
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getBackupData = async () => {
    try {
      return await onExportData();
    } catch {
      return null;
    }
  };

  const formatLastBackup = () => {
    if (!lastBackup) return 'لم يتم النسخ بعد';
    const now = new Date();
    const diff = now.getTime() - lastBackup.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    return lastBackup.toLocaleDateString('ar-SA');
  };

  return (
    <div className="space-y-3">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* النسخ الاحتياطي التلقائي */}
      <AutoBackupCard exportData={onExportData} />

      {/* Google Drive Integration */}
      <GoogleDriveBackup 
        getBackupData={getBackupData}
        onImportData={onImportData}
      />

      {/* النسخ الاحتياطي اليدوي */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-border">
          <CardHeader className="p-3 pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-sm">النسخ الاحتياطي المحلي</CardTitle>
                <CardDescription className="text-[10px]">تصدير واستيراد البيانات على جهازك</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2">
            {lastBackup && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Clock className="h-3 w-3" />
                <span>آخر نسخة: {formatLastBackup()}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline" 
                onClick={handleExportJSON}
                disabled={isExporting}
                className="gap-1.5 h-10 text-xs"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <div className="text-right">
                  <p className="font-medium">{isExporting ? 'جاري التصدير...' : 'تصدير البيانات'}</p>
                  <p className="text-[9px] text-muted-foreground">JSON</p>
                </div>
              </Button>
              
              <Button 
                variant="outline" 
                onClick={handleImportJSON}
                disabled={isImporting || !onImportData}
                className="gap-1.5 h-10 text-xs"
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <div className="text-right">
                  <p className="font-medium">{isImporting ? 'جاري الاستيراد...' : 'استيراد البيانات'}</p>
                  <p className="text-[9px] text-muted-foreground">من ملف</p>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* تحذير */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900"
      >
        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-xs text-amber-800 dark:text-amber-200">
          <p className="font-medium mb-1">ملاحظة مهمة</p>
          <p className="text-amber-700 dark:text-amber-300">
            يُنصح بتصدير نسخة احتياطية بشكل دوري. يمكنك حفظها على Google Drive لضمان سلامة بياناتك.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
