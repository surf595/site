const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { baseUrl, services, faq, faqSections, posts, topics } = require("./content/site");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PRACTICE_EMAIL = "info@kairos.ee";
const SENDMAIL_PATH = process.env.SENDMAIL_PATH || "/usr/sbin/sendmail";
const BOOKING_RETURN_HREF = "/booking#booking-form";
const BOOKING_TIMEZONE = "Europe/Tallinn";

app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: false }));

app.use(
  helmet({
    contentSecurityPolicy: false,
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
  { href: "/faq", label: "FAQ" },
  { href: "/contacts", label: "Контакты" },
  { href: "/booking", label: "Запись" },
];

const legalNav = [
  { href: "/privacy", label: "Конфиденциальность" },
  { href: "/consent", label: "Согласие" },
  { href: "/terms", label: "Условия" },
];

const bookingDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  weekday: "short",
  day: "numeric",
  month: "long",
  timeZone: BOOKING_TIMEZONE,
});

const bookingTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: BOOKING_TIMEZONE,
});

function pad(value) {
  return String(value).padStart(2, "0");
}

function createBookingSlot(start) {
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 50);

  const dayLabel = bookingDateFormatter.format(start).replace(/\.$/, "");
  const timeLabel = bookingTimeFormatter.format(start);

  return {
    id: `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}-${pad(start.getHours())}${pad(start.getMinutes())}`,
    dayLabel,
    timeLabel,
    label: `${dayLabel} · ${timeLabel}`,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function buildBookingSlots(reference = new Date()) {
  const slots = [];
  const cursor = new Date(reference);
  cursor.setHours(0, 0, 0, 0);
  const weekdayTemplates = [
    { hour: 10, minute: 0 },
    { hour: 13, minute: 30 },
    { hour: 17, minute: 30 },
  ];
  const saturdayTemplates = [
    { hour: 11, minute: 0 },
    { hour: 13, minute: 0 },
  ];

  while (slots.length < 6) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day === 0) continue;

    const templates = day === 6 ? saturdayTemplates : weekdayTemplates;

    templates.forEach((template) => {
      if (slots.length >= 6) return;

      const start = new Date(cursor);
      start.setHours(template.hour, template.minute, 0, 0);
      if (start <= reference) return;
      slots.push(createBookingSlot(start));
    });
  }

  return slots;
}

function getBookingSlotById(slotId) {
  return buildBookingSlots().find((slot) => slot.id === slotId) || null;
}

function parseIsoDate(value) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatHumanSlot(start, fallbackLabel = "") {
  const date = parseIsoDate(start);
  if (!date) return fallbackLabel || "Время будет подтверждено отдельно";
  return `${bookingDateFormatter.format(date).replace(/\.$/, "")} · ${bookingTimeFormatter.format(date)}`;
}

function formatIcsDate(value) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function resolveStickyCta(pathName) {
  if (pathName === "/booking") return null;
  if (["/privacy", "/consent", "/terms"].includes(pathName)) {
    return { href: BOOKING_RETURN_HREF, label: "Вернуться к записи" };
  }
  return { href: BOOKING_RETURN_HREF, label: "Записаться" };
}

function meta(title, description, pathName) {
  return {
    title,
    description,
    currentPath: pathName,
    canonical: `${baseUrl}${pathName}`,
    ogTitle: title,
    ogDescription: description,
    ogUrl: `${baseUrl}${pathName}`,
  };
}

function render(res, view, options = {}) {
  const currentPath = options.page && options.page.currentPath ? options.page.currentPath : "";
  res.render(view, {
    nav,
    legalNav,
    baseUrl,
    bookingReturnHref: BOOKING_RETURN_HREF,
    stickyCta: options.stickyCta === undefined ? resolveStickyCta(currentPath) : options.stickyCta,
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
    bookingSlots: buildBookingSlots(),
    bookingLegalLinks: [
      { href: "/privacy?from=booking", label: "Конфиденциальность" },
      { href: "/consent?from=booking", label: "Согласие" },
      { href: "/terms?from=booking", label: "Условия" },
      { href: "/about/boundaries?from=booking", label: "Границы" },
    ],
    stickyCta: null,
    ...options,
  });
}

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
});

