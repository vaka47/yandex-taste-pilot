"use client";

import Link from "next/link";
import { Brand } from "@/components/Brand";
import { Icon } from "@/components/Icons";

export function PublicHeader() {
  return (
    <header className="publicHeader">
      <Brand />
      <nav aria-label="Основная навигация">
        <Link href="/following">Подписки</Link>
        <Link href="/about">Как это работает</Link>
      </nav>
      <Link className="headerLogin" href="/auth/yandex/start?returnTo=/following">
        <Icon name="user" size={17} /> Войти
      </Link>
    </header>
  );
}

