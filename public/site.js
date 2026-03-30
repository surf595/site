const toggle = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-main-nav]');
const scrim = document.querySelector('[data-menu-scrim]');
if (toggle && nav) {
  const toggleLabel = toggle.querySelector('[data-menu-toggle-label]');
  const syncMenuState = (opened) => {
    nav.classList.toggle('open', opened);
    toggle.setAttribute('aria-expanded', String(opened));
    toggle.setAttribute('aria-label', opened ? 'Закрыть меню' : 'Открыть меню');
    document.body.classList.toggle('nav-open', opened);

    if (scrim) {
      scrim.classList.toggle('is-visible', opened);
      scrim.setAttribute('aria-hidden', String(!opened));
    }

    if (toggleLabel) {
      toggleLabel.textContent = opened ? 'Закрыть' : 'Меню';
    }
  };

  const closeMenu = () => {
    syncMenuState(false);
  };

  toggle.addEventListener('click', () => {
    syncMenuState(toggle.getAttribute('aria-expanded') !== 'true');
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

  if (scrim) {
    scrim.addEventListener('click', closeMenu);
  }

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

  syncMenuState(false);
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
