import Link from 'next/link';

export function UpgradeGate() {
  return (
    <div className="p-8 bg-white rounded-2xl shadow-sm text-center">
      <h2 className="text-xl font-bold text-brand-dark">Konten ini terkunci</h2>
      <p className="mt-2 text-brand-muted">Upgrade paket Anda untuk mengakses konten ini.</p>
      <Link
        href="/pricing"
        className="inline-block mt-6 px-6 py-2 bg-brand-gold text-brand-dark font-bold rounded-full hover:bg-brand-gold-dark hover:text-white"
      >
        Lihat Paket
      </Link>
    </div>
  );
}
