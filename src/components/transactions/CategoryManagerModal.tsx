import { useState } from 'react';
import { Plus, Search, Edit2, Trash2, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTransactionCategories } from '@/hooks/useTransactionCategories';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface CategoryManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CategoryManagerModal({ open, onOpenChange }: CategoryManagerModalProps) {
  const { categories, addCategory, updateCategory, deleteCategory } = useTransactionCategories();
  const [searchTerm, setSearchTerm] = useState('');
  const [newName, setNewName] = useState('');
  const [activeTab, setActiveTab] = useState<'out' | 'in'>('out');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const filteredCategories = categories.filter(c =>
    c.type === activeTab &&
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addCategory(newName, activeTab);
    setNewName('');
  };

  const handleUpdate = async (id: string) => {
    if (!editingName.trim()) return;
    await updateCategory(id, editingName);
    setEditingId(null);
  };

  const startEditing = (category: any) => {
    setEditingId(category.id);
    setEditingName(category.name);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>إدارة أنواع العمليات</DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-4 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-9">
              <TabsTrigger value="out" className="text-xs">مصاريف</TabsTrigger>
              <TabsTrigger value="in" className="text-xs">إيرادات</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث في الأنواع..."
              className="h-9 pr-8 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="إضافة نوع جديد..."
              className="h-9 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <Button size="sm" onClick={handleAdd} className="h-9 px-3">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-1 mt-2">
            {filteredCategories.length === 0 ? (
              <p className="text-center py-4 text-xs text-muted-foreground">لا توجد نتائج</p>
            ) : (
              filteredCategories.map(category => (
                <div
                  key={category.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-md border text-sm group transition-colors",
                    editingId === category.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  )}
                >
                  {editingId === category.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-7 text-xs flex-1"
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdate(category.id)}
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => handleUpdate(category.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="font-medium">{category.name}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEditing(category)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteCategory(category.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
