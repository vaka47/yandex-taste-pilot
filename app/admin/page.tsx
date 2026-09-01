import { AdminDashboardClient } from "@/components/AdminDashboardClient";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { getAdminDashboardData } from "@/lib/server/dashboard";
import { isAdminYandexId } from "@/lib/server/config";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Админка" };

const loginMessages: Record<string, string> = {
  failed: "Логин или пароль не подошли.",
  locked: "Слишком много попыток. Вход временно закрыт на 15 минут.",
  unavailable: "Вход владельца ещё не настроен на сервере."
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
  const user = await getSessionUser();
  const allowed = Boolean(user && user.role === "admin" && user.authContext === "owner_password" && isAdminYandexId(user.yandexId));
  if (!allowed) {
    const state = (await searchParams).login || "";
    const ownerIdentityVerified = Boolean(user && user.role === "admin" && user.authContext === "yandex" && isAdminYandexId(user.yandexId));
    return <main className="authGate adminLoginGate"><span>закрытый кабинет владельца</span><h1>Вход в управление Тейстом</h1><p>{ownerIdentityVerified ? "Яндекс ID владельца подтверждён. Остался второй шаг — отдельный пароль управления." : user ? "Этот Яндекс ID не входит в единственный список владельца. Смените аккаунт, чтобы продолжить." : "Сначала подтвердите единственный разрешённый Яндекс ID. После этого Тейст запросит отдельный пароль владельца."}</p>{loginMessages[state] ? <div className="authGateError" role="alert">{loginMessages[state]}</div> : null}{ownerIdentityVerified ? <form action="/api/admin/login" method="post"><label>Логин<input name="username" autoComplete="username" required maxLength={80} /></label><label>Пароль<input name="password" type="password" autoComplete="current-password" required maxLength={200} /></label><button type="submit">Подтвердить вход</button></form> : !user ? <a className="adminIdentityLogin" href="/auth/yandex/start?returnTo=/admin"><span>Я</span>Продолжить с Яндекс ID</a> : null}{user ? <form action="/auth/logout" method="post"><button className="authGateSecondary" type="submit">Выйти и сменить Яндекс ID</button></form> : null}</main>;
  }
  const data = await getAdminDashboardData();
  return <WorkspaceShell area="admin" profileHref={data.tastemakers[0] ? `/t/${data.tastemakers[0].slug}` : "/"}><AdminDashboardClient initialData={data} /></WorkspaceShell>;
}
