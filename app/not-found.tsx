import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function NotFound() {
  return <main className="simpleState"><Brand /><span>404 / страница не найдена</span><h1>Такой страницы в Taste нет.</h1><p>Проверьте ссылку или найдите Саундмейкера на главной.</p><Link href="/">На главную</Link></main>;
}
