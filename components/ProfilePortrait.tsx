export function ProfilePortrait({ compact = false, name, avatarUrl }: { compact?: boolean; name?: string | null; avatarUrl?: string | null }) {
  return (
    <span className={`profilePortrait ${compact ? "portraitCompact" : ""} ${avatarUrl ? "hasPortraitImage" : ""}`} role="img" aria-label={name ? `Портрет: ${name}` : "Портрет Саундмейкера"}>
      {avatarUrl ? <img className="profilePortraitImage" src={avatarUrl} alt="" /> : <><span className="portraitSun" /><span className="portraitHead" /><span className="portraitHair" /><span className="portraitBody" /><span className="portraitGlint" /></>}
    </span>
  );
}
