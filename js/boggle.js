// Boggle mode: everyone gets the same letter grid and hunts for words on their own phone.
// The host's phone holds the word list and decides which words count.

// Classic dice. "Q" always comes up as "Qu".
const BOGGLE_DICE = {
  4: ["AAEEGN","ABBJOO","ACHOPS","AFFKPS","AOOTTW","CIMOTU","DEILRX","DELRVY","DISTTY","EEGHNW","EEINSU","EHRTVW","EIOSST","ELRTTY","HIMNQU","HLNNRZ"],
  5: ["AAAFRS","AAEEEE","AAFIRS","ADENNN","AEEEEM","AEEGMU","AEGMNN","AFIRSY","BJKQXZ","CCENST","CEIILT","CEILPT","CEIPST","DDHNOT","DHHLOR","DHLNOR","DHLNOR","EIIITT","EMOTTT","ENSSSU","FIPRSY","GORRVW","IPRRRY","NOOTUW","OOOTTU"]
};
const BOGGLE_DEFAULTS = { mode: "claim", size: 4, mins: 3 };
const minLenFor = size => size === 5 ? 4 : 3;
const wordPts = w => w.length <= 4 ? 1 : w.length === 5 ? 2 : w.length === 6 ? 3 : w.length === 7 ? 5 : 11;
const sortWords = ws => ws.slice().sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const cleanWord = s => String(s || "").toLowerCase().replace(/[^a-z]/g, "");

// The word list (ENABLE, public domain) is only loaded on the host's phone.
const DICT = { words: null, set: null, loading: null };
function loadDict() {
  if (DICT.set) return Promise.resolve();
  if (!DICT.loading) {
    DICT.loading = fetch("data/words.txt?v=1").then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(t => {
      DICT.words = t.split("\n").map(w => w.trim()).filter(Boolean);
      DICT.set = new Set(DICT.words);
    }).catch(e => { DICT.loading = null; throw e; });
  }
  return DICT.loading;
}
// The list is sorted, so a binary search tells whether any word starts with p.
function hasPrefix(p) {
  const ws = DICT.words; let lo = 0, hi = ws.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ws[mid] < p) lo = mid + 1; else hi = mid; }
  return lo < ws.length && ws[lo].startsWith(p);
}

const NEIGHBORS = {};
function neighbors(size) {
  if (NEIGHBORS[size]) return NEIGHBORS[size];
  const nb = [];
  for (let i = 0; i < size * size; i++) {
    const r = Math.floor(i / size), c = i % size, list = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < size && cc >= 0 && cc < size) list.push(rr * size + cc);
    }
    nb.push(list);
  }
  return (NEIGHBORS[size] = nb);
}
const touching = (size, i, j) => neighbors(size)[i].includes(j);

function rollGrid(size) {
  return shuffle(BOGGLE_DICE[size]).map(d => { const f = pick(d.split("")); return f === "Q" ? "Qu" : f; });
}

// Tile indexes that spell the word, or null if it can't be traced on this grid.
function findPath(grid, size, word) {
  const nb = neighbors(size), used = new Array(grid.length).fill(false), path = [];
  const go = (i, pos) => {
    const t = grid[i].toLowerCase();
    if (!word.startsWith(t, pos)) return false;
    path.push(i); used[i] = true;
    if (pos + t.length === word.length) return true;
    for (const j of nb[i]) if (!used[j] && go(j, pos + t.length)) return true;
    path.pop(); used[i] = false;
    return false;
  };
  for (let i = 0; i < grid.length; i++) if (go(i, 0)) return path;
  return null;
}

// Every dictionary word on the grid.
function solveGrid(grid, size, minLen) {
  const nb = neighbors(size), used = new Array(grid.length).fill(false), found = new Set();
  const dfs = (i, s) => {
    s += grid[i].toLowerCase();
    if (!hasPrefix(s)) return;
    if (s.length >= minLen && DICT.set.has(s)) found.add(s);
    used[i] = true;
    for (const j of nb[i]) if (!used[j]) dfs(j, s);
    used[i] = false;
  };
  for (let i = 0; i < grid.length; i++) dfs(i, "");
  return [...found];
}

/* ---------- Host side ---------- */

