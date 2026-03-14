import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Людмила Ладыженко",
  description: "Сайт Людмилы Ладыженко: психолог, лекции, статьи, видео и консультации.",
};

const navItems = [
  { href: "/#about", label: "ОБО МНЕ" },
  { href: "/#news", label: "НОВОСТИ" },
  { href: "/#school", label: "ШКОЛА ОТЦОВ" },
  { href: "/#news", label: "ФОТО" },
  { href: "/#certificates", label: "ДИПЛОМЫ И СЕРТИФИКАТЫ" },
  { href: "/#media", label: "ВИДЕО И ПОДКАСТЫ" },
  { href: "/#services", label: "УСЛУГИ" },
  { href: "/#ask", label: "ЗАДАТЬ ВОПРОС" },
  { href: "/#lectures", label: "ЛЕКЦИИ В ЗАПИСИ" },
  { href: "/#articles", label: "СТАТЬИ И ПУБЛИКАЦИИ" },
  { href: "/#contacts", label: "КОНТАКТЫ" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <div className="site-shell">
          <header className="site-header t229-shell" id="site-header">
            <div className="t229">
              <div className="t229__maincontainer">
                <nav className="site-nav t229__list" aria-label="Основная навигация">
                  {navItems.map((item) => (
                    <div className="t229__list_item" key={item.href + item.label}>
                      <Link className="t-menu__link-item" href={item.href}>
                        {item.label}
                      </Link>
                    </div>
                  ))}
                </nav>
                <div className="t229__padding40px" />
              </div>
            </div>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
