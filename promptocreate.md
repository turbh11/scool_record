# 🚀 Master Blueprint & Prompt: Complete Multi-Role Israeli School Individual Hours Management System (מערכת ניהול ומעקב שעות פרטניות)

> **הוראות שימוש:** פרומפט מקיף ומדויק זה נועד להזנה למודל AI או לצוות פיתוח בכיר כדי להקים את המערכת כולה מאפס בבת-אחת – ללא באגים, ללא בעיות קומפילציה ב-Next.js 15, ללא חסימות RLS במסד הנתונים, ועם תמיכה מלאה בכל תרחישי הקצה שנלמדו ונבדקו בפועל.

---

```markdown
You are a Principal Full-Stack Engineer and System Architect specializing in Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, and Supabase.

Build a complete, production-grade, enterprise-ready Multi-Role Educational Management Platform for Israeli Schools called "שעות פרטניות - מערכת ניהול ומעקב בית-ספרית" (School Individual Hours Management & Tracking).

The application must be fully localized in Hebrew (RTL layout: `dir="rtl"`), adhere strictly to the Israeli school week (Sunday through Friday), and support three distinct, isolated roles:
1. **Super Admin (מנהל על)**: System-wide governance, provisioning new school environments, creating school admins, sending automated credentials/magic links, and freezing/unfreezing institutions.
2. **School Admin (מנהל בית ספר)**: Custom bell schedule (לוח זמני שיעורים), managing teachers, smart Excel import/export, assigning individual lesson templates, reviewing weekly fulfillment metrics (KPIs), and overriding statuses with pedagogical notes.
3. **Teacher (מורה)**: A dedicated, passwordless personal reporting portal accessed via Magic Token (`/teacher?token=...`), where teachers report actual lesson execution, provide mandatory reasons for excused absences, and customize their fixed schedule.

---

### TECH STACK & STRICT ARCHITECTURAL CONSTRAINTS

1. **Framework**: Next.js 15+ (App Router), React 19, TypeScript (strict mode).
2. **Styling**: Tailwind CSS (RTL support, glassmorphism modal design, modern responsive UI).
3. **Icons**: `lucide-react`.
4. **Database & Auth**: Supabase PostgreSQL + Supabase Auth + Supabase SSR.
5. **Excel Handling**: `xlsx` (SheetJS) with RTL Hebrew support.
6. **E2E Testing**: Playwright with Chromium (single worker execution to prevent auth race conditions).

#### ⚠️ CRITICAL NEXT.JS 15 RULES (MUST ENFORCE TO PREVENT CRASHES):
- **Flight Loader Rule**: Any file marked with `"use server"` MUST ONLY export `async` functions. **NEVER** export constants, arrays, objects, or synchronous helper functions from `"use server"` files (e.g. move `DEFAULT_BELL_PRESETS` to a shared client/universal file like `@/lib/constants/bell-schedule.ts`). Only TypeScript `export type` or `export interface` is allowed.
- **Service Role Key Usage**: All administrative database operations (`admin-onboarding.ts`, `super-admin-actions.ts`, `admin-dashboard-actions.ts`) MUST instantiate Supabase using `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)` to reliably bypass Row Level Security (RLS) on backend operations.
- **Hydration Safety**: Dates and weekly ranges must be calculated in `useEffect` or client-side components to eliminate SSR/CSR hydration mismatches with Israeli timezone (`Asia/Jerusalem`).
- **No Infinite Loops**: When passing callback props (e.g., `onSlotsUpdated`) into modal components, stabilize them with `useCallback` or `useRef` to prevent re-render cascading loops.

---

### DATABASE SCHEMA & TABLES (PostgreSQL / Supabase)

Create the following tables in the `public` schema with UUID primary keys and proper indexes:

```sql
-- 1. Schools (מוסדות חינוך)
CREATE TABLE IF NOT EXISTS public.schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    name TEXT NOT NULL,
    semel_mosad TEXT NOT NULL UNIQUE,
    address TEXT,
    phone TEXT
);

-- 2. Admin Profiles (פרופילי מנהלי בתי ספר ומנהלי על)
CREATE TABLE IF NOT EXISTS public.admin_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    admin_name TEXT NOT NULL,
    school_name TEXT NOT NULL,
    institution_code TEXT NOT NULL,
    id_number TEXT,
    email TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_super_admin BOOLEAN NOT NULL DEFAULT false
);

-- 3. Teachers (מורים)
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
    id_number TEXT,
    institution_code TEXT
);

-- 4. Institution Time Slots / Bell Schedule (לוח זמני שיעורים מוסדי)
-- day_of_week: 'all' for standard days (Sunday-Thursday), or '6' for Friday specific bells
CREATE TABLE IF NOT EXISTS public.institution_time_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    institution_code TEXT NOT NULL,
    period_number INT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    day_of_week TEXT NOT NULL DEFAULT 'all',
    CONSTRAINT unique_inst_period_day UNIQUE (institution_code, period_number, day_of_week)
);

