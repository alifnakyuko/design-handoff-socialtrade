import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({}),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}));

const getCurrentUserMock = vi.fn();
vi.mock('@/lib/current-user', () => ({
  getCurrentUser: (...args: any[]) => getCurrentUserMock(...args),
}));

const getContentByIdMock = vi.fn();
vi.mock('@/lib/content-access', () => ({
  getContentById: (...args: any[]) => getContentByIdMock(...args),
}));

const getPlaybackUrlMock = vi.fn();
vi.mock('@/lib/video-provider', () => ({
  createYoutubeProvider: () => ({ getPlaybackUrl: getPlaybackUrlMock }),
}));

import { GET } from './route';

function makeRequest(): Request {
  return new Request('http://localhost/api/videos/vid-1/play');
}

describe('GET /api/videos/[id]/play', () => {
  it('returns 404 when the content item does not exist', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    getContentByIdMock.mockResolvedValueOnce({ status: 404 });

    const response = await GET(makeRequest(), { params: { id: 'vid-1' } });
    expect(response.status).toBe(404);
  });

  it("returns 403 when the viewer's tier is insufficient", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ tier: 'free' });
    getContentByIdMock.mockResolvedValueOnce({ status: 403 });

    const response = await GET(makeRequest(), { params: { id: 'vid-1' } });
    expect(response.status).toBe(403);
  });

  it('returns 400 when the content item is not a video', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ tier: 'gold' });
    getContentByIdMock.mockResolvedValueOnce({
      status: 200,
      item: { id: 'x', type: 'article', payload: {} },
    });

    const response = await GET(makeRequest(), { params: { id: 'vid-1' } });
    expect(response.status).toBe(400);
  });

  it('returns 500 when the video has no provider_asset_id', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ tier: 'gold' });
    getContentByIdMock.mockResolvedValueOnce({
      status: 200,
      item: { id: 'vid-1', type: 'video', payload: {} },
    });

    const response = await GET(makeRequest(), { params: { id: 'vid-1' } });
    expect(response.status).toBe(500);
  });

  it('returns a playback url when access is granted', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ tier: 'gold' });
    getContentByIdMock.mockResolvedValueOnce({
      status: 200,
      item: { id: 'vid-1', type: 'video', payload: { provider_asset_id: 'asset-123' } },
    });
    getPlaybackUrlMock.mockReturnValueOnce('https://www.youtube-nocookie.com/embed/asset-123');

    const response = await GET(makeRequest(), { params: { id: 'vid-1' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ url: 'https://www.youtube-nocookie.com/embed/asset-123' });
    expect(getPlaybackUrlMock).toHaveBeenCalledWith('asset-123');
  });

  it('treats an unauthenticated viewer as free tier (relies on getContentById for the actual gate)', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    getContentByIdMock.mockResolvedValueOnce({ status: 403 });

    const response = await GET(makeRequest(), { params: { id: 'vid-1' } });
    expect(response.status).toBe(403);
    expect(getContentByIdMock).toHaveBeenCalledWith(expect.anything(), 'free', 'vid-1');
  });
});
