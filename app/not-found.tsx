import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function NotFound() {
  return <main className="simpleState"><Brand /><span>404 / сигнал потерян</span><h1>Такой страницы в Тейсте нет.</h1><p>Проверьте ссылку или вернитесь к актуальному пилоту.</p><Link href="/">На главную</Link></main>;
}
