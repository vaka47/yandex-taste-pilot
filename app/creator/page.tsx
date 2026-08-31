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
  if (!allowed && !preview) return <main className="authGate creatorGate"><span>creator / invite only</span><h1>{user ? "У этого ID нет доступа автора" : "Кабинет открывается только по приглашению"}</h1><p>{user ? "Обычный вход не регистрирует селебрити. Примите персональный инвайт под нужным Yandex ID или войдите в уже приглашённый аккаунт." : "Регистрации авторов нет. Организатор пилота создаёт персональную одноразовую ссылку и отправляет её селебрити напрямую."}</p><Link href={user ? "/auth/logout" : "/auth/yandex/start?returnTo=/creator"}>{user ? "Сменить Yandex ID" : "Войти приглашённым автором"}</Link><Link className="previewLink" href="/creator?preview=1">Посмотреть безопасный preview</Link></main>;
  const isPreview = !allowed;
  const data = user && allowed ? await getCreatorDashboardData(user.id, user.role) : null;
  return <WorkspaceShell area="creator" preview={isPreview} profileHref={data ? `/t/${data.slug}` : "/"}><CreatorDashboardClient preview={isPreview} initialData={data} /></WorkspaceShell>;
}
