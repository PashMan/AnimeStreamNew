# Инструкция по переходу на Cloudflare Pages

Мы подготовили ваш проект для работы на Cloudflare Pages. Теперь вам нужно настроить деплой на сайте Cloudflare.

## Шаг 1: Подготовка GitHub
1. Убедитесь, что все последние изменения (включая папку `functions`, которую мы только что создали) отправлены в ваш репозиторий на GitHub.

## Шаг 2: Настройка на Cloudflare
1. Зайдите на [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. В меню слева выберите **Workers & Pages**.
3. Нажмите кнопку **Create application** (или **Create**).
4. Перейдите на вкладку **Pages**.
5. Нажмите **Connect to Git**.
6. Выберите ваш репозиторий `KamiAnime` (или как он у вас называется).
7. Нажмите **Begin setup**.

## Шаг 3: Настройка сборки (Build Settings)
Cloudflare обычно автоматически определяет настройки, но проверьте их:

*   **Project name:** `KamiAnime` (или любое другое)
*   **Production branch:** `main` (или ваша основная ветка)
*   **Framework preset:** `Vite` (выберите из списка)
*   **Build command:** `npm run build` (или `vite build`)
*   **Build output directory:** `dist`

## Шаг 4: Настройка базы данных D1 (Production и Staging)
Так как вы используете Cloudflare D1, вам нужно создать две базы данных: одну для продакшена, другую для стейджинга.

1. В панели Cloudflare перейдите в **Workers & Pages** -> **D1 SQL Database**.
2. Создайте базу данных для продакшена (например, `anime_db_prod`). Скопируйте её `Database ID`.
3. Создайте базу данных для стейджинга (например, `anime_db_staging`). Скопируйте её `Database ID`.
4. Откройте файл `wrangler.jsonc` в вашем проекте.
5. Вставьте ID продакшен-базы в поле `database_id`.
6. Вставьте ID стейджинг-базы в поле `preview_database_id`.

```json
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "anime_db",
      "database_id": "ВАШ_ID_ПРОДАКШЕН_БАЗЫ",
      "preview_database_id": "ВАШ_ID_СТЕЙДЖИНГ_БАЗЫ"
    }
  ]
```

## Шаг 5: Переменные окружения (Environment Variables)
Если вы используете какие-то секретные ключи, добавьте их в разделе **Environment variables** в настройках вашего Pages проекта.
Обратите внимание, что вы можете задать разные значения для **Production** и **Preview** (Staging) окружений.

## Шаг 6: Завершение
1. Нажмите **Save and Deploy**.
2. Дождитесь окончания сборки.
3. После успешного деплоя вы получите URL вида `https://KamiAnime.pages.dev`.

## Проверка
После деплоя проверьте:
1.  Открывается ли сайт.
2.  Работает ли каталог (запросы к Shikimori идут через `/api/shikimori`).
3.  Работает ли плеер (запросы к Kodik идут через `/kodik-proxy`).
4.  Открывается ли `/sitemap.xml`.

## Важно
Файл `server.ts` и папка `api/` теперь используются **только для локальной разработки** (`npm run dev`). На Cloudflare Pages работает папка `functions/`.
