export function ProfilePortrait({ compact = false, name }: { compact?: boolean; name?: string | null }) {
  return (
    <span className={`profilePortrait ${compact ? "portraitCompact" : ""}`} role="img" aria-label={name ? `Стилизованный портрет: ${name}` : "Стилизованный портрет автора"}>
      <span className="portraitSun" />
      <span className="portraitHead" />
      <span className="portraitHair" />
      <span className="portraitBody" />
      <span className="portraitGlint" />
    </span>
  );
}
