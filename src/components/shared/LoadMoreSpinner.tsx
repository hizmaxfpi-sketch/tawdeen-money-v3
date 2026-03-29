import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LoadMoreSpinnerProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

export function LoadMoreSpinner({ hasMore, loading, onLoadMore }: LoadMoreSpinnerProps) {
  if (!hasMore) return null;
  
  return (
    <div className="flex justify-center py-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={onLoadMore}
        disabled={loading}
        className="gap-2 text-xs text-muted-foreground"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            جاري التحميل...
          </>
        ) : (
          'تحميل المزيد'
        )}
      </Button>
    </div>
  );
}
