/**
 * Extracts a YouTube video id from any of the common URL shapes.
 * Returns null if the URL is not a recognized YouTube video URL.
 *
 * Supported:
 *  - https://www.youtube.com/watch?v=ID
 *  - https://youtube.com/watch?v=ID&t=10s
 *  - https://m.youtube.com/watch?v=ID
 *  - https://music.youtube.com/watch?v=ID
 *  - https://youtu.be/ID
 *  - https://www.youtube.com/shorts/ID
 *  - https://www.youtube.com/embed/ID
 *  - https://www.youtube.com/live/ID
 *  - https://www.youtube-nocookie.com/embed/ID
 */
export function parseYouTubeId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const allowedHosts = new Set([
    'youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be',
    'youtube-nocookie.com',
  ]);
  if (!allowedHosts.has(host)) return null;

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return isValidId(id) ? id : null;
  }

  if (url.pathname === '/watch') {
    const v = url.searchParams.get('v');
    return v && isValidId(v) ? v : null;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const [prefix, id] = segments;
    if (['shorts', 'embed', 'live', 'v'].includes(prefix ?? '') && id && isValidId(id)) {
      return id;
    }
  }

  return null;
}

function isValidId(id: string | undefined): id is string {
  return !!id && /^[A-Za-z0-9_-]{11}$/.test(id);
}

export function buildEmbedUrl(youtubeId: string): string {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}`;
}

export function buildWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}
