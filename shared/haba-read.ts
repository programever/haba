// Haba read: marks "read" in Haba when Iker has spent 3 minutes on a DeViDa or Rebo page (Iker, 2026-10-21).
// Time counts while the page is on screen, and also while its sound plays (also with the phone locked:
// the browser remembers which parts of the sound were played). Once per day, like every Haba mark.
// DeViDa and Rebo load the built file haba-read.js (made from this one, see README.md in this folder).
import { markHaba, habaDay } from './haba-mark.ts';

const NEED_SECONDS = 180;
const FLAG = 'haba-read'; // on this phone: the last day already marked, so it does not ask Haba again

let onScreen = 0;
let day = habaDay(new Date());
let busy = false;
let retryAt = 0;

/** Seconds of sound played on this page, from every sound player on it. */
function listened(): number {
  let s = 0;
  for (const a of Array.from(document.querySelectorAll('audio'))) {
    for (let i = 0; i < a.played.length; i++) s += a.played.end(i) - a.played.start(i);
  }
  return s;
}

function markedToday(): boolean {
  try { return localStorage.getItem(FLAG) === habaDay(new Date()); } catch { return false; }
}

async function check(): Promise<void> {
  if (busy || Date.now() < retryAt || markedToday()) return;
  if (onScreen + listened() < NEED_SECONDS) return;
  busy = true;
  try {
    await markHaba('read');
    try { localStorage.setItem(FLAG, habaDay(new Date())); } catch { /* private window: Haba still says "already" next time */ }
  } catch (e) {
    console.warn('Could not mark "read" in Haba:', e);
    retryAt = Date.now() + 60_000; // no network: try again in a minute
  } finally {
    busy = false;
  }
}

setInterval(() => {
  const now = habaDay(new Date());
  if (now !== day) { day = now; onScreen = 0; } // the page stayed open past 04:00: a new day starts from zero
  if (document.visibilityState === 'visible') onScreen += 1;
  void check();
}, 1000);
// When sound stops while the phone is locked, the timer above may sleep; these run on the way back.
document.addEventListener('pause', () => void check(), true);
document.addEventListener('ended', () => void check(), true);
document.addEventListener('visibilitychange', () => void check());
