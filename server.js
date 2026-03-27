const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const querystring = require("querystring");
const { baseUrl, services, faq, posts, topics } = require("./content/site");

const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "public");

const nav = [
  ["/", "Главная"],
  ["/about", "О специалисте"],
  ["/services", "Услуги"],
  ["/format", "Формат"],
  ["/faq", "FAQ"],
  ["/contacts", "Контакты"],
  ["/booking", "Запись"],
];

const legalNav = [
  ["/privacy", "Privacy"],
  ["/consent", "Consent"],
  ["/terms", "Terms"],
];

const rateStore = new Map();
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 6;

function esc(v) {
  return String(v || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pageMeta(title, description, pathname) {
  const canonical = `${baseUrl}${pathname}`;
  return { title, description, canonical };
}

function layout(meta, content, pathname) {
  const mainNav = nav
    .map(([href, label]) => `<li><a href="${href}"${href === pathname ? ' aria-current="page"' : ""}>${label}</a></li>`)
    .join("");
  const legalLinks = legalNav.map(([href, label]) => `<a href="${href}">${label}</a>`).join("");

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}" />
<link rel="canonical" href="${esc(meta.canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="ru_RU" />
<meta property="og:title" content="${esc(meta.title)}" />
<meta property="og:description" content="${esc(meta.description)}" />
<meta property="og:url" content="${esc(meta.canonical)}" />
<link rel="stylesheet" href="/styles.css" />
</head>
<body>
<header class="site-header"><div class="container header-row"><a class="brand" href="/">Психологическая практика</a><button class="menu-toggle" data-menu-toggle aria-expanded="false" aria-controls="site-nav">Меню</button><nav id="site-nav" class="main-nav" data-main-nav aria-label="Главное меню"><ul>${mainNav}</ul></nav></div></header>
<main class="container">${content}</main>
<div class="sticky-cta"><a class="btn" href="/booking">Записаться</a></div>
<footer class="site-footer"><div class="container"><p class="muted">© ${new Date().getFullYear()} Частная психологическая практика. Сайт не предназначен для экстренной помощи.</p><nav class="footer-links" aria-label="Юридическая навигация"><a href="/contacts">Контакты</a>${legalLinks}</nav></div></footer>
<script src="/site.js" defer></script>
</body>
</html>`;
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  res.end(html);
}

function sendText(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function serveStatic(reqPath, res) {
  const clean = path.normalize(reqPath).replace(/^\/+/, "");
  if (clean.includes("..")) return false;
  const file = path.join(publicDir, clean);
  if (!file.startsWith(publicDir)) return false;
  if (!fs.existsSync(file)) return false;
  const ext = path.extname(file);
  const type = ext === ".css" ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8";
  sendText(res, 200, fs.readFileSync(file), type);
  return true;
}

function sectionCard(title, body, link) {
  return `<article class="card"><h2>${esc(title)}</h2><p>${esc(body)}</p>${link ? `<p>${link}</p>` : ""}</article>`;
}

function homePage() {
  const faqHtml = faq
    .slice(0, 3)
    .map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`)
    .join("");
  return `
<section class="hero"><h1>Спокойная и структурная психологическая работа для взрослых</h1><p class="muted">Если вы хотите разобраться с тревогой, напряжением в отношениях или повторяющимися сценариями — здесь можно начать без перегруза.</p><p><a class="btn" href="/booking">Записаться</a> <a class="btn secondary" href="/about">О специалисте</a></p></section>
<section class="grid two">
${sectionCard("С чем можно обратиться", "Тревога, эмоциональное напряжение, сложности в отношениях, кризисы и вопросы границ.")}
${sectionCard("Как проходит работа", "Первая встреча для ориентировки и формулировки запроса, далее — регулярный ритм с ясными рамками.")}
${sectionCard("Формат", "Основной формат — онлайн. Очный формат доступен по согласованию.", '<a href="/format">Подробнее о формате</a>')}
${sectionCard("Границы и безопасность", "Конфиденциальность, организационные правила и исключения описаны заранее.", '<a href="/about/boundaries">Читать</a>')}
</section>
<section class="card"><h2>Короткий FAQ</h2>${faqHtml}<p><a href="/faq">Все вопросы</a></p></section>`;
}

