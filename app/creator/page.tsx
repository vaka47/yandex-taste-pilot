import { CreatorDashboardClient } from "@/components/CreatorDashboardClient";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { PublicHeader } from "@/components/PublicHeader";
import { getCreatorDashboardData } from "@/lib/server/dashboard";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Кабинет Саундмейкера" };

export default async function CreatorPage({ searchParams }: { searchParams: Promise<{ onboarding?: string }> }) {
  const user = await getSessionUser();
  const allowed = user && ["creator", "admin"].includes(user.role);
  if (!allowed) return <main className="creatorEntryPage"><PublicHeader session={user} /><section className="authGate creatorGate"><span>кабинет по приглашению</span><h1>{user ? "Этот аккаунт не приглашён" : "Вход для Саундмейкеров"}</h1><p>{user ? "Обычный вход не создаёт профиль. Откройте персональную одноразовую ссылку владельца под нужным Яндекс ID." : "Сначала примите персональное приглашение владельца Taste. После этого вы сможете возвращаться сюда через тот же Яндекс ID."}</p>{user ? <form action="/auth/logout" method="post"><button type="submit">Выйти и сменить аккаунт</button></form> : <a href="/auth/yandex/start?returnTo=/creator">Войти</a>}</section></main>;
  const data = await getCreatorDashboardData(user.id, user.role);
  const { onboarding } = await searchParams;
  return <WorkspaceShell area="creator" profileHref={data ? `/t/${data.slug}` : "/"}><CreatorDashboardClient initialData={data} showOnboarding={onboarding === "welcome" && !data?.onboardingSeenAt} /></WorkspaceShell>;
}
