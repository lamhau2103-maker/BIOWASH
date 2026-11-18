import { supabase } from './supabase';
import { enqueueOfflineMutation, flushOfflineQueue } from './offlineQueue';
import {
  ChecklistGroup,
  ChecklistItem,
  CorrectiveAction,
  DEFAULT_GROUP_TITLES,
  DEFAULT_TEMPLATE_ITEMS,
  Inspection,
  InspectionResultRow,
  Profile,
  SeverityLevel,
  Site,
  SiteOverview,
  VehicleWash,
} from '../types/database';

function cleanGroupTitle(raw: string): string {
  return raw.replace(/^\d+[\)\.\-\:]\s*/, '').trim();
}

interface LegacyAdminOverlayState {
  sitesCreated?: Site[];
  sitesUpdated?: Record<string, Partial<Site>>;
  sitesDeleted?: string[];
  itemsCreated?: ChecklistItem[];
  itemsUpdated?: Record<string, Partial<ChecklistItem>>;
  itemsDeleted?: string[];
  inspectionsCreated?: Inspection[];
  inspectionsUpdated?: Record<string, Partial<Inspection>>;
  inspectionsDeleted?: string[];
  resultsUpserted?: Record<string, InspectionResultRow>;
  resultsDeletedByInspection?: string[];
  actionsCreated?: CorrectiveAction[];
  actionsUpdated?: Record<string, Partial<CorrectiveAction>>;
  actionsDeleted?: string[];
  washesCreated?: VehicleWash[];
  washesUpdated?: Record<string, Partial<VehicleWash>>;
  washesDeleted?: string[];
}

const LEGACY_OVERLAY_KEY = 'biowash_superadmin_overlay_v1';
const LEGACY_DIRECT_KEYS = [
  'biowash_sites',
  'biowash_checklist_items',
  'biowash_inspections',
  'biowash_inspection_results',
  'biowash_corrective_actions',
  'biowash_vehicle_washes',
  'sites',
  'checklist_items',
  'inspections',
  'inspection_results',
  'corrective_actions',
  'vehicle_washes',
];

function readLegacyOverlay(): LegacyAdminOverlayState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_OVERLAY_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LegacyAdminOverlayState;
  } catch {
    return null;
  }
}

