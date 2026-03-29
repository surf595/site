// Mobile menu toggle
const toggle = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-main-nav]');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const opened = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(opened));
  });
  // Close menu on nav link click (mobile)
  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// Booking form — disable all fields on submit
const bookingForm = document.querySelector('form[action="/booking"]');
if (bookingForm) {
  bookingForm.addEventListener('submit', () => {
    const btn = bookingForm.querySelector('button[type="submit"]');
    const inputs = bookingForm.querySelectorAll('input, select, textarea, button');
    inputs.forEach((el) => { el.disabled = true; });
    if (btn) btn.textContent = 'Отправляем…';
  });
}
