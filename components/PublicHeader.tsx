"use client";

import Link from "next/link";
import { Brand } from "@/components/Brand";
import { Icon } from "@/components/Icons";
import type { SessionUser } from "@/types/domain";

export function PublicHeader({ session }: { session: SessionUser | null }) {
  return (
    <header className="publicHeader">
      <Brand />
      <nav aria-label="Основная навигация">
        <Link href="/following">Мои подписки</Link>
        <Link href="/about">Как это работает</Link>
      </nav>
      {session ? <form action="/auth/logout" method="post"><button className="headerLogin" type="submit"><Icon name="user" size={17} /> Выйти</button></form> : <Link className="headerLogin" href="/auth/yandex/start?returnTo=/"><Icon name="user" size={17} /> Войти</Link>}
    </header>
  );
}
