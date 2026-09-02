import Link from "next/link";
import { after } from "next/server";
import { Brand } from "@/components/Brand";
import { HomeDiscoveryClient } from "@/components/HomeDiscoveryClient";
import { Icon } from "@/components/Icons";
import { getFeaturedPublicProfile, getHomeDiscoveryData } from "@/lib/server/repository";
import { syncTastemakerFully } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [featured, discovery] = await Promise.all([getFeaturedPublicProfile(null), getHomeDiscoveryData()]);
  if (featured && !featured.fixture && featured.status === "active" && featured.publishEnabled) {
    const tastemakerId = featured.id;
    after(() => syncTastemakerFully(tastemakerId).catch(() => undefined));
  }
  return (
    <main className="landingPage">
      <header className="landingHeader"><Brand /><nav><a href="#discover">Саундмейкеры</a><Link href="/about">Как работает</Link><Link href="/privacy">Приватность</Link></nav><a className="landingHeaderCta" href="#discover">Найти Саундмейкера <Icon name="arrow" /></a></header>
      <HomeDiscoveryClient profiles={discovery.profiles} activity={discovery.activity} />
      <section className="landingFlow"><header><span>01—03</span><h2>Один новый трек.<br />Три простых шага.</h2></header><div className="landingSteps"><article><b>01</b><Icon name="music" /><h3>Кумир слушает</h3><p>Саундмейкер сам подключает свою историю и решает, что публиковать.</p></article><article><b>02</b><Icon name="pulse" /><h3>Taste обновляет</h3><p>Новый трек появляется на странице и в постоянном плейлисте.</p></article><article><b>03</b><Icon name="send" /><h3>Фанат узнаёт</h3><p>Открывает музыку в Яндекс Музыке или получает обновление в Telegram.</p></article></div></section>
      <section className="landingBottom"><span>Ваша новая любимая песня уже играет у вашего Саундмейкера</span><a href="#discover">Найти Саундмейкера <Icon name="arrow" /></a></section>
      <footer className="landingFooter"><Brand inverse /><p>Независимый продукт. Не связан с Яндексом и не одобрен им.</p><nav><Link href="/privacy">Приватность</Link><Link href="/creator">Кабинет Саундмейкера</Link><a href="mailto:camp@navumi.com">camp@navumi.com</a></nav></footer>
    </main>
  );
}
