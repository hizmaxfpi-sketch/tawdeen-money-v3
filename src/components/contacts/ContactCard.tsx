import { motion } from 'framer-motion';
import { Phone, MessageCircle, Mail, MoreVertical, Building2, UserCheck, Truck, Ship, Briefcase, Handshake, User, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Contact, ContactType, CONTACT_TYPE_LABELS, CONTACT_TYPE_COLORS } from '@/types/contacts';
import { cn } from '@/lib/utils';

interface ContactCardProps {
  contact: Contact;
  onView: (contact: Contact) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contactId: string) => void;
  onCall?: (phone: string) => void;
  onWhatsApp?: (phone: string) => void;
}

// أيقونات الأنواع
const TypeIcons: Record<ContactType, any> = {
  client: UserCheck,
  vendor: Truck,
  shipping_agent: Ship,
  employee: Briefcase,
  partner: Handshake,
  other: User,
};

export function ContactCard({ 
  contact, 
  onView, 
  onEdit, 
  onDelete,
  onCall,
  onWhatsApp 
}: ContactCardProps) {
  const TypeIcon = TypeIcons[contact.type] || User;
  const typeColor = CONTACT_TYPE_COLORS[contact.type];

  const handleWhatsAppClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const phone = contact.whatsapp || contact.phone;
    if (phone) {
      // تنظيف الرقم وفتح واتساب
      const cleanPhone = phone.replace(/[^0-9+]/g, '');
      window.open(`https://wa.me/${cleanPhone}`, '_blank');
    }
  };

  const handleCallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (contact.phone) {
      window.open(`tel:${contact.phone}`, '_self');
    }
  };

  const handleEmailClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (contact.email) {
      window.open(`mailto:${contact.email}`, '_self');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onView(contact)}
      className="bg-card rounded-lg border border-border p-2.5 shadow-sm cursor-pointer hover:border-primary/30 transition-all"
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div className={cn(
          "h-10 w-10 rounded-full flex items-center justify-center shrink-0 border",
          typeColor
        )}>
          <TypeIcon className="h-4 w-4" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-bold text-xs truncate">{contact.name}</h3>
              {contact.company && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Building2 className="h-2.5 w-2.5" />
                  {contact.company}
                </p>
              )}
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-0.5 shrink-0">
              {(contact.whatsapp || contact.phone) && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-green-600 hover:bg-green-500/10"
                  onClick={handleWhatsAppClick}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </Button>
              )}
              {contact.phone && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-blue-600 hover:bg-blue-500/10"
                  onClick={handleCallClick}
                >
                  <Phone className="h-3.5 w-3.5" />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card z-50">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(contact); }} className="text-xs">
                    تعديل
                  </DropdownMenuItem>
                  {contact.email && (
                    <DropdownMenuItem onClick={handleEmailClick} className="text-xs">
                      إرسال بريد
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem 
                    className="text-destructive text-xs"
                    onClick={(e) => { e.stopPropagation(); onDelete(contact.id); }}
                  >
                    حذف
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Footer Row */}
          <div className="flex items-center justify-between mt-1.5">
            <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5", typeColor)}>
              {CONTACT_TYPE_LABELS[contact.type]}
            </Badge>
            
            {/* Balance */}
            <div className="flex items-center gap-1.5">
              {contact.balance !== 0 && (
                <span className={cn(
                  "text-[11px] font-bold",
                  contact.balance > 0 ? 'text-destructive' : 'text-emerald-600'
                )}>
                  {contact.balance > 0 ? '-' : '+'}{Math.abs(contact.balance).toLocaleString()} $
                </span>
              )}
              <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
