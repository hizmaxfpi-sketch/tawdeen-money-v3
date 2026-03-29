import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Phone, MessageCircle, Mail, MapPin, Building2, 
  Calendar, DollarSign, ArrowUpRight, ArrowDownRight,
  Link2, Edit2, Trash2, UserCheck, Truck, Ship, Briefcase, Handshake, User, ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Contact, ContactType, CONTACT_TYPE_LABELS, CONTACT_TYPE_COLORS, ContactTransaction } from '@/types/contacts';
import { cn } from '@/lib/utils';

interface ContactProfileProps {
  contact: Contact;
  linkedContacts?: Contact[];
  transactions?: ContactTransaction[];
  onEdit: (contact: Contact) => void;
  onDelete: (contactId: string) => void;
  onClose: () => void;
  onViewLinkedContact?: (contact: Contact) => void;
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

export function ContactProfile({ 
  contact, 
  linkedContacts = [],
  transactions = [],
  onEdit, 
  onDelete, 
  onClose,
  onViewLinkedContact
}: ContactProfileProps) {
  const [showTransactions, setShowTransactions] = useState(false);
  const TypeIcon = TypeIcons[contact.type] || User;
  const typeColor = CONTACT_TYPE_COLORS[contact.type];

  const handleWhatsApp = () => {
    const phone = contact.whatsapp || contact.phone;
    if (phone) {
      const cleanPhone = phone.replace(/[^0-9+]/g, '');
      window.open(`https://wa.me/${cleanPhone}`, '_blank');
    }
  };

  const handleCall = () => {
    if (contact.phone) {
      window.open(`tel:${contact.phone}`, '_self');
    }
  };

  const handleEmail = () => {
    if (contact.email) {
      window.open(`mailto:${contact.email}`, '_self');
    }
  };

  const handleDelete = () => {
    if (confirm('هل أنت متأكد من حذف جهة الاتصال هذه؟')) {
      onDelete(contact.id);
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
          className="bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with Avatar */}
          <div className="relative">
            <div className={cn("h-24 w-full", typeColor.replace('text-', 'bg-').split(' ')[0])} />
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-2 left-2 h-8 w-8 bg-white/20 backdrop-blur-sm hover:bg-white/30"
              onClick={onClose}
            >
              <X className="h-4 w-4 text-white" />
            </Button>
            
            {/* Avatar */}
            <div className={cn(
              "absolute -bottom-8 right-4 h-16 w-16 rounded-full border-4 border-card flex items-center justify-center",
              typeColor
            )}>
              <TypeIcon className="h-7 w-7" />
            </div>
          </div>

          {/* Content */}
          <div className="pt-10 px-4 pb-4 space-y-4">
            {/* Name & Type */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">{contact.name}</h2>
                {contact.company && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {contact.company}
                  </p>
                )}
              </div>
              <Badge variant="outline" className={cn("text-xs", typeColor)}>
                {CONTACT_TYPE_LABELS[contact.type]}
              </Badge>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-2">
              {(contact.whatsapp || contact.phone) && (
                <Button 
                  variant="outline" 
                  className="h-12 flex-col gap-1 text-green-600 border-green-200 hover:bg-green-50"
                  onClick={handleWhatsApp}
                >
                  <MessageCircle className="h-5 w-5" />
                  <span className="text-[10px]">واتساب</span>
                </Button>
              )}
              {contact.phone && (
                <Button 
                  variant="outline" 
                  className="h-12 flex-col gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={handleCall}
                >
                  <Phone className="h-5 w-5" />
                  <span className="text-[10px]">اتصال</span>
                </Button>
              )}
              {contact.email && (
                <Button 
                  variant="outline" 
                  className="h-12 flex-col gap-1 text-purple-600 border-purple-200 hover:bg-purple-50"
                  onClick={handleEmail}
                >
                  <Mail className="h-5 w-5" />
                  <span className="text-[10px]">بريد</span>
                </Button>
              )}
            </div>

            <Separator />

            {/* Financial Summary */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">الملخص المالي</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-muted/50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">إجمالي العمليات</p>
                  <p className="text-sm font-bold">{contact.totalTransactions}</p>
                </div>
                <div className="bg-green-500/10 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-green-600 flex items-center justify-center gap-0.5">
                    <ArrowDownRight className="h-3 w-3" />
                    لنا
                  </p>
                  <p className="text-sm font-bold text-green-600">
                    {contact.totalDebit.toLocaleString('ar-SA')}
                  </p>
                </div>
                <div className="bg-red-500/10 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-red-600 flex items-center justify-center gap-0.5">
                    <ArrowUpRight className="h-3 w-3" />
                    علينا
                  </p>
                  <p className="text-sm font-bold text-red-600">
                    {contact.totalCredit.toLocaleString('ar-SA')}
                  </p>
                </div>
              </div>
              
              {/* Balance */}
              <div className={cn(
                "rounded-lg p-3 text-center",
                contact.balance > 0 ? 'bg-green-500/10' : contact.balance < 0 ? 'bg-red-500/10' : 'bg-muted/50'
              )}>
                <p className="text-xs text-muted-foreground">الرصيد الحالي</p>
                <p className={cn(
                  "text-xl font-bold",
                  contact.balance > 0 ? 'text-destructive' : contact.balance < 0 ? 'text-emerald-600' : ''
                )}>
                  {contact.balance > 0 ? '-' : contact.balance < 0 ? '+' : ''}{Math.abs(contact.balance).toLocaleString()} $
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {contact.balance > 0 ? 'مدين (Debit)' : contact.balance < 0 ? 'دائن (Credit)' : 'لا يوجد رصيد'}
                </p>
              </div>

              {/* آخر عملية */}
              {transactions.length > 0 && (
                <div className={cn(
                  "rounded-lg p-2.5 text-center border",
                  transactions[0].type === 'out' ? 'border-red-200 bg-red-50/50' : 'border-green-200 bg-green-50/50'
                )}>
                  <p className="text-[10px] text-muted-foreground">آخر عملية</p>
                  <p className={cn(
                    "text-sm font-bold",
                    transactions[0].type === 'out' ? 'text-destructive' : 'text-emerald-600'
                  )}>
                    {transactions[0].type === 'out' ? '-' : '+'}{transactions[0].amount.toLocaleString()} $
                  </p>
                  <p className="text-[9px] text-muted-foreground truncate">{transactions[0].description}</p>
                </div>
              )}
            </div>

            {/* Contact Info */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">معلومات الاتصال</h3>
              <div className="space-y-1.5">
                {contact.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span dir="ltr">{contact.phone}</span>
                  </div>
                )}
                {contact.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.email}</span>
                  </div>
                )}
                {contact.address && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.address}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>تمت الإضافة: {new Date(contact.createdAt).toLocaleDateString('ar-SA')}</span>
                </div>
              </div>
            </div>

            {/* Linked Contacts */}
            {linkedContacts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-1">
                  <Link2 className="h-4 w-4" />
                  جهات اتصال مرتبطة
                </h3>
                <div className="space-y-1">
                  {linkedContacts.map(linked => {
                    const LinkedIcon = TypeIcons[linked.type];
                    return (
                      <button
                        key={linked.id}
                        onClick={() => onViewLinkedContact?.(linked)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <LinkedIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm flex-1 text-right">{linked.name}</span>
                        <Badge variant="outline" className="text-[9px]">
                          {CONTACT_TYPE_LABELS[linked.type]}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Transactions */}
            {transactions.length > 0 && (
              <Collapsible open={showTransactions} onOpenChange={setShowTransactions}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-10">
                    <span className="text-sm">آخر العمليات ({transactions.length})</span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", showTransactions && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1">
                  {transactions.slice(0, 5).map(tx => (
                    <div key={tx.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        {tx.type === 'in' ? (
                          <ArrowDownRight className="h-4 w-4 text-green-600" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-red-600" />
                        )}
                        <div>
                          <p className="text-xs font-medium truncate max-w-[150px]">{tx.description}</p>
                          <p className="text-[10px] text-muted-foreground">{tx.date}</p>
                        </div>
                      </div>
                      <span className={cn(
                        "text-sm font-bold",
                        tx.type === 'in' ? 'text-green-600' : 'text-red-600'
                      )}>
                        {tx.type === 'in' ? '+' : '-'}{tx.amount.toLocaleString('ar-SA')}
                      </span>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Notes */}
            {contact.notes && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">ملاحظات</h3>
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-2">
                  {contact.notes}
                </p>
              </div>
            )}

            <Separator />

            {/* Actions */}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1 h-10 gap-1"
                onClick={() => onEdit(contact)}
              >
                <Edit2 className="h-4 w-4" />
                تعديل
              </Button>
              <Button 
                variant="outline" 
                className="h-10 text-destructive hover:bg-destructive/10"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
