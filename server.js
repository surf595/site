const express = require("express");
const path = require("path");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const session = require("express-session");
const nodemailer = require("nodemailer");
const { baseUrl, services, faq, posts, topics } = require("./content/site");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "info@kairos.ee";

// ─── Email transport ──────────────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

async function sendBookingEmails(values) {
  const ts = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Tallinn" });

  // Notification to specialist
  await mailer.sendMail({
    from: `"Kairos сайт" <${process.env.SMTP_USER}>`,
    to: ADMIN_EMAIL,
    subject: `Новая заявка — ${values.format} — ${values.name}`,
    text: [
      `Новая заявка с сайта kairos.ee`,
      ``,
      `Имя:     ${values.name}`,
      `Контакт: ${values.contact}`,
      `Формат:  ${values.format}`,
      `Комментарий: ${values.message || "—"}`,
      ``,
      `Время: ${ts}`,
    ].join("\n"),
    html: `
      <h2 style="color:#3f5a54">Новая заявка — kairos.ee</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:15px">
        <tr><td><b>Имя</b></td><td>${values.name}</td></tr>
        <tr><td><b>Контакт</b></td><td>${values.contact}</td></tr>
        <tr><td><b>Формат</b></td><td>${values.format}</td></tr>
        <tr><td><b>Комментарий</b></td><td>${values.message || "—"}</td></tr>
        <tr><td><b>Время</b></td><td>${ts}</td></tr>
      </table>
    `,
  });

  // Auto-reply to client if contact looks like email
  if (values.contact.includes("@")) {
    await mailer.sendMail({
      from: `"Kairos — психологическая практика" <${process.env.SMTP_USER}>`,
      to: values.contact,
      subject: "Ваша заявка получена — Kairos",
      text: [
        `Здравствуйте, ${values.name}!`,
        ``,
        `Ваша заявка на ${values.format} получена.`,
        `Я свяжусь с вами в ближайшее время для подтверждения времени встречи.`,
        ``,
        `Если у вас есть вопросы — напишите на info@kairos.ee или в Telegram @Vitutas.`,
        ``,
        `Виктор Столяров`,
        `Kairos Therapy OÜ | kairos.ee`,
      ].join("\n"),
    });
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", 1);

app.use(morgan("combined"));
app.use(compression());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "kairos-dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 10 * 60 * 1000 },
  })
);

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
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://maps.gstatic.com", "https://*.googleapis.com"],
        frameSrc: ["https://www.google.com"],
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

// ─── Navigation ───────────────────────────────────────────────────────────────
const nav = [
  { href: "/", label: "Главная" },
  { href: "/about", label: "О специалисте" },
  { href: "/services", label: "Услуги" },
  { href: "/format", label: "Формат" },
  { href: "/faq", label: "FAQ" },
  { href: "/blog", label: "Блог" },
  { href: "/contacts", label: "Контакты" },
  { href: "/booking", label: "Запись" },
];

const legalNav = [
  { href: "/privacy", label: "Конфиденциальность" },
  { href: "/consent", label: "Согласие" },
  { href: "/terms", label: "Условия" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// Pages where sticky CTA should be hidden
const HIDE_CTA_PATHS = new Set([
  "/booking", "/booking/confirmed", "/privacy", "/consent", "/terms",
]);

const SITE_NAME = "Kairos — психологическая практика";

const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", "MedicalBusiness"],
  name: "Kairos Therapy OÜ",
  alternateName: SITE_NAME,
  url: baseUrl,
  telephone: "+3725398003",
  email: "info@kairos.ee",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Tatari 56-308",
    addressLocality: "Tallinn",
    postalCode: "10134",
    addressCountry: "EE",
  },
  geo: { "@type": "GeoCoordinates", latitude: 59.4336, longitude: 24.7484 },
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    opens: "09:00",
    closes: "20:00",
  },
  priceRange: "25–90 €",
  currenciesAccepted: "EUR",
  paymentAccepted: "Bank transfer",
  inLanguage: "ru",
  founder: {
    "@type": "Person",
    name: "Viktor Stoljarov",
    jobTitle: "Psychologist, Existential Therapist",
  },
};

