# HONO SEA Sales OS

A single-page **sales operating system** for HONO's Southeast Asia region — one workspace that ties together demand generation, proposal creation, pipeline visibility, account-level closure and an executive review dashboard.

Built as a self-contained `index.html` (no build step, no dependencies, no server required). Open it in any browser.

> **Data note:** This app ships with **illustrative sample data only**. It does **not** connect to, read from, or write to the live SEA Dashboard. Where live figures are needed, the intended integration is **read-only** (mirror), so existing dashboard data is never modified — if a working copy is ever required, it is **duplicated**, never edited in place.

---

## Modules

| Module | What it does |
|---|---|
| **Home** | Overview KPIs and quick access to every module. |
| **CEO Review Dashboard** | Executive rollup — quota attainment by market, closed + weighted forecast, top deals, at-risk deals. Read-only. |
| **Proposal Generator** | Configure client, market, headcount, modules, tier and term → computes ACV/TCV on per-employee-per-month rates → renders a ready-to-send proposal. |
| **Demand Generator** | Build a campaign and project the funnel (target accounts → MQL → SQL → opportunities → bookings) with a recommended channel mix. |
| **Pipeline (SEA)** | Read-only mirror of the SEA Dashboard — kanban by stage, weighted forecast, clickable deals. Never writes back. |
| **Account Strategy & Closure** | MEDDICC scorecard with live deal-health gauge, buying-group map, mutual close plan and auto next-best-action. |
| **Content Library** | The four governed SharePoint pillars: Proposals & Pricing, Decks & Collateral, Playbooks & Process, Deal & Client Records. |

---

## Run it

Just open `index.html` in a browser — that's it.

To publish it as a live URL for the team, enable **GitHub Pages**:

1. Repo → **Settings** → **Pages**
2. **Source:** Deploy from a branch → **main** → **/ (root)**
3. Save. The site goes live at `https://<your-username>.github.io/<repo-name>/`

`portal-design.html` is the original portal concept/landing design kept for reference.

---

## Configuring for production

The sample data lives in clearly-marked constants near the top of the `<script>` block in `index.html`:

- `MARKETS` — countries, quotas, closed-to-date
- `DEALS` — pipeline records (the read-only mirror)
- `MODULES` / `TIERS` / `TERMS` — proposal pricing model (swap in your live price book)
- `DTYPES` — demand-gen conversion benchmarks (calibrate to real SEA history)
- `MEDDICC` — qualification framework

**Recommended next step for a true production system:** wire the Pipeline and CEO views to read the SEA Dashboard as source of record (SharePoint list / Excel / API), and have the generators write outputs into the SharePoint content libraries. All live-data access stays read-only or duplicated — the source dashboard is not altered.

---

## Stack

Plain HTML + CSS + vanilla JavaScript. No frameworks, no external calls, no browser storage. Everything runs client-side and in-memory.

---

*Prepared for Boonchoo Malhotra, SEA Business Head — HONO.*
