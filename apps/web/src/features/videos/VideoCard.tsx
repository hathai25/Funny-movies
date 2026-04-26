import { useState } from 'react';
import { buildEmbedUrl, type Video } from '@remitano/shared';
import { Play } from 'lucide-react';
import { Card } from '@/ui/Card';
import { Avatar } from '@/ui/Avatar';
import { relativeTime, youtubeThumbnail } from '@/lib/relativeTime';

export function VideoCard({ video }: { video: Video }) {
  const [playing, setPlaying] = useState(false);

  return (
    <Card interactive className="overflow-hidden">
      <div className="relative aspect-video bg-slate-100">
        {playing ? (
          <iframe
            src={`${buildEmbedUrl(video.youtubeId)}?autoplay=1`}
            title={video.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group relative block h-full w-full"
            aria-label={`Play ${video.title}`}
          >
            <img
              src={youtubeThumbnail(video.youtubeId, video.thumbnailUrl)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <span className="absolute inset-0 grid place-items-center bg-gradient-to-t from-slate-900/40 via-transparent to-transparent">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-white/95 text-brand-700 shadow-lift transition-transform duration-200 group-hover:scale-110">
                <Play className="h-6 w-6 translate-x-0.5 fill-current" strokeWidth={0} />
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="flex items-start gap-3 p-4">
        <Avatar name={video.sharedBy.name} size={36} />
        <div className="min-w-0 flex-1">
          <p
            className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900"
            title={video.title}
          >
            {video.title}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{video.sharedBy.name}</span>
            <span aria-hidden="true"> · </span>
            <time dateTime={video.createdAt}>{relativeTime(video.createdAt)}</time>
          </p>
        </div>
      </div>
    </Card>
  );
}
