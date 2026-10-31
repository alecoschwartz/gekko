// Fibber: everyone writes a fake answer to an obscure fact, then tries to pick the real one out of all the fakes.
// Finding the truth is worth 2 points; every player who falls for your fib gives you 1.
// Quibber (mode "quib") is the same game with no right answer: funny prompts, and every vote for your answer is a point.
// Bot answers (FIB_BOTS / QUIB_BOTS, keyed by question) are mixed in at voting time to make the truth harder to find.
// Falling for a bot answer scores nothing.

const FIB_DEFAULTS = { n: 8, mode: "fib", bots: 2 };
const FIB_BOT_CHOICES = [0, 1, 2, 3];
const FIB_MAX_LEN = 40, QUIB_MAX_LEN = 60;
const isQuib = G => (G.fset || {}).mode === "quib";
// Fibs get a capital first letter like the real answers, so a lowercase fake doesn't stand out.
const cleanFib = (s, max = FIB_MAX_LEN) => { const t = String(s || "").replace(/\s+/g, " ").trim().slice(0, max); return t.charAt(0).toUpperCase() + t.slice(1); };
// Loose comparison, so "a murder", "Murder!" and "murders" all count as the same answer.
const normFib = s => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()
  .replace(/^(a|an|the) /, "").split(" ").map(singular).join(" ");
function singular(w) {
  if (w.length <= 3 || /ss$/.test(w)) return w;
  if (/(ches|shes|xes|sses|zes)$/.test(w)) return w.slice(0, -2);
  return w.replace(/s$/, "");
}
const isTruth = (fact, s) => [fact.a, ...(fact.alts || [])].some(x => normFib(x) === normFib(s));
// The real answer is the one option with no author that isn't a bot.
const isTruthOpt = o => !o.by && !o.bot;
const BOT_NAME = "Bot";

/* ---------- Host side ---------- */

