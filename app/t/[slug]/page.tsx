import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProfileClient } from "@/components/ProfileClient";
import { PublicHeader } from "@/components/PublicHeader";
import { getPublicProfile } from "@/lib/server/repository";
import { getSessionUser } from "@/lib/server/session";
import { syncTastemakerFully } from "@/lib/server/sync";
import { after } from "next/server";
import { appUrl } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const requestedSlug = slug === "pilot-author" ? "safonov-ivan" : slug;
  const profile = await getPublicProfile(requestedSlug, null);
  if (!profile) notFound();
  const description = `${profile.roleLine}. Реальная история прослушиваний за 30 дней, повторы и живой плейлист в Taste.`;
  const canonical = `${appUrl()}/t/${profile.slug}`;
  return {
    title: `${profile.name} — история прослушиваний`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `Что слушает ${profile.name}`,
      description,
      url: canonical,
      type: "profile",
      locale: "ru_RU",
      siteName: "Taste"
    },
    twitter: { card: "summary_large_image", title: `Что слушает ${profile.name}`, description }
  };
}

export default async function TastemakerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionUser();
  let profile = await getPublicProfile(slug, session?.id || null);
  if (!profile && slug === "pilot-author") {
    const renamedProfile = await getPublicProfile("safonov-ivan", session?.id || null);
    if (renamedProfile) redirect("/t/safonov-ivan");
  }
  if (!profile) notFound();
  if (!profile.fixture && profile.status === "active" && profile.publishEnabled) {
    const tastemakerId = profile.id;
    after(() => syncTastemakerFully(tastemakerId).catch(() => undefined));
  }
  return (
    <div className="publicShell">
      <PublicHeader session={session} />
      <ProfileClient initialProfile={profile} session={session} />
      <footer className="publicFooter">
        <div><strong>Taste</strong><span>Музыкальный вкус — это сигнал, а не алгоритм.</span></div>
        <nav><a href="/about">О продукте</a><a href="/privacy">Приватность</a><a href="mailto:camp@navumi.com">camp@navumi.com</a></nav>
        <p>Независимый продукт. Не связан с Яндексом и не одобрен им.</p>
      </footer>
    </div>
  );
}
