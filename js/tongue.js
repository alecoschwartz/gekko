// Tongue Tied: a Taboo-style word game. The speaker gets a card with a word and its taboo words (5 on Easy, 6 on Hard), and has to get
// the others to say the word without saying any of the taboo words (or the word itself).
// Two modes: "self" (honor system: the speaker marks their own cards, 2+ players) and
// "judge" (the next player sees the card too and marks pass or fail, 3+ players).
// Got it: +1 to the speaker and +1 to whoever guessed. Taboo word: -1. Skip: -1, or free once the card has been up 20 seconds.

const TONGUE_DEFAULTS = { mode: "self", level: "easy", secs: 60, turns: 2 };
const TONGUE_SECS = [45, 60, 90], TONGUE_TURNS = [1, 2, 3];
const TONGUE_FREE_SKIP = 20000, TONGUE_COUNTDOWN = 3000, TONGUE_AHEAD = 3;
const tongueCards = level => level === "hard" ? TABOO_HARD : TABOO_EASY;
const tongueCard = c => { const [w, ...no] = String(c).split("|"); return { w, no }; };
const tongueMin = mode => mode === "judge" ? 3 : 2;
const tongueNo = level => level === "hard" ? 6 : 5;

/* ---------- Host side ---------- */

const tongueHost = {
  // Cards nobody has had yet come first, then the ones seen longest ago.
  newGame(G, seats) {
    const set = { ...TONGUE_DEFAULTS, ...(G.tset || {}) }, order = shuffle(seats), turns = [];
    const mode = set.mode === "judge" && seats.length >= 3 ? "judge" : "self", level = set.level === "hard" ? "hard" : "easy";
    for (let t = 0; t < (TONGUE_TURNS.includes(set.turns) ? set.turns : 2); t++) turns.push(...order);
    const pool = tongueCards(level), used = G.usedTaboo || [];
    const fresh = shuffle(pool.map((c, i) => i).filter(i => !used.includes(tongueCard(pool[i]).w)));
    const stale = pool.map((c, i) => i).filter(i => used.includes(tongueCard(pool[i]).w)).sort((a, b) => used.indexOf(tongueCard(pool[a]).w) - used.indexOf(tongueCard(pool[b]).w));
    const total = {}; seats.forEach(p => { total[p] = 0; });
    const g = { gid: "t" + Date.now().toString(36), players: seats, usedTaboo: used.slice(),
      t: { mode, level, secs: TONGUE_SECS.includes(set.secs) ? set.secs : 60, order, turns, ti: 0, deck: [...fresh, ...stale], dp: -1, total } };
    this.startTurn(g);
    return g;
  },

  // Each turn the next player in the order judges (judge mode), so nobody judges their own turn.
  startTurn(G) {
    const t = G.t, n = t.order.length;
    Object.assign(t, { speaker: t.turns[t.ti], judge: t.mode === "judge" ? t.order[(t.ti + 1) % n] : null, log: [], ci: 0, card: -1, cardAt: 0, startsAt: 0, endsAt: 0, round: null });
    G.phase = "tready";
  },

  guessers(G) { const t = G.t; return G.players.filter(p => p !== t.speaker && p !== t.judge); },

  draw(G) {
    const t = G.t;
    t.dp = (t.dp + 1) % t.deck.length; t.card = t.deck[t.dp]; t.ci++;
    t.cardAt = Math.max(Date.now(), t.startsAt);
    const w = tongueCard(tongueCards(t.level)[t.card]).w;
    G.usedTaboo = [...(G.usedTaboo || []).filter(x => x !== w), w].slice(-800);
  },

  go(G) {
    const t = G.t, now = Date.now();
    t.startsAt = now + TONGUE_COUNTDOWN; t.endsAt = t.startsAt + t.secs * 1000;
    this.draw(G);
    G.phase = "tplay";
  },

  // r: "ok" (got it, by = the guesser), "foul" (said a taboo word) or "skip".
  mark(G, r, by) {
    const t = G.t, now = Date.now(), c = tongueCards(t.level)[t.card];
    let d = 0;
    if (r === "ok") d = 1;
    else if (r === "foul") d = -1;
    // A little slack on the free skip, since the speaker's phone started its 20 seconds before the host heard about the last card.
    else d = now - t.cardAt >= TONGUE_FREE_SKIP - 1500 ? 0 : -1;
    t.log.push({ c, r, by: r === "ok" ? by : null, d });
    if (now < t.endsAt) this.draw(G); else this.endTurn(G);
  },

  endTurn(G) {
    const t = G.t, d = {};
    G.players.forEach(p => { d[p] = 0; });
    for (const e of t.log) { d[t.speaker] += e.d; if (e.by && d[e.by] != null) d[e.by] += 1; }
    G.players.forEach(p => { t.total[p] = (t.total[p] || 0) + d[p]; });
    t.round = { d }; t.card = -1;
    G.phase = "tsum";
  },

  next(G) {
    const t = G.t;
    if (t.ti < t.turns.length - 1) { t.ti++; this.startTurn(G); return; }
    G.tscores = G.tscores || {};
    G.players.forEach(p => { G.tscores[p] = (G.tscores[p] || 0) + (t.total[p] || 0); });
    G.phase = "tresults";
  },

  view(G, name) {
    const t = G.t, now = Date.now(), role = name === t.speaker ? "speaker" : name === t.judge ? "judge" : "guesser";
    const v = { ti: t.ti, n: t.turns.length, mode: t.mode, level: t.level, secs: t.secs, speaker: t.speaker, judge: t.judge, role,
      guessers: this.guessers(G), log: t.log, total: t.total, round: t.round };
    if (G.phase === "tplay") {
      Object.assign(v, { ci: t.ci, startsIn: t.startsAt - now, endsIn: t.endsAt - now, cardIn: t.cardAt - now });
      // Only the speaker and judge see the card, plus the next few so their screen can move on without waiting for the host.
      if (role !== "guesser" && t.card >= 0) {
        const pool = tongueCards(t.level);
        v.cards = [t.card, ...Array.from({ length: TONGUE_AHEAD }, (x, k) => t.deck[(t.dp + 1 + k) % t.deck.length])].map(i => pool[i]);
      }
    }
    return v;
  }
};