const fibHost = {
  // Facts nobody has had yet come first, then the ones seen longest ago.
  newGame(G, seats) {
    const set = { ...FIB_DEFAULTS, ...(G.fset || {}) }, quib = set.mode === "quib";
    const bank = quib ? QUIBS.map(q => ({ q })) : FIBS, key = quib ? "usedQuibs" : "usedFibs";
    const used = (G[key] || []).filter(q => bank.some(f => f.q === q));
    const deck = [...shuffle(bank.filter(f => !used.includes(f.q))), ...used.map(q => bank.find(f => f.q === q))];
    const qs = deck.slice(0, set.n);
    const total = {}; seats.forEach(p => { total[p] = 0; });
    return { gid: "f" + Date.now().toString(36), phase: "fwrite", players: seats, [key]: [...used.filter(q => !qs.some(f => f.q === q)), ...qs.map(f => f.q)],
      f: { quib, bots: FIB_BOT_CHOICES.includes(set.bots) ? set.bots : FIB_DEFAULTS.bots, qs, qi: 0, lies: {}, votes: {}, options: null, round: null, total } };
  },

  lie(G, who, raw) {
    const f = G.f, fact = f.qs[f.qi], text = cleanFib(raw, f.quib ? QUIB_MAX_LEN : FIB_MAX_LEN);
    if (!text) return { ok: false, msg: f.quib ? "Type an answer first." : "Type a fake answer first." };
    if (!f.quib && isTruth(fact, text)) return { ok: false, msg: "That's actually the real answer! Write a fib instead." };
    const taken = Object.entries(f.lies).find(([p, l]) => p !== who && normFib(l) === normFib(text));
    if (taken) return { ok: false, msg: f.quib ? "Someone already wrote that. Try something else." : "Someone already wrote that. Try a different fib." };
    f.lies[who] = text;
    return { ok: true, msg: "Got it." };
  },

  toVote(G) {
    const f = G.f, fact = f.qs[f.qi];
    const opts = Object.entries(f.lies).map(([p, text]) => ({ id: rid().slice(0, 6), text, by: p }));
    if (!f.quib) opts.push({ id: rid().slice(0, 6), text: fact.a, by: null });
    // Bot answers that duplicate a player's answer (or the truth) are skipped.
    const bots = f.quib ? (typeof QUIB_BOTS !== "undefined" ? QUIB_BOTS : {}) : (typeof FIB_BOTS !== "undefined" ? FIB_BOTS : {});
    const bank = bots[fact.q] || [];
    for (const raw of shuffle(bank.slice())) {
      if (opts.filter(o => o.bot).length >= (f.bots || 0)) break;
      const text = cleanFib(raw, f.quib ? QUIB_MAX_LEN : FIB_MAX_LEN);
      if (!text || (!f.quib && isTruth(fact, text)) || opts.some(o => normFib(o.text) === normFib(text))) continue;
      opts.push({ id: rid().slice(0, 6), text, by: null, bot: true });
    }
    f.options = shuffle(opts); f.votes = {};
    G.phase = "fvote";
  },

  reveal(G) {
    const f = G.f, d = {}, why = {};
    G.players.forEach(p => { d[p] = 0; why[p] = []; });
    for (const [voter, id] of Object.entries(f.votes)) {
      const o = f.options.find(x => x.id === id); if (!o) continue;
      if (o.bot) continue;
      if (!o.by) { d[voter] += 2; why[voter].push("found the truth"); }
      else if (d[o.by] != null) { d[o.by] += 1; why[o.by].push(f.quib ? `${voter} laughed` : `fooled ${voter}`); }
    }
    // Quibber sweep: every other voter (at least two) picked your answer, so +2 bonus.
    let sweep = null;
    if (f.quib) {
      for (const o of f.options) {
        const others = Object.keys(f.votes).filter(p => p !== o.by);
        if (others.length >= 2 && others.every(p => f.votes[p] === o.id) && d[o.by] != null) { d[o.by] += 2; sweep = o.by; }
      }
    }
    G.players.forEach(p => { f.total[p] = (f.total[p] || 0) + d[p]; });
    f.round = { d, why, sweep };
    G.phase = "freveal";
  },

  next(G) {
    const f = G.f;
    if (f.qi < f.qs.length - 1) { Object.assign(f, { qi: f.qi + 1, lies: {}, votes: {}, options: null, round: null }); G.phase = "fwrite"; return; }
    const key = f.quib ? "qscores" : "fscores";
    G[key] = G[key] || {};
    G.players.forEach(p => { G[key][p] = (G[key][p] || 0) + (f.total[p] || 0); });
    G.phase = "fresults";
  },

  view(G, name, last) {
    const f = G.f, fact = f.qs[f.qi], done = G.phase === "freveal" || G.phase === "fresults";
    const v = { quib: !!f.quib, qi: f.qi, n: f.qs.length, q: fact.q, wrote: Object.keys(f.lies), myLie: f.lies[name] || "", voted: Object.keys(f.votes), myVote: f.votes[name] || null, total: f.total, last: last || null };
    // While voting, nobody learns who wrote what. Your own fib is marked so you can't vote for it.
    if (G.phase === "fvote") v.options = f.options.map(o => ({ id: o.id, text: o.text, mine: o.by === name }));
    if (done) {
      v.answer = f.quib ? null : fact.a;
      v.options = f.options.map(o => ({ id: o.id, text: o.text, by: o.by, bot: !!o.bot, pickers: Object.keys(f.votes).filter(p => f.votes[p] === o.id) }));
      v.round = f.round;
    }
    return v;
  }
};

/* ---------- Player side ---------- */

function noteFibView(v) {
  const last = v && v.f && v.f.last;
  if (last && last.n !== ui.fLastN) { if (ui.fLastN != null || Date.now() - (last.at || 0) < 3000) ui.fMsg = last; ui.fLastN = last.n; }
}

function fibSubmit() {
  const quib = ui.view && ui.view.f && ui.view.f.quib;
  const inp = document.getElementById("fIn"), text = cleanFib(inp ? inp.value : ui.fDraft, quib ? QUIB_MAX_LEN : FIB_MAX_LEN);
  if (!text) { ui.fMsg = { ok: false, msg: quib ? "Type an answer first." : "Type a fake answer first." }; fibPatch(); return; }
  ui.fMsg = { ok: true, msg: "Sending…" }; fibPatch();
  act({ type: "lie", text });
}

