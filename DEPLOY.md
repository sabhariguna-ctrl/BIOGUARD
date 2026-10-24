# Hosting BioGuard (so anyone can sign up with their own email)

Total cost: free. Time: about 30 minutes.

## Why emails sometimes do not arrive
| Situation | Cause | Fix |
|---|---|---|
| Works on your laptop, not when hosted | Render and similar free hosts **block SMTP ports** (Gmail) | Use **Brevo API** (`BREVO_API_KEY`), it sends over HTTPS |
| "SMTP login failed" | `SMTP_USER` / `SMTP_PASS` still contain example text, or you used your normal Gmail password | Full Gmail address + 16-letter **App Password** |
| Brevo says "Sender is not valid" | `MAIL_FROM` address is not verified in Brevo | Brevo > Senders > verify exactly that address |
| Code never arrives but no error | Landed in spam, or the address has no account | Check spam; use "Send a new code"; register first |
| Only your own email receives mail | You use Resend without a verified domain | Switch to Brevo |

Admin > **Email setup** shows the provider, warnings, a **Send test email** button and a **delivery log** with the exact error for every failed email.

## Step 1: Database (MongoDB Atlas)
1. mongodb.com/atlas > free M0 cluster.
2. Database Access: create a user with a simple password (letters and numbers).
3. Network Access: **Allow access from anywhere (0.0.0.0/0)**.
4. Connect > Drivers: copy the string, replace `<password>`, add `/bioguard` before the `?`.

## Step 2: Email (Brevo, free)
1. Sign up at brevo.com.
2. Senders, Domains and Dedicated IPs > **Senders** > add your email, click the link they send.
3. SMTP and API > **API Keys** > generate one (starts with `xkeysib-`).

## Step 3: Backend (Render)
1. Push the project to GitHub (`.env` is git-ignored).
2. Render > New > Web Service > pick the repo. **Root Directory = `server`**, Build `npm install`, Start `npm start`. (Or use `render.yaml`.)
3. Environment variables:

| Key | Value |
|---|---|
| `ADMIN_EMAIL` | your real email, the only administrator |
| `NODE_ENV` | `production` |
| `MONGO_URI` | your Atlas string |
| `JWT_SECRET` | 40+ random characters (Render can generate it) |
| `CLIENT_URL` | your Vercel URL (fill after step 4, no trailing slash) |
| `BREVO_API_KEY` | the Brevo key |
| `MAIL_FROM` | `BioGuard <the sender you verified>` |
| `STAFF_2FA` | `true` (admins and faculty confirm each login by email) |

In production the server **refuses to start** if the secret is weak, the URLs are localhost, or no email provider is set. Check the Render logs for `[config] ERROR` lines.

## Step 4: Frontend (Vercel)
1. Vercel > New Project > same repo, **Root Directory = `client`**.
2. Environment variable: `VITE_API_URL` = your Render URL (no trailing slash).
3. Deploy, then put the Vercel URL into Render's `CLIENT_URL` and redeploy the backend.

## Tip: let the wizard create your env values
`npm run setup` (run locally) tests your email provider with a real message and prints a correct `server/.env`. Copy the same values into Render's environment variables.

## Step 5: Your admin account (nothing to run, no password)
`ADMIN_EMAIL` (set in step 3) is the one administrator. On first start the server creates that account automatically.
1. Open your Vercel site > Log in > **Email me a login code instead**.
2. Enter your `ADMIN_EMAIL`. The code arrives in that inbox.
3. Open **Email setup** and send yourself a test email. Check the **delivery log** if it fails.
4. Share the link. Students and teachers sign up with their own emails and get their codes there. Approve teacher requests in **Users**, and invite classes from **Invite people** (CSV).

Do not run `seed:demo` on a hosted site.

## Who receives codes
Everyone with an account: students, teachers and admins. Verification, login codes, password reset, new-device checks and security alerts all go to the email on the account.

## Security checklist before sharing the link
- [ ] `NODE_ENV=production`, strong `JWT_SECRET`
- [ ] Test email arrives (Email setup page)
- [ ] `STAFF_2FA=true`
- [ ] `ADMIN_EMAIL` is your real inbox; you did not seed demo accounts
- [ ] `ALLOW_DEV_CODES` is not set to true
- [ ] Atlas user password is not reused elsewhere

## Notes
- Render free plan sleeps after 15 minutes idle; the first request can take 30 to 50 seconds. Open the site once before a demo.
- Brevo free plan allows about 300 emails per day. Bulk invites count toward it.
- Camera features need HTTPS, which Vercel provides.
