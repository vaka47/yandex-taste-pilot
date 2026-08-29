import Link from "next/link";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link className={`brand ${inverse ? "brandInverse" : ""}`} href="/" aria-label="Taste — на главную">
      <span className="brandMark"><i /><i /><i /></span>
      <span>Taste</span>
      <small>пилот</small>
    </Link>
  );
}

