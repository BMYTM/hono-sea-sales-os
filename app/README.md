# HONO Sales OS — private team app

The complete HONO SEA sales system in one private application: the full sales dashboard **and** the live proposal engine, sharing one client archive. It runs on your own hardware, is protected by a team password, and never sends anything to the internet.

- **Dashboard** (`/`) — CEO review, pipeline, demand generator, account strategy, and quick links into every tool.
- **Proposal Studio** (`/studio`) — generates real, client-ready HONO proposal `.docx` + PDF from your base template (multi-version, Excel checklist import, mandatory-clause safety check) into shared client folders.
- **RFP Library** (`/rfp`) — stores old & new RFPs and **auto-fills a new RFP from your past answers**: import a past RFP (Question + Answer), then upload a new RFP's questions and it suggests answers with a confidence score and the source, flagging low-confidence ones for review, and exports a filled `.xlsx`.
- **Sales Assets** (`/decks`) — a shared shelf for the corporate deck, solution decks, case studies, one-pagers, battlecards and price sheets, with upload, search and download.

Because it handles real client data, it is **private by design** — this is the counterpart to the public `bmytm.github.io/hono-sea-sales-os` showcase, which stays sample-data only.

---

## Choose how your team runs it

### Option A — One shared machine (recommended for a team)

Run it once on an always-on Mac or mini-server; everyone opens it in their browser. This gives the whole team **one shared proposal archive** and one place to work.

**With Docker (simplest to keep running):**

```bash
# point at your shared proposal folder (OneDrive/SharePoint synced on this host)
export HONO_HOST_PROPOSAL_DIR="$HOME/Library/CloudStorage/OneDrive-HONO/Proposal Generation"
# set a team password in docker-compose.yml first, then:
docker compose up -d --build
```

Teammates open `http://<that-machine's-IP>:8765` and log in with the team password.

**Without Docker:** on the shared machine, edit `config.env` (set `HONO_HOST="0.0.0.0"` and a `HONO_PASSWORD`), then `./run.sh`. Teammates browse to `http://<machine-ip>:8765`.

### Option B — Each teammate on their own Mac

Everyone runs `./run.sh` locally. Point `HONO_PROJECT_DIR` (in `config.env`) at the **same OneDrive/SharePoint-synced folder** so the archive stays shared, while the app itself stays localhost-private on each machine.

---

## One-time setup

1. Unzip this folder somewhere permanent.
2. Open **`config.env`** and set:
   - `HONO_PROJECT_DIR` → your shared proposal folder (the one holding client folders + the base template). For team sharing, use the OneDrive/SharePoint path everyone syncs.
   - `HONO_PASSWORD` → a shared password (only needed if others reach it over the network).
   - `HONO_HOST` → `127.0.0.1` for this-machine-only, or `0.0.0.0` to let the team connect.
3. Launch: `./run.sh` (needs Python 3, which macOS already has), or `docker compose up -d --build`.
4. The top banner turns **green** when it finds your template and folder.

---

## What the Proposal Studio does

Same engine and rules as your `hono-proposal-builder` skill:

- **Multi-version** — one client, many scopes (Non-AF, All-Entities…), each with its own countries/PEPM/modules, generated together into the client folder.
- **Excel checklist import** — reads Sheet 2 (countries + headcount) and Sheet 3 (module Include?/Priority): No → removed, Maybe/Future → deferred, Phase 2 → noted.
- **Pricing** — annual = headcount × PEPM × 12; implementation = 75% of annual.
- **Safety** — refuses to save any proposal missing the **Headless API & Token Usage** clause.
- **Output** — `HONO_HCM Proposal_<DDMMYYYY>_<Short>_<Scope>.docx` in `…/<ClientShort>/`, with Proposal ID `<CODE>-<SCOPE>-<DDMMYYYY>`.
- **PDF preview** — when LibreOffice is present, preview the cover/note/commercial pages before sending.

The patch logic is your skill's `patch_proposal.py`, unchanged; `merge_runs.py` is a dependency-free re-implementation so it runs outside a Claude session.

---

## Keeping the public repo private (optional)

If you'd rather the GitHub showcase not be public, in the repo go to **Settings → General → Danger Zone → Change visibility → Private**. Note: GitHub Pages then needs a paid plan to stay live — but you don't need Pages once the team uses this private app.

---

## Security notes

- Localhost by default; only reachable on the network if you set `HONO_HOST=0.0.0.0`, and then only behind the team password.
- Never deletes anything — only creates client folders and writes new files.
- Keep the shared folder on OneDrive/SharePoint so proposals back up and sync automatically.

---

*Prepared for Boonchoo Malhotra, SEA Business Head — HONO.*
