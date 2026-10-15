// Gekko: one phone hosts the game, everyone else joins with a room code.
// The host keeps the real game state and sends each player only what they're allowed to see.
// Connections go phone-to-phone through PeerJS (WebRTC), so the site itself is fully static.

const PEER_PREFIX = "gekko-party-v1-";
const CODE_WORDS = ["FROG","MOON","TACO","LAMP","BIKE","DUCK","FISH","CAKE","ROCK","STAR","TREE","BEAR","GOLF","JAZZ","KIWI","LIME","MILK","NEST","PEAR","RAIN","SOCK","TOAD","WAVE","YETI","ZOOM","BARK","CORN","DOVE","FERN","GLOW","HOOT","LEAF","MINT","PINE","ROOF","SALT","TUBA","WOLF","YAWN","SOUP"];
const DEFAULT_GAME = { gid: "", phase: "lobby", players: [], scores: {}, cats: [], qPer: 1 };

const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
const newCode = () => pick(CODE_WORDS);
const joinLink = code => location.origin + location.pathname + "#" + code;

/* ---------------- Host: the authoritative game ---------------- */

const host = {
  active: false, peer: null, code: "", me: "", conns: new Map(), // name -> DataConnection
  G: { ...DEFAULT_GAME }, seats: [], votes: {},

  save() { lsSet("gekko-host", JSON.stringify({ code: this.code, me: this.me, G: this.G, seats: this.seats, votes: this.votes, t: Date.now() })); },

  start(me, saved) {
    this.active = true; this.me = me;
    if (saved) Object.assign(this, { code: saved.code, G: saved.G, seats: saved.seats, votes: saved.votes || {} });
    else { this.code = newCode(); this.G = { ...DEFAULT_GAME }; this.seats = [me]; this.votes = {}; }
    if (!this.seats.includes(me)) this.seats.push(me);
    this.open(!!saved);
  },

  open(isRestore) {
    ui.status = "opening";
    const peer = new Peer(PEER_PREFIX + this.code);
    this.peer = peer;
    peer.on("open", () => { ui.status = "live"; this.save(); this.broadcast(); });
    peer.on("connection", conn => {
      conn.on("data", msg => this.receive(msg, conn));
      conn.on("close", () => { for (const [n, c] of this.conns) if (c === conn) this.conns.delete(n); render(); });
    });
    peer.on("disconnected", () => { if (!peer.destroyed) setTimeout(() => peer.reconnect(), 1500); });
    peer.on("error", e => {
      if (e.type === "unavailable-id") {
        peer.destroy();
        if (isRestore) { ui.status = "live"; ui.err = `Room ${this.code} is still open somewhere else, maybe in another tab. Close it there, or start a new game.`; render(); return; }
        this.code = newCode(); this.open(false);
      } else if (e.type === "network" || e.type === "server-error" || e.type === "socket-error") {
        ui.err = "Lost touch with the matchmaking server. Retrying…"; render();
      }
    });
    render();
  },

  send(conn, msg) { try { if (conn.open) conn.send(msg); } catch (e) {} },

  receive(msg, conn) {
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "join") {
      const name = String(msg.name || "").trim().slice(0, 20);
      if (!name) return;
      const existing = this.seats.find(s => s.toLowerCase() === name.toLowerCase());
      if (!existing && this.seats.length >= 10) { this.send(conn, { t: "err", msg: "That room is full (10 players max)." }); return; }
      const finalName = existing || name;
      if (!existing) this.seats.push(finalName);
      const old = this.conns.get(finalName);
      if (old && old !== conn) try { old.close(); } catch (e) {}
      this.conns.set(finalName, conn);
      conn.gekkoName = finalName;
      this.send(conn, { t: "welcome", name: finalName });
      this.changed();
      return;
    }
    if (msg.t === "act" && conn.gekkoName) this.apply(msg.a || {}, conn.gekkoName);
  },

  apply(a, who) {
    const G = this.G, idx = G.players.indexOf(who);
    switch (a.type) {
      case "kick": this.seats = this.seats.filter(s => s !== a.name || s === this.me); break;
      case "leave": if (G.phase === "lobby" && who !== this.me) this.seats = this.seats.filter(s => s !== who); break;
      case "cat": { const c = G.cats || []; if (!BANK[a.cat]) return; G.cats = c.includes(a.cat) ? c.filter(x => x !== a.cat) : [...c, a.cat]; break; }
      case "allcats": G.cats = []; break;
      case "qper": if ([1, 2, 3].includes(a.n)) G.qPer = a.n; break;
      case "resetscores": G.scores = {}; break;
      case "start": {
        if (this.seats.length < 3) return;
        this.G = { ...DEFAULT_GAME, scores: G.scores, cats: G.cats, qPer: G.qPer, ...buildRound(this.seats.slice(), G.cats, G.qPer) };
        this.votes = {};
        break;
      }
      case "toquestions": if (G.phase === "cards") { G.phase = "questions"; G.qi = 0; } break;
      case "nextq":
        if (G.phase !== "questions" || a.qi !== G.qi) return;
        if (G.qi < G.questions.length - 1) G.qi++; else G.phase = "discuss";
        break;
      case "swapq": {
        if (G.phase !== "questions" || a.qi !== G.qi) return;
        const used = new Set(G.questions.map(q => q.q));
        const fresh = BANK[G.rcat].qs.filter(q => !used.has(q));
        G.questions[G.qi].q = pick(fresh.length ? fresh : BANK[G.rcat].qs.filter(q => q !== G.questions[G.qi].q));
        break;
      }
      case "tovote": if (G.phase === "discuss") G.phase = "vote"; break;
      case "vote":
        if (G.phase !== "vote" || idx < 0 || a.target === idx || !(a.target >= 0 && a.target < G.players.length)) return;
        this.votes[idx] = a.target;
        break;
      case "closevote": if (G.phase === "vote" && who === this.me && Object.keys(this.votes).length > 0) G.votingClosed = true; break;
      case "reveal": if (G.phase === "vote" && (G.votingClosed || Object.keys(this.votes).length >= G.players.length)) G.phase = "reveal"; break;
      case "guess": {
        if (G.phase !== "reveal" || idx !== G.out || !G.options.includes(a.word)) return;
        const t = tallyOf(this.votes, G), d = G.players.map(() => 0), why = G.players.map(() => []);
        for (const [voter, target] of Object.entries(this.votes)) if (+voter !== G.out && target === G.out) { d[voter] += 1; why[voter].push("spotted them"); }
        if (!t.caught) { d[G.out] += 2; why[G.out].push("escaped"); }
        if (a.word === G.word) { d[G.out] += 2; why[G.out].push("guessed the word"); }
        G.players.forEach((p, k) => { G.scores[p] = (G.scores[p] || 0) + d[k]; });
        Object.assign(G, { phase: "results", guess: a.word, deltas: { d, why } });
        break;
      }
      case "tolobby": G.phase = "lobby"; break;
      default: return;
    }
    this.changed();
  },

  changed() { this.save(); this.broadcast(); },

  broadcast() {
    for (const [name, conn] of this.conns) this.send(conn, { t: "view", view: this.viewFor(name) });
    ui.view = this.viewFor(this.me);
    render();
  },

  // Everything a single player is allowed to know right now.
  viewFor(name) {
    const G = this.G, idx = G.players.indexOf(name), inRound = idx >= 0;
    const late = ["reveal", "results"].includes(G.phase);
    const nVotes = Object.keys(this.votes).length, allVoted = G.players.length > 0 && (nVotes >= G.players.length || !!G.votingClosed);
    const v = {
      code: this.code, hostName: this.me, me: name, seats: this.seats.slice(), online: [this.me, ...this.conns.keys()],
      phase: G.phase, gid: G.gid, players: G.players, scores: G.scores, cats: G.cats || [], qPer: G.qPer,
      myIdx: idx, rcat: G.rcat, questions: G.questions, qi: G.qi,
      voted: Object.keys(this.votes).map(Number), myVote: inRound && this.votes[idx] != null ? this.votes[idx] : null
    };
    if (inRound && G.phase !== "lobby") {
      v.isOut = idx === G.out;
      if (!v.isOut || G.phase === "results") v.word = G.word;
    }
    if (G.phase === "results") v.word = G.word;
    if (allVoted || late) v.counts = tallyOf(this.votes, G).counts;
    if (late) v.out = G.out;
    if (G.phase === "reveal" && idx === G.out) v.options = G.options;
    if (G.phase === "results") { v.guess = G.guess; v.deltas = G.deltas; }
    return v;
  }
};

