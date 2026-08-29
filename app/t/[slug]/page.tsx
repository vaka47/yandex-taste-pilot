import { notFound } from "next/navigation";
import { ProfileClient } from "@/components/ProfileClient";
import { PublicHeader } from "@/components/PublicHeader";
import { getPublicProfile } from "@/lib/server/repository";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function TastemakerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionUser();
  const profile = await getPublicProfile(slug, session?.id || null);
  if (!profile) notFound();
  return (
    <div className="publicShell">
      <PublicHeader />
      <ProfileClient initialProfile={profile} session={session} />
      <footer className="publicFooter">
        <div><strong>Taste</strong><span>Музыкальный вкус — это сигнал, а не алгоритм.</span></div>
        <nav><a href="/about">О продукте</a><a href="/privacy">Приватность</a><a href="mailto:privacy@tastepilot.app">Удаление данных</a></nav>
        <p>Независимый экспериментальный продукт. Не связан с Яндексом и не одобрен им. Переход к треку означает намерение открыть музыку, а не подтверждённое прослушивание.</p>
      </footer>
    </div>
  );
}

