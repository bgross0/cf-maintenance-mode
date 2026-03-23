/**
 * CF Maintenance Mode - Cloudflare Worker
 *
 * Beautiful maintenance page with hidden admin bypass.
 * Supports multiple sites with per-site configuration via KV.
 *
 * @see https://github.com/bgross0/cf-maintenance-mode
 * @license MIT
 */

// Optional: Import your logo PNG here
// import LOGO from './logo.png';

/**
 * Check if a value should be treated as "no countdown" (show animation instead)
 */
function isNoCountdown(value) {
  if (!value) return true;
  const normalized = value.toLowerCase().trim();
  return normalized === '' ||
         normalized === 'none' ||
         normalized === 'null' ||
         normalized === 'disabled' ||
         normalized === 'false';
}

/**
 * Get site configuration from KV storage based on hostname
 * Falls back to environment variables if not found in KV
 *
 * KV Keys per site:
 * - site:{hostname}:message - Custom maintenance message
 * - site:{hostname}:endtime - End time (ISO string, or "none" for animation)
 */
async function getSiteConfig(hostname) {
  let message = null;
  let endTime = null;

  // Try to get site-specific config from KV
  if (typeof MAINTENANCE_KV !== 'undefined') {
    try {
      message = await MAINTENANCE_KV.get(`site:${hostname}:message`);
      endTime = await MAINTENANCE_KV.get(`site:${hostname}:endtime`);
    } catch (error) {
      console.error('Error reading from KV:', error);
    }
  }

  // Fallback to environment variables if not found in KV
  const finalMessage = message || MAINTENANCE_MESSAGE || "We're currently performing scheduled maintenance.";
  const finalEndTime = endTime || MAINTENANCE_END_TIME || null;

  return {
    name: hostname,
    message: finalMessage,
    endTime: isNoCountdown(finalEndTime) ? null : finalEndTime,
  };
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const hostname = url.hostname

  // Get site-specific configuration from KV
  const siteConfig = await getSiteConfig(hostname)

  // Optional: Serve custom logo image
  // if (url.pathname === '/logo.png') {
  //   return serveLogo()
  // }

  // Check if they have the bypass cookie
  const cookieString = request.headers.get('Cookie') || ''
  const hasAdminAccess = cookieString.includes('maintenance_bypass=authenticated')

  // If they have the cookie, let them through
  if (hasAdminAccess) {
    return fetch(request)
  }

  // Handle the secret admin login endpoint
  if (url.pathname === '/admin-access') {
    return handleAdminAuth(request)
  }

  // Check if maintenance mode is enabled
  const maintenanceEnabled = await isMaintenanceEnabled()

  if (maintenanceEnabled) {
    return maintenancePage(siteConfig)
  }

  // Not in maintenance mode - check for toast notification
  const response = await fetch(request)

  // Only inject toast into HTML responses
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    return response
  }

  const notifConfig = await getNotificationConfig()
  if (!notifConfig) {
    return response
  }

  return injectToastNotification(response, notifConfig)
}

/**
 * Check if maintenance mode is enabled
 * Uses KV storage if available, otherwise checks environment variable
 */
async function isMaintenanceEnabled() {
  // Try KV storage first (if bound)
  if (typeof MAINTENANCE_KV !== 'undefined') {
    const kvValue = await MAINTENANCE_KV.get('enabled')
    if (kvValue !== null) {
      return kvValue === 'true'
    }
  }

  // Fall back to environment variable
  if (typeof MAINTENANCE_MODE !== 'undefined') {
    return MAINTENANCE_MODE === 'true'
  }

  // Default to false (no maintenance)
  return false
}

/**
 * Read toast notification config from KV
 * Returns config object or null if disabled/missing
 */
async function getNotificationConfig() {
  if (typeof MAINTENANCE_KV === 'undefined') return null

  try {
    const enabled = await MAINTENANCE_KV.get('notification:enabled')
    if (enabled !== 'true') return null

    const message = await MAINTENANCE_KV.get('notification:message')
    if (!message) return null

    const type = await MAINTENANCE_KV.get('notification:type') || 'info'
    const duration = await MAINTENANCE_KV.get('notification:duration') || '8'
    const id = await MAINTENANCE_KV.get('notification:id') || 'default'

    return { message, type, duration: parseInt(duration, 10) || 8, id }
  } catch (error) {
    console.error('Error reading notification config from KV:', error)
    return null
  }
}

/**
 * Escape a string for safe embedding inside a JS string literal
 * Prevents XSS via script tag injection, quote breaking, etc.
 */
function escapeForJS(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}

/**
 * Inject toast notification into an HTML response using HTMLRewriter
 */