function bookingForm(values = {}, errors = {}) {
  const err = (k) => (errors[k] ? `<small class="error">${esc(errors[k])}</small>` : "");
  return `
<section class="hero"><h1>Запись на первую встречу</h1><p>Минимум полей, ясные условия и прозрачная обработка данных.</p></section>
<section class="form-wrap">
${errors.form ? `<p class="banner">${esc(errors.form)}</p>` : ""}
<form method="post" action="/booking" novalidate>
<label for="name">Имя или псевдоним</label>
<input id="name" name="name" value="${esc(values.name)}" required />${err("name")}
<label for="contact">Email или телефон/мессенджер</label>
<input id="contact" name="contact" value="${esc(values.contact)}" required />${err("contact")}
<label for="format">Предпочтительный формат</label>
<select id="format" name="format" required>
<option value="">Выберите</option>
<option value="онлайн" ${values.format === "онлайн" ? "selected" : ""}>Онлайн</option>
<option value="очно" ${values.format === "очно" ? "selected" : ""}>Очно (по согласованию)</option>
</select>${err("format")}
<label for="message">Комментарий (опционально)</label><textarea id="message" name="message" rows="4">${esc(values.message)}</textarea>
<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px" />
<label><input type="checkbox" name="consent" value="yes" ${values.consent ? "checked" : ""}/> Я согласен(на) на обработку данных и ознакомлен(а) с <a href="/privacy">Privacy</a>, <a href="/consent">Consent</a>, <a href="/terms">Terms</a>.</label>${err("consent")}
<p class="muted">Перенос и отмена регулируются условиями на странице Terms.</p>
<button class="btn" type="submit">Подтвердить запись</button>
</form></section>`;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 1e6) req.destroy();
    });
    req.on("end", () => resolve(querystring.parse(body)));
    req.on("error", reject);
  });
}

function sanitize(v) {
  return String(v || "").trim().slice(0, 1000);
}

function limited(ip) {
  const now = Date.now();
  const row = rateStore.get(ip) || { count: 0, start: now };
  if (now - row.start > RATE_WINDOW_MS) {
    row.count = 0;
    row.start = now;
  }
  row.count += 1;
  rateStore.set(ip, row);
  return row.count > RATE_MAX;
}

function page(pathname, meta, content) {
  return { pathname, meta, content };
}

