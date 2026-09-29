# Jobvexa — every job in Canada first, then the USA

**Created by Karthic.** © 2026 Karthic. Code under the MIT License (see [LICENSE](LICENSE)).

Jobvexa is a free job search site covering all industries, Canada first and then the USA. It collects postings from official APIs, licensed job-search APIs and employers’ public job boards, removes duplicates, and shows **every portal where each job is posted** so people can apply in one click.

It runs **100% free on GitHub**: a GitHub Action collects jobs **every hour** and republishes the site on GitHub Pages. API keys stay private in GitHub Secrets.

```
GitHub Action (hourly)   ──► collect jobs from all sources ──► jobs.json + site ──► GitHub Pages
                                   (keys = repo secrets)                           (search runs in the browser)
```

---

## 1. Publish it on GitHub (one time, ~10 minutes)

**Live site (after step 6):** https://karthic71.github.io/jobvexa/
**Repository:** https://github.com/Karthic71/jobvexa

1. **Install Git** (once): download from https://git-scm.com/download/win and click *Next* through the installer (defaults are fine).
2. **Create the empty repo**: sign in at https://github.com as **Karthic71** → click **+** (top right) → **New repository** →
   - Repository name: `jobvexa` (exactly this, lowercase)
   - Select **Public**
   - Leave *Add a README*, *.gitignore* and *license* **unticked**
   - Click **Create repository**.
3. **Upload the code**: open *Documents\jobvexa* in File Explorer and double-click **`publish-to-github.bat`**.
   - Press **Enter** to accept the username *Karthic71*.
   - If asked, type your name and GitHub email (used only for the commit history).
   - A GitHub sign-in window opens the first time → **Sign in with your browser** → **Authorize**.
   - Wait for “Done!”. (The script also installs `setup/deploy.yml` as `.github/workflows/deploy.yml`.)
   - *No Git?* Use GitHub Desktop: copy `setup/deploy.yml` to `.github/workflows/deploy.yml`, then *File → Add local repository → Documents\jobvexa → create a repository → Publish repository* (untick “Keep this code private”).
4. **Turn on GitHub Pages**: https://github.com/Karthic71/jobvexa/settings/pages → under **Build and deployment → Source**, choose **GitHub Actions**. (Nothing else to change.)
5. **Add your free API keys** (recommended, see section 2): https://github.com/Karthic71/jobvexa/settings/secrets/actions → **New repository secret**.
6. **Start it**: https://github.com/Karthic71/jobvexa/actions → click **Collect jobs & deploy** → **Run workflow** → **Run workflow**. When the run shows a green ✓ (about 3–5 minutes), open **https://karthic71.github.io/jobvexa/** and share that link.

From then on it updates **by itself every hour** — no computer needs to stay on. To check it: *Actions* tab → latest run → the summary shows how many jobs each source returned.

**Updating the site later:** edit files in *Documents\jobvexa* (for example add employers to `config/companies.txt`) and double-click `publish-to-github.bat` again.

## 2. Add job sources (free keys → repo secrets)

Repo **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Where to get it (free) | What it adds |
|---|---|---|
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | developer.adzuna.com | All industries, Canada + US. Best free volume. |
| `RAPIDAPI_KEY` | RapidAPI → subscribe to **JSearch** | Google for Jobs data **with every portal a job is posted on** (company site, Indeed, LinkedIn, Glassdoor…). Free tier is small; raise `DAILY_CALLS_JSEARCH` on a paid plan. |
| `JOOBLE_API_KEY` | jooble.org/api/about | Many small/mid-size employers. |
| `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT` (your email) | developer.usajobs.gov | US federal jobs. |
| `JOBBANK_FEED_URL` | optional — a Job Bank RSS/JSON feed you are allowed to use | Government of Canada postings. |

Optional **Variables** (same page, *Variables* tab): daily call budgets `DAILY_CALLS_ADZUNA` (default 240), `DAILY_CALLS_JSEARCH` (6), `DAILY_CALLS_JOOBLE` (100), `DAILY_CALLS_USAJOBS` (200) — spread evenly over the 24 hourly runs; `GREENHOUSE_BOARDS`, `LEVER_COMPANIES`, `ASHBY_BOARDS` (comma-separated board names), `DISABLE_ATS_DISCOVERY=true`, `MAX_JOBS` (default 12000, keeps the site fast on phones), `USE_MOCK_DATA=1` (demo data only).