const boggleHost = {
  // Roll until the board has a decent number of words.
  newRound(G, seats) {
    const set = { ...BOGGLE_DEFAULTS, ...(G.bset || {}) }, minLen = minLenFor(set.size), want = set.size === 5 ? 120 : 45;
    let grid, sol = [];
    for (let t = 0; t < 40 && sol.length < want; t++) { const g = rollGrid(set.size), s = solveGrid(g, set.size, minLen); if (s.length > sol.length) { grid = g; sol = s; } }
    const now = Date.now();
    return {
      gid: "b" + now.toString(36), phase: "bplay", players: seats,
      b: { grid, size: set.size, mode: set.mode, minLen, startsAt: now + 3500, endsAt: now + 3500 + set.mins * 60000, found: {}, possible: sol.length }
    };
  },

  // Returns the message the player sees.
  submit(G, who, raw) {
    const b = G.b, w = cleanWord(raw), W = w.toUpperCase(), now = Date.now();
    if (now < b.startsAt - 500 || now > b.endsAt + 1500) return { ok: false, msg: "Time's up" };
    if (w.length < b.minLen) return { ok: false, msg: `Words need ${b.minLen}+ letters` };
    if (!findPath(b.grid, b.size, w)) return { ok: false, msg: `${W} isn't on the board` };
    if (!DICT.set.has(w)) return { ok: false, msg: `${W} isn't in the dictionary` };
    const mine = b.found[who] || (b.found[who] = []);
    if (mine.includes(w)) return { ok: false, msg: `You already have ${W}` };
    if (b.mode === "claim") {
      const owner = Object.keys(b.found).find(p => b.found[p].includes(w));
      if (owner) return { ok: false, msg: `${owner} got ${W} first` };
    }
    mine.push(w);
    return { ok: true, msg: `${W} +${wordPts(w)}` };
  },

  finish(G) {
    const b = G.b, all = solveGrid(b.grid, b.size, b.minLen), anyone = new Set(Object.values(b.found).flat());
    b.possible = all.length;
    b.missed = sortWords(all.filter(w => !anyone.has(w))).slice(0, 12);
    b.round = {};
    G.bscores = G.bscores || {};
    G.players.forEach(p => { const pts = (b.found[p] || []).reduce((s, w) => s + wordPts(w), 0); b.round[p] = pts; G.bscores[p] = (G.bscores[p] || 0) + pts; });
    G.phase = "bresults";
  },

  view(G, name, bLast) {
    const b = G.b, done = G.phase === "bresults", now = Date.now(), counts = {}, pts = {};
    G.players.forEach(p => { const ws = b.found[p] || []; counts[p] = ws.length; pts[p] = ws.reduce((s, w) => s + wordPts(w), 0); });
    const v = { grid: b.grid, size: b.size, mode: b.mode, minLen: b.minLen, startsIn: b.startsAt - now, endsIn: b.endsAt - now, mine: b.found[name] || [], counts, pts, last: bLast || null };
    // In "everyone finds their own" mode, other people's words stay hidden until time's up.
    if (b.mode === "claim" || done) v.found = b.found;
    if (done) Object.assign(v, { missed: b.missed, possible: b.possible, round: b.round });
    return v;
  }
};

/* ---------- Player side ---------- */

// ui.bPath: tiles picked by tapping/swiping. ui.bText: what's typed. ui.bClock: local start/end times.
function noteView(v) {
  if (!v || !v.b || v.phase !== "bplay") return;
  const now = Date.now();
  ui.bClock = { start: now + v.b.startsIn, end: now + v.b.endsIn };
  const last = v.b.last;
  if (last && last.n !== ui.bLastN) {
    if (ui.bLastN != null || now - (last.at || 0) < 3000) ui.bToast = { msg: last.msg, ok: last.ok, at: now };
    ui.bLastN = last.n;
  }
}
function bState() {
  const c = ui.bClock, now = Date.now();
  if (!c) return "play";
  return now < c.start ? "count" : now < c.end ? "play" : "over";
}
const fmtTime = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const pathWord = (grid, path) => path.map(i => grid[i]).join("").toLowerCase();

function bTileClasses() {
  const v = ui.view; if (!v || !v.b) return [];
  const path = ui.bPath && ui.bPath.length ? ui.bPath : (ui.bText ? findPath(v.b.grid, v.b.size, ui.bText) || [] : []);
  return v.b.grid.map((_, i) => path[path.length - 1] === i ? "on last" : path.includes(i) ? "on" : "");
}