function getPage(pathname, urlObj) {
  if (pathname === "/") {
    return page(pathname, pageMeta("Психологическая практика — бережная индивидуальная работа", "Русскоязычная психологическая практика: ясный формат, конфиденциальность и спокойный путь к записи.", pathname), homePage());
  }
  if (pathname === "/about") return page(pathname, pageMeta("О специалисте", "Подход, квалификация, границы и формат работы.", pathname), `<section class="hero"><h1>О специалисте</h1><p>Подход основан на уважении к темпу клиента и ясной профессиональной рамке.</p><p><a class="btn" href="/booking">Записаться</a></p></section><section class="grid two">${sectionCard("Квалификация", "Раздел для подтверждённых фактов об образовании и практике (заполняется владельцем).")}${sectionCard("Подход", "Фокус на устойчивых изменениях без быстрых обещаний.", '<a href="/about/approach">Подробнее</a>')}${sectionCard("Границы", "До начала работы можно изучить конфиденциальность и правила.", '<a href="/about/boundaries">Границы и безопасность</a>')}</section>`);
  if (pathname === "/about/approach") return page(pathname, pageMeta("Подход", "Как устроена работа и что важно в терапевтическом контракте.", pathname), `<section class="hero"><h1>Подход: как я работаю</h1><p>Работа строится вокруг вашего запроса, личного контекста и безопасного темпа изменений.</p></section><section class="card"><h2>Основные принципы</h2><ul><li>Бережность и ясность рамок.</li><li>Регулярность встреч и совместная оценка динамики.</li><li>Отсутствие обещаний мгновенных результатов.</li><li>Прозрачность организационных условий до начала работы.</li></ul><p><a class="btn" href="/booking">Выбрать время</a></p></section>`);
  if (pathname === "/about/boundaries") return page(pathname, pageMeta("Границы и безопасность", "Конфиденциальность, рамки и правила взаимодействия.", pathname), `<section class="hero"><h1>Границы и безопасность</h1><p>Конфиденциальность и организационные правила описаны заранее, чтобы снизить неопределённость.</p><p><a class="btn" href="/booking">Выбрать время</a></p></section><section class="grid two">${sectionCard("Конфиденциальность", "Содержание сессий не раскрывается третьим лицам, кроме случаев, предусмотренных законом.")}${sectionCard("Исключения", "Ситуации прямой угрозы жизни и юридически обязательные исключения обсуждаются открыто.")}${sectionCard("Отмена/перенос", "Условия переноса и отмены доступны на странице Terms.", '<a href="/terms">Открыть Terms</a>')}<article class="card"><h2>Экстренные случаи</h2><p class="banner">Сайт и форма записи не являются каналом экстренной помощи.</p></article></section>`);
  if (pathname === "/services") {
    const cards = services
      .map((s) => `<article class="card"><h2>${esc(s.title)}</h2><p>${esc(s.summary)}</p><p><a class="btn" href="/services/${esc(s.slug)}">Выбрать формат</a></p></article>`)
      .join("");
    return page(pathname, pageMeta("Услуги", "Форматы психологической работы и выбор подходящего направления.", pathname), `<section class="hero"><h1>Услуги</h1><p>Выберите формат, который лучше подходит вашему запросу.</p></section><section class="grid two">${cards}</section>`);
  }
  if (pathname.startsWith("/services/")) {
    const slug = pathname.split("/")[2];
    const service = services.find((s) => s.slug === slug);
    if (!service) return null;
    return page(pathname, pageMeta(service.title, service.summary, pathname), `<section class="hero"><h1>${esc(service.title)}</h1><p>${esc(service.details)}</p><p><a class="btn" href="/booking">Выбрать время</a></p></section><section class="grid two">${sectionCard("Для кого", "Для взрослых, которым важно бережно разобрать состояние и найти устойчивый рабочий ритм.")}${sectionCard("Как проходит", "Первая встреча — ориентировка и контракт. Далее — регулярные сессии.")}${sectionCard("Условия", "Оплата, перенос и отмена описаны в Terms.", '<a href="/terms">Условия</a>')}${sectionCard("Вопросы", "Ответы на частые вопросы перед первой записью.", '<a href="/faq">FAQ</a>')}</section>`);
  }
  if (pathname === "/format") return page(pathname, pageMeta("Формат работы", "Онлайн/очно, длительность встреч и организационные условия.", pathname), `<section class="hero"><h1>Формат работы</h1><p>Основной формат — онлайн-встречи на русском языке. Очно — по согласованию.</p></section><section class="grid two">${sectionCard("Длительность", "Одна встреча обычно длится 50 минут.")}${sectionCard("Ритм", "Чаще всего — 1 раз в неделю, обсуждается индивидуально.")}${sectionCard("Оргусловия", "Оплата, перенос и отмена описаны в Terms.", '<a href="/terms">Terms</a>')}${sectionCard("Конфиденциальность", "Правила обработки данных — в Privacy и Consent.", '<a href="/privacy">Privacy</a> · <a href="/consent">Consent</a>')}</section><p><a class="btn" href="/booking">Перейти к записи</a></p>`);
  if (pathname === "/faq") {
    const qa = faq.map((f) => `<h2>${esc(f.q)}</h2><p>${esc(f.a)}</p>`).join("");
    return page(pathname, pageMeta("FAQ", "Ответы на частые вопросы перед первой записью.", pathname), `<section class="hero"><h1>FAQ</h1><p>Короткие ответы на вопросы перед первой записью.</p></section><section class="card">${qa}</section><p><a class="btn" href="/booking">Записаться</a></p>`);
  }
  if (pathname === "/contacts") return page(pathname, pageMeta("Контакты", "Альтернативный способ связи и организационные вопросы.", pathname), `<section class="hero"><h1>Контакты</h1><p>Если удобнее сначала задать организационный вопрос — используйте контактный канал.</p></section><section class="card"><h2>Контакт</h2><p>Email: <a href="mailto:hello@example.com">hello@example.com</a></p><p>Telegram: <a href="https://t.me/example" rel="nofollow noopener">@example</a></p><p class="muted">TODO: заменить placeholder-контакты на реальные.</p></section><p><a class="btn" href="/faq">Перейти к FAQ</a> <a class="btn secondary" href="/booking">К записи</a></p>`);
  if (pathname === "/booking") return page(pathname, pageMeta("Запись", "Запись на первую встречу с минимальным количеством полей.", pathname), bookingForm());
  if (pathname === "/booking/confirmed") {
    const fmt = esc(urlObj.searchParams.get("format") || "онлайн");
    return page(pathname, pageMeta("Подтверждение записи", "Запись отправлена. Что дальше и как подготовиться.", pathname), `<section class="hero"><h1>Запись отправлена</h1><p>Спасибо. Заявка принята. Предпочтительный формат: <strong>${fmt}</strong>.</p><p>Мы свяжемся с вами и подтвердим время встречи.</p></section><section class="card"><h2>Что дальше</h2><ul><li>Проверьте почту/мессенджер для подтверждения времени.</li><li>При необходимости переноса используйте <a href="/terms">правила переноса и отмены</a>.</li><li>Если есть организационный вопрос — <a href="/contacts">свяжитесь</a>.</li></ul><p><a class="btn" href="/booking">Новая запись</a></p></section>`);
  }
  if (pathname === "/privacy") return page(pathname, pageMeta("Политика конфиденциальности", "Обработка и хранение персональных данных.", pathname), `<section class="legal"><h1>Политика конфиденциальности</h1><p>Мы собираем только данные, необходимые для первичного контакта и организации встречи.</p><h2>Какие данные</h2><p>Имя/псевдоним, контакт, опциональный комментарий и предпочтительный формат работы.</p><h2>Зачем</h2><p>Чтобы обработать запрос и согласовать первую встречу.</p><p class="muted">Текст является рабочим шаблоном и требует финального юридического просмотра.</p><p><a class="btn" href="/booking">Вернуться к записи</a></p></section>`);
  if (pathname === "/consent") return page(pathname, pageMeta("Согласие на обработку данных", "Согласие на обработку данных в рамках первичного обращения.", pathname), `<section class="legal"><h1>Согласие на обработку данных</h1><p>Отправляя форму, вы даёте согласие на обработку данных для связи и организации встречи.</p><h2>Объём согласия</h2><p>Обрабатываются только данные, введённые в форме записи.</p><h2>Отзыв согласия</h2><p>Вы можете отозвать согласие через контакты сайта.</p><p class="muted">Текст шаблонный и требует юридической верификации.</p><p><a class="btn" href="/booking">Вернуться к записи</a></p></section>`);
  if (pathname === "/terms") return page(pathname, pageMeta("Условия оплаты и отмены", "Организационные условия: оплата, перенос и отмена встреч.", pathname), `<section class="legal"><h1>Условия оплаты, переноса и отмены</h1><h2>Оплата</h2><p>Оплата производится по согласованным реквизитам до или после сессии — по договорённости.</p><h2>Перенос</h2><p>Перенос возможен при предупреждении заранее. Срок фиксируется в рабочем договоре.</p><h2>Отмена</h2><p>Условия отмены и возможной оплаты пропуска заранее обсуждаются на первой встрече.</p><p class="muted">Текст условий — placeholder до финальной юридической редакции.</p><p><a class="btn" href="/booking">Вернуться к записи</a></p></section>`);
  if (pathname === "/blog") {
    const cards = posts.map((p) => `<article class="card"><h2><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></h2><p>${esc(p.excerpt)}</p><p><a href="/services/individual">Перейти к услуге</a> · <a href="/booking">К записи</a></p></article>`).join("");
    return page(pathname, pageMeta("Блог", "Материалы о психологической работе и первом обращении.", pathname), `<section class="hero"><h1>Блог</h1><p>Материалы для спокойной ориентировки перед обращением.</p></section><section class="grid two">${cards}</section>`);
  }
  if (pathname.startsWith("/blog/")) {
    const slug = pathname.split("/")[2];
    const post = posts.find((p) => p.slug === slug);
    if (!post) return null;
    const body = post.body.map((p) => `<p>${esc(p)}</p>`).join("");
    return page(pathname, pageMeta(post.title, post.excerpt, pathname), `<article class="card" style="margin-top:1.2rem"><h1>${esc(post.title)}</h1><p class="muted">${esc(post.excerpt)}</p>${body}<hr /><p><a href="/services/individual">Перейти к индивидуальной работе</a> · <a href="/booking">Записаться</a></p></article>`);
  }
  if (pathname.startsWith("/topics/")) {
    const slug = pathname.split("/")[2];
    const topic = topics.find((t) => t.slug === slug);
    if (!topic) return null;
    return page(pathname, pageMeta(topic.title, topic.excerpt, pathname), `<section class="hero"><h1>${esc(topic.title)}</h1><p>${esc(topic.excerpt)}</p><p>Если тема откликается, перейдите к услуге и выберите время первой встречи.</p><p><a class="btn" href="/services/individual">К услуге</a> <a class="btn secondary" href="/booking">Запись</a></p></section>`);
  }
  return null;
}

