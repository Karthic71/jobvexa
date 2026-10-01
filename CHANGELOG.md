# Changelog

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