// Repaint only the tiles and the word box (cheap, used while swiping and typing).
function bPaint() {
  const v = ui.view, cls = bTileClasses();
  document.querySelectorAll("#bgrid .tile").forEach((t, i) => { t.className = "tile" + (v.b.grid[i] === "Qu" ? " qu" : "") + (cls[i] ? " " + cls[i] : ""); });
  const inp = document.getElementById("bIn");
  if (inp) {
    if (ui.bPath && ui.bPath.length) inp.value = pathWord(v.b.grid, ui.bPath).toUpperCase();
    inp.classList.toggle("bad", !!ui.bText && !(ui.bPath && ui.bPath.length) && !findPath(v.b.grid, v.b.size, ui.bText));
  }
}

function bToast(msg, ok) { ui.bToast = { msg, ok, at: Date.now() }; const t = document.getElementById("btoast"); if (t) { t.textContent = msg; t.className = "btoast " + (ok ? "good" : "bad"); } }

function bSubmit() {
  const v = ui.view; if (!v || !v.b || bState() !== "play") return;
  const w = ui.bPath && ui.bPath.length ? pathWord(v.b.grid, ui.bPath) : cleanWord(ui.bText);
  ui.bPath = []; ui.bText = "";
  const inp = document.getElementById("bIn"); if (inp) inp.value = "";
  bPaint();
  if (!w) return;
  const W = w.toUpperCase();
  if (w.length < v.b.minLen) return bToast(`Words need ${v.b.minLen}+ letters`, false);
  if (!findPath(v.b.grid, v.b.size, w)) return bToast(`${W} isn't on the board`, false);
  if (v.b.mine.includes(w)) return bToast(`You already have ${W}`, false);
  bToast(`Checking ${W}…`, true);
  act({ type: "word", w });
}

// Swiping across tiles enters the word when you let go. Tapping builds a word one tile at a time;
// tap the last tile again (or Enter) to send it.
const drag = { on: false, moved: false, again: false };
function tileAt(x, y, strict) {
  const el = document.elementFromPoint(x, y), t = el && el.closest("#bgrid .tile");
  if (!t) return -1;
  if (strict) { // while swiping, only count the middle of a tile so diagonals don't catch neighbours
    const r = t.getBoundingClientRect(), dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) > r.width * 0.42) return -1;
  }
  return +t.dataset.i;
}
document.addEventListener("pointerdown", e => {
  if (!e.target.closest || !e.target.closest("#bgrid .tile") || bState() !== "play") return;
  e.preventDefault();
  const v = ui.view, i = tileAt(e.clientX, e.clientY, false); if (i < 0) return;
  const inp = document.getElementById("bIn"); if (inp && document.activeElement === inp) inp.blur();
  if (!ui.bPath || !ui.bPath.length) { ui.bText = ""; ui.bPath = []; }
  const p = ui.bPath, last = p[p.length - 1];
  drag.again = false;
  if (p.length && i === last) drag.again = true;
  else if (p.includes(i)) ui.bPath = p.slice(0, p.indexOf(i) + 1);
  else if (p.length && touching(v.b.size, last, i)) p.push(i);
  else ui.bPath = [i];
  drag.on = true; drag.moved = false;
  bPaint();
});
document.addEventListener("pointermove", e => {
  if (!drag.on) return;
  const i = tileAt(e.clientX, e.clientY, true), p = ui.bPath; if (i < 0 || !p.length || i === p[p.length - 1]) return;
  if (i === p[p.length - 2]) p.pop();
  else if (!p.includes(i) && touching(ui.view.b.size, p[p.length - 1], i)) p.push(i);
  else return;
  drag.moved = true; drag.again = false;
  bPaint();
});
const endDrag = () => {
  if (!drag.on) return;
  drag.on = false;
  if ((drag.moved && ui.bPath.length >= 2) || drag.again) bSubmit();
};
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);

// The timer ticks locally; a full redraw only happens when the countdown starts play or time runs out.
setInterval(() => {
  const v = ui.view;
  if (!v || v.phase !== "bplay" || currentView() !== "bplay") return;
  const st = bState(), now = Date.now();
  if (st !== ui.bShownState) return render();
  const el = document.getElementById("btimer");
  if (el) { const left = st === "count" ? ui.bClock.start - now : ui.bClock.end - now; el.textContent = st === "count" ? Math.max(1, Math.ceil(left / 1000)) : fmtTime(left); el.classList.toggle("low", st === "play" && left < 10000); }
  const t = document.getElementById("btoast");
  if (t && ui.bToast && now - ui.bToast.at > 2500) t.classList.add("gone");
}, 200);

