export function ProfilePortrait({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`profilePortrait ${compact ? "portraitCompact" : ""}`} role="img" aria-label="Портрет Леры Север">
      <span className="portraitSun" />
      <span className="portraitHead" />
      <span className="portraitHair" />
      <span className="portraitBody" />
      <span className="portraitGlint" />
    </span>
  );
}

