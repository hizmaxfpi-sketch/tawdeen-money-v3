// ============= Auto-Backup Hook =============
// يستمع لتغييرات البيانات الحيوية وينشئ نسخة احتياطية تلقائياً
// بعد فترة استقرار (لمنع تكرار النسخ عند العمليات المتتالية).

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { saveBackup, downloadBackupFile, getLastBackupTime, BackupRecord } from '@/lib/autoBackupStore';
import { toast } from 'sonner';

const STABILITY_DELAY_MS = 30_000;     // 30 ثانية بعد آخر تغيير قبل النسخ
const MIN_INTERVAL_MS = 5 * 60_000;    // لا تنشئ نسخة إن كانت آخر نسخة < 5 دقائق
const SETTINGS_KEY = 'tawdeen_autobackup_settings';

const TRACKED_TABLES = [
  'transactions', 'funds', 'contacts', 'debts',
  'projects', 'shipments', 'containers',
] as const;

export interface AutoBackupSettings {
  enabled: boolean;
  autoDownload: boolean;   // تنزيل الملف للهاتف تلقائياً عند كل نسخة
}

const DEFAULT_SETTINGS: AutoBackupSettings = {
  enabled: true,
  autoDownload: true,
};

export function loadSettings(): AutoBackupSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: AutoBackupSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

interface UseAutoBackupOpts {
  exportData: () => Promise<any>;
}

export function useAutoBackup({ exportData }: UseAutoBackupOpts) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AutoBackupSettings>(loadSettings);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const lastBackupAtRef = useRef<number>(0);

  // تحميل آخر وقت نسخ من القاعدة المحلية
  useEffect(() => {
    getLastBackupTime().then(t => { if (t) lastBackupAtRef.current = t; });
  }, []);

  const runBackup = useCallback(async (silent = false): Promise<BackupRecord | null> => {
    if (runningRef.current) return null;
    if (!user) return null;

    runningRef.current = true;
    try {
      const data = await exportData();
      const record = await saveBackup(data);
      lastBackupAtRef.current = record.createdAt;

      if (settings.autoDownload) {
        downloadBackupFile(record);
      }

      if (!silent) {
        toast.success(
          settings.autoDownload
            ? 'تم إنشاء نسخة احتياطية وتنزيلها على الجهاز'
            : 'تم إنشاء نسخة احتياطية تلقائية'
        );
      }
      return record;
    } catch (err) {
      console.error('[AutoBackup] failed:', err);
      if (!silent) toast.error('تعذر إنشاء النسخة الاحتياطية التلقائية');
      return null;
    } finally {
      runningRef.current = false;
    }
  }, [exportData, settings.autoDownload, user]);

  const scheduleBackup = useCallback(() => {
    if (!settings.enabled) return;

    // لا تنشئ نسخة إن كانت الأخيرة قريبة جداً
    const since = Date.now() - lastBackupAtRef.current;
    if (lastBackupAtRef.current && since < MIN_INTERVAL_MS) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      runBackup(false);
    }, STABILITY_DELAY_MS);
  }, [settings.enabled, runBackup]);

  // Realtime listener على الجداول الحيوية
  useEffect(() => {
    if (!user || !settings.enabled) return;

    const channel = supabase.channel(`autobackup-${user.id.slice(0, 8)}`);
    TRACKED_TABLES.forEach(table => {
      channel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table },
        () => scheduleBackup()
      );
    });
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, settings.enabled, scheduleBackup]);

  const updateSettings = useCallback((next: Partial<AutoBackupSettings>) => {
    setSettings(prev => {
      const merged = { ...prev, ...next };
      saveSettings(merged);
      return merged;
    });
  }, []);

  return {
    settings,
    updateSettings,
    runBackupNow: () => runBackup(false),
  };
}
