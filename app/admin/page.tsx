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
    return <main className="authGate adminLoginGate"><span>закрытый кабинет владельца</span><h1>Вход в управление Taste</h1><p>Админка отделена от обычного входа через Яндекс ID. Автор и фанат не смогут попасть сюда по случайной ссылке.</p>{loginMessages[state] ? <div className="authGateError" role="alert">{loginMessages[state]}</div> : null}<form action="/api/admin/login" method="post"><label>Логин<input name="username" autoComplete="username" required maxLength={80} /></label><label>Пароль<input name="password" type="password" autoComplete="current-password" required maxLength={200} /></label><button type="submit">Войти в админку</button></form>{user ? <form action="/auth/logout" method="post"><button className="authGateSecondary" type="submit">Выйти из текущего аккаунта</button></form> : null}</main>;
  }
  const data = await getAdminDashboardData();
  return <WorkspaceShell area="admin" profileHref={data.tastemakers[0] ? `/t/${data.tastemakers[0].slug}` : "/"}><AdminDashboardClient initialData={data} /></WorkspaceShell>;
}
