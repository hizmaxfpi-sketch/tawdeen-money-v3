import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Loader2, Check, AlertCircle } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { Button } from '@/components/ui/button';

interface OCRScannerProps {
  onScanComplete: (data: { amount?: number; date?: string; merchant?: string }) => void;
  onClose: () => void;
}

export function OCRScanner({ onScanComplete, onClose }: OCRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractFinancialData = (text: string) => {
    const amountPatterns = [
      /(\d{1,3}(?:[,،]\d{3})*(?:\.\d{2})?)\s*(?:ر\.?س|ريال|SAR)/gi,
      /(?:المبلغ|الإجمالي|المجموع|Total|Amount)[:\s]*(\d{1,3}(?:[,،]\d{3})*(?:\.\d{2})?)/gi,
      /(\d{1,3}(?:[,،]\d{3})*(?:\.\d{2})?)/g,
    ];

    let amount: number | undefined;
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        const numStr = match[0].replace(/[^\d.,]/g, '').replace(',', '');
        const num = parseFloat(numStr);
        if (num > 0 && num < 1000000) {
          amount = num;
          break;
        }
      }
    }

    const datePatterns = [
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
      /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    ];

    let date: string | undefined;
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        date = match[0];
        break;
      }
    }

    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const merchant = lines[0]?.trim().slice(0, 50);

    return { amount, date, merchant };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsScanning(true);
    setProgress(0);

    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const result = await Tesseract.recognize(file, 'ara+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      const extractedData = extractFinancialData(result.data.text);
      onScanComplete(extractedData);
    } catch (err) {
      setError('فشل في قراءة الصورة. يرجى المحاولة مرة أخرى.');
      console.error('OCR Error:', err);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-lg"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">مسح السند</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />

        <AnimatePresence mode="wait">
          {isScanning ? (
            <motion.div key="scanning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-8">
              {preview && <img src={preview} alt="Preview" className="w-32 h-32 object-cover rounded-xl mx-auto mb-4 opacity-50" />}
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground mb-2 text-xs">جاري تحليل الصورة...</p>
              <div className="w-48 h-2 bg-muted rounded-full mx-auto overflow-hidden">
                <motion.div className="h-full bg-gradient-primary rounded-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-muted-foreground mt-2">{progress}%</p>
            </motion.div>
          ) : error ? (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive mb-4 text-sm">{error}</p>
              <Button onClick={() => fileInputRef.current?.click()}>المحاولة مرة أخرى</Button>
            </motion.div>
          ) : (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-2xl p-6 cursor-pointer hover:border-primary hover:bg-accent/50 transition-colors"
              >
                <Camera className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium text-sm mb-1">التقط صورة للسند أو الفاتورة</p>
                <p className="text-xs text-muted-foreground">سيتم استخراج المبلغ والتاريخ تلقائياً</p>
              </motion.div>
              <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Check className="h-3 w-3 text-income" />
                  <span>يدعم العربية</span>
                </div>
                <div className="flex items-center gap-1">
                  <Check className="h-3 w-3 text-income" />
                  <span>يدعم الإنجليزية</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}