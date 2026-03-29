import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VoiceInputProps {
  onResult: (data: { amount?: number; category?: string; description?: string }) => void;
  onClose: () => void;
}

export function VoiceInput({ onResult, onClose }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parseVoiceCommand = useCallback((text: string) => {
    const lowerText = text.toLowerCase();
    
    // Extract amount
    const amountPatterns = [
      /(\d+(?:\.\d+)?)\s*(?:ريال|ر\.?س)/i,
      /صرفت?\s*(\d+)/i,
      /قبضت?\s*(\d+)/i,
      /(\d+)\s*على/i,
      /(\d+)\s*من/i,
    ];

    let amount: number | undefined;
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        amount = parseFloat(match[1]);
        break;
      }
    }

    // Detect category
    const categoryMap: Record<string, string[]> = {
      food: ['طعام', 'غداء', 'عشاء', 'فطور', 'مطعم', 'أكل', 'قهوة', 'كافيه'],
      transport: ['مواصلات', 'بنزين', 'وقود', 'تاكسي', 'أوبر', 'كريم', 'سيارة'],
      bills: ['فاتورة', 'كهرباء', 'ماء', 'إنترنت', 'هاتف', 'جوال'],
      shopping: ['تسوق', 'ملابس', 'شراء', 'مول'],
      entertainment: ['ترفيه', 'سينما', 'فيلم', 'لعبة'],
      health: ['صحة', 'دواء', 'مستشفى', 'طبيب', 'صيدلية'],
    };

    let category: string | undefined;
    for (const [cat, keywords] of Object.entries(categoryMap)) {
      if (keywords.some(kw => lowerText.includes(kw))) {
        category = cat;
        break;
      }
    }

    // Use the original text as description
    const description = text.trim();

    return { amount, category, description };
  }, []);

  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('متصفحك لا يدعم التعرف على الصوت. يرجى استخدام Chrome أو Edge.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = 'ar-SA';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('');
      setError(null);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          setTranscript(event.results[i][0].transcript);
        }
      }
      if (finalTranscript) {
        setTranscript(finalTranscript);
        const parsed = parseVoiceCommand(finalTranscript);
        onResult(parsed);
      }
    };

    recognition.onerror = (event: any) => {
      setError('حدث خطأ في التعرف على الصوت. يرجى المحاولة مرة أخرى.');
      setIsListening(false);
      console.error('Speech recognition error:', event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  }, [onResult, parseVoiceCommand]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-lg"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">الإدخال الصوتي</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="text-center py-8">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={startListening}
            disabled={isListening}
            className={`relative w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${
              isListening
                ? 'bg-gradient-expense'
                : 'bg-gradient-primary'
            }`}
          >
            {isListening ? (
              <>
                <motion.div
                  className="absolute inset-0 rounded-full bg-destructive"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  style={{ opacity: 0.3 }}
                />
                <MicOff className="h-10 w-10 text-primary-foreground relative" />
              </>
            ) : (
              <Mic className="h-10 w-10 text-primary-foreground" />
            )}
          </motion.button>

          <AnimatePresence mode="wait">
            {isListening ? (
              <motion.div
                key="listening"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-2" />
                <p className="text-muted-foreground">جاري الاستماع...</p>
              </motion.div>
            ) : error ? (
              <motion.p
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-destructive text-sm"
              >
                {error}
              </motion.p>
            ) : (
              <motion.div
                key="ready"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <p className="text-muted-foreground mb-4">
                  اضغط على الميكروفون وقل شيئاً مثل:
                </p>
                <div className="space-y-2 text-sm">
                  <p className="bg-muted rounded-lg p-2">"صرفت 50 ريال على الغداء"</p>
                  <p className="bg-muted rounded-lg p-2">"قبضت 5000 من الراتب"</p>
                  <p className="bg-muted rounded-lg p-2">"دفعت فاتورة الكهرباء 200 ريال"</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {transcript && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-accent rounded-xl"
            >
              <p className="text-sm text-muted-foreground mb-1">ما سمعته:</p>
              <p className="font-medium">{transcript}</p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
