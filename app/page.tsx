import Link from "next/link";
import { after } from "next/server";
import { Brand } from "@/components/Brand";
import { HomeDiscoveryClient } from "@/components/HomeDiscoveryClient";
import { Icon } from "@/components/Icons";
import { PublicHeader } from "@/components/PublicHeader";
import { getFeaturedPublicProfile, getHomeDiscoveryData } from "@/lib/server/repository";
import { getSessionUser } from "@/lib/server/session";
import { syncTastemakerFully } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [featured, discovery, session] = await Promise.all([getFeaturedPublicProfile(null), getHomeDiscoveryData(), getSessionUser()]);
  if (featured && !featured.fixture && featured.status === "active" && featured.publishEnabled) {
    const tastemakerId = featured.id;
    after(() => syncTastemakerFully(tastemakerId).catch(() => undefined));
  }
  return (
    <main className="landingPage">
      <PublicHeader session={session} landing />
      <HomeDiscoveryClient profiles={discovery.profiles} activity={discovery.activity} />
      <section className="landingFlow"><header><h2><span>Один</span> новый трек.<br /><span>Три</span> простых шага.</h2></header><div className="landingSteps"><article><b>01</b><Icon name="music" /><h3>Кумир слушает</h3><p>Саундмейкер сам подключает свою историю и решает, что публиковать.</p></article><article><b>02</b><Icon name="pulse" /><h3>Taste обновляет</h3><p>Новый трек появляется на странице и в постоянном плейлисте.</p></article><article><b>03</b><Icon name="send" /><h3>Фанат узнаёт</h3><p>Открывает музыку в Яндекс Музыке или получает обновление в Telegram.</p></article></div></section>
      <section className="landingBottom"><span className="landingBottomCopy"><span className="landingBottomLine">Новая любимая песня</span>{" "}<span className="landingBottomLine">уже играет у вашего</span>{" "}<span className="landingBottomLine">Саундмейкера</span></span><a href="#discover">Найти Саундмейкера <Icon name="arrow" /></a></section>
      <footer className="landingFooter"><Brand inverse /><p>Независимый продукт. Не связан с Яндексом и не одобрен им.</p><nav><Link href="/privacy">Приватность</Link><Link href="/creator">Кабинет Саундмейкера</Link><a href="mailto:camp@navumi.com">camp@navumi.com</a></nav></footer>
    </main>
  );
}
