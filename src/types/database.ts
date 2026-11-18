export type UserRole = 'admin' | 'inspector' | 'viewer';

export type SiteType = 'trai_ga' | 'trai_heo' | 'nha_may_cam' | 'tram_trung_chuyen';

export type ItemStatus = 'pending' | 'pass' | 'fail' | 'na';

export type SeverityLevel = 'nhe' | 'nghiem_trong' | 'nguy_co_cao';

export type InspectionKind = 'dieu_kien' | 'tung_xe';

export type InspectionStatus = 'draft' | 'completed';

export type InspectionResultCategory = 'tot' | 'can_cai_thien' | 'khong_dat';

export type ActionStatus = 'open' | 'in_progress' | 'closed';

export type WashResult = 'dat' | 'khong_dat';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
}

export interface Site {
  id: string;
  name: string;
  site_type: SiteType;
  address: string | null;
  lat: number | null;
  lng: number | null;
  manager_name: string | null;
  manager_phone: string | null;
  inspect_cycle_days: number;
  is_active: boolean;
}

export interface ChecklistGroup {
  id: string;
  site_id: string;
  title: string;
  name?: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
}

export interface ChecklistItem {
  id: string;
  site_id: string;
  group_id?: string | null;
  group_name: string;
  title: string;
  is_critical: boolean;
  sort_order: number;
  is_active: boolean;
  current_status: ItemStatus;
  current_severity: SeverityLevel | null;
  last_checked_at: string | null;
  last_checked_by: string | null;
  updated_at: string | null;
}

export interface GpsData {
  lat: number;
  lng: number;
  accuracy?: number;
  captured_at?: string;
  rep_signature_url?: string;
  chemical_info?: {
    name?: string;
    concentration?: string;
    mixed_date?: string;
    expiry_date?: string;
  };
}

export interface Inspection {
  id: string;
  site_id: string;
  kind: InspectionKind;
  inspector_id: string | null;
  inspector_name: string | null;
  status: InspectionStatus;
  score: number | null;
  result: InspectionResultCategory | null;
  signature_url: string | null;
  gps: GpsData | null;
  started_at: string;
  finished_at: string | null;
}

export interface InspectionResultRow {
  id?: string;
  inspection_id: string;
  item_id: string;
  site_id: string;
  item_title: string;
  group_name: string;
  is_critical: boolean;
  status: 'pass' | 'fail' | 'na';
  severity: SeverityLevel | null;
  note: string | null;
  photo_urls: string[];
  checked_at: string;
}

export interface CorrectiveAction {
  id: string;
  site_id: string;
  item_id: string | null;
  description: string;
  severity: SeverityLevel | null;
  assignee: string | null;
  due_date: string | null;
  status: ActionStatus;
  created_at: string;
  closed_at: string | null;
}

export interface VehicleWashStep {
  step_number: number;
  title: string;
  status: 'locked' | 'in_progress' | 'completed' | 'failed';
  started_at: string | null;
  finished_at: string | null;
  photo_urls: string[];
  note: string;
  contact_duration_seconds?: number;
}

export interface VehicleWash {
  id: string;
  site_id: string;
  plate: string;
  vehicle_type: string;
  driver: string | null;
  origin: string | null;
  destination: string | null;
  steps: VehicleWashStep[];
  result: WashResult | null;
  started_at: string;
  finished_at: string | null;
}

export interface SiteOverview {
  site_id: string;
  name: string;
  site_type: SiteType;
  lat: number | null;
  lng: number | null;
  total_items: number;
  pass_items: number;
  fail_items: number;
  pending_items: number;
  critical_fail: number;
  compliance_pct: number | null;
  last_checked_at: string | null;
  open_actions: number;
  overdue_actions: number;
}

export interface AppSettings {
  thresholdGood: number;
  thresholdWarning: number;
  defaultContactMinutes: number;
  theme: 'dark' | 'light';
}

export const SITE_TYPE_LABELS: Record<SiteType, string> = {
  trai_ga: 'Trại gà',
  trai_heo: 'Trại heo',
  nha_may_cam: 'Nhà máy cám',
  tram_trung_chuyen: 'Trạm trung chuyển',
};

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  nhe: 'Nhẹ',
  nghiem_trong: 'Nghiêm trọng',
  nguy_co_cao: 'Nguy cơ cao',
};

export const RESULT_LABELS: Record<InspectionResultCategory, string> = {
  tot: 'Tốt',
  can_cai_thien: 'Cần cải thiện',
  khong_dat: 'Không đạt',
};

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  open: 'Mở',
  in_progress: 'Đang xử lý',
  closed: 'Đã đóng',
};

export const DEFAULT_GROUP_TITLES = [
  'Vị trí & phân vùng',
  'Hạ tầng rửa xe',
  'Thiết bị',
  'Hóa chất sát khuẩn',
  'Người & vệ sinh cá nhân',
  'Hồ sơ & giám sát',
] as const;

