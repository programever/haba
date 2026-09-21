# Haba

A small website with two tabs. Tab one has ten big buttons: press one and it
records that item for today. Tab two shows the report: this week against last
week, one small graph per item for the last four weeks, days in a row, and this
month against last month.

The page is on GitHub Pages: https://programever.github.io/haba/

There is no server of our own. The data lives in a Firestore database (Google,
project `habits-433f8`), in a list called `records`. Each record is one small
document: `{"t": "2026-09-21T22:10:05+07:00", "item": "spend"}`.

The Firebase config block at the top of `src/app.ts` is public by design. It
only names the project. What protects the data is the set of rules in the
Firebase console (Firestore Database, Rules tab):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /records/{id} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasOnly(['t', 'item'])
        && request.resource.data.t is string
        && request.resource.data.t.size() == 25
        && request.resource.data.item in ['core', 'jog', 'read', 'meditate', 'kid', 'wife', 'spend', 'drink', 'work', 'problem'];
      allow delete: if true;
      allow update: if false;
    }
  }
}
```

In plain words: anyone can read, anyone can add a record that has the right
shape, anyone can delete, nobody can change a record after it is written.

## Files

| File | What it is |
|---|---|
| `src/index.html` | The page. Both tabs. |
| `src/style.css` | The look. Light and dark mode. |
| `src/report.ts` | The counting code. No browser things, so it can be tested with node. |
| `src/app.ts` | The page logic: buttons, Firestore, drawing the report. |
| `src/manifest.webmanifest`, `src/icon*.` | Home-screen icon and app name. |
| `test/report.test.ts` | Tests for the counting code. |
| `test/browser.test.ts` | Test of the whole page in a headless browser against the real database. Adds a few records and removes them again. |
| `build.mjs` | The build: bundles `src/app.ts` with Firebase into `dist/app.js`, copies the static files. |
| `.github/workflows/deploy.yml` | Build and deploy on every push to `main`. |

Everything is TypeScript. The build turns it into one JavaScript file.

## Build and deploy

Every push to `main` runs the workflow in `.github/workflows/deploy.yml` on
GitHub's machines. It installs the tools, type-checks, runs the tests, builds
`dist/`, and pushes `dist/` to the `gh-pages` branch as one fresh commit.
GitHub Pages serves that branch. It takes about one minute.

On a computer:

```
npm install            # once
npm test               # type-check and counting tests
npm run build          # makes dist/
npm run serve          # opens dist/ on http://127.0.0.1:8765
npm run test:browser   # needs: npx playwright install chromium
```

`main` is kept as one squashed commit on purpose (Iker, 2026-09-21), and
`gh-pages` is rebuilt as one fresh commit on every deploy. Both are
force-pushed. That is fine here: the repo is small and only Alpha writes to it.

## Rules of the counting

- One press is one time. There are no minutes or amounts.
- A day starts at 04:00, not at midnight. A press at 01:00 counts for the
  evening before.
- Weeks start on Monday.
- "Days in a row" counts back from today. If today has nothing yet, it counts
  back from yesterday and shows "not yet".
- Spend and drink are counted the same way as the others. Only numbers.
- Old "smoke" records may still exist in the database. The page ignores names it does not know.
- Work and Problem say what kind of day it was: "I worked", "I had to solve a problem".
  They are counted, but they have no "days in a row".

## Offline

Firestore keeps a copy of the records in the phone's browser. A press made
without internet shows "not saved yet" and is sent when the phone is back
online. The page listens for changes, so a press on one device shows on
another within a second or two.

## Cost

The free plan allows 20,000 writes and 50,000 reads per day. Each press is
one write. The page only downloads records that changed since the last visit,
so reads stay small. This stays free.
