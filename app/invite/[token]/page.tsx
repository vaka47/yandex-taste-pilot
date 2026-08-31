import Link from "next/link";
import { Brand } from "@/components/Brand";
import { Icon } from "@/components/Icons";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const href = `/auth/yandex/start?returnTo=/creator&invite=${encodeURIComponent(token)}`;
  return <main className="invitePage"><Brand /><section><span><Icon name="spark" /> приглашение в пилот</span><h1>Ваш музыкальный вкус уже ждут.</h1><p>Войдите через Яндекс ID, чтобы привязать кабинет автора. Подключение музыкальной истории произойдёт отдельным шагом и только после явного согласия.</p><Link href={href}><b>Я</b>Принять приглашение <Icon name="arrow" /></Link><small>Ссылка одноразовая и имеет срок действия.</small></section></main>;
}
