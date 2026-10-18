import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h2 className="text-2xl font-bold text-slate-800">העמוד לא נמצא (404)</h2>
      <p className="mt-2 text-slate-600">העמוד שחיפשת אינו קיים או שהוסר.</p>
      <Link
        href="/"
        className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-700"
      >
        חזרה לדף הבית
      </Link>
    </div>
  );
}

