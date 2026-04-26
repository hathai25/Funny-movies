import clsx from 'clsx';

interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
}

const palette = [
  ['#6366f1', '#a855f7'],
  ['#ec4899', '#f97316'],
  ['#0ea5e9', '#6366f1'],
  ['#10b981', '#06b6d4'],
  ['#f59e0b', '#ef4444'],
  ['#8b5cf6', '#ec4899'],
  ['#14b8a6', '#3b82f6'],
];

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function Avatar({ name, size = 32, className }: AvatarProps) {
  const [a, b] = palette[hashStr(name) % palette.length]!;
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'inline-grid flex-none place-items-center rounded-full font-semibold text-white shadow-soft',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        backgroundImage: `linear-gradient(135deg, ${a}, ${b})`,
      }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