function buildRound(players, cats, qPer) {
  const n = players.length;
  const chosen = (cats || []).filter(c => BANK[c]);
  const cat = pick(chosen.length ? chosen : CATS);
  const word = pick(BANK[cat].words);
  // Every player asks once and gets asked once per pass.
  const questions = [];
  let pool = [];
  for (let k = 0; k < qPer; k++) {
    const order = shuffle([...Array(n).keys()]);
    for (let i = 0; i < n; i++) {
      if (!pool.length) pool = shuffle(BANK[cat].qs);
      questions.push({ a: order[i], b: order[(i + 1) % n], q: pool.pop() });
    }
  }
  const decoys = shuffle(BANK[cat].words.filter(w => w !== word)).slice(0, 7);
  return {
    gid: "g" + Date.now().toString(36), phase: "cards", players, rcat: cat, word,
    out: Math.floor(Math.random() * n), questions, qi: 0, options: shuffle([word, ...decoys]), guess: null, deltas: null
  };
}

function tallyOf(votes, G) {
  const counts = G.players.map(() => 0);
  Object.values(votes).forEach(t => { if (counts[t] != null) counts[t]++; });
  const max = Math.max(...counts);
  const tops = counts.map((c, i) => c === max ? i : -1).filter(i => i >= 0);
  return { counts, tops, caught: tops.length === 1 && tops[0] === G.out };
}

