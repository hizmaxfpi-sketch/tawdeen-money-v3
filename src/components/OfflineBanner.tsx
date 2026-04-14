import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-white text-center py-1.5 px-4 text-xs font-medium flex items-center justify-center gap-2 shadow-md">
      <WifiOff className="h-3.5 w-3.5" />
      <span>لا يوجد اتصال بالإنترنت — وضع القراءة فقط</span>
    </div>
  );
}
