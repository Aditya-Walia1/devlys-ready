const ratingButtons = [...document.querySelectorAll('[data-app-rating]')];
const topicButtons = [...document.querySelectorAll('[data-app-topic]')];
const reviewForm = document.getElementById('customerReviewForm');
const formStatus = document.getElementById('customerFormStatus');
const reviewTitle = document.getElementById('reviewTitle');
const businessAddress = document.getElementById('businessAddress');
const businessMark = document.getElementById('businessMark');
const customerNote = document.getElementById('customerNote');
const draftResult = document.getElementById('draftResult');
const generatedDraft = document.getElementById('generatedDraft');
const copyAndContinue = document.getElementById('copyAndContinue');
const startOver = document.getElementById('startOver');
const draftStatus = document.getElementById('draftStatus');
const demoResultNote = document.getElementById('demoResultNote');
const reviewError = document.getElementById('reviewError');
const reviewErrorMessage = document.getElementById('reviewErrorMessage');
const progressOne = document.getElementById('progressOne');
const progressTwo = document.getElementById('progressTwo');

let rating = 0;
const topics = new Set();
let locationData = null;

const slugFromPath = window.location.pathname.startsWith('/r/')
  ? decodeURIComponent(window.location.pathname.slice(3))
  : '';
const slug = slugFromPath || new URLSearchParams(window.location.search).get('location') || 'demo';
const sessionId = sessionStorage.getItem('devlys-review-session') || crypto.randomUUID();
sessionStorage.setItem('devlys-review-session', sessionId);

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((word) => word[0]?.toUpperCase()).join('') || 'DR';
}

function localDemoDraft() {
  const phrases = {
    food: 'the quality of the food',
    service: 'the service',
    ambience: 'the ambience',
    value: 'the overall value',
  };
  const openings = {
    1: `Unfortunately, my experience at ${locationData.name} fell short of expectations.`,
    2: `My visit to ${locationData.name} had a few positives, but there were also important issues.`,
    3: `My experience at ${locationData.name} was mixed overall.`,
    4: `I had a good experience at ${locationData.name}.`,
    5: `I had a great experience at ${locationData.name}.`,
  };
  const closings = {
    1: 'I hope the team takes this feedback on board.',
    2: 'There is room to improve, and I hope my next visit is better.',
    3: 'With a few improvements, the experience could be even better.',
    4: 'I would be happy to visit again.',
    5: 'I would happily recommend it and visit again.',
  };
  const selected = [...topics].map((topic) => phrases[topic]);
  const sentences = [openings[rating]];
  if (selected.length) sentences.push(`What stood out to me was ${selected.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`);
  const note = customerNote.value.trim();
  if (note) sentences.push(/[.!?]$/.test(note) ? note : `${note}.`);
  sentences.push(closings[rating]);
  return sentences.join(' ');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Please try again.');
  return payload;
}

async function loadLocation() {
  try {
    const payload = await api(`/api/locations/${encodeURIComponent(slug)}`);
    locationData = payload.location;
  } catch (error) {
    if (slug !== 'demo') throw error;
    locationData = {
      slug: 'demo',
      name: 'Saffron Table',
      address: 'Connaught Place · New Delhi',
      brandColor: '#315efb',
      googleReviewUrl: null,
    };
  }

  reviewTitle.textContent = locationData.name;
  businessAddress.textContent = locationData.address;
  businessMark.textContent = initials(locationData.name);
  businessMark.style.background = locationData.brandColor || '#111827';
  reviewForm.hidden = false;

  api('/api/events', {
    method: 'POST',
    body: JSON.stringify({ slug, sessionId, eventType: 'scan' }),
  }).catch(() => {});
}

function showError(message) {
  reviewForm.hidden = true;
  draftResult.hidden = true;
  reviewError.hidden = false;
  reviewErrorMessage.textContent = message;
}

ratingButtons.forEach((button) => {
  button.addEventListener('click', () => {
    rating = Number(button.dataset.appRating);
    ratingButtons.forEach((candidate) => {
      const candidateRating = Number(candidate.dataset.appRating);
      candidate.classList.toggle('is-active', candidateRating <= rating);
      candidate.setAttribute('aria-pressed', String(candidateRating === rating));
    });
    formStatus.textContent = '';
  });
});

topicButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const topic = button.dataset.appTopic;
    if (!topic) return;
    topics.has(topic) ? topics.delete(topic) : topics.add(topic);
    const selected = topics.has(topic);
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
    formStatus.textContent = '';
  });
});

reviewForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!rating) {
    formStatus.textContent = 'Please choose a rating first.';
    ratingButtons[0]?.focus();
    return;
  }
  if (!topics.size && customerNote.value.trim().length < 10) {
    formStatus.textContent = 'Select what stood out or add one detail from your visit.';
    topicButtons[0]?.focus();
    return;
  }

  const submitButton = reviewForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = 'Creating your draft…';
  formStatus.textContent = '';

  try {
    let payload;
    try {
      payload = await api('/api/drafts', {
        method: 'POST',
        body: JSON.stringify({
          slug,
          sessionId,
          rating,
          topics: [...topics],
          note: customerNote.value.trim(),
        }),
      });
    } catch (error) {
      if (slug !== 'demo') throw error;
      payload = { draft: localDemoDraft(), googleReviewUrl: null, engine: 'demo' };
    }

    generatedDraft.value = payload.draft;
    locationData.googleReviewUrl = payload.googleReviewUrl;
    reviewForm.hidden = true;
    draftResult.hidden = false;
    progressOne.classList.remove('is-current');
    progressTwo.classList.add('is-current');
    demoResultNote.hidden = Boolean(payload.googleReviewUrl);
    copyAndContinue.firstChild.textContent = payload.googleReviewUrl
      ? 'Copy and continue to Google '
      : 'Copy review draft ';
    generatedDraft.focus();
  } catch (error) {
    formStatus.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Create my editable draft <span aria-hidden="true">→</span>';
  }
});

copyAndContinue?.addEventListener('click', async () => {
  const draft = generatedDraft.value.trim();
  if (!draft) return;
  try {
    await navigator.clipboard.writeText(draft);
    if (locationData.googleReviewUrl) {
      draftStatus.textContent = 'Draft copied. Opening Google Reviews…';
      api('/api/events', {
        method: 'POST',
        body: JSON.stringify({ slug, sessionId, eventType: 'google_open' }),
      }).catch(() => {});
      window.setTimeout(() => {
        window.location.assign(locationData.googleReviewUrl);
      }, 350);
    } else {
      draftStatus.textContent = 'Draft copied. Demo complete.';
    }
  } catch {
    generatedDraft.select();
    draftStatus.textContent = 'Select the text and copy your draft before continuing.';
  }
});

startOver?.addEventListener('click', () => {
  rating = 0;
  topics.clear();
  customerNote.value = '';
  generatedDraft.value = '';
  draftStatus.textContent = '';
  ratingButtons.forEach((button) => {
    button.classList.remove('is-active');
    button.setAttribute('aria-pressed', 'false');
  });
  topicButtons.forEach((button) => {
    button.classList.remove('is-active');
    button.setAttribute('aria-pressed', 'false');
  });
  draftResult.hidden = true;
  reviewForm.hidden = false;
  progressTwo.classList.remove('is-current');
  progressOne.classList.add('is-current');
  ratingButtons[0]?.focus();
});

loadLocation().catch((error) => showError(error.message));
