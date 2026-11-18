import { supabase } from './supabase';
import { enqueueOfflineMutation } from './offlineQueue';
import {
  ChecklistItem,
  CorrectiveAction,
  DEFAULT_TEMPLATE_ITEMS,
  Inspection,
  InspectionResultRow,
  Profile,
  SeverityLevel,
  Site,
  SiteOverview,
  VehicleWash,
} from '../types/database';

interface AdminOverlayState {
  sitesCreated: Site[];
  sitesUpdated: Record<string, Partial<Site>>;
  sitesDeleted: string[];
  itemsCreated: ChecklistItem[];
  itemsUpdated: Record<string, Partial<ChecklistItem>>;
  itemsDeleted: string[];
  inspectionsCreated: Inspection[];
  inspectionsUpdated: Record<string, Partial<Inspection>>;
  inspectionsDeleted: string[];
  resultsUpserted: Record<string, InspectionResultRow>;
  resultsDeletedByInspection: string[];
  actionsCreated: CorrectiveAction[];
  actionsUpdated: Record<string, Partial<CorrectiveAction>>;
  actionsDeleted: string[];
  washesCreated: VehicleWash[];
  washesUpdated: Record<string, Partial<VehicleWash>>;
  washesDeleted: string[];
}

const OVERLAY_STORAGE_KEY = 'biowash_superadmin_overlay_v1';

function createEmptyOverlay(): AdminOverlayState {
  return {
    sitesCreated: [],
    sitesUpdated: {},
    sitesDeleted: [],
    itemsCreated: [],
    itemsUpdated: {},
    itemsDeleted: [],
    inspectionsCreated: [],
    inspectionsUpdated: {},
    inspectionsDeleted: [],
    resultsUpserted: {},
    resultsDeletedByInspection: [],
    actionsCreated: [],
    actionsUpdated: {},
    actionsDeleted: [],
    washesCreated: [],
    washesUpdated: {},
    washesDeleted: [],
  };
}

function loadOverlay(): AdminOverlayState {
  if (typeof window === 'undefined') return createEmptyOverlay();
  try {
    const raw = window.localStorage.getItem(OVERLAY_STORAGE_KEY);
    if (!raw) return createEmptyOverlay();
    return { ...createEmptyOverlay(), ...JSON.parse(raw) };
  } catch {
    return createEmptyOverlay();
  }
}

