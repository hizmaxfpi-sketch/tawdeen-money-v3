// ============= Auto-Backup Hook =============
// نسخ احتياطي تلقائي بعد التغييرات الحيوية مع عزل تام لكل مستخدم/شركة:
// - يستمع فقط للتغييرات الخاصة بالمستخدم الحالي (filter: user_id=eq.<id>)
// - يخزن في قاعدة IndexedDB منفصلة لكل user_id
// - debounce 30 ثانية لمنع تكرار النسخ

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { saveBackup, downloadBackupFile, getLastBackupTime, BackupRecord } from '@/lib/autoBackupStore';
import { toast } from 'sonner';

const STABILITY_DELAY_MS = 30_000;
const MIN_INTERVAL_MS = 5 * 60_000;
const SETTINGS_KEY = 'tawdeen_autobackup_settings';

const TRACKED_TABLES = [
  'transactions', 'funds', 'contacts', 'debts',
  'projects', 'shipments', 'containers',
  'recurring_obligations', 'obligation_items',
  'obligation_drafts', 'obligation_draft_items',
] as const;

export interface AutoBackupSettings {
  enabled: boolean;
  autoDownload: boolean;
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

  // تحميل آخر وقت نسخ من قاعدة المستخدم الحالي
  useEffect(() => {
    if (!user) return;
    getLastBackupTime(user.id).then(t => { if (t) lastBackupAtRef.current = t; });
  }, [user]);

  const runBackup = useCallback(async (silent = false): Promise<BackupRecord | null> => {
    if (runningRef.current) return null;
    if (!user) return null;

    runningRef.current = true;
    try {
      const data = await exportData();
      const record = await saveBackup(data, user.id);
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
    const since = Date.now() - lastBackupAtRef.current;
    if (lastBackupAtRef.current && since < MIN_INTERVAL_MS) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      runBackup(false);
    }, STABILITY_DELAY_MS);
  }, [settings.enabled, runBackup]);

  // Realtime listener — مفلتر على user_id الحالي فقط
  useEffect(() => {
    if (!user || !settings.enabled) return;

    const channel = supabase.channel(`autobackup-${user.id.slice(0, 8)}`);
    TRACKED_TABLES.forEach(table => {
      channel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table, filter: `user_id=eq.${user.id}` },
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
