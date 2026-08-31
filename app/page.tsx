import Link from "next/link";
import { Brand } from "@/components/Brand";
import { CoverArt } from "@/components/CoverArt";
import { Icon } from "@/components/Icons";
import { ProfilePortrait } from "@/components/ProfilePortrait";
import { getFeaturedPublicProfile } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const featured = await getFeaturedPublicProfile(null);
  const liveHref = featured ? `/t/${featured.slug}` : "/about";
  const latest = featured?.events.slice(0, 3) || [];
  const signal = latest[0];
  return (
    <main className="landingPage">
      <header className="landingHeader"><Brand /><nav><Link href={liveHref}>{featured ? "Живой профиль" : "Пилот готовится"}</Link><Link href="/about">Как работает</Link><Link href="/privacy">Приватность</Link></nav><Link className="landingHeaderCta" href={liveHref}>{featured ? "Открыть Taste" : "О пилоте"} <Icon name="arrow" /></Link></header>
      <section className="landingHero">
        <div className="landingCopy"><span className="landingKicker"><i /> независимый музыкальный пилот</span><h1>Слышать мир<br /><em>чужими ушами.</em></h1><p>Реальная, добровольно опубликованная история прослушиваний людей, чьему вкусу вы доверяете.</p><div><Link className="landingPrimary" href={liveHref}><Icon name="pulse" />{featured ? "Смотреть живой Taste" : "Узнать о пилоте"}</Link><Link className="landingSecondary" href="/about">Как это устроено <Icon name="arrow" /></Link></div></div>
        <div className="landingVisual"><span className="landingEdition">pilot / 001</span><ProfilePortrait name={featured?.name} avatarUrl={featured?.avatarUrl} /><div className="landingSignalCard"><small>{signal ? "сейчас в Taste" : "контур готов"}</small><strong>{signal?.track.title || featured?.name || "Ждём первый сигнал"}</strong><span>{signal?.track.artists.join(", ") || (featured ? "История синхронизируется" : "Автор ещё не подключён")}</span><i>▂▅▃▇▆▂▅</i></div><div className="landingOrbit">вкус · вживую · с разрешения ·</div></div>
      </section>
      <section className="landingManifest"><span>не рекомендации</span><span>не новая музыкальная сеть</span><strong>человеческий сигнал</strong></section>
      <section className="landingFlow"><header><span>01—03</span><h2>Один новый трек.<br />Три честных шага.</h2></header><div className="landingSteps"><article><b>01</b><Icon name="music" /><h3>Кумир слушает</h3><p>Только после явного согласия событие попадает в защищённый контур Taste.</p></article><article><b>02</b><Icon name="pulse" /><h3>Taste показывает</h3><p>С учётом задержки, паузы и скрытых треков. Приватность управляется самим автором.</p></article><article><b>03</b><Icon name="playlist" /><h3>Фанат открывает</h3><p>Трек или один стабильный live-плейлист — уже внутри Яндекс Музыки.</p></article></div></section>
      <section className="landingTracks"><div><span>последние сигналы</span><h2>Не подборка.<br />Живой след.</h2><Link href={liveHref}>{featured ? "Вся история" : "Как это работает"} <Icon name="arrow" /></Link></div><div>{latest.length ? latest.map((event, index) => <article key={event.id}><span>0{index + 1}</span><CoverArt tone={event.track.coverTone} title={event.track.title} size="large" /><h3>{event.track.title}</h3><p>{event.track.artists.join(", ")}</p></article>) : <article className="landingEmptySignal"><span>01</span><h3>Здесь появятся реальные треки</h3><p>После согласия автора и первой синхронизации — без демонстрационных подмен.</p></article>}</div></section>
      <section className="landingBottom"><span>Следующий любимый трек<br />может слушать кто-то другой.</span><Link href={liveHref}>{featured ? "Открыть пилот" : "О пилоте"} <Icon name="arrow" /></Link></section>
      <footer className="landingFooter"><Brand inverse /><p>Независимый экспериментальный продукт. Не связан с Яндексом и не одобрен им.</p><nav><Link href="/privacy">Приватность</Link><Link href="/creator?preview=1">Кабинет автора</Link></nav></footer>
    </main>
  );
}