function xmlSitemap() {
  const urls = [
    "/", "/about", "/about/approach", "/about/boundaries", "/services", "/services/individual", "/format", "/faq", "/contacts", "/booking", "/booking/confirmed", "/privacy", "/consent", "/terms", "/blog",
    ...posts.map((x) => `/blog/${x.slug}`),
    ...topics.map((x) => `/topics/${x.slug}`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${baseUrl}${u}</loc></url>`).join("")}</urlset>`;
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  const pathname = decodeURIComponent(urlObj.pathname);

  if (pathname === "/styles.css" || pathname === "/site.js") {
    if (serveStatic(pathname, res)) return;
  }

  if (pathname === "/robots.txt") {
    return sendText(res, 200, `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
  }

  if (pathname === "/sitemap.xml") {
    return sendText(res, 200, xmlSitemap(), "application/xml; charset=utf-8");
  }

  if (req.method === "POST" && pathname === "/booking") {
    const ip = req.socket.remoteAddress || "unknown";
    if (limited(ip)) {
      return sendHtml(res, 429, layout(pageMeta("Запись", "Слишком много попыток отправки формы.", "/booking"), `<section class="hero"><h1>Слишком много попыток</h1><p>Подождите и попробуйте снова через несколько минут.</p><p><a class="btn" href="/booking">Вернуться к форме</a></p></section>`, pathname));
    }

    const body = await parseBody(req);
    const values = {
      name: sanitize(body.name),
      contact: sanitize(body.contact),
      message: sanitize(body.message),
      format: sanitize(body.format),
      consent: body.consent,
      website: sanitize(body.website),
    };

    const errors = {};
    if (values.website) errors.form = "Некорректная отправка формы.";
    if (!values.name) errors.name = "Укажите имя или псевдоним.";
    if (!values.contact) errors.contact = "Укажите email или телефон/мессенджер.";
    if (!values.format) errors.format = "Выберите предпочтительный формат.";
    if (!values.consent) errors.consent = "Подтвердите согласие на обработку данных.";

    if (Object.keys(errors).length) {
      return sendHtml(res, 400, layout(pageMeta("Запись", "Запись на первую встречу", "/booking"), bookingForm(values, errors), "/booking"));
    }

    res.writeHead(302, { Location: `/booking/confirmed?format=${encodeURIComponent(values.format)}` });
    return res.end();
  }

  if (req.method !== "GET") return sendText(res, 405, "Method Not Allowed");

  const data = getPage(pathname, urlObj);
  if (!data) {
    return sendHtml(res, 404, layout(pageMeta("Страница не найдена", "Запрошенная страница не найдена.", pathname), `<section class="hero"><h1>Страница не найдена</h1><p>Проверьте адрес или вернитесь на главную.</p><p><a class="btn" href="/">На главную</a></p></section>`, pathname));
  }
  return sendHtml(res, 200, layout(data.meta, data.content, pathname));
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