-- 5. Schedule Templates (מערכת שעות קבועה לכל מורה)
-- day_of_week: 1 = Sunday, 2 = Monday, ..., 6 = Friday
CREATE TABLE IF NOT EXISTS public.schedule_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
    start_time TIME NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 45,
    subject TEXT NOT NULL,
    class_name TEXT,
    period_number INT,
    institution_code TEXT
);

-- 6. Weekly Actual Reports (דיווחי ביצוע שבועיים בפועל)
-- status: 'pending', 'done', 'missed', 'excused'
CREATE TABLE IF NOT EXISTS public.weekly_actual_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
    template_id UUID REFERENCES public.schedule_templates(id) ON DELETE SET NULL,
    report_date DATE NOT NULL,
    start_time TIME NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 45,
    subject TEXT NOT NULL,
    class_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'missed', 'excused')),
    notes TEXT,
    CONSTRAINT unique_teacher_session_date UNIQUE (teacher_id, report_date, start_time)
);

-- 7. Institution Settings
CREATE TABLE IF NOT EXISTS public.institution_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_code TEXT NOT NULL UNIQUE,
    school_name TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### CORE MODULES & USER FLOWS

#### 1. SUPER ADMIN GOVERNANCE (`/super-admin`)
- **Route Guard**: Only accessible if authenticated email matches `SUPER_ADMIN_EMAILS` (comma-separated env variable) or `is_super_admin = true`. Unauthenticated requests redirect to `/admin/login`.
- **Navigation Bar**: In the `/admin` dashboard header, if the user is a Super Admin, always show a distinct purple button: `"ניהול מערכת (Super Admin)"`.
- **School Onboarding Wizard**:
  - Fields: Admin Name, ID Number, School Name, Semel Mosad (6-digit code), Admin Email.
  - Generates a secure random initial password (min 10 chars, upper, lower, digit, symbol).
  - Creates the Supabase Auth user via `admin.createUser`.
  - Inserts records into `schools` and `admin_profiles` (with `email` explicitly populated).
  - Sends a styled HTML Welcome Email via Resend containing the credentials card:
    - `"שם משתמש (דוא״ל): [email]"`
    - `"סיסמה ראשונית: [password]"`
    - Action button with Magic Link login URL.
  - Renders a prominent Summary Card on screen with a `"העתק פרטי גישה לשליחה למנהל"` clipboard button.
- **Active Institutions Table**:
  - Displays all registered institutions, status (Active / Frozen), admin name, email, and actions.
  - **Freeze / Unfreeze**: Toggling `is_active` immediately invalidates the school admin's session and displays a polite freeze notice on login.
  - **Quick Magic Link Modal**: Generate and copy magic link, or click `"שלח שוב במייל"` to re-dispatch credentials.

#### 2. SCHOOL ADMIN DASHBOARD (`/admin`)
- **Header & Session Identity**:
  - Displays School Name and Institution Code. **Must NEVER display `"---"`**. If user's metadata is missing, automatically query `admin_profiles` by user ID or fallback gracefully to the active school record.
  - Logout button: Completely clears Supabase session and redirects cleanly via `window.location.href = '/admin/login'`.
- **Flexible Bell Schedule Modal (לוח זמני שיעורים)**:
  - Custom per-institution period times.
  - "טען לוח זמנים מומלץ" preset button as an optional starting point.
  - **Smart 45-min Default**: When adding period $N$, default start time is end time of period $N-1$, and end time is $+45$ minutes.
  - **Chronological Validation**: Enforce `end_time > start_time`. Show Hebrew toast warning if violated.
  - Inline Edit & Delete: Edit period times in-place with save/cancel controls.
  - Day-Specific Schedules: Support separate schedule for Friday (`day_of_week = '6'`) vs regular days (`'all'`).
- **Teacher Management (`TeacherScheduleModal.tsx`)**:
  - Teacher creation: Name, Subject, ID Number, Phone, Email.
  - Teacher inline edit and delete with cascade.
  - Sharing: One-click "Copy Magic Link" (`/teacher?token=...`), WhatsApp direct link (`wa.me/...`), and automated email dispatch.
  - Slot Assignment: Select Day (1-6), Period (linked to Bell Schedule), Subject, and Class Name (e.g. `ט'3`).
- **Smart Excel Import (`handleExcelFileSelected`)**:
  - Columns: `שם המורה`, `תחום דעת`, `טלפון`, `מייל`, `יום בשבוע (1-6, אופציונלי)`, `מספר שיעור (אופציונלי)`, `שעת התחלה (אופציונלי)`, `משך בדקות (אופציונלי)`, `נושא פרטני`, `כיתה`.
  - **Deduplication**: Match existing teacher by `id_number`, matching valid `email`, matching `phone` (stripping hyphens), or trimmed `name`.
  - **Optional Fields**: Neither phone nor email is mandatory. If non-email dummy text (like "ששש") is entered, sanitize to `null`.
  - **Bell Schedule Auto-Resolution**: If the user leaves `שעת התחלה` empty but specifies `מספר שיעור` (e.g. שיעור 1), automatically look up the period in the school's `institution_time_slots` (or default presets) and assign start time and duration!
