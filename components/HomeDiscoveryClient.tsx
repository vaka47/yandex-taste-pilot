"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icons";
import { relativeTime } from "@/lib/format";
import { commentedVerb, listenedVerb } from "@/lib/tastemaker-copy";
import type { HomeTastemaker, PublicActivity } from "@/types/domain";

export function HomeDiscoveryClient({ profiles, activity }: { profiles: HomeTastemaker[]; activity: PublicActivity[] }) {
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const pointerStart = useRef<number | null>(null);
  const current = profiles[active] || null;
  const found = useMemo(() => profiles.filter(profile => `${profile.name} ${profile.roleLine}`.toLowerCase().includes(query.trim().toLowerCase())), [profiles, query]);

  useEffect(() => {
    if (paused || profiles.length < 2) return;
    const timer = window.setInterval(() => setActive(value => (value + 1) % profiles.length), 5200);
    return () => window.clearInterval(timer);
  }, [paused, profiles.length]);

  function shift(direction: number) {
    if (!profiles.length) return;
    setActive(value => (value + direction + profiles.length) % profiles.length);
  }

  function endSwipe(clientX: number) {
    if (pointerStart.current === null) return;
    const distance = clientX - pointerStart.current;
    if (Math.abs(distance) > 44) shift(distance > 0 ? -1 : 1);
    pointerStart.current = null;
  }

  return (
    <>
      <section className="landingHero">
        <div className="landingCopy">
          <span className="landingKicker"><i /> музыка людей, которым вы верите</span>
          <h1><span className="landingTitleLead">Слушай мир</span><em>чужими ушами</em></h1>
          <p>Живая музыкальная история людей, чьему вкусу вы доверяете</p>
          <div className="landingHeroActions"><a className="landingPrimary" href="#discover"><Icon name="search" />Найти Саундмейкера</a><Link className="landingSecondary" href="/about">Как это устроено <Icon name="arrow" /></Link></div>
        </div>
        <div className="landingVisual" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onPointerDown={event => { pointerStart.current = event.clientX; }} onPointerUp={event => endSwipe(event.clientX)}>
          {current ? <Link className="landingSlide" href={`/t/${current.slug}`} aria-label={`Открыть профиль ${current.name}`}>
            <div className="landingSlidePortrait">{current.avatarUrl ? <img src={current.avatarUrl} alt={current.name} draggable={false} /> : <span>{current.name.split(" ").map(word => word[0]).join("").slice(0, 2)}</span>}</div>
            <div className="landingSignalCard"><small>{current.updatedAt ? `обновлено ${relativeTime(current.updatedAt)}` : "история подключена"}</small><strong>{current.name}</strong><span>{current.latestTrack ? `${current.latestTrack.title} · ${current.latestTrack.artists.join(", ")}` : current.roleLine}</span><span className="landingSignalCover">{current.latestTrack?.coverUrl ? <img src={current.latestTrack.coverUrl} alt="" /> : <Icon name="music" />}</span></div>
          </Link> : <div className="landingSlide landingSlideEmpty"><div className="landingSlidePortrait"><Icon name="music" size={52} /></div><div className="landingSignalCard"><strong>Taste</strong><span>Скоро здесь появятся первые Саундмейкеры</span></div></div>}
          {profiles.length > 1 ? <div className="landingCarouselControls"><button type="button" onClick={() => shift(-1)} aria-label="Предыдущий Саундмейкер"><Icon name="arrow" /></button><span>{profiles.map((profile, index) => <button key={profile.id} className={index === active ? "active" : ""} type="button" onClick={() => setActive(index)} aria-label={`Показать ${profile.name}`} />)}</span><button type="button" onClick={() => shift(1)} aria-label="Следующий Саундмейкер"><Icon name="arrow" /></button></div> : null}
        </div>
      </section>

      <section className="landingManifest"><strong>Не <span className="pencilStrike">рекомендации</span>, а <span className="pencilUnderline">человеческий опыт</span></strong></section>

      <section className="landingDiscover" id="discover">
        <header><div><span>люди в Taste</span><h2>Найдите того,<br />кого хотите слышать.</h2></div><label><Icon name="search" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Имя Саундмейкера" aria-label="Поиск по Саундмейкерам" /></label></header>
        <div className="landingPeople">{found.map(profile => <Link href={`/t/${profile.slug}`} key={profile.id}><span>{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" loading="lazy" /> : profile.name.split(" ").map(word => word[0]).join("").slice(0, 2)}</span><div><strong>{profile.name}</strong><small>{profile.roleLine || "живая история музыки"}</small>{profile.latestTrack ? <em>Сейчас в истории: {profile.latestTrack.title}</em> : null}</div><Icon name="arrow" /></Link>)}{!found.length ? <div className="landingNoResults"><Icon name="search" /><strong>Такого Саундмейкера пока нет</strong><span>Проверьте имя или вернитесь к списку.</span></div> : null}</div>
      </section>

      <section className="landingActivity">
        <header><span>прямо сейчас</span><h2>Что нового в Taste</h2></header>
        <div>{activity.length ? activity.map((item, index) => <Link href={item.kind === "comment" ? `/go/track/${item.eventId}?source=home_comment&position=${index + 1}` : `/t/${item.tastemakerSlug}`} target={item.kind === "comment" ? "_blank" : undefined} rel={item.kind === "comment" ? "noreferrer" : undefined} key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><p>{item.kind === "comment" ? <><strong>{item.tastemakerName}</strong> {commentedVerb(item.tastemakerGender)} трек «{item.trackTitle}»: <em>«{item.comment}»</em></> : <><strong>{item.tastemakerName}</strong> {listenedVerb(item.tastemakerGender)} «{item.trackTitle}»</>}</p><time>{relativeTime(item.occurredAt)}</time><Icon name="arrow" /></Link>) : <p className="landingActivityEmpty">Первые обновления появятся после подключения истории Саундмейкера.</p>}</div>
      </section>
    </>
  );
}
