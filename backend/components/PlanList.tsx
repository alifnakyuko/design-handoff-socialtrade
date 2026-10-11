'use client';

import { useEffect, useState } from 'react';
import { apiClient, type Plan } from '@/lib/api-client';

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    amount
  );
}

export function PlanList({ onSelect }: { onSelect: (planCode: Plan['code']) => void }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);

  useEffect(() => {
    apiClient.getPlans().then(setPlans);
  }, []);

  if (!plans) return <p className="text-brand-muted">Memuat paket...</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {plans.map((plan) => (
        <div key={plan.code} className="p-6 bg-white rounded-2xl shadow-sm flex flex-col">
          <h3 className="font-bold text-brand-dark text-lg">{plan.name}</h3>
          <p className="mt-2 text-2xl font-extrabold text-brand-dark">{formatRupiah(plan.price)}</p>
          <p className="text-sm text-brand-muted mt-1">
            {plan.durationDays ? `${plan.durationDays} hari` : 'Tanpa batas waktu'}
          </p>
          <button
            onClick={() => onSelect(plan.code)}
            className="mt-6 py-2 bg-brand-gold text-brand-dark font-bold rounded-full hover:bg-brand-gold-dark hover:text-white"
          >
            Pilih {plan.name}
          </button>
        </div>
      ))}
    </div>
  );
}
