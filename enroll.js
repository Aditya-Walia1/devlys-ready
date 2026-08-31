const form = document.getElementById('enrollmentForm');
const status = document.getElementById('enrollmentStatus');
const formPanel = document.getElementById('enrollmentFormPanel');
const success = document.getElementById('enrollmentSuccess');
const reference = document.getElementById('applicationReference');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  const values = Object.fromEntries(new FormData(form).entries());
  delete values.consent;
  submit.disabled = true;
  submit.textContent = 'Submitting…';
  status.textContent = '';
  try {
    const response = await fetch('/api/enrollments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Please try again.');
    reference.textContent = payload.applicationId;
    formPanel.hidden = true;
    success.hidden = false;
    success.focus?.();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Submit enrollment';
  }
});
