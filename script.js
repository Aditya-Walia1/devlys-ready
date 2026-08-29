document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.getElementById('navbar');
  const menuBtn = document.getElementById('menuBtn');
  const navLinks = document.getElementById('navLinks');

  const contactForm = document.getElementById('contactForm');
  const formNote = document.getElementById('formNote');
  const submitButton = document.getElementById('submitButton');

  const year = document.getElementById('year');

  // Current year
  if (year) {
    year.textContent = new Date().getFullYear();
  }

  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    navbar?.classList.toggle('scrolled', window.scrollY > 12);
  });

  // Mobile menu toggle
  menuBtn?.addEventListener('click', () => {
    const isOpen = navLinks?.classList.toggle('active') ?? false;

    menuBtn.setAttribute('aria-expanded', String(isOpen));
    menuBtn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  });

  // Close mobile menu after clicking a nav link
  navLinks?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('active');
      menuBtn?.setAttribute('aria-expanded', 'false');
      menuBtn?.setAttribute('aria-label', 'Open menu');
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navLinks?.classList.contains('active')) {
      navLinks.classList.remove('active');
      menuBtn?.setAttribute('aria-expanded', 'false');
      menuBtn?.setAttribute('aria-label', 'Open menu');
      menuBtn?.focus();
    }
  });

  // Build a complete email draft without relying on a host-specific form service.
  contactForm?.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!contactForm.checkValidity()) {
      contactForm.reportValidity();
      return;
    }

    if (formNote) {
      formNote.textContent = '';
      formNote.classList.remove('error');
    }

    const formData = new FormData(contactForm);
    const name = String(formData.get('name') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const service = String(formData.get('service') ?? '').trim();
    const message = String(formData.get('message') ?? '').trim();

    const subject = `Project enquiry: ${service}`;
    const body = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Service: ${service}`,
      '',
      'Project brief:',
      message,
    ].join('\n');

    const mailto = new URL('mailto:hello@devlys.com');
    mailto.searchParams.set('subject', subject);
    mailto.searchParams.set('body', body);

    if (formNote) {
      formNote.textContent =
        'Your email draft is ready. Review it in your email app, then press Send.';
    }

    window.location.href = mailto.toString();
  });
});