const fibWho = names => names.map(esc).join(", ");
function fibStatus(v) {
  const f = v.f, n = v.players.length, waiting = v.players.filter(p => !f.wrote.includes(p));
  return `<div class="row-between"><div class="label">${f.quib ? "Answers in" : "Fibs in"}</div><span class="muted small">${f.wrote.length} of ${n}</span></div>
    <div class="progress"><div style="width:${(f.wrote.length / n) * 100}%"></div></div>
    <p class="muted small">${waiting.length ? `Waiting for ${fibWho(waiting)}.` : "Everyone's in."}</p>
    ${host.active && f.wrote.length && waiting.length ? `<button class="btn ghost slim" data-act="fvotenow">Someone stuck? Start voting now</button>` : ""}`;
}
const fibMsgHtml = () => ui.fMsg ? `<p class="fmsg ${ui.fMsg.ok ? "good" : "bad"}">${esc(ui.fMsg.msg)}</p>` : `<p class="fmsg">&nbsp;</p>`;

// Mid-question updates only touch the status, so the keyboard doesn't close while someone is typing.
function fibPatch() {
  const v = ui.view, s = document.getElementById("fstatus"), m = document.getElementById("fmsg");
  if (s && v && v.f) s.innerHTML = fibStatus(v);
  if (m) m.innerHTML = fibMsgHtml();
  const mine = document.getElementById("fmine");
  if (mine && v && v.f) mine.innerHTML = myLieHtml(v.f);
}
const myLieHtml = f => f.myLie ? `${f.quib ? "Your answer" : "Your fib"}: <b>${esc(f.myLie)}</b>. You can change it until everyone's in.` : "";

const fibName = v => v.f && v.f.quib ? "Quibber" : "Fibber";
const fibStep = v => `${fibName(v)} · ${v.f.qi + 1} of ${v.f.n}`;
const fibFact = q => `<div class="qtext ftext">${esc(q).replace(/_{3,}/g, '<span class="blank">_____</span>')}</div>`;

