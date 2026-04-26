import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import type { Dispatcher } from 'undici';
import { YoutubeOembedClient } from './youtube-oembed.client';

describe('YoutubeOembedClient', () => {
  let mockAgent: MockAgent;
  let originalDispatcher: Dispatcher;

  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(async () => {
    await mockAgent.close();
    setGlobalDispatcher(originalDispatcher);
  });

  it('returns parsed metadata on a 200 response', async () => {
    mockAgent
      .get('https://www.youtube.com')
      .intercept({ path: /\/oembed.*/, method: 'GET' })
      .reply(
        200,
        JSON.stringify({
          title: 'Hello World',
          author_name: 'Alice',
          thumbnail_url: 'https://i.ytimg.com/vi/abc12345678/hq.jpg',
        }),
        { headers: { 'content-type': 'application/json' } },
      );

    const client = new YoutubeOembedClient();
    const meta = await client.fetch('abc12345678');

    expect(meta).toEqual({
      title: 'Hello World',
      author: 'Alice',
      thumbnailUrl: 'https://i.ytimg.com/vi/abc12345678/hq.jpg',
    });
  });

  it('falls back to a generic title on non-200', async () => {
    mockAgent
      .get('https://www.youtube.com')
      .intercept({ path: /\/oembed.*/, method: 'GET' })
      .reply(401, '');

    const client = new YoutubeOembedClient();
    const meta = await client.fetch('xyz12345678');

    expect(meta).toEqual({
      title: 'YouTube video xyz12345678',
      author: null,
      thumbnailUrl: null,
    });
  });

  it('falls back when the request errors out', async () => {
    mockAgent
      .get('https://www.youtube.com')
      .intercept({ path: /\/oembed.*/, method: 'GET' })
      .replyWithError(new Error('ECONNRESET'));

    const client = new YoutubeOembedClient();
    const meta = await client.fetch('zzz12345678');

    expect(meta).toEqual({
      title: 'YouTube video zzz12345678',
      author: null,
      thumbnailUrl: null,
    });
  });

  it('truncates very long titles defensively', async () => {
    const longTitle = 'a'.repeat(800);
    mockAgent
      .get('https://www.youtube.com')
      .intercept({ path: /\/oembed.*/, method: 'GET' })
      .reply(200, JSON.stringify({ title: longTitle, author_name: null, thumbnail_url: null }), {
        headers: { 'content-type': 'application/json' },
      });

    const client = new YoutubeOembedClient();
    const meta = await client.fetch('aaa12345678');

    expect(meta.title.length).toBeLessThanOrEqual(500);
  });

  it('handles missing optional fields gracefully', async () => {
    mockAgent
      .get('https://www.youtube.com')
      .intercept({ path: /\/oembed.*/, method: 'GET' })
      .reply(200, JSON.stringify({}), { headers: { 'content-type': 'application/json' } });

    const client = new YoutubeOembedClient();
    const meta = await client.fetch('bbb12345678');

    expect(meta).toEqual({
      title: 'YouTube video bbb12345678',
      author: null,
      thumbnailUrl: null,
    });
  });
});
