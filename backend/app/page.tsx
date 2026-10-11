import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-brand-cream">
      <nav className="max-w-5xl mx-auto flex items-center justify-between px-6 py-5">
        <span className="font-extrabold text-lg text-brand-dark">Social Trade</span>
        <div className="flex gap-3">
          <Link href="/login" className="px-4 py-2 text-sm font-semibold text-brand-dark hover:text-brand-gold-dark">
            Masuk
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 text-sm font-semibold bg-brand-gold text-brand-dark rounded-full hover:bg-brand-gold-dark hover:text-white"
          >
            Daftar
          </Link>
        </div>
      </nav>

      <section className="max-w-5xl mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold text-brand-dark leading-tight">
          Rekomendasi saham, artikel, dan kelas video dari Social Trade
        </h1>
        <p className="mt-4 text-brand-muted text-lg max-w-2xl mx-auto">
          Akses watchlist harian, analisis mendalam, dan kelas rekaman sesuai paket membership Anda.
        </p>
        <Link
          href="/signup"
          className="inline-block mt-8 px-8 py-3 bg-brand-gold text-brand-dark font-bold rounded-full hover:bg-brand-gold-dark hover:text-white"
        >
          Mulai Sekarang
        </Link>
      </section>
    </main>
  );
}
