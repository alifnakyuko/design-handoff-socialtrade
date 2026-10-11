import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/current-user';
import { MemberNav } from '@/components/MemberNav';

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabase();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-brand-cream">
      <MemberNav />
      <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
