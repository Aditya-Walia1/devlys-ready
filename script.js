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
    navLinks?.classList.toggle('active');
  });

  // Close mobile menu after clicking a nav link
  navLinks?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('active');
    });
  });

  // Netlify form submission
  contactForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!contactForm.checkValidity()) {
      contactForm.reportValidity();
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';
    }

    if (formNote) {
      formNote.textContent = '';
      formNote.classList.remove('error');
    }

    try {
      const formData = new FormData(contactForm);

      const response = await fetch('/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(formData).toString(),
      });

      if (!response.ok) {
        throw new Error(`Form submission failed: ${response.status}`);
      }

      if (formNote) {
        formNote.textContent =
          'Thanks! Your project brief has been sent. We’ll get back to you soon.';
      }

      contactForm.reset();
    } catch (error) {
      console.error('Netlify form error:', error);

      if (formNote) {
        formNote.textContent =
          'Something went wrong. Please try again or contact us by email.';
        formNote.classList.add('error');
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Send Project Brief';
      }
    }
  });
});