/* ---------- Player side ---------- */

// ui.tCi is the card this phone is showing. It can run ahead of the host's ci after a tap (showing a card from v.cards)
// until the host catches up.
function noteTongueView(v) {
  if (!v || !v.t || v.phase !== "tplay") return;
  const t = v.t, now = Date.now();
  ui.tClock = { start: now + t.startsIn, end: now + t.endsIn };
  if (ui.tTi !== t.ti || ui.tCi == null || t.ci >= ui.tCi) { ui.tTi = t.ti; ui.tCi = t.ci; ui.tCardAt = now + t.cardIn; ui.tTapAt = 0; }
}
function tongueState() {
  const c = ui.tClock, now = Date.now();
  if (!c) return "play";
  return now < c.start ? "count" : now < c.end ? "play" : "over";
}
// The card this phone should show, or null.
function tongueShown() {
  const t = ui.view.t;
  if (!t.cards) return null;
  const k = ui.tCi - t.ci;
  return t.cards[k >= 0 && k < t.cards.length ? k : 0];
}
function tongueTap(r, by) {
  const v = ui.view, t = v && v.t;
  if (!t || v.phase !== "tplay" || tongueState() !== "play") return;
  const ci = ui.tCi, ti = t.ti;
  // Move on to the next card straight away; the host's answer catches up a moment later.
  // (Done before act(), because on the host's own phone act() updates the view right away.)
  if (ci - t.ci < TONGUE_AHEAD) { ui.tCi++; ui.tCardAt = Date.now(); ui.tTapAt = Date.now(); }
  act({ type: "tmark", r, by: by || null, ti, ci });
  tonguePatch();
}