const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Столяров Виктор",
  alternateName: "Viktor Stoljarov",
  jobTitle: "Психолог, экзистенциальный терапевт",
  worksFor: { "@type": "Organization", name: "Kairos Therapy OÜ" },
  address: { "@type": "PostalAddress", addressLocality: "Tallinn", addressCountry: "EE" },
  telephone: "+3725398003",
  email: "info@kairos.ee",
  alumniOf: [
    { "@type": "CollegeOrUniversity", name: "Московский городской психолого-педагогический университет (МГППУ)" },
    { "@type": "EducationalOrganization", name: "Институт гуманистической и экзистенциальной психологии и психотерапии" },
  ],
  knowsAbout: ["Экзистенциальный анализ", "Дазайн-терапия", "Психологическое консультирование", "Групповая терапия"],
};

function meta(title, description, pathName, extras = {}) {
  return {
    title,
    description,
    canonical: `${baseUrl}${pathName}`,
    ogTitle: title,
    ogDescription: description,
    ogUrl: `${baseUrl}${pathName}`,
    ogType: "website",
    currentPath: pathName,
    ...extras,
  };
}

function render(res, view, options = {}) {
  const pathName = options.page?.currentPath || "";
  res.render(view, {
    nav,
    legalNav,
    baseUrl,
    hideCta: HIDE_CTA_PATHS.has(pathName),
    ...options,
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
});

app.get("/sitemap.xml", (req, res) => {
  const now = new Date().toISOString().split("T")[0];
  const urls = [
    "/", "/about", "/about/approach", "/about/boundaries",
    "/services", "/services/individual", "/services/group", "/services/family",
    "/format", "/faq", "/contacts", "/booking",
    "/blog", "/topics",
    "/privacy", "/consent", "/terms",
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
      "/",
      { ogImage: `${baseUrl}/office.webp` }
    ),
    faq,
    schema: localBusinessSchema,
  });
});

app.get("/about", (req, res) => {
  render(res, "pages/about", {
    page: meta(
      "О специалисте — Столяров Виктор",
      "Психолог, экзистенциальный терапевт. Частная практика в Таллине с 2011 года. МГППУ, дазайн-анализ, 14+ лет опыта.",
      "/about",
      { ogImage: `${baseUrl}/viktor.webp` }
    ),
    schema: personSchema,
  });
});

app.get("/about/approach", (req, res) => {
  render(res, "pages/approach", {
    page: meta("Подход — экзистенциальный анализ", "Дазайн-анализ и экзистенциальная терапия: как устроена работа, принципы и для кого подходит.", "/about/approach"),
  });
});

app.get("/about/boundaries", (req, res) => {
  render(res, "pages/boundaries", {
    page: meta("Границы и безопасность", "Конфиденциальность, рамки и правила взаимодействия.", "/about/boundaries"),
  });
});

