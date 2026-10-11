'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { PlanList } from '@/components/PlanList';
import type { Plan } from '@/lib/api-client';

export default function PricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cancelled = searchParams.get('checkout') === 'cancelled';

  function handleSelect(planCode: Plan['code']) {
    router.push(`/checkout?plan=${planCode}`);
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark">Paket Membership</h1>
      <p className="mt-2 text-brand-muted">Upgrade kapan saja untuk akses lebih banyak konten.</p>
      {cancelled && (
        <p className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg text-sm">
          Pembayaran gagal atau dibatalkan. Silakan coba lagi.
        </p>
      )}
      <div className="mt-8">
        <PlanList onSelect={handleSelect} />
      </div>
    </div>
  );
}
