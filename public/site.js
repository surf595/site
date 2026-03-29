const toggle = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-main-nav]');
if (toggle && nav) {
  const closeMenu = () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => {
    const opened = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(opened));
  });

  document.addEventListener('click', (event) => {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  const desktopBreakpoint = window.matchMedia('(min-width: 980px)');
  const handleBreakpointChange = (event) => {
    if (event.matches) {
      closeMenu();
    }
  };

  if (typeof desktopBreakpoint.addEventListener === 'function') {
    desktopBreakpoint.addEventListener('change', handleBreakpointChange);
  } else if (typeof desktopBreakpoint.addListener === 'function') {
    desktopBreakpoint.addListener(handleBreakpointChange);
  }
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
