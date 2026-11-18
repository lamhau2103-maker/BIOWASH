import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  Lock,
  MapPin,
  MinusCircle,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  ShieldAlert,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
import { repository } from '../lib/repository';
import {
  AppSettings,
  CHECKLIST_GROUPS,
  ChecklistItem,
  Inspection,
  InspectionResultCategory,
  InspectionResultRow,
  Profile,
  RESULT_LABELS,
  SeverityLevel,
  SEVERITY_LABELS,
  Site,
  SITE_TYPE_LABELS,
  VehicleWash,
  VehicleWashStep,
} from '../types/database';
import { CircularGauge } from './CommonUI';

interface InspectionViewProps {
  profile: Profile;
  sites: Site[];
  checklistItems: ChecklistItem[];
  selectedSiteId: string | null;
  onSelectSiteId: (id: string) => void;
  settings: AppSettings;
  onRefresh: () => void;
  onShowToast: (msg: string) => void;
  onOpenManageItems: (site: Site) => void;
  onOpenManageSites: () => void;
}

interface LocalItemDraft {
  status: 'pass' | 'fail' | 'na';
  severity: SeverityLevel;
  note: string;
  photo_urls: string[];
  assignee: string;
  due_date: string;
  checked_at: string;
}

const INITIAL_WASH_STEPS = (defaultMinutes: number): VehicleWashStep[] => [
  {
    step_number: 1,
    title: 'Bước 1: Kiểm tra xe trước khi rửa (vùng BẨN)',
    status: 'in_progress',
    started_at: new Date().toISOString(),
    finished_at: null,
    photo_urls: [],
    note: '',
  },
  {
    step_number: 2,
    title: 'Bước 2: Rửa cơ học sạch bùn đất & chất hữu cơ',
    status: 'locked',
    started_at: null,
    finished_at: null,
    photo_urls: [],
    note: '',
  },
  {
    step_number: 3,
    title: 'Bước 3: Phun sát khuẩn toàn bộ xe (gầm - thành - nóc)',
    status: 'locked',
    started_at: null,
    finished_at: null,
    photo_urls: [],
    note: '',
  },
  {
    step_number: 4,
    title: `Bước 4: Chờ đủ thời gian tiếp xúc hóa chất (${defaultMinutes} phút)`,
    status: 'locked',
    started_at: null,
    finished_at: null,
    photo_urls: [],
    note: '',
    contact_duration_seconds: defaultMinutes * 60,
  },
  {
    step_number: 5,
    title: 'Bước 5: Sát khuẩn tài xế & người đi cùng (nhúng ủng, thay đồ)',
    status: 'locked',
    started_at: null,
    finished_at: null,
    photo_urls: [],
    note: '',
  },
  {
    step_number: 6,
    title: 'Bước 6: Kiểm tra cuối trước khi qua cổng SẠCH',
    status: 'locked',
    started_at: null,
    finished_at: null,
    photo_urls: [],
    note: '',
  },
  {
    step_number: 7,
    title: 'Bước 7: Kết luận ĐẠT / KHÔNG ĐẠT cho phép qua vùng SẠCH',
    status: 'locked',
    started_at: null,
    finished_at: null,
    photo_urls: [],
    note: '',
  },
];

