import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface TransactionCategory {
  id: string;
  user_id: string;
  name: string;
  type: 'in' | 'out';
  created_at: string;
}

export function useTransactionCategories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<TransactionCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('transaction_categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching categories:', error);
      toast.error('خطأ في جلب الفئات');
    } else {
      setCategories(data || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const addCategory = useCallback(async (name: string, type: 'in' | 'out') => {
    if (!user) return;
    const { data, error } = await supabase
      .from('transaction_categories')
      .insert([{ user_id: user.id, name, type }])
      .select()
      .single();

    if (error) {
      console.error('Error adding category:', error);
      toast.error('خطأ في إضافة الفئة');
      return null;
    }
    setCategories(prev => [...prev, data]);
    toast.success('تم إضافة الفئة بنجاح');
    return data;
  }, [user]);

  const updateCategory = useCallback(async (id: string, name: string) => {
    const { error } = await supabase
      .from('transaction_categories')
      .update({ name })
      .eq('id', id);

    if (error) {
      console.error('Error updating category:', error);
      toast.error('خطأ في تعديل الفئة');
      return false;
    }
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
    toast.success('تم تعديل الفئة بنجاح');
    return true;
  }, []);

  const deleteCategory = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('transaction_categories')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting category:', error);
      toast.error('خطأ في حذف الفئة');
      return false;
    }
    setCategories(prev => prev.filter(c => c.id !== id));
    toast.success('تم حذف الفئة بنجاح');
    return true;
  }, []);

  return {
    categories,
    loading,
    addCategory,
    updateCategory,
    deleteCategory,
    refreshCategories: fetchCategories
  };
}
