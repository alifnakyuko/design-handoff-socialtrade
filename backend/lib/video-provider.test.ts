import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { createBunnyStreamProvider } from './video-provider';

describe('createBunnyStreamProvider', () => {
  beforeEach(() => {
    process.env.BUNNY_STREAM_API_KEY = 'test-security-key';
    process.env.BUNNY_LIBRARY_ID = 'lib-123';
  });

  it('produces a URL containing the library id, asset id, an expires param, and a token', () => {
    const provider = createBunnyStreamProvider();
    const url = provider.getSignedPlaybackUrl('asset-1', 600);

    expect(url).toContain('/lib-123/asset-1');
    expect(url).toMatch(/[?&]expires=\d+/);
    expect(url).toMatch(/[?&]token=[0-9a-f]{64}/);
  });

  it('computes the token as sha256(securityKey + assetId + expires)', () => {
    const provider = createBunnyStreamProvider();
    const now = Math.floor(Date.now() / 1000);
    const url = provider.getSignedPlaybackUrl('asset-1', 600);

    const expiresMatch = url.match(/expires=(\d+)/);
    const expires = Number(expiresMatch?.[1]);
    expect(expires).toBeGreaterThanOrEqual(now + 600);
    expect(expires).toBeLessThanOrEqual(now + 601);

    const expectedToken = crypto.createHash('sha256').update(`test-security-key${'asset-1'}${expires}`).digest('hex');
    expect(url).toContain(`token=${expectedToken}`);
  });

  it('defaults the TTL to 10 minutes when not specified', () => {
    const provider = createBunnyStreamProvider();
    const now = Math.floor(Date.now() / 1000);
    const url = provider.getSignedPlaybackUrl('asset-1');

    const expires = Number(url.match(/expires=(\d+)/)?.[1]);
    expect(expires).toBeGreaterThanOrEqual(now + 600);
    expect(expires).toBeLessThanOrEqual(now + 601);
  });

  it('throws when BUNNY_STREAM_API_KEY is not set', () => {
    delete process.env.BUNNY_STREAM_API_KEY;
    const provider = createBunnyStreamProvider();
    expect(() => provider.getSignedPlaybackUrl('asset-1')).toThrow(
      'BUNNY_STREAM_API_KEY and BUNNY_LIBRARY_ID must be set'
    );
  });

  it('throws when BUNNY_LIBRARY_ID is not set', () => {
    delete process.env.BUNNY_LIBRARY_ID;
    const provider = createBunnyStreamProvider();
    expect(() => provider.getSignedPlaybackUrl('asset-1')).toThrow(
      'BUNNY_STREAM_API_KEY and BUNNY_LIBRARY_ID must be set'
    );
  });
});
