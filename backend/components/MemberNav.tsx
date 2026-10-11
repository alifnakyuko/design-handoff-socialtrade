'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/browser';

const LINKS = [
  { href: '/home', label: 'Home' },
  { href: '/videos', label: 'Video' },
  { href: '/articles', label: 'Artikel & Watchlist' },
  { href: '/pricing', label: 'Pricing' },
];

export function MemberNav() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <nav className="bg-brand-dark text-brand-cream px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="font-extrabold">Social Trade</span>
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="text-sm font-semibold hover:text-brand-gold">
            {link.label}
          </Link>
        ))}
      </div>
      <button onClick={handleLogout} className="text-sm font-semibold hover:text-brand-gold">
        Keluar
      </button>
    </nav>
  );
}