export const InspectionView: React.FC<InspectionViewProps> = ({
  profile,
  sites,
  checklistItems,
  selectedSiteId,
  onSelectSiteId,
  settings,
  onRefresh,
  onShowToast,
  onOpenManageItems,
  onOpenManageSites,
}) => {
  const canWrite = profile.role === 'admin' || profile.role === 'inspector';
  const activeSites = useMemo(() => sites.filter((s) => s.is_active), [sites]);
  const currentSite = useMemo(
    () => activeSites.find((s) => s.id === selectedSiteId) || activeSites[0] || null,
    [activeSites, selectedSiteId]
  );

  useEffect(() => {
    if (!selectedSiteId && currentSite) {
      onSelectSiteId(currentSite.id);
    }
  }, [currentSite, selectedSiteId, onSelectSiteId]);

  const [mode, setMode] = useState<'dieu_kien' | 'tung_xe'>('dieu_kien');

  // --- MODE 1: SITE CONDITION CHECKLIST STATE ---
  const [draftInspection, setDraftInspection] = useState<Inspection | null>(null);
  const [itemDrafts, setItemDrafts] = useState<Record<string, LocalItemDraft>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);

  // Quick Add & Quick Edit Item Title Inline
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickPanelMode, setQuickPanelMode] = useState<'add' | 'edit'>('add');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickGroup, setQuickGroup] = useState<string>(CHECKLIST_GROUPS[0]);
  const [quickCritical, setQuickCritical] = useState(false);
  const [quickEditItemId, setQuickEditItemId] = useState<string>('');
  const [quickEditTitle, setQuickEditTitle] = useState<string>('');

  // Inline Edit Item Title directly on Checklist Row
  const [inlineEditItemId, setInlineEditItemId] = useState<string | null>(null);
  const [inlineEditTitle, setInlineEditTitle] = useState<string>('');

  const [completing, setCompleting] = useState(false);

  const siteActiveItems = useMemo(() => {
    if (!currentSite) return [];
    return checklistItems
      .filter((i) => i.site_id === currentSite.id && i.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [checklistItems, currentSite]);

  // Load or create draft inspection when site changes
  useEffect(() => {
    if (!currentSite || !canWrite || mode !== 'dieu_kien') return;
    let mounted = true;
    setLoadingDraft(true);
    repository
      .getOrCreateDraftInspection({
        site_id: currentSite.id,
        inspector_id: profile.id,
        inspector_name: profile.full_name,
      })
      .then(({ inspection, results }) => {
        if (!mounted) return;
        setDraftInspection(inspection);

        const defaultDue = new Date();
        defaultDue.setDate(defaultDue.getDate() + 3);
        const defaultDueStr = defaultDue.toISOString().slice(0, 10);

        const map: Record<string, LocalItemDraft> = {};
        results.forEach((r) => {
          map[r.item_id] = {
            status: r.status,
            severity: r.severity || (r.is_critical ? 'nghiem_trong' : 'nhe'),
            note: r.note || '',
            photo_urls: r.photo_urls || [],
            assignee: currentSite.manager_name || '',
            due_date: defaultDueStr,
            checked_at: r.checked_at,
          };
        });
        setItemDrafts(map);
      })
      .catch((err) => {
        onShowToast(err instanceof Error ? err.message : 'Lỗi tải phiên kiểm tra nháp');
      })
      .finally(() => {
        if (mounted) setLoadingDraft(false);
      });

    return () => {
      mounted = false;
    };
  }, [currentSite?.id, canWrite, mode, profile.id, profile.full_name]);

  // Live Score & Progress Calculation
  const stats = useMemo(() => {
    const total = siteActiveItems.length;
    let answered = 0;
    let passCount = 0;
    let failCount = 0;
    let criticalFailCount = 0;

    siteActiveItems.forEach((it) => {
      const d = itemDrafts[it.id];
      if (!d) return;
      answered++;
      if (d.status === 'pass') passCount++;
      if (d.status === 'fail') {
        failCount++;
        if (it.is_critical) criticalFailCount++;
      }
    });

    const denom = passCount + failCount;
    const score = denom > 0 ? (passCount / denom) * 100 : 100;

    let resultCategory: InspectionResultCategory = 'tot';
    if (criticalFailCount > 0 || score < settings.thresholdWarning) {
      resultCategory = 'khong_dat';
    } else if (score < settings.thresholdGood) {
      resultCategory = 'can_cai_thien';
    }

    return {
      total,
      answered,
      passCount,
      failCount,
      criticalFailCount,
      score,
      resultCategory,
      progressPct: total > 0 ? Math.round((answered / total) * 100) : 0,
    };
  }, [siteActiveItems, itemDrafts, settings.thresholdGood, settings.thresholdWarning]);

  const persistItemDraft = async (item: ChecklistItem, draft: LocalItemDraft) => {
    if (!draftInspection || !currentSite || !canWrite) return;
    setSavingItemId(item.id);
    try {
      const row: Omit<InspectionResultRow, 'id'> = {
        inspection_id: draftInspection.id,
        item_id: item.id,
        site_id: currentSite.id,
        item_title: item.title,
        group_name: item.group_name,
        is_critical: item.is_critical,
        status: draft.status,
        severity: draft.status === 'fail' ? draft.severity : null,
        note: draft.note.trim() || null,
        photo_urls: draft.photo_urls,
        checked_at: new Date().toISOString(),
      };
      await repository.upsertInspectionResult(row, {
        assignee: draft.assignee,
        due_date: draft.due_date,
      });
      onRefresh();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Lỗi lưu kết quả hạng mục.');
    } finally {
      setSavingItemId(null);
    }
  };

  const handleSelectStatus = async (
    item: ChecklistItem,
    newStatus: 'pass' | 'fail' | 'na'
  ) => {
    if (!canWrite || !currentSite) return;
    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 3);

    const existing = itemDrafts[item.id];
    const nextDraft: LocalItemDraft = {
      status: newStatus,
      severity:
        existing?.severity || (item.is_critical ? 'nghiem_trong' : 'nhe'),
      note: existing?.note || '',
      photo_urls: existing?.photo_urls || [],
      assignee: existing?.assignee || currentSite.manager_name || '',
      due_date: existing?.due_date || defaultDue.toISOString().slice(0, 10),
      checked_at: new Date().toISOString(),
    };

    setItemDrafts((prev) => ({ ...prev, [item.id]: nextDraft }));
    await persistItemDraft(item, nextDraft);
  };

  const handleUploadItemPhoto = async (item: ChecklistItem, file: File) => {
    if (!canWrite) return;
    setUploadingItemId(item.id);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const url = await repository.uploadEvidenceFile(file, 'photos', ext);
      const current = itemDrafts[item.id];
      if (!current) return;
      const updated: LocalItemDraft = {
        ...current,
        photo_urls: [...current.photo_urls, url],
      };
      setItemDrafts((prev) => ({ ...prev, [item.id]: updated }));
      await persistItemDraft(item, updated);
      onShowToast('Đã tải ảnh minh chứng lên hệ thống');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Lỗi tải ảnh minh chứng.');
    } finally {
      setUploadingItemId(null);
    }
  };

  const handleQuickAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite || !quickTitle.trim() || !canWrite) return;
    try {
      const nextSort =
        siteActiveItems.length > 0
          ? Math.max(...siteActiveItems.map((i) => i.sort_order)) + 1
          : 1;
      await repository.createChecklistItem({
        site_id: currentSite.id,
        group_name: quickGroup,
        title: quickTitle.trim(),
        is_critical: quickCritical,
        sort_order: nextSort,
      });
      setQuickTitle('');
      setQuickCritical(false);
      setShowQuickAdd(false);
      onRefresh();
      onShowToast('Đã thêm nhanh hạng mục vào checklist');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Lỗi thêm nhanh hạng mục.');
    }
  };

  const handleQuickEditItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEditItemId || !quickEditTitle.trim() || !canWrite) return;
    try {
      await repository.updateChecklistItem(quickEditItemId, {
        title: quickEditTitle.trim(),
      });
      setShowQuickAdd(false);
      onRefresh();
      onShowToast('Đã cập nhật tên hạng mục thành công');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Lỗi cập nhật tên hạng mục.');
    }
  };

  const handleSaveInlineTitle = async (item: ChecklistItem) => {
    const trimmed = inlineEditTitle.trim();
    if (!trimmed || !canWrite) return;
    try {
      await repository.updateChecklistItem(item.id, { title: trimmed });
      setInlineEditItemId(null);
      setInlineEditTitle('');
      onRefresh();
      onShowToast('Đã sửa tên hạng mục thành công');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Lỗi sửa tên hạng mục.');
    }
  };

  const handleCompleteInspection = async () => {
    if (!draftInspection || !currentSite || !canWrite) return;

    // Validate all fail items have either photo or note
    for (const item of siteActiveItems) {
      const d = itemDrafts[item.id];
      if (d?.status === 'fail') {
        if (d.photo_urls.length === 0 && !d.note.trim()) {
          onShowToast(
            `Hạng mục Không đạt "${item.title}" bắt buộc phải chụp ảnh hoặc nhập ghi chú!`
          );
          return;
        }
      }
    }

    setCompleting(true);
    try {
      // Capture GPS if available
      let gpsCoords: { lat: number; lng: number; accuracy?: number } | null = null;
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        gpsCoords = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              }),
            () => resolve(null),
            { timeout: 5000 }
          );
        });
      }

      const gpsPayload: Record<string, unknown> = {
        lat: gpsCoords?.lat ?? currentSite.lat ?? 0,
        lng: gpsCoords?.lng ?? currentSite.lng ?? 0,
        accuracy: gpsCoords?.accuracy,
        captured_at: new Date().toISOString(),
      };

      await repository.completeInspection(draftInspection.id, {
        score: Math.round(stats.score * 10) / 10,
        result: stats.resultCategory,
        signature_url: null,
        gps: gpsPayload,
        finished_at: new Date().toISOString(),
      });

      onShowToast(
        `Đã hoàn tất kiểm tra điểm ${currentSite.name} · Kết quả: ${RESULT_LABELS[stats.resultCategory]}`
      );
      onRefresh();

      // Start a fresh draft if needed
      const fresh = await repository.getOrCreateDraftInspection({
        site_id: currentSite.id,
        inspector_id: profile.id,
        inspector_name: profile.full_name,
      });
      setDraftInspection(fresh.inspection);
      setItemDrafts({});
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Lỗi khi hoàn tất kiểm tra.');
    } finally {
      setCompleting(false);
    }
  };

  // --- MODE 2: PER-VEHICLE WASH PROCESS STATE ---
  const [activeWash, setActiveWash] = useState<VehicleWash | null>(null);
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState('Xe cám');
  const [driver, setDriver] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [washSteps, setWashSteps] = useState<VehicleWashStep[]>(() =>
    INITIAL_WASH_STEPS(settings.defaultContactMinutes)
  );
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(
    settings.defaultContactMinutes * 60
  );
  const [timerRunning, setTimerRunning] = useState(false);
  const [failReasonStep7, setFailReasonStep7] = useState('');
  const [washBusy, setWashBusy] = useState(false);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => {
      setTimerSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          onShowToast('Đã đủ thời gian tiếp xúc hóa chất sát khuẩn!');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning, onShowToast]);

  const handleStartVehicleWash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite || !canWrite) return;
    if (!plate.trim()) {
      onShowToast('Vui lòng nhập biển số xe.');
      return;
    }
    setWashBusy(true);
    try {
      const initialSteps = INITIAL_WASH_STEPS(settings.defaultContactMinutes);
      const created = await repository.createVehicleWash({
        site_id: currentSite.id,
        plate: plate.trim().toUpperCase(),
        vehicle_type: vehicleType,
        driver: driver.trim() || null,
        origin: origin.trim() || null,
        destination: destination.trim() || null,
        steps: initialSteps,
        started_at: new Date().toISOString(),
      });
      setActiveWash(created);
      setWashSteps(initialSteps);
      setTimerSecondsLeft(settings.defaultContactMinutes * 60);
      setTimerRunning(false);
      onRefresh();
      onShowToast(`Bắt đầu quy trình rửa xe ${created.plate}`);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Không thể tạo lượt rửa xe.');
    } finally {
      setWashBusy(false);
    }
  };

  const handleCompleteWashStep = async (stepIndex: number) => {
    if (!activeWash || !canWrite) return;
    const updated = [...washSteps];
    const now = new Date().toISOString();
    updated[stepIndex] = {
      ...updated[stepIndex],
      status: 'completed',
      finished_at: now,
    };

    if (stepIndex + 1 < updated.length) {
      updated[stepIndex + 1] = {
        ...updated[stepIndex + 1],
        status: 'in_progress',
        started_at: now,
      };
      if (updated[stepIndex + 1].step_number === 4) {
        setTimerSecondsLeft(settings.defaultContactMinutes * 60);
        setTimerRunning(true);
      }
    }

    setWashSteps(updated);
    await repository.updateVehicleWash(activeWash.id, { steps: updated });
    onRefresh();
  };

  const handleUploadWashStepPhoto = async (stepIndex: number, file: File) => {
    if (!activeWash || !canWrite) return;
    setWashBusy(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const url = await repository.uploadEvidenceFile(file, 'photos', ext);
      const updated = [...washSteps];
      updated[stepIndex] = {
        ...updated[stepIndex],
        photo_urls: [...updated[stepIndex].photo_urls, url],
      };
      setWashSteps(updated);
      await repository.updateVehicleWash(activeWash.id, { steps: updated });
      onShowToast('Đã lưu ảnh minh chứng bước rửa xe');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Lỗi tải ảnh.');
    } finally {
      setWashBusy(false);
    }
  };

  const handleFinishVehicleWash = async (finalResult: 'dat' | 'khong_dat') => {
    if (!activeWash || !canWrite) return;
    const now = new Date().toISOString();

    if (finalResult === 'khong_dat') {
      if (!failReasonStep7.trim()) {
        onShowToast('Vui lòng ghi rõ lý do KHÔNG ĐẠT trước khi yêu cầu rửa lại.');
        return;
      }
      // Return to Step 2 (Mechanical wash) as required in Section 5
      const resetSteps = washSteps.map((st, idx) => {
        if (idx === 0) return st;
        if (idx === 1) {
          return {
            ...st,
            status: 'in_progress' as const,
            started_at: now,
            finished_at: null,
            note: `Yêu cầu rửa lại: ${failReasonStep7.trim()}`,
          };
        }
        return {
          ...st,
          status: 'locked' as const,
          started_at: null,
          finished_at: null,
        };
      });
      setWashSteps(resetSteps);
      await repository.updateVehicleWash(activeWash.id, {
        steps: resetSteps,
        result: 'khong_dat',
      });
      setFailReasonStep7('');
      onRefresh();
      onShowToast('Xe KHÔNG ĐẠT kiểm tra cuối — Đã chuyển quay lại Bước 2: Rửa cơ học!');
      return;
    }

    // Passed all 7 steps
    const updated = [...washSteps];
    updated[6] = {
      ...updated[6],
      status: 'completed',
      finished_at: now,
    };
    await repository.updateVehicleWash(activeWash.id, {
      steps: updated,
      result: 'dat',
      finished_at: now,
    });
    setActiveWash(null);
    setPlate('');
    setDriver('');
    setOrigin('');
    setDestination('');
    onRefresh();
    onShowToast('Hoàn tất quy trình rửa xe sát khuẩn: ĐẠT — Cho phép xe vào vùng SẠCH!');
  };

  if (activeSites.length === 0) {
    return (
      <div className="glass-card rounded-3xl p-8 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-teal-400 mx-auto" />
        <h2 className="text-xl font-bold">Chưa có điểm rửa xe nào đang hoạt động</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
          Hãy thêm điểm rửa xe đầu tiên để hệ thống khởi tạo bộ 20 hạng mục kiểm tra An Toàn Sinh Học.
        </p>
        {profile.role === 'admin' && (
          <button
            type="button"
            onClick={onOpenManageSites}
            className="min-h-[48px] px-6 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span>Thêm điểm rửa xe đầu tiên</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Top Control Strip: Site Selector & Mode Switch */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 dark:text-teal-300 mb-1">
              Điểm rửa xe sát khuẩn đang kiểm tra
            </label>
            <select
              value={currentSite?.id || ''}
              onChange={(e) => onSelectSiteId(e.target.value)}
              className="w-full min-h-[48px] px-4 rounded-2xl bg-white/85 dark:bg-slate-900/70 border border-slate-300 dark:border-white/20 text-sm font-bold"
            >
              {activeSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({SITE_TYPE_LABELS[s.site_type]})
                </option>
              ))}
            </select>
          </div>

          {currentSite && canWrite && (
            <button
              type="button"
              onClick={() => onOpenManageItems(currentSite)}
              className="min-h-[48px] px-4 rounded-2xl bg-slate-200/80 dark:bg-white/10 hover:bg-slate-300/70 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shrink-0 sm:mt-5"
            >
              <Settings2 className="w-4 h-4" />
              <span>Quản lý hạng mục ({siteActiveItems.length})</span>
            </button>
          )}
        </div>

        {/* Mode Segmented Control */}
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-200/80 dark:bg-slate-950/60 border border-slate-300/50 dark:border-white/10">
          <button
            type="button"
            onClick={() => setMode('dieu_kien')}
            className={`min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-bold transition whitespace-nowrap shrink-0 ${
              mode === 'dieu_kien'
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Checklist Điều Kiện Điểm
          </button>
          <button
            type="button"
            onClick={() => setMode('tung_xe')}
            className={`min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              mode === 'tung_xe'
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Quy Trình Từng Xe (7 bước)</span>
          </button>
        </div>
      </div>

      {!canWrite && (
        <div className="rounded-2xl bg-amber-500/15 border border-amber-400/40 p-3.5 text-xs sm:text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <Lock className="w-4 h-4 shrink-0" />
          <span>
            Tài khoản của bạn có quyền <strong>Chỉ xem (viewer)</strong>. Các nút chấm điểm và lưu dữ liệu đã được khóa.
          </span>
        </div>
      )}

      {mode === 'dieu_kien' ? (
        <>
          {/* Sticky Progress & Live Score Bar */}
          <div className="sticky top-14 z-20 glass-panel rounded-2xl p-3.5 sm:p-4 shadow-lg space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
              <div className="flex items-center gap-2 font-bold">
                <span>
                  Tiến độ: {stats.answered}/{stats.total} hạng mục ({stats.progressPct}%)
                </span>
                <span>·</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  Đạt: {stats.passCount}
                </span>
                <span>·</span>
                <span className="text-rose-600 dark:text-rose-400">
                  Lỗi: {stats.failCount}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono tabular-nums font-bold">
                <span>Điểm tạm tính: {Math.round(stats.score)}%</span>
                <span>·</span>
                <span
                  className={
                    stats.resultCategory === 'tot'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : stats.resultCategory === 'can_cai_thien'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }
                >
                  {RESULT_LABELS[stats.resultCategory]}
                  {stats.criticalFailCount > 0 ? ' (Vi phạm mục Nghiêm trọng!)' : ''}
                </span>
              </div>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-300/60 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${stats.progressPct}%` }}
              />
            </div>
          </div>

          {/* Quick Add & Edit Item Inline Bar */}
          {canWrite && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (showQuickAdd && quickPanelMode === 'add') {
                    setShowQuickAdd(false);
                  } else {
                    setQuickPanelMode('add');
                    setShowQuickAdd(true);
                  }
                }}
                className={`min-h-[44px] px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  showQuickAdd && quickPanelMode === 'add'
                    ? 'btn-accent'
                    : 'bg-teal-500/15 border border-teal-400/30 text-teal-800 dark:text-teal-200 hover:bg-teal-500/25'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>
                  {showQuickAdd && quickPanelMode === 'add'
                    ? 'Đóng thêm nhanh'
                    : 'Thêm nhanh hạng mục ngay tại hiện trường'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (showQuickAdd && quickPanelMode === 'edit') {
                    setShowQuickAdd(false);
                  } else {
                    const firstItem = siteActiveItems[0];
                    if (firstItem) {
                      setQuickEditItemId(firstItem.id);
                      setQuickEditTitle(firstItem.title);
                    }
                    setQuickPanelMode('edit');
                    setShowQuickAdd(true);
                  }
                }}
                className={`min-h-[44px] px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  showQuickAdd && quickPanelMode === 'edit'
                    ? 'btn-accent'
                    : 'glass-tool'
                }`}
              >
                <Edit3 className="w-4 h-4" />
                <span>
                  {showQuickAdd && quickPanelMode === 'edit'
                    ? 'Đóng sửa tên hạng mục'
                    : 'Sửa tên hạng mục'}
                </span>
              </button>
            </div>
          )}

          {showQuickAdd && canWrite && quickPanelMode === 'add' && (
            <form onSubmit={handleQuickAddItem} className="glass-card rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={quickGroup}
                  onChange={(e) => setQuickGroup(e.target.value)}
                  className="min-h-[46px] px-3 rounded-xl bg-white/85 dark:bg-slate-900/70 border border-slate-300 dark:border-white/20 text-xs sm:text-sm"
                >
                  {CHECKLIST_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="Nhập tên hạng mục phát sinh..."
                  className="sm:col-span-2 min-h-[46px] px-3.5 rounded-xl bg-white/85 dark:bg-slate-900/70 border border-slate-300 dark:border-white/20 text-sm"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={quickCritical}
                    onChange={(e) => setQuickCritical(e.target.checked)}
                    className="w-4 h-4 accent-rose-600"
                  />
                  <span>Hạng mục NGHIÊM TRỌNG</span>
                </label>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 rounded-xl bg-teal-600 text-white text-xs font-bold"
                >
                  Lưu hạng mục
                </button>
              </div>
            </form>
          )}

          {showQuickAdd && canWrite && quickPanelMode === 'edit' && (
            <form
              onSubmit={handleQuickEditItemSubmit}
              className="glass-card rounded-2xl p-4 space-y-3"
            >
              <div className="text-xs font-bold text-slate-700 dark:text-white flex items-center gap-1.5">
                <Edit3 className="w-4 h-4 text-teal-600" />
                <span>Chọn hạng mục cần sửa tên và nhập tên mới:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={quickEditItemId}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    setQuickEditItemId(selectedId);
                    const found = siteActiveItems.find((it) => it.id === selectedId);
                    if (found) setQuickEditTitle(found.title);
                  }}
                  className="min-h-[46px] px-3 rounded-xl bg-white/85 dark:bg-slate-900/70 border border-slate-300 dark:border-white/20 text-xs sm:text-sm font-semibold"
                >
                  {siteActiveItems.map((it, i) => (
                    <option key={it.id} value={it.id}>
                      Mục {i + 1}: {it.title}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={quickEditTitle}
                  onChange={(e) => setQuickEditTitle(e.target.value)}
                  placeholder="Nhập tên hạng mục mới..."
                  className="min-h-[46px] px-3.5 rounded-xl bg-white/85 dark:bg-slate-900/70 border border-slate-300 dark:border-white/20 text-sm font-semibold"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(false)}
                  className="min-h-[44px] px-4 rounded-xl glass-tool text-xs font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 rounded-xl btn-accent text-xs font-bold"
                >
                  Lưu tên hạng mục
                </button>
              </div>
            </form>
          )}

          {/* Checklist Groups */}
          {loadingDraft ? (
            <div className="glass-card rounded-3xl p-8 text-center text-sm">
              Đang đồng bộ dữ liệu phiên kiểm tra...
            </div>
          ) : siteActiveItems.length === 0 ? (
            <div className="glass-card rounded-3xl p-8 text-center space-y-3">
              <p className="text-sm">Điểm này chưa có hạng mục kiểm tra đang kích hoạt.</p>
              {canWrite && currentSite && (
                <button
                  type="button"
                  onClick={() => onOpenManageItems(currentSite)}
                  className="min-h-[48px] px-5 rounded-xl bg-teal-600 text-white text-xs font-bold"
                >
                  Khởi tạo bộ hạng mục chuẩn
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(new Set(siteActiveItems.map((i) => i.group_name))).map((groupName) => {
                const groupItems = siteActiveItems.filter((i) => i.group_name === groupName);
                const isCollapsed = !!collapsedGroups[groupName];
                const groupDone = groupItems.filter((i) => !!itemDrafts[i.id]).length;

                return (
                  <div key={groupName} className="glass-card rounded-3xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedGroups((prev) => ({
                          ...prev,
                          [groupName]: !prev[groupName],
                        }))
                      }
                      className="w-full min-h-[54px] px-5 py-3.5 flex items-center justify-between text-left bg-teal-500/10 border-b border-slate-300/30 dark:border-white/10"
                    >
                      <div>
                        <h3 className="text-sm sm:text-base font-bold">{groupName}</h3>
                        <p className="text-xs text-slate-600 dark:text-teal-200/80">
                          Đã chấm {groupDone}/{groupItems.length} mục
                        </p>
                      </div>
                      {isCollapsed ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronUp className="w-5 h-5" />
                      )}
                    </button>

                    {!isCollapsed && (
                      <div className="divide-y divide-slate-300/30 dark:divide-white/10">
                        {groupItems.map((item, idx) => {
                          const draft = itemDrafts[item.id];
                          const isSaving = savingItemId === item.id;

                          return (
                            <div key={item.id} className="p-4 sm:p-5 space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
                                    <span className="font-mono font-bold">Mục {idx + 1}</span>
                                    {item.is_critical && (
                                      <>
                                        <span>·</span>
                                        <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                                          <AlertTriangle className="w-3.5 h-3.5" />
                                          NGHIÊM TRỌNG
                                        </span>
                                      </>
                                    )}
                                    {item.last_checked_at && (
                                      <>
                                        <span>·</span>
                                        <span>
                                          Lần trước:{' '}
                                          {item.current_status === 'fail'
                                            ? 'Không đạt ⚠️'
                                            : item.current_status === 'pass'
                                            ? 'Đạt'
                                            : 'Chưa chấm'}{' '}
                                          ({new Date(item.last_checked_at).toLocaleDateString('vi-VN')})
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  {inlineEditItemId === item.id ? (
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                                      <input
                                        type="text"
                                        value={inlineEditTitle}
                                        onChange={(e) => setInlineEditTitle(e.target.value)}
                                        placeholder="Nhập tên hạng mục..."
                                        className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-white/90 border border-sky-400 text-sm font-bold text-slate-900"
                                      />
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => handleSaveInlineTitle(item)}
                                          className="min-h-[40px] px-3.5 rounded-xl btn-accent text-xs font-bold flex items-center gap-1"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                          <span>Lưu tên</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setInlineEditItemId(null);
                                            setInlineEditTitle('');
                                          }}
                                          className="min-h-[40px] px-3 rounded-xl glass-tool text-xs font-bold flex items-center gap-1"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                          <span>Hủy</span>
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                                        {item.title}
                                      </p>
                                      {canWrite && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setInlineEditItemId(item.id);
                                            setInlineEditTitle(item.title);
                                          }}
                                          className="min-h-[34px] px-2.5 rounded-xl glass-tool text-[11px] font-bold flex items-center gap-1 shrink-0"
                                          title="Sửa tên hạng mục này"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                          <span>Sửa tên</span>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {isSaving && (
                                  <span className="text-xs text-teal-600 dark:text-teal-300 font-medium shrink-0">
                                    Đang lưu nháp...
                                  </span>
                                )}
                              </div>

                              {/* 3 Large Field Touch Buttons */}
                              <div className="grid grid-cols-3 gap-2.5">
                                <button
                                  type="button"
                                  disabled={!canWrite}
                                  onClick={() => handleSelectStatus(item, 'pass')}
                                  className={`min-h-[52px] rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-95 ${
                                    draft?.status === 'pass'
                                      ? 'bg-emerald-600 text-white glow-pass'
                                      : 'bg-white/75 dark:bg-white/10 text-slate-800 dark:text-slate-200 hover:bg-emerald-500/20'
                                  }`}
                                >
                                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                                  <span>✅ Đạt</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={!canWrite}
                                  onClick={() => handleSelectStatus(item, 'fail')}
                                  className={`min-h-[52px] rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-95 ${
                                    draft?.status === 'fail'
                                      ? 'bg-rose-600 text-white glow-fail'
                                      : 'bg-white/75 dark:bg-white/10 text-slate-800 dark:text-slate-200 hover:bg-rose-500/20'
                                  }`}
                                >
                                  <XCircle className="w-4 h-4 shrink-0" />
                                  <span>❌ Không đạt</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={!canWrite}
                                  onClick={() => handleSelectStatus(item, 'na')}
                                  className={`min-h-[52px] rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-95 ${
                                    draft?.status === 'na'
                                      ? 'bg-slate-600 text-white'
                                      : 'bg-white/75 dark:bg-white/10 text-slate-800 dark:text-slate-200 hover:bg-slate-500/20'
                                  }`}
                                >
                                  <MinusCircle className="w-4 h-4 shrink-0" />
                                  <span>➖ K.Áp dụng</span>
                                </button>
                              </div>

                              {/* Expanded Corrective Action & Evidence Panel when FAIL */}
                              {draft?.status === 'fail' && (
                                <div className="rounded-2xl bg-rose-500/10 border border-rose-400/30 p-3.5 space-y-3">
                                  <div className="text-xs font-bold text-rose-700 dark:text-rose-300">
                                    Bắt buộc: Chụp ảnh minh chứng hoặc ghi chú lỗi, chọn mức độ & giao người khắc phục
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                      <label className="block text-xs font-semibold mb-1">
                                        Mức độ vi phạm
                                      </label>
                                      <select
                                        disabled={!canWrite}
                                        value={draft.severity}
                                        onChange={(e) => {
                                          const updated = {
                                            ...draft,
                                            severity: e.target.value as SeverityLevel,
                                          };
                                          setItemDrafts((prev) => ({
                                            ...prev,
                                            [item.id]: updated,
                                          }));
                                          persistItemDraft(item, updated);
                                        }}
                                        className="w-full min-h-[46px] px-3 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-rose-400/40 text-xs sm:text-sm font-semibold"
                                      >
                                        {(Object.keys(SEVERITY_LABELS) as SeverityLevel[]).map(
                                          (sev) => (
                                            <option key={sev} value={sev}>
                                              {SEVERITY_LABELS[sev]}
                                            </option>
                                          )
                                        )}
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block text-xs font-semibold mb-1">
                                        Người phụ trách xử lý
                                      </label>
                                      <input
                                        type="text"
                                        disabled={!canWrite}
                                        value={draft.assignee}
                                        onChange={(e) => {
                                          const updated = {
                                            ...draft,
                                            assignee: e.target.value,
                                          };
                                          setItemDrafts((prev) => ({
                                            ...prev,
                                            [item.id]: updated,
                                          }));
                                        }}
                                        onBlur={() => persistItemDraft(item, draft)}
                                        placeholder="Tên người phụ trách"
                                        className="w-full min-h-[46px] px-3 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-rose-400/40 text-xs sm:text-sm"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-xs font-semibold mb-1">
                                        Hạn khắc phục
                                      </label>
                                      <input
                                        type="date"
                                        disabled={!canWrite}
                                        value={draft.due_date}
                                        onChange={(e) => {
                                          const updated = {
                                            ...draft,
                                            due_date: e.target.value,
                                          };
                                          setItemDrafts((prev) => ({
                                            ...prev,
                                            [item.id]: updated,
                                          }));
                                          persistItemDraft(item, updated);
                                        }}
                                        className="w-full min-h-[46px] px-3 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-rose-400/40 text-xs sm:text-sm font-mono"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-col sm:flex-row gap-2.5">
                                    <input
                                      type="text"
                                      disabled={!canWrite}
                                      value={draft.note}
                                      onChange={(e) => {
                                        const updated = { ...draft, note: e.target.value };
                                        setItemDrafts((prev) => ({
                                          ...prev,
                                          [item.id]: updated,
                                        }));
                                      }}
                                      onBlur={() => persistItemDraft(item, draft)}
                                      placeholder="Mô tả chi tiết lỗi phát hiện tại hiện trường..."
                                      className="flex-1 min-h-[48px] px-3.5 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-rose-400/40 text-sm"
                                    />

                                    {canWrite && (
                                      <label className="min-h-[48px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shrink-0">
                                        <Camera className="w-4 h-4" />
                                        <span>
                                          {uploadingItemId === item.id
                                            ? 'Đang tải ảnh...'
                                            : 'Chụp ảnh minh chứng'}
                                        </span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          capture="environment"
                                          className="hidden"
                                          onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) handleUploadItemPhoto(item, f);
                                          }}
                                        />
                                      </label>
                                    )}
                                  </div>

                                  {draft.photo_urls.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                      {draft.photo_urls.map((url, pIdx) => (
                                        <img
                                          key={pIdx}
                                          src={url}
                                          alt="Ảnh minh chứng"
                                          referrerPolicy="no-referrer"
                                          className="w-20 h-20 rounded-xl object-cover border border-white/30"
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Complete Inspection Button */}
              {canWrite && (
                <div className="glass-card rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-bold flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-teal-400" />
                      <span>Tự động đính kèm giờ hoàn tất, người kiểm tra & tọa độ GPS</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Điểm tuân thủ: <strong>{Math.round(stats.score)}%</strong> · Xếp loại:{' '}
                      <strong>{RESULT_LABELS[stats.resultCategory]}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={completing || stats.answered === 0}
                    onClick={handleCompleteInspection}
                    className="min-h-[54px] px-8 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-bold text-base shadow-lg shadow-teal-600/30 disabled:opacity-40 transition shrink-0"
                  >
                    {completing ? 'Đang hoàn tất...' : 'Hoàn Tất & Lưu Biên Bản Kiểm Tra'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* MODE 2: 7-STEP SEQUENTIAL VEHICLE WASH PROCESS */
        <div className="space-y-4">
          {!activeWash ? (
            <form onSubmit={handleStartVehicleWash} className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="text-lg font-bold">Tiếp nhận Phương Tiện Vào Trạm Rửa Sát Khuẩn</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Nguyên tắc 1 chiều: Vùng BẨN → Rửa cơ học → Phun sát khuẩn → Chờ tiếp xúc hóa chất → Sát khuẩn tài xế → Kiểm tra cuối → Vùng SẠCH.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Biển số xe *</label>
                  <input
                    type="text"
                    disabled={!canWrite}
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    placeholder="VD: 61C-123.45"
                    className="w-full min-h-[48px] px-3.5 rounded-xl bg-white/85 dark:bg-slate-900/70 border border-slate-300 dark:border-white/20 text-sm font-mono font-bold uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Loại phương tiện *</label>
                  <select
                    disabled={!canWrite}
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                    className="w-full min-h-[48px] px-3.5 rounded-xl bg-white/85 dark:bg-slate-900/70 border border-slate-300 dark:border-white/20 text-sm font-semibold"
                  >
                    <option value="Xe cám">Xe cám</option>
                    <option value="Xe gà">Xe gà</option>
                    <option value="Xe heo">Xe heo</option>
                    <option value="Xe vật tư">Xe vật tư</option>
                    <option value="Xe ngoài">Xe ngoài</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Họ tên tài xế</label>
                  <input
                    type="text"
                    disabled={!canWrite}
                    value={driver}
                    onChange={(e) => setDriver(e.target.value)}
                    placeholder="Nhập tên tài xế"
                    className="w-full min-h-[48px] px-3.5 rounded-xl bg-white/85 dark:bg-slate-900/70 border border-slate-300 dark:border-white/20 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Nguồn gốc xuất phát</label>
                  <input
                    type="text"
                    disabled={!canWrite}
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="VD: Nhà máy cám Đồng Nai"
                    className="w-full min-h-[48px] px-3.5 rounded-xl bg-white/85 dark:bg-slate-900/70 border border-slate-300 dark:border-white/20 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Điểm đến tiếp theo</label>
                  <input
                    type="text"
                    disabled={!canWrite}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="VD: Khu chăn nuôi Sạch số 2"
                    className="w-full min-h-[48px] px-3.5 rounded-xl bg-white/85 dark:bg-slate-900/70 border border-slate-300 dark:border-white/20 text-sm"
                  />
                </div>
              </div>

              {canWrite && (
                <button
                  type="submit"
                  disabled={washBusy}
                  className="w-full sm:w-auto min-h-[52px] px-6 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  <span>Bắt Đầu Quy Trình 7 Bước Rửa Xe Sát Khuẩn</span>
                </button>
              )}
            </form>
          ) : (
            <div className="space-y-4">
              <div className="glass-card rounded-3xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold text-teal-600 dark:text-teal-300">
                      {activeWash.plate}
                    </span>
                    <span>·</span>
                    <span className="text-sm font-semibold">{activeWash.vehicle_type}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Tài xế: {activeWash.driver || '—'} · Từ: {activeWash.origin || '—'} → Đến:{' '}
                    {activeWash.destination || '—'}
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-300">
                  Bắt đầu: {new Date(activeWash.started_at).toLocaleTimeString('vi-VN')}
                </span>
              </div>

              <div className="space-y-3">
                {washSteps.map((st, idx) => {
                  const isLocked = st.status === 'locked';
                  const isInProgress = st.status === 'in_progress';
                  const isCompleted = st.status === 'completed';

                  return (
                    <div
                      key={st.step_number}
                      className={`glass-card rounded-3xl p-4 sm:p-5 transition ${
                        isLocked
                          ? 'opacity-55'
                          : isInProgress
                          ? 'ring-2 ring-teal-400 glow-pass'
                          : ''
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          {isCompleted ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                          ) : isInProgress ? (
                            <Clock className="w-5 h-5 text-teal-400 animate-spin shrink-0" />
                          ) : (
                            <Lock className="w-5 h-5 text-slate-400 shrink-0" />
                          )}
                          <h4 className="text-sm sm:text-base font-bold">{st.title}</h4>
                        </div>
                        <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-300">
                          {st.started_at &&
                            `BĐ: ${new Date(st.started_at).toLocaleTimeString('vi-VN')}`}
                          {st.finished_at &&
                            ` · KT: ${new Date(st.finished_at).toLocaleTimeString('vi-VN')}`}
                        </div>
                      </div>

                      {!isLocked && (
                        <div className="mt-4 space-y-3 pt-3 border-t border-slate-300/30 dark:border-white/10">
                          {/* Step 4 Circular Countdown Timer */}
                          {st.step_number === 4 && (
                            <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-teal-500/10 border border-teal-400/30">
                              <CircularGauge
                                percentage={
                                  ((settings.defaultContactMinutes * 60 - timerSecondsLeft) /
                                    (settings.defaultContactMinutes * 60)) *
                                  100
                                }
                                size={96}
                                label={`${Math.floor(timerSecondsLeft / 60)
                                  .toString()
                                  .padStart(2, '0')}:${(timerSecondsLeft % 60)
                                  .toString()
                                  .padStart(2, '0')}`}
                                sublabel="Đếm ngược"
                              />
                              <div className="space-y-2 text-center sm:text-left flex-1">
                                <p className="text-xs sm:text-sm font-semibold">
                                  Thời gian tiếp xúc hóa chất tối thiểu ({settings.defaultContactMinutes} phút)
                                </p>
                                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setTimerRunning((prev) => !prev)}
                                    className="min-h-[44px] px-4 rounded-xl bg-teal-600 text-white text-xs font-bold"
                                  >
                                    {timerRunning ? 'Tạm dừng đồng hồ' : 'Chạy đồng hồ'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setTimerSecondsLeft(settings.defaultContactMinutes * 60)
                                    }
                                    className="min-h-[44px] px-3.5 rounded-xl bg-slate-200 dark:bg-white/10 text-xs font-semibold flex items-center gap-1"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>Đặt lại</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex flex-col sm:flex-row gap-2.5">
                            <input
                              type="text"
                              disabled={!isInProgress || !canWrite}
                              value={st.note}
                              onChange={(e) => {
                                const updated = [...washSteps];
                                updated[idx] = { ...st, note: e.target.value };
                                setWashSteps(updated);
                              }}
                              placeholder="Ghi chú bước thực hiện..."
                              className="flex-1 min-h-[48px] px-3.5 rounded-xl bg-white/85 dark:bg-slate-900/70 border border-slate-300 dark:border-white/20 text-sm"
                            />

                            {isInProgress && canWrite && (
                              <label className="min-h-[48px] px-4 rounded-xl bg-cyan-600/20 border border-cyan-400/40 text-cyan-800 dark:text-cyan-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
                                <Camera className="w-4 h-4" />
                                <span>Chụp ảnh bước {st.step_number}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUploadWashStepPhoto(idx, f);
                                  }}
                                />
                              </label>
                            )}
                          </div>

                          {st.photo_urls.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {st.photo_urls.map((u, i) => (
                                <img
                                  key={i}
                                  src={u}
                                  alt={`Bước ${st.step_number}`}
                                  referrerPolicy="no-referrer"
                                  className="w-16 h-16 rounded-xl object-cover border border-white/20"
                                />
                              ))}
                            </div>
                          )}

                          {isInProgress && st.step_number < 7 && canWrite && (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleCompleteWashStep(idx)}
                                className="min-h-[48px] px-5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs sm:text-sm font-bold"
                              >
                                Hoàn thành Bước {st.step_number} & Mở bước tiếp theo
                              </button>
                            </div>
                          )}

                          {isInProgress && st.step_number === 7 && canWrite && (
                            <div className="space-y-3 pt-2">
                              <input
                                type="text"
                                value={failReasonStep7}
                                onChange={(e) => setFailReasonStep7(e.target.value)}
                                placeholder="Nếu KHÔNG ĐẠT, nhập lý do để yêu cầu quay lại Bước 2 rửa lại..."
                                className="w-full min-h-[48px] px-3.5 rounded-xl bg-white/85 dark:bg-slate-900/70 border border-rose-400/40 text-sm"
                              />
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleFinishVehicleWash('dat')}
                                  className="min-h-[52px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm glow-pass"
                                >
                                  ✅ KẾT LUẬN: ĐẠT (Cho xe qua vùng SẠCH)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleFinishVehicleWash('khong_dat')}
                                  className="min-h-[52px] rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm glow-fail"
                                >
                                  ❌ KHÔNG ĐẠT (Quay lại Bước 2 Rửa cơ học)
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
