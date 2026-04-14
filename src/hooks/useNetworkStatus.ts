import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { toast } from 'sonner';

interface NetworkStatus {
  isOnline: boolean;
}

const NetworkContext = createContext<NetworkStatus>({ isOnline: true });

export function useNetworkStatus() {
  return useContext(NetworkContext);
}

export { NetworkContext };

export function useNetworkStatusProvider(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      toast.success('تم استعادة الاتصال بالإنترنت');
    };
    const goOffline = () => {
      setIsOnline(false);
      toast.warning('انقطع الاتصال بالإنترنت - وضع القراءة فقط');
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { isOnline };
}
