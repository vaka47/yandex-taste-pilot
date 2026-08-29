import Link from "next/link";
import { Brand } from "@/components/Brand";
import { CoverArt } from "@/components/CoverArt";
import { Icon } from "@/components/Icons";
import { ProfilePortrait } from "@/components/ProfilePortrait";
import { fixtureProfile } from "@/lib/fixtures";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Подписки" };

export default async function FollowingPage() {
  const user = await getSessionUser();
  if (!user) return <main className="followingPage"><header><Brand /><Link href="/">На главную</Link></header><section className="followingEmpty"><span className="emptyPulse"><i /><i /><i /></span><small>ваша личная лента</small><h1>Следите за вкусом,<br />а не за алгоритмом.</h1><p>Войдите через Яндекс ID, чтобы собрать здесь людей, чью музыку хотите слышать чаще.</p><Link href="/auth/yandex/start?returnTo=/following"><span>Я</span>Продолжить с Яндекс ID <Icon name="arrow" /></Link><em>Мы не запрашиваем доступ к вашей Яндекс Музыке.</em></section><aside className="followingPreview"><span>пример подписки</span><div><ProfilePortrait compact /><strong>{fixtureProfile.name}</strong><small>{fixtureProfile.events[0].track.title} · 7 мин назад</small></div></aside></main>;
  return <main className="followingPage"><header><Brand /><span>Здравствуйте, {user.displayName}</span></header><section className="followingReady"><span>ваши подписки / 01</span><h1>Свежие сигналы</h1><Link href={`/t/${fixtureProfile.slug}`}><ProfilePortrait compact /><div><strong>{fixtureProfile.name}</strong><small>{fixtureProfile.roleLine}</small></div><CoverArt tone={fixtureProfile.events[0].track.coverTone} title={fixtureProfile.events[0].track.title} size="small" /><div><span>последний трек</span><strong>{fixtureProfile.events[0].track.title}</strong><small>{fixtureProfile.events[0].track.artists.join(", ")}</small></div><Icon name="arrow" /></Link></section></main>;
}

