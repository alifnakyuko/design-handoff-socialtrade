import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResendEmailClient } from '@/lib/email';
import { checkCronAuth } from '@/lib/cron-auth';
import { sendExpiryReminders } from '@/lib/expiry-reminders';

async function handleCronRequest(request: Request) {
  const authError = checkCronAuth(request);
  if (authError) {
    return NextResponse.json(authError.body, { status: authError.status });
  }

  const supabase = createAdminClient();
  const emailClient = createResendEmailClient();
  const sentCount = await sendExpiryReminders(supabase, emailClient);

  return NextResponse.json({ sent_count: sentCount });
}

export { handleCronRequest as GET, handleCronRequest as POST };
