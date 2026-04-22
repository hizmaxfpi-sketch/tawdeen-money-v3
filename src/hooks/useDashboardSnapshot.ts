// ============= Single Source of Truth — Dashboard Snapshot =============
// يجلب جميع إجماليات لوحة التحكم من نداء RPC واحد محسوب في الخادم.
// هذا الـ hook هو **المصدر الموحد** لجميع الأرقام الظاهرة في:
// - SummaryCards (لوحة التحكم)
// - أرباح المشاريع، أرباح الحاويات، إجماليات الدفتر
// - مبيعات/تكاليف الإنتاج، السيولة، المصاريف، المستحقات

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSync } from './useRealtimeSync';

export interface DashboardSnapshot {
  // مالية أساسية
  totalLiquidity: number;
  netCompanyProfit: number;
  totalExpenses: number;
  totalIncome: number;
  totalOutcome: number;
  totalReceivables: number;
  totalPayables: number;
  shippingReceivables: number;
  // الدفتر
  ledgerDebit: number;
  ledgerCredit: number;
  ledgerNet: number;
  // الأقسام
  projectProfit: number;
  containerProfit: number;
  productionSales: number;
  productionCost: number;
  productionExpenses: number;
  productionMaterialsValue: number;
  productionProductsValue: number;
  // ميتا
  computedAt: number;
}

const EMPTY: DashboardSnapshot = {
  totalLiquidity: 0, netCompanyProfit: 0, totalExpenses: 0,
  totalIncome: 0, totalOutcome: 0,
  totalReceivables: 0, totalPayables: 0, shippingReceivables: 0,
  ledgerDebit: 0, ledgerCredit: 0, ledgerNet: 0,
  projectProfit: 0, containerProfit: 0,
  productionSales: 0, productionCost: 0, productionExpenses: 0,
  productionMaterialsValue: 0, productionProductsValue: 0,
  computedAt: 0,
};

// كاش بسيط لمنع تكرار النداء عند التنقل السريع
let _cache: DashboardSnapshot | null = null;
let _cacheUserId: string | null = null;
let _cacheTime = 0;
const CACHE_TTL = 15_000; // 15 ثانية

export function useDashboardSnapshot() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(_cache || EMPTY);
  const [loading, setLoading] = useState(!_cache);
  const inflightRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSnapshot = useCallback(async (force = false) => {
    if (!user) return;
    if (!force && _cache && _cacheUserId === user.id && Date.now() - _cacheTime < CACHE_TTL) {
      setSnapshot(_cache);
      setLoading(false);
      return;
    }
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      const { data, error } = await (supabase.rpc as any)('get_dashboard_snapshot');
      if (!error && data) {
        const d = data as any;
        const next: DashboardSnapshot = {
          totalLiquidity: Number(d.totalLiquidity) || 0,
          netCompanyProfit: Number(d.netCompanyProfit) || 0,
          totalExpenses: Number(d.totalExpenses) || 0,
          totalIncome: Number(d.totalIncome) || 0,
          totalOutcome: Number(d.totalOutcome) || 0,
          totalReceivables: Number(d.totalReceivables) || 0,
          totalPayables: Number(d.totalPayables) || 0,
          shippingReceivables: Number(d.shippingReceivables) || 0,
          ledgerDebit: Number(d.ledgerDebit) || 0,
          ledgerCredit: Number(d.ledgerCredit) || 0,
          ledgerNet: Number(d.ledgerNet) || 0,
          projectProfit: Number(d.projectProfit) || 0,
          containerProfit: Number(d.containerProfit) || 0,
          productionSales: Number(d.productionSales) || 0,
          productionCost: Number(d.productionCost) || 0,
          productionExpenses: Number(d.productionExpenses) || 0,
          productionMaterialsValue: Number(d.productionMaterialsValue) || 0,
          productionProductsValue: Number(d.productionProductsValue) || 0,
          computedAt: Number(d.computedAt) || Date.now() / 1000,
        };
        _cache = next;
        _cacheUserId = user.id;
        _cacheTime = Date.now();
        setSnapshot(next);
      }
    } finally {
      inflightRef.current = false;
      setLoading(false);
    }
  }, [user]);

  // Debounced refresh — يُستدعى من Realtime لتجميع التغييرات المتتالية
  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      _cache = null; _cacheTime = 0;
      fetchSnapshot(true);
      debounceRef.current = null;
    }, 1000);
  }, [fetchSnapshot]);

  useEffect(() => {
    if (user) fetchSnapshot();
  }, [user, fetchSnapshot]);

  // الاستماع لكل الجداول التي تؤثر على اللقطة
  useRealtimeSync(
    ['transactions', 'funds', 'debts', 'projects', 'containers', 'shipments', 'contacts'],
    debouncedRefresh,
    1000
  );

  const refresh = useCallback(() => {
    _cache = null; _cacheTime = 0;
    return fetchSnapshot(true);
  }, [fetchSnapshot]);

  return { snapshot, loading, refresh };
}
