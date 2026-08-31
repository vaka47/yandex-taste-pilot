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
  if (!allowed && !preview) return <main className="authGate creatorGate"><span>creator / invite only</span><h1>Кабинет открывается только по приглашению</h1><p>Регистрации авторов нет. Организатор пилота создаёт персональную одноразовую ссылку и отправляет её селебрити напрямую.</p><Link href="/">Вернуться на главную</Link><Link className="previewLink" href="/creator?preview=1">Посмотреть безопасный preview</Link></main>;
  const isPreview = !allowed;
  const data = user && allowed ? await getCreatorDashboardData(user.id, user.role) : null;
  return <WorkspaceShell area="creator" preview={isPreview} profileHref={data ? `/t/${data.slug}` : "/"}><CreatorDashboardClient preview={isPreview} initialData={data} /></WorkspaceShell>;
}
