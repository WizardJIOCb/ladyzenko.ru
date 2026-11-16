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
  { href: "/#photos", label: "ФОТО" },
  { href: "/#certificates", label: "ДИПЛОМЫ И СЕРТИФИКАТЫ" },
  { href: "/#video", label: "ВИДЕО И ПОДКАСТЫ" },
  { href: "/#services", label: "УСЛУГИ" },
  { href: "/#questions", label: "ЗАДАТЬ ВОПРОС" },
  { href: "/#buy", label: "ЛЕКЦИИ В ЗАПИСИ" },
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
                      <a className="t-menu__link-item" href={item.href}>
                        {item.label}
                      </a>
                    </div>
                  ))}
                </nav>
                <div className="t229__padding40px" />
              </div>
            </div>
          </header>
          <main id="main-content">{children}</main>
          <footer className="commerce-footer"><Link href="/payment-info">Продавец и оплата</Link><Link href="/offer">Условия покупки</Link><Link href="/privacy">Обработка данных</Link><Link href="/consent">Согласие на обработку данных</Link><Link href="/admin">Управление</Link></footer>
        </div>
      </body>
    </html>
  );
}
