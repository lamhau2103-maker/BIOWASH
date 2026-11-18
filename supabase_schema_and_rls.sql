-- ============================================================================
-- BIO-WASH CHECK – SQL TẠO BẢNG, VIEW, TRIGGER & POLICY RLS SUPABASE
-- Hướng dẫn: Copy toàn bộ mã SQL này vào Supabase Dashboard -> SQL Editor -> Run
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. BẢNG PROFILES (Tài khoản & Phân quyền)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT 'Nhân viên ATSH',
  role text NOT NULL DEFAULT 'inspector' CHECK (role IN ('admin', 'inspector', 'viewer')),
  created_at timestamptz DEFAULT now()
);

-- 2. BẢNG SITES (Điểm rửa xe sát khuẩn)
CREATE TABLE IF NOT EXISTS public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  site_type text NOT NULL DEFAULT 'trai_heo' CHECK (site_type IN ('trai_ga', 'trai_heo', 'nha_may_cam', 'tram_trung_chuyen')),
  address text,
  lat double precision,
  lng double precision,
  manager_name text,
  manager_phone text,
  inspect_cycle_days integer NOT NULL DEFAULT 7,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 3. BẢNG CHECKLIST_ITEMS (Hạng mục checklist & Trạng thái hiện tại)
CREATE TABLE IF NOT EXISTS public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  group_name text NOT NULL,
  title text NOT NULL,
  is_critical boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  current_status text NOT NULL DEFAULT 'pending' CHECK (current_status IN ('pending', 'pass', 'fail', 'na')),
  current_severity text CHECK (current_severity IN ('nhe', 'nghiem_trong', 'nguy_co_cao')),
  last_checked_at timestamptz,
  last_checked_by text,
  updated_at timestamptz DEFAULT now()
);

-- 4. BẢNG INSPECTIONS (Phiên kiểm tra điều kiện điểm rửa)
CREATE TABLE IF NOT EXISTS public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'dieu_kien' CHECK (kind IN ('dieu_kien', 'tung_xe')),
  inspector_id uuid,
  inspector_name text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  score numeric,
  result text CHECK (result IN ('tot', 'can_cai_thien', 'khong_dat')),
  signature_url text,
  gps jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- 5. BẢNG INSPECTION_RESULTS (Kết quả chấm từng hạng mục & Đường dẫn ảnh minh chứng)
CREATE TABLE IF NOT EXISTS public.inspection_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  item_title text NOT NULL,
  group_name text NOT NULL,
  is_critical boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('pass', 'fail', 'na')),
  severity text CHECK (severity IN ('nhe', 'nghiem_trong', 'nguy_co_cao')),
  note text,
  photo_urls text[] NOT NULL DEFAULT '{}',
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, item_id)
);

-- 6. BẢNG CORRECTIVE_ACTIONS (Việc khắc phục lỗi)
CREATE TABLE IF NOT EXISTS public.corrective_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.checklist_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  severity text CHECK (severity IN ('nhe', 'nghiem_trong', 'nguy_co_cao')),
  assignee text,
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

