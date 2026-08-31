import { CreatorDashboardClient } from "@/components/CreatorDashboardClient";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { getCreatorDashboardData } from "@/lib/server/dashboard";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Кабинет автора" };

export default async function CreatorPage() {
  const user = await getSessionUser();
  const allowed = user && ["creator", "admin"].includes(user.role);
  if (!allowed) return <main className="authGate creatorGate"><span>кабинет по приглашению</span><h1>{user ? "Этот аккаунт не приглашён" : "Вход для тейстмейкеров"}</h1><p>{user ? "Обычный вход не создаёт профиль. Откройте персональную одноразовую ссылку владельца под нужным Яндекс ID." : "Сначала примите персональное приглашение владельца Taste. После этого вы сможете возвращаться сюда через тот же Яндекс ID."}</p>{user ? <form action="/auth/logout" method="post"><button type="submit">Выйти и сменить аккаунт</button></form> : <a href="/auth/yandex/start?returnTo=/creator">Войти приглашённым автором</a>}</main>;
  const data = await getCreatorDashboardData(user.id, user.role);
  return <WorkspaceShell area="creator" profileHref={data ? `/t/${data.slug}` : "/"}><CreatorDashboardClient initialData={data} /></WorkspaceShell>;
}
