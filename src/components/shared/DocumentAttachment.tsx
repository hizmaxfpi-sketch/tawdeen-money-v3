import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Paperclip, Upload, X, Eye, Download, FileText, Image as ImageIcon, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DocumentAttachmentProps {
  attachments: string[];
  onAttachmentsChange: (attachments: string[]) => void;
  maxFiles?: number;
  compact?: boolean;
  readOnly?: boolean;
}

export function DocumentAttachment({
  attachments,
  onAttachmentsChange,
  maxFiles = 5,
  compact = false,
  readOnly = false,
}: DocumentAttachmentProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'pdf'>('image');

  const getFileType = (url: string): 'image' | 'pdf' => {
    const lower = url.toLowerCase();
    if (lower.includes('.pdf')) return 'pdf';
    return 'image';
  };

  const getFileName = (url: string) => {
    const parts = url.split('/');
    const name = parts[parts.length - 1];
    return decodeURIComponent(name).substring(0, 30);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;

    if (attachments.length + files.length > maxFiles) {
      toast.error(`الحد الأقصى ${maxFiles} ملفات`);
      return;
    }

    setUploading(true);
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} أكبر من 10 ميجا`);
        continue;
      }

      const ext = file.name.split('.').pop();
      const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from('attachments')
        .upload(path, file);

      if (error) {
        toast.error(`فشل رفع ${file.name}`);
        console.error(error);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from('attachments')
        .getPublicUrl(path);

      newUrls.push(urlData.publicUrl);
    }

    if (newUrls.length > 0) {
      onAttachmentsChange([...attachments, ...newUrls]);
      toast.success(`تم رفع ${newUrls.length} ملف`);
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemove = async (url: string) => {
    // Extract path from URL
    const bucketUrl = '/attachments/';
    const pathStart = url.indexOf(bucketUrl);
    if (pathStart !== -1) {
      const path = url.substring(pathStart + bucketUrl.length);
      await supabase.storage.from('attachments').remove([path]);
    }
    onAttachmentsChange(attachments.filter(a => a !== url));
  };

  const handlePreview = (url: string) => {
    setPreviewType(getFileType(url));
    setPreviewUrl(url);
  };

  const handleDownload = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.download = getFileName(url);
    a.click();
  };

  if (compact && readOnly) {
    if (attachments.length === 0) return null;
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {attachments.map((url, i) => (
          <button
            key={i}
            onClick={() => handlePreview(url)}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <Paperclip className="h-3 w-3" />
            {getFileName(url)}
          </button>
        ))}
        <PreviewDialog
          url={previewUrl}
          type={previewType}
          onClose={() => setPreviewUrl(null)}
          onDownload={handleDownload}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
        <Paperclip className="h-3 w-3" />
        المرفقات ({attachments.length}/{maxFiles})
      </label>

      {/* Upload Area */}
      {!readOnly && attachments.length < maxFiles && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={cn(
              "flex items-center justify-center gap-2 h-12 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
              uploading ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
            )}
          >
            {uploading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
                <span className="text-[10px] text-primary">جاري الرفع...</span>
              </div>
            ) : (
              <>
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">اضغط لإرفاق مستندات (PDF أو صور)</span>
              </>
            )}
          </div>
        </>
      )}

      {/* Attachments List */}
      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((url, index) => {
            const type = getFileType(url);
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 bg-muted/40 rounded-lg px-2 py-1.5"
              >
                {type === 'pdf' ? (
                  <FileText className="h-4 w-4 text-destructive shrink-0" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-primary shrink-0" />
                )}
                <span className="text-[10px] text-foreground flex-1 truncate">
                  {getFileName(url)}
                </span>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handlePreview(url)}
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleDownload(url)}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => handleRemove(url)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Preview Dialog */}
      <PreviewDialog
        url={previewUrl}
        type={previewType}
        onClose={() => setPreviewUrl(null)}
        onDownload={handleDownload}
      />
    </div>
  );
}

function PreviewDialog({
  url,
  type,
  onClose,
  onDownload,
}: {
  url: string | null;
  type: 'image' | 'pdf';
  onClose: () => void;
  onDownload: (url: string) => void;
}) {
  if (!url) return null;

  return (
    <Dialog open={!!url} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="text-sm">معاينة المستند</span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-[11px]"
              onClick={() => onDownload(url)}
            >
              <Download className="h-3.5 w-3.5" />
              تحميل
            </Button>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          {type === 'pdf' ? (
            <iframe
              src={url}
              className="w-full h-[70vh] rounded-lg border border-border"
              title="PDF Preview"
            />
          ) : (
            <img
              src={url}
              alt="Document preview"
              className="w-full h-auto rounded-lg object-contain max-h-[70vh]"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