function saveOverlay(state: AdminOverlayState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OVERLAY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

const adminOverlay: AdminOverlayState = loadOverlay();

function genUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const repository = {
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

  // 2. Overview & Sites
  async getSiteOverview(): Promise<SiteOverview[]> {
    const { data } = await supabase.from('v_site_overview').select('*');
    const baseOverview = ((data || []) as SiteOverview[]).filter(
      (o) => !adminOverlay.sitesDeleted.includes(o.site_id)
    );

    const allSites = await this.getSites(false);
    const allItems = await this.getChecklistItems();
    const allActions = await this.getCorrectiveActions();
    const overviewMap = new Map<string, SiteOverview>();
    baseOverview.forEach((o) => overviewMap.set(o.site_id, { ...o }));

    const now = Date.now();
    for (const s of allSites) {
      const existing = overviewMap.get(s.id);
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
      const computedPct =
        checkedCount > 0
          ? Math.round((passItems / checkedCount) * 100)
          : existing?.compliance_pct ?? 100;

      overviewMap.set(s.id, {
        site_id: s.id,
        name: s.name,
        site_type: s.site_type,
        lat: s.lat,
        lng: s.lng,
        total_items: totalItems || existing?.total_items || 0,
        pass_items: passItems || existing?.pass_items || 0,
        fail_items: failItems || existing?.fail_items || 0,
        pending_items: pendingItems || existing?.pending_items || 0,
        critical_fail: critFail || existing?.critical_fail || 0,
        compliance_pct: computedPct,
        last_checked_at: existing?.last_checked_at ?? null,
        open_actions: sActions.length,
        overdue_actions: overdueCount,
      });
    }

    return Array.from(overviewMap.values());
  },

  async getSites(includeInactive = true): Promise<Site[]> {
    let query = supabase.from('sites').select('*').order('name', { ascending: true });
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    const { data } = await query;
    const remoteSites = (data || []) as Site[];

    const mergedMap = new Map<string, Site>();
    remoteSites.forEach((s) => {
      if (!adminOverlay.sitesDeleted.includes(s.id)) {
        const patch = adminOverlay.sitesUpdated[s.id];
        mergedMap.set(s.id, patch ? { ...s, ...patch } : s);
      }
    });
    adminOverlay.sitesCreated.forEach((s) => {
      if (!adminOverlay.sitesDeleted.includes(s.id)) {
        const patch = adminOverlay.sitesUpdated[s.id];
        mergedMap.set(s.id, patch ? { ...s, ...patch } : s);
      }
    });

    const list = Array.from(mergedMap.values()).filter((s) =>
      includeInactive ? true : s.is_active
    );
    list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return list;
  },

  async createSite(
    sitePayload: Omit<Site, 'id'>,
    copyFromSiteId?: string | null
  ): Promise<Site> {
    let newSite: Site | null = null;
    const { data, error: siteErr } = await supabase
      .from('sites')
      .insert(sitePayload)
      .select('*')
      .single();

    if (!siteErr && data) {
      newSite = data as Site;
    } else {
      newSite = {
        id: genUUID(),
        ...sitePayload,
      };
      adminOverlay.sitesCreated.push(newSite);
      saveOverlay(adminOverlay);
    }

    // Copy checklist items either from another site or from default 6-group template
    let itemsToInsert: Array<{
      site_id: string;
      group_name: string;
      title: string;
      is_critical: boolean;
      sort_order: number;
      is_active: boolean;
      current_status: 'pending';
    }> = [];

    if (copyFromSiteId) {
      const sourceItems = (await this.getChecklistItems(copyFromSiteId)).filter(
        (it) => it.is_active
      );
      if (sourceItems.length > 0) {
        itemsToInsert = sourceItems.map((it, idx) => ({
          site_id: newSite!.id,
          group_name: it.group_name,
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
        site_id: newSite!.id,
        group_name: it.group_name,
        title: it.title,
        is_critical: it.is_critical,
        sort_order: it.sort_order,
        is_active: true,
        current_status: 'pending',
      }));
    }

    const { error: itemsErr } = await supabase.from('checklist_items').insert(itemsToInsert);
    if (itemsErr) {
      const nowIso = new Date().toISOString();
      itemsToInsert.forEach((it) => {
        adminOverlay.itemsCreated.push({
          id: genUUID(),
          site_id: it.site_id,
          group_name: it.group_name,
          title: it.title,
          is_critical: it.is_critical,
          sort_order: it.sort_order,
          is_active: true,
          current_status: 'pending',
          current_severity: null,
          last_checked_at: null,
          last_checked_by: null,
          updated_at: nowIso,
        });
      });
      saveOverlay(adminOverlay);
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

    if (!error && data) {
      if (adminOverlay.sitesUpdated[siteId]) {
        delete adminOverlay.sitesUpdated[siteId];
        saveOverlay(adminOverlay);
      }
      return data as Site;
    }

    adminOverlay.sitesUpdated[siteId] = {
      ...(adminOverlay.sitesUpdated[siteId] || {}),
      ...payload,
    };
    saveOverlay(adminOverlay);
    const sites = await this.getSites(true);
    const found = sites.find((s) => s.id === siteId);
    return (found || { id: siteId, ...payload }) as Site;
  },

  async deleteSite(siteId: string): Promise<void> {
    await supabase.from('inspection_results').delete().eq('site_id', siteId);
    await supabase.from('corrective_actions').delete().eq('site_id', siteId);
    await supabase.from('inspections').delete().eq('site_id', siteId);
    await supabase.from('vehicle_washes').delete().eq('site_id', siteId);
    await supabase.from('checklist_items').delete().eq('site_id', siteId);
    await supabase.from('sites').delete().eq('id', siteId);

    if (!adminOverlay.sitesDeleted.includes(siteId)) {
      adminOverlay.sitesDeleted.push(siteId);
    }
    adminOverlay.sitesCreated = adminOverlay.sitesCreated.filter((s) => s.id !== siteId);
    delete adminOverlay.sitesUpdated[siteId];
    saveOverlay(adminOverlay);
  },

  // 3. Checklist Items
  async getChecklistItems(siteId?: string): Promise<ChecklistItem[]> {
    let query = supabase
      .from('checklist_items')
      .select('*')
      .order('sort_order', { ascending: true });
    if (siteId) {
      query = query.eq('site_id', siteId);
    }
    const { data } = await query;
    const remoteItems = (data || []) as ChecklistItem[];

    const mergedMap = new Map<string, ChecklistItem>();
    remoteItems.forEach((it) => {
      if (
        !adminOverlay.itemsDeleted.includes(it.id) &&
        !adminOverlay.sitesDeleted.includes(it.site_id)
      ) {
        const patch = adminOverlay.itemsUpdated[it.id];
        mergedMap.set(it.id, patch ? { ...it, ...patch } : it);
      }
    });
    adminOverlay.itemsCreated.forEach((it) => {
      if (
        (!siteId || it.site_id === siteId) &&
        !adminOverlay.itemsDeleted.includes(it.id) &&
        !adminOverlay.sitesDeleted.includes(it.site_id)
      ) {
        const patch = adminOverlay.itemsUpdated[it.id];
        mergedMap.set(it.id, patch ? { ...it, ...patch } : it);
      }
    });

    const list = Array.from(mergedMap.values());
    list.sort((a, b) => a.sort_order - b.sort_order);
    return list;
  },

  async createChecklistItem(payload: {
    site_id: string;
    group_name: string;
    title: string;
    is_critical: boolean;
    sort_order: number;
  }): Promise<ChecklistItem> {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('checklist_items')
      .insert({
        ...payload,
        is_active: true,
        current_status: 'pending',
        updated_at: nowIso,
      })
      .select('*')
      .single();

    if (!error && data) {
      return data as ChecklistItem;
    }

    const fallbackItem: ChecklistItem = {
      id: genUUID(),
      site_id: payload.site_id,
      group_name: payload.group_name,
      title: payload.title,
      is_critical: payload.is_critical,
      sort_order: payload.sort_order,
      is_active: true,
      current_status: 'pending',
      current_severity: null,
      last_checked_at: null,
      last_checked_by: null,
      updated_at: nowIso,
    };
    adminOverlay.itemsCreated.push(fallbackItem);
    saveOverlay(adminOverlay);
    return fallbackItem;
  },

  async updateChecklistItem(
    itemId: string,
    payload: Partial<
      Pick<
        ChecklistItem,
        | 'title'
        | 'group_name'
        | 'is_critical'
        | 'sort_order'
        | 'is_active'
        | 'current_status'
        | 'current_severity'
      >
    >
  ): Promise<ChecklistItem> {
    const updateData = {
      ...payload,
      updated_at: new Date().toISOString(),
    };
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

    const { data, error } = await supabase
      .from('checklist_items')
      .update(updateData)
      .eq('id', itemId)
      .select('*')
      .single();

    if (!error && data) {
      if (adminOverlay.itemsUpdated[itemId]) {
        delete adminOverlay.itemsUpdated[itemId];
        saveOverlay(adminOverlay);
      }
      return data as ChecklistItem;
    }

    adminOverlay.itemsUpdated[itemId] = {
      ...(adminOverlay.itemsUpdated[itemId] || {}),
      ...updateData,
    };
    saveOverlay(adminOverlay);
    return { id: itemId, ...updateData } as ChecklistItem;
  },

  async deleteChecklistItem(itemId: string): Promise<void> {
    await supabase.from('inspection_results').delete().eq('item_id', itemId);
    await supabase.from('corrective_actions').delete().eq('item_id', itemId);
    await supabase.from('checklist_items').delete().eq('id', itemId);

    if (!adminOverlay.itemsDeleted.includes(itemId)) {
      adminOverlay.itemsDeleted.push(itemId);
    }
    adminOverlay.itemsCreated = adminOverlay.itemsCreated.filter((it) => it.id !== itemId);
    delete adminOverlay.itemsUpdated[itemId];
    saveOverlay(adminOverlay);
  },

  async copyDefaultItemsToSite(siteId: string, sourceSiteId?: string): Promise<void> {
    let itemsToCopy = DEFAULT_TEMPLATE_ITEMS;
    if (sourceSiteId) {
      const sourceItems = (await this.getChecklistItems(sourceSiteId)).filter(
        (it) => it.is_active
      );
      if (sourceItems.length > 0) {
        itemsToCopy = sourceItems.map((it) => ({
          group_name: it.group_name,
          title: it.title,
          is_critical: it.is_critical,
          sort_order: it.sort_order,
        }));
      }
    }
    const nowIso = new Date().toISOString();
    const rows = itemsToCopy.map((it, idx) => ({
      site_id: siteId,
      group_name: it.group_name,
      title: it.title,
      is_critical: it.is_critical,
      sort_order: it.sort_order ?? idx + 1,
      is_active: true,
      current_status: 'pending' as const,
      updated_at: nowIso,
    }));
    const { error } = await supabase.from('checklist_items').insert(rows);
    if (error) {
      rows.forEach((r) => {
        adminOverlay.itemsCreated.push({
          id: genUUID(),
          site_id: r.site_id,
          group_name: r.group_name,
          title: r.title,
          is_critical: r.is_critical,
          sort_order: r.sort_order,
          is_active: true,
          current_status: 'pending',
          current_severity: null,
          last_checked_at: null,
          last_checked_by: null,
          updated_at: nowIso,
        });
      });
      saveOverlay(adminOverlay);
    }
  },

  // 4. Inspections & Inspection Results
  async getInspections(siteId?: string): Promise<Inspection[]> {
    let query = supabase
      .from('inspections')
      .select('*')
      .order('started_at', { ascending: false });
    if (siteId) {
      query = query.eq('site_id', siteId);
    }
    const { data } = await query;
    const remote = (data || []) as Inspection[];

    const mergedMap = new Map<string, Inspection>();
    remote.forEach((ins) => {
      if (
        !adminOverlay.inspectionsDeleted.includes(ins.id) &&
        !adminOverlay.sitesDeleted.includes(ins.site_id)
      ) {
        const patch = adminOverlay.inspectionsUpdated[ins.id];
        mergedMap.set(ins.id, patch ? { ...ins, ...patch } : ins);
      }
    });
    adminOverlay.inspectionsCreated.forEach((ins) => {
      if (
        (!siteId || ins.site_id === siteId) &&
        !adminOverlay.inspectionsDeleted.includes(ins.id) &&
        !adminOverlay.sitesDeleted.includes(ins.site_id)
      ) {
        const patch = adminOverlay.inspectionsUpdated[ins.id];
        mergedMap.set(ins.id, patch ? { ...ins, ...patch } : ins);
      }
    });

    const list = Array.from(mergedMap.values());
    list.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    return list;
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

    if (!error && created) {
      return { inspection: created as Inspection, results: [] };
    }

    const fallbackInsp: Inspection = {
      id: genUUID(),
      site_id: params.site_id,
      kind: 'dieu_kien',
      inspector_id: params.inspector_id,
      inspector_name: params.inspector_name,
      status: 'draft',
      score: null,
      result: null,
      signature_url: null,
      gps: null,
      started_at: startedAt,
      finished_at: null,
    };
    adminOverlay.inspectionsCreated.push(fallbackInsp);
    saveOverlay(adminOverlay);
    return { inspection: fallbackInsp, results: [] };
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

    if (!error && data) {
      if (adminOverlay.inspectionsUpdated[inspectionId]) {
        delete adminOverlay.inspectionsUpdated[inspectionId];
        saveOverlay(adminOverlay);
      }
      return data as Inspection;
    }

    adminOverlay.inspectionsUpdated[inspectionId] = {
      ...(adminOverlay.inspectionsUpdated[inspectionId] || {}),
      ...payload,
    };
    saveOverlay(adminOverlay);
    return { id: inspectionId, ...payload } as Inspection;
  },

  async deleteInspection(inspectionId: string): Promise<void> {
    await supabase.from('inspection_results').delete().eq('inspection_id', inspectionId);
    await supabase.from('inspections').delete().eq('id', inspectionId);

    if (!adminOverlay.inspectionsDeleted.includes(inspectionId)) {
      adminOverlay.inspectionsDeleted.push(inspectionId);
    }
    if (!adminOverlay.resultsDeletedByInspection.includes(inspectionId)) {
      adminOverlay.resultsDeletedByInspection.push(inspectionId);
    }
    adminOverlay.inspectionsCreated = adminOverlay.inspectionsCreated.filter(
      (i) => i.id !== inspectionId
    );
    delete adminOverlay.inspectionsUpdated[inspectionId];
    saveOverlay(adminOverlay);
  },

  async getInspectionResults(inspectionId?: string): Promise<InspectionResultRow[]> {
    let query = supabase
      .from('inspection_results')
      .select('*')
      .order('checked_at', { ascending: false });
    if (inspectionId) {
      query = query.eq('inspection_id', inspectionId);
    }
    const { data } = await query;
    const remote = (data || []) as InspectionResultRow[];

    const mergedMap = new Map<string, InspectionResultRow>();
    remote.forEach((r) => {
      if (
        !adminOverlay.resultsDeletedByInspection.includes(r.inspection_id) &&
        !adminOverlay.inspectionsDeleted.includes(r.inspection_id)
      ) {
        const key = `${r.inspection_id}_${r.item_id}`;
        mergedMap.set(key, adminOverlay.resultsUpserted[key] || r);
      }
    });

    Object.entries(adminOverlay.resultsUpserted).forEach(([key, r]) => {
      if (
        (!inspectionId || r.inspection_id === inspectionId) &&
        !adminOverlay.resultsDeletedByInspection.includes(r.inspection_id)
      ) {
        mergedMap.set(key, r);
      }
    });

    return Array.from(mergedMap.values());
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
      const key = `${row.inspection_id}_${row.item_id}`;
      adminOverlay.resultsUpserted[key] = {
        id: adminOverlay.resultsUpserted[key]?.id || genUUID(),
        ...payload,
      };
      adminOverlay.itemsUpdated[row.item_id] = {
        ...(adminOverlay.itemsUpdated[row.item_id] || {}),
        current_status: row.status,
        current_severity: row.status === 'fail' ? row.severity : null,
        last_checked_at: row.checked_at,
      };
      if (row.status === 'fail') {
        adminOverlay.actionsCreated.push({
          id: genUUID(),
          site_id: row.site_id,
          item_id: row.item_id,
          description: row.note ? `${row.item_title}: ${row.note}` : `Lỗi hạng mục: ${row.item_title}`,
          severity: row.severity || 'nghiem_trong',
          assignee: correctiveMeta?.assignee || null,
          due_date: correctiveMeta?.due_date || null,
          status: 'open',
          created_at: new Date().toISOString(),
          closed_at: null,
        });
      }
      saveOverlay(adminOverlay);
      return;
    }

    if (row.status === 'fail' && correctiveMeta && (correctiveMeta.assignee || correctiveMeta.due_date)) {
      const updateFields: Record<string, unknown> = {};
      if (correctiveMeta.assignee) updateFields.assignee = correctiveMeta.assignee;
      if (correctiveMeta.due_date) updateFields.due_date = correctiveMeta.due_date;
      if (row.severity) updateFields.severity = row.severity;

      await supabase
        .from('corrective_actions')
        .update(updateFields)
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

    if (!error && data) {
      return data as Inspection;
    }

    adminOverlay.inspectionsUpdated[inspectionId] = {
      ...(adminOverlay.inspectionsUpdated[inspectionId] || {}),
      ...(updateData as unknown as Partial<Inspection>),
    };
    saveOverlay(adminOverlay);
    return { id: inspectionId, ...updateData } as unknown as Inspection;
  },

  // 5. Corrective Actions
  async getCorrectiveActions(siteId?: string): Promise<CorrectiveAction[]> {
    let query = supabase
      .from('corrective_actions')
      .select('*')
      .order('created_at', { ascending: false });
    if (siteId) {
      query = query.eq('site_id', siteId);
    }
    const { data } = await query;
    const remote = (data || []) as CorrectiveAction[];

    const mergedMap = new Map<string, CorrectiveAction>();
    remote.forEach((a) => {
      if (
        !adminOverlay.actionsDeleted.includes(a.id) &&
        !adminOverlay.sitesDeleted.includes(a.site_id)
      ) {
        const patch = adminOverlay.actionsUpdated[a.id];
        mergedMap.set(a.id, patch ? { ...a, ...patch } : a);
      }
    });
    adminOverlay.actionsCreated.forEach((a) => {
      if (
        (!siteId || a.site_id === siteId) &&
        !adminOverlay.actionsDeleted.includes(a.id) &&
        !adminOverlay.sitesDeleted.includes(a.site_id)
      ) {
        const patch = adminOverlay.actionsUpdated[a.id];
        mergedMap.set(a.id, patch ? { ...a, ...patch } : a);
      }
    });

    const list = Array.from(mergedMap.values());
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list;
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

    if (!error && data) {
      return data as CorrectiveAction;
    }

    const fallback: CorrectiveAction = {
      id: genUUID(),
      site_id: payload.site_id,
      item_id: payload.item_id || null,
      description: payload.description,
      severity: payload.severity,
      assignee: payload.assignee || null,
      due_date: payload.due_date || null,
      status: 'open',
      created_at: createdAt,
      closed_at: null,
    };
    adminOverlay.actionsCreated.push(fallback);
    saveOverlay(adminOverlay);
    return fallback;
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

    if (!error && data) {
      if (adminOverlay.actionsUpdated[actionId]) {
        delete adminOverlay.actionsUpdated[actionId];
        saveOverlay(adminOverlay);
      }
      return data as CorrectiveAction;
    }

    adminOverlay.actionsUpdated[actionId] = {
      ...(adminOverlay.actionsUpdated[actionId] || {}),
      ...updateData,
    };
    saveOverlay(adminOverlay);
    return { id: actionId, ...updateData } as CorrectiveAction;
  },

  async deleteCorrectiveAction(actionId: string): Promise<void> {
    await supabase.from('corrective_actions').delete().eq('id', actionId);
    if (!adminOverlay.actionsDeleted.includes(actionId)) {
      adminOverlay.actionsDeleted.push(actionId);
    }
    adminOverlay.actionsCreated = adminOverlay.actionsCreated.filter((a) => a.id !== actionId);
    delete adminOverlay.actionsUpdated[actionId];
    saveOverlay(adminOverlay);
  },

  // 6. Vehicle Washes
  async getVehicleWashes(siteId?: string): Promise<VehicleWash[]> {
    let query = supabase
      .from('vehicle_washes')
      .select('*')
      .order('started_at', { ascending: false });
    if (siteId) {
      query = query.eq('site_id', siteId);
    }
    const { data } = await query;
    const remote = (data || []) as VehicleWash[];

    const mergedMap = new Map<string, VehicleWash>();
    remote.forEach((w) => {
      if (
        !adminOverlay.washesDeleted.includes(w.id) &&
        !adminOverlay.sitesDeleted.includes(w.site_id)
      ) {
        const patch = adminOverlay.washesUpdated[w.id];
        mergedMap.set(w.id, patch ? { ...w, ...patch } : w);
      }
    });
    adminOverlay.washesCreated.forEach((w) => {
      if (
        (!siteId || w.site_id === siteId) &&
        !adminOverlay.washesDeleted.includes(w.id) &&
        !adminOverlay.sitesDeleted.includes(w.site_id)
      ) {
        const patch = adminOverlay.washesUpdated[w.id];
        mergedMap.set(w.id, patch ? { ...w, ...patch } : w);
      }
    });

    const list = Array.from(mergedMap.values());
    list.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    return list;
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

    if (!error && data) {
      return data as VehicleWash;
    }

    const fallback: VehicleWash = {
      id: genUUID(),
      ...payload,
      result: null,
      finished_at: null,
    };
    adminOverlay.washesCreated.push(fallback);
    saveOverlay(adminOverlay);
    return fallback;
  },

  async updateVehicleWash(
    washId: string,
    payload: Partial<
      Pick<
        VehicleWash,
        'plate' | 'vehicle_type' | 'driver' | 'origin' | 'destination' | 'steps' | 'result' | 'finished_at'
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

    if (!error && data) {
      if (adminOverlay.washesUpdated[washId]) {
        delete adminOverlay.washesUpdated[washId];
        saveOverlay(adminOverlay);
      }
      return data as VehicleWash;
    }

    adminOverlay.washesUpdated[washId] = {
      ...(adminOverlay.washesUpdated[washId] || {}),
      ...payload,
    };
    saveOverlay(adminOverlay);
    return { id: washId, ...payload } as VehicleWash;
  },

  async deleteVehicleWash(washId: string): Promise<void> {
    await supabase.from('vehicle_washes').delete().eq('id', washId);
    if (!adminOverlay.washesDeleted.includes(washId)) {
      adminOverlay.washesDeleted.push(washId);
    }
    adminOverlay.washesCreated = adminOverlay.washesCreated.filter((w) => w.id !== washId);
    delete adminOverlay.washesUpdated[washId];
    saveOverlay(adminOverlay);
  },

  // 7. Evidence Storage Upload
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
