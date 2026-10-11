import Link from 'next/link';

export default function CheckoutSuccessPage() {
  return (
    <div className="max-w-md p-8 bg-white rounded-2xl shadow-sm text-center">
      <h1 className="text-2xl font-extrabold text-brand-dark">Pembayaran Diterima</h1>
      <p className="mt-2 text-brand-muted">
        Terima kasih! Akses paket Anda akan aktif dalam beberapa saat setelah pembayaran terverifikasi.
      </p>
      <Link
        href="/home"
        className="inline-block mt-6 px-6 py-2 bg-brand-gold text-brand-dark font-bold rounded-full hover:bg-brand-gold-dark hover:text-white"
      >
        Ke Halaman Utama
      </Link>
    </div>
  );
}
