# ladyzenko.ru migration workspace

Проект состоит из двух частей:

1. Экспорт текущего сайта с Tilda
2. Новый сайт на `Next.js`, который читает контент из выгрузки

## Запуск dev-версии

```powershell
npm install
npm run dev
```

Или просто:

```powershell
start-dev.bat
```

## Запуск production-версии локально

```powershell
npm run build
npm run start
```

Или просто:

```powershell
start-prod.bat
```

## Повторный экспорт текущего сайта

```powershell
python scripts/export_tilda_site.py
```

Скрипт:

- читает `https://ladyzenko.ru/sitemap.xml`
- читает feed-sitemaps из `https://ladyzenko.ru/sitemap-feeds.xml`
- сохраняет исходный HTML в `export/raw_html/`
- извлекает тексты, заголовки, popup-материалы, SEO и ссылки в `export/pages/`
- скачивает медиа в `export/assets/`
- собирает общий индекс в `export/site-index.json`

## Основные маршруты нового сайта

- `/` — главная
- `/about` — обо мне
- `/articles` — статьи
- `/lectures` — лекции
- `/school-of-fathers` — школа отцов
- `/gallery` — галерея
- `/certificates` — дипломы и сертификаты
- `/media` — видео и подкасты
- `/pages/[slug]` — прочие контентные страницы

## Где лежит логика

- `lib/content.ts` — чтение и нормализация контента из выгрузки
- `components/content-page.tsx` — универсальный шаблон контентной страницы
- `app/` — маршруты и страницы нового сайта
