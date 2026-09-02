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
          <Link href={`${workspaceHref}${admin ? "#tastemakers" : "#history"}`}><Icon name={admin ? "users" : "music"} />{admin ? "Авторы и аналитика" : "История"}</Link>
          {admin ? null : <Link href={`${workspaceHref}#privacy`}><Icon name="shield" />Приватность</Link>}
          <Link href={`${workspaceHref}${admin ? "#sync" : "#connection"}`}><Icon name="sync" />{admin ? "Система" : "Подключение"}</Link>
        </nav>
        <div className="railBottom"><span className="liveStatus"><i />защищённый вход</span><Link href={profileHref}><Icon name="eye" />Публичный профиль</Link><form action="/auth/logout" method="post"><button type="submit"><Icon name="user" />Выйти</button></form></div>
      </aside>
      <div className="workspaceMain">{children}</div>
    </div>
  );
}
