# Security & threat model

Jobvexa is a **static website** (HTML/JS/JSON on GitHub Pages) plus an **hourly GitHub Action** that collects job data. There is no server, database, login or payment.

## What is protected
| Asset | Where it lives | Protection |
|---|---|---|
| API keys (Adzuna, OpenWeb Ninja/RapidAPI, Jooble, USAJobs) | GitHub **Actions secrets** only | Never in code, never written to output files (a test checks this); secrets are masked in logs; only the collector step receives them. |
| Visitors' data (saved jobs, tracker, notes, resume text, saved searches) | Visitor's own **browser localStorage** | Never sent anywhere. No accounts, no analytics, no cookies. |
| Published site | GitHub Pages | Built from `main` by the workflow only; workflow permissions are minimal (`contents: read`, `pages: write`, `id-token: write`; `actions: write` only in the job that keeps the schedule on). |

## Threats considered
- **Malicious job data (XSS):** job titles/descriptions come from third parties. React escapes all text; descriptions are converted to plain text (`htmlToText`) before publishing; no `dangerouslySetInnerHTML` is used for job content. A Content-Security-Policy `<meta>` limits scripts and connections to the site itself.
- **Malicious links:** apply links must be `http(s)` (others are dropped); all external links use `rel="noopener noreferrer nofollow"`.
- **Leaked keys:** keys only exist as secrets; `.env` is git-ignored. GitHub secret scanning + push protection should stay on (repo Settings → Code security).
- **Supply chain:** Dependabot opens weekly PRs for npm packages and GitHub Actions; `npm test` runs before every publish; a failing test stops the deploy.
- **Abuse of sources:** every connector respects the provider's terms, rate limits and robots.txt (Job Bank crawl delay), with per-source daily budgets.
- **Clickjacking / headers:** GitHub Pages can't send custom headers (`X-Frame-Options`, `frame-ancestors`); the CSP meta tag and referrer policy cover what a static site can. Risk is low because the site has no logged-in actions.

## Reporting a problem
Email **karthicjr17@gmail.com** with details. Please don't open a public issue for security problems.
