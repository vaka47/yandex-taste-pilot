export function CoverArt({ tone, title, size = "regular" }: { tone: string; title: string; size?: "small" | "regular" | "large" }) {
  return (
    <span className={`coverArt cover-${tone} cover-${size}`} aria-label={`Обложка ${title}`} role="img">
      <i className="coverOrb" />
      <i className="coverLine" />
      <b>{title.slice(0, 1)}</b>
    </span>
  );
}