export const repository = {
  // Check if browser has any legacy localStorage data waiting to be pushed to Supabase
  hasLegacyLocalData(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const overlay = readLegacyOverlay();
      if (overlay) {
        const hasOverlayItems =
          (overlay.sitesCreated?.length || 0) > 0 ||
          Object.keys(overlay.sitesUpdated || {}).length > 0 ||
          (overlay.itemsCreated?.length || 0) > 0 ||
          Object.keys(overlay.itemsUpdated || {}).length > 0 ||
          (overlay.inspectionsCreated?.length || 0) > 0 ||
          Object.keys(overlay.inspectionsUpdated || {}).length > 0 ||
          Object.keys(overlay.resultsUpserted || {}).length > 0 ||
          (overlay.actionsCreated?.length || 0) > 0 ||
          Object.keys(overlay.actionsUpdated || {}).length > 0 ||
          (overlay.washesCreated?.length || 0) > 0 ||
          Object.keys(overlay.washesUpdated || {}).length > 0;
        if (hasOverlayItems) return true;
      }
      for (const k of LEGACY_DIRECT_KEYS) {
        const val = window.localStorage.getItem(k);
        if (val && val !== '[]' && val !== '{}') return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  // Push all existing browser data (localStorage overlay + legacy keys + current snapshot + IndexedDB queue) to Supabase
  async syncLegacyLocalDataToSupabase(currentSnapshot?: {
    sites?: Site[];
    checklistItems?: ChecklistItem[];
    inspections?: Inspection[];
    inspectionResults?: InspectionResultRow[];
    correctiveActions?: CorrectiveAction[];
    vehicleWashes?: VehicleWash[];
  }): Promise<{ syncedCount: number; errors: string[] }> {
    let syncedCount = 0;
    const errors: string[] = [];

    // 1. Flush IndexedDB offline queue first
    try {
      const queueFlushed = await flushOfflineQueue();
      syncedCount += queueFlushed;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Lỗi đồng bộ hàng đợi ngoại tuyến');
    }

    const overlay = readLegacyOverlay();

    // Helper to parse legacy array keys if any exist in localStorage
    const readLegacyArray = <T>(keys: string[]): T[] => {
      if (typeof window === 'undefined') return [];
      const out: T[] = [];
      for (const k of keys) {
        try {
          const raw = window.localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) out.push(...parsed);
          }
        } catch {
          // ignore
        }
      }
      return out;
    };

    // 2. Sync Sites (Created + Updated + Snapshot + Legacy keys)
    const sitesToUpsert = new Map<string, Site>();
    (currentSnapshot?.sites || []).forEach((s) => {
      if (s?.id) sitesToUpsert.set(s.id, s);
    });
    readLegacyArray<Site>(['biowash_sites', 'sites']).forEach((s) => {
      if (s?.id) sitesToUpsert.set(s.id, s);
    });
    (overlay?.sitesCreated || []).forEach((s) => {
      if (s?.id) sitesToUpsert.set(s.id, s);
    });
    if (overlay?.sitesUpdated) {
      for (const [siteId, patch] of Object.entries(overlay.sitesUpdated)) {
        const existing = sitesToUpsert.get(siteId);
        if (existing) {
          sitesToUpsert.set(siteId, { ...existing, ...patch });
        } else {
          const { error } = await supabase.from('sites').update(patch).eq('id', siteId);
          if (!error) syncedCount++;
          else errors.push(`Cập nhật điểm rửa xe: ${error.message}`);
        }
      }
    }

    if (sitesToUpsert.size > 0) {
      const rows = Array.from(sitesToUpsert.values()).map((s) => ({
        id: s.id,
        name: s.name,
        site_type: s.site_type,
        address: s.address ?? null,
        lat: s.lat ?? null,
        lng: s.lng ?? null,
        manager_name: s.manager_name ?? null,
        manager_phone: s.manager_phone ?? null,
        inspect_cycle_days: s.inspect_cycle_days ?? 7,
        is_active: s.is_active ?? true,
      }));
      const { error } = await supabase.from('sites').upsert(rows, { onConflict: 'id' });
      if (!error) {
        syncedCount += rows.length;
      } else {
        errors.push(`Đồng bộ bảng sites: ${error.message}`);
      }
    }

    // Deletions for sites
    if (overlay?.sitesDeleted?.length) {
      for (const delSiteId of overlay.sitesDeleted) {
        await supabase.from('sites').delete().eq('id', delSiteId);
      }
    }

    // 3. Sync Checklist Items (Created + Updated + Snapshot + Legacy keys)
    const itemsToUpsert = new Map<string, ChecklistItem>();
    (currentSnapshot?.checklistItems || []).forEach((it) => {
      if (it?.id) itemsToUpsert.set(it.id, it);
    });
    readLegacyArray<ChecklistItem>(['biowash_checklist_items', 'checklist_items']).forEach((it) => {
      if (it?.id) itemsToUpsert.set(it.id, it);
    });
    (overlay?.itemsCreated || []).forEach((it) => {
      if (it?.id) itemsToUpsert.set(it.id, it);
    });
    if (overlay?.itemsUpdated) {
      for (const [itemId, patch] of Object.entries(overlay.itemsUpdated)) {
        const existing = itemsToUpsert.get(itemId);
        if (existing) {
          itemsToUpsert.set(itemId, { ...existing, ...patch });
        } else {
          const { error } = await supabase.from('checklist_items').update(patch).eq('id', itemId);
          if (!error) syncedCount++;
          else errors.push(`Cập nhật hạng mục: ${error.message}`);
        }
      }
    }

    if (itemsToUpsert.size > 0) {
      const rows = Array.from(itemsToUpsert.values()).map((it) => ({
        id: it.id,
        site_id: it.site_id,
        group_name: it.group_name,
        title: it.title,
        is_critical: it.is_critical ?? false,
        sort_order: it.sort_order ?? 1,
        is_active: it.is_active ?? true,
        current_status: it.current_status ?? 'pending',
        current_severity: it.current_severity ?? null,
        last_checked_at: it.last_checked_at ?? null,
        last_checked_by: it.last_checked_by ?? null,
        updated_at: it.updated_at ?? new Date().toISOString(),
      }));
      const { error } = await supabase.from('checklist_items').upsert(rows, { onConflict: 'id' });
      if (!error) {
        syncedCount += rows.length;
      } else {
        errors.push(`Đồng bộ bảng checklist_items: ${error.message}`);
      }
    }

    if (overlay?.itemsDeleted?.length) {
      for (const delItemId of overlay.itemsDeleted) {
        await supabase.from('checklist_items').delete().eq('id', delItemId);
      }
    }

    // 4. Sync Inspections
    const inspectionsToUpsert = new Map<string, Inspection>();
    (currentSnapshot?.inspections || []).forEach((ins) => {
      if (ins?.id) inspectionsToUpsert.set(ins.id, ins);
    });
    readLegacyArray<Inspection>(['biowash_inspections', 'inspections']).forEach((ins) => {
      if (ins?.id) inspectionsToUpsert.set(ins.id, ins);
    });
    (overlay?.inspectionsCreated || []).forEach((ins) => {
      if (ins?.id) inspectionsToUpsert.set(ins.id, ins);
    });
    if (overlay?.inspectionsUpdated) {
      for (const [inspId, patch] of Object.entries(overlay.inspectionsUpdated)) {
        const existing = inspectionsToUpsert.get(inspId);
        if (existing) {
          inspectionsToUpsert.set(inspId, { ...existing, ...patch });
        } else {
          const { error } = await supabase.from('inspections').update(patch).eq('id', inspId);
          if (!error) syncedCount++;
          else errors.push(`Cập nhật phiên kiểm tra: ${error.message}`);
        }
      }
    }

    if (inspectionsToUpsert.size > 0) {
      const rows = Array.from(inspectionsToUpsert.values()).map((ins) => ({
        id: ins.id,
        site_id: ins.site_id,
        kind: ins.kind || 'dieu_kien',
        inspector_id:
          ins.inspector_id === '00000000-0000-0000-0000-000000000001'
            ? null
            : ins.inspector_id ?? null,
        inspector_name: ins.inspector_name,
        status: ins.status || 'draft',
        score: ins.score ?? null,
        result: ins.result ?? null,
        signature_url: ins.signature_url ?? null,
        gps: ins.gps ?? null,
        started_at: ins.started_at || new Date().toISOString(),
        finished_at: ins.finished_at ?? null,
      }));
      const { error } = await supabase.from('inspections').upsert(rows, { onConflict: 'id' });
      if (!error) {
        syncedCount += rows.length;
      } else {
        errors.push(`Đồng bộ bảng inspections: ${error.message}`);
      }
    }

    // 5. Sync Inspection Results (including photo_urls)
    const resultsToUpsert = new Map<string, InspectionResultRow>();
    (currentSnapshot?.inspectionResults || []).forEach((r) => {
      if (r?.inspection_id && r?.item_id) {
        resultsToUpsert.set(`${r.inspection_id}_${r.item_id}`, r);
      }
    });
    readLegacyArray<InspectionResultRow>([
      'biowash_inspection_results',
      'inspection_results',
    ]).forEach((r) => {
      if (r?.inspection_id && r?.item_id) {
        resultsToUpsert.set(`${r.inspection_id}_${r.item_id}`, r);
      }
    });
    if (overlay?.resultsUpserted) {
      for (const [k, r] of Object.entries(overlay.resultsUpserted)) {
        resultsToUpsert.set(k, r);
      }
    }

    if (resultsToUpsert.size > 0) {
      const rows = Array.from(resultsToUpsert.values()).map((r) => ({
        inspection_id: r.inspection_id,
        item_id: r.item_id,
        site_id: r.site_id,
        item_title: r.item_title,
        group_name: r.group_name,
        is_critical: r.is_critical ?? false,
        status: r.status,
        severity: r.severity ?? null,
        note: r.note ?? null,
        photo_urls: Array.isArray(r.photo_urls) ? r.photo_urls : [],
        checked_at: r.checked_at || new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('inspection_results')
        .upsert(rows, { onConflict: 'inspection_id,item_id' });
      if (!error) {
        syncedCount += rows.length;
      } else {
        errors.push(`Đồng bộ bảng inspection_results: ${error.message}`);
      }
    }

    // 6. Sync Corrective Actions
    const actionsToUpsert = new Map<string, CorrectiveAction>();
    (currentSnapshot?.correctiveActions || []).forEach((a) => {
      if (a?.id) actionsToUpsert.set(a.id, a);
    });
    readLegacyArray<CorrectiveAction>(['biowash_corrective_actions', 'corrective_actions']).forEach(
      (a) => {
        if (a?.id) actionsToUpsert.set(a.id, a);
      }
    );
    (overlay?.actionsCreated || []).forEach((a) => {
      if (a?.id) actionsToUpsert.set(a.id, a);
    });
    if (overlay?.actionsUpdated) {
      for (const [actId, patch] of Object.entries(overlay.actionsUpdated)) {
        const existing = actionsToUpsert.get(actId);
        if (existing) {
          actionsToUpsert.set(actId, { ...existing, ...patch });
        } else {
          const { error } = await supabase
            .from('corrective_actions')
            .update(patch)
            .eq('id', actId);
          if (!error) syncedCount++;
          else errors.push(`Cập nhật sự vụ khắc phục: ${error.message}`);
        }
      }
    }

    if (actionsToUpsert.size > 0) {
      const rows = Array.from(actionsToUpsert.values()).map((a) => ({
        id: a.id,
        site_id: a.site_id,
        item_id: a.item_id ?? null,
        description: a.description,
        severity: a.severity ?? 'nghiem_trong',
        assignee: a.assignee ?? null,
        due_date: a.due_date ?? null,
        status: a.status || 'open',
        created_at: a.created_at || new Date().toISOString(),
        closed_at: a.closed_at ?? null,
      }));
      const { error } = await supabase.from('corrective_actions').upsert(rows, { onConflict: 'id' });
      if (!error) {
        syncedCount += rows.length;
      } else {
        errors.push(`Đồng bộ bảng corrective_actions: ${error.message}`);
      }
    }

    // 7. Sync Vehicle Washes
    const washesToUpsert = new Map<string, VehicleWash>();
    (currentSnapshot?.vehicleWashes || []).forEach((w) => {
      if (w?.id) washesToUpsert.set(w.id, w);
    });
    readLegacyArray<VehicleWash>(['biowash_vehicle_washes', 'vehicle_washes']).forEach((w) => {
      if (w?.id) washesToUpsert.set(w.id, w);
    });
    (overlay?.washesCreated || []).forEach((w) => {
      if (w?.id) washesToUpsert.set(w.id, w);
    });
    if (overlay?.washesUpdated) {
      for (const [washId, patch] of Object.entries(overlay.washesUpdated)) {
        const existing = washesToUpsert.get(washId);
        if (existing) {
          washesToUpsert.set(washId, { ...existing, ...patch });
        } else {
          const { error } = await supabase.from('vehicle_washes').update(patch).eq('id', washId);
          if (!error) syncedCount++;
          else errors.push(`Cập nhật nhật ký rửa xe: ${error.message}`);
        }
      }
    }

    if (washesToUpsert.size > 0) {
      const rows = Array.from(washesToUpsert.values()).map((w) => ({
        id: w.id,
        site_id: w.site_id,
        plate: w.plate,
        vehicle_type: w.vehicle_type,
        driver: w.driver ?? null,
        origin: w.origin ?? null,
        destination: w.destination ?? null,
        steps: w.steps ?? [],
        result: w.result ?? null,
        started_at: w.started_at || new Date().toISOString(),
        finished_at: w.finished_at ?? null,
      }));
      const { error } = await supabase.from('vehicle_washes').upsert(rows, { onConflict: 'id' });
      if (!error) {
        syncedCount += rows.length;
      } else {
        errors.push(`Đồng bộ bảng vehicle_washes: ${error.message}`);
      }
    }

    // Clear legacy localStorage keys if sync succeeded without table errors
    if (errors.length === 0 && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(LEGACY_OVERLAY_KEY);
        for (const k of LEGACY_DIRECT_KEYS) {
          window.localStorage.removeItem(k);
        }
      } catch {
        // ignore
      }
    }

    return { syncedCount, errors };
  },

  // 1. Profile
  async getProfile(userId: string): Promise<Profile | null> {
    if (userId === '00000000-0000-0000-0000-000000000001') {
      return {
        id: userId,
        full_name: 'Quản trị viên cao nhất (Admin TVC)',
        role: 'admin',
      };
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    return data as Profile | null;
  },

  // 2. Overview & Sites (Read/Write directly from/to Supabase)
  async getSiteOverview(): Promise<SiteOverview[]> {
    // Compute overview directly from active checklist_items & corrective_actions so counts/scores update immediately
    const [allSites, allItems, allActions] = await Promise.all([
      this.getSites(false),
      this.getChecklistItems(),
      this.getCorrectiveActions(),
    ]);

    const now = Date.now();
    return allSites.map((s) => {
      const sItems = allItems.filter((it) => it.site_id === s.id && it.is_active);
      const sActions = allActions.filter((a) => a.site_id === s.id && a.status !== 'closed');
      const overdueCount = sActions.filter(
        (a) => a.due_date && new Date(a.due_date).getTime() + 86400000 < now
      ).length;

      const totalItems = sItems.length;
      const passItems = sItems.filter((it) => it.current_status === 'pass').length;
      const failItems = sItems.filter((it) => it.current_status === 'fail').length;
      const pendingItems = sItems.filter((it) => it.current_status === 'pending').length;
      const critFail = sItems.filter(
        (it) => it.is_critical && it.current_status === 'fail'
      ).length;
      const checkedCount = passItems + failItems;
      const computedPct = checkedCount > 0 ? Math.round((passItems / checkedCount) * 100) : 100;

      const lastCheckedDates = sItems
        .map((it) => it.last_checked_at)
        .filter((d): d is string => !!d)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

      return {
        site_id: s.id,
        name: s.name,
        site_type: s.site_type,
        lat: s.lat,
        lng: s.lng,
        total_items: totalItems,
        pass_items: passItems,
        fail_items: failItems,
        pending_items: pendingItems,
        critical_fail: critFail,
        compliance_pct: computedPct,
        last_checked_at: lastCheckedDates[0] ?? null,
        open_actions: sActions.length,
        overdue_actions: overdueCount,
      };
    });
  },

  async getSites(includeInactive = true): Promise<Site[]> {
    let query = supabase.from('sites').select('*').order('name', { ascending: true });
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Không thể tải danh sách điểm rửa xe từ Supabase: ${error.message}`);
    }
    const list = ((data || []) as Site[]).filter((s) => (includeInactive ? true : s.is_active));
    list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return list;
  },

  async createSite(
    sitePayload: Omit<Site, 'id'>,
    copyFromSiteId?: string | null
  ): Promise<Site> {
    const { data, error: siteErr } = await supabase
      .from('sites')
      .insert(sitePayload)
      .select('*')
      .single();

    if (siteErr || !data) {
      throw new Error(
        `Không thể lưu điểm rửa xe vào Supabase (${siteErr?.message || 'Lỗi RLS'}). Hãy kiểm tra phân quyền RLS trên Supabase.`
      );
    }

    const newSite = data as Site;

    // Copy checklist groups & items either from another site or from default 6-group template
    let sourceGroupTitles: string[] = [...DEFAULT_GROUP_TITLES];
    let itemsToInsert: Array<{
      site_id: string;
      group_id?: string | null;
      group_name: string;
      title: string;
      is_critical: boolean;
      sort_order: number;
      is_active: boolean;
      current_status: 'pending';
    }> = [];

    if (copyFromSiteId) {
      const [sourceGroups, sourceAllItems] = await Promise.all([
        this.getChecklistGroups(copyFromSiteId),
        this.getChecklistItems(copyFromSiteId),
      ]);
      const sourceItems = sourceAllItems.filter((it) => it.is_active);
      if (sourceGroups.length > 0) {
        sourceGroupTitles = sourceGroups.map((g) => cleanGroupTitle(g.title));
      } else if (sourceItems.length > 0) {
        const seen = new Set<string>();
        sourceGroupTitles = [];
        sourceItems.forEach((it) => {
          const cl = cleanGroupTitle(it.group_name);
          if (cl && !seen.has(cl.toLowerCase())) {
            seen.add(cl.toLowerCase());
            sourceGroupTitles.push(cl);
          }
        });
      }

      if (sourceItems.length > 0) {
        itemsToInsert = sourceItems.map((it, idx) => ({
          site_id: newSite.id,
          group_name: cleanGroupTitle(it.group_name) || it.group_name,
          title: it.title,
          is_critical: it.is_critical,
          sort_order: it.sort_order ?? idx + 1,
          is_active: true,
          current_status: 'pending',
        }));
      }
    }

    if (itemsToInsert.length === 0) {
      itemsToInsert = DEFAULT_TEMPLATE_ITEMS.map((it) => ({
        site_id: newSite.id,
        group_name: cleanGroupTitle(it.group_name) || it.group_name,
        title: it.title,
        is_critical: it.is_critical,
        sort_order: it.sort_order,
        is_active: true,
        current_status: 'pending',
      }));
    }

    // Create initial checklist_groups for the new site
    const groupMapByNorm = new Map<string, string>();
    for (let i = 0; i < sourceGroupTitles.length; i++) {
      const gTitle = cleanGroupTitle(sourceGroupTitles[i]);
      if (!gTitle) continue;
      try {
        const createdGrp = await this.createChecklistGroup({
          site_id: newSite.id,
          title: gTitle,
          sort_order: i + 1,
        });
        if (createdGrp?.id && !createdGrp.id.startsWith('virtual_')) {
          groupMapByNorm.set(gTitle.toLowerCase(), createdGrp.id);
        }
      } catch {
        // Ignore if checklist_groups table not yet migrated
      }
    }

    // Attach group_id to items if groups were created in DB
    const rowsWithGroupId = itemsToInsert.map((it) => {
      const norm = cleanGroupTitle(it.group_name).toLowerCase();
      const gId = groupMapByNorm.get(norm);
      return gId ? { ...it, group_id: gId } : it;
    });

    let { error: itemsErr } = await supabase.from('checklist_items').insert(rowsWithGroupId);
    if (itemsErr && groupMapByNorm.size > 0) {
      // Fallback if group_id column hasn't been added to checklist_items yet
      const fallbackRows = itemsToInsert.map(({ group_id: _gid, ...rest }) => rest);
      const retry = await supabase.from('checklist_items').insert(fallbackRows);
      itemsErr = retry.error;
    }
    if (itemsErr) {
      throw new Error(`Đã tạo điểm nhưng lỗi tạo bộ hạng mục trên Supabase: ${itemsErr.message}`);
    }

    return newSite;
  },

  async updateSite(siteId: string, payload: Partial<Omit<Site, 'id'>>): Promise<Site> {
    const { data, error } = await supabase
      .from('sites')
      .update(payload)
      .eq('id', siteId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(
        `Không thể cập nhật điểm rửa xe trên Supabase: ${error?.message || 'Lỗi quyền ghi RLS'}`
      );
    }
    return data as Site;
  },

  async deleteSite(siteId: string): Promise<void> {
    await supabase.from('inspection_results').delete().eq('site_id', siteId);
    await supabase.from('corrective_actions').delete().eq('site_id', siteId);
    await supabase.from('inspections').delete().eq('site_id', siteId);
    await supabase.from('vehicle_washes').delete().eq('site_id', siteId);
    await supabase.from('checklist_items').delete().eq('site_id', siteId);
    try {
      await supabase.from('checklist_groups').delete().eq('site_id', siteId);
    } catch {
      // ignore if table not created yet
    }
    const { error } = await supabase.from('sites').delete().eq('id', siteId);
    if (error) {
      throw new Error(`Không thể xóa điểm rửa xe trên Supabase: ${error.message}`);
    }
  },

  // 3. Checklist Items & Checklist Groups (Read/Write directly from/to Supabase)
  async getChecklistItems(siteId?: string): Promise<ChecklistItem[]> {
    let query = supabase
      .from('checklist_items')
      .select('*')
      .order('sort_order', { ascending: true });
    if (siteId) {
      query = query.eq('site_id', siteId);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Không thể tải hạng mục checklist từ Supabase: ${error.message}`);
    }
    const list = (data || []) as ChecklistItem[];
    list.sort((a, b) => a.sort_order - b.sort_order);
    return list;
  },

  async createChecklistItem(payload: {
    site_id: string;
    group_id?: string | null;
    group_name: string;
    title: string;
    is_critical: boolean;
    sort_order: number;
  }): Promise<ChecklistItem> {
    const nowIso = new Date().toISOString();
    const insertRow: Record<string, unknown> = {
      site_id: payload.site_id,
      group_name: payload.group_name,
      title: payload.title,
      is_critical: payload.is_critical,
      sort_order: payload.sort_order,
      is_active: true,
      current_status: 'pending',
      updated_at: nowIso,
    };
    if (payload.group_id && !payload.group_id.startsWith('virtual_')) {
      insertRow.group_id = payload.group_id;
    }

    let { data, error } = await supabase
      .from('checklist_items')
      .insert(insertRow)
      .select('*')
      .single();

    if (error && insertRow.group_id) {
      // Retry without group_id in case SQL column group_id wasn't migrated yet
      delete insertRow.group_id;
      const retry = await supabase
        .from('checklist_items')
        .insert(insertRow)
        .select('*')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) {
      throw new Error(`Không thể thêm hạng mục vào Supabase: ${error?.message || 'Lỗi RLS'}`);
    }
    return data as ChecklistItem;
  },

  async updateChecklistItem(
    itemId: string,
    payload: Partial<
      Pick<
        ChecklistItem,
        | 'title'
        | 'group_id'
        | 'group_name'
        | 'is_critical'
        | 'sort_order'
        | 'is_active'
        | 'current_status'
        | 'current_severity'
      >
    >
  ): Promise<ChecklistItem> {
    const updateData: Record<string, unknown> = {
      ...payload,
      updated_at: new Date().toISOString(),
    };
    if (typeof updateData.group_id === 'string' && updateData.group_id.startsWith('virtual_')) {
      delete updateData.group_id;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueueOfflineMutation({
        table: 'checklist_items',
        operation: 'update',
        payload: updateData,
        matchColumn: 'id',
        matchValue: itemId,
      });
      return { id: itemId, ...updateData } as ChecklistItem;
    }

    let { data, error } = await supabase
      .from('checklist_items')
      .update(updateData)
      .eq('id', itemId)
      .select('*')
      .single();

    if (error && 'group_id' in updateData) {
      delete updateData.group_id;
      const retry = await supabase
        .from('checklist_items')
        .update(updateData)
        .eq('id', itemId)
        .select('*')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) {
      throw new Error(`Không thể cập nhật hạng mục trên Supabase: ${error?.message || 'Lỗi RLS'}`);
    }
    return data as ChecklistItem;
  },

  async deleteChecklistItem(itemId: string): Promise<void> {
    await supabase.from('inspection_results').delete().eq('item_id', itemId);
    await supabase.from('corrective_actions').delete().eq('item_id', itemId);
    const { error } = await supabase.from('checklist_items').delete().eq('id', itemId);
    if (error) {
      throw new Error(`Không thể xóa hạng mục trên Supabase: ${error.message}`);
    }
  },

  // Smart Delete Item: Soft delete (is_active = false) if item has history in inspection_results, otherwise Hard delete
  async smartDeleteChecklistItem(itemId: string): Promise<{ mode: 'soft' | 'hard' }> {
    const { count, error: countErr } = await supabase
      .from('inspection_results')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', itemId);

    if (!countErr && count !== null && count > 0) {
      await this.updateChecklistItem(itemId, { is_active: false });
      return { mode: 'soft' };
    }

    await supabase.from('corrective_actions').delete().eq('item_id', itemId);
    const { error: delErr } = await supabase.from('checklist_items').delete().eq('id', itemId);
    if (delErr) {
      await this.updateChecklistItem(itemId, { is_active: false });
      return { mode: 'soft' };
    }
    return { mode: 'hard' };
  },

  // Get active checklist_groups for a site (and auto-seed from existing site items if needed)
  async getChecklistGroups(
    siteId?: string,
    siteItems?: ChecklistItem[]
  ): Promise<ChecklistGroup[]> {
    try {
      let query = supabase
        .from('checklist_groups')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (siteId) {
        query = query.eq('site_id', siteId);
      }
      const { data, error } = await query;
      if (error || !data) return [];

      const normalizeRow = (r: Record<string, unknown>): ChecklistGroup => {
        const rawTitle = String(r.title || r.name || '');
        const cl = cleanGroupTitle(rawTitle) || rawTitle.trim();
        return {
          id: String(r.id),
          site_id: String(r.site_id),
          title: cl,
          name: cl,
          sort_order: Number(r.sort_order ?? 1),
          is_active: Boolean(r.is_active ?? true),
          created_at: r.created_at ? String(r.created_at) : undefined,
        };
      };

      const groups = (data as Array<Record<string, unknown>>).map(normalizeRow);

      // Auto-migrate existing items' groups into checklist_groups for this site if missing
      if (siteId && siteItems && siteItems.length > 0) {
        const activeSiteItems = siteItems
          .filter((it) => it.site_id === siteId && it.is_active)
          .sort((a, b) => a.sort_order - b.sort_order);

        const existingNorms = new Set(groups.map((g) => g.title.toLowerCase()));
        const missingTitles: string[] = [];

        activeSiteItems.forEach((it) => {
          const cl = cleanGroupTitle(it.group_name) || it.group_name.trim();
          if (cl && !existingNorms.has(cl.toLowerCase())) {
            existingNorms.add(cl.toLowerCase());
            missingTitles.push(cl);
          }
        });

        if (missingTitles.length > 0) {
          let nextOrder =
            groups.length > 0 ? Math.max(...groups.map((g) => g.sort_order)) + 1 : 1;
          for (const mTitle of missingTitles) {
            try {
              const created = await this.createChecklistGroup({
                site_id: siteId,
                title: mTitle,
                sort_order: nextOrder++,
              });
              if (created && !created.id.startsWith('virtual_')) {
                groups.push(created);
              }
            } catch {
              // ignore
            }
          }
        }

        // Link items missing group_id to their matching group
        const normToGroupId = new Map<string, string>();
        groups.forEach((g) => {
          if (!g.id.startsWith('virtual_')) {
            normToGroupId.set(g.title.toLowerCase(), g.id);
          }
        });

        for (const it of activeSiteItems) {
          if (!it.group_id) {
            const cl = (cleanGroupTitle(it.group_name) || it.group_name.trim()).toLowerCase();
            const targetGid = normToGroupId.get(cl);
            if (targetGid) {
              supabase
                .from('checklist_items')
                .update({ group_id: targetGid })
                .eq('id', it.id)
                .then(() => {});
            }
          }
        }
      }

      groups.sort((a, b) => a.sort_order - b.sort_order);
      return groups;
    } catch {
      return [];
    }
  },

  async createChecklistGroup(params: {
    site_id: string;
    title: string;
    sort_order: number;
  }): Promise<ChecklistGroup> {
    const cleanTitle = cleanGroupTitle(params.title) || params.title.trim();
    if (!cleanTitle) {
      throw new Error('Tên tiêu đề lớn không được để trống.');
    }

    // Check if an active group with the same title already exists for this site
    try {
      const existingList = await this.getChecklistGroups(params.site_id);
      const found = existingList.find(
        (g) => g.title.toLowerCase() === cleanTitle.toLowerCase()
      );
      if (found) return found;
    } catch {
      // ignore
    }

    // Try inserting with both title and name, then fallback to title only or name only
    const attempts: Array<Record<string, unknown>> = [
      {
        site_id: params.site_id,
        title: cleanTitle,
        name: cleanTitle,
        sort_order: params.sort_order,
        is_active: true,
      },
      {
        site_id: params.site_id,
        title: cleanTitle,
        sort_order: params.sort_order,
        is_active: true,
      },
      {
        site_id: params.site_id,
        name: cleanTitle,
        sort_order: params.sort_order,
        is_active: true,
      },
    ];

    for (const payload of attempts) {
      const { data, error } = await supabase
        .from('checklist_groups')
        .insert(payload)
        .select('*')
        .single();
      if (!error && data) {
        const row = data as Record<string, unknown>;
        return {
          id: String(row.id),
          site_id: String(row.site_id),
          title: cleanTitle,
          name: cleanTitle,
          sort_order: Number(row.sort_order ?? params.sort_order),
          is_active: true,
          created_at: row.created_at ? String(row.created_at) : new Date().toISOString(),
        };
      }
    }

    // Return virtual group if checklist_groups table is not yet created in Supabase
    return {
      id: `virtual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      site_id: params.site_id,
      title: cleanTitle,
      name: cleanTitle,
      sort_order: params.sort_order,
      is_active: true,
      created_at: new Date().toISOString(),
    };
  },

  async ensureChecklistGroup(params: {
    site_id: string;
    name: string;
    sort_order: number;
  }): Promise<ChecklistGroup> {
    return this.createChecklistGroup({
      site_id: params.site_id,
      title: params.name,
      sort_order: params.sort_order,
    });
  },

  // Rename a Checklist Group in-place without altering historical inspection_results
  async renameChecklistGroup(params: {
    groupId?: string;
    siteId: string;
    oldCleanName: string;
    oldRawName: string;
    newTitle: string;
    itemIds: string[];
  }): Promise<void> {
    const cleanNew = cleanGroupTitle(params.newTitle) || params.newTitle.trim();
    if (!cleanNew) {
      throw new Error('Tên tiêu đề lớn không được để trống.');
    }

    // 1. Update checklist_groups table if groupId is a real DB UUID
    if (params.groupId && !params.groupId.startsWith('virtual_')) {
      const updateAttempts: Array<Record<string, unknown>> = [
        { title: cleanNew, name: cleanNew },
        { title: cleanNew },
        { name: cleanNew },
      ];
      for (const patch of updateAttempts) {
        const { error } = await supabase
          .from('checklist_groups')
          .update(patch)
          .eq('id', params.groupId);
        if (!error) break;
      }
    } else {
      // Ensure group exists in checklist_groups
      try {
        const existingGroups = await this.getChecklistGroups(params.siteId);
        const match = existingGroups.find(
          (g) => g.title.toLowerCase() === params.oldCleanName.toLowerCase()
        );
        if (match && !match.id.startsWith('virtual_')) {
          await this.renameChecklistGroup({
            ...params,
            groupId: match.id,
          });
          return;
        }
      } catch {
        // ignore
      }
    }

    // 2. Update checklist_items.group_name for items belonging to this group
    // Note: Do NOT update inspection_results so saved historical inspections keep their original group_name!
    if (params.itemIds.length > 0) {
      await supabase
        .from('checklist_items')
        .update({ group_name: cleanNew, updated_at: new Date().toISOString() })
        .in('id', params.itemIds);
    } else {
      await supabase
        .from('checklist_items')
        .update({ group_name: cleanNew, updated_at: new Date().toISOString() })
        .eq('site_id', params.siteId)
        .eq('group_name', params.oldRawName);
    }
  },

  // Reorder Checklist Groups (Up / Down)
  async reorderChecklistGroups(params: {
    siteId: string;
    orderedGroups: Array<{
      id?: string;
      cleanName: string;
      rawGroupName: string;
      itemIds: string[];
    }>;
  }): Promise<void> {
    // 1. Update sort_order in checklist_groups
    for (let i = 0; i < params.orderedGroups.length; i++) {
      const grp = params.orderedGroups[i];
      const newOrder = i + 1;
      if (grp.id && !grp.id.startsWith('virtual_')) {
        await supabase
          .from('checklist_groups')
          .update({ sort_order: newOrder })
          .eq('id', grp.id);
      } else {
        await this.createChecklistGroup({
          site_id: params.siteId,
          title: grp.cleanName,
          sort_order: newOrder,
        });
      }
    }

    // 2. Also update sort_order of checklist_items so item order stays aligned with group order
    let runningItemOrder = 1;
    for (const grp of params.orderedGroups) {
      for (const itemId of grp.itemIds) {
        const orderToSet = runningItemOrder++;
        await supabase
          .from('checklist_items')
          .update({ sort_order: orderToSet })
          .eq('id', itemId);
      }
    }
  },

  // Smart Delete Checklist Group: Soft delete (is_active = false) if group/items have history in inspection_results, else Hard delete
  async smartDeleteChecklistGroup(params: {
    groupId?: string;
    siteId: string;
    cleanName: string;
    rawGroupName: string;
    itemIds: string[];
  }): Promise<{ mode: 'soft' | 'hard' }> {
    let hasHistory = false;

    if (params.itemIds.length > 0) {
      const { count, error } = await supabase
        .from('inspection_results')
        .select('id', { count: 'exact', head: true })
        .in('item_id', params.itemIds);
      if (!error && count !== null && count > 0) {
        hasHistory = true;
      }
    }

    if (!hasHistory) {
      const { count: grpCount, error: grpErr } = await supabase
        .from('inspection_results')
        .select('id', { count: 'exact', head: true })
        .eq('site_id', params.siteId)
        .or(`group_name.eq.${params.rawGroupName},group_name.ilike.%${params.cleanName}%`);
      if (!grpErr && grpCount !== null && grpCount > 0) {
        hasHistory = true;
      }
    }

    const nowIso = new Date().toISOString();

    if (hasHistory) {
      // Soft delete all items in the group + the group itself
      if (params.itemIds.length > 0) {
        await supabase
          .from('checklist_items')
          .update({ is_active: false, updated_at: nowIso })
          .in('id', params.itemIds);
      }
      if (params.groupId && !params.groupId.startsWith('virtual_')) {
        await supabase
          .from('checklist_groups')
          .update({ is_active: false })
          .eq('id', params.groupId);
      }
      return { mode: 'soft' };
    }

    // Hard delete if no inspection history exists
    if (params.itemIds.length > 0) {
      await supabase.from('corrective_actions').delete().in('item_id', params.itemIds);
      const { error: delItemsErr } = await supabase
        .from('checklist_items')
        .delete()
        .in('id', params.itemIds);
      if (delItemsErr) {
        // Fallback to soft delete if FK constraint blocks deletion
        await supabase
          .from('checklist_items')
          .update({ is_active: false, updated_at: nowIso })
          .in('id', params.itemIds);
        if (params.groupId && !params.groupId.startsWith('virtual_')) {
          await supabase
            .from('checklist_groups')
            .update({ is_active: false })
            .eq('id', params.groupId);
        }
        return { mode: 'soft' };
      }
    }

    if (params.groupId && !params.groupId.startsWith('virtual_')) {
      const { error: delGrpErr } = await supabase
        .from('checklist_groups')
        .delete()
        .eq('id', params.groupId);
      if (delGrpErr) {
        await supabase
          .from('checklist_groups')
          .update({ is_active: false })
          .eq('id', params.groupId);
        return { mode: 'soft' };
      }
    }

    return { mode: 'hard' };
  },

  async copyDefaultItemsToSite(siteId: string, sourceSiteId?: string): Promise<void> {
    let itemsToCopy = DEFAULT_TEMPLATE_ITEMS;
    let groupTitlesToCopy: string[] = [...DEFAULT_GROUP_TITLES];

    if (sourceSiteId) {
      const [sourceGroups, sourceAllItems] = await Promise.all([
        this.getChecklistGroups(sourceSiteId),
        this.getChecklistItems(sourceSiteId),
      ]);
      const sourceItems = sourceAllItems.filter((it) => it.is_active);
      if (sourceGroups.length > 0) {
        groupTitlesToCopy = sourceGroups.map((g) => cleanGroupTitle(g.title));
      }
      if (sourceItems.length > 0) {
        itemsToCopy = sourceItems.map((it) => ({
          group_name: cleanGroupTitle(it.group_name) || it.group_name,
          title: it.title,
          is_critical: it.is_critical,
          sort_order: it.sort_order,
        }));
      }
    }

    const groupMap = new Map<string, string>();
    for (let i = 0; i < groupTitlesToCopy.length; i++) {
      const gTitle = cleanGroupTitle(groupTitlesToCopy[i]);
      if (!gTitle) continue;
      try {
        const grp = await this.createChecklistGroup({
          site_id: siteId,
          title: gTitle,
          sort_order: i + 1,
        });
        if (grp?.id && !grp.id.startsWith('virtual_')) {
          groupMap.set(gTitle.toLowerCase(), grp.id);
        }
      } catch {
        // ignore
      }
    }

    const nowIso = new Date().toISOString();
    const rows = itemsToCopy.map((it, idx) => {
      const cleanG = cleanGroupTitle(it.group_name) || it.group_name;
      const gId = groupMap.get(cleanG.toLowerCase());
      return {
        site_id: siteId,
        ...(gId ? { group_id: gId } : {}),
        group_name: cleanG,
        title: it.title,
        is_critical: it.is_critical,
        sort_order: it.sort_order ?? idx + 1,
        is_active: true,
        current_status: 'pending' as const,
        updated_at: nowIso,
      };
    });

    let { error } = await supabase.from('checklist_items').insert(rows);
    if (error && groupMap.size > 0) {
      const fallbackRows = rows.map(({ group_id: _gid, ...rest }) => rest);
      const retry = await supabase.from('checklist_items').insert(fallbackRows);
      error = retry.error;
    }
    if (error) {
      throw new Error(`Không thể sao chép bộ hạng mục lên Supabase: ${error.message}`);
    }
  },

  // 4. Inspections & Inspection Results (Read/Write directly from/to Supabase)
  async getInspections(siteId?: string): Promise<Inspection[]> {
    let query = supabase
      .from('inspections')
      .select('*')
      .order('started_at', { ascending: false });
    if (siteId) {
      query = query.eq('site_id', siteId);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Không thể tải danh sách phiên kiểm tra từ Supabase: ${error.message}`);
    }
    return (data || []) as Inspection[];
  },

  async getOrCreateDraftInspection(params: {
    site_id: string;
    inspector_id: string;
    inspector_name: string;
  }): Promise<{ inspection: Inspection; results: InspectionResultRow[] }> {
    const existingList = await this.getInspections(params.site_id);
    const existingDraft = existingList.find(
      (i) => i.kind === 'dieu_kien' && i.status === 'draft'
    );

    if (existingDraft) {
      const resultsData = await this.getInspectionResults(existingDraft.id);
      return {
        inspection: existingDraft,
        results: resultsData,
      };
    }

    const startedAt = new Date().toISOString();
    const isLocalSuperAdmin = params.inspector_id === '00000000-0000-0000-0000-000000000001';

    let { data: created, error } = await supabase
      .from('inspections')
      .insert({
        site_id: params.site_id,
        kind: 'dieu_kien',
        inspector_id: isLocalSuperAdmin ? null : params.inspector_id,
        inspector_name: params.inspector_name,
        status: 'draft',
        started_at: startedAt,
      })
      .select('*')
      .single();

    if (error && !isLocalSuperAdmin) {
      const retry = await supabase
        .from('inspections')
        .insert({
          site_id: params.site_id,
          kind: 'dieu_kien',
          inspector_id: null,
          inspector_name: params.inspector_name,
          status: 'draft',
          started_at: startedAt,
        })
        .select('*')
        .single();
      created = retry.data;
      error = retry.error;
    }

    if (error || !created) {
      throw new Error(
        `Không thể khởi tạo phiên kiểm tra trên Supabase: ${error?.message || 'Lỗi RLS'}`
      );
    }

    return { inspection: created as Inspection, results: [] };
  },

  async updateInspection(
    inspectionId: string,
    payload: Partial<Pick<Inspection, 'inspector_name' | 'score' | 'result' | 'status' | 'gps'>>
  ): Promise<Inspection> {
    const { data, error } = await supabase
      .from('inspections')
      .update(payload)
      .eq('id', inspectionId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(
        `Không thể cập nhật phiên kiểm tra trên Supabase: ${error?.message || 'Lỗi RLS'}`
      );
    }
    return data as Inspection;
  },

  async deleteInspection(inspectionId: string): Promise<void> {
    await supabase.from('inspection_results').delete().eq('inspection_id', inspectionId);
    const { error } = await supabase.from('inspections').delete().eq('id', inspectionId);
    if (error) {
      throw new Error(`Không thể xóa phiên kiểm tra trên Supabase: ${error.message}`);
    }
  },

  async getInspectionResults(inspectionId?: string): Promise<InspectionResultRow[]> {
    let query = supabase
      .from('inspection_results')
      .select('*')
      .order('checked_at', { ascending: false });
    if (inspectionId) {
      query = query.eq('inspection_id', inspectionId);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Không thể tải kết quả kiểm tra từ Supabase: ${error.message}`);
    }
    return (data || []) as InspectionResultRow[];
  },

  async upsertInspectionResult(
    row: Omit<InspectionResultRow, 'id'>,
    correctiveMeta?: { assignee?: string; due_date?: string }
  ): Promise<void> {
    const payload = {
      inspection_id: row.inspection_id,
      item_id: row.item_id,
      site_id: row.site_id,
      item_title: row.item_title,
      group_name: row.group_name,
      is_critical: row.is_critical,
      status: row.status,
      severity: row.severity,
      note: row.note,
      photo_urls: row.photo_urls,
      checked_at: row.checked_at,
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueueOfflineMutation({
        table: 'inspection_results',
        operation: 'upsert',
        payload,
        onConflict: 'inspection_id,item_id',
      });
      return;
    }

    const { error } = await supabase
      .from('inspection_results')
      .upsert(payload, { onConflict: 'inspection_id,item_id' });

    if (error) {
      throw new Error(`Không thể lưu kết quả hạng mục vào Supabase: ${error.message}`);
    }

    // Also update checklist_items status directly in Supabase so status stays synced even without DB triggers
    await supabase
      .from('checklist_items')
      .update({
        current_status: row.status,
        current_severity: row.status === 'fail' ? row.severity : null,
        last_checked_at: row.checked_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.item_id);

    // Ensure corrective_actions are synced in Supabase on fail / pass
    if (row.status === 'fail') {
      const { data: openExisting } = await supabase
        .from('corrective_actions')
        .select('id')
        .eq('site_id', row.site_id)
        .eq('item_id', row.item_id)
        .neq('status', 'closed')
        .maybeSingle();

      const desc =
        row.note && row.note.trim()
          ? `${row.item_title}: ${row.note}`
          : `Lỗi hạng mục: ${row.item_title}`;

      if (openExisting?.id) {
        const updateFields: Record<string, unknown> = {
          description: desc,
          severity: row.severity || 'nghiem_trong',
        };
        if (correctiveMeta?.assignee) updateFields.assignee = correctiveMeta.assignee;
        if (correctiveMeta?.due_date) updateFields.due_date = correctiveMeta.due_date;

        await supabase
          .from('corrective_actions')
          .update(updateFields)
          .eq('id', openExisting.id);
      } else {
        await supabase.from('corrective_actions').insert({
          site_id: row.site_id,
          item_id: row.item_id,
          description: desc,
          severity: row.severity || 'nghiem_trong',
          assignee: correctiveMeta?.assignee || null,
          due_date: correctiveMeta?.due_date || null,
          status: 'open',
          created_at: new Date().toISOString(),
        });
      }
    } else if (row.status === 'pass') {
      await supabase
        .from('corrective_actions')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
        })
        .eq('site_id', row.site_id)
        .eq('item_id', row.item_id)
        .neq('status', 'closed');
    }
  },

  async completeInspection(
    inspectionId: string,
    payload: {
      score: number;
      result: 'tot' | 'can_cai_thien' | 'khong_dat';
      signature_url: string | null;
      gps: Record<string, unknown> | null;
      finished_at: string;
    }
  ): Promise<Inspection> {
    const updateData = {
      status: 'completed' as const,
      score: payload.score,
      result: payload.result,
      signature_url: payload.signature_url,
      gps: payload.gps,
      finished_at: payload.finished_at,
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueueOfflineMutation({
        table: 'inspections',
        operation: 'update',
        payload: updateData,
        matchColumn: 'id',
        matchValue: inspectionId,
      });
      return { id: inspectionId, ...updateData } as unknown as Inspection;
    }

    const { data, error } = await supabase
      .from('inspections')
      .update(updateData)
      .eq('id', inspectionId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(
        `Không thể hoàn tất biên bản kiểm tra trên Supabase: ${error?.message || 'Lỗi RLS'}`
      );
    }
    return data as Inspection;
  },

  // 5. Corrective Actions (Read/Write directly from/to Supabase)
  async getCorrectiveActions(siteId?: string): Promise<CorrectiveAction[]> {
    let query = supabase
      .from('corrective_actions')
      .select('*')
      .order('created_at', { ascending: false });
    if (siteId) {
      query = query.eq('site_id', siteId);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Không thể tải danh sách sự vụ khắc phục từ Supabase: ${error.message}`);
    }
    return (data || []) as CorrectiveAction[];
  },

  async createCorrectiveAction(payload: {
    site_id: string;
    item_id?: string | null;
    description: string;
    severity: SeverityLevel;
    assignee?: string | null;
    due_date?: string | null;
  }): Promise<CorrectiveAction> {
    const createdAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('corrective_actions')
      .insert({
        site_id: payload.site_id,
        item_id: payload.item_id || null,
        description: payload.description,
        severity: payload.severity,
        assignee: payload.assignee || null,
        due_date: payload.due_date || null,
        status: 'open',
        created_at: createdAt,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(
        `Không thể tạo sự vụ khắc phục trên Supabase: ${error?.message || 'Lỗi RLS'}`
      );
    }
    return data as CorrectiveAction;
  },

  async updateCorrectiveAction(
    actionId: string,
    payload: Partial<{
      status: 'open' | 'in_progress' | 'closed';
      assignee: string | null;
      due_date: string | null;
      severity: SeverityLevel | null;
      description: string;
      closed_at: string | null;
    }>
  ): Promise<CorrectiveAction> {
    const updateData = { ...payload };
    if (payload.status === 'closed' && !payload.closed_at) {
      updateData.closed_at = new Date().toISOString();
    } else if (payload.status && payload.status !== 'closed') {
      updateData.closed_at = null;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueueOfflineMutation({
        table: 'corrective_actions',
        operation: 'update',
        payload: updateData,
        matchColumn: 'id',
        matchValue: actionId,
      });
      return { id: actionId, ...updateData } as CorrectiveAction;
    }

    const { data, error } = await supabase
      .from('corrective_actions')
      .update(updateData)
      .eq('id', actionId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(
        `Không thể cập nhật sự vụ khắc phục trên Supabase: ${error?.message || 'Lỗi RLS'}`
      );
    }
    return data as CorrectiveAction;
  },

  async deleteCorrectiveAction(actionId: string): Promise<void> {
    const { error } = await supabase.from('corrective_actions').delete().eq('id', actionId);
    if (error) {
      throw new Error(`Không thể xóa sự vụ khắc phục trên Supabase: ${error.message}`);
    }
  },

  // 6. Vehicle Washes (Read/Write directly from/to Supabase)
  async getVehicleWashes(siteId?: string): Promise<VehicleWash[]> {
    let query = supabase
      .from('vehicle_washes')
      .select('*')
      .order('started_at', { ascending: false });
    if (siteId) {
      query = query.eq('site_id', siteId);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Không thể tải nhật ký rửa xe từ Supabase: ${error.message}`);
    }
    return (data || []) as VehicleWash[];
  },

  async createVehicleWash(
    payload: Omit<VehicleWash, 'id' | 'result' | 'finished_at'>
  ): Promise<VehicleWash> {
    const { data, error } = await supabase
      .from('vehicle_washes')
      .insert({
        ...payload,
        result: null,
        finished_at: null,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Không thể lưu lượt rửa xe vào Supabase: ${error?.message || 'Lỗi RLS'}`);
    }
    return data as VehicleWash;
  },

  async updateVehicleWash(
    washId: string,
    payload: Partial<
      Pick<
        VehicleWash,
        | 'plate'
        | 'vehicle_type'
        | 'driver'
        | 'origin'
        | 'destination'
        | 'steps'
        | 'result'
        | 'finished_at'
      >
    >
  ): Promise<VehicleWash> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueueOfflineMutation({
        table: 'vehicle_washes',
        operation: 'update',
        payload: payload as Record<string, unknown>,
        matchColumn: 'id',
        matchValue: washId,
      });
      return { id: washId, ...payload } as VehicleWash;
    }

    const { data, error } = await supabase
      .from('vehicle_washes')
      .update(payload)
      .eq('id', washId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(
        `Không thể cập nhật nhật ký rửa xe trên Supabase: ${error?.message || 'Lỗi RLS'}`
      );
    }
    return data as VehicleWash;
  },

  async deleteVehicleWash(washId: string): Promise<void> {
    const { error } = await supabase.from('vehicle_washes').delete().eq('id', washId);
    if (error) {
      throw new Error(`Không thể xóa lượt rửa xe trên Supabase: ${error.message}`);
    }
  },

  // 7. Evidence Storage Upload (Supabase Storage bucket `evidence`, with DataURL fallback stored inside Supabase table column)
  async uploadEvidenceFile(
    fileOrBlob: File | Blob,
    folder: 'photos' | 'signatures',
    ext = 'jpg'
  ): Promise<string> {
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const { error } = await supabase.storage
      .from('evidence')
      .upload(fileName, fileOrBlob, {
        cacheControl: '3600',
        upsert: false,
        contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      });

    if (error) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh minh chứng'));
        reader.readAsDataURL(fileOrBlob);
      });
    }

    const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(fileName);
    return urlData.publicUrl;
  },
};
