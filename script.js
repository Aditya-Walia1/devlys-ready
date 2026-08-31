document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.getElementById('navbar');
  const menuBtn = document.getElementById('menuBtn');
  const navLinks = document.getElementById('navLinks');

  const contactForm = document.getElementById('contactForm');
  const formNote = document.getElementById('formNote');
  const submitButton = document.getElementById('submitButton');
  const serviceSelect = contactForm?.querySelector('select[name="service"]');

  const ratingButtons = document.querySelectorAll('[data-rating]');
  const topicButtons = document.querySelectorAll('[data-topic]');
  const reviewQuestions = document.getElementById('reviewQuestions');
  const reviewResult = document.getElementById('reviewResult');
  const reviewDetails = document.getElementById('reviewDetails');
  const reviewDraft = document.getElementById('reviewDraft');
  const generateReview = document.getElementById('generateReview');
  const copyReview = document.getElementById('copyReview');
  const resetReview = document.getElementById('resetReview');
  const demoStatus = document.getElementById('demoStatus');
  const copyStatus = document.getElementById('copyStatus');

  let selectedRating = 0;
  const selectedTopics = new Set();

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

  // Pre-select the relevant service when a product CTA is used.
  document.querySelectorAll('[data-service]').forEach((link) => {
    link.addEventListener('click', () => {
      if (serviceSelect) {
        serviceSelect.value = link.dataset.service ?? '';
      }
    });
  });

  // Smart Review QR demo: every draft is based on feedback the visitor supplies.
  ratingButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedRating = Number(button.dataset.rating);

      ratingButtons.forEach((ratingButton) => {
        const isActive = Number(ratingButton.dataset.rating) <= selectedRating;
        ratingButton.classList.toggle('is-active', isActive);
        ratingButton.setAttribute(
          'aria-pressed',
          String(Number(ratingButton.dataset.rating) === selectedRating),
        );
      });

      if (demoStatus) {
        demoStatus.textContent = '';
      }
    });
  });

  topicButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const topic = button.dataset.topic;

      if (!topic) {
        return;
      }

      if (selectedTopics.has(topic)) {
        selectedTopics.delete(topic);
      } else {
        selectedTopics.add(topic);
      }

      const isSelected = selectedTopics.has(topic);
      button.classList.toggle('is-active', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));

      if (demoStatus) {
        demoStatus.textContent = '';
      }
    });
  });

  const topicPhrases = {
    food: 'food',
    service: 'service',
    ambience: 'ambience',
    value: 'value for money',
  };

  const formatList = (items) => {
    if (items.length <= 1) {
      return items[0] ?? '';
    }

    if (items.length === 2) {
      return `${items[0]} and ${items[1]}`;
    }

    return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
  };

  const buildReviewDraft = () => {
    const highlights = [...selectedTopics]
      .map((topic) => topicPhrases[topic])
      .filter(Boolean);
    const detail = reviewDetails?.value.trim() ?? '';
    const highlightText = formatList(highlights);

    const topicSentences = {
      1: `${highlightText || 'The overall experience'} did not meet my expectations.`,
      2: `${highlightText || 'The overall experience'} needs more consistency.`,
      3: `${highlightText || 'The visit'} left me with a mixed impression.`,
      4: `${highlightText || 'The overall experience'} was a strong part of the visit.`,
      5: `I especially appreciated ${highlightText || 'the care put into the experience'}.`,
    };
    const closings = {
      1: 'I hope the team addresses these points for future customers.',
      2: 'There is clear room to improve before I would return.',
      3: 'A few focused improvements would make the next visit stronger.',
      4: 'I would return and expect the experience to become even better.',
      5: 'The visit felt personal and worth repeating.',
    };
    const lowerDetail = detail.charAt(0).toLowerCase() + detail.slice(1);
    const cleanDetail = /[.!?]$/.test(lowerDetail) ? lowerDetail : `${lowerDetail}.`;
    const sentences = [`At Saffron Table, ${cleanDetail}`, topicSentences[selectedRating]];
    sentences.push(closings[selectedRating]);

    return sentences.join(' ');
  };

  generateReview?.addEventListener('click', () => {
    const hasExperienceInput = (reviewDetails?.value.trim().length ?? 0) >= 10;

    if (!selectedRating) {
      if (demoStatus) {
        demoStatus.textContent = 'Choose a star rating to continue.';
      }
      ratingButtons[0]?.focus();
      return;
    }

    if (!hasExperienceInput) {
      if (demoStatus) {
        demoStatus.textContent =
          'Add one specific moment from your visit (at least 10 characters).';
      }
      reviewDetails?.focus();
      return;
    }

    if (reviewDraft) {
      reviewDraft.value = buildReviewDraft();
    }

    if (reviewQuestions && reviewResult) {
      reviewQuestions.hidden = true;
      reviewResult.hidden = false;
      reviewDraft?.focus();
    }
  });

  copyReview?.addEventListener('click', async () => {
    const draft = reviewDraft?.value.trim() ?? '';

    if (!draft) {
      return;
    }

    try {
      await navigator.clipboard.writeText(draft);

      if (copyStatus) {
        copyStatus.textContent =
          'Draft copied. In the real flow, Google Reviews opens next.';
      }

      copyReview.textContent = 'Copied ✓';
    } catch {
      reviewDraft?.select();

      if (copyStatus) {
        copyStatus.textContent = 'Select the text and copy your draft.';
      }
    }
  });

  resetReview?.addEventListener('click', () => {
    selectedRating = 0;
    selectedTopics.clear();

    ratingButtons.forEach((button) => {
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
    });

    topicButtons.forEach((button) => {
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
    });

    if (reviewDetails) {
      reviewDetails.value = '';
    }

    if (reviewDraft) {
      reviewDraft.value = '';
    }

    if (copyReview) {
      copyReview.innerHTML = 'Copy review draft <span aria-hidden="true">↗</span>';
    }

    if (copyStatus) {
      copyStatus.textContent = '';
    }

    if (demoStatus) {
      demoStatus.textContent = '';
    }

    if (reviewQuestions && reviewResult) {
      reviewResult.hidden = true;
      reviewQuestions.hidden = false;
      ratingButtons[0]?.focus();
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
