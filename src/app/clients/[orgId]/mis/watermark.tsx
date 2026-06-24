// watermark.tsx — the persistent on-screen SAMPLE watermark. Reads the SINGLE flag in
// src/lib/watermark.ts; renders nothing when disabled. Tiled diagonally so it is unmissable but
// non-blocking (pointer-events: none). The PDF carries the same watermark from the same flag.
import { WATERMARK_ENABLED, WATERMARK_TEXT } from '@/lib/watermark';

export function Watermark() {
  if (!WATERMARK_ENABLED) return null;
  const tile = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='460' height='300'>` +
      `<text x='10' y='160' transform='rotate(-28 230 150)' font-family='Inter, system-ui, sans-serif' ` +
      `font-size='20' font-weight='700' fill='rgba(11,31,77,0.11)'>${WATERMARK_TEXT}</text></svg>`
  );
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40"
      style={{ backgroundImage: `url("data:image/svg+xml,${tile}")`, backgroundRepeat: 'repeat' }}
    />
  );
}

/** Solid status ribbon — the readable statement of the same UNVERIFIED truth. */
export function StatusRibbon() {
  if (!WATERMARK_ENABLED) return null;
  return (
    <div className="bg-accent/10 border-accent/30 text-accent flex items-center justify-center gap-2 border-b px-4 py-1.5 text-center text-xs font-semibold tracking-wide">
      <span className="bg-accent inline-block h-1.5 w-1.5 rounded-full" />
      {WATERMARK_TEXT}
    </div>
  );
}
