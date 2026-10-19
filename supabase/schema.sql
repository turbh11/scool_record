-- ============================================================================
-- מערכת ניהול דיווחי שעות פרטניות (Tutoring Hours Tracker)
-- Supabase SQL Schema + Permissive Development RLS Policies + Contact & Class Columns
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create custom ENUM for report status
DO $$ BEGIN
    CREATE TYPE report_status AS ENUM ('pending', 'done', 'missed', 'excused');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create `schools` table
CREATE TABLE IF NOT EXISTS public.schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    name TEXT NOT NULL,
    semel_mosad TEXT NOT NULL,
    admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 3. Create `teachers` table
CREATE TABLE IF NOT EXISTS public.teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    magic_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    last_login TIMESTAMPTZ,
    id_number TEXT
);

-- Ensure `id_number`, `phone`, `email`, and `last_login` columns exist if `teachers` table was created earlier
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS id_number TEXT;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- 4. Create `schedule_templates` table
-- day_of_week: 1 = Sunday (ראשון), 2 = Monday (שני), ..., 6 = Friday (שישי)
CREATE TABLE IF NOT EXISTS public.schedule_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
    start_time TIME NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 45,
    subject TEXT NOT NULL,
    class_name TEXT
);

-- Ensure `class_name` column exists on `schedule_templates`
ALTER TABLE public.schedule_templates ADD COLUMN IF NOT EXISTS class_name TEXT;

-- 5. Create `weekly_actual_reports` table
CREATE TABLE IF NOT EXISTS public.weekly_actual_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
    template_id UUID REFERENCES public.schedule_templates(id) ON DELETE SET NULL,
    report_date DATE NOT NULL,
    start_time TIME NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 45,
    subject TEXT NOT NULL,
    class_name TEXT,
    status report_status NOT NULL DEFAULT 'pending',
    notes TEXT DEFAULT ''
);

-- Ensure `class_name` column exists on `weekly_actual_reports`
ALTER TABLE public.weekly_actual_reports ADD COLUMN IF NOT EXISTS class_name TEXT;

-- 6. Create `admin_profiles` table (Multi-Tenant School Admin Profiles)
CREATE TABLE IF NOT EXISTS public.admin_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    admin_name TEXT NOT NULL,
    id_number TEXT NOT NULL,
    school_name TEXT NOT NULL,
    institution_code TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.admin_profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.admin_profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 7. Multi-Tenant isolation key: `institution_code` (סמל מוסד) on every tenant-owned table
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS institution_code TEXT;
ALTER TABLE public.schedule_templates ADD COLUMN IF NOT EXISTS institution_code TEXT;
ALTER TABLE public.weekly_actual_reports ADD COLUMN IF NOT EXISTS institution_code TEXT;

-- Backfill existing rows (teachers <- schools.semel_mosad, templates/reports <- teachers)
UPDATE public.teachers t
   SET institution_code = s.semel_mosad
  FROM public.schools s
 WHERE t.school_id = s.id AND t.institution_code IS NULL;

UPDATE public.schedule_templates st
   SET institution_code = t.institution_code
  FROM public.teachers t
 WHERE st.teacher_id = t.id AND st.institution_code IS NULL;

UPDATE public.weekly_actual_reports r
   SET institution_code = t.institution_code
  FROM public.teachers t
 WHERE r.teacher_id = t.id AND r.institution_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_teachers_institution_code ON public.teachers(institution_code);
CREATE INDEX IF NOT EXISTS idx_schedule_templates_institution_code ON public.schedule_templates(institution_code);
CREATE INDEX IF NOT EXISTS idx_reports_institution_date ON public.weekly_actual_reports(institution_code, report_date);

-- Helpful indexes for performance and lookup
CREATE INDEX IF NOT EXISTS idx_schools_admin_user_id ON public.schools(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_teachers_school_id ON public.teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_magic_token ON public.teachers(magic_token);
CREATE INDEX IF NOT EXISTS idx_schedule_templates_teacher_id ON public.schedule_templates(teacher_id);
CREATE INDEX IF NOT EXISTS idx_reports_teacher_date ON public.weekly_actual_reports(teacher_id, report_date);
CREATE INDEX IF NOT EXISTS idx_reports_template_date ON public.weekly_actual_reports(template_id, report_date);
CREATE INDEX IF NOT EXISTS idx_admin_profiles_institution_code ON public.admin_profiles(institution_code);

-- ============================================================================
-- PERMISSIONS & ROW LEVEL SECURITY (DEVELOPMENT PERMISSIVE SETUP)
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_actual_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to schools" ON public.schools;
DROP POLICY IF EXISTS "Allow all access to teachers" ON public.teachers;
DROP POLICY IF EXISTS "Allow all access to schedule_templates" ON public.schedule_templates;
DROP POLICY IF EXISTS "Allow all access to weekly_actual_reports" ON public.weekly_actual_reports;
DROP POLICY IF EXISTS "Allow all access to admin_profiles" ON public.admin_profiles;

CREATE POLICY "Allow all access to schools"
    ON public.schools FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to teachers"
    ON public.teachers FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to schedule_templates"
    ON public.schedule_templates FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to weekly_actual_reports"
    ON public.weekly_actual_reports FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to admin_profiles"
    ON public.admin_profiles FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- ============================================================================
-- SUPABASE REALTIME PUBLICATION
-- ============================================================================
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_actual_reports;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 8. BELL SCHEDULE / מערכת צלצולים (institution_time_slots) & PERIOD NUMBERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.institution_time_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_code TEXT NOT NULL,
    period_number INT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_templates ADD COLUMN IF NOT EXISTS period_number INT;
ALTER TABLE public.weekly_actual_reports ADD COLUMN IF NOT EXISTS period_number INT;

CREATE INDEX IF NOT EXISTS idx_time_slots_institution ON public.institution_time_slots(institution_code);

ALTER TABLE public.institution_time_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to institution_time_slots" ON public.institution_time_slots;
CREATE POLICY "Allow all access to institution_time_slots"
    ON public.institution_time_slots FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