/* ---------------- Guest: a phone that joined a room ---------------- */

const guest = {
  active: false, peer: null, conn: null, code: "", name: "", retry: null,

  start(code, name) {
    this.active = true; this.code = code; this.name = name;
    lsSet("gekko-last", JSON.stringify({ code, name }));
    ui.status = "opening"; render();
    this.peer = new Peer();
    this.peer.on("open", () => this.connect());
    this.peer.on("disconnected", () => { if (!this.peer.destroyed) setTimeout(() => this.peer.reconnect(), 1500); });
    this.peer.on("error", e => {
      if (e.type === "peer-unavailable") {
        ui.status = ui.view ? "lost" : "noroom";
        render();
        this.scheduleRetry();
      } else if (["network", "server-error", "socket-error"].includes(e.type)) {
        ui.status = "lost"; render(); this.scheduleRetry();
      }
    });
  },

  connect() {
    clearTimeout(this.retry);
    if (this.conn) try { this.conn.close(); } catch (e) {}
    const conn = this.peer.connect(PEER_PREFIX + this.code, { reliable: true });
    this.conn = conn;
    conn.on("open", () => conn.send({ t: "join", name: this.name }));
    conn.on("data", msg => {
      if (msg.t === "welcome") { this.name = msg.name; ui.status = "live"; ui.err = ""; render(); }
      else if (msg.t === "view") { ui.view = msg.view; ui.status = "live"; render(); }
      else if (msg.t === "err") { ui.err = msg.msg; ui.status = "rejected"; render(); }
    });
    conn.on("close", () => { if (this.conn === conn && ui.status !== "rejected") { ui.status = "lost"; render(); this.scheduleRetry(); } });
  },

  scheduleRetry() {
    clearTimeout(this.retry);
    this.retry = setTimeout(() => { if (this.peer && !this.peer.destroyed && this.peer.open) this.connect(); else this.scheduleRetry(); }, 2500);
  },

  send(a) { try { if (this.conn && this.conn.open) this.conn.send({ t: "act", a }); } catch (e) {} }
};

