const toggle = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-main-nav]');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const opened = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(opened));
  });
}

const bookingForm = document.querySelector('form[action="/booking"]');
if (bookingForm) {
  bookingForm.addEventListener('submit', () => {
    const btn = bookingForm.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Отправляем…';
    }
  });
}
