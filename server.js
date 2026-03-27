const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const querystring = require("querystring");
const crypto = require("crypto");
const { baseUrl, services, faq, posts, topics } = require("./content/site");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const nav = [
  ["/", "Главная"],
  ["/about", "О специалисте"],
  ["/services", "Услуги"],
  ["/format", "Формат"],
  ["/faq", "FAQ"],
  ["/contacts", "Контакты"],
  ["/booking", "Запись"],
];

const legal = [
  ["/privacy", "Privacy"],
  ["/consent", "Consent"],
  ["/terms", "Terms"],
];

const rateMemory = new Map();

function escapeHtml(v) {
  return String(v || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitize(v) {
  return escapeHtml(String(v || "").trim().slice(0, 1000));
}

function pageTemplate({ title, description, urlPath, content }) {
  const navHtml = nav.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("");
  const legalHtml = legal.map(([href, label]) => `<a href="${href}">${label}</a>`).join("");

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${baseUrl}${urlPath}" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="ru_RU" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${baseUrl}${urlPath}" />
<link rel="stylesheet" href="/styles.css" />
</head>
<body>
<header class="site-header">
<div class="container header-row">
<a class="brand" href="/">Психологическая практика</a>
<button class="menu-toggle" data-menu-toggle aria-expanded="false" aria-controls="site-nav">Меню</button>
<nav id="site-nav" class="main-nav" data-main-nav aria-label="Главное меню"><ul>${navHtml}</ul></nav>
</div>
</header>
<main class="container">${content}</main>
<div class="sticky-cta"><a class="btn" href="/booking">Записаться</a></div>
<footer class="site-footer"><div class="container">
<p class="muted">© ${new Date().getFullYear()} Частная психологическая практика. Сайт не предназначен для экстренной помощи.</p>
<nav class="footer-links" aria-label="Юридическая навигация"><a href="/contacts">Контакты</a>${legalHtml}</nav>
</div></footer>
<script src="/site.js" defer></script>
</body></html>`;
}

function card(title, body) {
  return `<article class="card"><h2>${title}</h2><p>${body}</p></article>`;
}

function send(res, status, body, contentType = "text/html; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer-when-downgrade",
    "X-Frame-Options": "DENY",
  });
  res.end(body);
}

function staticFile(reqPath, res) {
  const safe = path.normalize(reqPath).replace(/^\/+/, "");
  const fullPath = path.join(PUBLIC_DIR, safe);
  if (!fullPath.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(fullPath, (err, data) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    const ext = path.extname(fullPath);
    const type = ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "application/octet-stream";
    send(res, 200, data, type);
  });
}

function checkRate(ip) {
  const now = Date.now();
  const wnd = 15 * 60 * 1000;
  const max = 6;
  const list = (rateMemory.get(ip) || []).filter((t) => now - t < wnd);
  if (list.length >= max) return false;
  list.push(now);
  rateMemory.set(ip, list);
  return true;
}

function bookingForm(values = {}, errors = {}) {
  return `<section class="hero"><h1>Запись на первую встречу</h1><p>Минимум полей, ясные условия и прозрачная обработка данных.</p></section>
<section class="form-wrap">
${errors.form ? `<p class="banner">${errors.form}</p>` : ""}
<form method="post" action="/booking" novalidate>
<label for="name">Имя или псевдоним</label>
<input id="name" name="name" value="${values.name || ""}" required />
${errors.name ? `<small class="error">${errors.name}</small>` : ""}

<label for="contact">Email или телефон/мессенджер</label>
<input id="contact" name="contact" value="${values.contact || ""}" required />
${errors.contact ? `<small class="error">${errors.contact}</small>` : ""}

<label for="format">Предпочтительный формат</label>
<select id="format" name="format" required>
<option value="">Выберите</option>
<option value="онлайн" ${values.format === "онлайн" ? "selected" : ""}>Онлайн</option>
<option value="очно" ${values.format === "очно" ? "selected" : ""}>Очно (по согласованию)</option>
</select>
${errors.format ? `<small class="error">${errors.format}</small>` : ""}

<label for="message">Комментарий (опционально)</label>
<textarea id="message" name="message" rows="4">${values.message || ""}</textarea>
<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px" />

<label><input type="checkbox" name="consent" value="yes" ${values.consent ? "checked" : ""} />
Я согласен(на) на обработку данных и ознакомлен(а) с <a href="/privacy">Privacy</a>, <a href="/consent">Consent</a>, <a href="/terms">Terms</a>.</label>
${errors.consent ? `<small class="error">${errors.consent}</small>` : ""}
<p class="muted">Перенос и отмена регулируются условиями на странице Terms.</p>
<button class="btn" type="submit">Подтвердить запись</button>
</form></section>`;
}

function routes(req, res, urlObj) {
  const pathname = urlObj.pathname;

  if (pathname === "/styles.css" || pathname === "/site.js") return staticFile(pathname, res);

  if (pathname === "/robots.txt") {
    return send(res, 200, `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`, "text/plain; charset=utf-8");
  }

  if (pathname === "/sitemap.xml") {
    const urls = [
      "/", "/about", "/about/approach", "/about/boundaries", "/services", "/services/individual", "/format", "/faq",
      "/contacts", "/booking", "/booking/confirmed", "/privacy", "/consent", "/terms", "/blog",
      ...posts.map((p) => `/blog/${p.slug}`),
      ...topics.map((t) => `/topics/${t.slug}`),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
      .map((u) => `<url><loc>${baseUrl}${u}</loc></url>`)
      .join("")}</urlset>`;
    return send(res, 200, xml, "application/xml; charset=utf-8");
  }

  if (pathname === "/") {
    const faqBlock = faq
      .slice(0, 3)
      .map((x) => `<h3>${escapeHtml(x.q)}</h3><p>${escapeHtml(x.a)}</p>`)
      .join("");
    const html = pageTemplate({
      title: "Психологическая практика — бережная индивидуальная работа",
      description: "Русскоязычная психологическая практика: ясный формат, конфиденциальность и спокойный путь к записи.",
      urlPath: pathname,
      content: `<section class="hero"><h1>Спокойная и структурная психологическая работа для взрослых</h1>
      <p class="muted">Здесь можно начать без перегруза и агрессивного тона.</p>
      <p><a class="btn" href="/booking">Записаться</a> <a class="btn secondary" href="/about">О специалисте</a></p></section>
      <section class="grid two">${card("С чем можно обратиться", "Тревога, отношения, кризисы, вопросы границ и повторяющиеся сценарии.")}${card("Как проходит работа", "Первая встреча для ориентировки, дальше — регулярный и понятный формат.")}${card("Формат", "Онлайн как основной формат. Очный — по согласованию. <a href='/format'>Подробнее</a>")}${card("Границы и безопасность", "Конфиденциальность и правила взаимодействия описаны заранее. <a href='/about/boundaries'>Читать</a>")}</section>
      <section class="card"><h2>Короткий FAQ</h2>${faqBlock}<p><a href="/faq">Все вопросы</a></p></section>`,
    });
    return send(res, 200, html);
  }

  if (pathname === "/about") {
    return send(
      res,
      200,
      pageTemplate({
        title: "О специалисте",
        description: "Подход, квалификация, границы и формат работы.",
        urlPath: pathname,
        content: `<section class="hero"><h1>О специалисте</h1><p>Бережный, профессиональный и структурный формат работы без гиперобещаний.</p><p><a class='btn' href='/booking'>Записаться</a></p></section>
        <section class='grid two'>${card("Квалификация", "Блок для подтверждённых данных об образовании и подготовке (заполняется владельцем).")}${card("Подход", "Опора на рабочий контракт и регулярность. <a href='/about/approach'>Подробнее</a>")}${card("Границы", "Правила конфиденциальности и взаимодействия доступны до записи. <a href='/about/boundaries'>Читать</a>")}</section>`,
      })
    );
  }

  if (pathname === "/about/approach") {
    return send(res, 200, pageTemplate({
      title: "Подход",
      description: "Как устроена работа и что важно в терапевтическом контракте.",
      urlPath: pathname,
      content: `<section class='hero'><h1>Подход: как проходит работа</h1><p>Работа строится в темпе клиента и с ясной рамкой.</p></section>
      <section class='card'><ul><li>Бережность и ясность границ.</li><li>Регулярность и совместная оценка динамики.</li><li>Без обещаний мгновенных результатов.</li></ul><p><a class='btn' href='/booking'>Выбрать время</a></p></section>`,
    }));
  }

  if (pathname === "/about/boundaries") {
    return send(res, 200, pageTemplate({
      title: "Границы и безопасность",
      description: "Конфиденциальность, организационные рамки и экстренные исключения.",
      urlPath: pathname,
      content: `<section class='hero'><h1>Границы и безопасность</h1><p>Конфиденциальность и правила взаимодействия описаны заранее.</p><p><a class='btn' href='/booking'>Выбрать время</a></p></section>
      <section class='grid two'>${card("Конфиденциальность", "Содержание встреч не раскрывается третьим лицам, кроме юридически обязательных случаев.")}${card("Исключения", "Ситуации прямой угрозы жизни требуют отдельного протокола.")}${card("Отмена и перенос", "Оргусловия описаны в <a href='/terms'>Terms</a>.")}<article class='card'><h2>Экстренные случаи</h2><p class='banner'>Сайт не является каналом экстренной помощи.</p></article></section>`,
    }));
  }

  if (pathname === "/services") {
    const cards = services
      .map((s) => `<article class='card'><h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.summary)}</p><p><a class='btn' href='/services/${s.slug}'>Выбрать формат</a></p></article>`)
      .join("");
    return send(res, 200, pageTemplate({
      title: "Услуги",
      description: "Выбор формата психологической помощи.",
      urlPath: pathname,
      content: `<section class='hero'><h1>Услуги</h1><p>Выберите формат, который подходит вашему запросу.</p></section><section class='grid two'>${cards}</section>`,
    }));
  }

  if (pathname.startsWith("/services/")) {
    const slug = pathname.replace("/services/", "");
    const s = services.find((x) => x.slug === slug);
    if (!s) return notFound(res, pathname);
    return send(res, 200, pageTemplate({
      title: s.title,
      description: s.summary,
      urlPath: pathname,
      content: `<section class='hero'><h1>${escapeHtml(s.title)}</h1><p>${escapeHtml(s.details)}</p><p><a class='btn' href='/booking'>Выбрать время</a></p></section>
      <section class='grid two'>${card("Для кого", "Для взрослых клиентов, которым важна глубина и структурность.")}${card("Как проходит", "Первая встреча — ориентировка, затем регулярный формат.")}${card("Оргусловия", "Подробно: <a href='/terms'>Terms</a>.")}${card("Вопросы", "Ответы перед записью: <a href='/faq'>FAQ</a>.")}</section>`,
    }));
  }

  if (pathname === "/format") {
    return send(res, 200, pageTemplate({
      title: "Формат работы",
      description: "Онлайн/очно, длительность и условия.",
      urlPath: pathname,
      content: `<section class='hero'><h1>Формат работы</h1><p>Основной формат — онлайн-встречи на русском языке.</p></section>
      <section class='grid two'>${card("Длительность", "Обычно 50 минут.")}${card("Ритм", "Чаще всего 1 раз в неделю.")}${card("Оргусловия", "Оплата/перенос/отмена — <a href='/terms'>Terms</a>.")}${card("Конфиденциальность", "См. <a href='/privacy'>Privacy</a> и <a href='/consent'>Consent</a>.")}</section><p><a class='btn' href='/booking'>Перейти к записи</a></p>`,
    }));
  }

  if (pathname === "/faq") {
    const list = faq.map((x) => `<h2>${escapeHtml(x.q)}</h2><p>${escapeHtml(x.a)}</p>`).join("");
    return send(res, 200, pageTemplate({
      title: "FAQ",
      description: "Ответы на частые вопросы перед первой встречей.",
      urlPath: pathname,
      content: `<section class='hero'><h1>FAQ</h1><p>Короткие ответы на вопросы перед записью.</p></section><section class='card'>${list}</section><p><a class='btn' href='/booking'>Записаться</a></p>`,
    }));
  }

  if (pathname === "/contacts") {
    return send(res, 200, pageTemplate({
      title: "Контакты",
      description: "Альтернативный канал связи перед записью.",
      urlPath: pathname,
      content: `<section class='hero'><h1>Контакты</h1><p>Можно сначала задать организационный вопрос.</p></section><section class='card'><p>Email: <a href='mailto:hello@example.com'>hello@example.com</a></p><p>Telegram: <a href='https://t.me/example'>@example</a></p><p class='muted'>TODO: заменить placeholder-контакты на реальные.</p></section><p><a class='btn' href='/faq'>К FAQ</a> <a class='btn secondary' href='/booking'>К записи</a></p>`,
    }));
  }

  if (pathname === "/booking" && req.method === "GET") {
    return send(res, 200, pageTemplate({
      title: "Запись",
      description: "Форма первичной записи с минимальным числом полей.",
      urlPath: pathname,
      content: bookingForm(),
    }));
  }

  if (pathname === "/booking" && req.method === "POST") {
    const ip = req.socket.remoteAddress || "unknown";
    if (!checkRate(ip)) {
      return send(res, 429, pageTemplate({
        title: "Слишком много запросов",
        description: "Попробуйте позже.",
        urlPath: pathname,
        content: `<section class='hero'><h1>Слишком много попыток</h1><p>Попробуйте отправить форму чуть позже.</p></section>`,
      }));
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      const body = querystring.parse(raw);
      const values = {
        name: sanitize(body.name),
        contact: sanitize(body.contact),
        format: sanitize(body.format),
        message: sanitize(body.message),
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
        return send(res, 400, pageTemplate({
          title: "Запись",
          description: "Исправьте поля формы.",
          urlPath: pathname,
          content: bookingForm(values, errors),
        }));
      }
      const token = crypto.randomUUID();
      res.writeHead(303, { Location: `/booking/confirmed?format=${encodeURIComponent(values.format)}&id=${token}` });
      res.end();
    });
    return;
  }

  if (pathname === "/booking/confirmed") {
    const format = sanitize(urlObj.searchParams.get("format") || "онлайн");
    return send(res, 200, pageTemplate({
      title: "Подтверждение записи",
      description: "Запись отправлена, следующий шаг — подтверждение времени.",
      urlPath: pathname,
      content: `<section class='hero'><h1>Запись отправлена</h1><p>Предпочтительный формат: <strong>${format}</strong>.</p><p>Мы свяжемся с вами и подтвердим время встречи.</p></section><section class='card'><h2>Что дальше</h2><ul><li>Проверьте почту/мессенджер.</li><li>Для переноса — <a href='/terms'>Terms</a>.</li><li>Вопросы — <a href='/contacts'>Контакты</a>.</li></ul></section>`,
    }));
  }

  if (pathname === "/privacy") {
    return send(res, 200, pageTemplate({
      title: "Политика конфиденциальности",
      description: "Обработка данных первичного обращения.",
      urlPath: pathname,
      content: `<section class='legal'><h1>Политика конфиденциальности</h1><p>Собираются только данные, необходимые для связи и организации встречи.</p><p class='muted'>Требуется финальный юридический просмотр.</p><p><a class='btn' href='/booking'>Вернуться к записи</a></p></section>`,
    }));
  }

  if (pathname === "/consent") {
    return send(res, 200, pageTemplate({
      title: "Согласие на обработку данных",
      description: "Согласие на обработку данных в рамках обращения.",
      urlPath: pathname,
      content: `<section class='legal'><h1>Согласие на обработку данных</h1><p>Отправляя форму, вы соглашаетесь на обработку данных для связи и записи.</p><p class='muted'>Требуется финальный юридический просмотр.</p><p><a class='btn' href='/booking'>Вернуться к записи</a></p></section>`,
    }));
  }

  if (pathname === "/terms") {
    return send(res, 200, pageTemplate({
      title: "Условия оплаты и отмены",
      description: "Организационные правила: оплата, перенос, отмена.",
      urlPath: pathname,
      content: `<section class='legal'><h1>Условия оплаты, переноса и отмены</h1><p>Организационные условия обсуждаются заранее и фиксируются в рабочем договоре.</p><p class='muted'>Требуется финальный юридический просмотр.</p><p><a class='btn' href='/booking'>Вернуться к записи</a></p></section>`,
    }));
  }

  if (pathname === "/blog") {
    const list = posts
      .map((p) => `<article class='card'><h2><a href='/blog/${p.slug}'>${escapeHtml(p.title)}</a></h2><p>${escapeHtml(p.excerpt)}</p><p><a href='/services/individual'>К услуге</a> · <a href='/booking'>К записи</a></p></article>`)
      .join("");
    return send(res, 200, pageTemplate({
      title: "Блог",
      description: "Материалы для спокойной ориентировки перед обращением.",
      urlPath: pathname,
      content: `<section class='hero'><h1>Блог</h1><p>Материалы о первой встрече и формате работы.</p></section><section class='grid two'>${list}</section>`,
    }));
  }

  if (pathname.startsWith("/blog/")) {
    const slug = pathname.replace("/blog/", "");
    const post = posts.find((p) => p.slug === slug);
    if (!post) return notFound(res, pathname);
    const body = post.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
    return send(res, 200, pageTemplate({
      title: post.title,
      description: post.excerpt,
      urlPath: pathname,
      content: `<article class='card' style='margin-top:1.2rem'><h1>${escapeHtml(post.title)}</h1><p class='muted'>${escapeHtml(post.excerpt)}</p>${body}<hr /><p><a href='/services/individual'>К услуге</a> · <a href='/booking'>Записаться</a></p></article>`,
    }));
  }

  if (pathname.startsWith("/topics/")) {
    const slug = pathname.replace("/topics/", "");
    const topic = topics.find((t) => t.slug === slug);
    if (!topic) return notFound(res, pathname);
    return send(res, 200, pageTemplate({
      title: topic.title,
      description: topic.excerpt,
      urlPath: pathname,
      content: `<section class='hero'><h1>${escapeHtml(topic.title)}</h1><p>${escapeHtml(topic.excerpt)}</p><p><a class='btn' href='/services/individual'>К услуге</a> <a class='btn secondary' href='/booking'>К записи</a></p></section>`,
    }));
  }

  return notFound(res, pathname);
}

function notFound(res, pathname) {
  return send(res, 404, pageTemplate({
    title: "Страница не найдена",
    description: "Проверьте адрес страницы.",
    urlPath: pathname,
    content: `<section class='hero'><h1>Страница не найдена</h1><p>Проверьте адрес или вернитесь на главную.</p><p><a class='btn' href='/'>На главную</a></p></section>`,
  }));
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  routes(req, res, urlObj);
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