function wordCol(v, p, words, opts = {}) {
  const ws = sortWords(words);
  return `<div class="wcol ${p === v.me ? "mine" : ""}">
    <div class="wcol-head"><b>${esc(p)}${p === v.me ? " (you)" : ""}</b><span>${opts.pts != null ? opts.pts : v.b.pts[p]}</span></div>
    <ul id="wl-${esc(p)}">${ws.length ? ws.map(w => `<li class="${opts.solo && opts.solo.has(w) ? "solo" : ""}"><span>${esc(w.toUpperCase())}</span><small>${wordPts(w)}</small></li>`).join("") : `<li class="none">${opts.pts != null ? "No words" : "No words yet"}</li>`}</ul>
  </div>`;
}

// Players in score order, you first among ties.
const byScore = (v, pts) => v.players.slice().sort((a, b) => (pts[b] || 0) - (pts[a] || 0) || (b === v.me) - (a === v.me));

function bLists(v) {
  const b = v.b;
  if (b.mode === "claim") {
    const order = [v.me, ...v.players.filter(p => p !== v.me)].filter(p => v.players.includes(p));
    return `<div class="label">Words found · longest first</div><div class="wcols">${order.map(p => wordCol(v, p, b.found[p] || [])).join("")}</div>`;
  }
  const others = v.players.filter(p => p !== v.me);
  return `<div class="label">Your words · longest first</div><div class="wcols one">${wordCol(v, v.me, b.mine)}</div>
    ${others.length ? `<div class="label">Everyone else (words show at the end)</div><ul class="bothers">${others.map(p => `<li><b>${esc(p)}</b><span>${plural(b.counts[p], "word")} · ${b.pts[p]} pts</span></li>`).join("")}</ul>` : ""}`;
}

function bHead(v) { return head(v.b.mode === "claim" ? "Boggle · First wins" : "Boggle · Own words"); }

