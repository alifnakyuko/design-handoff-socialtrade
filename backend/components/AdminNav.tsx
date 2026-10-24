'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export function AdminNav() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <nav className="bg-brand-dark text-brand-cream px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="font-extrabold">Social Trade Admin</span>
        <Link href="/admin/content" className="text-sm font-semibold hover:text-brand-gold">
          Konten
        </Link>
        <Link href="/admin/members" className="text-sm font-semibold hover:text-brand-gold">
          Member
        </Link>
      </div>
      <button onClick={handleLogout} className="text-sm font-semibold hover:text-brand-gold">
        Keluar
      </button>
    </nav>
  );
}
