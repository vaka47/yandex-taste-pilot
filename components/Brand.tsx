import Link from "next/link";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link className={`brand ${inverse ? "brandInverse" : ""}`} href="/" aria-label="Тейст — на главную">
      <span className="brandMark"><i /><i /><i /></span>
      <span>Тейст</span>
      <small>пилот</small>
    </Link>
  );
}
