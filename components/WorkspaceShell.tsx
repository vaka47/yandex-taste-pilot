import Link from "next/link";
import { Brand } from "@/components/Brand";
import { Icon } from "@/components/Icons";

export function WorkspaceShell({ area, profileHref = "/", children }: { area: "admin" | "creator"; profileHref?: string; children: React.ReactNode }) {
  const admin = area === "admin";
  const workspaceHref = admin ? "/admin" : "/creator";
  return (
    <div className={`workspace ${admin ? "adminWorkspace" : "creatorWorkspace"}`}>
      <aside className="workspaceRail">
        <Brand inverse />
        <span className="workspaceLabel">{admin ? "управление" : "кабинет автора"}</span>
        <nav>
          <Link className="active" href={workspaceHref}><Icon name="home" />Обзор</Link>
          <Link href={`${workspaceHref}${admin ? "#tastemakers" : "#history"}`}><Icon name={admin ? "users" : "music"} />{admin ? "Тейстмейкеры" : "История"}</Link>
          <Link href={`${workspaceHref}${admin ? "#analytics" : "#privacy"}`}><Icon name={admin ? "pulse" : "shield"} />{admin ? "Аналитика" : "Приватность"}</Link>
          <Link href={`${workspaceHref}${admin ? "#sync" : "#connection"}`}><Icon name="sync" />{admin ? "Синхронизации" : "Подключение"}</Link>
        </nav>
        <div className="railBottom"><span className="liveStatus"><i />защищённый вход</span><Link href={profileHref}><Icon name="eye" />Публичный профиль</Link><form action="/auth/logout" method="post"><button type="submit"><Icon name="user" />Выйти</button></form></div>
      </aside>
      <div className="workspaceMain">{children}</div>
    </div>
  );
}
