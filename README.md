# Scool Record - Tutoring Hours Management System

A comprehensive SaaS (Multi-Tenant) platform designed for educational institutions to manage, track, and report private tutoring hours efficiently and securely.

## 🚀 Key Features
* **Full Multi-Tenancy:** Supports an unlimited number of schools under a single infrastructure. Each admin only has access to their institution's data, strictly enforced via PostgreSQL Row Level Security (RLS) and `institution_code`.
* **Smart Data Import/Export:** Import teachers and schedules from Ministry of Education Excel files. Includes an automated deduplication engine and time normalization. Export weekly/monthly reports to Excel.
* **Role-Based Access Control (RBAC):** Secure, server-verified Super Admin access for institution management, alongside isolated School Admin and Teacher profiles.
* **Real-Time Analytics Dashboard:** Dynamic tracking of completed hours, missing reports, and approved absences with weekly segmentation.
* **Passwordless Authentication:** Secure Magic Links sent directly to teachers via Email or WhatsApp.
* **Production-Ready Stability:** Fully covered by end-to-end (E2E) UI testing and concurrent load testing to ensure high availability.

## 🛠️ Tech Stack
* **Frontend:** Next.js 15 (App Router), React, Tailwind CSS, Lucide React
* **Backend:** Supabase (PostgreSQL), Supabase Auth, Row Level Security (RLS)
* **Testing & QA:** Playwright (E2E), Python Requests (Load Testing), GitHub Actions (CI/CD)
* **Utils:** XLSX (Excel parsing/export), Date-fns (Timezones & Formatting)

## 📦 Local Setup & Installation

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com/your-username/scool_record.git
   cd scool_record
   npm install
   ```

2. **Configure Environment Variables:**
Create a `.env.local` file in the root directory and add your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Super Admin authorization (comma-separated emails)
SUPER_ADMIN_EMAILS=your_email@gmail.com
```

3. **Run the Development Server:**
```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## 🧪 Testing

The project includes a comprehensive automated testing infrastructure:

* **End-to-End (E2E) Testing via Playwright:**
```bash
npm run test:e2e        # Run in headless mode
npm run test:e2e:ui     # Run with interactive UI
```

* **Stress & Load Testing:**
```bash
pip install requests
python scripts/load_test.py
```

## 🔒 Security & Deployment

This application is Production-Ready and optimized for Vercel deployment. A GitHub Actions CI/CD pipeline is integrated to automatically execute the Playwright test suite on every push, ensuring zero regressions reach production.

