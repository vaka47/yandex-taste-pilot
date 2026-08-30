import Link from "next/link";
import { Brand } from "@/components/Brand";
import { Icon } from "@/components/Icons";

export function WorkspaceShell({ area, preview, profileHref = "/t/lera-sever", children }: { area: "admin" | "creator"; preview?: boolean; profileHref?: string; children: React.ReactNode }) {
  const admin = area === "admin";
  return (
    <div className={`workspace ${admin ? "adminWorkspace" : "creatorWorkspace"}`}>
      <aside className="workspaceRail">
        <Brand inverse />
        <span className="workspaceLabel">{admin ? "operations" : "creator room"}</span>
        <nav>
          <Link className="active" href={admin ? "/admin?preview=1" : "/creator?preview=1"}><Icon name="home" />Обзор</Link>
          <Link href={admin ? "/admin/tastemakers?preview=1" : "/creator?preview=1#history"}><Icon name={admin ? "users" : "music"} />{admin ? "Тейстмейкеры" : "История"}</Link>
          <Link href={admin ? "/admin?preview=1#analytics" : "/creator?preview=1#privacy"}><Icon name={admin ? "pulse" : "shield"} />{admin ? "Аналитика" : "Приватность"}</Link>
          <Link href={admin ? "/admin?preview=1#sync" : "/creator?preview=1#connection"}><Icon name="sync" />{admin ? "Синхронизации" : "Подключение"}</Link>
          {admin ? <Link href="/admin?preview=1#settings"><Icon name="settings" />Настройки</Link> : null}
        </nav>
        <div className="railBottom"><span className={preview ? "previewStatus" : "liveStatus"}><i />{preview ? "preview mode" : "secure session"}</span><Link href={profileHref}><Icon name="eye" />Публичный профиль</Link></div>
      </aside>
      <div className="workspaceMain">{children}</div>
    </div>
  );
}
