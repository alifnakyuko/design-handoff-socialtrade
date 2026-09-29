import { describe, it, expect } from 'vitest';
import { createYoutubeProvider } from './video-provider';

describe('createYoutubeProvider', () => {
  it('returns a youtube-nocookie embed url for the given video id', () => {
    const provider = createYoutubeProvider();
    const url = provider.getPlaybackUrl('dQw4w9WgXcQ');

    expect(url).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });
});
