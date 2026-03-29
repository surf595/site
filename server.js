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

const SITE_NAME = "Kairos — психологическая практика";

const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", "MedicalBusiness"],
  name: "Kairos Therapy OÜ",
  alternateName: "Kairos — психологическая практика",
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
  geo: {
    "@type": "GeoCoordinates",
    latitude: 59.4336,
    longitude: 24.7484,
  },
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
    sameAs: [],
  },
};

const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Столяров Виктор",
  alternateName: "Viktor Stoljarov",
  jobTitle: "Психолог, экзистенциальный терапевт",
  worksFor: { "@type": "Organization", name: "Kairos Therapy OÜ" },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Tallinn",
    addressCountry: "EE",
  },
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
      "/",
      { ogImage: `${baseUrl}/office.jpg` }
    ),
    faq,
    schema: localBusinessSchema,
  });
});

app.get("/about", (req, res) => {
  render(res, "pages/about", {
    page: meta("О специалисте — Столяров Виктор", "Психолог, экзистенциальный терапевт. Частная практика в Таллине с 2011 года. МГППУ, дазайн-анализ, 14+ лет опыта.", "/about", { ogImage: `${baseUrl}/viktor.jpg` }),
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
    page: meta("FAQ", "Ответы на частые вопросы перед первой записью.", "/faq"),
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
    schema: articleSchema,
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
