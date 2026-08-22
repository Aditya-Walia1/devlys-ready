document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.getElementById('navbar');
  const menuBtn = document.getElementById('menuBtn');
  const navLinks = document.getElementById('navLinks');
  const contactForm = document.getElementById('contactForm');
  const formNote = document.getElementById('formNote');
  const year = document.getElementById('year');

  if (year) year.textContent = new Date().getFullYear();

  window.addEventListener('scroll', () => {
    navbar?.classList.toggle('scrolled', window.scrollY > 12);
  });

  menuBtn?.addEventListener('click', () => {
    navLinks?.classList.toggle('active');
  });

  navLinks?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => navLinks.classList.remove('active'));
  });

  contactForm?.addEventListener('submit', () => {
    if (formNote) formNote.textContent = 'Thanks — your project brief is ready to be submitted.';
  });
});
