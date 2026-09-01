import { notFound, redirect } from "next/navigation";
import { ProfileClient } from "@/components/ProfileClient";
import { PublicHeader } from "@/components/PublicHeader";
import { getPublicProfile } from "@/lib/server/repository";
import { getSessionUser } from "@/lib/server/session";
import { isAdminYandexId } from "@/lib/server/config";
import { syncTastemakerFully } from "@/lib/server/sync";
import { after } from "next/server";

export const dynamic = "force-dynamic";

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
      <ProfileClient initialProfile={profile} session={session} ownerView={Boolean(session?.role === "admin" && session.authContext === "owner_password" && isAdminYandexId(session.yandexId))} />
      <footer className="publicFooter">
        <div><strong>Тейст</strong><span>Музыкальный вкус — это сигнал, а не алгоритм.</span></div>
        <nav><a href="/about">О продукте</a><a href="/privacy">Приватность</a><a href="mailto:privacy@tastepilot.app">Удаление данных</a></nav>
        <p>Независимый экспериментальный продукт. Не связан с Яндексом и не одобрен им. Переход к треку означает намерение открыть музыку, а не подтверждённое прослушивание.</p>
      </footer>
    </div>
  );
}
