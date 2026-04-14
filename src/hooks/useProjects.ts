import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Project, ProjectStatus, ProjectStats } from '@/types/finance';
import { useRealtimeSync } from './useRealtimeSync';
import { cacheSet, cacheGet } from '@/lib/offlineCache';
import { guardOffline } from '@/lib/offlineGuard';

// Activity log helper (fire-and-forget)
const logToActivity = async (userId: string, eventType: string, entityType: string, entityId: string | null, entityName: string | null, details: Record<string, any> = {}, status = 'active') => {
  try { await supabase.from('activity_log').insert({ user_id: userId, event_type: eventType, entity_type: entityType, entity_id: entityId, entity_name: entityName, details, status } as any); } catch {}
};

export function useProjects() {
  const { user } = useAuth();
  const PAGE_SIZE = 20;
  const [projects, setProjects] = useState<Project[]>(() => cacheGet<Project[]>('projects') || []);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const realtimeRef = useRef<{ suppressNext: (ms?: number) => void }>({ suppressNext: () => {} });

  const fetchProjects = useCallback(async (reset = false) => {
    if (!user) return;
    const currentPage = reset ? 0 : page;
    if (!initialLoaded) setLoading(true);
    else if (!reset) setLoadingMore(true);
    
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, notes, client_id, vendor_id, contract_value, expenses, received_amount, commission, currency_difference, profit, status, start_date, end_date, attachments, created_at, updated_at, created_by_name, client:contacts!projects_client_id_fkey(name), vendor:contacts!projects_vendor_id_fkey(name)')
      .order('created_at', { ascending: false })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);
    
    if (error) { console.error('Error fetching projects:', error); }
    else {
      const mapped = (data || []).map(p => ({
        id: p.id,
        name: p.name,
        description: p.notes || undefined,
        clientId: p.client_id || undefined,
        clientName: (p.client as any)?.name || undefined,
        vendorId: p.vendor_id || undefined,
        vendorName: (p.vendor as any)?.name || undefined,
        contractValue: Number(p.contract_value),
        expenses: Number(p.expenses),
        receivedAmount: Number(p.received_amount),
        commission: Number(p.commission || 0),
        currencyDifference: Number(p.currency_difference || 0),
        profit: Number(p.profit),
        status: p.status as ProjectStatus,
        startDate: p.start_date || undefined,
        endDate: p.end_date || undefined,
        notes: p.notes || undefined,
        attachments: (p as any).attachments || [],
        createdByName: (p as any).created_by_name || undefined,
        createdAt: new Date(p.created_at),
        updatedAt: new Date(p.updated_at),
      }));
      if (reset || currentPage === 0) {
        setProjects(mapped);
        cacheSet('projects', mapped);
        setPage(0);
      } else {
        setProjects(prev => [...prev, ...mapped]);
      }
      setHasMore((data || []).length === PAGE_SIZE);
    }
    setLoading(false);
    setLoadingMore(false);
    setInitialLoaded(true);
  }, [user, page, initialLoaded]);

  useEffect(() => {
    if (user) fetchProjects(true);
  }, [user]);

  // Realtime: auto-refresh when projects change
  const rt = useRealtimeSync(['projects'], () => {
    fetchProjects(true);
  });
  realtimeRef.current = rt;

  const loadMore = useCallback(() => {
    if (hasMore && !loadingMore) setPage(prev => prev + 1);
  }, [hasMore, loadingMore]);

  useEffect(() => {
    if (page > 0) fetchProjects();
  }, [page]);

  const addProject = useCallback(async (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'profit' | 'receivedAmount'>) => {
    if (!user) return;
    if (guardOffline()) return;
    const { data, error } = await supabase.rpc('create_project_with_accounting', {
      p_name: project.name,
      p_client_id: project.clientId || null,
      p_vendor_id: project.vendorId || null,
      p_contract_value: project.contractValue,
      p_expenses: project.expenses,
      p_commission: project.commission,
      p_currency_difference: project.currencyDifference,
      p_status: project.status,
      p_start_date: project.startDate || null,
      p_end_date: project.endDate || null,
      p_notes: project.description || project.notes || null,
    });
    if (error) { toast.error('خطأ في إضافة المشروع'); console.error(error); return; }
    // Save attachments separately if provided
    if (data && project.attachments && project.attachments.length > 0) {
      await supabase.from('projects').update({ attachments: project.attachments }).eq('id', data as string);
    }
    toast.success('تم إضافة المشروع بنجاح - تم ترحيل القيود المحاسبية تلقائياً');
    if (user && data) await logToActivity(user.id, 'project_created', 'project', data as string, project.name, { contractValue: project.contractValue, status: project.status });
    realtimeRef.current.suppressNext();
    await fetchProjects();
    return data;
  }, [user, fetchProjects]);

  const updateProject = useCallback(async (id: string, updates: Partial<Project>) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    const merged = { ...project, ...updates };

    const { error } = await supabase.rpc('update_project_with_accounting', {
      p_project_id: id,
      p_name: merged.name,
      p_client_id: merged.clientId || null,
      p_vendor_id: merged.vendorId || null,
      p_contract_value: merged.contractValue,
      p_expenses: merged.expenses,
      p_commission: merged.commission,
      p_currency_difference: merged.currencyDifference,
      p_status: merged.status,
      p_start_date: merged.startDate || null,
      p_end_date: merged.endDate || null,
      p_notes: merged.description || merged.notes || null,
      p_received_amount: merged.receivedAmount,
    });
    if (error) { toast.error('خطأ في تحديث المشروع'); console.error(error); return; }
    // Update attachments separately
    if (updates.attachments !== undefined) {
      await supabase.from('projects').update({ attachments: updates.attachments }).eq('id', id);
    }
    toast.success('تم تحديث المشروع');
    if (user) await logToActivity(user.id, 'project_updated', 'project', id, merged.name, { contractValue: merged.contractValue, status: merged.status });
    realtimeRef.current.suppressNext();
    await fetchProjects();
  }, [projects, fetchProjects]);

  const deleteProject = useCallback(async (id: string) => {
    const project = projects.find(p => p.id === id);
    const { error } = await (supabase.rpc as any)('delete_project_with_accounting', {
      p_project_id: id,
    });
    if (error) { toast.error('خطأ في حذف المشروع'); console.error(error); return; }
    toast.success('تم حذف المشروع وجميع القيود المرتبطة');
    if (user && project) await logToActivity(user.id, 'project_deleted', 'project', id, project.name, { contractValue: project.contractValue, profit: project.profit }, 'deleted');
    realtimeRef.current.suppressNext();
    await fetchProjects();
  }, [user, projects, fetchProjects]);

  const getProjectStats = useCallback((): ProjectStats => {
    const activeProjects = projects.filter(p => p.status === 'active').length;
    const completedProjects = projects.filter(p => p.status === 'completed').length;
    const expectedProfit = projects.filter(p => p.status === 'active').reduce((sum, p) => sum + p.profit, 0);
    const realizedProfit = projects.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.profit, 0);
    return { totalProjects: projects.length, activeProjects, completedProjects, expectedProfit, realizedProfit };
  }, [projects]);

  return {
    projects, loading, initialLoaded,
    hasMore, loadingMore, loadMore,
    addProject, updateProject, deleteProject,
    getProjectStats, fetchProjects,
  };
}
