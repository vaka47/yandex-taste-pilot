import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function NotFound() {
  return <main className="simpleState"><Brand /><span>404 / сигнал потерян</span><h1>Такого Taste пока нет.</h1><p>Проверьте ссылку или откройте пилотный профиль.</p><Link href="/t/lera-sever">Открыть пилот</Link></main>;
}

