import { parseYouTubeId } from '@remitano/shared';

describe('parseYouTubeId', () => {
  const valid: Array<[string, string]> = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['  https://youtu.be/dQw4w9WgXcQ?si=abc  ', 'dQw4w9WgXcQ'],
  ];

  test.each(valid)('parses %s', (url, id) => {
    expect(parseYouTubeId(url)).toBe(id);
  });

  const invalid = [
    '',
    'not a url',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=tooshort',
    'https://www.youtube.com/watch?v=this-is-way-too-long',
    'https://vimeo.com/12345',
  ];

  test.each(invalid)('rejects %s', (url) => {
    expect(parseYouTubeId(url)).toBeNull();
  });
});