function act(a) {
  if (host.active) host.apply(a, host.me);
  else if (guest.active) guest.send(a);
}

/* ---------------- Views ---------------- */

const ui = { view: null, status: "home", err: "", shown: false, lastKey: "", draftName: lsGet("gekko-name") || "", draftCode: "" };

function head(step) {
  const v = ui.view;
  return `<header><div class="logo"><i></i>Gekko</div><div class="step">${esc(step || "")}</div></header>
    ${v ? `<div class="me"><span>Playing as <b>${esc(v.me)}</b> in room <b class="mono">${esc(v.code)}</b></span><button class="link" data-act="quit">Leave</button></div>` : ""}
    ${ui.status === "lost" ? `<div class="banner">Connection dropped. Reconnecting…</div>` : ""}
    ${ui.err ? `<div class="banner bad">${esc(ui.err)}</div>` : ""}`;
}

const views = {
  home() {
    const saved = savedHost();
    return head("") + `
    <section class="card">
      <h1>Who's out of the loop?</h1>
      <p class="muted">Everyone gets the secret word except one player. Answer questions, sniff out the outsider, and hope they can't work out the word. Everyone plays on their own phone.</p>
    </section>
    <section class="card">
      <label class="label" for="nameIn">Your name</label>
      <input class="field" id="nameIn" maxlength="20" placeholder="e.g. Sam" autocomplete="off" value="${esc(ui.draftName)}">
      <div class="split">
        <div class="stack">
          <div class="label">Join friends</div>
          <input class="field mono code-in" id="codeIn" maxlength="4" placeholder="FROG" autocomplete="off" autocapitalize="characters" value="${esc(ui.draftCode)}">
          <button class="btn" data-act="join">Join room</button>
        </div>
        <div class="stack">
          <div class="label">Or run it</div>
          <p class="muted small">Your phone hosts the room. Keep this page open while you play.</p>
          <button class="btn ghost" data-act="host">Start a new room</button>
        </div>
      </div>
      ${saved ? `<button class="btn ghost" data-act="resume">Reopen room ${esc(saved.code)} (${saved.seats.length} players)</button>` : ""}
    </section>
    ${rulesCard()}`;
  },

  opening() {
    return head("") + `<section class="card center"><div class="spinner"></div><p class="muted">${host.active ? "Opening your room…" : `Finding room ${esc(guest.code)}…`}</p><button class="btn ghost slim" data-act="quit">Cancel</button></section>`;
  },

  noroom() {
    return head("") + `<section class="card">
      <h2>Can't find room ${esc(guest.code)}</h2>
      <p class="muted">Check the code with the host. Their phone needs to have Gekko open. Still trying in the background…</p>
      <button class="btn ghost" data-act="quit">Back</button>
    </section>`;
  },

  rejected() {
    return head("") + `<section class="card"><h2>Couldn't join</h2><p class="muted">${esc(ui.err)}</p><button class="btn ghost" data-act="quit">Back</button></section>`;
  },

  kicked() {
    return head("") + `<section class="card"><h2>You're not in this room anymore</h2><p class="muted">Someone removed you from the lobby.</p>
      <button class="btn" data-act="rejoin">Join again</button><button class="btn ghost" data-act="quit">Leave</button></section>`;
  },

  lobby() {
    const v = ui.view, sel = v.cats, anyScore = v.seats.some(s => v.scores[s]), enough = v.seats.length >= 3;
    const isHost = host.active;
    return head("Lobby") + `
    <section class="card center">
      <div class="label">Room code</div>
      <div class="code mono">${esc(v.code)}</div>
      <div id="qr" class="qr" aria-label="QR code for the join link"></div>
      <p class="muted small">Friends open <b>${esc(location.host + location.pathname)}</b> and type the code, or scan this.</p>
      <button class="btn ghost slim" data-act="copylink">Copy invite link</button>
    </section>
    <section class="card">
      <div class="row-between"><div class="label">Players (${v.seats.length})</div>${anyScore ? `<button class="link" data-act="resetscores">Reset scores</button>` : ""}</div>
      <ul class="players">${v.seats.map(s => `<li class="${s === v.me ? "you" : ""}"><span class="dot ${v.online.includes(s) ? "on" : ""}" title="${v.online.includes(s) ? "Connected" : "Not connected"}"></span><span>${esc(s)}${s === v.me ? ` <small class="muted">(you)</small>` : ""}${s === v.hostName ? ` <small class="muted">host</small>` : ""}</span>${anyScore ? `<em>${v.scores[s] || 0}</em>` : ""}${isHost && s !== v.hostName ? `<button class="x" data-act="kick" data-v="${esc(s)}" aria-label="Remove ${esc(s)}">×</button>` : ""}</li>`).join("")}</ul>
      <p class="muted small">${enough ? "Everyone in? Anyone can deal the cards." : `Waiting for ${3 - v.seats.length} more ${v.seats.length === 2 ? "player" : "players"}.`}</p>
    </section>
    <section class="card">
      <div class="row-between"><div class="label">Categories</div><span class="muted small">${sel.length ? `${sel.length} picked` : "All in the mix"}</span></div>
      <div class="chips"><button class="chip" data-act="allcats" aria-pressed="${!sel.length}">Everything</button>${CATS.map(c => `<button class="chip" data-act="cat" data-v="${esc(c)}" aria-pressed="${sel.includes(c)}">${esc(c)}</button>`).join("")}</div>
      <p class="muted small">Pick one or more. Each round draws a word from one of them at random.</p>
      <div class="label">Questions per player</div>
      <div class="chips">${[1, 2, 3].map(q => `<button class="chip" data-act="qper" data-v="${q}" aria-pressed="${v.qPer === q}">${q}</button>`).join("")}</div>
    </section>
    <button class="btn" data-act="start" ${enough ? "" : "disabled"}>Deal the cards</button>
    ${rulesCard()}`;
  },

  spectate() {
    const v = ui.view;
    return head("Round in progress") + `<section class="card"><h2>A round is already going</h2>
      <p class="muted">You're in the lobby and will be dealt in next round. Playing now: ${v.players.map(esc).join(", ")}.</p></section>`;
  },

  cards() {
    const v = ui.view;
    const card = !ui.shown
      ? `<section class="card center"><div class="label">Your card is ready</div><div class="big-name">${esc(v.me)}</div><p class="muted">Keep your screen to yourself.</p></section>
         <button class="btn" data-act="show">Show my card</button>`
      : `<section class="card center"><div class="label">${esc(v.me)}, you are</div>${cardRing(v)}
           <p class="muted">${v.isOut ? "Everyone else knows the word. Blend in, listen closely, and work out what it is." : "You're in the loop. Answer so the others know you get it, but keep it vague enough that the outsider can't guess."}</p></section>
         <button class="btn ghost" data-act="hide">Hide my card</button>`;
    return head("Your card") + card + `<section class="card"><p class="muted small">When everyone has seen their card, anyone can start the questions.</p>
      <button class="btn" data-act="toquestions">Everyone's ready. Start questions</button></section>`;
  },

  questions() {
    const v = ui.view, q = v.questions[v.qi], tot = v.questions.length, i = v.myIdx;
    const role = i === q.a ? `You're asking. Read the question out loud to ${esc(v.players[q.b])}.`
      : i === q.b ? `${esc(v.players[q.a])} is asking you. Answer about the secret word without saying it.`
      : `Listen to ${esc(v.players[q.b])}'s answer.`;
    return head(`Question ${v.qi + 1} of ${tot}`) + `
      <div class="progress"><div style="width:${(v.qi / tot) * 100}%"></div></div>
      <section class="card ${i === q.a || i === q.b ? "spot" : ""}">
        <div class="qpair"><span class="who ${i === q.a ? "mine" : ""}">${esc(v.players[q.a])}</span><span class="arrow">asks</span><span class="who ${i === q.b ? "mine" : ""}">${esc(v.players[q.b])}</span></div>
        <div class="qtext">${esc(q.q)}</div>
        <p class="muted">${role}</p>
      </section>
      <button class="btn" data-act="nextq">${v.qi === tot - 1 ? "Done. Time to discuss" : "Next question"}</button>
      <button class="btn ghost" data-act="swapq">Swap this question</button>
      ${peek(v)}`;
  },

  discuss() {
    return head("Discuss") + `<section class="card"><h2>Who sounded suspicious?</h2>
      <p class="muted">Talk it over as long as you like. When you're ready, start the vote. Everyone votes on their own phone, the outsider too.</p></section>
      <button class="btn" data-act="tovote">Start the vote</button>${peek(ui.view)}`;
  },

  vote() {
    const v = ui.view, n = v.players.length;
    if (v.counts) return views.tally();
    const waiting = v.players.filter((p, k) => !v.voted.includes(k));
    const mine = v.myVote;
    return head(`Votes in: ${v.voted.length} of ${n}`) + `
      <section class="card">
        <h2>${mine != null ? "Vote locked in" : "Who's out of the loop?"}</h2>
        <p class="muted">${mine != null ? `You voted for <b>${esc(v.players[mine])}</b>. You can change it until everyone has voted.` : "Your vote stays secret until everyone has voted."}</p>
        <div class="grid">${v.players.map((p, k) => k === v.myIdx ? "" : `<button class="pick ${mine === k ? "chosen" : ""}" data-act="vote" data-i="${k}">${esc(p)}</button>`).join("")}</div>
      </section>
      <p class="muted small center-text">Still voting: ${waiting.map(esc).join(", ")}</p>
      ${host.active && v.voted.length ? `<button class="btn ghost slim" data-act="closevote">Someone dropped out? Count the votes now</button>` : ""}`;
  },

  tally() {
    const v = ui.view, max = Math.max(1, ...v.counts), top = Math.max(...v.counts);
    const tops = v.counts.map((c, k) => c === top ? k : -1).filter(k => k >= 0);
    const order = v.players.map((p, k) => k).sort((a, b) => v.counts[b] - v.counts[a]);
    const accused = tops.length === 1 ? v.players[tops[0]] : null;
    return head("The vote") + `
      <section class="card">
        <h2>${accused ? `The group points at ${esc(accused)}` : "It's a tie"}</h2>
        <ul class="tally">${order.map(k => `<li class="${tops.includes(k) ? "top" : ""}"><span>${esc(v.players[k])}</span><span class="bar"><div style="width:${(v.counts[k] / max) * 100}%"></div></span><b>${v.counts[k]}</b></li>`).join("")}</ul>
        ${accused ? "" : `<p class="muted">Nobody got a clear majority, so the outsider slips away.</p>`}
      </section>
      <button class="btn" data-act="reveal">Reveal the outsider</button>`;
  },

  reveal() {
    const v = ui.view, outName = v.players[v.out], caught = isCaught(v);
    return head("The reveal") + `
      <section class="card center">
        <div class="label">The outsider was</div>
        <div class="big-name" style="color:var(--coral)">${esc(outName)}</div>
        <div class="verdict ${caught ? "caught" : "escaped"}">${caught ? "Caught!" : "They got away"}</div>
      </section>
      ${v.options
        ? `<section class="card"><h2>Your last chance</h2><p class="muted">Which one was the secret word? Get it right for 2 bonus points.</p>
            <div class="grid">${v.options.map(w => `<button class="pick" data-act="guess" data-v="${esc(w)}">${esc(w)}</button>`).join("")}</div></section>`
        : `<section class="card center"><div class="spinner"></div><p class="muted">${esc(outName)} is guessing the secret word on their phone…</p></section>`}`;
  },

  results() {
    const v = ui.view, outName = v.players[v.out], right = v.guess === v.word, caught = isCaught(v);
    const board = v.players.map((p, k) => k).sort((a, b) => (v.scores[v.players[b]] || 0) - (v.scores[v.players[a]] || 0));
    return head("Round over") + `
      <section class="card center">
        <div class="label">The word was</div>
        <div class="ring"><div><div class="word">${esc(v.word)}</div><div class="sub">${esc(v.rcat)}</div></div></div>
        <p>${esc(outName)} guessed <b>${esc(v.guess)}</b>. ${right ? "Nailed it." : "Not quite."}</p>
        <p class="muted">${caught ? `The group caught ${esc(outName)}.` : `${esc(outName)} escaped the vote.`}</p>
      </section>
      <section class="card">
        <div class="label">This round</div>
        <ul class="deltas">${v.players.map((p, k) => `<li class="${p === v.me ? "you" : ""}"><span>${esc(p)}${k === v.out ? `<span class="tag">outsider</span>` : ""}<br><small class="muted">${esc(v.deltas.why[k].join(", ") || "no points")}</small></span><span class="pts ${v.deltas.d[k] ? "plus" : "muted"}">+${v.deltas.d[k]}</span></li>`).join("")}</ul>
        <div class="label">Scoreboard</div>
        <ul class="deltas">${board.map(k => `<li class="${v.players[k] === v.me ? "you" : ""}"><span>${esc(v.players[k])}</span><span class="pts">${v.scores[v.players[k]] || 0}</span></li>`).join("")}</ul>
      </section>
      <div class="row"><button class="btn" data-act="start">Play another round</button><button class="btn ghost" data-act="tolobby">Back to lobby</button></div>`;
  }
};

