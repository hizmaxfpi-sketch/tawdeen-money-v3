// ============= IndexedDB Auto-Backup Store =============
// يحفظ آخر 7 نسخ احتياطية محلياً داخل المتصفح (IndexedDB)
// بدون تأثير على الأداء أو حدود localStorage

const DB_NAME = 'tawdeen_autobackup';
const STORE_NAME = 'backups';
const MAX_BACKUPS = 7;
const DB_VERSION = 1;

export interface BackupRecord {
  id: string;            // ISO timestamp
  createdAt: number;     // epoch ms
  size: number;          // bytes
  recordCount: number;   // total rows across tables
  data: any;             // the JSON snapshot
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

export async function saveBackup(data: any): Promise<BackupRecord> {
  const db = await openDB();
  const json = JSON.stringify(data);
  const id = new Date().toISOString();

  const recordCount =
    (data?.contacts?.length || 0) +
    (data?.funds?.length || 0) +
    (data?.transactions?.length || 0) +
    (data?.debts?.length || 0) +
    (data?.projects?.length || 0) +
    (data?.shipments?.length || 0) +
    (data?.containers?.length || 0);

  const record: BackupRecord = {
    id,
    createdAt: Date.now(),
    size: new Blob([json]).size,
    recordCount,
    data,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // الاحتفاظ بآخر MAX_BACKUPS فقط (FIFO)
  await pruneOldBackups();
  db.close();
  return record;
}

export async function listBackups(): Promise<BackupRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const items = (req.result as BackupRecord[]) || [];
      items.sort((a, b) => b.createdAt - a.createdAt);
      resolve(items);
      db.close();
    };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

export async function getBackup(id: string): Promise<BackupRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => { resolve((req.result as BackupRecord) || null); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

export async function deleteBackup(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function pruneOldBackups() {
  const all = await listBackups();
  if (all.length <= MAX_BACKUPS) return;
  const toDelete = all.slice(MAX_BACKUPS);
  for (const b of toDelete) {
    await deleteBackup(b.id);
  }
}

export async function getLastBackupTime(): Promise<number | null> {
  const all = await listBackups();
  return all[0]?.createdAt ?? null;
}

/** تنزيل نسخة احتياطية كملف على الهاتف/الجهاز */
export function downloadBackupFile(record: BackupRecord) {
  const json = JSON.stringify(record.data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const date = new Date(record.createdAt);
  const stamp = date.toISOString().replace(/[:.]/g, '-').split('.')[0];
  const fileName = `tawdeen-auto-backup-${stamp}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
