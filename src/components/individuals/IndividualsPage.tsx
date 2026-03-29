import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Plus, Phone, Mail, Edit, TrendingUp, TrendingDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Individual } from '@/types/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface IndividualsPageProps {
  individuals: Individual[];
  onAddIndividual: (individual: Omit<Individual, 'id' | 'createdAt' | 'totalIncome' | 'totalExpense'>) => void;
}

export function IndividualsPage({ individuals, onAddIndividual }: IndividualsPageProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const handleAddIndividual = () => {
    if (!newName || !newRole) return;
    
    onAddIndividual({
      name: newName,
      role: newRole,
      phone: newPhone || undefined,
      email: newEmail || undefined,
      notes: newNotes || undefined,
    });

    setNewName('');
    setNewRole('');
    setNewPhone('');
    setNewEmail('');
    setNewNotes('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">سجل الأفراد</h2>
        <Button
          size="sm"
          onClick={() => setShowAddForm(true)}
          className="gap-1 h-7 text-[10px]"
        >
          <Plus className="h-3 w-3" />
          إضافة فرد جديد
        </Button>
      </div>

      {/* قائمة الأفراد */}
      <div className="space-y-2">
        {individuals.map((individual, index) => {
          const balance = individual.totalIncome - individual.totalExpense;
          
          return (
            <motion.div
              key={individual.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="rounded-xl bg-card p-3 shadow-sm border border-border"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{individual.name}</p>
                  <p className="text-[10px] text-muted-foreground">{individual.role}</p>
                </div>

                <button className="p-1.5 hover:bg-muted rounded-md">
                  <Edit className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>

              <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                {individual.phone && (
                  <div className="flex items-center gap-0.5">
                    <Phone className="h-2.5 w-2.5" />
                    <span>{individual.phone}</span>
                  </div>
                )}
                {individual.email && (
                  <div className="flex items-center gap-0.5">
                    <Mail className="h-2.5 w-2.5" />
                    <span>{individual.email}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border">
                <div className="flex-1 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                  <span className="text-[10px] text-muted-foreground">وارد:</span>
                  <span className="text-xs font-bold text-emerald-600">
                    ${individual.totalIncome.toLocaleString()}
                  </span>
                </div>
                <div className="flex-1 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 text-rose-500" />
                  <span className="text-[10px] text-muted-foreground">صادر:</span>
                  <span className="text-xs font-bold text-rose-600">
                    ${individual.totalExpense.toLocaleString()}
                  </span>
                </div>
                <div className="text-left">
                  <span className={cn(
                    "text-xs font-bold",
                    balance >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}>
                    ${balance.toLocaleString()}
                  </span>
                </div>
              </div>

              {individual.notes && (
                <p className="mt-2 text-[10px] text-muted-foreground bg-muted p-1.5 rounded">
                  {individual.notes}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>

      {individuals.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <User className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">لا يوجد أفراد مسجلين</p>
        </div>
      )}

      {/* نموذج إضافة فرد جديد */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setShowAddForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-card rounded-xl shadow-xl"
            >
              <div className="flex items-center justify-between p-3 border-b border-border">
                <h3 className="text-sm font-bold">إضافة فرد جديد</h3>
                <button onClick={() => setShowAddForm(false)} className="p-1 hover:bg-muted rounded">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-3 space-y-2.5">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">الاسم *</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="الاسم الكامل"
                    className="h-8 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">الدور/الوظيفة *</label>
                  <Input
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    placeholder="مثال: عميل، مورد، شريك"
                    className="h-8 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">رقم الهاتف/واتساب</label>
                  <Input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+966XXXXXXXXX"
                    className="h-8 text-xs"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">البريد الإلكتروني</label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="h-8 text-xs"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">ملاحظات</label>
                  <Textarea
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="ملاحظات إضافية..."
                    rows={2}
                    className="text-xs min-h-[50px] resize-none"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowAddForm(false)} className="flex-1 h-8 text-xs">
                    إلغاء
                  </Button>
                  <Button onClick={handleAddIndividual} disabled={!newName || !newRole} className="flex-1 h-8 text-xs">
                    إضافة
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
