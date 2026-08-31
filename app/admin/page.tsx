import Link from "next/link";
import { AdminDashboardClient } from "@/components/AdminDashboardClient";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { getAdminDashboardData } from "@/lib/server/dashboard";
import { isAdminYandexId } from "@/lib/server/config";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Админка" };

export default async function AdminPage() {
  const user = await getSessionUser();
  const allowed = Boolean(user && user.role === "admin" && isAdminYandexId(user.yandexId));
  if (!allowed) return <main className="authGate"><span>admin / one owner</span><h1>{user ? "У этого ID нет доступа" : "Вход только для владельца"}</h1><p>{user ? "Админка закреплена за единственным Yandex ID владельца. Другие аккаунты не получают доступ, даже если у них сохранилась старая роль в базе." : "Сервер сверит Yandex ID с единственным идентификатором владельца в защищённом allowlist."}</p><Link href={user ? "/auth/logout" : "/auth/yandex/start?returnTo=/admin"}>{user ? "Сменить Yandex ID" : "Войти как владелец"}</Link></main>;
  const data = await getAdminDashboardData();
  return <WorkspaceShell area="admin" profileHref={data?.tastemakers[0] ? `/t/${data.tastemakers[0].slug}` : "/"}><AdminDashboardClient preview={false} initialData={data} /></WorkspaceShell>;
}
