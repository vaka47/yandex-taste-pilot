import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/Brand";
import { Icon } from "@/components/Icons";
import { hashToken } from "@/lib/server/crypto";
import { db, ensureSchema, isDatabaseConfigured } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isDatabaseConfigured()) notFound();
  await ensureSchema();
  const invite = await db()`
    select ci.id from creator_invites ci
    join tastemakers t on t.id = ci.tastemaker_id and t.owner_user_id is null and t.status in ('draft', 'invited')
    where ci.token_hash = ${hashToken(token)} and ci.used_at is null and ci.expires_at > now()
    limit 1
  `;
  if (!invite[0]) notFound();
  const href = `/auth/yandex/start?returnTo=/creator&invite=${encodeURIComponent(token)}`;
  return <main className="invitePage"><Brand /><section><span><Icon name="spark" /> личное приглашение в Taste</span><h1>Ваш музыкальный вкус уже ждут.</h1><p>Войдите через Яндекс ID, чтобы привязать кабинет автора. Подключение музыкальной истории произойдёт отдельным шагом и только после явного согласия.</p><Link href={href}><b>Я</b>Принять приглашение <Icon name="arrow" /></Link><small>Ссылка одноразовая и имеет срок действия.</small></section></main>;
}
