document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('login-btn');
  const btnText = document.getElementById('btn-text');
  const errEl = document.getElementById('login-error');

  if (!username || !password) return;

  // Loading state
  btn.disabled = true;
  btnText.textContent = 'Signing in...';
  errEl.style.display = 'none';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      // Store token for API calls
      localStorage.setItem('asbl_token', data.token);
      // Redirect to app (server will validate session cookie)
      window.location.href = '/app';
    } else {
      errEl.textContent = data.error || 'Invalid username or password';
      errEl.style.display = 'block';
      document.getElementById('password').value = '';
      document.getElementById('password').focus();
    }
  } catch {
    errEl.textContent = 'Could not connect to server. Please try again.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Sign In';
  }
});

function togglePassword() {
  const input = document.getElementById('password');
  const eye = document.getElementById('pw-eye');
  if (input.type === 'password') {
    input.type = 'text';
    eye.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
  } else {
    input.type = 'password';
    eye.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  }
}

// Auto-focus username on load
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('username').focus();
});