const cardRing = v => v.isOut
  ? `<div class="ring out"><div><div class="word">Out of the loop</div><div class="sub">Category: ${esc(v.rcat)}</div></div></div>`
  : `<div class="ring"><div><div class="word">${esc(v.word)}</div><div class="sub">Category: ${esc(v.rcat)}</div></div></div>`;
const peek = v => `<details class="peek"><summary>Peek at my card</summary><p>${v.isOut ? `You're <b>out of the loop</b>. Category: ${esc(v.rcat)}.` : `The word is <b>${esc(v.word)}</b>.`}</p></details>`;
const rulesCard = () => `<section class="card"><div class="label">Scoring</div><ul class="rules">
  <li><b>+1</b> to each player who votes for the outsider.</li>
  <li><b>+2</b> to the outsider if the vote doesn't land on them (ties count as an escape).</li>
  <li><b>+2</b> more to the outsider for guessing the word at the end.</li></ul></section>`;
function isCaught(v) {
  const top = Math.max(...v.counts), tops = v.counts.map((c, k) => c === top ? k : -1).filter(k => k >= 0);
  return tops.length === 1 && tops[0] === v.out;
}
function savedHost() { try { const s = JSON.parse(lsGet("gekko-host")); return s && s.code && Date.now() - s.t < 12 * 3600e3 ? s : null; } catch (e) { return null; } }

