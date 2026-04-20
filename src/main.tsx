import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ============= تنظيف موجَّه للذاكرة المحلية =============
// مهم: لا نستخدم localStorage.clear() لأنها تمسح جلسة المصادقة
// (مفاتيح sb-*) مما يسبب فقدان الجلسة وتداخل بيانات الشركات.
// نمسح فقط المفاتيح القديمة الخاصة بالتطبيق.
const CLEAN_STORAGE_KEY = 'edara-malia-storage-cleaned-v9';
const PROTECTED_PREFIXES = ['sb-', 'supabase.', 'tawdeen-language', 'tawdeen-app-version', 'tawdeen_autobackup'];

if (!localStorage.getItem(CLEAN_STORAGE_KEY)) {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const isProtected = PROTECTED_PREFIXES.some(p => key.startsWith(p));
      if (!isProtected && key !== CLEAN_STORAGE_KEY) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    localStorage.setItem(CLEAN_STORAGE_KEY, 'true');
    console.log(`✅ تم تنظيف ${keysToRemove.length} مفتاح قديم (مع الحفاظ على الجلسة) - v2.9`);
  } catch (err) {
    console.warn('Storage cleanup skipped:', err);
  }
}

// ============= إشعار التحديث =============
const APP_VERSION = '2.9';
const VERSION_KEY = 'tawdeen-app-version';
const lastVersion = localStorage.getItem(VERSION_KEY);
if (lastVersion !== APP_VERSION) {
  localStorage.setItem(VERSION_KEY, APP_VERSION);
  sessionStorage.setItem('tawdeen-show-update-toast', 'true');
}

createRoot(document.getElementById("root")!).render(<App />);
