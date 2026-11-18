-- ============================================================================
-- THÁI VIỆT CORPORATION – SQL CẬP NHẬT BẢNG NHÓM CHECKLIST, QUYỀN GRANT & RLS SUPABASE
-- Hướng dẫn: Copy mã SQL này vào Supabase Dashboard -> SQL Editor -> Run
-- Lưu ý: Chỉ sử dụng CREATE TABLE IF NOT EXISTS / ALTER TABLE, KHÔNG xóa bảng hay dữ liệu cũ.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. BẢNG CHECKLIST_GROUPS (Danh sách nhóm hạng mục lớn kèm thứ tự cho từng điểm rửa xe)
CREATE TABLE IF NOT EXISTS public.checklist_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. ĐẢM BẢO CÁC CỘT CẦN THIẾT TRÊN BẢNG CHECKLIST_ITEMS (KHÔNG TẠO LẠI BẢNG CŨ)
ALTER TABLE IF EXISTS public.checklist_items
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_critical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 3. BẬT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.checklist_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corrective_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_washes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. CẤP QUYỀN GRANT ĐẦY ĐỦ CHO ROLE authenticated (TRÁNH LỖI "permission denied")
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.checklist_groups TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.checklist_items TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inspection_results TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inspections TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sites TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.corrective_actions TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicle_washes TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated, anon;

-- 5. TẠO POLICY RLS CHO ROLE authenticated ĐƯỢC ĐỌC VÀ GHI TOÀN QUYỀN
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'checklist_groups' AND policyname = 'authenticated_all_checklist_groups'
  ) THEN
    CREATE POLICY "authenticated_all_checklist_groups"
      ON public.checklist_groups
      FOR ALL
      TO authenticated, anon
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'checklist_items' AND policyname = 'authenticated_all_checklist_items'
  ) THEN
    CREATE POLICY "authenticated_all_checklist_items"
      ON public.checklist_items
      FOR ALL
      TO authenticated, anon
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inspection_results' AND policyname = 'authenticated_all_inspection_results'
  ) THEN
    CREATE POLICY "authenticated_all_inspection_results"
      ON public.inspection_results
      FOR ALL
      TO authenticated, anon
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