function currentView() {
  if (ui.status === "home") return "home";
  if (ui.status === "rejected") return "rejected";
  if (ui.status === "noroom" && !ui.view) return "noroom";
  if (!ui.view) return "opening";
  const v = ui.view;
  if (!v.seats.includes(v.me)) return "kicked";
  if (v.phase === "lobby") return "lobby";
  if (v.myIdx < 0) return "spectate";
  return v.phase;
}

/* ---------------- Rendering and input ---------------- */

const app = document.getElementById("app");
function render() {
  const view = currentView(), v = ui.view;
  const key = view + "|" + (v ? v.gid : "");
  if (key !== ui.lastKey) {
    if (v && ui.lastKey.split("|")[1] !== v.gid) ui.shown = false;
    ui.lastKey = key;
    window.scrollTo(0, 0);
  }
  const focused = document.activeElement && document.activeElement.id;
  app.innerHTML = views[view]();
  const nameIn = document.getElementById("nameIn"), codeIn = document.getElementById("codeIn");
  if (nameIn) nameIn.addEventListener("input", () => { ui.draftName = nameIn.value; });
  if (codeIn) {
    codeIn.addEventListener("input", () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z]/g, ""); ui.draftCode = codeIn.value; });
    codeIn.addEventListener("keydown", e => { if (e.key === "Enter") { actions.join(); render(); } });
  }
  if (focused) { const el = document.getElementById(focused); if (el) el.focus(); }
  const qr = document.getElementById("qr");
  if (qr && window.QRCode) new QRCode(qr, { text: joinLink(v.code), width: 148, height: 148, colorDark: "#1c1838", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
}

function needName() {
  const name = (ui.draftName || "").trim().slice(0, 20);
  if (!name) { ui.err = "Type your name first."; return null; }
  lsSet("gekko-name", name); ui.err = "";
  return name;
}

const actions = {
  host() { const n = needName(); if (n) host.start(n, null); },
  resume() { const s = savedHost(); if (s) host.start(s.me, s); },
  join() {
    const n = needName(); if (!n) return;
    const code = (ui.draftCode || "").toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) { ui.err = "Room codes are 4-letter words, like FROG."; return; }
    if (location.hash !== "#" + code) history.replaceState(null, "", "#" + code);
    guest.start(code, n);
  },
  rejoin() { if (guest.active) guest.connect(); else location.reload(); },
  quit() {
    if (guest.active && ui.view) guest.send({ type: "leave" });
    setTimeout(() => {
      if (host.active) lsSet("gekko-host", null);
      history.replaceState(null, "", location.pathname);
      location.reload();
    }, 150);
  },
  copylink() {
    const link = joinLink(ui.view.code);
    const done = () => { ui.err = ""; const b = document.querySelector('[data-act="copylink"]'); if (b) b.textContent = "Link copied"; };
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => { ui.err = "Copy didn't work. The link is " + link; render(); });
    else { ui.err = "The link is " + link; render(); }
  },
  show() { ui.shown = true; render(); },
  hide() { ui.shown = false; render(); },
  kick: el => act({ type: "kick", name: el.dataset.v }),
  cat: el => act({ type: "cat", cat: el.dataset.v }),
  allcats: () => act({ type: "allcats" }),
  qper: el => act({ type: "qper", n: +el.dataset.v }),
  resetscores: () => act({ type: "resetscores" }),
  start: () => act({ type: "start" }),
  toquestions: () => act({ type: "toquestions" }),
  nextq: () => act({ type: "nextq", qi: ui.view.qi }),
  swapq: () => act({ type: "swapq", qi: ui.view.qi }),
  tovote: () => act({ type: "tovote" }),
  vote: el => act({ type: "vote", target: +el.dataset.i }),
  reveal: () => act({ type: "reveal" }),
  closevote: () => act({ type: "closevote" }),
  guess: el => act({ type: "guess", word: el.dataset.v }),
  tolobby: () => act({ type: "tolobby" })
};

app.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled || !actions[el.dataset.act]) return;
  const name = el.dataset.act;
  actions[name](el);
  if (["host", "resume", "join", "copylink"].includes(name) || ui.status === "home") render();
  if (name === "host" || name === "resume") keepAwake();
});

// Keep the host's screen on so the room doesn't close mid-game.
let wakeLock = null;
async function keepAwake() { try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {} }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && host.active) keepAwake(); });

// Arriving from an invite link (…/#ABCD) prefills the code.
const hashCode = location.hash.replace("#", "").toUpperCase();
if (/^[A-Z]{4}$/.test(hashCode)) ui.draftCode = hashCode;
render();
if (ui.draftCode && ui.draftName) document.getElementById("codeIn")?.focus();