app.get("/services", (req, res) => {
  render(res, "pages/services", {
    page: meta("Услуги — цены и форматы", "Индивидуальная терапия 60 €, групповая 25 €, семейный приём 90 €. Онлайн и очно в Таллине.", "/services"),
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
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  render(res, "pages/faq", {
    page: meta("FAQ — частые вопросы", "Ответы на частые вопросы перед первой записью к психологу в Таллине.", "/faq"),
    faq,
    schema: faqSchema,
  });
});

app.get("/contacts", (req, res) => {
  render(res, "pages/contacts", {
    page: meta("Контакты — Kairos", "Таллин, Татари 56, кабинет 308. Email: info@kairos.ee, Telegram: @Vitutas, тел. +372 539 8003.", "/contacts"),
  });
});

app.get("/booking", (req, res) => {
  render(res, "pages/booking", {
    page: meta("Запись на приём", "Запись на первую встречу к психологу в Таллине. Онлайн или очно.", "/booking"),
    errors: {},
    values: {},
  });
});

app.post("/booking", bookingLimiter, async (req, res, next) => {
  const values = {
    name: sanitize(req.body.name),
    contact: sanitize(req.body.contact),
    message: sanitize(req.body.message),
    format: sanitize(req.body.format),
    consent: req.body.consent,
    website: sanitize(req.body.website),
  };

  const errors = {};
  if (values.website) errors.form = "Некорректная отправка формы.";
  if (!values.name) errors.name = "Укажите имя или псевдоним.";
  if (!values.contact) errors.contact = "Укажите email или телефон/мессенджер.";
  if (!values.format) errors.format = "Выберите предпочтительный формат.";
  if (!values.consent) errors.consent = "Подтвердите согласие на обработку данных.";

  if (Object.keys(errors).length > 0) {
    return render(res.status(400), "pages/booking", {
      page: meta("Запись на приём", "Запись на первую встречу.", "/booking"),
      errors,
      values,
    });
  }

  // Send email (non-blocking — don't fail booking if email fails)
  try {
    await sendBookingEmails(values);
  } catch (err) {
    console.error("[booking] email error:", err.message);
  }

  // Protect /booking/confirmed — only accessible after this POST
  req.session.bookingDone = true;
  req.session.bookingFormat = values.format;

  return res.redirect("/booking/confirmed");
});

app.get("/booking/confirmed", (req, res) => {
  if (!req.session.bookingDone) {
    return res.redirect("/booking");
  }
  const selectedFormat = sanitize(req.session.bookingFormat || "онлайн");
  req.session.bookingDone = false; // consume once
  render(res, "pages/confirmed", {
    page: meta("Заявка отправлена", "Ваша заявка получена. Мы свяжемся с вами для подтверждения.", "/booking/confirmed"),
    selectedFormat,
  });
});

app.get("/privacy", (req, res) => {
  render(res, "pages/privacy", {
    page: meta("Политика конфиденциальности", "Обработка персональных данных в соответствии с GDPR (ЕС 2016/679).", "/privacy"),
  });
});

app.get("/consent", (req, res) => {
  render(res, "pages/consent", {
    page: meta("Согласие на обработку данных", "Согласие субъекта данных согласно GDPR и Закону о защите данных Эстонии.", "/consent"),
  });
});

app.get("/terms", (req, res) => {
  render(res, "pages/terms", {
    page: meta("Условия оплаты и отмены", "Организационные условия: оплата, перенос и отмена встреч. Kairos Therapy OÜ.", "/terms"),
  });
});

app.get("/blog", (req, res) => {
  render(res, "pages/blog", {
    page: meta("Блог — психология и терапия", "Статьи о первой встрече с психологом, экзистенциальном анализе и формате работы.", "/blog"),
    posts,
  });
});

app.get("/blog/:slug", (req, res, next) => {
  const post = posts.find((p) => p.slug === req.params.slug);
  if (!post) return next();
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    url: `${baseUrl}/blog/${post.slug}`,
    inLanguage: "ru",
    author: { "@type": "Person", name: "Столяров Виктор" },
    publisher: { "@type": "Organization", name: "Kairos Therapy OÜ", url: baseUrl },
  };
  render(res, "pages/post", {
    page: meta(post.title, post.excerpt, `/blog/${post.slug}`, { ogType: "article" }),
    post,
    posts,
    topics,
    schema: articleSchema,
  });
});

app.get("/topics", (req, res) => {
  render(res, "pages/topics", {
    page: meta("Темы работы", "Тревога, сложности в отношениях, экзистенциальные кризисы — основные темы психологической практики.", "/topics"),
    topics,
  });
});

app.get("/topics/:slug", (req, res, next) => {
  const topic = topics.find((t) => t.slug === req.params.slug);
  if (!topic) return next();
  render(res, "pages/topic", {
    page: meta(topic.title, topic.excerpt, `/topics/${topic.slug}`),
    topic,
    topics,
    posts,
  });
});

// ─── Error handlers ───────────────────────────────────────────────────────────
app.use((req, res) => {
  render(res.status(404), "pages/not-found", {
    page: meta("Страница не найдена", "Запрошенная страница не найдена.", req.path),
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[error]", err.stack || err.message);
  res.status(500).render("pages/500", {
    nav,
    legalNav,
    baseUrl,
    hideCta: true,
    page: meta("Ошибка сервера", "Что-то пошло не так. Попробуйте позже.", req.path),
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
