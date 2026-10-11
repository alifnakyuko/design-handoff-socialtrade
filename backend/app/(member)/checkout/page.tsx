'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient, type Plan } from '@/lib/api-client';

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    amount
  );
}

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const planCode = searchParams.get('plan') as Plan['code'] | null;

  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoResult, setPromoResult] = useState<{ discountPct: number; finalPrice: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.getPlans().then(setPlans);
  }, []);

  if (!plans) return <p className="text-brand-muted">Memuat...</p>;

  const plan = plans.find((p) => p.code === planCode);
  if (!plan) {
    return (
      <div className="p-8 bg-white rounded-2xl shadow-sm text-center">
        <h1 className="text-xl font-bold text-brand-dark">Paket tidak ditemukan</h1>
        <p className="mt-2 text-brand-muted">Silakan pilih paket kembali dari halaman Pricing.</p>
      </div>
    );
  }

  const selectedPlan = plan;
  const finalPrice = promoResult?.finalPrice ?? selectedPlan.price;

  async function handleApplyPromo() {
    setPromoError(null);
    setPromoResult(null);
    if (!promoCode.trim()) return;
    const result = await apiClient.validatePromo(promoCode.trim(), selectedPlan.code);
    if (result.valid) {
      setPromoResult({ discountPct: result.discountPct, finalPrice: result.finalPrice });
    } else {
      setPromoError('Kode promo tidak valid untuk paket ini');
    }
  }

  async function handlePay() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await apiClient.checkout(selectedPlan.code, promoCode.trim() || undefined);
      if (result.status === 'invalid_promo') {
        setSubmitError('Kode promo tidak valid');
        setSubmitting(false);
        return;
      }
      window.location.href = result.redirectUrl;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Checkout gagal, silakan coba lagi');
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-extrabold text-brand-dark">Checkout — {plan.name}</h1>

      <div className="mt-6 p-6 bg-white rounded-2xl shadow-sm">
        <div className="flex justify-between">
          <span className="text-brand-muted">Harga paket</span>
          <span className="font-semibold text-brand-dark">{formatRupiah(plan.price)}</span>
        </div>
        {promoResult && (
          <div className="flex justify-between mt-2 text-brand-gold-dark">
            <span>Diskon ({promoResult.discountPct}%)</span>
            <span>-{formatRupiah(plan.price - promoResult.finalPrice)}</span>
          </div>
        )}
        <div className="flex justify-between mt-4 pt-4 border-t border-brand-cream-dark">
          <span className="font-bold text-brand-dark">Total</span>
          <span className="font-extrabold text-brand-dark text-lg">{formatRupiah(finalPrice)}</span>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-semibold text-brand-dark mb-1">Kode Promo (opsional)</label>
        <div className="flex gap-2">
          <input
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            className="flex-1 px-4 py-2 border border-brand-cream-dark rounded-lg"
          />
          <button
            type="button"
            onClick={handleApplyPromo}
            className="px-4 py-2 bg-brand-cream-dark text-brand-dark font-semibold rounded-lg"
          >
            Terapkan
          </button>
        </div>
        {promoError && <p className="mt-2 text-sm text-red-600">{promoError}</p>}
      </div>

      {submitError && <p className="mt-4 text-sm text-red-600">{submitError}</p>}

      <button
        onClick={handlePay}
        disabled={submitting}
        className="mt-6 w-full py-3 bg-brand-gold text-brand-dark font-bold rounded-full disabled:opacity-50"
      >
        {submitting ? 'Memproses...' : 'Bayar Sekarang'}
      </button>
    </div>
  );
}