function injectToastNotification(response, config) {
  const colors = {
    info:    { bg: '#e0f2fe', border: '#0284c7', text: '#0c4a6e' },
    warning: { bg: '#fef3c7', border: '#d97706', text: '#78350f' },
    success: { bg: '#dcfce7', border: '#16a34a', text: '#14532d' },
  }
  const c = colors[config.type] || colors.info
  const safeMessage = escapeForJS(config.message)
  const safeId = escapeForJS(config.id)

  const toastSnippet = `
<style>
  .cf-toast-banner {
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
    display: flex; align-items: center; justify-content: center; gap: 12px;
    padding: 12px 48px 12px 20px;
    background: ${c.bg}; border-bottom: 2px solid ${c.border}; color: ${c.text};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px; line-height: 1.4;
    transform: translateY(-100%); transition: transform 0.3s ease;
  }
  .cf-toast-banner.cf-toast-visible { transform: translateY(0); }
  .cf-toast-dismiss {
    position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
    background: none; border: none; font-size: 18px; cursor: pointer;
    color: ${c.text}; opacity: 0.6; padding: 4px 8px; line-height: 1;
  }
  .cf-toast-dismiss:hover { opacity: 1; }
</style>
<script>
(function(){
  var id = '${safeId}';
  var key = 'toast-dismissed-' + id;
  if (sessionStorage.getItem(key) === '1') return;
  var d = document.createElement('div');
  d.className = 'cf-toast-banner';
  var s = document.createElement('span');
  s.textContent = '${safeMessage}';
  d.appendChild(s);
  var b = document.createElement('button');
  b.className = 'cf-toast-dismiss';
  b.setAttribute('aria-label', 'Dismiss');
  b.textContent = '\\u00d7';
  b.onclick = function(){ d.style.display='none'; sessionStorage.setItem(key,'1'); };
  d.appendChild(b);
  document.body.appendChild(d);
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ d.classList.add('cf-toast-visible'); }); });
  setTimeout(function(){ d.style.display='none'; sessionStorage.setItem(key,'1'); }, ${config.duration} * 1000);
})();
</script>`

  return new HTMLRewriter()
    .on('body', {
      element(element) {
        element.append(toastSnippet, { html: true })
      }
    })
    .transform(response)
}

/**
 * Handle admin authentication
 */
async function handleAdminAuth(request) {
  if (request.method === 'POST') {
    const formData = await request.formData()
    const password = formData.get('password')

    // Get admin password from environment/secret
    const adminPassword = ADMIN_PASSWORD || 'changeme'

    if (password === adminPassword) {
      // Password correct - set cookie and redirect
      return new Response('Success! Redirecting...', {
        status: 302,
        headers: {
          'Location': '/',
          'Set-Cookie': 'maintenance_bypass=authenticated; Max-Age=86400; Path=/; HttpOnly; Secure; SameSite=Lax'
        }
      })
    } else {
      // Wrong password
      return new Response(loginForm(true), {
        headers: { 'content-type': 'text/html;charset=UTF-8' }
      })
    }
  }

  // Show login form
  return new Response(loginForm(false), {
    headers: { 'content-type': 'text/html;charset=UTF-8' }
  })
}

/**
 * Generate admin login form HTML
 */
