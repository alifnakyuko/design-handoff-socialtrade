import crypto from 'crypto';

export interface VideoProvider {
  getSignedPlaybackUrl(assetId: string, ttlSeconds?: number): string;
}

const DEFAULT_TTL_SECONDS = 10 * 60; // 10 minutes

// Bunny Stream token authentication, per the stack recommended in the original brief. The
// URL is signed with a short-lived token computed as sha256(securityKey + videoId + expires)
// -- no network call needed, the token is just a hash. IMPORTANT: this construction is
// written from Bunny's publicly documented token-auth scheme but has not been verified
// against a live Bunny Stream library (no credentials were available while building this).
// Confirm the exact string-concatenation order and URL format against
// https://docs.bunny.net/docs/stream-embed-view-token-authentication before relying on this
// in production -- provider token schemes are exact-format-sensitive and can change.
export function createBunnyStreamProvider(): VideoProvider {
  const securityKey = process.env.BUNNY_STREAM_API_KEY;
  const libraryId = process.env.BUNNY_LIBRARY_ID;

  return {
    getSignedPlaybackUrl(assetId: string, ttlSeconds: number = DEFAULT_TTL_SECONDS): string {
      if (!securityKey || !libraryId) {
        throw new Error('BUNNY_STREAM_API_KEY and BUNNY_LIBRARY_ID must be set');
      }
      const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
      const token = crypto
        .createHash('sha256')
        .update(`${securityKey}${assetId}${expires}`)
        .digest('hex');
      return `https://iframe.mediadelivery.net/embed/${libraryId}/${assetId}?token=${token}&expires=${expires}`;
    },
  };
}
