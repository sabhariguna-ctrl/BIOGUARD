# BioGuard: multimodal biometric authentication for online exams

A full MERN project (JavaScript + Tailwind CSS) inspired by the paper *"From Fusion to Adoption: Enhancing Multimodal Biometric Authentication"*.
It combines a **physiological** biometric (face) with a **behavioural** biometric (keystroke dynamics) using **quality-aware score-level fusion**, and keeps re-checking the student during the whole exam.

## Features

**Authentication core**
- Face recognition in the browser (face-api.js, 128-d descriptors): no photos are uploaded or stored
- Keystroke dynamics: dwell time, flight time, typing speed; scaled Manhattan distance to a per-user template
- **Active liveness**: server issues a random one-time challenge (blink twice / turn left / turn right), verified in browser with eye-aspect-ratio and head-pose
- **Quality-aware adaptive fusion**: `fused = wFace*face + wKey*key`, where `wFace = clamp(0.5*quality + 0.2, 0.2, 0.7)` (bad lighting shifts trust to typing)
- Three-band decision: **ACCEPT / STEP_UP (email OTP) / REJECT**, thresholds configurable per exam
- **Continuous authentication** during the exam (face frame + background typing rhythm every N seconds), session trust score, auto-termination after repeated failures

**Platform**
- Roles: Admin, Faculty, Student with JWT auth and protected routes (UI and API)
- Exam builder (MCQ), timer, auto-submit, fullscreen and tab-switch/paste flags
- Real-time proctor dashboard (Socket.io)
- **Hash-chained audit ledger** (SHA-256, each block links to the previous) with an integrity verifier
- Analytics: decisions per day, outcome mix, **FAR / FRR curves with threshold slider, EER, score distribution, EER by modality (face vs typing vs fusion)**
- Impostor test lab to generate your own labelled accuracy data
- Privacy: only numeric templates stored, one-click erase
- Dark/light theme, responsive, keyboard-accessible UI

## New in v4: hosting-ready accounts and security
- **Reliable email everywhere**: Brevo / Resend HTTPS APIs (work on free hosts that block SMTP) or SMTP, delivery log, clear error messages, test button. See `DEPLOY.md`
- **Teachers**: sign up with "I am a teacher" (starts as student, admin approves), or admins and faculty invite by email
- **Invite a whole class** from a pasted list or CSV (max 100 per batch)
- **Email two-step login**: optional for everyone, enforceable for staff with `STAFF_2FA=true`
- **Session safety**: sliding token refresh, "Sign out other devices", all sessions revoked on password change/reset, new-browser sign-in alerts, account-lock alerts
- **Password rules** (common passwords and your own email name are rejected), hashed OTPs, rate limits
- **Production guard**: server refuses to start with a weak secret, localhost URLs or no email provider; demo seeding is blocked in production; `npm run create-admin` creates your real admin
- Tests: 112 API checks, 11 unit tests (including mocked Brevo/Resend requests)

## New in v3: complete account system
- **Email-verified sign-up**: register, receive a 6-digit code, verify, auto login
- **Login options**: password, **emailed one-time login code**, **forgot / reset password**
- **Invite by email**: admins invite faculty/admins/students, who set their own password from a secure 7-day link
- **Step-up OTP actually emailed** (branded HTML email), with new-device alerts
- **Notifications bell**: persistent in-app alerts (new exam, proctor warning, new device, password change), pushed live
- **Email setup page** (admin): shows SMTP status, detects placeholder credentials, sends a test email with a clear error message
- **Dev mode**: with no SMTP configured, every code is printed in the server console and shown in the UI, so the whole app works out of the box. Set `NODE_ENV=production` when deployed to hide codes.
- **Landing page** at `/welcome`
- Hardening: hashed OTPs with expiry and 5-try limit, resend cooldown, rate limits, generic responses (no account enumeration), stronger password rules

### Email setup (Gmail)
1. Google Account: turn on **2-Step Verification**, then Security > **App passwords** and create one.
2. In `server/.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-full-address@gmail.com
SMTP_PASS=the16letterapppassword
MAIL_FROM=BioGuard <your-full-address@gmail.com>
```
3. Restart the server, log in as admin, open **Email setup**, and send a test email.

