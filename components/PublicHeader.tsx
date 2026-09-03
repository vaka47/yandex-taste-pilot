"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";
import { Icon } from "@/components/Icons";
import type { SessionUser } from "@/types/domain";

export function PublicHeader({ session, landing = false }: { session: SessionUser | null; landing?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const canOpenCreatorCabinet = session?.role === "creator" || session?.role === "admin";

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={landing ? "landingHeader" : "publicHeader"}>
      <Brand />
      <nav className="desktopHeaderNav" aria-label="Основная навигация">
        {landing ? <a href="#discover">Саундмейкеры</a> : session ? <Link href="/following">Мои подписки</Link> : <Link href="/#discover">Саундмейкеры</Link>}
        <Link href="/about">Как это работает</Link>
        <Link href="/privacy">Приватность</Link>
      </nav>
      <div className={`headerActions ${landing ? "landingHeaderActions" : ""}`}>
        {canOpenCreatorCabinet ? <Link className="creatorHeaderLink" href="/creator"><Icon name="music" size={16} />Кабинет Саундмейкера</Link> : null}
        {landing ? session ? <Link className="headerAccountLink" href="/following"><Icon name="user" size={16} />Мои подписки</Link> : <Link className="headerAccountLink" href="/auth/yandex/start?returnTo=/"><Icon name="user" size={16} />Войти</Link> : session ? <form action="/auth/logout" method="post"><button className="headerLogin" type="submit"><Icon name="user" size={17} /> Выйти</button></form> : <Link className="headerLogin" href="/auth/yandex/start?returnTo=/"><Icon name="user" size={17} /> Войти</Link>}
        {landing ? <a className="landingHeaderCta" href="#discover">Найти Саундмейкера <Icon name="arrow" /></a> : null}
      </div>
      <button className="mobileMenuButton" type="button" aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><span /><span /><span /></button>
      {menuOpen ? <><button className="mobileMenuBackdrop" type="button" aria-label="Закрыть меню" onClick={closeMenu} /><aside className="mobileMenuPanel" role="dialog" aria-modal="true" aria-label="Навигация"><div><span>Навигация</span><button type="button" onClick={closeMenu} aria-label="Закрыть"><Icon name="x" /></button></div><nav>{landing ? <a href="#discover" onClick={closeMenu}>Саундмейкеры</a> : <Link href="/" onClick={closeMenu}>Главная</Link>}{session ? <Link href="/following" onClick={closeMenu}>Мои подписки</Link> : null}{canOpenCreatorCabinet ? <Link href="/creator" onClick={closeMenu}>Кабинет Саундмейкера</Link> : null}<Link href="/about" onClick={closeMenu}>Как это работает</Link><Link href="/privacy" onClick={closeMenu}>Приватность</Link></nav><div className="mobileMenuAccount">{session ? <form action="/auth/logout" method="post"><button type="submit"><Icon name="user" />Выйти</button></form> : <Link href="/auth/yandex/start?returnTo=/" onClick={closeMenu}><Icon name="user" />Войти через Яндекс ID</Link>}</div></aside></> : null}
    </header>
  );
}
