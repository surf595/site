# Психологическая практика — рабочий MVP сайта

Сайт реализован как Node.js + Express + EJS приложение с mobile-first версткой и русскоязычным контентом.

## Что реализовано
- P0 страницы: `/`, `/services`, `/services/individual`, `/about`, `/about/boundaries`, `/booking`, `/booking/confirmed`, `/privacy`, `/consent`, `/terms`.
- P1 страницы: `/format`, `/faq`, `/contacts`, `/about/approach`, `/blog`, `/blog/:slug`, `/topics/:slug`.
- Форма записи с валидацией, honeypot-полем и rate-limit.
- SEO-база: мета-теги, canonical, OG, `robots.txt`, `sitemap.xml`.

## Локальный запуск
```bash
npm install
npm run dev
```
Сайт будет доступен на `http://localhost:3000`.

## Проверки
```bash
python3 scripts/validate_p0_structure.py
```

## Переменные окружения
- `PORT` — порт сервера (по умолчанию `3000`)
- `SITE_URL` — базовый URL для canonical/OG/sitemap (по умолчанию `http://localhost:3000`)

## Деплой
Подходит любой Node.js хостинг (Render, Fly.io, Railway, VPS):
1. Установить зависимости `npm install --omit=dev`
2. Указать `SITE_URL` и при необходимости `PORT`
3. Запустить `npm start`

## Важные TODO перед production
- Заменить placeholder-контакты в `/contacts`.
- Провести финальный юридический просмотр страниц `/privacy`, `/consent`, `/terms`.
- Подключить реальную интеграцию отправки заявок (email/CRM endpoint).

## Проектная документация
- `TECH_SPEC_SITE_STRUCTURE.md`
- `STAGE1_MOBILE_FIRST_UX_CARCASS.md`
- `P0_MVP_PAGES.md`
- `p0/structure.json`