const fibViews = {
  fwrite() {
    const v = ui.view, f = v.f;
    return head(fibStep(v)) + `
    <section class="card spot">
      <div class="label">${f.quib ? "Write the funniest answer you can" : "Fill in the blank with a fake answer"}</div>
      ${fibFact(f.q)}
      <p class="muted small">${f.quib ? "There's no right answer. Everyone votes for the one that makes them laugh." : "Make it believable. Everyone will try to spot the real one among the fakes."}</p>
      <div class="bentry">
        <input class="field fib" id="fIn" maxlength="${f.quib ? QUIB_MAX_LEN : FIB_MAX_LEN}" placeholder="${f.quib ? "Your answer" : "Your fib"}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="send" value="${esc(ui.fDraft || "")}">
        <button class="btn" data-act="fsubmit">${f.myLie ? "Change" : "Submit"}</button>
      </div>
      <div id="fmsg">${fibMsgHtml()}</div>
      <p class="muted small" id="fmine">${myLieHtml(f)}</p>
    </section>
    <section class="card" id="fstatus">${fibStatus(v)}</section>`;
  },

  fvote() {
    const v = ui.view, f = v.f, n = v.players.length, waiting = v.players.filter(p => !f.voted.includes(p));
    return head(fibStep(v)) + `
    <section class="card">
      <div class="label">${f.quib ? "Which one is funniest?" : "Which one is true?"}</div>
      ${fibFact(f.q)}
    </section>
    <div class="fopts">${f.options.map(o => o.mine
      ? `<button class="fopt mine" disabled>${esc(o.text)}<small>${f.quib ? "yours" : "your fib"}</small></button>`
      : `<button class="fopt" data-act="fpick" data-v="${esc(o.id)}" aria-pressed="${f.myVote === o.id}">${esc(o.text)}</button>`).join("")}</div>
    <section class="card">
      <div class="row-between"><div class="label">Votes in</div><span class="muted small">${f.voted.length} of ${n}</span></div>
      <div class="progress"><div style="width:${(f.voted.length / n) * 100}%"></div></div>
      <p class="muted small">${f.myVote ? "Voted. You can switch until everyone's in." : f.quib ? "Tap your favorite." : "Tap the answer you think is real."} ${waiting.length ? `Waiting for ${fibWho(waiting)}.` : ""}</p>
      ${host.active && f.voted.length && waiting.length ? `<button class="btn ghost slim" data-act="frevealnow">Someone stuck? Reveal now</button>` : ""}
    </section>`;
  },

  freveal() {
    if (ui.view.f.quib) return quibReveal();
    const v = ui.view, f = v.f, truth = f.options.find(isTruthOpt), lies = f.options.filter(o => !isTruthOpt(o)).sort((a, b) => b.pickers.length - a.pickers.length);
    const order = v.players.slice().sort((a, b) => (f.total[b] || 0) - (f.total[a] || 0));
    const last = f.qi === f.n - 1;
    return head(fibStep(v)) + `
    <section class="card">${fibFact(f.q)}</section>
    <section class="card spot center">
      <div class="label">The truth</div>
      <div class="big-name ftruth">${esc(truth.text)}</div>
      <p class="muted small">${truth.pickers.length ? `Spotted by ${fibWho(truth.pickers)} (+2 each)` : "Nobody found it!"}</p>
    </section>
    <section class="card">
      <div class="label">The fibs</div>
      <ul class="flies">${lies.map(o => `<li class="${o.by === v.me ? "you" : ""}"><div><b>${esc(o.text)}</b><small class="muted">${o.bot ? "🤖 Bot's fib" : `${esc(o.by)}'s fib`}</small></div><span>${o.pickers.length ? `fooled ${fibWho(o.pickers)}${o.bot ? "" : ` <em>+${o.pickers.length}</em>`}` : `<span class="muted">fooled nobody</span>`}</span></li>`).join("")}</ul>
    </section>
    <section class="card">
      <div class="label">Scores</div>
      <ul class="players">${order.map(p => `<li class="${p === v.me ? "you" : ""}"><span>${esc(p)} <small class="muted">${f.round.d[p] ? `+${f.round.d[p]} this question` : ""}</small></span><em>${f.total[p] || 0}</em></li>`).join("")}</ul>
    </section>
    <button class="btn" data-act="fnext">${last ? "See final scores" : "Next question"}</button>`;
  },

  fresults() {
    const v = ui.view, f = v.f, order = v.players.slice().sort((a, b) => (f.total[b] || 0) - (f.total[a] || 0));
    const top = f.total[order[0]] || 0, winners = order.filter(p => (f.total[p] || 0) === top && top > 0);
    const board = f.quib ? v.qscores : v.fscores;
    return head(`${fibName(v)} · Game over`) + `
    <section class="card center">
      <div class="label">${winners.length > 1 ? "Tied for the win" : winners.length ? (f.quib ? "Funniest player" : "Best fibber") : "Nobody scored"}</div>
      ${winners.length ? `<div class="big-name">${winners.map(esc).join(" & ")}</div><p class="muted">${top} points</p>` : ""}
    </section>
    <section class="card">
      <div class="label">This game</div>
      <ul class="players">${order.map(p => `<li class="${p === v.me ? "you" : ""}"><span>${esc(p)}</span><em>${f.total[p] || 0}</em></li>`).join("")}</ul>
    </section>
    <section class="card">
      <div class="label">${fibName(v)} scoreboard</div>
      <ul class="players">${v.players.slice().sort((a, b) => (board[b] || 0) - (board[a] || 0)).map(p => `<li class="${p === v.me ? "you" : ""}"><span>${esc(p)}</span><em>${board[p] || 0}</em></li>`).join("")}</ul>
    </section>
    <button class="btn" data-act="start">Play again</button>
    <button class="btn ghost" data-act="tolobby">Back to lobby</button>`;
  }
};

