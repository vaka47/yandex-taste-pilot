import Link from "next/link";
import { Brand } from "@/components/Brand";
import { CoverArt } from "@/components/CoverArt";
import { Icon } from "@/components/Icons";
import { getFollowingProfiles } from "@/lib/server/repository";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Подписки" };

export default async function FollowingPage() {
  const user = await getSessionUser();
  if (!user) return <main className="followingPage"><header><Brand /><Link href="/">На главную</Link></header><section className="followingEmpty"><span className="emptyPulse"><i /><i /><i /></span><small>ваша личная лента</small><h1>Следите за вкусом,<br />а не за алгоритмом.</h1><p>Войдите через Яндекс ID, чтобы собрать здесь людей, чью музыку хотите слышать чаще.</p><Link href="/auth/yandex/start?returnTo=/following"><span>Я</span>Продолжить с Яндекс ID <Icon name="arrow" /></Link><em>Мы не запрашиваем доступ к вашей Яндекс Музыке.</em></section></main>;
  const profiles = await getFollowingProfiles(user.id);
  return <main className="followingPage"><header><Brand /><div><span>Здравствуйте, {user.displayName}</span><form action="/auth/logout" method="post"><button type="submit">Выйти</button></form></div></header><section className="followingReady"><span>ваши подписки / {String(profiles.length).padStart(2, "0")}</span><h1>Свежие обновления</h1>{profiles.length ? profiles.map(profile => <Link href={`/t/${profile.slug}`} key={profile.id}><span className="followingAvatar">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : profile.name.split(" ").map(word => word[0]).join("").slice(0, 2)}</span><div><strong>{profile.name}</strong><small>{profile.roleLine}</small></div>{profile.latestEvent?.track.coverUrl ? <CoverArt url={profile.latestEvent.track.coverUrl} title={profile.latestEvent.track.title} size="small" /> : null}<div><span>последний трек</span><strong>{profile.latestEvent?.track.title || "Пока нет новых записей"}</strong><small>{profile.latestEvent?.track.artists.join(", ") || "Вернитесь чуть позже"}</small></div><Icon name="arrow" /></Link>) : <div className="followingNoItems"><strong>Здесь пока тихо.</strong><p>Найдите автора и подпишитесь — новые треки появятся в этой ленте.</p><Link href="/">Найти автора <Icon name="arrow" /></Link></div>}</section></main>;
}
