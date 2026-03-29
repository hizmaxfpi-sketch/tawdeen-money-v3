import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Loader2, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createWorker } from 'tesseract.js';
import { toast } from 'sonner';

interface ExtractedData {
  clientName?: string;
  weight?: string;
  goodsType?: string;
  containerNumber?: string;
  dimensions?: {
    length?: string;
    width?: string;
    height?: string;
  };
}

interface ShipmentOCRScannerProps {
  onDataExtracted: (data: ExtractedData) => void;
  onClose: () => void;
}

export function ShipmentOCRScanner({ onDataExtracted, onClose }: ShipmentOCRScannerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImage = async (file: File) => {
    setIsProcessing(true);
    setProgress(0);

    try {
      const worker = await createWorker('ara+eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      const imageUrl = URL.createObjectURL(file);
      const { data: { text } } = await worker.recognize(imageUrl);
      
      await worker.terminate();
      URL.revokeObjectURL(imageUrl);

      // استخراج البيانات من النص
      const extracted = extractDataFromText(text);
      setExtractedData(extracted);
      
      toast.success('تم مسح المستند بنجاح');
    } catch (error) {
      console.error('OCR Error:', error);
      toast.error('فشل في معالجة الصورة');
    } finally {
      setIsProcessing(false);
    }
  };

  const extractDataFromText = (text: string): ExtractedData => {
    const lines = text.split('\n').filter(line => line.trim());
    const data: ExtractedData = {};

    // أنماط البحث
    const patterns = {
      // أسماء العملاء - البحث عن أنماط شائعة
      clientName: /(?:العميل|المستلم|الشاحن|consignee|shipper)[:\s]*([^\n\d]+)/i,
      // الوزن
      weight: /(?:الوزن|weight|kg|كجم)[:\s]*(\d+[\.,]?\d*)/i,
      // نوع البضاعة
      goodsType: /(?:البضاعة|الصنف|goods|description|وصف)[:\s]*([^\n]+)/i,
      // رقم الحاوية
      containerNumber: /(?:رقم الحاوية|container|cont\.?\s*no)[:\s]*([A-Z]{4}\d{7}|\w+-?\d+)/i,
      // الأبعاد
      dimensions: /(\d+[\.,]?\d*)\s*[x×]\s*(\d+[\.,]?\d*)\s*[x×]\s*(\d+[\.,]?\d*)/i,
    };

    // البحث في النص الكامل
    const fullText = lines.join(' ');
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = fullText.match(pattern);
      if (match) {
        if (key === 'dimensions' && match[1] && match[2] && match[3]) {
          data.dimensions = {
            length: match[1].replace(',', '.'),
            width: match[2].replace(',', '.'),
            height: match[3].replace(',', '.'),
          };
        } else if (match[1]) {
          (data as any)[key] = match[1].trim();
        }
      }
    }

    // البحث عن أسماء محتملة إذا لم يتم العثور على اسم العميل
    if (!data.clientName) {
      // البحث عن سطور تحتوي على أسماء عربية أو إنجليزية
      for (const line of lines) {
        const arabicName = line.match(/^[\u0600-\u06FF\s]+$/);
        const englishName = line.match(/^[A-Za-z\s]+$/);
        if ((arabicName || englishName) && line.length > 3 && line.length < 50) {
          if (!line.match(/\d/) && !line.match(/(?:تاريخ|رقم|date|no\.?|number)/i)) {
            data.clientName = line.trim();
            break;
          }
        }
      }
    }

    return data;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file);
    }
  };

  const handleConfirm = () => {
    if (extractedData) {
      onDataExtracted(extractedData);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-primary/10 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-bold">مسح بوليصة الشحن</h2>
                <p className="text-xs text-muted-foreground">التعرف الذكي على البيانات</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="p-4 space-y-4">
            {/* منطقة التحميل */}
            {!isProcessing && !extractedData && (
              <div 
                className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium mb-1">اضغط لتصوير أو اختيار صورة</p>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, JPEG - بوليصة الشحن أو فاتورة
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            )}

            {/* حالة المعالجة */}
            {isProcessing && (
              <div className="text-center py-8">
                <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-4" />
                <p className="text-sm font-medium mb-2">جاري تحليل المستند...</p>
                <div className="w-full max-w-xs mx-auto">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className="h-full bg-primary rounded-full"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{progress}%</p>
                </div>
              </div>
            )}

            {/* نتائج الاستخراج */}
            {extractedData && !isProcessing && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-income">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">تم استخراج البيانات</span>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  {extractedData.clientName && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">اسم العميل:</span>
                      <span className="font-medium">{extractedData.clientName}</span>
                    </div>
                  )}
                  {extractedData.goodsType && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">نوع البضاعة:</span>
                      <span className="font-medium">{extractedData.goodsType}</span>
                    </div>
                  )}
                  {extractedData.weight && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">الوزن:</span>
                      <span className="font-medium">{extractedData.weight} كجم</span>
                    </div>
                  )}
                  {extractedData.containerNumber && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">رقم الحاوية:</span>
                      <span className="font-medium">{extractedData.containerNumber}</span>
                    </div>
                  )}
                  {extractedData.dimensions && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">الأبعاد:</span>
                      <span className="font-medium" dir="ltr">
                        {extractedData.dimensions.length} × {extractedData.dimensions.width} × {extractedData.dimensions.height}
                      </span>
                    </div>
                  )}
                  
                  {Object.keys(extractedData).length === 0 && (
                    <div className="flex items-center gap-2 text-yellow-600 text-sm">
                      <AlertCircle className="h-4 w-4" />
                      <span>لم يتم العثور على بيانات واضحة</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      setExtractedData(null);
                      fileInputRef.current?.click();
                    }}
                  >
                    إعادة المسح
                  </Button>
                  <Button 
                    className="flex-1"
                    onClick={handleConfirm}
                    disabled={Object.keys(extractedData).length === 0}
                  >
                    استخدام البيانات
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
