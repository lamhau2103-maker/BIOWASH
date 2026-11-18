export const SUPABASE_SCHEMA_AND_RLS_SQL = `-- ============================================================================
-- THÁI VIỆT CORPORATION – SQL QUẢN LÝ TIÊU ĐỀ LỚN (CHECKLIST_GROUPS), DI TRÚ DỮ LIỆU AN TOÀN, INDEX, QUYỀN GRANT & RLS SUPABASE
-- Hướng dẫn: Copy toàn bộ mã SQL này vào Supabase Dashboard -> SQL Editor -> Run
-- Lưu ý: Chỉ sử dụng CREATE TABLE IF NOT EXISTS / ALTER TABLE, KHÔNG xóa bảng (DROP) hay làm mất dữ liệu cũ.
-- Chạy lặp lại nhiều lần hoàn toàn an toàn (idempotent), không tạo trùng tiêu đề.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. BẢNG CHECKLIST_GROUPS (Lưu tiêu đề lớn riêng cho từng điểm rửa xe)
CREATE TABLE IF NOT EXISTS public.checklist_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  title text,
  name text,
  sort_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Đảm bảo bảng checklist_groups (nếu đã tạo từ phiên trước) có đầy đủ cột title, name, sort_order, is_active, created_at
ALTER TABLE IF EXISTS public.checklist_groups
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Đồng bộ giá trị giữa cột title và name (nếu bảng cũ chỉ có name)
UPDATE public.checklist_groups
SET
  title = COALESCE(NULLIF(btrim(title), ''), regexp_replace(btrim(COALESCE(name, '')), '^\\d+\\s*[).:-]\\s*', '')),
  name  = COALESCE(NULLIF(btrim(name), ''), regexp_replace(btrim(COALESCE(title, '')), '^\\d+\\s*[).:-]\\s*', ''))
WHERE title IS NULL OR btrim(title) = '' OR name IS NULL OR btrim(name) = '';

-- 2. BỔ SUNG CỘT group_id VÀ CÁC CỘT CẦN THIẾT TRÊN BẢNG CHECKLIST_ITEMS
ALTER TABLE IF EXISTS public.checklist_items
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.checklist_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_critical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 3. TẠO INDEX TỐI ƯU TRUY VẤN THEO ĐIỂM RỬA XE VÀ THỨ TỰ SẮP XẾP
CREATE INDEX IF NOT EXISTS idx_checklist_groups_site_sort
  ON public.checklist_groups (site_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_checklist_items_site_sort
  ON public.checklist_items (site_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_checklist_items_group_id
  ON public.checklist_items (group_id);

-- 4. CHUYỂN DỮ LIỆU CŨ AN TOÀN (IDEMPOTENT):
-- Mỗi điểm rửa xe hiện có được khởi tạo các tiêu đề lớn từ cấu trúc cũ (giữ đúng tên và thứ tự)
-- hoặc 6 tiêu đề mặc định nếu chưa có, sau đó gán group_id cho toàn bộ checklist_items.
DO $$
DECLARE
  r_site RECORD;
  r_grp RECORD;
  v_group_id uuid;
  v_clean_title text;
  v_sort integer;
  v_default_titles text[] := ARRAY[
    'Vị trí & phân vùng',
    'Hạ tầng rửa xe',
    'Thiết bị',
    'Hóa chất sát khuẩn',
    'Người & vệ sinh cá nhân',
    'Hồ sơ & giám sát'
  ];
  v_t text;
BEGIN
  FOR r_site IN SELECT id FROM public.sites LOOP
    v_sort := 0;

    -- 4a. Khởi tạo tiêu đề từ các mục nhỏ hiện có của điểm rửa xe (giữ nguyên thứ tự xuất hiện)
    FOR r_grp IN
      SELECT
        regexp_replace(btrim(COALESCE(group_name, '')), '^\\d+\\s*[).:-]\\s*', '') AS clean_title,
        MIN(sort_order) AS first_item_sort
      FROM public.checklist_items
      WHERE site_id = r_site.id
        AND COALESCE(btrim(group_name), '') <> ''
      GROUP BY regexp_replace(btrim(COALESCE(group_name, '')), '^\\d+\\s*[).:-]\\s*', '')
      ORDER BY MIN(sort_order) ASC
    LOOP
      v_clean_title := btrim(r_grp.clean_title);
      IF v_clean_title <> '' THEN
        v_sort := v_sort + 1;
        SELECT id INTO v_group_id
        FROM public.checklist_groups
        WHERE site_id = r_site.id
          AND lower(regexp_replace(btrim(COALESCE(title, name, '')), '^\\d+\\s*[).:-]\\s*', '')) = lower(v_clean_title)
        LIMIT 1;

        IF v_group_id IS NULL THEN
          INSERT INTO public.checklist_groups (site_id, title, name, sort_order, is_active)
          VALUES (r_site.id, v_clean_title, v_clean_title, v_sort, true)
          RETURNING id INTO v_group_id;
        END IF;

        -- Gán group_id cho các mục nhỏ thuộc tiêu đề này
        UPDATE public.checklist_items
        SET group_id = v_group_id
        WHERE site_id = r_site.id
          AND group_id IS NULL
          AND lower(regexp_replace(btrim(COALESCE(group_name, '')), '^\\d+\\s*[).:-]\\s*', '')) = lower(v_clean_title);
      END IF;
    END LOOP;

    -- 4b. Nếu điểm rửa xe hoàn toàn chưa có tiêu đề nào, tạo sẵn 6 tiêu đề mặc định làm khung
    IF NOT EXISTS (SELECT 1 FROM public.checklist_groups WHERE site_id = r_site.id) THEN
      v_sort := 0;
      FOREACH v_t IN ARRAY v_default_titles LOOP
        v_sort := v_sort + 1;
        INSERT INTO public.checklist_groups (site_id, title, name, sort_order, is_active)
        VALUES (r_site.id, v_t, v_t, v_sort, true);
      END LOOP;
    END IF;
  END LOOP;
END
$$;

-- 5. BẬT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.checklist_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corrective_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_washes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 6. CẤP QUYỀN GRANT ĐẦY ĐỦ CHO ROLE authenticated (TRÁNH LỖI "permission denied")
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.checklist_groups TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.checklist_items TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inspection_results TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inspections TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sites TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.corrective_actions TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicle_washes TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated, anon;

-- 7. TẠO POLICY RLS CHO ROLE authenticated ĐƯỢC ĐỌC VÀ GHI TOÀN QUYỀN
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
`;
