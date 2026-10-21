# Shared: Haba marks from other apps

Iker asked on 2026-10-21 that the other apps of Alpha mark Haba by themselves:

| App | When | Haba item |
|---|---|---|
| Medi | a session ends with the end bell | Meditate (`meditate`) |
| Cismo | Iker presses "I smoked" | Problem (`problem`) |
| Trani | Iker marks a training day done. Running gives Jogging, core exercises give Core. Taking the done mark away removes them again. | Jogging (`jog`), Core (`core`) |
| DeViDa, Rebo | Iker spends 3 minutes on the page, reading or listening | Read (`read`) |

Every mark follows Haba's rule: at most once per day, and a day starts at 04:00.

- `haba-mark.ts` adds or removes one mark. It uses the plain web address of
  Haba's Firestore database (Google's online database), with no Firebase
  library. It writes exactly the record Haba writes, `{t, item}`, so the
  Firestore rules do not change.
- `haba-read.ts` counts the 3 minutes for DeViDa and Rebo.

This folder is the master copy. Medi, Trani and Cismo keep the same
`haba-mark.ts` in their `src/`. DeViDa and Rebo are Python projects without a
build step, so they keep one ready JavaScript file, `assets/haba-read.js`,
made from `haba-read.ts` with:

```
npx esbuild shared/haba-read.ts --bundle --format=esm --target=es2020 --outfile=/tmp/haba-read.js \
  "--banner:js=// Made from haba/shared/haba-read.ts (repo programever/haba). Do not edit here: change the master, build, copy. Marks \"read\" in Haba after 3 minutes on this page."
```

After a change here: run `npm test` (it tests `haba-mark.ts` against a fake
database, so no real data is touched), then copy the files to the five apps.