Defaults keep you inside the free tiers. Each hourly run searches the next slice of a Canada-first plan (every province and territory, extra pages for ON, QC, BC, AB…, then Canada-remote, then the 20 largest US states and US-remote) and **adds** the new jobs to the ones already collected, so coverage keeps growing through the day. Jobs are removed once their source stops listing them.

**More employers, no key needed:** add company names to `config/companies.txt` (one per line). Their public Greenhouse / Lever / Ashby boards are checked on every refresh.

## 3. Run it on your own computer

```bash
npm install
npm run collect:demo   # demo data   (or: npm run collect  — uses keys from your environment)
npm run dev            # http://localhost:3000
npm test               # unit + collector tests
```
`npm run build` produces the static site in `out/`; `npm run preview` serves it.

---

## Features
- **Search** with Enter or the Search button; keyword + city, recent searches, suggestions, quick presets.
- **Filters**: country (Canada first, then USA), province/state, industry, work type, employment type, date posted (incl. custom range), salary min/max, experience level, certifications, tools, skills. Sort by best match, newest, oldest, salary, company. 10/25/50/100 per page or infinite scroll. Shareable URLs.
- **Canada first**: Canadian jobs always rank above US jobs; provinces before states; Canadian platforms before US ones; dashboard opens on Canada.
- **Where each job is posted**: every portal the job was found on, employer site first, with an Apply button for each.
- **My jobs**: Saved and **Applied** tabs (Apply clicks are tracked automatically, only in the browser).
- **Company pages**: all jobs at a company + its career site.
- **Dashboard**: totals, 30-day trend, industries, provinces/states, cities, employers, tools, certifications, skills, source status.
- **Sources** page, **Terms**, **Privacy**, **Data attribution**; light/dark mode.

## Project layout
- `scripts/collect.ts` — the collector (Canada-first plan, per-source budgets, dedupe, writes `public/data/*`).
- `config/companies.txt` — employers whose public job boards are checked.
- `.github/workflows/deploy.yml` — hourly: restore data → collect → build → GitHub Pages (a copy lives in `setup/deploy.yml`; the publish script installs it).
- `lib/aggregator/` — source adapters, normalisation, fingerprint de-duplication, portal detection, enrichment, stats; `query.ts` is the in-browser search.
- `app/` — pages (`/`, `/job/?id=`, `/company/?name=`, `/dashboard`, `/saved`, `/sources`, legal pages).
- `lib/brand.ts` — name, tagline, author, contact email.

## Honest limits
- No site can list *every* job: LinkedIn and Indeed don’t allow copying their listings (and scraping them breaks their terms). Jobvexa links to them instead, and JSearch tells us when a job is also posted there.
- “Live” means refreshed every hour (GitHub sometimes starts scheduled runs a few minutes late). Truly instant, per-search results would need a paid server. A listing can be filled before the next refresh notices.
- GitHub pauses scheduled workflows after 60 days without commits; the workflow re-enables itself weekly to prevent that. If updates ever stop, open the Actions tab and click *Enable workflow*.

## Before you publish (checklist)
1. **Name**: “Jobvexa” is set in `lib/brand.ts`. A web search found no exact match, but that is not legal clearance, and “Jobvite” (recruiting software) sounds similar in the same industry. Check the Canadian Trademarks Database (CIPO) and USPTO before promoting it.
2. **Contact email** in `lib/brand.ts` appears publicly on the legal pages — consider a dedicated address.
3. **Legal review**: Terms, Privacy and Attribution are good-faith starting points, not legal advice.
4. **Provider terms**: read the current terms of every API you enable. Some limit caching or public display, and Adzuna requires the “Jobs by Adzuna” attribution (included).
5. **Don’t add scraping** of LinkedIn, Indeed, Glassdoor or similar.
6. **Analytics/cookies**: none included. If you add any, update the Privacy page and add consent as required.

## Credits
Created by **Karthic** (karthicjr17@gmail.com).
