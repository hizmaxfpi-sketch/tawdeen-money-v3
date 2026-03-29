import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ============= تنظيف الذاكرة المحلية (مرة واحدة) =============
const CLEAN_STORAGE_KEY = 'edara-malia-storage-cleaned-v8';

if (!localStorage.getItem(CLEAN_STORAGE_KEY)) {
  localStorage.clear();
  localStorage.setItem(CLEAN_STORAGE_KEY, 'true');
  console.log('✅ تم تنظيف الذاكرة المحلية بنجاح - v2.8');
}

// ============= إشعار التحديث =============
const APP_VERSION = '2.8';
const VERSION_KEY = 'tawdeen-app-version';
const lastVersion = localStorage.getItem(VERSION_KEY);
if (lastVersion !== APP_VERSION) {
  localStorage.setItem(VERSION_KEY, APP_VERSION);
  sessionStorage.setItem('tawdeen-show-update-toast', 'true');
}

// Preserve language setting during storage cleanup
const savedLang = localStorage.getItem('tawdeen-language');
if (savedLang) {
  localStorage.setItem('tawdeen-language', savedLang);
}

createRoot(document.getElementById("root")!).render(<App />);