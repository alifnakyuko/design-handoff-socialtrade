'use client';

import { useEffect, useState } from 'react';
import { adminApiClient, type AdminMember, type MemberEdit } from '@/lib/api-client';

const TIERS = ['free', 'silver', 'gold', 'platinum', 'lifetime'];

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}

export default function AdminMembersPage() {
  const [members, setMembers] = useState<AdminMember[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTier, setEditTier] = useState('free');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [audits, setAudits] = useState<Record<string, MemberEdit[]>>({});

  async function reload() {
    setMembers(await adminApiClient.listMembers());
  }

  useEffect(() => {
    reload();
  }, []);

  function startEdit(member: AdminMember) {
    setEditingId(member.id);
    setEditTier(member.tier);
    setEditExpiresAt(member.expiresAt ? member.expiresAt.slice(0, 10) : '');
  }

  async function handleSave(id: string) {
    await adminApiClient.updateMember(id, {
      tier: editTier,
      expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
    });
    setEditingId(null);
    await reload();
  }

  async function toggleAudit(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!audits[id]) {
      const edits = await adminApiClient.getMemberAudit(id);
      setAudits((prev) => ({ ...prev, [id]: edits }));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark">Kelola Member</h1>

      <div className="mt-6 space-y-2">
        {members === null && <p className="text-brand-muted">Memuat...</p>}
        {members?.map((member) => (
          <div key={member.id} className="bg-white rounded-2xl shadow-sm">
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-bold text-brand-dark">{member.name}</p>
                <p className="text-sm text-brand-muted">{member.email}</p>
                <p className="text-sm text-brand-muted">
                  {member.tier}
                  {member.expiresAt && <> — sampai {new Date(member.expiresAt).toLocaleDateString('id-ID')}</>}
                  {' · '}
                  {formatRupiah(member.totalRevenue)}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleAudit(member.id)} className="text-sm font-semibold text-brand-muted">
                  Riwayat
                </button>
                <button onClick={() => startEdit(member)} className="text-sm font-semibold text-brand-gold-dark">
                  Edit
                </button>
              </div>
            </div>

            {editingId === member.id && (
              <div className="px-4 pb-4 flex items-center gap-2">
                <select value={editTier} onChange={(e) => setEditTier(e.target.value)} className="px-3 py-2 border border-brand-cream-dark rounded-lg">
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={editExpiresAt}
                  onChange={(e) => setEditExpiresAt(e.target.value)}
                  className="px-3 py-2 border border-brand-cream-dark rounded-lg"
                />
                <button onClick={() => handleSave(member.id)} className="px-4 py-2 bg-brand-gold text-brand-dark font-bold rounded-full text-sm">
                  Simpan
                </button>
                <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-brand-cream-dark text-brand-dark font-semibold rounded-full text-sm">
                  Batal
                </button>
              </div>
            )}

            {expandedId === member.id && (
              <div className="px-4 pb-4 border-t border-brand-cream-dark pt-3">
                {!audits[member.id] && <p className="text-sm text-brand-muted">Memuat riwayat...</p>}
                {audits[member.id]?.length === 0 && <p className="text-sm text-brand-muted">Belum ada perubahan manual.</p>}
                {audits[member.id]?.map((edit) => (
                  <p key={edit.id} className="text-sm text-brand-muted">
                    {new Date(edit.created_at).toLocaleString('id-ID')}: {edit.old_tier ?? '-'} → {edit.new_tier}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
