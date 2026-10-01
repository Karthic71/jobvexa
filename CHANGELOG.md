# Changelog

## 2026-10-01 — ATS resume check & collector fixes
### Website
- **Check your resume for this job** — every job page now has an ATS-style score (0–100) and a job-description match %, with a score breakdown (hard skills & tools 40, keywords 15, job title 10, years of experience 10, education 5, readable formatting 20), ✓/✗ keyword chips, title/experience/education checks, a formatting checklist and tips. Paste your resume or a .txt file, or use your saved one (checked automatically). Short postings get a box to paste the full description. Runs in the browser only.
- “ATS check” link on each job card and in the apply panel; ATS scores appear in the application tracker.

### Data
- Job Bank: fixed HTTP 406 (request now accepts any content type; standard crawler user agent).
- Retries once on HTTP 429/502/503/504 (e.g. Adzuna 503) and error messages include the start of the server's reply.
- Small daily quotas (JSearch 6/day) are spread smoothly over the day, and the coverage note says when the next call happens.
- `MAX_JOBS` default raised to 15,000.

## 2026-09-30 — Keyword-driven collection & job-seeker features
### Data
- **Keyword-driven collection** — `config/keywords.txt` (priority + general) and `config/aliases.json` (synonyms). Each hourly run splits every source's budget between priority keywords across Canada (3 pages + remote), keywords in 10 major Canadian cities / general keywords / USA, and the broad province/state sweep.
- **Job Bank** on by default via its public RSS feed (robots.txt + crawl delay obeyed).
- **New sources:** Remotive (every 6 h, per their 4-requests/day rule), Himalayas (remote jobs open to Canada), Workable and Recruitee company boards; `config/companies.txt` grown to ~200 employers (lookups capped at 40 per run).
- **JSearch fixed** — RapidAPI's `/search` returned 404 and RapidAPI closed new JSearch sign-ups; now supports an OpenWeb Ninja key (`OPENWEBNINJA_API_KEY`) and tries `search-v2` first.
- **Data quality:** keyword tags from full descriptions, work-authorization detection (citizens only, PR, clearance, no sponsorship, sponsorship), salary normalised to yearly CAD, better duplicate detection ("Sr. Cloud Eng II (Remote)" = "Senior Cloud Engineer 2"), "San Jose, CA" no longer mistaken for Canada.
- **Coverage report** (`/coverage`, `coverage.json`, run summary): calls vs daily budget, last success per source, jobs per keyword, thin keywords.

### Website
- Search syntax: `"exact phrase"`, `OR`, `-exclude`, synonyms.
- Job sets (SOC, DevOps/SRE/Platform, Cloud, IT support) with "N new" badges and **RSS alert feeds**; save your own searches.
- Filters: work authorization, "only with salary", entry & mid-level first; sort by highest salary (CAD).
- **Application tracker** with statuses, notes and CSV export.
- **Resume match** (browser-only): match % on every job, what you have / what's missing, sort by match.
- Dashboard: jobs per target role. "Posted X hours ago".

### Project
- SECURITY.md threat model, CSP + referrer policy, Dependabot, screenshot workflow, updated GitHub Actions versions.

## 2026-09-29 — First public release
- Static Next.js site on GitHub Pages, hourly collection, Canada-first plan, Adzuna/Jooble/JSearch/USAJobs + employer boards, dashboard, company and job pages, saved/applied jobs, legal pages.
