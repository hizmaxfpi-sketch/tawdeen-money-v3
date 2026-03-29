import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Cloud, CloudUpload, CloudDownload, LogIn, LogOut,
  Loader2, RefreshCw, Trash2, FileJson, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const BACKUP_FOLDER_NAME = 'توطين - النسخ الاحتياطية';
const BACKUP_MIME_TYPE = 'application/json';

interface GoogleDriveBackupProps {
  getBackupData: () => Promise<object | null> | object | null;
  onImportData?: (data: any) => Promise<any> | void;
}

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size: string;
}

function loadScript(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) { resolve(); return; }
    const s = document.createElement('script');
    s.id = id; s.src = src; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export function GoogleDriveBackup({ getBackupData, onImportData }: GoogleDriveBackupProps) {
  const [clientId, setClientId] = useState(() => localStorage.getItem('google_drive_client_id') || '');
  const [loginHint, setLoginHint] = useState(() => localStorage.getItem('google_drive_login_hint') || '');
  const [isConnected, setIsConnected] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [backupFiles, setBackupFiles] = useState<DriveFile[]>([]);
  const [showSettings, setShowSettings] = useState(!clientId);
  const [tempClientId, setTempClientId] = useState(clientId);
  const [tempLoginHint, setTempLoginHint] = useState(loginHint);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const saveClientId = () => {
    const id = tempClientId.trim();
    const email = tempLoginHint.trim();
    if (!id) { toast.error('يرجى إدخال Google Client ID'); return; }
    if (!id.endsWith('.apps.googleusercontent.com')) {
      toast.error('Client ID غير صالح - يجب أن ينتهي بـ .apps.googleusercontent.com');
      return;
    }
    localStorage.setItem('google_drive_client_id', id);
    if (email) localStorage.setItem('google_drive_login_hint', email);
    else localStorage.removeItem('google_drive_login_hint');
    setClientId(id);
    setLoginHint(email);
    setShowSettings(false);
    setOauthError(null);
    toast.success('تم حفظ Client ID بنجاح');
  };

  const handleConnect = useCallback(async () => {
    if (!clientId) { setShowSettings(true); return; }
    setIsLoading(true);
    setOauthError(null);

    try {
      await Promise.all([
        loadScript('google-gis-script', 'https://accounts.google.com/gsi/client'),
        loadScript('google-gapi-script', 'https://apis.google.com/js/api.js'),
      ]);

      await new Promise<void>((resolve, reject) => {
        const g = (window as any).gapi;
        if (!g) { reject(new Error('GAPI not loaded')); return; }
        g.load('client', async () => {
          try {
            await g.client.init({});
            await g.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
            resolve();
          } catch (e) { reject(e); }
        });
      });

      const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: async (response: any) => {
          if (response.error) {
            console.error('OAuth error:', response);
            const errMsg = response.error === 'invalid_client'
              ? 'Client ID غير صالح أو غير مربوط بمشروع Google Cloud. أنشئ OAuth Client ID من نوع Web application داخل مشروع فعّال وأضف هذا النطاق إلى Authorized JavaScript Origins.'
              : `خطأ في المصادقة: ${response.error_description || response.error}`;
            setOauthError(errMsg);
            toast.error(errMsg);
            setIsLoading(false);
            return;
          }
          setAccessToken(response.access_token);
          setIsConnected(true);
          setOauthError(null);

          try {
            const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${response.access_token}` }
            });
            const u = await r.json();
            setUserEmail(u.email);
          } catch {}

          await listBackups(response.access_token);
          setIsLoading(false);
          toast.success('تم الاتصال بـ Google Drive بنجاح');
        },
        error_callback: (err: any) => {
          console.error('OAuth error_callback:', err);
          setIsLoading(false);
          if (err?.type === 'popup_closed') {
            toast.info('تم إلغاء عملية الاتصال');
          } else {
            const errMsg = 'فشل الاتصال. تأكد من إعداد OAuth Client ID بشكل صحيح في Google Cloud Console.';
            setOauthError(errMsg);
            toast.error(errMsg);
          }
        }
      });

      tokenClient.requestAccessToken(
        loginHint.trim()
          ? { prompt: 'consent', login_hint: loginHint.trim() }
          : { prompt: 'consent' }
      );
    } catch (error: any) {
      console.error('Connect error:', error);
      setOauthError('حدث خطأ أثناء تحميل مكتبات Google. تحقق من اتصال الإنترنت.');
      toast.error('حدث خطأ أثناء الاتصال بـ Google Drive');
      setIsLoading(false);
    }
  }, [clientId, loginHint]);

  const handleDisconnect = () => {
    if (accessToken) {
      try { (window as any).google?.accounts?.oauth2?.revoke(accessToken); } catch {}
    }
    setAccessToken(null);
    setIsConnected(false);
    setUserEmail(null);
    setBackupFiles([]);
    toast.success('تم قطع الاتصال بـ Google Drive');
  };

  const getOrCreateFolder = async (token: string): Promise<string> => {
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FOLDER_NAME}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const searchData = await searchRes.json();
    if (searchData.files?.length > 0) return searchData.files[0].id;

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: BACKUP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    const folder = await createRes.json();
    return folder.id;
  };

  const listBackups = async (token: string) => {
    try {
      const folderId = await getOrCreateFolder(token);
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&orderBy=modifiedTime+desc&fields=files(id,name,modifiedTime,size)&pageSize=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      setBackupFiles(data.files || []);
    } catch (error) {
      console.error('List error:', error);
    }
  };

  const handleUpload = async () => {
    if (!accessToken) return;
    const backupData = await getBackupData();
    if (!backupData) { toast.error('لا توجد بيانات للنسخ'); return; }

    setIsUploading(true);
    try {
      const folderId = await getOrCreateFolder(accessToken);
      const fileName = `tawdeen-backup-${new Date().toISOString().split('T')[0]}_${Date.now()}.json`;
      const content = JSON.stringify(backupData, null, 2);
      const metadata = { name: fileName, mimeType: BACKUP_MIME_TYPE, parents: [folderId] };
      const boundary = 'backup_boundary_' + Date.now();
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${BACKUP_MIME_TYPE}\r\n\r\n${content}\r\n` +
        `--${boundary}--`;

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });

      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      await listBackups(accessToken);
      toast.success('تم رفع النسخة الاحتياطية إلى Google Drive بنجاح');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('فشل رفع النسخة الاحتياطية');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    if (!accessToken || !onImportData) return;
    setIsDownloading(true);
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const data = await res.json();
      await onImportData(data);
      toast.success(`تم استعادة النسخة: ${fileName}`);
    } catch (error: any) {
      console.error('Download error:', error);
      toast.error('فشل استعادة النسخة: ' + (error?.message || 'خطأ'));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!accessToken) return;
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setBackupFiles(prev => prev.filter(f => f.id !== fileId));
      toast.success('تم حذف النسخة');
    } catch {
      toast.error('فشل حذف النسخة');
    }
  };

  const formatFileSize = (bytes: string) => {
    const b = parseInt(bytes || '0');
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-border">
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full",
                isConnected ? "bg-emerald-100 dark:bg-emerald-950/50" : "bg-blue-100 dark:bg-blue-950/50"
              )}>
                <Cloud className={cn("h-4 w-4", isConnected ? "text-emerald-600" : "text-blue-600")} />
              </div>
              <div>
                <CardTitle className="text-sm">Google Drive</CardTitle>
                <CardDescription className="text-[10px]">
                  {isConnected ? (
                    <span className="text-emerald-600">متصل {userEmail ? `(${userEmail})` : ''}</span>
                  ) : 'اربط حسابك لحفظ النسخ الاحتياطية'}
                </CardDescription>
              </div>
            </div>
            {isConnected ? (
              <Button variant="ghost" size="sm" onClick={handleDisconnect} className="text-xs h-7 gap-1 text-muted-foreground">
                <LogOut className="h-3 w-3" /> قطع
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)} className="text-xs h-7">
                إعدادات
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-3 pt-0 space-y-2">
          {/* OAuth Error */}
          {oauthError && !isConnected && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-destructive font-medium">{oauthError}</p>
                <Button variant="link" size="sm" className="h-auto p-0 text-[10px] text-primary" onClick={() => { setShowSettings(true); setOauthError(null); }}>
                  تعديل Client ID
                </Button>
              </div>
            </div>
          )}

          {/* Settings */}
          {showSettings && !isConnected && (
            <div className="space-y-2 p-2 rounded-lg bg-muted/30 border border-border">
              <p className="text-[10px] text-muted-foreground">
                أدخل Google Client ID من{' '}
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" className="text-primary underline">
                  Google Cloud Console
                </a>
              </p>
              <div className="text-[9px] text-muted-foreground space-y-0.5 bg-muted/50 p-1.5 rounded">
                <p>1. أنشئ OAuth 2.0 Client ID (نوع: Web application)</p>
                <p>2. أضف <span className="font-mono text-[8px] bg-background px-1 rounded" dir="ltr">{currentOrigin}</span> إلى Authorized JavaScript Origins</p>
                <p>3. فعّل Google Drive API من مكتبة APIs</p>
              </div>
              <input
                type="text"
                placeholder="xxxx.apps.googleusercontent.com"
                value={tempClientId}
                onChange={e => setTempClientId(e.target.value)}
                className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background"
                dir="ltr"
              />
              <input
                type="email"
                placeholder="البريد الإلكتروني لحساب Google (اختياري)"
                value={tempLoginHint}
                onChange={e => setTempLoginHint(e.target.value)}
                className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background"
                dir="ltr"
              />
              <div className="flex gap-2">
                <Button size="sm" className="text-[10px] h-7 flex-1" onClick={saveClientId}>حفظ</Button>
                {clientId && (
                  <Button size="sm" variant="ghost" className="text-[10px] h-7" onClick={() => setShowSettings(false)}>إلغاء</Button>
                )}
              </div>
            </div>
          )}

          {/* Connect Button */}
          {!isConnected && !showSettings && (
            <Button variant="outline" onClick={handleConnect} disabled={isLoading} className="w-full gap-2 h-10">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {isLoading ? 'جاري الاتصال...' : 'ربط حساب Google Drive'}
            </Button>
          )}

          {/* Connected */}
          {isConnected && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="default" size="sm" onClick={handleUpload} disabled={isUploading} className="gap-1.5 h-9 text-xs">
                  {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                  {isUploading ? 'جاري الرفع...' : 'رفع نسخة احتياطية'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => accessToken && listBackups(accessToken)} className="gap-1.5 h-9 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" /> تحديث القائمة
                </Button>
              </div>

              {backupFiles.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  <p className="text-[10px] font-medium text-muted-foreground">النسخ المحفوظة ({backupFiles.length}):</p>
                  {backupFiles.map(file => (
                    <div key={file.id} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-muted/30 border border-border">
                      <FileJson className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-medium truncate" dir="ltr">{file.name}</p>
                        <p className="text-[9px] text-muted-foreground">
                          {new Date(file.modifiedTime).toLocaleDateString('ar-SA')} · {formatFileSize(file.size)}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDownload(file.id, file.name)} disabled={isDownloading} title="استعادة">
                          <CloudDownload className="h-3 w-3 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteFile(file.id)} title="حذف">
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {backupFiles.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-2">
                  لا توجد نسخ احتياطية بعد. اضغط "رفع نسخة احتياطية" للبدء.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
