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
      // TEMPORARY: notifikasi@socialtrade.id can't be used as a sender until that domain is
      // verified in Resend (it isn't yet -- the domain itself hasn't even been purchased).
      // onboarding@resend.dev is Resend's own pre-verified sender, usable for any recipient
      // without domain setup. Switch this back to the real domain once it's verified.
      const result = await resend.emails.send({
        from: 'Social Trade <onboarding@resend.dev>',
        to,
        subject,
        html,
      });
      // The Resend SDK reports a rejected send (e.g. an unverified sender domain) by
      // returning `{ error }`, not by throwing -- an unchecked result here would make every
      // send silently "succeed" from this function's caller's point of view even when Resend
      // never delivered anything.
      if (result.error) {
        throw new Error(result.error.message);
      }
    },
  };
}
