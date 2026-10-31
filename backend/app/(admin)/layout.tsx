import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/current-user';
import { AdminNav } from '@/components/AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabase();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) {
    redirect('/login');
  }
  if (!currentUser.isAdmin) {
    redirect('/home');
  }

  return (
    <div className="min-h-screen bg-brand-cream">
      <AdminNav />
      <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
