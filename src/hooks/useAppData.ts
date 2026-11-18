import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { repository } from '../lib/repository';
import { flushOfflineQueue, getQueuedMutations } from '../lib/offlineQueue';
import {
  ChecklistItem,
  CorrectiveAction,
  Inspection,
  InspectionResultRow,
  Site,
  SiteOverview,
  VehicleWash,
} from '../types/database';
import { useOnlineStatus } from './useOnlineStatus';

export function useAppData(isAuthenticated: boolean) {
  const isOnline = useOnlineStatus();
  const [overview, setOverview] = useState<SiteOverview[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [inspectionResults, setInspectionResults] = useState<InspectionResultRow[]>([]);
  const [correctiveActions, setCorrectiveActions] = useState<CorrectiveAction[]>([]);
  const [vehicleWashes, setVehicleWashes] = useState<VehicleWash[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(0);

  const debounceTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  const refreshQueueCount = useCallback(async () => {
    const q = await getQueuedMutations();
    setPendingOfflineCount(q.length);
  }, []);

  const fetchAllData = useCallback(
    async (silent = false) => {
      if (!isAuthenticated) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const [
          ovData,
          sitesData,
          itemsData,
          inspData,
          resData,
          actData,
          washData,
        ] = await Promise.all([
          repository.getSiteOverview().catch(() => [] as SiteOverview[]),
          repository.getSites(true),
          repository.getChecklistItems(),
          repository.getInspections(),
          repository.getInspectionResults(),
          repository.getCorrectiveActions(),
          repository.getVehicleWashes(),
        ]);
        setOverview(ovData);
        setSites(sitesData);
        setChecklistItems(itemsData);
        setInspections(inspData);
        setInspectionResults(resData);
        setCorrectiveActions(actData);
        setVehicleWashes(washData);
        await refreshQueueCount();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu từ máy chủ.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [isAuthenticated, refreshQueueCount]
  );

  // Schedule debounced silent refresh (~300ms) for realtime updates
  const triggerDebouncedRefresh = useCallback(() => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      fetchAllData(true);
    }, 300);
  }, [fetchAllData]);

  // Initial fetch upon login
  useEffect(() => {
    if (isAuthenticated) {
      fetchAllData(false);
    } else {
      setOverview([]);
      setSites([]);
      setChecklistItems([]);
      setInspections([]);
      setInspectionResults([]);
      setCorrectiveActions([]);
      setVehicleWashes([]);
    }
  }, [isAuthenticated, fetchAllData]);

  // Sync offline IndexedDB queue when online
  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let mounted = true;
    (async () => {
      const synced = await flushOfflineQueue();
      if (mounted && synced > 0) {
        showToast(`Đã đồng bộ ${synced} thay đổi`);
        fetchAllData(true);
      } else if (mounted) {
        await refreshQueueCount();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isAuthenticated, isOnline, fetchAllData, refreshQueueCount, showToast]);

  // Subscribe to Supabase Realtime ONLY when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const channel = supabase
      .channel('biowash-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sites' },
        () => triggerDebouncedRefresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checklist_items' },
        (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new) {
            const newRow = payload.new as Partial<ChecklistItem>;
            const byWho = newRow.last_checked_by || 'đồng nghiệp';
            showToast(`Hạng mục "${newRow.title || ''}" vừa được ${byWho} cập nhật`);
          }
          triggerDebouncedRefresh();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inspections' },
        () => triggerDebouncedRefresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inspection_results' },
        () => triggerDebouncedRefresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'corrective_actions' },
        () => triggerDebouncedRefresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vehicle_washes' },
        () => triggerDebouncedRefresh()
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, triggerDebouncedRefresh, showToast]);

  return {
    isOnline,
    overview,
    sites,
    checklistItems,
    inspections,
    inspectionResults,
    correctiveActions,
    vehicleWashes,
    loading,
    error,
    toastMessage,
    pendingOfflineCount,
    showToast,
    refreshAll: () => fetchAllData(true),
    refreshQueueCount,
  };
}

// Specific domain hooks as requested in Section 10
export function useSites(sites: Site[]) {
  const activeSites = sites.filter((s) => s.is_active);
  const hiddenSites = sites.filter((s) => !s.is_active);
  return { sites, activeSites, hiddenSites };
}

export function useChecklistItems(items: ChecklistItem[], siteId?: string | null) {
  const siteItems = siteId ? items.filter((i) => i.site_id === siteId) : items;
  const activeItems = siteItems
    .filter((i) => i.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
  const hiddenItems = siteItems
    .filter((i) => !i.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
  return { siteItems, activeItems, hiddenItems };
}

export function useOverview(overview: SiteOverview[], activeSites: Site[]) {
  const activeIds = new Set(activeSites.map((s) => s.id));
  return overview.filter((o) => activeIds.has(o.site_id));
}
