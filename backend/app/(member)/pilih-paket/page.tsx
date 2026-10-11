'use client';

import { useRouter } from 'next/navigation';
import { PlanList } from '@/components/PlanList';
import type { Plan } from '@/lib/api-client';

export default function PilihPaketPage() {
  const router = useRouter();

  function handleSelect(planCode: Plan['code']) {
    router.push(`/checkout?plan=${planCode}`);
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark">Pilih Paket Anda</h1>
      <p className="mt-2 text-brand-muted">Pilih paket membership yang sesuai untuk mulai akses konten.</p>
      <div className="mt-8">
        <PlanList onSelect={handleSelect} />
      </div>
    </div>
  );
}
