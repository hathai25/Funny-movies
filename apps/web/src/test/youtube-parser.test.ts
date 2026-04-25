import { describe, expect, it } from 'vitest';
import { parseYouTubeId, buildEmbedUrl } from '@remitano/shared';

describe('parseYouTubeId (shared)', () => {
  it('parses watch URLs', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses youtu.be short URLs', () => {
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('rejects non-youtube URLs', () => {
    expect(parseYouTubeId('https://vimeo.com/123')).toBeNull();
  });

  it('builds the privacy-respecting embed URL', () => {
    expect(buildEmbedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });
});