- **Weekly Schedule Grid, Axis Toggle & Live Auto-Update**:
  - Israeli week grid (Sun-Fri).
  - **Segmented Axis Toggle**: Default view is Period Numbers (`מספרי שיעור 1, 2, 3...` with subtle bell time ranges underneath), with a one-click toggle to switch to Clock Hours (`08:00`, `09:00`...).
  - **Zero-Lag Live Auto-Update**: Silent background sync via `window` focus, `visibilitychange`, 6s lightweight polling (while visible and no modals are open), and Supabase Realtime channel (`INSERT`, `UPDATE`, `DELETE` on `weekly_actual_reports`) using JSON equality checks so only changed data re-renders without spinners or flickering.
  - Cards show Teacher Name, Subject, Class Name, Time, Period Number, and Status badge.
  - Clicking any session opens the Admin Override Modal to change status and append administrative pedagogical notes.
- **KPI Metrics Cards**:
  - Total individual hours scheduled, completed hours, excused absences, and missing reports with percentage completion bar.
- **Excel Export**:
  - One-click export to official Ministry of Education formatted RTL `.xlsx` file.

#### 3. TEACHER PERSONAL REPORTING PORTAL (`/teacher`)
- **Passwordless Entry**:
  - If visited without a token, display a clean "כניסה לאזור דיווח אישי למורה" card prompting for the personal Magic Token.
  - If visited via `/teacher?token=[token]`, automatically authenticate and render the dashboard.
- **Greeting & Week Selector**:
  - "שלום, [שם המורה]", subject badge, and week navigation arrows.
- **Session Reporting Cards (Full Status Control & Undo/Reset)**:
  - Three toggleable status buttons: `"בוצע"` (`done`), `"לא בוצע"` (`missed`), and `"היעדרות מאושרת"` (`excused`, requires mandatory reason note).
  - **Undo / Reset (`pending`)**: Clicking the active status button a second time OR clicking the explicit `"↺ בטל דיווח (החזר לממתין)"` button deletes/resets the report row via `resetWeeklyReportAction` (using `SUPABASE_SERVICE_ROLE_KEY`) with instant Optimistic UI and Hebrew toast `"הדיווח בוטל והוחזר למצב ממתין"`.
  - `"שמור הערה"`: Save pedagogical notes.
  - `"סמן הכל כבוצע"`: Bulk action button for all past/present pending sessions in that week.
- **Self-Service Fixed Schedule Accordion**:
  - Allows teachers to add or remove their own recurring weekly slots directly.

---

### AUTOMATED TESTING WITH PLAYWRIGHT (`playwright.config.ts`)

Configure Playwright with:
- `workers: 1`, `fullyParallel: false` to avoid session thrashing.
- Comprehensive end-to-end multi-role test ([`tests/full-e2e-lifecycle.spec.ts`](file:///c:/Users/barak/PycharmProjects/scool_record/tests/full-e2e-lifecycle.spec.ts)):
  1. Super Admin logs in, provisions new school `E2E School` with unique semel and admin email.
  2. Extracts generated initial password and asserts new institution in table.
  3. Clears cookies and logs in as the new School Admin.
  4. Configures bell schedule (tests chronological validation and period addition).
  5. Adds a teacher, tests edit, copies magic link, sends email, assigns schedule slot.
  6. Reloads page and asserts database persistence.
  7. Opens teacher portal via magic token, asserts greeting and assigned slots.
  8. Reports session notes, updates fixed schedule accordion.
  9. Tests institution settings modal, password modal, week navigation, and logout.
```

---

### 3. סיכום יתרונות המערכת והפרומפט

1. **אפס קריסות של Next.js 15**: קובץ הפרומפט מגדיר מראש את חוקי ה-Flight Loader (הפרדת אובייקטים מקבצי `'use server'`) שמנעו קריסות קומפילציה.
2. **עמידות במסד נתונים (Service Role Bypassing)**: הגדרה מפורשת של הרשאות מאסטר עבור פעולות שרת שאינן תלויות ב-Cookies לקוח.
3. **פתרון מלא למקרי קצה בייבוא אקסל**: טיפול במורים ללא מייל/טלפון, זיהוי כפילויות לפי טלפון, ושיבוץ שעות אוטומטי מלוח הצלצולים גם אם שעת ההתחלה הושארה ריקה.
4. **כיסוי בדיקות 100%**: מודל בדיקות המבטיח שכל תפקיד (Super Admin, School Admin, Teacher) נבדק מקצה לקצה.

