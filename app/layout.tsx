import {getProducts} from '@/lib/catalogue';
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { headers } from 'next/headers';
import { config } from '@/lib/commerce';

import { noindex, productSeo, graph, jsonLd, privatePath } from '@/lib/seo';
import { SiteRuntime } from '@/components/site-runtime';

export async function generateMetadata():Promise<Metadata>{
  const h=await headers();const origin=config().origin;const pathname=h.get('x-site-path')||'/';
  const product=getProducts().find(p=>pathname==='/recordings/'+p.id);
  const seo=product?productSeo(product):{title:'Людмила Ладыженко',description:'Сайт Людмилы Ладыженко: психолог, лекции, статьи, видео и консультации.',path:pathname};
  return {metadataBase:new URL(origin),title:seo.title,description:seo.description,alternates:{canonical:origin+pathname},robots:{index:!noindex(origin,pathname,h.get('x-site-host')||''),follow:true},openGraph:{type:'website',locale:'ru_RU',url:origin+pathname,title:seo.title,description:seo.description,images:[product?.image||'/stuff/block-3.jpg']},referrer:'strict-origin-when-cross-origin'};
}

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h=await headers();const pathname=h.get('x-site-path')||'/';const origin=config().origin;
  const section:Record<string,string>={'/articles':'Статьи и публикации','/lectures':'Лекции и тематические материалы','/services':'Консультации психолога'};
  const schema=!privatePath(pathname)&&!pathname.startsWith('/recordings/')?graph({path:pathname,headline:section[pathname]||'Людмила Ладыженко',title:section[pathname]||'Людмила Ладыженко',description:'Авторские материалы и консультации психолога Людмилы Ладыженко.'},origin):null;
  return (
    <html lang="ru">
      <body>
        {schema?<script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(schema)}}/>:null}
        <link rel="stylesheet" href="/site-seo.css"/>
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
        <SiteRuntime/>
      </body>
    </html>
  );
}
