#!/usr/bin/env node
/*
 * Puzzle-data validator for the Anatomy Social Games.
 *
 * Parses the game data embedded in each index.html and checks the invariants
 * every game relies on. It changes nothing — it only reads the files and exits
 * non-zero if any puzzle is malformed, so bad content can't ship unnoticed.
 *
 *   node tests/validate.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

let failures = 0;
const fail = (msg) => { failures++; console.error("  ✗ " + msg); };
const ok = (msg) => console.log("  ✓ " + msg);

// Pull a `const NAME = [ ... ];` array literal out of a game file and eval it.
function extractArray(html, name) {
  const m = html.match(new RegExp("const " + name + " = \\[([\\s\\S]*?)\\n  \\];"));
  if (!m) throw new Error("could not find " + name);
  // eslint-disable-next-line no-eval
  return eval("([" + m[1] + "\n  ])");
}

const FILLED = [];
for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!(r % 2 === 1 && c % 2 === 1)) FILLED.push([r, c]);
function greedySwaps(cur, sol) {
  cur = cur.slice(); let sw = 0;
  for (let i = 0; i < cur.length; i++) {
    if (cur[i] === sol[i]) continue;
    let best = -1;
    for (let j = i + 1; j < cur.length; j++) {
      if (cur[j] === sol[i]) { if (cur[i] === sol[j]) { best = j; break; } if (best < 0) best = j; }
    }
    if (best < 0) continue;
    [cur[i], cur[best]] = [cur[best], cur[i]]; sw++;
  }
  return sw;
}

/* ── Wordle ── */
function checkWordle() {
  console.log("Wordle");
  const html = read("Wordle/index.html");
  const words = html.match(/const WORDS = \[([\s\S]*?)\n  \];/)[1].match(/"[a-z]+"/g).map((x) => x.slice(1, -1));
  const bad = words.filter((w) => w.length !== 5);
  bad.length ? fail("non-5-letter answers: " + bad.join(", ")) : ok(words.length + " answers, all 5 letters");
  const dupes = words.filter((w, i) => words.indexOf(w) !== i);
  dupes.length ? fail("duplicate answers: " + [...new Set(dupes)].join(", ")) : ok("no duplicate answers");
  const blob = html.match(/const GUESS_BLOB = "([a-z]+)"/)[1];
  blob.length % 5 === 0 ? ok("guess list is a clean 5-char blob (" + blob.length / 5 + " words)") : fail("GUESS_BLOB length not a multiple of 5");
  const valid = new Set(); for (let i = 0; i < blob.length; i += 5) valid.add(blob.substr(i, 5)); words.forEach((w) => valid.add(w));
  const notGuessable = words.filter((w) => !valid.has(w));
  notGuessable.length ? fail("answers not in guess set: " + notGuessable.join(", ")) : ok("every answer is a legal guess");
  return words;
}

/* ── Hangman ── */
function checkHangman() {
  console.log("Hangman");
  const html = read("Hangman/index.html");
  const list = extractArray(html, "WORDS");
  let bad = 0;
  list.forEach((e) => { if (!e || typeof e.w !== "string" || !/^[a-z ]{2,}$/.test(e.w) || !e.h || e.h.length < 4) bad++; });
  bad ? fail(bad + " malformed entries (need lowercase w + hint)") : ok(list.length + " terms, each with a hint");
}

/* ── Rootle ── */
function checkRootle() {
  console.log("Rootle");
  const html = read("Rootle/index.html");
  const puzzles = extractArray(html, "PUZZLES");
  const distractors = eval(html.match(/const DISTRACTORS = (\[[\s\S]*?\]);/)[1]);
  let issues = 0;
  puzzles.forEach((p, i) => {
    if (!Array.isArray(p.terms) || p.terms.length !== 4) { fail("puzzle " + i + " is not 4 terms"); issues++; }
    p.terms.forEach((t) => {
      const w = t.roots.map((r) => r[0]).join("");
      if (!/^[a-z]+$/.test(w)) { fail("bad root concat: " + JSON.stringify(t.roots)); issues++; }
      if (!t.def) { fail("missing clue in puzzle " + i); issues++; }
    });
    const usedFrags = new Set(p.terms.flatMap((t) => t.roots.map((r) => r[0])));
    const real = p.terms.reduce((n, t) => n + t.roots.length, 0);
    const avail = distractors.filter((f) => !usedFrags.has(f)).length;
    if (real + Math.min(Math.max(0, 12 - real), avail) !== 12) { fail("puzzle " + i + " cannot fill 12 tiles"); issues++; }
  });
  if (!issues) ok(puzzles.length + " puzzles: 4 terms each, roots concat cleanly, 12 tiles fillable");
}

/* ── Connections ── */
function checkConnections() {
  console.log("Connections");
  const html = read("Connections/index.html");
  const puzzles = extractArray(html, "PUZZLES");
  let issues = 0;
  puzzles.forEach((p, i) => {
    if (p.groups.length !== 4) { fail("puzzle " + i + " not 4 groups"); issues++; }
    const words = [];
    p.groups.forEach((g) => {
      if (g.words.length !== 4) { fail("puzzle " + i + " group '" + g.title + "' not 4 words"); issues++; }
      if (!g.title) { fail("puzzle " + i + " group missing title"); issues++; }
      g.words.forEach((w) => words.push(w));
    });
    if (new Set(words).size !== 16) { fail("puzzle " + i + " has duplicate words"); issues++; }
  });
  if (!issues) ok(puzzles.length + " puzzles: 4×4 groups, 16 unique words each");
}

/* ── Waffle ── */
function checkWaffle(wordleAnswers) {
  console.log("Waffle");
  const html = read("Waffle/index.html");
  const puzzles = extractArray(html, "PUZZLES");
  const glossary = eval("(" + html.match(/const GLOSSARY = (\{[\s\S]*?\});/)[1] + ")");
  let issues = 0;
  const waffleWords = new Set();
  puzzles.forEach((p, i) => {
    const sol = p.sol, scr = p.scr;
    const solC = FILLED.map(([r, c]) => sol[r][c]);
    const scrC = FILLED.map(([r, c]) => scr[r][c]);
    if (solC.slice().sort().join("") !== scrC.slice().sort().join("")) { fail("puzzle " + i + " scramble/solution letters differ"); issues++; }
    if (FILLED.some(([r, c], k) => scrC[k] === sol[r][c])) { fail("puzzle " + i + " starts with a green tile"); issues++; }
    if (greedySwaps(scrC, solC) > 20) { fail("puzzle " + i + " needs too many swaps"); issues++; }
    const g = sol.map((r) => r.split(""));
    [sol[0], sol[2], sol[4]].forEach((w) => waffleWords.add(w));
    [0, 2, 4].forEach((c) => waffleWords.add([0, 1, 2, 3, 4].map((r) => g[r][c]).join("")));
  });
  if (!issues) ok(puzzles.length + " puzzles: valid multiset, no initial greens, solvable");
  const missing = [...waffleWords, ...wordleAnswers].filter((w) => !glossary[w]);
  missing.length ? fail("glossary missing definitions: " + [...new Set(missing)].join(", ")) : ok("glossary covers every Waffle word + Wordle answer");
}

console.log("Validating puzzle data…\n");
try {
  const answers = checkWordle();
  checkHangman();
  checkRootle();
  checkConnections();
  checkWaffle(answers);
} catch (e) {
  fail("validator error: " + e.message);
}

console.log("");
if (failures) { console.error(failures + " problem(s) found."); process.exit(1); }
console.log("All checks passed.");
