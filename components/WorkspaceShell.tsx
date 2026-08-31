import Link from "next/link";
import { Brand } from "@/components/Brand";
import { Icon } from "@/components/Icons";

export function WorkspaceShell({ area, preview, profileHref = "/", children }: { area: "admin" | "creator"; preview?: boolean; profileHref?: string; children: React.ReactNode }) {
  const admin = area === "admin";
  const workspaceHref = admin ? "/admin" : preview ? "/creator?preview=1" : "/creator";
  return (
    <div className={`workspace ${admin ? "adminWorkspace" : "creatorWorkspace"}`}>
      <aside className="workspaceRail">
        <Brand inverse />
        <span className="workspaceLabel">{admin ? "operations" : "creator room"}</span>
        <nav>
          <Link className="active" href={workspaceHref}><Icon name="home" />Обзор</Link>
          <Link href={`${workspaceHref}${admin ? "#tastemakers" : "#history"}`}><Icon name={admin ? "users" : "music"} />{admin ? "Тейстмейкеры" : "История"}</Link>
          <Link href={`${workspaceHref}${admin ? "#analytics" : "#privacy"}`}><Icon name={admin ? "pulse" : "shield"} />{admin ? "Аналитика" : "Приватность"}</Link>
          <Link href={`${workspaceHref}${admin ? "#sync" : "#connection"}`}><Icon name="sync" />{admin ? "Синхронизации" : "Подключение"}</Link>
          {admin ? <Link href="/admin#settings"><Icon name="settings" />Настройки</Link> : null}
        </nav>
        <div className="railBottom"><span className={preview ? "previewStatus" : "liveStatus"}><i />{preview ? "preview mode" : "secure session"}</span><Link href={profileHref}><Icon name="eye" />Публичный профиль</Link></div>
      </aside>
      <div className="workspaceMain">{children}</div>
    </div>
  );
}