app.get("/sitemap.xml", (req, res) => {
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
    "/booking/confirmed",
    "/privacy",
    "/consent",
    "/terms",
    "/blog",
    ...posts.map((x) => `/blog/${x.slug}`),
    ...topics.map((x) => `/topics/${x.slug}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((u) => `<url><loc>${baseUrl}${u}</loc></url>`)
    .join("")}</urlset>`;
  res.type("application/xml").send(xml);
});

app.get("/", (req, res) => {
  render(res, "pages/home", {
    page: meta(
      "Психологическая практика — бережная индивидуальная работа",
      "Русскоязычная психологическая практика: ясный формат, конфиденциальность и спокойный путь к записи.",
      "/"
    ),
    faq,
    topics,
  });
});

app.get("/about", (req, res) => {
  render(res, "pages/about", {
    page: meta("О специалисте", "Подход, квалификация, границы и формат работы.", "/about"),
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
    cameFromBooking: req.query.from === "booking",
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
    faqSections,
  });
});

app.get("/contacts", (req, res) => {
  renderContactsPage(res, {
    sent: req.query.sent === "1",
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
    `Предпочтительный слот: ${values.slotLabel}`,
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
  const values = {
    name: sanitize(req.body.name),
    contact: sanitize(req.body.contact),
    message: sanitize(req.body.message, 4000),
    format: sanitize(req.body.format),
    slot: sanitize(req.body.slot),
    consent: req.body.consent,
    website: sanitize(req.body.website),
  };

  const errors = {};
  const selectedSlot = getBookingSlotById(values.slot);
  if (values.website) {
    errors.form = "Некорректная отправка формы.";
  }
  if (!values.name) errors.name = "Укажите имя или псевдоним.";
  if (!values.contact) errors.contact = "Укажите email или телефон/мессенджер.";
  if (!values.format) errors.format = "Выберите предпочтительный формат.";
  if (!selectedSlot) errors.slot = "Выберите удобный слот для первой встречи.";
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
      text: bookingEmailText({
        ...values,
        slotLabel: selectedSlot.label,
      }),
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

  const confirmedParams = new URLSearchParams({
    format: values.format,
    slot: selectedSlot.label,
    start: selectedSlot.startIso,
    end: selectedSlot.endIso,
  });

  return res.redirect(`/booking/confirmed?${confirmedParams.toString()}`);
});

app.get("/booking/confirmed", (req, res) => {
  const slotLabel = sanitize(req.query.slot, 200);
  const slotStart = sanitize(req.query.start, 80);
  const slotEnd = sanitize(req.query.end, 80);
  const hasValidSlot = parseIsoDate(slotStart) && parseIsoDate(slotEnd);
  const calendarParams = hasValidSlot
    ? new URLSearchParams({
        start: slotStart,
        end: slotEnd,
        format: sanitize(req.query.format, 40) || "онлайн",
      }).toString()
    : "";

  render(res, "pages/confirmed", {
    page: meta("Подтверждение записи", "Запись отправлена. Что дальше и как подготовиться.", "/booking/confirmed"),
    selectedFormat: req.query.format || "онлайн",
    selectedSlot: formatHumanSlot(slotStart, slotLabel),
    calendarUrl: calendarParams ? `/booking/calendar.ics?${calendarParams}` : "",
  });
});

app.get("/booking/calendar.ics", (req, res) => {
  const start = sanitize(req.query.start, 80);
  const end = sanitize(req.query.end, 80);
  const format = sanitize(req.query.format, 40) || "онлайн";
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);

  if (!startDate || !endDate || endDate <= startDate) {
    return res.status(400).type("text/plain").send("Некорректный слот для календаря.");
  }

  const summary =
    format === "очно" ? "Первая встреча — очно в Kairos Therapy" : "Первая встреча — онлайн в Kairos Therapy";
  const location = format === "очно" ? "Tatari tn 56-308, 10134 Tallinn" : "Онлайн";
  const description = [
    "Предварительно выбранный слот после записи с сайта Kairos Therapy.",
    "Точное подтверждение времени приходит отдельным сообщением.",
    "Если нужен перенос или отмена, откройте kairos.ee/terms.",
  ].join(" ");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kairos Therapy//Booking//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:kairos-${formatIcsDate(start)}@kairos.ee`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  res.type("text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="kairos-booking-slot.ics"');
  return res.send(ics);
});

app.get("/privacy", (req, res) => {
  render(res, "pages/privacy", {
    page: meta("Политика конфиденциальности", "Обработка и хранение персональных данных.", "/privacy"),
    cameFromBooking: req.query.from === "booking",
  });
});

app.get("/consent", (req, res) => {
  render(res, "pages/consent", {
    page: meta(
      "Информированное согласие",
      "Условия первичного обращения, конфиденциальности и организационной коммуникации до начала терапии.",
      "/consent"
    ),
    cameFromBooking: req.query.from === "booking",
  });
});

app.get("/terms", (req, res) => {
  render(res, "pages/terms", {
    page: meta("Условия оплаты и отмены", "Организационные условия: оплата, перенос и отмена встреч.", "/terms"),
    cameFromBooking: req.query.from === "booking",
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

app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
});
