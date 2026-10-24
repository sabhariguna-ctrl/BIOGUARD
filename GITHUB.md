# Put BioGuard on GitHub safely

## 1. Make sure no secret is committed
`.gitignore` already excludes `.env`, `.env.backup`, `node_modules` and `dist`. Before the first commit run:
```bash
git init
git add .
git status
```
Read the list. **`server/.env` must NOT appear.** (`server/.env.example` is fine, it has no secrets.)

## 2. First push
```bash
git commit -m "BioGuard: multimodal biometric authentication for online exams"
git branch -M main
git remote add origin https://github.com/<your-username>/bioguard.git
git push -u origin main
```
Create the empty repository on github.com first (no README, no .gitignore). The **CI** workflow runs on every push: unit tests, frontend build, and the API integration suite against a real MongoDB.

## 3. If you ever commit a secret by mistake
Deleting the file is not enough, it stays in history. Treat the secret as leaked: create a new Gmail App Password / Brevo key / JWT secret, update your server settings, and make the repo private until cleaned.

## 4. Then host it
Follow `DEPLOY.md` (Atlas + Brevo + Render + Vercel). Secrets go into Render and Vercel **environment variables**, never into the repo.

## 5. Make the repo look good (for recruiters)
- Pin it on your profile, add a short description and topics: `mern`, `biometrics`, `face-recognition`, `keystroke-dynamics`, `socket-io`, `tailwindcss`.
- Add 3 screenshots to the README (login, trust ring in an exam, analytics).
- Put the live link and the GitHub link on your resume.
