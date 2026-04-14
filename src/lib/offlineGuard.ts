import { toast } from 'sonner';

/**
 * Returns true if offline (and shows a toast). Use before any mutation.
 */
export function guardOffline(): boolean {
  if (!navigator.onLine) {
    toast.error('لا يمكن تنفيذ هذا الإجراء بدون اتصال بالإنترنت');
    return true;
  }
  return false;
}