function quibReveal() {
  const v = ui.view, f = v.f, opts = f.options.slice().sort((a, b) => b.pickers.length - a.pickers.length);
  const order = v.players.slice().sort((a, b) => (f.total[b] || 0) - (f.total[a] || 0));
  const top = opts.length ? opts[0].pickers.length : 0, last = f.qi === f.n - 1;
  return head(fibStep(v)) + `
    <section class="card">${fibFact(f.q)}</section>
    ${f.round.sweep ? `<section class="card spot center"><div class="label">Clean sweep!</div><div class="big-name">${esc(f.round.sweep)}</div><p class="muted small">Everyone voted for it. +2 bonus</p></section>` : ""}
    <section class="card">
      <div class="label">The answers</div>
      <ul class="flies">${opts.map(o => `<li class="${o.by === v.me ? "you" : ""}${top && o.pickers.length === top ? " top" : ""}"><div><b>${esc(o.text)}</b><small class="muted">${o.bot ? "🤖 " + BOT_NAME : esc(o.by)}</small></div><span>${o.pickers.length ? `${fibWho(o.pickers)}${o.bot ? "" : ` <em>+${o.pickers.length}</em>`}` : `<span class="muted">no votes</span>`}</span></li>`).join("")}</ul>
    </section>
    <section class="card">
      <div class="label">Scores</div>
      <ul class="players">${order.map(p => `<li class="${p === v.me ? "you" : ""}"><span>${esc(p)} <small class="muted">${f.round.d[p] ? `+${f.round.d[p]} this round` : ""}</small></span><em>${f.total[p] || 0}</em></li>`).join("")}</ul>
    </section>
    <button class="btn" data-act="fnext">${last ? "See final scores" : "Next prompt"}</button>`;
}

function fibLobby(v, lock, isHost) {
  const fs = v.fset, quib = fs.mode === "quib";
  return `<section class="card">
      <div class="label">Answers</div>
      <div class="chips">${[["fib", "Real answer"], ["quib", "Funniest answer"]].map(([m, label]) => `<button class="chip" data-act="fmode" data-v="${m}" ${lock} aria-pressed="${fs.mode === m}">${label}</button>`).join("")}</div>
      <p class="muted small">${quib ? "<b>Quibber:</b> silly prompts with no right answer. Vote for the funniest." : "<b>Fibber:</b> strange-but-true facts. Bluff, then find the truth."}</p>
    </section>
    <section class="card">
      <div class="label">${quib ? "Prompts" : "Questions"}</div>
      <div class="chips">${[5, 8, 10].map(n => `<button class="chip" data-act="fn" data-v="${n}" ${lock} aria-pressed="${fs.n === n}">${n}</button>`).join("")}</div>
    </section>
    <section class="card">
      <div class="label">Bot answers</div>
      <div class="chips">${FIB_BOT_CHOICES.map(n => `<button class="chip" data-act="fbots" data-v="${n}" ${lock} aria-pressed="${fs.bots === n}">${n ? n : "None"}</button>`).join("")}</div>
      <p class="muted small">${quib ? "The bot adds its own jokes to the vote. Can you beat it?" : "The bot slips extra fake answers in with yours, so the truth is harder to find."} Votes for the bot score nothing.</p>
      ${isHost ? "" : `<p class="muted small">${esc(v.hostName)} picks the settings.</p>`}
    </section>
    <button class="btn" data-act="start" ${v.seats.length >= 2 ? "" : "disabled"}>Start ${quib ? "Quibber" : "Fibber"}</button>
    ${quib ? `<section class="card"><div class="label">How Quibber works</div><ul class="rules">
      <li>Everyone gets the same silly prompt.</li>
      <li>Type the funniest answer you can think of. There's no right answer.</li>
      <li>All the answers show up on every phone without names, plus the bot's if it's on. Vote for your favorite (not your own).</li>
      <li><b>+1</b> for every vote you get. If everyone else votes for yours, that's a clean sweep: <b>+2</b> bonus.</li></ul></section>` : `<section class="card"><div class="label">How Fibber works</div><ul class="rules">
      <li>Everyone sees the same strange-but-true fact with a blank in it.</li>
      <li>Write a fake answer that sounds real. If you accidentally write the true answer, you'll be asked for another.</li>
      <li>All the fibs and the real answer show up on every phone, plus fakes from the bot if it's on. Vote for the one you think is true.</li>
      <li><b>+2</b> for finding the truth. <b>+1</b> for every player who falls for your fib.</li></ul></section>`}`;
}
