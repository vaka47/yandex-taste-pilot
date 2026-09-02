export function CoverArt({ url, title, size = "regular" }: { url: string | null; title: string; size?: "small" | "regular" | "large" }) {
  if (!url) return null;
  return (
    <span className={`coverArt cover-${size}`} aria-hidden="true">
      <img src={url} alt="" loading="lazy" decoding="async" />
    </span>
  );
}
