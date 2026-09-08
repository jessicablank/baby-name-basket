# baby-name-basket

A tiny static site for collecting baby name suggestions. Visitors fill in a short
form, and each submission is appended as a row in a private Google Sheet. There is
no build step and no server — just HTML, CSS, and one JS file.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page markup |
| `style.css` | Styles |
| `script.js` | Form validation, submission, QR code |
| `config.example.js` | Template for local config (committed) |
| `config.js` | Your real config — **gitignored, never committed** |

## Setup

### 1. Local config

```sh
cp config.example.js config.js
```

Then fill in `config.js` with your Web App URL and token (both from the steps
below). `index.html` loads `config.js` before `script.js`, which reads the values
off `window.APP_CONFIG`.

If `config.js` is missing, the form falls back to a simulated success and logs a
warning instead of throwing. Handy for styling work, confusing if you forget.

### 2. The Google Sheet

Create a sheet with a tab named `Submissions` and these headers in row 1:

| A | B | C | D | E |
| --- | --- | --- | --- | --- |
| Timestamp | Name | Meaning | From | User Agent |

Freeze row 1 (View → Freeze → 1 row) so sorting doesn't scramble the headers.

`Timestamp` is written server-side, so it's trustworthy. The client also sends its
own `submittedAt`, which is ignored — it's whatever the visitor's clock says.

### 3. The Apps Script

From the sheet: Extensions → Apps Script. Replace the contents of `Code.gs` with:

```javascript
const SHEET_NAME = 'Submissions';
const MAX_LEN = { name: 80, meaning: 500, from: 80 };

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return json({ success: false });

    const body = JSON.parse(e.postData.contents);

    const expected = PropertiesService.getScriptProperties().getProperty('SHARED_TOKEN');
    if (expected && body.token !== expected) {
      return json({ success: false, error: 'unauthorized' });
    }

    const name = clean(body.name, MAX_LEN.name);
    if (!name) return json({ success: false, error: 'name required' });

    // Serialize appends so concurrent submits can't overwrite the same row
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
      sheet.appendRow([
        new Date(),
        name,
        clean(body.meaning, MAX_LEN.meaning),
        clean(body.from, MAX_LEN.from),
        clean(body.userAgent, 200),
      ]);
    } finally {
      lock.releaseLock();
    }

    return json({ success: true });
  } catch (err) {
    console.error(err);
    return json({ success: false });
  }
}

// Leading apostrophe stops Sheets from evaluating =, +, -, @ as a formula
function clean(value, maxLen) {
  const str = String(value == null ? '' : value).trim().slice(0, maxLen);
  return /^[=+\-@\t\r]/.test(str) ? "'" + str : str;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### 4. The shared token

Generate a random string — any long, unguessable value will do:

```sh
# macOS / Linux
openssl rand -base64 24

# Windows PowerShell
[Convert]::ToBase64String((1..24 | ForEach-Object { Get-Random -Max 256 }))
```

Put the **same value** in two places:

1. Apps Script → Project Settings → Script Properties → Add, named `SHARED_TOKEN`.
2. `config.js`, as `SHEETS_TOKEN`.

Script Properties live outside your Apps Script source, so the token stays out of
any export or copy of the code.

Leave `SHARED_TOKEN` unset to skip the check entirely, which is useful while testing.

### 5. Deploy the script

Deploy → New deployment → type **Web app**:

- Execute as: **Me**
- Who has access: **Anyone**

"Anyone" (not "Anyone with Google account") is required, since your visitors won't
be signed in. Copy the `/exec` URL into `config.js`.

**Editing the code does not update the live URL.** After any change you must go to
Deploy → Manage deployments → edit → Version: **New version**, or use a test
deployment while iterating.

## Security notes

Worth understanding before sharing the link widely:

- **Nothing here is secret from visitors.** This is a static site, so the Web App
  URL and the token are both downloaded by every browser that loads the page. The
  `.gitignore` keeps them out of the repo; it does not keep them out of DevTools.
- **The token only stops drive-by bots.** It prevents an endpoint discovered by a
  crawler from being trivially spammed. Anyone who views source can read it and post
  directly. Treat it as a speed bump, not a lock.
- **The real protections are in `Code.gs`**: the length caps, the required-name
  check, and `clean()`.
- **`clean()` guards against CSV injection.** A submitted value like
  `=IMPORTXML(...)` would otherwise be evaluated by Sheets as a formula and could
  exfiltrate data from your sheet to an external URL. The leading apostrophe forces
  it to stay text.
- **To rotate the token**, change it in both Script Properties and `config.js`. No
  redeploy needed — Script Properties are read at execution time.
- If the endpoint does get abused, the fastest kill switch is Deploy → Manage
  deployments → Archive.

## Why `text/plain`?

`script.js` posts with `Content-Type: text/plain;charset=utf-8`, not
`application/json`. This looks wrong but is deliberate.

Sending `application/json` cross-origin triggers a CORS preflight `OPTIONS`
request. Apps Script web apps don't respond to `OPTIONS`, so the preflight fails and
the real POST never fires. `text/plain` qualifies as a CORS "simple request",
skipping preflight. The body is still JSON — `Code.gs` parses it explicitly with
`JSON.parse`.

## Deploying to Vercel

`config.js` is gitignored, so Vercel clones a repo that doesn't contain it. Rather
than committing it, `build-config.js` regenerates it at build time from environment
variables. `vercel.json` wires that up:

```json
{
  "buildCommand": "node build-config.js",
  "outputDirectory": ".",
  "framework": null
}
```

The build **fails loudly** if either variable is missing. That's deliberate — a
missing config would otherwise deploy a site whose form silently pretends to work.

### First deploy

```sh
vercel link          # create/connect the project

vercel env add SHEETS_WEB_APP_URL production
vercel env add SHEETS_TOKEN production

vercel --prod
```

Repeat the two `env add` commands for `preview` and `development` if you want
preview deployments to work too. Values are prompted for, not passed as arguments,
so they stay out of your shell history.

After linking, pushes to `main` deploy automatically — `vercel --prod` is only
needed for the first deploy or manual redeploys.

### Updating a value

Environment variables are read at **build** time, so changing one requires a
redeploy before it takes effect:

```sh
vercel env rm SHEETS_WEB_APP_URL production
vercel env add SHEETS_WEB_APP_URL production
vercel --prod
```

### Local builds

Don't run `node build-config.js` locally without the variables set — it exits
without writing, but with them set it overwrites your hand-written `config.js`.
For local work, just edit `config.js` directly.

### Windows note

If `vercel` fails with a `PSSecurityException`, PowerShell's execution policy is
blocking the `.ps1` shim. Use `vercel.cmd` instead, or run
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Troubleshooting

**Form always "succeeds" but the sheet is empty.** `config.js` is missing or
`SHEETS_WEB_APP_URL` is blank, so the simulated path ran. Check the browser console
for the warning.

**Nothing appears under Apps Script → Executions.** The request never reached
Google. Almost always a stale `/exec` URL or the deployment access setting.

**Execution runs but returns `unauthorized`.** The token in `config.js` doesn't
match `SHARED_TOKEN` in Script Properties. Watch for trailing whitespace.

**CORS error in the console.** Something reverted the request to
`application/json`. See the section above.
