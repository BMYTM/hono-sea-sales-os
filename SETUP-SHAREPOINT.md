# Connecting the HONO Sales Toolkit to SharePoint (for IT)

**What this is:** The HONO Sales Toolkit (a static web page at
`https://bmytm.github.io/hono-sea-sales-os/`) can open the team's proposal and
asset files directly from SharePoint/OneDrive and search them live. To do that
it signs the user in with their normal Microsoft 365 account and reads files
**on their behalf**. This requires a one‑time **Azure app registration**.

**Time required:** ~10 minutes. **Cost:** none. **What we need back:** two IDs
(Application/client ID and Directory/tenant ID). Neither is a secret.

---

## Security summary (please read)

- This is a **public‑client / SPA** registration. There is **no client secret**,
  so nothing sensitive is embedded in the web page.
- Permissions are **delegated** — the app can only ever see what the
  **signed‑in user** can already see in SharePoint. It grants no new access and
  cannot act without an interactive sign‑in.
- All requested scopes are **read‑only** (`Files.Read.All`, `Sites.Read.All`,
  `User.Read`). The app never writes, deletes, or shares files.
- Sign‑in tokens live only in the user's browser. No credentials are stored on
  the page or on GitHub.

---

## Step 1 — Create the app registration

1. Go to **portal.azure.com** → **Microsoft Entra ID** (formerly Azure Active
   Directory) → **App registrations** → **New registration**.
2. **Name:** `HONO Sales Toolkit`
3. **Supported account types:** *Accounts in this organizational directory only
   (Single tenant)*.
4. **Redirect URI:** choose platform **Single‑page application (SPA)** and add:
   ```
   https://bmytm.github.io/hono-sea-sales-os/decks.html
   ```
5. Click **Register**.

> If sign‑in is later added to other pages, add these SPA redirect URIs too:
> `https://bmytm.github.io/hono-sea-sales-os/` and
> `https://bmytm.github.io/hono-sea-sales-os/assistant.html`.
> The redirect URI must be under **Single‑page application**, *not* "Web".

## Step 2 — Add API permissions

1. In the new app → **API permissions** → **Add a permission** → **Microsoft
   Graph** → **Delegated permissions**.
2. Add all three:
   - `User.Read`
   - `Files.Read.All`
   - `Sites.Read.All`
3. Click **Add permissions**, then **Grant admin consent for <your org>**
   (a Global Admin does this once so users aren't prompted individually).

## Step 3 — Confirm SPA + token settings

1. **Authentication** → confirm the redirect URI from Step 1 is listed under
   **Single‑page application**.
2. No "implicit grant" checkboxes are needed (MSAL uses the modern auth‑code +
   PKCE flow automatically).

## Step 4 — Send us the two IDs

From the app's **Overview** page, copy:

- **Application (client) ID** → e.g. `11111111-2222-3333-4444-555555555555`
- **Directory (tenant) ID** → e.g. `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`

Give both to Boonchoo. (They are safe to email — they are identifiers, not
passwords.)

---

## How the user turns it on (once you've sent the IDs)

1. Open **https://bmytm.github.io/hono-sea-sales-os/decks.html**
2. Click **⚙ Set up live SharePoint** in the connection bar.
3. Paste the **client ID** and **tenant ID**, click **Save**.
4. Click **🔓 Sign in to SharePoint** and complete the normal Microsoft login.

After that, every asset opens live (by its internal ID — always the current
version, no broken links), and the search box also returns live SharePoint
results.

## Troubleshooting

- **"AADSTS50011: redirect URI mismatch"** — the redirect URI in Step 1 must
  match the page URL exactly (including `decks.html`) and be under the **SPA**
  platform.
- **"Need admin approval"** — admin consent (Step 2.3) wasn't granted.
- **Files still won't open** — confirm the signed‑in user actually has access to
  that file in SharePoint; the app can't exceed the user's own permissions.
