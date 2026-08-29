import Link from "next/link";
import { Brand } from "@/components/Brand";

export const metadata = { title: "Приватность" };

export default function PrivacyPage() {
  return <main className="textPage"><header><Brand /><Link href="/">На главную</Link></header><article><span>privacy / версия 1.0</span><h1>Приватность встроена в сам продукт.</h1><p className="lead">Taste публикует историю только после явного согласия владельца аккаунта и хранит музыкальные токены только на сервере в зашифрованном виде.</p><h2>Что видят фанаты</h2><p>Только разрешённые события, для которых наступило время публикации. Скрытые треки и исполнители исключаются и из профиля, и из live-плейлиста.</p><h2>Что мы измеряем</h2><p>Просмотры профиля, завершённые подписки, открытия треков и плейлистов, а также возвраты D1/D7/D14. Мы не используем fingerprinting и не называем переходы стримами.</p><h2>Удаление и отключение</h2><p>Автор может немедленно поставить публикацию на паузу, отключить Яндекс Музыку и запросить удаление данных. Напишите на <a href="mailto:privacy@tastepilot.app">privacy@tastepilot.app</a>.</p></article></main>;
}

