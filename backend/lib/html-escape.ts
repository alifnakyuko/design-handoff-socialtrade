// Escapes user-supplied text before interpolating it into an HTML email. Without this, a
// user-controlled field like `name` (set at signup, never validated for HTML content) lets
// anyone send arbitrary HTML -- including phishing links -- through this platform's verified
// sending domain to any inbox, since signup uses email_confirm: true with no verification
// step that would otherwise require the attacker to own the target address.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