## New in v2
- **Explainable decisions**: every check returns plain-language reasons (why it passed, why it needed an extra step)
- **Context-aware risk**: login from a never-seen browser/device forces an email-OTP step-up; manage trusted devices in *My security*
- **Template ageing**: after a very strong live match, face and typing templates self-update (EMA) so they follow natural drift
- **Proctor actions**: faculty can warn a student (message appears on their exam screen) or end an attempt, in real time
- **Fusion lab**: interactive page to explore the fusion rule with attack scenarios (photo, look-alike, impostor typing)
- **Live capture guide** during enrollment (too dark, move closer...) and a **rhythm fingerprint** chart of your typing
- **Privacy centre**: download my data, erase templates, change password, recent checks
- **Analytics+**: risk watchlist, failures by hour, per-question difficulty, CSV export of attempts
- **Exam controls**: open/close window, per-student shuffled question order
- **Security hardening**: account lockout after 5 failed logins, audit entries for sensitive actions
- **Ctrl+K command palette**, instant toast to staff when an identity check is rejected

## Latest changes
- **Students page** for teachers and admin: search, enrollment status, attempts, average trust, flags, and each student's attempt history
- **Keep me signed in** on the login screen. Ticked = stays signed in on this browser. Unticked = this tab only, so you can test admin, teacher and student side by side in different tabs without sessions overwriting each other (a browser shares one signed-in session between tabs otherwise)

## Permissions (tested role by role)
| Area | Admin | Teacher | Student |
|---|---|---|---|
| Users page, roles, delete users, audit chain, email setup | yes | no | no |
| Approve teacher requests | yes | no | no |
| **Students directory** (enrollment, attempts, trust) | yes | **yes** | no |
| Invite students (CSV) | yes | yes | no |
| Invite teachers | yes | no | no |
| Create / edit exams | yes | yes | no |
| Live proctoring (warn / end attempt), analytics, attempts export | yes | yes | no |
| Enroll face + typing, take exams, own attempts and data export | yes | yes | yes |

The API enforces this on the server for every route (179 automated checks, including a role-by-endpoint matrix), not just by hiding buttons.

## Who can do what (3 roles, no default accounts)
| Role | How they get in | Code goes to |
|---|---|---|
| **Administrator** (exactly one) | Fixed by `ADMIN_EMAIL` in `server/.env`. Created automatically at first start. No default password: log in with **Email me a login code** | the admin email |
| **Teacher** | Signs up with **I am a teacher** using their own email (admin approves), or admin invites them | their own email |
| **Student** | Signs up with their own email, or admin/teacher invites a whole class from a CSV | their own email |

Nobody else can ever become admin: the API rejects admin invites, promotions and deletion, and on every start any other admin is demoted. Email is required, so codes only ever reach the inbox of the person who entered the address.

## Quick start

Requirements: Node 18+, MongoDB (local, Docker, or Atlas).

```bash
docker compose up -d            # MongoDB (skip if you already have one)
npm run install:all
```
Run the setup wizard (asks a few questions, **sends a real test email**, then writes `server/.env` correctly):
```bash
npm run setup
```
It asks for your admin email (an inbox you can open), then how to send email (Gmail with an App Password, Brevo, or other SMTP). If the test email fails it tells you exactly what to fix, so you never edit `.env` by hand. Then:
```bash
npm run dev                     # API on :5000 and web on :5173 in one terminal
```
Open http://localhost:5173 > **Log in** > **Email me a login code instead** > enter `ADMIN_EMAIL`. The code arrives in that inbox. The server refuses to start if the admin email or email provider is missing or still contains example text.

Then: admin > **Email setup** > send a test email; share the link; students and teachers register with their own emails.

`npm run seed:demo` (optional, local testing only) creates public-password demo accounts; remove them with `npm run remove-demo`.

> Camera access needs `localhost` or HTTPS. Face models load from the jsDelivr CDN on first use.

