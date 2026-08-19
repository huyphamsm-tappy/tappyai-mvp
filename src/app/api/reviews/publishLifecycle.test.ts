/**
 * UAT — the upload half of the publication boundary, through the REAL route.
 *
 * `ownerVisibility.test.ts` proves what the feed SERVES. This proves what
 * `POST /api/reviews` WRITES, by calling the actual exported handler with the
 * real `decidePublication`, the real evidence pipeline and the real policy
 * engine. Only the edges are faked: Supabase, auth, the music module and the
 * vision call.
 *
 * The row the route hands to `.insert()` is captured verbatim, so these are
 * assertions about what lands in the database — not about a helper's return
 * value.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, any>;

const h = vi.hoisted(() => {
  const state = { inserted: null as Row | null, user: { id: 'author-1' } as any };
  const builder = (): any => {
    const b: any = {
      select: () => b,
      eq: () => b,
      lt: () => b,
      limit: () => b,
      order: () => b,
      in: () => b,
      or: () => b,
      // Duplicate/booking lookups resolve to "nothing found".
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: (row: Row) => {
        state.inserted = row;
        return {
          select: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: 'new-review' }, error: null }),
          }),
        };
      },
    };
    return b;
  };
  return { state, client: { from: () => builder() } };
});

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }));
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }),
}));
vi.mock('@/lib/preferences/profileCache', () => ({ rebuildProfile: () => Promise.resolve() }));
vi.mock('@/modules/music/server', () => ({
  createSelection: () => ({ trackId: 't', startSec: 0, volume: 1 }),
  getTrack: () => Promise.resolve(null),
  recordUsage: () => Promise.resolve(),
  createOriginalSound: () => Promise.resolve(null),
}));
vi.mock('@/lib/security/rateLimit', () => ({
  dailyRateLimit: () => ({ ok: true }),
  clientIp: () => '127.0.0.1',
}));
// The one external call the pipeline makes. Deterministic: the frame shows food.
vi.mock('@/lib/ai/llm', () => ({
  AI: { vision: () => Promise.resolve({ text: 'TEXT: NONE\nSUBJECTS: bún chả, bàn ăn' }) },
}));

import { POST } from './route';

const post = async (body: Record<string, unknown>, qs = '') => {
  const req = {
    nextUrl: new URL('http://localhost/api/reviews' + qs),
    headers: new Headers(),
    json: () => Promise.resolve(body),
  };
  const res = await POST(req as any);
  return { status: res.status, body: await res.json(), row: h.state.inserted };
};

const base = {
  placeId: 'ChIJtest',
  placeName: 'Quán Ngon',
  placeAddress: '12 Lê Lợi',
  rating: 5,
  body: 'Quán bún chả ngon, phục vụ nhanh',
  hashtags: ['anuong'],
  content_type: 'photo',
  source_type: 'upload',
  media_url: 'https://storage.googleapis.com/tappyai-media-prod/photos/a.jpg',
  thumbnail: 'https://storage.googleapis.com/tappyai-media-prod/photos/a.jpg',
};

beforeEach(() => {
  h.state.inserted = null;
  h.state.user = { id: 'author-1' };
  // The gate is ACTIVE, as production is.
  process.env.CONTENT_SAFETY_SCHEMA_MIGRATED = 'true';
  process.env.CONTENT_SAFETY_GATE_ENABLED = 'true';
});

describe('UAT — what POST /api/reviews actually writes', () => {
  it('a benign photo is written PUBLISHED, and the author is told it is live', async () => {
    const { status, body, row } = await post(base);
    expect(status).toBe(200);
    expect(row!.publication_state).toBe('PUBLISHED');
    expect(row!.safety_state).toBeTruthy();
    expect(row!.evaluated_version).toBeTruthy();
    expect(body.moderation.state).toBe('PUBLISHED');
    expect(body.moderation.assertsViolation).toBe(false);
  });

  it('🚨 a VIDEO is written RESTRICTED — it can never be published in this build', async () => {
    const { body, row } = await post({
      ...base,
      content_type: 'video',
      media_url: 'https://storage.googleapis.com/tappyai-media-prod/videos/a.mp4',
    });
    expect(row!.publication_state).toBe('RESTRICTED');
    expect(body.moderation.state).toBe('RESTRICTED');
    // ...and the author is not accused of anything.
    expect(body.moderation.assertsViolation).toBe(false);
    expect(body.moderation.detail).toMatch(/không phải là kết luận vi phạm/);
  });

  it('🚨 a video DECLARED as a photo is still written RESTRICTED', async () => {
    const { row } = await post({
      ...base,
      content_type: 'photo',
      media_url: 'https://storage.googleapis.com/tappyai-media-prod/videos/sneaky.mp4',
      thumbnail: '',
    });
    expect(row!.publication_state).toBe('RESTRICTED');
  });

  it('harmful wording is written RESTRICTED, never PUBLISHED', async () => {
    for (const text of [
      'Tao sẽ giết mày',
      'clip sex khoả thân',
      'trẻ em khoả thân',
      'hướng dẫn tự tử',
      'Đầu tư crypto lợi nhuận cam kết 100%',
    ]) {
      h.state.inserted = null;
      const { row } = await post({ ...base, body: text });
      expect(row!.publication_state, text).toBe('RESTRICTED');
    }
  });

  it('an ordinary negative review PUBLISHES — the "nguội" regression', async () => {
    const { row, body } = await post({
      ...base,
      body: 'Quán phục vụ chậm, đồ ăn nguội, tôi không hài lòng',
    });
    expect(row!.publication_state).toBe('PUBLISHED');
    expect(body.moderation.state).toBe('PUBLISHED');
  });

  it('political and religious posts PUBLISH', async () => {
    for (const text of [
      'Tôi không đồng ý với chính sách mới của chính phủ về thuế',
      'Kết quả bầu cử đã được công bố hôm nay',
      'Bài giảng về đạo Phật rất hay',
      'So sánh giữa nhà thờ và chùa ở Việt Nam',
    ]) {
      h.state.inserted = null;
      const { row } = await post({ ...base, body: text });
      expect(row!.publication_state, text).toBe('PUBLISHED');
    }
  });

  it('🚨 a client cannot forge its own publication state', async () => {
    const { row } = await post({
      ...base,
      publication_state: 'PUBLISHED',
      safety_state: 'SAFE',
      evaluated_version: 'forged',
    } as Record<string, unknown>);
    // The route builds its own row; forged fields never reach the insert.
    expect(row!.evaluated_version).not.toBe('forged');
    expect(row!.publication_state).toBe('PUBLISHED'); // decided, not accepted
    // Prove it was DECIDED: the same forged fields on harmful text still restrict.
    h.state.inserted = null;
    const bad = await post({
      ...base,
      body: 'Tao sẽ giết mày',
      publication_state: 'PUBLISHED',
      safety_state: 'SAFE',
    } as Record<string, unknown>);
    expect(bad.row!.publication_state).toBe('RESTRICTED');
    expect(bad.row!.safety_state).not.toBe('SAFE');
  });

  it('🚨 a vision failure is written RESTRICTED, never PUBLISHED', async () => {
    vi.resetModules();
    vi.doMock('@/lib/ai/llm', () => ({
      AI: { vision: () => Promise.reject(new Error('provider down')) },
    }));
    const { POST: fresh } = await import('./route');
    h.state.inserted = null;
    const req = {
      nextUrl: new URL('http://localhost/api/reviews'),
      headers: new Headers(),
      json: () => Promise.resolve(base),
    };
    await fresh(req as any);
    expect(h.state.inserted!.publication_state).toBe('RESTRICTED');
    vi.doUnmock('@/lib/ai/llm');
    vi.resetModules();
  });

  it('the gate being OFF writes no lifecycle columns and no moderation field', async () => {
    process.env.CONTENT_SAFETY_GATE_ENABLED = '';
    const { body, row } = await post(base);
    expect(row!.publication_state).toBeUndefined();
    expect(row!.safety_state).toBeUndefined();
    expect(body.moderation).toBeUndefined();
  });

  it('English is served when asked for', async () => {
    const { body } = await post({ ...base, content_type: 'video',
      media_url: 'https://storage.googleapis.com/tappyai-media-prod/videos/a.mp4' }, '?lang=en');
    expect(body.moderation.detail).toMatch(/not a finding that you did anything wrong/);
  });
});
