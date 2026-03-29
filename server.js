const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { baseUrl, services, faq, faqSections, posts, topics } = require("./content/site");

const app = express();
const PORT = process.env.PORT || 3000;
const PRACTICE_EMAIL = "info@kairos.ee";
const SENDMAIL_PATH = process.env.SENDMAIL_PATH || "/usr/sbin/sendmail";

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

const contactLimiter = rateLimit({
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

function renderContactsPage(res, options = {}) {
  render(res, "pages/contacts", {
    page: meta("Контакты", "Альтернативный способ связи и организационные вопросы.", "/contacts"),
    errors: {},
    values: {},
    sent: false,
    ...options,
  });
}

function renderBookingPage(res, options = {}) {
  render(res, "pages/booking", {
    page: meta("Запись", "Запись на первую встречу с минимальным количеством полей.", "/booking"),
    errors: {},
    values: {},
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
    ...services.map((service) => `/services/${service.slug}`),
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
    topics,
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
    faqSections,
    schema: faqSchema,
  });
});

app.get("/contacts", (req, res) => {
  renderContactsPage(res, {
    sent: req.query.sent === "1",
  render(res, "pages/contacts", {
    page: meta("Контакты — Kairos", "Таллин, Татари 56, кабинет 308. Email: info@kairos.ee, Telegram: @Vitutas, тел. +372 539 8003.", "/contacts"),
  });
});

app.get("/booking", (req, res) => {
  renderBookingPage(res);
});

function sanitize(v, max = 1000) {
  return String(v || "").trim().slice(0, max);
}

function sanitizeHeaderValue(v) {
  return String(v || "").replace(/[\r\n]+/g, " ").trim();
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

function encodeHeader(v) {
  return `=?UTF-8?B?${Buffer.from(sanitizeHeaderValue(v), "utf8").toString("base64")}?=`;
}

function sendEmail({ subject, text, replyTo }) {
  return new Promise((resolve, reject) => {
    const process = spawn(SENDMAIL_PATH, ["-t", "-i"]);
    let stderr = "";
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const timeout = setTimeout(() => {
      process.kill("SIGTERM");
      finish(new Error("sendmail timed out"));
    }, 10000);

    process.on("error", (error) => finish(error));
    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    process.on("close", (code) => {
      if (code === 0) {
        finish();
        return;
      }
      finish(new Error(stderr.trim() || `sendmail exited with code ${code}`));
    });

    const headers = [
      `To: ${PRACTICE_EMAIL}`,
      `From: Kairos Therapy <${PRACTICE_EMAIL}>`,
      replyTo ? `Reply-To: ${sanitizeHeaderValue(replyTo)}` : "",
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      text,
    ]
      .filter(Boolean)
      .join("\n");

    process.stdin.end(headers);
  });
}

function bookingEmailText(values) {
  return [
    "Новая запись с сайта kairos.ee",
    "",
    `Имя или псевдоним: ${values.name}`,
    `Контакт: ${values.contact}`,
    `Формат: ${values.format}`,
    "",
    "Комментарий:",
    values.message || "Не указан",
  ].join("\n");
}

function contactEmailText(values) {
  return [
    "Новое сообщение из формы контактов kairos.ee",
    "",
    `Имя: ${values.name}`,
    `Email: ${values.email}`,
    "",
    "Сообщение:",
    values.message,
  ].join("\n");
}

app.post("/contacts", contactLimiter, async (req, res) => {
  const values = {
    name: sanitize(req.body.name),
    email: sanitize(req.body.email),
    message: sanitize(req.body.message, 4000),
    website: sanitize(req.body.website),
  };

  const errors = {};
  if (values.website) {
    errors.form = "Некорректная отправка формы.";
  }
  if (!values.name) errors.name = "Укажите имя.";
  if (!values.email) errors.email = "Укажите email.";
  if (values.email && !isEmail(values.email)) errors.email = "Укажите корректный email.";
  if (!values.message) errors.message = "Напишите сообщение.";

  if (Object.keys(errors).length > 0) {
    return renderContactsPage(res.status(400), {
      errors,
      values,
    });
  }

  try {
    await sendEmail({
      subject: `Сообщение с сайта от ${values.name}`,
      text: contactEmailText(values),
      replyTo: values.email,
    });
  } catch (error) {
    console.error("Contacts email delivery failed:", error);
    return renderContactsPage(res.status(500), {
      errors: {
        form: `Не удалось отправить сообщение. Напишите напрямую на ${PRACTICE_EMAIL} или позвоните по телефону +372 509 3008.`,
      },
      values,
    });
  }

  return res.redirect("/contacts?sent=1");
});

app.post("/booking", bookingLimiter, async (req, res) => {
app.post("/booking", bookingLimiter, (req, res) => {
  const values = {
    name: sanitize(req.body.name),
    contact: sanitize(req.body.contact),
    message: sanitize(req.body.message, 4000),
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
    return renderBookingPage(res.status(400), {
      errors,
      values,
    });
  }

  try {
    await sendEmail({
      subject: `Новая запись с сайта: ${values.name}`,
      text: bookingEmailText(values),
      replyTo: isEmail(values.contact) ? values.contact : "",
    });
  } catch (error) {
    console.error("Booking email delivery failed:", error);
    return renderBookingPage(res.status(500), {
      errors: {
        form: `Не удалось отправить заявку. Напишите напрямую на ${PRACTICE_EMAIL} или позвоните по телефону +372 509 3008.`,
      },
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
    page: meta(
      "Информированное согласие",
      "Условия первичного обращения, конфиденциальности и организационной коммуникации до начала терапии.",
      "/consent"
    ),
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
    page: meta(topic.title, topic.cardExcerpt || topic.heroExcerpt, `/topics/${topic.slug}`),
    topic,
    topics,
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