export const CHECKLIST_GROUPS = [
  '1) Vị trí & phân vùng',
  '2) Hạ tầng rửa xe',
  '3) Thiết bị',
  '4) Hóa chất sát khuẩn',
  '5) Người & vệ sinh cá nhân',
  '6) Hồ sơ & giám sát',
] as const;

export interface TemplateItem {
  group_name: string;
  title: string;
  is_critical: boolean;
  sort_order: number;
}

export const DEFAULT_TEMPLATE_ITEMS: TemplateItem[] = [
  // 1) Vị trí & phân vùng
  {
    group_name: '1) Vị trí & phân vùng',
    title: 'Phân vùng bẩn/sạch rõ ràng, đường đi một chiều không giao cắt',
    is_critical: true,
    sort_order: 1,
  },
  {
    group_name: '1) Vị trí & phân vùng',
    title: 'Biển báo, sơ đồ quy trình, nội quy dễ thấy',
    is_critical: false,
    sort_order: 2,
  },
  {
    group_name: '1) Vị trí & phân vùng',
    title: 'Cổng/barie kiểm soát hoạt động tốt',
    is_critical: false,
    sort_order: 3,
  },
  // 2) Hạ tầng rửa xe
  {
    group_name: '2) Hạ tầng rửa xe',
    title: 'Nền bê tông không đọng nước, có dốc thoát',
    is_critical: false,
    sort_order: 4,
  },
  {
    group_name: '2) Hạ tầng rửa xe',
    title: 'Hố/máng sát khuẩn bánh xe đủ sâu/dài, có dung dịch',
    is_critical: true,
    sort_order: 5,
  },
  {
    group_name: '2) Hạ tầng rửa xe',
    title: 'Thoát nước thải riêng, hố lắng/xử lý hoạt động',
    is_critical: false,
    sort_order: 6,
  },
  {
    group_name: '2) Hạ tầng rửa xe',
    title: 'Mái che, đèn chiếu sáng đủ',
    is_critical: false,
    sort_order: 7,
  },
  // 3) Thiết bị
  {
    group_name: '3) Thiết bị',
    title: 'Máy bơm áp lực/súng rửa hoạt động tốt',
    is_critical: false,
    sort_order: 8,
  },
  {
    group_name: '3) Thiết bị',
    title: 'Hệ thống phun sát khuẩn phủ kín gầm-thành-nóc xe',
    is_critical: true,
    sort_order: 9,
  },
  {
    group_name: '3) Thiết bị',
    title: 'Nguồn nước đủ lượng đủ áp',
    is_critical: false,
    sort_order: 10,
  },
  {
    group_name: '3) Thiết bị',
    title: 'Dụng cụ vệ sinh đầy đủ, sạch',
    is_critical: false,
    sort_order: 11,
  },
  // 4) Hóa chất sát khuẩn
  {
    group_name: '4) Hóa chất sát khuẩn',
    title: 'Ghi tên hóa chất, nồng độ pha (%), ngày pha, hạn dùng',
    is_critical: false,
    sort_order: 12,
  },
  {
    group_name: '4) Hóa chất sát khuẩn',
    title: 'Dung dịch không loãng/đục/hết hạn, thay đúng chu kỳ',
    is_critical: true,
    sort_order: 13,
  },
  {
    group_name: '4) Hóa chất sát khuẩn',
    title: 'Kho hóa chất gọn, có nhãn, có SDS',
    is_critical: false,
    sort_order: 14,
  },
  // 5) Người & vệ sinh cá nhân
  {
    group_name: '5) Người & vệ sinh cá nhân',
    title: 'Khu sát khuẩn tài xế (nhúng ủng/phun giày, thay đồ)',
    is_critical: false,
    sort_order: 15,
  },
  {
    group_name: '5) Người & vệ sinh cá nhân',
    title: 'Bảo hộ lao động đầy đủ',
    is_critical: false,
    sort_order: 16,
  },
  {
    group_name: '5) Người & vệ sinh cá nhân',
    title: 'Nhân viên được huấn luyện, nắm quy trình',
    is_critical: false,
    sort_order: 17,
  },
  // 6) Hồ sơ & giám sát
  {
    group_name: '6) Hồ sơ & giám sát',
    title: 'Sổ nhật ký xe ra vào ghi đầy đủ',
    is_critical: false,
    sort_order: 18,
  },
  {
    group_name: '6) Hồ sơ & giám sát',
    title: 'Camera hoạt động, lưu hình',
    is_critical: false,
    sort_order: 19,
  },
  {
    group_name: '6) Hồ sơ & giám sát',
    title: 'Có biên bản khắc phục lỗi lần trước',
    is_critical: false,
    sort_order: 20,
  },
];
