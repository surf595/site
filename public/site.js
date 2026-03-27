const toggle = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-main-nav]');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const opened = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(opened));
  });
}