-- 7. BẢNG VEHICLE_WASHES (Quy trình rửa & sát khuẩn từng xe 7 bước)
CREATE TABLE IF NOT EXISTS public.vehicle_washes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  plate text NOT NULL,
  vehicle_type text NOT NULL,
  driver text,
  origin text,
  destination text,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  result text CHECK (result IN ('dat', 'khong_dat')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- 8. VIEW TỔNG HỢP V_SITE_OVERVIEW
CREATE OR REPLACE VIEW public.v_site_overview AS
SELECT
  s.id AS site_id,
  s.name,
  s.site_type,
  s.lat,
  s.lng,
  COUNT(ci.id) FILTER (WHERE ci.is_active) AS total_items,
  COUNT(ci.id) FILTER (WHERE ci.is_active AND ci.current_status = 'pass') AS pass_items,
  COUNT(ci.id) FILTER (WHERE ci.is_active AND ci.current_status = 'fail') AS fail_items,
  COUNT(ci.id) FILTER (WHERE ci.is_active AND ci.current_status = 'pending') AS pending_items,
  COUNT(ci.id) FILTER (WHERE ci.is_active AND ci.is_critical AND ci.current_status = 'fail') AS critical_fail,
  CASE
    WHEN COUNT(ci.id) FILTER (WHERE ci.is_active AND ci.current_status IN ('pass', 'fail')) > 0
    THEN ROUND(
      (COUNT(ci.id) FILTER (WHERE ci.is_active AND ci.current_status = 'pass')::numeric * 100.0) /
      COUNT(ci.id) FILTER (WHERE ci.is_active AND ci.current_status IN ('pass', 'fail'))::numeric,
      1
    )
    ELSE 100.0
  END AS compliance_pct,
  MAX(ci.last_checked_at) AS last_checked_at,
  (
    SELECT COUNT(*)
    FROM public.corrective_actions ca
    WHERE ca.site_id = s.id AND ca.status <> 'closed'
  ) AS open_actions,
  (
    SELECT COUNT(*)
    FROM public.corrective_actions ca
    WHERE ca.site_id = s.id AND ca.status <> 'closed' AND ca.due_date < CURRENT_DATE
  ) AS overdue_actions
FROM public.sites s
LEFT JOIN public.checklist_items ci ON ci.site_id = s.id
GROUP BY s.id;

-- 9. TRIGGER TỰ ĐỘNG CẬP NHẬT TRẠNG THÁI HẠNG MỤC & ĐÓNG/MỞ VIỆC KHẮC PHỤC
CREATE OR REPLACE FUNCTION public.fn_sync_inspection_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.checklist_items
  SET
    current_status = NEW.status,
    current_severity = CASE WHEN NEW.status = 'fail' THEN COALESCE(NEW.severity, 'nghiem_trong') ELSE NULL END,
    last_checked_at = NEW.checked_at,
    updated_at = now()
  WHERE id = NEW.item_id;

  IF NEW.status = 'fail' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.corrective_actions
      WHERE site_id = NEW.site_id AND item_id = NEW.item_id AND status <> 'closed'
    ) THEN
      INSERT INTO public.corrective_actions (site_id, item_id, description, severity, status, created_at)
      VALUES (
        NEW.site_id,
        NEW.item_id,
        CASE WHEN NEW.note IS NOT NULL AND NEW.note <> '' THEN NEW.item_title || ': ' || NEW.note ELSE 'Khắc phục hạng mục: ' || NEW.item_title END,
        COALESCE(NEW.severity, 'nghiem_trong'),
        'open',
        now()
      );
    END IF;
  ELSIF NEW.status = 'pass' THEN
    UPDATE public.corrective_actions
    SET status = 'closed', closed_at = now()
    WHERE site_id = NEW.site_id AND item_id = NEW.item_id AND status <> 'closed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_inspection_result ON public.inspection_results;
CREATE TRIGGER trg_sync_inspection_result
AFTER INSERT OR UPDATE ON public.inspection_results
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_inspection_result();

-- 10. BẬT RLS & TẠO POLICY CHO NGƯỜI ĐÃ ĐĂNG NHẬP (AUTHENTICATED) ĐƯỢC ĐỌC VÀ GHI TOÀN QUYỀN
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corrective_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_washes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['profiles', 'sites', 'checklist_items', 'inspections', 'inspection_results', 'corrective_actions', 'vehicle_washes']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_authenticated_all_%I" ON public.%I;', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "allow_authenticated_all_%I" ON public.%I FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);',
      tbl, tbl
    );
  END LOOP;
END
$$;

-- 11. STORAGE BUCKET "evidence" LƯU ẢNH MINH CHỨNG & CHỮ KÝ
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence', 'evidence', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "allow_evidence_read" ON storage.objects;
CREATE POLICY "allow_evidence_read" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'evidence');

DROP POLICY IF EXISTS "allow_evidence_write" ON storage.objects;
CREATE POLICY "allow_evidence_write" ON storage.objects
  FOR INSERT TO authenticated, anon
  WITH CHECK (bucket_id = 'evidence');

DROP POLICY IF EXISTS "allow_evidence_update" ON storage.objects;
CREATE POLICY "allow_evidence_update" ON storage.objects
  FOR UPDATE TO authenticated, anon
  USING (bucket_id = 'evidence')
  WITH CHECK (bucket_id = 'evidence');

DROP POLICY IF EXISTS "allow_evidence_delete" ON storage.objects;
CREATE POLICY "allow_evidence_delete" ON storage.objects
  FOR DELETE TO authenticated, anon
  USING (bucket_id = 'evidence');
