import { Resend } from 'resend';

export interface EmailClient {
  send(params: { to: string[]; subject: string; html: string }): Promise<void>;
}

// Every call site treats a failed send as best-effort (the primary action -- signup, content
// publish, expiry reminder -- must not fail just because email couldn't go out). Checking
// RESEND_API_KEY here at construction time instead of in send() would defeat that: it'd throw
// before any call site's try/catch around send() has a chance to catch it. So the check is
// deferred to send() itself.
export function createResendEmailClient(): EmailClient {
  const apiKey = process.env.RESEND_API_KEY;
  return {
    async send({ to, subject, html }) {
      if (!apiKey) {
        throw new Error('RESEND_API_KEY must be set');
      }
      const resend = new Resend(apiKey);
      await resend.emails.send({ from: 'Social Trade <notifikasi@socialtrade.id>', to, subject, html });
    },
  };
}