const boggleViews = {
  bplay() {
    const v = ui.view, b = v.b, st = bState(), cls = bTileClasses(), now = Date.now();
    ui.bShownState = st;
    const timer = st === "count" ? Math.max(1, Math.ceil((ui.bClock.start - now) / 1000)) : fmtTime(ui.bClock ? ui.bClock.end - now : b.endsIn);
    const toast = ui.bToast && now - ui.bToast.at < 2500 ? ui.bToast : null;
    return `<div id="bhead">${bHead(v)}</div>
    <section class="card board">
      <div class="bstatus"><span id="btimer" class="btimer ${st === "count" ? "count" : ""}">${timer}</span><span id="bscore" class="muted"><b>${b.pts[v.me] || 0}</b> pts · ${plural(b.mine.length, "word")}</span></div>
      <div class="bgrid s${b.size}" id="bgrid">
        ${b.grid.map((L, i) => `<div class="tile${L === "Qu" ? " qu" : ""}${cls[i] ? " " + cls[i] : ""}" data-i="${i}">${st === "count" ? "" : esc(L)}</div>`).join("")}
        ${st === "count" ? `<div class="bover">Get ready</div>` : st === "over" ? `<div class="bover">Time's up!</div>` : ""}
      </div>
      <div class="bentry">
        <input class="field mono" id="bIn" placeholder="Swipe or type" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" value="${esc((ui.bPath && ui.bPath.length ? pathWord(b.grid, ui.bPath) : ui.bText || "").toUpperCase())}" ${st === "play" ? "" : "disabled"}>
        <button class="btn" data-act="bsubmit" ${st === "play" ? "" : "disabled"}>Enter</button>
      </div>
      <div id="btoast" class="btoast ${toast ? (toast.ok ? "good" : "bad") : "gone"}">${toast ? esc(toast.msg) : "&nbsp;"}</div>
    </section>
    <div id="blists" class="stack">${bLists(v)}</div>
    <div id="bfoot">${st === "over" ? `<p class="muted center-text">Adding up scores…</p>` : ""}${host.active && st !== "over" ? `<button class="btn ghost slim" data-act="bend">End the round now</button>` : ""}</div>`;
  },

  bresults() {
    const v = ui.view, b = v.b, order = byScore(v, b.round), top = b.round[order[0]] || 0;
    const winners = order.filter(p => (b.round[p] || 0) === top && top > 0);
    // Words only one person found get a star in "everyone finds their own" mode.
    const tally = {}; Object.values(b.found).forEach(ws => ws.forEach(w => { tally[w] = (tally[w] || 0) + 1; }));
    const solo = new Set(Object.keys(tally).filter(w => tally[w] === 1));
    const total = Object.keys(tally).length;
    return head("Boggle · Round over") + `
    <section class="card center">
      <div class="label">${winners.length > 1 ? "Tied for the win" : winners.length ? "Winner" : "Nobody scored"}</div>
      ${winners.length ? `<div class="big-name">${winners.map(esc).join(" & ")}</div><p class="muted">${top} points</p>` : ""}
      <p class="muted small">You found ${total} of ${b.possible} possible words between you.</p>
    </section>
    <section class="card">
      <div class="label">This round</div>
      <ul class="players">${order.map(p => `<li class="${p === v.me ? "you" : ""}"><span>${esc(p)} <small class="muted">${plural((b.found[p] || []).length, "word")}</small></span><em>+${b.round[p] || 0}</em></li>`).join("")}</ul>
    </section>
    <div class="stack">
      <div class="label">Everyone's words · longest first${b.mode === "open" ? " · ★ only you found it" : ""}</div>
      <div class="wcols">${order.map(p => wordCol(v, p, b.found[p] || [], { pts: b.round[p] || 0, solo: b.mode === "open" ? solo : null })).join("")}</div>
    </div>
    ${b.missed && b.missed.length ? `<section class="card"><div class="label">Best words nobody found</div><div class="chips">${b.missed.map(w => `<span class="chip static">${esc(w.toUpperCase())}</span>`).join("")}</div></section>` : ""}
    <section class="card"><div class="label">Board</div><div class="bgrid small s${b.size}">${b.grid.map(L => `<div class="tile${L === "Qu" ? " qu" : ""}">${esc(L)}</div>`).join("")}</div></section>
    <section class="card">
      <div class="label">Boggle scoreboard</div>
      <ul class="players">${byScore(v, v.bscores).map(p => `<li class="${p === v.me ? "you" : ""}"><span>${esc(p)}</span><em>${v.bscores[p] || 0}</em></li>`).join("")}</ul>
    </section>
    <button class="btn" data-act="start">New board</button>
    <button class="btn ghost" data-act="tolobby">Back to lobby</button>`;
  }
};

// Cheap update while a round is running so the keyboard and any swipe in progress aren't interrupted.
function bPatch() {
  const v = ui.view, keep = {};
  document.querySelectorAll("#blists ul[id]").forEach(u => { keep[u.id] = u.scrollTop; });
  document.getElementById("bhead").innerHTML = bHead(v);
  document.getElementById("bscore").innerHTML = `<b>${v.b.pts[v.me] || 0}</b> pts · ${plural(v.b.mine.length, "word")}`;
  document.getElementById("blists").innerHTML = bLists(v);
  for (const id in keep) { const u = document.getElementById(id); if (u) u.scrollTop = keep[id]; }
  const t = document.getElementById("btoast"), toast = ui.bToast;
  if (t && toast && Date.now() - toast.at < 2500) { t.textContent = toast.msg; t.className = "btoast " + (toast.ok ? "good" : "bad"); }
  bPaint();
}

const boggleRules = () => `<section class="card"><div class="label">How Boggle works</div><ul class="rules">
  <li>Everyone gets the same grid. Make words from letters that touch, diagonals included. Each tile once per word.</li>
  <li>Swipe across the tiles, tap them one at a time (tap the last one again to enter), or type.</li>
  <li>Words need 3+ letters (4+ on the 5×5 board). Points: 3–4 letters <b>1</b>, 5 <b>2</b>, 6 <b>3</b>, 7 <b>5</b>, 8+ <b>11</b>.</li>
  <li><b>First to find it:</b> once someone gets a word, nobody else can, and everyone sees everyone's lists live.</li>
  <li><b>Everyone finds their own:</b> every word you find counts, even if others found it too. Lists are revealed at the end.</li></ul></section>`;