function loginForm(error = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Admin Access</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #191a23;
      background-image:
        radial-gradient(circle at 20% 80%, rgba(123, 184, 255, 0.2) 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(45, 126, 216, 0.25) 0%, transparent 50%),
        radial-gradient(circle at 40% 40%, rgba(74, 158, 255, 0.15) 0%, transparent 50%);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .login-box {
      background: rgba(255, 255, 255, 0.98);
      padding: 2.5rem;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      width: 100%;
      max-width: 360px;
    }
    h2 {
      color: #191a23;
      margin-bottom: 1.5rem;
      text-align: center;
      font-size: 1.5rem;
      font-weight: 600;
    }
    .lock-icon {
      text-align: center;
      font-size: 3rem;
      margin-bottom: 1rem;
    }
    input {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e1e8ed;
      border-radius: 8px;
      margin-bottom: 1rem;
      font-size: 16px;
      transition: border-color 0.3s;
    }
    input:focus {
      outline: none;
      border-color: #4a9eff;
    }
    button {
      width: 100%;
      padding: 12px;
      background: #191a23;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 16px;
      font-weight: 500;
      transition: all 0.3s;
    }
    button:hover {
      background: #4a9eff;
      transform: scale(1.02);
    }
    .error {
      color: #e74c3c;
      text-align: center;
      margin-bottom: 1rem;
      padding: 10px;
      background: #ffe5e5;
      border-radius: 6px;
      font-size: 14px;
    }
    .back-link {
      display: block;
      text-align: center;
      margin-top: 1.5rem;
      color: #7f8c8d;
      text-decoration: none;
      font-size: 14px;
    }
    .back-link:hover { color: #4a9eff; }
  </style>
</head>
<body>
  <div class="login-box">
    <div class="lock-icon">🔐</div>
    <h2>Admin Access</h2>
    ${error ? '<div class="error">Incorrect password</div>' : ''}
    <form method="POST">
      <input type="password" name="password" placeholder="Enter password" autofocus required autocomplete="current-password">
      <button type="submit">Sign In</button>
    </form>
    <a href="/" class="back-link">Back to maintenance page</a>
  </div>
</body>
</html>`
}

/**
 * Optional: Serve custom logo as PNG image
 */
// function serveLogo() {
//   return new Response(LOGO, {
//     headers: {
//       'content-type': 'image/png',
//       'cache-control': 'public, max-age=86400'
//     }
//   });
// }

/**
 * Generate maintenance page HTML
 */
function maintenancePage(siteConfig) {
  const customMessage = siteConfig.message
  const endTime = siteConfig.endTime

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Scheduled Maintenance</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="60">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #191a23;
      background-image:
        radial-gradient(circle at 20% 80%, rgba(123, 184, 255, 0.2) 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(45, 126, 216, 0.25) 0%, transparent 50%),
        radial-gradient(circle at 40% 40%, rgba(74, 158, 255, 0.15) 0%, transparent 50%);
      background-size: 200% 200%;
      animation: meshMove 20s ease infinite;
      color: #f3f3f3;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
      position: relative;
    }
    @keyframes meshMove {
      0%, 100% { background-position: 0% 0%; }
      50% { background-position: 100% 100%; }
    }
    .container {
      text-align: center;
      max-width: 600px;
      padding: 3rem;
      background: rgba(74, 158, 255, 0.1);
      border-radius: 24px;
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(74, 158, 255, 0.2);
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 1.5rem;
      font-weight: 600;
      letter-spacing: -0.5px;
    }
    .icon-large {
      font-size: 4rem;
      margin-bottom: 1.5rem;
    }
    p {
      font-size: 1.15rem;
      line-height: 1.7;
      margin-bottom: 2rem;
      opacity: 0.95;
      max-width: 500px;
      margin-left: auto;
      margin-right: auto;
    }
    .admin-door {
      position: absolute;
      bottom: 15px;
      right: 15px;
      color: rgba(255, 255, 255, 0.15);
      text-decoration: none;
      font-size: 12px;
      padding: 5px;
      cursor: default;
      transition: color 0.3s;
    }
    .admin-door:hover {
      color: rgba(255, 255, 255, 0.3);
      cursor: pointer;
    }
    .countdown {
      margin-top: 2rem;
      padding: 1.5rem;
      background: rgba(74, 158, 255, 0.15);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(74, 158, 255, 0.25);
    }
    .countdown-label {
      font-size: 0.9rem;
      opacity: 0.8;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .countdown-time {
      font-size: 2rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: 2px;
    }
    .countdown-unit {
      font-size: 0.8rem;
      opacity: 0.7;
      margin: 0 4px;
    }
    .building-animation {
      margin-top: 2rem;
      padding: 3rem 2rem;
      background: rgba(74, 158, 255, 0.15);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(74, 158, 255, 0.25);
    }
    .building-text {
      font-size: 1.5rem;
      font-weight: 500;
      margin-bottom: 2rem;
      opacity: 0.9;
    }
    .spinner {
      width: 60px;
      height: 60px;
      margin: 0 auto;
    }
    .spinner svg { width: 100%; height: 100%; }
    @media (max-width: 640px) {
      h1 { font-size: 2rem; }
      .container { padding: 2rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon-large">🔧</div>
    <h1>System Maintenance</h1>
    <p>${customMessage}</p>
    <p style="opacity: 0.8; font-size: 1rem;">We'll be back online shortly.</p>
    ${endTime ? `
    <div class="countdown" id="countdown">
      <div class="countdown-label">Estimated time remaining</div>
      <div class="countdown-time" id="timer">Calculating...</div>
    </div>
    <script>
      const endTime = new Date('${endTime}');
      function updateCountdown() {
        const now = new Date();
        const diff = endTime - now;
        if (diff <= 0) {
          document.getElementById('timer').innerHTML = 'Any moment now...';
          setTimeout(() => location.reload(), 5000);
          return;
        }
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        let timeString = '';
        if (hours > 0) timeString = hours + '<span class="countdown-unit">hr</span> ';
        timeString += minutes + '<span class="countdown-unit">min</span> ' + seconds + '<span class="countdown-unit">sec</span>';
        document.getElementById('timer').innerHTML = timeString;
      }
      updateCountdown();
      setInterval(updateCountdown, 1000);
    </script>
    ` : `
    <div class="building-animation">
      <div class="building-text">Working on it</div>
      <div class="spinner">
        <svg viewBox="0 0 50 50">
          <circle cx="25" cy="25" r="20" fill="none" stroke="#4a9eff" stroke-width="4" stroke-linecap="round" stroke-dasharray="1, 200" stroke-dashoffset="0">
            <animate attributeName="stroke-dasharray" values="1,200;100,200;1,200" dur="1.5s" repeatCount="indefinite" />
            <animate attributeName="stroke-dashoffset" values="0;-15;-125" dur="1.5s" repeatCount="indefinite" />
            <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    </div>
    `}
  </div>
  <a href="/admin-access" class="admin-door" title="">•••</a>
</body>
</html>`

  return new Response(html, {
    headers: {
      'content-type': 'text/html;charset=UTF-8',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'x-maintenance-mode': 'true'
    },
    status: 503
  })
}
