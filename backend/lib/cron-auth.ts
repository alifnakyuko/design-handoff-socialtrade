import crypto from 'crypto';

// Shared by every /api/cron/* route: validates the bearer token Vercel Cron sends against
// CRON_SECRET using a constant-time comparison. Returns null when the request is authorized,
// or the NextResponse-shaped body/status to return otherwise.
export function checkCronAuth(request: Request): { status: number; body: { error: string } } | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return { status: 500, body: { error: 'CRON_SECRET is not set' } };
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${cronSecret}`;
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(authHeader);
  const isValid = expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);

  if (!isValid) {
    return { status: 401, body: { error: 'Unauthorized' } };
  }

  return null;
}
