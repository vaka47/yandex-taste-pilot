import Link from "next/link";
import { CreatorDashboardClient } from "@/components/CreatorDashboardClient";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { getCreatorDashboardData } from "@/lib/server/dashboard";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Кабинет автора" };

export default async function CreatorPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === "1";
  const user = await getSessionUser();
  const allowed = user && ["creator", "admin"].includes(user.role);
  if (!allowed && !preview) return <main className="authGate creatorGate"><span>creator / private</span><h1>Ваш музыкальный вкус — под вашим контролем</h1><p>Войдите через Yandex ID, привязанный к приглашению. Подключение Яндекс Музыки выполняется отдельно.</p><Link href="/auth/yandex/start?returnTo=/creator">Продолжить с Яндекс ID</Link><Link className="previewLink" href="/creator?preview=1">Посмотреть кабинет в preview</Link></main>;
  const isPreview = !allowed;
  const data = user && allowed ? await getCreatorDashboardData(user.id, user.role) : null;
  return <WorkspaceShell area="creator" preview={isPreview} profileHref={data ? `/t/${data.slug}` : "/"}><CreatorDashboardClient preview={isPreview} initialData={data} /></WorkspaceShell>;
}
