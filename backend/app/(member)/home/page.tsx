'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient, type CurrentUser } from '@/lib/api-client';

const TIER_LABEL: Record<CurrentUser['tier'], string> = {
  free: 'Gratis',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  lifetime: 'Lifetime',
};

export default function HomePage() {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    apiClient.getMe().then(setUser);
  }, []);

  if (!user) return <p className="text-brand-muted">Memuat...</p>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark">Halo, {user.name}</h1>
      <p className="mt-2 text-brand-muted">
        Paket Anda: <span className="font-semibold text-brand-dark">{TIER_LABEL[user.tier]}</span>
        {user.expiresAt && <> — berlaku sampai {new Date(user.expiresAt).toLocaleDateString('id-ID')}</>}
      </p>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/videos" className="block p-6 bg-white rounded-2xl shadow-sm hover:shadow-md">
          <h2 className="font-bold text-brand-dark">Video Kelas</h2>
          <p className="text-sm text-brand-muted mt-1">Tonton rekaman kelas sesuai paket Anda.</p>
        </Link>
        <Link href="/articles" className="block p-6 bg-white rounded-2xl shadow-sm hover:shadow-md">
          <h2 className="font-bold text-brand-dark">Artikel & Watchlist</h2>
          <p className="text-sm text-brand-muted mt-1">Analisis dan rekomendasi saham terbaru.</p>
        </Link>
        <Link href="/pricing" className="block p-6 bg-white rounded-2xl shadow-sm hover:shadow-md">
          <h2 className="font-bold text-brand-dark">Upgrade Paket</h2>
          <p className="text-sm text-brand-muted mt-1">Lihat paket yang tersedia.</p>
        </Link>
      </div>
    </div>
  );
}
