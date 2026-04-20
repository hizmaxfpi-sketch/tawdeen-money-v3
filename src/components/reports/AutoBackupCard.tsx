import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Zap, Download, Trash2, RefreshCw, Loader2, CheckCircle2, Smartphone, HardDrive,
} from 'lucide-react';
import {
  listBackups,
  deleteBackup,
  downloadBackupFile,
  BackupRecord,
} from '@/lib/autoBackupStore';
import { useAutoBackup } from '@/hooks/useAutoBackup';
import { toast } from 'sonner';

interface AutoBackupCardProps {
  exportData: () => Promise<any> | any;
}

export function AutoBackupCard({ exportData }: AutoBackupCardProps) {
  const wrappedExport = async () => await exportData();
  const { settings, updateSettings, runBackupNow } = useAutoBackup({ exportData: wrappedExport });
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listBackups();
      setBackups(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, []);

  const handleManualRun = async () => {
    setRunning(true);
    try {
      await runBackupNow();
      await refresh();
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteBackup(id);
    toast.success('تم حذف النسخة');
    await refresh();
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const diffMin = Math.floor((Date.now() - ts) / 60000);
    if (diffMin < 1) return 'الآن';
    if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
    const hours = Math.floor(diffMin / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `منذ ${days} يوم`;
    return d.toLocaleDateString('ar-SA');
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-sm flex items-center gap-2">
                النسخ الاحتياطي التلقائي
                {settings.enabled && (
                  <Badge variant="default" className="text-[9px] h-4 px-1.5 gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" /> نشط
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-[10px]">
                ينشئ نسخة احتياطية تلقائياً عند كل تغيير مهم
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          {/* الإعدادات */}
          <div className="space-y-2 rounded-lg bg-muted/30 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <Zap className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium">تفعيل النسخ التلقائي</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    حفظ داخلي + يحتفظ بآخر 7 نسخ
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(v) => updateSettings({ enabled: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/50">
              <div className="flex items-start gap-2 min-w-0">
                <Smartphone className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium">تنزيل تلقائي للهاتف</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    يُنزّل الملف إلى مجلد التنزيلات في الجهاز
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.autoDownload}
                onCheckedChange={(v) => updateSettings({ autoDownload: v })}
                disabled={!settings.enabled}
              />
            </div>
          </div>

          {/* زر تشغيل يدوي */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRun}
            disabled={running}
            className="w-full h-9 text-xs gap-1.5"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {running ? 'جاري الإنشاء...' : 'إنشاء نسخة الآن'}
          </Button>

          {/* النسخ المحفوظة */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <HardDrive className="h-3 w-3" />
                النسخ المحفوظة ({backups.length}/7)
              </p>
              <button
                onClick={refresh}
                disabled={loading}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                {loading ? 'جاري...' : 'تحديث'}
              </button>
            </div>

            {backups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center">
                <p className="text-[11px] text-muted-foreground">
                  لا توجد نسخ محفوظة بعد. سيتم إنشاء نسخة تلقائياً عند أول تغيير.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {backups.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background p-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">
                        {formatTime(b.createdAt)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {b.recordCount} سجل · {formatSize(b.size)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => downloadBackupFile(b)}
                      title="تنزيل"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(b.id)}
                      title="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
