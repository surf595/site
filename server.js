const express = require("express");
const path = require("path");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { baseUrl, services, faq, posts, topics } = require("./content/site");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", 1);

app.use(compression());

// Static files with cache headers
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "7d",
    immutable: true,
  })
);

app.use(express.urlencoded({ extended: false }));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Слишком много попыток отправки. Попробуйте чуть позже.",
});

const nav = [
  { href: "/", label: "Главная" },
  { href: "/about", label: "О специалисте" },
  { href: "/services", label: "Услуги" },
  { href: "/format", label: "Формат" },
  { href: "/faq", label: "FAQ" },
  { href: "/contacts", label: "Контакты" },
  { href: "/booking", label: "Запись" },
];

const legalNav = [
  { href: "/privacy", label: "Конфиденциальность" },
  { href: "/consent", label: "Согласие" },
  { href: "/terms", label: "Условия" },
];

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

function meta(title, description, pathName) {
  return {
    title,
    description,
    canonical: `${baseUrl}${pathName}`,
    ogTitle: title,
    ogDescription: description,
    ogUrl: `${baseUrl}${pathName}`,
    currentPath: pathName,
  };
}

function render(res, view, options = {}) {
  res.render(view, {
    nav,
    legalNav,
    baseUrl,
    ...options,
  });
}

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
});

app.get("/sitemap.xml", (req, res) => {
  const now = new Date().toISOString().split("T")[0];
  const urls = [
    "/",
    "/about",
    "/about/approach",
    "/about/boundaries",
    "/services",
    "/services/individual",
    "/format",
    "/faq",
    "/contacts",
    "/booking",
    "/privacy",
    "/consent",
    "/terms",
    "/blog",
    ...posts.map((x) => `/blog/${x.slug}`),
    ...topics.map((x) => `/topics/${x.slug}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((u) => `<url><loc>${baseUrl}${u}</loc><lastmod>${now}</lastmod></url>`)
    .join("")}</urlset>`;
  res.type("application/xml").send(xml);
});

app.get("/", (req, res) => {
  render(res, "pages/home", {
    page: meta(
      "Kairos — психологическая практика в Таллине | Столяров Виктор",
      "Частная психологическая практика на русском языке. Индивидуальная работа онлайн и очно в Таллине. Запись: info@kairos.ee",
      "/"
    ),
    faq,
  });
});

app.get("/about", (req, res) => {
  render(res, "pages/about", {
    page: meta("О специалисте — Столяров Виктор", "Частная психологическая практика в Таллине. Индивидуальная работа со взрослыми на русском языке.", "/about"),
  });
});

app.get("/about/approach", (req, res) => {
  render(res, "pages/approach", {
    page: meta("Подход", "Как устроена работа и что важно в терапевтическом контракте.", "/about/approach"),
  });
});

app.get("/about/boundaries", (req, res) => {
  render(res, "pages/boundaries", {
    page: meta("Границы и безопасность", "Конфиденциальность, рамки и правила взаимодействия.", "/about/boundaries"),
  });
});

app.get("/services", (req, res) => {
  render(res, "pages/services", {
    page: meta("Услуги", "Форматы психологической работы и выбор подходящего направления.", "/services"),
    services,
  });
});

app.get("/services/:slug", (req, res, next) => {
  const service = services.find((s) => s.slug === req.params.slug);
  if (!service) return next();
  render(res, "pages/service", {
    page: meta(service.title, service.summary, `/services/${service.slug}`),
    service,
  });
});

app.get("/format", (req, res) => {
  render(res, "pages/format", {
    page: meta("Формат работы", "Онлайн/очно, длительность встреч и организационные условия.", "/format"),
  });
});

app.get("/faq", (req, res) => {
  render(res, "pages/faq", {
    page: meta("FAQ", "Ответы на частые вопросы перед первой записью.", "/faq"),
    faq,
  });
});

app.get("/contacts", (req, res) => {
  render(res, "pages/contacts", {
    page: meta("Контакты — Kairos", "Таллин, Татари 56, кабинет 308. Email: info@kairos.ee, Telegram: @Vitutas, тел. +372 539 8003.", "/contacts"),
  });
});

app.get("/booking", (req, res) => {
  render(res, "pages/booking", {
    page: meta("Запись", "Запись на первую встречу с минимальным количеством полей.", "/booking"),
    errors: {},
    values: {},
  });
});

app.post("/booking", bookingLimiter, (req, res) => {
  const values = {
    name: sanitize(req.body.name),
    contact: sanitize(req.body.contact),
    message: sanitize(req.body.message),
    format: sanitize(req.body.format),
    consent: req.body.consent,
    website: sanitize(req.body.website),
  };

  const errors = {};
  if (values.website) {
    errors.form = "Некорректная отправка формы.";
  }
  if (!values.name) errors.name = "Укажите имя или псевдоним.";
  if (!values.contact) errors.contact = "Укажите email или телефон/мессенджер.";
  if (!values.format) errors.format = "Выберите предпочтительный формат.";
  if (!values.consent) errors.consent = "Подтвердите согласие на обработку данных.";

  if (Object.keys(errors).length > 0) {
    return render(res.status(400), "pages/booking", {
      page: meta("Запись", "Запись на первую встречу с минимальным количеством полей.", "/booking"),
      errors,
      values,
    });
  }

  return res.redirect(`/booking/confirmed?format=${encodeURIComponent(values.format)}`);
});

app.get("/booking/confirmed", (req, res) => {
  render(res, "pages/confirmed", {
    page: meta("Подтверждение записи", "Запись отправлена. Что дальше и как подготовиться.", "/booking/confirmed"),
    selectedFormat: sanitize(req.query.format || "онлайн"),
  });
});

app.get("/privacy", (req, res) => {
  render(res, "pages/privacy", {
    page: meta("Политика конфиденциальности", "Обработка и хранение персональных данных.", "/privacy"),
  });
});

app.get("/consent", (req, res) => {
  render(res, "pages/consent", {
    page: meta("Согласие на обработку данных", "Согласие на обработку данных в рамках первичного обращения.", "/consent"),
  });
});

app.get("/terms", (req, res) => {
  render(res, "pages/terms", {
    page: meta("Условия оплаты и отмены", "Организационные условия: оплата, перенос и отмена встреч.", "/terms"),
  });
});

app.get("/blog", (req, res) => {
  render(res, "pages/blog", {
    page: meta("Блог", "Материалы о психологической работе и первом обращении.", "/blog"),
    posts,
  });
});

app.get("/blog/:slug", (req, res, next) => {
  const post = posts.find((p) => p.slug === req.params.slug);
  if (!post) return next();
  render(res, "pages/post", {
    page: meta(post.title, post.excerpt, `/blog/${post.slug}`),
    post,
  });
});

app.get("/topics/:slug", (req, res, next) => {
  const topic = topics.find((t) => t.slug === req.params.slug);
  if (!topic) return next();
  render(res, "pages/topic", {
    page: meta(topic.title, topic.excerpt, `/topics/${topic.slug}`),
    topic,
  });
});

app.use((req, res) => {
  render(res.status(404), "pages/not-found", {
    page: meta("Страница не найдена", "Запрошенная страница не найдена.", req.path),
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
