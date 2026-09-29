export interface VideoProvider {
  getPlaybackUrl(assetId: string): string;
}

// YouTube has no signed/expiring URL or per-viewer access control -- once a member has this
// URL it plays for anyone, indefinitely, regardless of membership status. This provider gates
// access the same way as any other content item (tier check happens before this is called in
// app/api/videos/[id]/play/route.ts), but that gate only stops someone from *obtaining* the
// link through the app; it cannot revoke access to a link that has already been shared
// elsewhere. Use "unlisted" videos (not indexed, but playable by anyone with the URL) and
// restrict embedding to this app's domain in the YouTube Studio video settings.
export function createYoutubeProvider(): VideoProvider {
  return {
    getPlaybackUrl(assetId: string): string {
      return `https://www.youtube-nocookie.com/embed/${assetId}`;
    },
  };
}