const tongueActions = {
  tmode: el => act({ type: "tmode", v: el.dataset.v }),
  tlevel: el => act({ type: "tlevel", v: el.dataset.v }),
  tsecs: el => act({ type: "tsecs", v: +el.dataset.v }),
  tturns: el => act({ type: "tturns", v: +el.dataset.v }),
  tgo: () => act({ type: "tgo", ti: ui.view.t.ti }),
  tok: el => tongueTap("ok", el.dataset.v || null),
  tfoul: () => tongueTap("foul"),
  tskip: () => tongueTap("skip"),
  tend: () => act({ type: "tend", ti: ui.view.t.ti }),
  tnext: () => act({ type: "tnext", ti: ui.view.t.ti })
};

const tongueStep = v => `Tongue Tied · turn ${v.t.ti + 1} of ${v.t.n}`;
const tongueWho = names => names.map(esc).join(", ");
const tongueTurnPts = t => t.log.reduce((s, e) => s + e.d, 0);
const tonguePts = n => n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";

function tongueCardHtml(c) {
  if (!c) return "";
  const k = tongueCard(c);
  return `<div class="tcard"><div class="tword">${esc(k.w.toUpperCase())}</div><div class="label">Don't say</div><ul class="tno${k.no.length > 5 ? " two" : ""}">${k.no.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
}
function tongueLogHtml(t, n = 99) {
  const rows = t.log.slice(-n).reverse().map(e => {
    const k = tongueCard(e.c);
    const what = e.r === "ok" ? `${e.by ? esc(e.by) + " got it" : "Got it"}` : e.r === "foul" ? "Taboo word!" : e.d ? "Skipped" : "Skipped (free)";
    return `<li class="${e.r}"><span class="tmark">${e.r === "ok" ? "✓" : e.r === "foul" ? "✗" : "↷"}</span><div><b>${esc(k.w)}</b><small class="muted">${what}</small></div><em>${tonguePts(e.d)}</em></li>`;
  }).join("");
  return rows || `<li class="muted">No cards yet.</li>`;
}
function tongueSkipLabel() {
  const left = TONGUE_FREE_SKIP - (Date.now() - (ui.tCardAt || 0));
  return left > 0 ? `Skip <small>−1 · free in ${Math.ceil(left / 1000)}s</small>` : `Skip <small>free</small>`;
}
// The buttons for whoever marks the cards: one "Got it", or one per guesser when there's a choice of who to credit.
function tongueMarkBtns(t) {
  const marker = t.mode === "judge" ? t.role === "judge" : t.role === "speaker";
  const skip = t.role === "speaker" ? `<button class="btn ghost tbtn" data-act="tskip" id="tskip">${tongueSkipLabel()}</button>` : "";
  if (!marker) return skip;
  const ok = t.guessers.length > 1
    ? `<div class="label">Who got it?</div><div class="tok">${t.guessers.map(p => `<button class="btn tbtn yes" data-act="tok" data-v="${esc(p)}">✓ ${esc(p)}</button>`).join("")}</div>`
    : `<button class="btn tbtn yes" data-act="tok">✓ Got it</button>`;
  return `${ok}<div class="trow"><button class="btn tbtn foul" data-act="tfoul">✗ ${t.mode === "judge" ? "Buzz! Taboo word" : "Taboo word"} <small>−1</small></button>${skip}</div>`;
}
function tongueMain() {
  const v = ui.view, t = v.t, st = tongueState();
  if (st === "count") return `<section class="card spot center"><div class="label">${t.role === "speaker" ? "Get ready to talk" : t.role === "judge" ? "Get ready to judge" : "Get ready to guess"}</div><div class="big-name" id="tcount">${Math.max(1, Math.ceil((ui.tClock.start - Date.now()) / 1000))}</div></section>`;
  if (st === "over") return `<section class="card center"><div class="label">Time!</div><p class="muted">Adding up the turn…</p></section>`;
  if (t.role === "guesser") return `<section class="card spot center"><div class="label">${esc(t.speaker)} is describing</div><div class="big-name">Guess out loud!</div>
    <p class="muted small">${t.mode === "judge" ? `${esc(t.judge)} is judging.` : `${esc(t.speaker)} marks the cards.`}</p></section>`;
  return `<section class="card spot">${tongueCardHtml(tongueShown())}</section>
    <div class="tbtns" id="tbtns">${tongueMarkBtns(t)}</div>
    <p class="muted small center-text">${t.role === "judge" ? `You're the judge. Mark it when someone says the word, and buzz ${esc(t.speaker)} for any taboo word, the word itself, or part of it.`
      : t.mode === "judge" ? `${esc(t.judge)} is judging. Stuck? Skip it.` : "No saying the word, any part of it, or the taboo words. No spelling it out or \"sounds like\"."}</p>`;
}
const tongueBar = (v, t) => `<section class="card sbar"><div><div class="label">${t.role === "speaker" ? "Your turn" : `${esc(t.speaker)}'s turn`}</div><div class="sbuild" id="tpts">${tonguePts(tongueTurnPts(t))}</div></div><span class="btimer" id="ttimer">${fmtTime(Math.max(0, ui.tClock.end - Date.now()))}</span></section>`;

// Mid-turn updates only rewrite what changed, so a tap isn't lost to a button being replaced under the finger.
function tonguePatch() {
  const v = ui.view, t = v && v.t;
  if (!t || v.phase !== "tplay") return;
  const set = (id, html) => { const el = document.getElementById(id); if (el && el._h !== html) { el.innerHTML = html; el._h = html; } };
  set("tmain", tongueMain()); set("tlog", tongueLogHtml(t)); set("tpts", tonguePts(tongueTurnPts(t)));
}
const tongueKey = v => v.t ? `t${v.t.ti}` : "";

// Local clock: countdown, turn timer and the free-skip countdown.
setInterval(() => {
  const v = ui.view;
  if (!v || !v.t || v.phase !== "tplay" || currentView() !== "tplay") return;
  const now = Date.now(), st = tongueState();
  if (st !== ui.tShownState) return render();
  // A tap the host never answered: go back to the host's card.
  if (ui.tTapAt && now - ui.tTapAt > 5000 && ui.tCi > v.t.ci) { ui.tCi = v.t.ci; ui.tTapAt = 0; tonguePatch(); }
  const tm = document.getElementById("ttimer");
  if (tm) { const left = Math.max(0, ui.tClock.end - now); tm.textContent = fmtTime(left); tm.classList.toggle("low", left < 10000); }
  const c = document.getElementById("tcount"); if (c) c.textContent = Math.max(1, Math.ceil((ui.tClock.start - now) / 1000));
  const sk = document.getElementById("tskip"); if (sk) { const h = tongueSkipLabel(); if (sk.innerHTML !== h) sk.innerHTML = h; }
}, 250);

function tongueScoreCard(v) {
  const t = v.t, order = v.players.slice().sort((a, b) => (t.total[b] || 0) - (t.total[a] || 0)), d = t.round ? t.round.d : {};
  return `<section class="card"><div class="label">Scores</div><ul class="players">${order.map(p => `<li class="${p === v.me ? "you" : ""}"><span>${esc(p)} <small class="muted">${d[p] ? `${tonguePts(d[p])} this turn` : ""}</small></span><em>${t.total[p] || 0}</em></li>`).join("")}</ul></section>`;
}

const tongueViews = {
  tready() {
    const v = ui.view, t = v.t;
    const roles = t.mode === "judge" ? `<b>${esc(t.judge)}</b> judges. ${t.guessers.length ? `${tongueWho(t.guessers)} ${t.guessers.length > 1 ? "guess" : "guesses"}.` : ""}` : `${tongueWho(t.guessers)} ${t.guessers.length > 1 ? "guess" : "guesses"}.`;
    if (t.role === "speaker") return head(tongueStep(v)) + `
      <section class="card spot center"><div class="label">Your turn to talk</div><div class="big-name">${esc(v.me)}</div>
        <p class="muted">You get ${t.secs} seconds. ${roles}</p></section>
      <button class="btn" data-act="tgo">Start my turn</button>
      <section class="card"><ul class="rules">
        <li>Get them to say the word on the card. Don't say the word, any part of it, or any of the ${tongueNo(t.level)} taboo words.</li>
        <li>No spelling it out, no "sounds like" or "rhymes with", no acting it out.</li>
        <li>${t.mode === "judge" ? `${esc(t.judge)} sees your card and marks each one right or buzzes you (−1).` : "You mark each card yourself: got it, or you slipped and said a taboo word (−1). Be honest!"}</li>
        <li>Skipping costs 1 point, unless the card has been up for 20 seconds. Then it's free.</li></ul></section>
      ${tongueScoreCard(v)}`;
    return head(tongueStep(v)) + `
      <section class="card spot center"><div class="label">Up next</div><div class="big-name">${esc(t.speaker)}</div>
        <p class="muted">${t.role === "judge" ? `You're the judge this turn. You'll see the card. Tap ✓ when someone says the word, and buzz ${esc(t.speaker)} for any taboo word.` : `Get ready to guess out loud. ${t.mode === "judge" ? `${esc(t.judge)} is judging.` : ""}`}</p>
        <p class="muted small">Waiting for ${esc(t.speaker)} to start.</p></section>
      ${host.active ? `<button class="btn ghost slim" data-act="tgo">${esc(t.speaker)}'s phone stuck? Start for them</button>` : ""}
      ${tongueScoreCard(v)}`;
  },

  tplay() {
    const v = ui.view, t = v.t; ui.tShownState = tongueState();
    return head(tongueStep(v)) + tongueBar(v, t) + `<div id="tmain">${tongueMain()}</div>
      <section class="card"><div class="label">This turn</div><ul class="flies tlog" id="tlog">${tongueLogHtml(t)}</ul></section>
      ${host.active ? `<button class="btn ghost slim" data-act="tend">End this turn now</button>` : ""}`;
  },

  tsum() {
    const v = ui.view, t = v.t, last = t.ti === t.n - 1, pts = tongueTurnPts(t);
    const gotIt = t.log.filter(e => e.r === "ok").length;
    return head(tongueStep(v)) + `
      <section class="card spot center"><div class="label">${esc(t.speaker)}'s turn</div><div class="big-name">${tonguePts(pts)}</div>
        <p class="muted small">${gotIt} ${gotIt === 1 ? "card" : "cards"} guessed${t.log.length > gotIt ? `, ${t.log.length - gotIt} missed` : ""}.</p></section>
      <section class="card"><div class="label">The cards</div><ul class="flies tlog">${t.log.length ? t.log.map(e => {
        const k = tongueCard(e.c);
        return `<li class="${e.r}"><span class="tmark">${e.r === "ok" ? "✓" : e.r === "foul" ? "✗" : "↷"}</span><div><b>${esc(k.w)}</b><small class="muted">${k.no.map(esc).join(" · ")}</small></div><em>${tonguePts(e.d)}</em></li>`;
      }).join("") : `<li class="muted">No cards this turn.</li>`}</ul></section>
      ${tongueScoreCard(v)}
      <button class="btn" data-act="tnext">${last ? "See final scores" : "Next turn"}</button>`;
  },

  tresults() {
    const v = ui.view, t = v.t, order = v.players.slice().sort((a, b) => (t.total[b] || 0) - (t.total[a] || 0));
    const top = t.total[order[0]] || 0, winners = order.filter(p => (t.total[p] || 0) === top && top > 0);
    return head("Tongue Tied · Game over") + `
      <section class="card center"><div class="label">${winners.length > 1 ? "Tied for the win" : winners.length ? "Winner" : "Nobody scored"}</div>
        ${winners.length ? `<div class="big-name">${winners.map(esc).join(" & ")}</div><p class="muted">${top} points</p>` : ""}</section>
      <section class="card"><div class="label">This game</div><ul class="players">${order.map(p => `<li class="${p === v.me ? "you" : ""}"><span>${esc(p)}</span><em>${t.total[p] || 0}</em></li>`).join("")}</ul></section>
      <section class="card"><div class="label">Tongue Tied scoreboard</div><ul class="players">${v.players.slice().sort((a, b) => (v.tscores[b] || 0) - (v.tscores[a] || 0)).map(p => `<li class="${p === v.me ? "you" : ""}"><span>${esc(p)}</span><em>${v.tscores[p] || 0}</em></li>`).join("")}</ul></section>
      <button class="btn" data-act="start">Play again</button>
      <button class="btn ghost" data-act="tolobby">Back to lobby</button>`;
  }
};

const TONGUE_LEVEL_EG = { easy: "pizza, beach, toothbrush", hard: "eclipse, procrastinate, Hogwarts" };
function tongueLobby(v, lock, isHost) {
  const ts = v.tset, judge = ts.mode === "judge", need = tongueMin(ts.mode), enough = v.seats.length >= need;
  return `<section class="card">
      <div class="label">Who keeps score</div>
      <div class="chips">${[["self", "Honor system"], ["judge", "With a judge"]].map(([m, label]) => `<button class="chip" data-act="tmode" data-v="${m}" ${lock} aria-pressed="${ts.mode === m}">${label}</button>`).join("")}</div>
      <p class="muted small">${judge ? "<b>With a judge:</b> each turn, another player sees the card and marks pass or fail. Needs 3 or more players." : "<b>Honor system:</b> the speaker marks their own cards. Works with 2 or more players."}</p>
      <div class="label">Words</div>
      <div class="chips">${[["easy", "Easy"], ["hard", "Hard"]].map(([l, label]) => `<button class="chip" data-act="tlevel" data-v="${l}" ${lock} aria-pressed="${ts.level === l}">${label}</button>`).join("")}</div>
      <p class="muted small">${ts.level === "hard" ? "Hard" : "Easy"} cards are like <i>${TONGUE_LEVEL_EG[ts.level === "hard" ? "hard" : "easy"]}</i>, with ${tongueNo(ts.level)} taboo words each. ${tongueCards(ts.level).length} cards.</p>
      <div class="label">Turns to talk (each)</div>
      <div class="chips">${TONGUE_TURNS.map(n => `<button class="chip" data-act="tturns" data-v="${n}" ${lock} aria-pressed="${ts.turns === n}">${n}</button>`).join("")}</div>
      <div class="label">Time per turn</div>
      <div class="chips">${TONGUE_SECS.map(n => `<button class="chip" data-act="tsecs" data-v="${n}" ${lock} aria-pressed="${ts.secs === n}">${n === 90 ? "1½ min" : n === 60 ? "1 min" : n + " sec"}</button>`).join("")}</div>
      ${isHost ? "" : `<p class="muted small">${esc(v.hostName)} picks the settings.</p>`}
    </section>
    <button class="btn" data-act="start" ${enough ? "" : "disabled"}>${enough ? "Start Tongue Tied" : `Needs ${need} players`}</button>
    <section class="card"><div class="label">How Tongue Tied works</div><ul class="rules">
      <li>Players take turns talking. The speaker gets a card with a word and ${tongueNo(ts.level)} taboo words.</li>
      <li>Get everyone else to say the word, without saying the word, any part of it, or any taboo word.</li>
      <li>${judge ? "The judge (a different player each turn) sees the card too. They tap who got it, or buzz the speaker for a taboo word." : "The speaker taps who got it, or owns up when they say a taboo word."}</li>
      <li><b>+1</b> to the speaker and <b>+1</b> to whoever guessed it. Taboo word: <b>−1</b> to the speaker.</li>
      <li>Skipping costs <b>1</b> point, but it's free once a card has been up for 20 seconds.</li></ul></section>`;
}
