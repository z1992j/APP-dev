'use client';

import { useAuth } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (!auth) {
    return <div className="p-10 text-center text-ink-500">跳转中…</div>;
  }
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 min-w-0 px-8 py-6 max-w-[1200px] mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