## Demo script (for interviews)
1. Sign up as a **student** with your own email (code arrives by email), open *Biometric enrollment*: capture 5 face poses and type the phrase 6 times.
2. *Exams*: Verify and start. Do the random liveness challenge, then type the phrase. See the face/typing weights and fused score.
3. In the exam, watch the trust ring update. Open **faculty** in another browser: *Live proctoring* updates instantly.
4. Let someone else sit in front of the camera: checks fail, flags appear, exam is terminated after 3 failures.
5. **Admin > Audit chain**: Verify integrity. **Analytics**: drag the threshold slider, show EER and why fusion beats a single modality.

## Architecture

```
client (React + Vite + Tailwind)  <--REST/JWT + Socket.io-->  server (Express)  <-->  MongoDB
  useFace (face-api.js)                                         services/fusion.js
  useKeystroke                                                  services/keystroke.js, faceMatch.js
  VerifyFlow, ExamRoom                                          services/liveness.js, auditChain.js
```

Key files: `server/src/services/fusion.js`, `keystroke.js`, `verification.js`, `auditChain.js`; `client/src/hooks/useFace.js`, `components/VerifyFlow.jsx`, `pages/ExamRoom.jsx`.

API overview: `/api/auth/*`, `/api/biometric/{status,challenge,enroll/face,enroll/keystroke,verify,step-up}`, `/api/exams`, `/api/attempts/:id/{verify,flag,submit,timeline}`, `/api/analytics/*`, `/api/audit*`, `/api/users`.

Tests:
- `npm test`: unit tests (fusion, keystroke, face matching, template ageing, explanations)
- `npm --prefix server run e2e`: 112 API checks (auth, email verification, OTP, invites, password reset, lockout, enrollment, liveness replay, device trust, exam flow, proctor actions, notifications, analytics, audit chain, privacy). Run it against a throwaway database after `npm run seed` and with the server running.

## Deployment
- **Database**: MongoDB Atlas, copy the connection string.
- **Backend**: Render (`render.yaml` included). Set `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL=https://your-app.vercel.app`.
- **Frontend**: Vercel, root `client`, set `VITE_API_URL=https://your-api.onrender.com`.
- Run `npm run seed` once against Atlas (set `MONGO_URI` locally first).

## Honest limitations (say these in interviews, they show maturity)
- Browser face recognition is weaker than dedicated hardware; EER depends on lighting and camera. Use the test lab to measure yours.
- Liveness is challenge-response (blink/head pose), good against photos, not against deepfake video injection.
- Keystroke dynamics improves with more enrolment samples and the same keyboard.
- The audit ledger is a tamper-evident hash chain in MongoDB, not a distributed blockchain. To go further, anchor the head hash on a public chain (e.g. Polygon testnet) periodically.
- Seeded accuracy numbers are synthetic; replace them with real samples from the test lab before quoting results.

## Resume bullets
- Built **BioGuard**, a MERN-stack multimodal authentication platform fusing face recognition and keystroke dynamics via quality-adaptive score-level fusion for secure online exams.
- Implemented active liveness detection (server-issued random blink/head-turn challenges, eye-aspect-ratio and head-pose analysis) in the browser to resist photo spoofing.
- Designed continuous authentication with a session trust score, step-up OTP, and automatic exam termination, streamed to a real-time Socket.io proctor dashboard.
- Created a SHA-256 hash-chained audit ledger with integrity verification, and an analytics suite reporting FAR, FRR and EER with threshold tuning.

## Interview questions to prepare
1. Why score-level fusion rather than feature-level or decision-level? (Modalities have different feature spaces; scores are easy to normalise and weight; decision-level loses information.)
2. What are FAR, FRR and EER, and how do you pick a threshold? (Security vs usability trade-off, exam-specific.)
3. How does your liveness check resist replay? (Server nonce, random challenge, 30 s expiry, one-time use.)
4. How do you protect biometric data? (Only templates stored, no raw images, erase endpoint, JWT, rate limiting, helmet.)
5. Why does `wFace` depend on quality? (Reduces false rejects from poor lighting without weakening security.)
6. What would you improve? (Server-side face verification, anti-deepfake models, per-user adaptive thresholds, public-chain anchoring.)
# BIOGUARD
