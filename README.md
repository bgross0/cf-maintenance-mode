# CF Maintenance Mode

A beautiful, production-ready maintenance page for Cloudflare Workers with hidden admin bypass, multi-site support, and zero-config deployment.

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

<p align="center">
  <img src="https://raw.githubusercontent.com/bgross0/cf-maintenance-mode/main/.github/demo.png" alt="Maintenance Page Demo" width="600">
</p>

## Features

- **Beautiful UI** - Modern glassmorphism design with animated background
- **Hidden Admin Access** - Subtle "•••" link for admin bypass (cookie-based)
- **Multi-Site Support** - One worker handles unlimited domains
- **Dashboard Configurable** - Change messages via Cloudflare KV (no deploys needed)
- **Countdown Timer** - Optional ETA countdown or animated spinner
- **Mobile Responsive** - Looks great on all devices
- **Auto-Refresh** - Page refreshes every 60 seconds
- **Zero Dependencies** - Pure JavaScript, no npm packages in production

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/bgross0/cf-maintenance-mode.git
cd cf-maintenance-mode
npm install
```

### 2. Configure

Edit `wrangler.toml`:

```toml
# Uncomment and add your account ID
account_id = "YOUR_ACCOUNT_ID"

# Add your domain routes
[[routes]]
pattern = "yourdomain.com/*"
zone_name = "yourdomain.com"
```

### 3. Set Admin Password

```bash
npx wrangler secret put ADMIN_PASSWORD
# Enter a secure password when prompted
```

### 4. Deploy

```bash
npm run deploy
```

That's it! Your maintenance page is live.

---

## Configuration

### Enable/Disable Maintenance Mode

**Option A: Environment Variable (Quick)**

In Cloudflare Dashboard:
1. Go to **Workers & Pages** → Your Worker → **Settings** → **Variables**
2. Set `MAINTENANCE_MODE` = `true` or `false`
3. Save

**Option B: KV Storage (Recommended for Production)**

```bash
# Create KV namespace (one-time)
npx wrangler kv:namespace create "MAINTENANCE_KV"

# Add the returned ID to wrangler.toml, then:
npm run maintenance:on   # Enable
npm run maintenance:off  # Disable
```

### Customize Message

**Default Message** (in `wrangler.toml`):
```toml
[vars]
MAINTENANCE_MESSAGE = "We're upgrading our systems. Back soon!"
```

**Per-Site Messages** (via KV Dashboard):
| Key | Value |
|-----|-------|
| `site:app.example.com:message` | `App is being updated!` |
| `site:api.example.com:message` | `API maintenance in progress` |

### Countdown Timer vs Animation

**Show Countdown:**
```toml
MAINTENANCE_END_TIME = "2025-01-20T14:00:00Z"
```

**Show Spinner Animation:**
```toml
MAINTENANCE_END_TIME = "none"
```

---

## Admin Bypass

When maintenance mode is active:

1. Look for **•••** in the bottom-right corner
2. Click it to access `/admin-access`
3. Enter your admin password
4. You'll receive a 24-hour bypass cookie

Admins can browse the site normally while users see the maintenance page.

---

## Multi-Site Setup

One worker can handle multiple domains:

```toml
# wrangler.toml
[[routes]]
pattern = "site1.com/*"
zone_name = "site1.com"

[[routes]]
pattern = "site2.com/*"
zone_name = "site2.com"

[[routes]]
pattern = "app.site3.com/*"
zone_name = "site3.com"
```

Configure each site independently via KV:
- `site:site1.com:message` → "Site 1 is updating"
- `site:site2.com:message` → "Site 2 maintenance"
- `site:site2.com:endtime` → "2025-01-20T12:00:00Z"

---

## Custom Branding

### Add Your Logo

1. Add `logo.png` to the project root
2. Uncomment in `worker.js`:
   ```js
   import LOGO from './logo.png';
   ```
3. Uncomment the logo route and `serveLogo()` function
4. Uncomment `[[rules]]` in `wrangler.toml`
5. Update HTML to use `<img src="/logo.png" />`

### Change Colors

Edit the CSS in `maintenancePage()` function:
```css
background: #191a23;  /* Page background */
rgba(74, 158, 255, 0.2)  /* Accent color */
```

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local dev server (localhost:8787) |
| `npm run deploy` | Deploy to Cloudflare |
| `npm run logs` | Stream real-time logs |
| `npm run maintenance:on` | Enable maintenance (KV) |
| `npm run maintenance:off` | Disable maintenance (KV) |
| `npm run set-password` | Update admin password |

---

## How It Works

```
User Request
     ↓
┌─────────────────────┐
│  Cloudflare Worker  │
└─────────────────────┘
     ↓
Has bypass cookie? ──Yes──→ Pass through to origin
     ↓ No
Maintenance enabled? ──No──→ Pass through to origin
     ↓ Yes
Show maintenance page
     ↓
Admin clicks "•••" → Login → Set cookie → Access granted
```

---

## Local Development

```bash
npm run dev
# Visit http://localhost:8787
```

To test maintenance mode locally, set in `wrangler.toml`:
```toml
MAINTENANCE_MODE = "true"
```

---

## Security

- **Passwords**: Always use `wrangler secret` - never commit passwords
- **Cookies**: HttpOnly, Secure, SameSite=Lax
- **HTTPS**: Required for secure cookies
- **Rotate**: Change admin password regularly

---

## Troubleshooting

**Worker not triggering?**
- Verify routes in `wrangler.toml`
- Ensure domain is proxied through Cloudflare (orange cloud)

**Password not working?**
- Set via `npx wrangler secret put ADMIN_PASSWORD`
- Don't put passwords in `wrangler.toml`

**Changes not showing?**
- Clear browser cache
- Run `npm run deploy` after changes

**KV commands failing?**
- Create namespace: `npx wrangler kv:namespace create "MAINTENANCE_KV"`
- Add ID to `wrangler.toml`

---

## License

MIT License - see [LICENSE](LICENSE)

---

## Contributing

Contributions welcome! Please open an issue or PR.

---

**Built for the Cloudflare ecosystem** | [Report Bug](https://github.com/bgross0/cf-maintenance-mode/issues) | [Request Feature](https://github.com/bgross0/cf-maintenance-mode/issues)
