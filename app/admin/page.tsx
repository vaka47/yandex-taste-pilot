import Link from "next/link";
import { AdminDashboardClient } from "@/components/AdminDashboardClient";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Админка" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === "1";
  const user = await getSessionUser();
  if ((!user || user.role !== "admin") && !preview) return <main className="authGate"><span>admin / protected</span><h1>Войдите как администратор пилота</h1><p>Одного Yandex ID недостаточно: сервер дополнительно проверит роль admin в базе.</p><Link href="/auth/yandex/start?returnTo=/admin">Продолжить с Яндекс ID</Link><Link className="previewLink" href="/admin?preview=1">Посмотреть безопасный preview</Link></main>;
  return <WorkspaceShell area="admin" preview={!user || user.role !== "admin"}><AdminDashboardClient preview={!user || user.role !== "admin"} /></WorkspaceShell>;
}

