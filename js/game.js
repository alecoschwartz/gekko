// Gecko: one phone hosts the game, everyone else joins with a room code.
// The host keeps the real game state and sends each player only what they're allowed to see.
// Phones talk through a public MQTT relay over a secure web connection, so the site itself stays static.

const BROKER = "wss://broker.emqx.io:8084/mqtt";
const TOPIC_ROOT = "gekko-k7q2x/v1/";
const ONLINE_MS = 30000;
// Bump on every release (and the ?v= in index.html). Phones on different versions are told to reload.
const VERSION = "2026-10-24c";
const CODE_WORDS = ["FROG","MOON","TACO","LAMP","BIKE","DUCK","FISH","CAKE","ROCK","STAR","TREE","BEAR","GOLF","JAZZ","KIWI","LIME","MILK","NEST","PEAR","RAIN","SOCK","TOAD","WAVE","YETI","ZOOM","BARK","CORN","DOVE","FERN","GLOW","HOOT","LEAF","MINT","PINE","ROOF","SALT","TUBA","WOLF","YAWN","SOUP"];
const DEFAULT_GAME = { gid: "", phase: "lobby", players: [], scores: {}, cats: [], qPer: 1, game: "gecko", bset: { ...BOGGLE_DEFAULTS }, bscores: {} };
// Lobby settings and scores that carry over from round to round.
const settingsOf = G => ({ scores: G.scores, cats: G.cats, qPer: G.qPer, usedQs: G.usedQs || {}, game: G.game || "gecko", bset: G.bset || { ...BOGGLE_DEFAULTS }, bscores: G.bscores || {} });

const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
const newCode = () => pick(CODE_WORDS);
const joinLink = code => location.origin + location.pathname + "#" + code;
const rid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
const topic = (code, rest) => TOPIC_ROOT + code + "/" + rest;
const parse = buf => { try { return JSON.parse(buf.toString()); } catch (e) { return null; } };
const connectBroker = () => mqtt.connect(BROKER, { clientId: "gk-" + rid(), reconnectPeriod: 2000, connectTimeout: 10000, clean: true });

/* ---------------- Host: the authoritative game ---------------- */

const host = {
  active: false, client: null, code: "", me: "", clients: new Map(), // phone id -> { name, seen }
  G: { ...DEFAULT_GAME }, seats: [], votes: {}, probe: null, ready: false, bLast: {}, bSeq: 0, bTimer: null,

  save() { lsSet("gekko-host", JSON.stringify({ code: this.code, me: this.me, G: this.G, seats: this.seats, votes: this.votes, t: Date.now() })); },

  start(me, saved) {
    this.active = true; this.me = me;
    if (saved) Object.assign(this, { code: saved.code, G: saved.G, seats: saved.seats, votes: saved.votes || {} });
    else { this.code = newCode(); this.G = { ...DEFAULT_GAME }; this.seats = [me]; this.votes = {}; }
    if (!this.seats.includes(me)) this.seats.push(me);
    ui.status = "opening"; render();
    const c = this.client = connectBroker();
    c.on("connect", () => {
      ui.err = "";
      if (this.ready) this.listen();
      else this.pickCode(!!saved, () => { this.ready = true; this.listen(); });
    });
    c.on("message", (t, m) => this.onMessage(t, m));
    c.on("offline", () => { ui.err = "Can't reach the game server. Retrying…"; render(); });
  },

  // Make sure no other live room is using this code.
  pickCode(isRestore, done) {
    if (isRestore) return done();
    const t = topic(this.code, "host");
    this.probe = { topic: t, taken: false };
    this.client.subscribe(t, { qos: 1 }, () => setTimeout(() => {
      this.client.unsubscribe(t);
      const taken = this.probe.taken; this.probe = null;
      if (taken) { this.code = newCode(); this.pickCode(false, done); } else done();
    }, 1500));
  },

  listen() {
    this.client.subscribe(topic(this.code, "up"), { qos: 1 });
    this.beat();
    clearInterval(this.beatTimer);
    this.client.subscribe(topic(this.code, "host"), { qos: 0 });
    this.beatTimer = setInterval(() => { this.beat(); this.checkOnline(); this.resend(); }, 10000);
    ui.status = "live"; this.save(); this.broadcast();
    if (this.G.game === "boggle") loadDict().catch(() => {});
    this.scheduleBoggleEnd();
  },

  // Ends the Boggle round on the host when time runs out (with a little slack for slow messages).
  scheduleBoggleEnd() {
    clearTimeout(this.bTimer);
    if (this.G.phase !== "bplay") return;
    this.bTimer = setTimeout(() => this.endBoggle(), Math.max(0, this.G.b.endsAt + 1500 - Date.now()));
  },
  endBoggle() {
    clearTimeout(this.bTimer);
    loadDict().then(() => { if (this.G.phase !== "bplay") return; boggleHost.finish(this.G); this.changed(); },
      () => { ui.err = "Couldn't load the word list to finish the round. Check the connection."; render(); this.bTimer = setTimeout(() => this.endBoggle(), 5000); });
  },

  hid: rid(), startedAt: Date.now(),
  beat() { if (this.client.connected) this.client.publish(topic(this.code, "host"), JSON.stringify({ t: Date.now(), hid: this.hid }), { qos: 0, retain: true }); },

  close() { if (this.client && this.client.connected) this.client.publish(topic(this.code, "host"), "", { qos: 1, retain: true }); },

  onMessage(t, m) {
    if (this.probe && t === this.probe.topic) { const d = parse(m); if (d && Date.now() - d.t < 60000) this.probe.taken = true; return; }
    if (t === topic(this.code, "host")) {
      const d = parse(m);
      if (d && d.hid && d.hid !== this.hid && d.t > this.startedAt) { ui.err = `Room ${this.code} is also open on another phone or tab. Close the extra one, or the game will split in two.`; render(); }
      return;
    }
    if (t !== topic(this.code, "up")) return;
    const msg = parse(m);
    if (msg && typeof msg === "object" && typeof msg.from === "string") this.receive(msg, msg.from);
  },

  sendTo(cid, msg) { if (this.client.connected) this.client.publish(topic(this.code, "down/" + cid), JSON.stringify(msg), { qos: 1 }); },

  onlineNames() {
    const now = Date.now();
    return [this.me, ...[...this.clients.values()].filter(c => now - c.seen < ONLINE_MS).map(c => c.name)];
  },

  checkOnline() {
    const key = this.onlineNames().sort().join("|");
    if (key !== this.onlineKey) { this.onlineKey = key; this.broadcast(); }
  },

  receive(msg, cid) {
    const known = this.clients.get(cid);
    if (known) known.seen = Date.now();
    if (msg.t === "ping") { if (!known) this.sendTo(cid, { t: "rejoin" }); return; }
    if (msg.t === "join") {
      if (msg.ver !== VERSION) { this.sendTo(cid, { t: "err", reload: true, msg: "Your copy of Gecko is out of date. Reload the page to join." }); return; }
      const name = String(msg.name || "").trim().slice(0, 20);
      if (!name) return;
      const existing = this.seats.find(s => s.toLowerCase() === name.toLowerCase());
      if (!existing && this.seats.length >= 10) { this.sendTo(cid, { t: "err", msg: "That room is full (10 players max)." }); return; }
      const finalName = existing || name;
      // Don't let a second phone take a name someone is actively using.
      const holder = [...this.clients.entries()].find(([id, c]) => id !== cid && c.name === finalName && Date.now() - c.seen < ONLINE_MS);
      if (finalName === this.me || (holder && !msg.reclaim)) {
        this.sendTo(cid, { t: "err", msg: `Someone called ${finalName} is already in this room. Pick a different name.` });
        return;
      }
      for (const [id, c] of this.clients) if (id !== cid && c.name === finalName) this.clients.delete(id);
      if (!existing) this.seats.push(finalName);
      this.clients.set(cid, { name: finalName, seen: Date.now() });
      this.sendTo(cid, { t: "welcome", name: finalName });
      this.changed();
      return;
    }
    if (msg.t === "act" && known) this.apply(msg.a || {}, known.name);
  },

  apply(a, who) {
    const G = this.G, idx = G.players.indexOf(who);
    switch (a.type) {
      case "kick": this.seats = this.seats.filter(s => s !== a.name || s === this.me); break;
      case "leave": if (G.phase === "lobby" && who !== this.me) this.seats = this.seats.filter(s => s !== who); break;
      case "cat": {
        if (who !== this.me) return; const c = G.cats || []; if (!BANK[a.cat]) return; G.cats = c.includes(a.cat) ? c.filter(x => x !== a.cat) : [...c, a.cat]; break; }
      case "allcats": if (who !== this.me) return; G.cats = []; break;
      case "qper": if (who !== this.me || ![1, 2, 3].includes(a.n)) return; G.qPer = a.n; break;
      case "resetscores": if (G.game === "boggle") G.bscores = {}; else { G.scores = {}; G.usedQs = {}; } break;
      case "game":
        if (who !== this.me || G.phase !== "lobby" || !["gecko", "boggle"].includes(a.g)) return;
        G.game = a.g;
        if (a.g === "boggle") loadDict().catch(() => {});
        break;
      case "bmode": if (who !== this.me || !["claim", "open"].includes(a.v)) return; G.bset = { ...BOGGLE_DEFAULTS, ...G.bset, mode: a.v }; break;
      case "bcancel": if (who !== this.me) return; G.bset = { ...BOGGLE_DEFAULTS, ...G.bset, cancel: !!a.v }; break;
      case "bmin": if (who !== this.me || ![3, 4, 5].includes(a.v)) return; G.bset = { ...BOGGLE_DEFAULTS, ...G.bset, min: a.v }; break;
      case "breuse": if (who !== this.me) return; G.bset = { ...BOGGLE_DEFAULTS, ...G.bset, reuse: !!a.v }; break;
      case "bsize": if (who !== this.me || ![4, 5].includes(a.v)) return; G.bset = { ...BOGGLE_DEFAULTS, ...G.bset, size: a.v }; break;
      case "bmins": if (who !== this.me || ![1, 2, 3, 4, 5].includes(a.v)) return; G.bset = { ...BOGGLE_DEFAULTS, ...G.bset, mins: a.v }; break;
      case "word": {
        if (G.phase !== "bplay" || idx < 0 || !DICT.set) return;
        const r = boggleHost.submit(G, who, a.w);
        this.bLast[who] = { ...r, n: ++this.bSeq, at: Date.now() };
        break;
      }
      case "bend": if (G.phase === "bplay" && who === this.me) { this.endBoggle(); return; } return;
      case "start": {
        if (G.game === "boggle") {
          if (!["lobby", "bresults"].includes(G.phase) || !this.seats.length) return;
          // The word list has to be loaded before the board can be rolled.
          if (!DICT.set) {
            if (this.waitingForDict) return;
            this.waitingForDict = true; ui.err = ""; render();
            loadDict().then(() => { this.waitingForDict = false; this.apply(a, who); },
              () => { this.waitingForDict = false; ui.err = "Couldn't load the word list. Check the connection and try again."; render(); });
            return;
          }
          this.G = { ...DEFAULT_GAME, ...settingsOf(G), ...boggleHost.newRound(G, this.seats.slice()) };
          this.bLast = {}; this.votes = {};
          this.scheduleBoggleEnd();
          break;
        }
        if (this.seats.length < 3) return;
        const usedQs = G.usedQs || {};
        this.G = { ...DEFAULT_GAME, ...settingsOf(G), ...buildRound(this.seats.slice(), G.cats, G.qPer, usedQs) };
        this.G.usedQs = usedQs;
        this.votes = {};
        break;
      }
      case "ready":
        if (G.phase !== "cards" || idx < 0) return;
        G.ready = [...new Set([...(G.ready || []), idx])];
        if (G.ready.length >= G.players.length) { G.phase = "questions"; G.qi = 0; }
        break;
      case "startanyway": if (G.phase === "cards" && who === this.me) { G.phase = "questions"; G.qi = 0; } break;
      case "nextq":
        if (G.phase !== "questions" || a.qi !== G.qi) return;
        if (who !== this.me && idx !== G.questions[G.qi].a) return;
        if (!G.questions[G.qi].q) {
          if (idx === G.questions[G.qi].a) return; // the asker has to pick one first
          G.questions[G.qi].q = G.questions[G.qi].opts[0]; // host skipped ahead
        }
        if (G.qi < G.questions.length - 1) G.qi++; else { G.phase = "discuss"; G.voteReady = []; }
        break;
      case "swapq": {
        if (G.phase !== "questions" || a.qi !== G.qi) return;
        if (who !== this.me && idx !== G.questions[G.qi].a) return;
        const inRound = new Set(G.questions.flatMap(q => q.opts || [q.q]));
        const next = questionDeck(G.rcat, G.usedQs || {}).filter(q => !inRound.has(q)).slice(0, 2);
        if (next.length < 2) return;
        G.questions[G.qi].opts = next;
        G.questions[G.qi].q = null;
        G.usedQs = G.usedQs || {};
        markUsed(G.rcat, G.usedQs, next);
        break;
      }
      case "pickq": {
        if (G.phase !== "questions" || a.qi !== G.qi) return;
        const cur = G.questions[G.qi];
        if (idx !== cur.a || !cur.opts || !cur.opts[a.k]) return;
        cur.q = cur.opts[a.k];
        break;
      }
      case "back":
        // a.phase/a.qi say what the sender was looking at, so two people tapping Back only go back one step.
        if (a.phase !== G.phase || (G.phase === "questions" && a.qi !== G.qi)) return;
        if (G.phase === "questions") { if (G.qi > 0) G.qi--; else { G.phase = "cards"; G.ready = []; } }
        else if (G.phase === "discuss") { G.phase = "questions"; G.qi = G.questions.length - 1; G.voteReady = []; }
        else if (G.phase === "vote" && G.voteRound !== 2 && !Object.keys(this.votes).length) { G.phase = "discuss"; G.voteReady = []; }
        else return;
        break;
      case "tovote":
        // Everyone (the Gecko too, so it doesn't stand out) taps "Ready to vote" before the vote opens.
        if (G.phase !== "discuss" || idx < 0) return;
        G.voteReady = [...new Set([...(G.voteReady || []), idx])];
        if (G.voteReady.length >= G.players.length) G.phase = "vote";
        break;
      case "votenow": if (G.phase === "discuss" && who === this.me) G.phase = "vote"; break;
      case "vote":
        if (G.phase !== "vote" || idx < 0 || idx === G.out || a.target === idx || !(a.target >= 0 && a.target < G.players.length)) return;
        this.votes[idx] = a.target;
        break;
      case "closevote": if (G.phase === "vote" && who === this.me && Object.keys(this.votes).length > 0) G.votingClosed = true; break;
      // First vote -> the most-voted player(s) defend themselves -> revote -> reveal.
      case "todefense": {
        if (G.phase !== "vote" || G.voteRound === 2 || !(G.votingClosed || Object.keys(this.votes).length >= G.players.length - 1)) return;
        const t = tallyOf(this.votes, G);
        Object.assign(G, { phase: "defense", accused: t.tops });
        break;
      }
      case "revote":
        if (G.phase !== "defense" || (who !== this.me && !G.accused.includes(idx))) return;
        this.votes = {};
        Object.assign(G, { phase: "vote", voteRound: 2, votingClosed: false });
        break;
      case "reveal": if (G.phase === "vote" && G.voteRound === 2 && (G.votingClosed || Object.keys(this.votes).length >= G.players.length - 1)) G.phase = "reveal"; break;
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
      case "tolobby": clearTimeout(this.bTimer); G.phase = "lobby"; break;
      default: return;
    }
    this.changed();
  },

  changed() { this.save(); this.broadcast(); },

  resend() {
    const now = Date.now();
    for (const [cid, c] of this.clients) if (now - c.seen < ONLINE_MS) this.sendTo(cid, { t: "view", view: this.viewFor(c.name) });
  },

  broadcast() {
    const now = Date.now();
    for (const [cid, c] of this.clients) if (now - c.seen < 10 * 60000) this.sendTo(cid, { t: "view", view: this.viewFor(c.name) });
    ui.view = this.viewFor(this.me);
    noteView(ui.view);
    render();
  },

  // Everything a single player is allowed to know right now.
  viewFor(name) {
    const G = this.G, idx = G.players.indexOf(name), inRound = idx >= 0;
    const late = ["reveal", "results"].includes(G.phase);
    const nVotes = Object.keys(this.votes).length, allVoted = G.players.length > 0 && (nVotes >= G.players.length - 1 || !!G.votingClosed);
    const v = {
      ver: VERSION, code: this.code, hostName: this.me, me: name, seats: this.seats.slice(), online: this.onlineNames(),
      phase: G.phase, gid: G.gid, players: G.players, scores: G.scores, cats: G.cats || [], qPer: G.qPer,
      myIdx: idx, rcat: G.rcat, questions: G.questions, qi: G.qi,
      nVoted: nVotes, ready: G.ready || [], voteReady: G.voteReady || [], voteRound: G.voteRound || 1, accused: G.accused, myVote: inRound && this.votes[idx] != null ? this.votes[idx] : null,
      game: G.game || "gecko", bset: { ...BOGGLE_DEFAULTS, ...(G.bset || {}) }, bscores: G.bscores || {}
    };
    if (G.b && (G.phase === "bplay" || G.phase === "bresults")) { v.b = boggleHost.view(G, name, this.bLast[name]); return v; }
    if (inRound && G.phase !== "lobby") {
      v.isOut = idx === G.out;
      if (!v.isOut || G.phase === "results") v.word = G.word;
    }
    if (G.phase === "results") v.word = G.word;
    // Only who got the most votes, never the numbers. Since the Gecko doesn't vote, counts would show who didn't.
    if (allVoted || late) v.tops = tallyOf(this.votes, G).tops;
    if (late) v.out = G.out;
    if (G.phase === "reveal" && idx === G.out) v.options = G.options;
    if (G.phase === "results") { v.guess = G.guess; v.deltas = G.deltas; }
    return v;
  }
};

// Questions this game hasn't asked yet come first, then the ones asked longest ago. ANY_QS are a last resort.
// used[cat] is ordered oldest-asked first.
function questionDeck(cat, used) {
  const all = BANK[cat].qs, order = (used[cat] || []).filter(q => all.includes(q));
  return [...shuffle(all.filter(q => !order.includes(q))), ...order, ...shuffle(ANY_QS.filter(q => !all.includes(q)))];
}
function markUsed(cat, used, qs) {
  used[cat] = [...(used[cat] || []).filter(q => !qs.includes(q)), ...qs].filter(q => BANK[cat].qs.includes(q));
}

function buildRound(players, cats, qPer, used) {
  const n = players.length;
  const chosen = (cats || []).filter(c => BANK[c]);
  const cat = pick(chosen.length ? chosen : CATS);
  const word = pick(BANK[cat].words);
  // Every player asks once and gets asked once per pass.
  const questions = [];
  let deck = questionDeck(cat, used);
  for (let k = 0; k < qPer; k++) {
    const order = shuffle([...Array(n).keys()]);
    for (let i = 0; i < n; i++) {
      if (!deck.length) deck = questionDeck(cat, {});
      if (deck.length < 2) deck = [...deck, ...questionDeck(cat, {}).filter(q => !deck.includes(q))];
      questions.push({ a: order[i], b: order[(i + 1) % n], opts: [deck.shift(), deck.shift()], q: null });
    }
  }
  markUsed(cat, used, questions.flatMap(q => q.opts));
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
  active: false, client: null, code: "", name: "", cid: "", joined: false, welcomed: false,

  start(code, name) {
    this.active = true; this.code = code; this.name = name;
    this.cid = lsGet("gekko-cid-" + code) || rid();
    lsSet("gekko-cid-" + code, this.cid);
    ui.status = "opening"; render();
    const c = this.client = connectBroker();
    c.on("connect", () => {
      clearTimeout(this.noServer);
      if (ui.status === "lost" || ui.status === "noserver") ui.status = ui.view ? "live" : "opening";
      c.subscribe(topic(code, "down/" + this.cid), { qos: 1 }, () => this.join());
      render();
    });
    c.on("message", (t, m) => { const msg = parse(m); if (msg) this.onMsg(msg); });
    c.on("offline", () => { if (ui.status !== "rejected") { ui.status = ui.view ? "lost" : (ui.status === "noserver" ? "noserver" : "opening"); render(); } });
    this.noServer = setTimeout(() => { if (!c.connected) { ui.status = "noserver"; render(); } }, 12000);
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.publish({ t: "ping" }), 10000);
  },

  // Keep asking to join until the host answers.
  join() {
    this.welcomed = false;
    this.publish({ t: "join", ver: VERSION, name: this.name, reclaim: this.joined || lsGet("gekko-joined-" + this.code) === this.name });
    clearTimeout(this.joinTimer);
    this.joinTimer = setTimeout(() => {
      if (this.welcomed || ui.status === "rejected") return;
      if (!ui.view) { ui.status = "noroom"; render(); }
      this.join();
    }, 6000);
  },

  onMsg(msg) {
    if (msg.t === "welcome") { this.name = msg.name; this.joined = this.welcomed = true; lsSet("gekko-joined-" + this.code, msg.name); ui.status = "live"; ui.err = ""; render(); }
    else if (msg.t === "view") {
      if (msg.view.ver !== VERSION) { ui.status = "outdated"; ui.view = null; render(); return; }
      this.welcomed = true;
      // The host resends every 10s; only redraw when something actually changed.
      const json = JSON.stringify(msg.view);
      if (json === this.lastView && ui.status === "live") return;
      this.lastView = json; ui.view = msg.view; ui.status = "live"; noteView(ui.view); render();
    }
    else if (msg.t === "err") { clearTimeout(this.joinTimer); ui.err = msg.msg; ui.status = msg.reload ? "outdated" : "rejected"; render(); }
    else if (msg.t === "rejoin") this.join();
  },

  publish(msg) { if (this.client && this.client.connected) this.client.publish(topic(this.code, "up"), JSON.stringify({ ...msg, from: this.cid }), { qos: 1 }); },

  send(a) { this.publish({ t: "act", a }); }
};

function act(a) {
  if (host.active) host.apply(a, host.me);
  else if (guest.active) guest.send(a);
}

/* ---------------- Views ---------------- */

const ui = { view: null, status: "home", err: "", shown: false, lastKey: "", draftName: lsGet("gekko-name") || "", draftCode: "" };

function head(step) {
  const v = ui.view;
  return `<header><div class="logo"><svg class="gecko-mark" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M32 40 C32 50 22 56 16 50 C12 46 16 41 20 44"/><path d="M26 24 L16 18 M38 24 L48 18 M27 36 L17 42 M37 36 L47 42"/></g><g fill="currentColor"><circle cx="16" cy="18" r="3.5"/><circle cx="48" cy="18" r="3.5"/><circle cx="17" cy="42" r="3.5"/><circle cx="47" cy="42" r="3.5"/><ellipse cx="32" cy="29" rx="7.5" ry="12"/><ellipse cx="32" cy="12" rx="7" ry="6.5"/></g><g fill="var(--spot)"><circle cx="29.5" cy="11" r="1.6"/><circle cx="34.5" cy="11" r="1.6"/><circle cx="30" cy="26" r="1.8"/><circle cx="34" cy="32" r="1.8"/></g></svg><span>Gecko</span></div><div class="step">${esc(step || "")}</div></header>
    ${v ? `<div class="me"><span>Playing as <b>${esc(v.me)}</b> in room <b class="mono">${esc(v.code)}</b></span><button class="link" data-act="quit">Leave</button></div>` : ""}
    ${ui.status === "lost" ? `<div class="banner">Connection dropped. Reconnecting…</div>` : ""}
    ${ui.err && ui.status !== "rejected" && ui.status !== "outdated" ? `<div class="banner bad">${esc(ui.err)}</div>` : ""}`;
}

const views = {
  home() {
    const saved = savedHost();
    return head("") + `
    <section class="card">
      <h1>Who's the <span class="hl">Gecko</span>?</h1>
      <p class="muted">Everyone gets the secret word except one player: the Gecko. Answer questions, sniff out the Gecko, and hope they can't work out the word. Everyone plays on their own phone.</p>
      <p class="muted small">Also in here: <b>Goggle</b>, a word hunt on a letter grid. Pick it in the lobby.</p>
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

  noserver() {
    return head("") + `<section class="card">
      <h2>Can't reach the game server</h2>
      <p class="muted">This phone can't connect to the server that passes messages between phones. It's still trying in the background. Usually one of these fixes it:</p>
      <ul class="rules">
        <li>Switch networks: turn Wi-Fi off to use mobile data, or the other way around.</li>
        <li>If you opened the link from Instagram, Snapchat, Messenger or another app, open it in Safari or Chrome instead.</li>
        <li>Turn off any VPN or ad blocker.</li>
      </ul>
      <button class="btn" data-act="retry">Try again</button>
      <button class="btn ghost" data-act="quit">Back</button>
    </section>`;
  },

  noroom() {
    return head("") + `<section class="card">
      <h2>Can't find room ${esc(guest.code)}</h2>
      <p class="muted">Check the code with the host. Their phone needs to have Gecko open. Still trying in the background…</p>
      <button class="btn ghost" data-act="quit">Back</button>
    </section>`;
  },

  outdated() {
    return head("") + `<section class="card">
      <h2>Gecko just got an update</h2>
      <p class="muted">Your phone and the host's phone are running different versions, so they can't play together. Reload to get the newest one. If this keeps happening, the host should reload too and reopen the room.</p>
      <button class="btn" data-act="hardreload">Reload Gecko</button>
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
    const v = ui.view, sel = v.cats, boggle = v.game === "boggle", sc = boggle ? v.bscores : v.scores;
    const anyScore = v.seats.some(s => sc[s]), enough = v.seats.length >= (boggle ? 1 : 3);
    const isHost = host.active, lock = isHost ? "" : "disabled", bs = v.bset;
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
      <ul class="players">${v.seats.map(s => `<li class="${s === v.me ? "you" : ""}"><span class="dot ${v.online.includes(s) ? "on" : ""}" title="${v.online.includes(s) ? "Connected" : "Not connected"}"></span><span>${esc(s)}${s === v.me ? ` <small class="muted">(you)</small>` : ""}${s === v.hostName ? ` <small class="muted">host</small>` : ""}</span>${anyScore ? `<em>${sc[s] || 0}</em>` : ""}${isHost && s !== v.hostName ? `<button class="x" data-act="kick" data-v="${esc(s)}" aria-label="Remove ${esc(s)}">×</button>` : ""}</li>`).join("")}</ul>
      <p class="muted small">${boggle ? "Everyone in? Anyone can shake the board." : enough ? "Everyone in? Anyone can deal the cards." : `Waiting for ${3 - v.seats.length} more ${v.seats.length === 2 ? "player" : "players"}.`}</p>
    </section>
    <section class="card">
      <div class="label">Game</div>
      <div class="chips"><button class="chip" data-act="game" data-v="gecko" ${lock} aria-pressed="${!boggle}">Gecko</button><button class="chip" data-act="game" data-v="boggle" ${lock} aria-pressed="${boggle}">Goggle</button></div>
      ${isHost ? "" : `<p class="muted small">${esc(v.hostName)} picks the game.</p>`}
    </section>
    ${boggle ? `<section class="card">
      <div class="label">Who gets each word</div>
      <div class="chips"><button class="chip" data-act="bmode" data-v="claim" ${lock} aria-pressed="${bs.mode === "claim"}">First to find it</button><button class="chip" data-act="bmode" data-v="open" ${lock} aria-pressed="${bs.mode === "open"}">Everyone finds their own</button></div>
      ${bs.mode === "open" ? `<div class="label">Words more than one person found</div>
      <div class="chips"><button class="chip" data-act="bcancel" data-v="0" ${lock} aria-pressed="${!bs.cancel}">Still count</button><button class="chip" data-act="bcancel" data-v="1" ${lock} aria-pressed="${!!bs.cancel}">Cancel out</button></div>` : ""}
      <p class="muted small">${bs.mode === "claim" ? "Once someone gets a word, nobody else can. Everyone's lists show live." : bs.cancel ? "Lists show at the end. A word two or more people found scores for nobody." : "Lists show at the end. Every word you find counts, even if others found it too."}</p>
      <div class="label">Board</div>
      <div class="chips"><button class="chip" data-act="bsize" data-v="4" ${lock} aria-pressed="${bs.size === 4}">4 × 4</button><button class="chip" data-act="bsize" data-v="5" ${lock} aria-pressed="${bs.size === 5}">5 × 5</button></div>
      <div class="label">Reuse a letter in the same word</div>
      <div class="chips"><button class="chip" data-act="breuse" data-v="0" ${lock} aria-pressed="${!bs.reuse}">Not allowed</button><button class="chip" data-act="breuse" data-v="1" ${lock} aria-pressed="${!!bs.reuse}">Allowed</button></div>
      <div class="label">Shortest word allowed</div>
      <div class="chips">${[3, 4, 5].map(n => `<button class="chip" data-act="bmin" data-v="${n}" ${lock} aria-pressed="${bs.min === n}">${n} letters</button>`).join("")}</div>
      <div class="label">Time</div>
      <div class="chips">${[1, 2, 3, 4, 5].map(m => `<button class="chip" data-act="bmins" data-v="${m}" ${lock} aria-pressed="${bs.mins === m}">${m} min</button>`).join("")}</div>
      ${isHost ? "" : `<p class="muted small">${esc(v.hostName)} picks the settings.</p>`}
    </section>
    <button class="btn" data-act="start" ${host.waitingForDict ? "disabled" : ""}>${host.waitingForDict ? "Loading the dictionary…" : "Shake the board"}</button>
    ${boggleRules()}` : `<section class="card">
      <div class="row-between"><div class="label">Categories</div><span class="muted small">${sel.length ? `${sel.length} picked` : "All in the mix"}</span></div>
      <div class="chips"><button class="chip" data-act="allcats" ${lock} aria-pressed="${!sel.length}">Everything</button>${CATS.map(c => `<button class="chip" data-act="cat" data-v="${esc(c)}" ${lock} aria-pressed="${sel.includes(c)}">${esc(c)}</button>`).join("")}</div>
      <p class="muted small">${isHost ? "Pick one or more. Each round draws a word from one of them at random." : `${esc(v.hostName)} picks the categories and questions.`}</p>
      <div class="label">Questions per player</div>
      <div class="chips">${[1, 2, 3].map(q => `<button class="chip" data-act="qper" data-v="${q}" ${lock} aria-pressed="${v.qPer === q}">${q}</button>`).join("")}</div>
    </section>
    <button class="btn" data-act="start" ${enough ? "" : "disabled"}>Deal the cards</button>
    ${rulesCard()}`}`;
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
      : `<section class="card center"><div class="label">${esc(v.me)}, your card</div>${cardRing(v)}
           <p class="muted">${v.isOut ? "Everyone else knows the word. Blend in like a gecko on a wall, listen closely, and work out what it is." : "You know the word. Answer so the others can tell, but keep it vague enough that the Gecko can't guess it."}</p></section>
         <button class="btn ghost" data-act="hide">Hide my card</button>`;
    const imReady = v.ready.includes(v.myIdx), n = v.players.length;
    const notReady = v.players.filter((p, k) => !v.ready.includes(k));
    return head("Your card") + card + `<section class="card">
      <div class="row-between"><div class="label">Ready</div><span class="muted small">${v.ready.length} of ${n}</span></div>
      <div class="progress"><div style="width:${(v.ready.length / n) * 100}%"></div></div>
      ${imReady
        ? `<p class="muted small">You're ready. Waiting for ${notReady.map(esc).join(", ")}.</p>`
        : `<p class="muted small">Seen your card? Tap ready. Questions start when everyone is.</p>
           <button class="btn" data-act="ready">I'm ready</button>`}
      ${host.active && notReady.length && notReady.length < n ? `<button class="btn ghost slim" data-act="startanyway">Someone's phone stuck? Start anyway</button>` : ""}
    </section>`;
  },

  questions() {
    const v = ui.view, q = v.questions[v.qi], tot = v.questions.length, i = v.myIdx;
    const opts = q.opts || [q.q];
    if (i === q.a) return head(`Question ${v.qi + 1} of ${tot}`) + `
      <div class="progress"><div style="width:${(v.qi / tot) * 100}%"></div></div>
      <section class="card spot">
        <div class="qpair"><span class="who mine">${esc(v.players[q.a])}</span><span class="arrow">asks</span><span class="who">${esc(v.players[q.b])}</span></div>
        <div class="label">Pick one to ask ${esc(v.players[q.b])}</div>
        <div class="qopts">${opts.map((o, k) => `<button class="qopt" data-act="pickq" data-v="${k}" aria-pressed="${q.q === o}">${esc(o)}</button>`).join("")}</div>
        <p class="muted">${q.q ? `Read it out loud to ${esc(v.players[q.b])}.` : "Tap the question you want to ask."}</p>
      </section>
      <button class="btn" data-act="nextq" ${q.q ? "" : "disabled"}>${v.qi === tot - 1 ? "Done. Time to discuss" : "Next question"}</button>
      <button class="btn ghost" data-act="swapq">Two new questions</button>
      <button class="btn ghost slim" data-act="back">${v.qi > 0 ? "Back to the last question" : "Back to the cards"}</button>
      ${peek(v)}`;
    const role = !q.q ? `${esc(v.players[q.a])} is choosing between two questions.`
      : i === q.b ? `${esc(v.players[q.a])} is asking you. Answer about the secret word without saying it.`
      : `Listen to ${esc(v.players[q.b])}'s answer.`;
    return head(`Question ${v.qi + 1} of ${tot}`) + `
      <div class="progress"><div style="width:${(v.qi / tot) * 100}%"></div></div>
      <section class="card ${i === q.a || i === q.b ? "spot" : ""}">
        <div class="qpair"><span class="who ${i === q.a ? "mine" : ""}">${esc(v.players[q.a])}</span><span class="arrow">asks</span><span class="who ${i === q.b ? "mine" : ""}">${esc(v.players[q.b])}</span></div>
        ${q.q ? `<div class="qtext">${esc(q.q)}</div>` : `<div class="qtext waiting">Picking a question…</div>`}
        <p class="muted">${role}</p>
      </section>
      <p class="muted small center-text">Waiting for ${esc(v.players[q.a])} to ${q.q ? "tap Next" : "pick a question"}.</p>
      ${host.active ? `<button class="btn ghost slim" data-act="nextq">${esc(v.players[q.a])}'s phone stuck? Skip ahead</button>` : ""}
      <button class="btn ghost slim" data-act="back">${v.qi > 0 ? "Back to the last question" : "Back to the cards"}</button>
      ${peek(v)}`;
  },

  discuss() {
    const v = ui.view, n = v.players.length, imReady = v.voteReady.includes(v.myIdx);
    const notReady = v.players.filter((p, k) => !v.voteReady.includes(k));
    return head("Discuss") + `<section class="card"><h2>Who sounded suspicious?</h2>
      <p class="muted">Talk it over as long as you like. The vote opens once everyone taps "Ready to vote". Everyone votes on their own phone, except the Gecko.</p></section>
      ${recap(v, true)}
      <section class="card">
        <div class="row-between"><div class="label">Ready to vote</div><span class="muted small">${v.voteReady.length} of ${n}</span></div>
        <div class="progress"><div style="width:${(v.voteReady.length / n) * 100}%"></div></div>
        ${imReady
          ? `<p class="muted small">You're ready. Waiting for ${notReady.map(esc).join(", ")}.</p>`
          : `<button class="btn" data-act="tovote">Ready to vote</button>`}
        ${host.active && notReady.length && notReady.length < n ? `<button class="btn ghost slim" data-act="votenow">Someone's phone stuck? Start the vote anyway</button>` : ""}
      </section>
      ${v.voteReady.length ? "" : `<button class="btn ghost slim" data-act="back">Back to the last question</button>`}${peek(v)}`;
  },

  vote() {
    const v = ui.view, n = v.players.length;
    if (v.tops) return views.tally();
    // The Gecko doesn't vote, but gets a screen that looks the same so nobody can tell by glancing at it.
    const mine = v.isOut ? ui.fakeVote : v.myVote;
    const second = v.voteRound === 2;
    return head(`${second ? "Revote" : "Vote"}: ${v.nVoted} of ${n - 1} in`) + `
      <section class="card">
        ${second ? `<div class="label">Revote · final answer</div>` : ""}
        <h2>${mine != null ? "Vote locked in" : "Who's the Gecko?"}</h2>
        <p class="muted">${v.isOut
          ? "You're the Gecko, so your vote doesn't count. Tap someone anyway so you look busy."
          : mine != null ? `You voted for <b>${esc(v.players[mine])}</b>. You can change it until everyone has voted.` : "Your vote stays secret until everyone has voted."}</p>
        <div class="grid">${v.players.map((p, k) => k === v.myIdx ? "" : `<button class="pick ${mine === k ? "chosen" : ""}" data-act="${v.isOut ? "fakevote" : "vote"}" data-i="${k}">${esc(p)}</button>`).join("")}</div>
      </section>
      <p class="muted small center-text">${v.nVoted} of ${n - 1} votes in. The Gecko doesn't vote.</p>
      ${recap(v, false)}
      ${!v.nVoted && !second ? `<button class="btn ghost slim" data-act="back">Back to the discussion</button>` : ""}
      ${host.active && v.nVoted ? `<button class="btn ghost slim" data-act="closevote">Someone dropped out? Count the votes now</button>` : ""}`;
  },

  tally() {
    const v = ui.view, tops = v.tops;
    const accused = tops.length === 1 ? v.players[tops[0]] : null;
    const first = v.voteRound !== 2;
    return head(first ? "First vote" : "Final vote") + `
      <section class="card">
        <h2>${first ? "The first vote is in" : "The final vote is in"}</h2>
        <div class="accused-row">${tops.map(k => `<span class="big-name">${esc(v.players[k])}</span>`).join(`<span class="muted">and</span>`)}</div>
        <p class="muted small">${accused ? "Got the most votes." : "Tied for the most votes."} Vote counts stay secret.</p>
        ${first
          ? `<p class="muted">${accused ? `${esc(accused)} gets a chance to defend themselves, then everyone votes again.` : "Everyone tied gets a chance to defend themselves, then everyone votes again."}</p>`
          : accused ? "" : `<p class="muted">Still no clear winner, so the Gecko slips away.</p>`}
      </section>
      ${first ? `<button class="btn" data-act="todefense">${accused ? `Hear ${esc(accused)}'s defense` : "Hear their defense"}</button>` : `<button class="btn" data-act="reveal">Reveal the Gecko</button>`}`;
  },

  defense() {
    const v = ui.view, names = v.accused.map(k => v.players[k]), mine = v.accused.includes(v.myIdx);
    const list = names.map(esc).join(" and ");
    return head("The defense") + `
      <section class="card center spot">
        <div class="label">On trial</div>
        <div class="big-name">${list}</div>
        <p>${mine
          ? names.length > 1 ? "You're tied for the most votes. Make your case out loud. Why aren't you the Gecko?" : "The group thinks you're the Gecko. Make your case out loud. Why aren't you?"
          : `Listen to ${list} make their case. Ask them anything.`}</p>
      </section>
      ${recap(v, false)}
      ${mine || host.active
        ? `<button class="btn" data-act="revote">${mine ? "I'm done. Vote again" : "Start the revote"}</button>`
        : `<p class="muted small center-text">The revote starts when ${list} ${names.length > 1 ? "are" : "is"} done.</p>`}`;
  },

  reveal() {
    const v = ui.view, outName = v.players[v.out], caught = isCaught(v);
    return head("The reveal") + `
      <section class="card center">
        <div class="label">The Gecko was</div>
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
        <ul class="deltas">${v.players.map((p, k) => `<li class="${p === v.me ? "you" : ""}"><span>${esc(p)}${k === v.out ? `<span class="tag">gecko</span>` : ""}<br><small class="muted">${esc(v.deltas.why[k].join(", ") || "no points")}</small></span><span class="pts ${v.deltas.d[k] ? "plus" : "muted"}">+${v.deltas.d[k]}</span></li>`).join("")}</ul>
        <div class="label">Scoreboard</div>
        <ul class="deltas">${board.map(k => `<li class="${v.players[k] === v.me ? "you" : ""}"><span>${esc(v.players[k])}</span><span class="pts">${v.scores[v.players[k]] || 0}</span></li>`).join("")}</ul>
      </section>
      <div class="row"><button class="btn" data-act="start">Play another round</button><button class="btn ghost" data-act="tolobby">Back to lobby</button></div>`;
  }
};

const GECKO_ICON = `<svg class="gecko-mark big" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M32 40 C32 50 22 56 16 50 C12 46 16 41 20 44"/><path d="M26 24 L16 18 M38 24 L48 18 M27 36 L17 42 M37 36 L47 42"/></g><g fill="currentColor"><circle cx="16" cy="18" r="3.5"/><circle cx="48" cy="18" r="3.5"/><circle cx="17" cy="42" r="3.5"/><circle cx="47" cy="42" r="3.5"/><ellipse cx="32" cy="29" rx="7.5" ry="12"/><ellipse cx="32" cy="12" rx="7" ry="6.5"/></g><g fill="var(--spot)"><circle cx="29.5" cy="11" r="1.6"/><circle cx="34.5" cy="11" r="1.6"/><circle cx="30" cy="26" r="1.8"/><circle cx="34" cy="32" r="1.8"/></g></svg>`;
const cardRing = v => v.isOut
  ? `<div class="ring out">${GECKO_ICON}<div><div class="word">You are the Gecko</div><div class="sub">Category: ${esc(v.rcat)}</div></div></div>`
  : `<div class="ring"><div><div class="word">${esc(v.word)}</div><div class="sub">Category: ${esc(v.rcat)}</div></div></div>`;
const peek = v => `<details class="peek"${ui.peekOpen ? " open" : ""}><summary>Peek at my card</summary><p>${v.isOut ? `You're <b>the Gecko</b>. Category: ${esc(v.rcat)}.` : `The word is <b>${esc(v.word)}</b>.`}</p></details>`;
// Every question from this round and who answered it, so people can remember during the discussion.
const recap = (v, open) => {
  const keep = ui.recapOpen ? " open" : "";
  const rows = v.questions.map(q => `<li><span class="who ${q.b === v.myIdx ? "mine" : ""}">${esc(v.players[q.b])}</span><div><p>${esc(q.q)}</p><small class="muted">asked by ${esc(v.players[q.a])}</small></div></li>`).join("");
  return open
    ? `<section class="card"><div class="label">Who answered what</div><ol class="recap">${rows}</ol></section>`
    : `<details class="card recap-box"${keep}><summary class="label">Who answered what (${v.questions.length} questions)</summary><ol class="recap">${rows}</ol></details>`;
};
const rulesCard = () => `<section class="card"><div class="label">Scoring</div><ul class="rules">
  <li><b>+1</b> to each player who votes for the Gecko.</li>
  <li><b>+2</b> to the Gecko if the vote doesn't land on them (ties count as an escape).</li>
  <li><b>+2</b> more to the Gecko for guessing the word at the end.</li></ul>
  <p class="muted small">After the first vote, whoever got the most votes defends themselves, then everyone votes again. Only the revote counts. The Gecko doesn't vote.</p></section>`;
function isCaught(v) {
  return v.tops.length === 1 && v.tops[0] === v.out;
}
function savedHost() { try { const s = JSON.parse(lsGet("gekko-host")); return s && s.code && Date.now() - s.t < 12 * 3600e3 ? s : null; } catch (e) { return null; } }

function currentView() {
  if (ui.status === "home") return "home";
  if (ui.status === "rejected") return "rejected";
  if (ui.status === "outdated") return "outdated";
  if (ui.status === "noserver" && !ui.view) return "noserver";
  if (ui.status === "noroom" && !ui.view) return "noroom";
  if (!ui.view) return "opening";
  const v = ui.view;
  if (!v.seats.includes(v.me)) return "kicked";
  if (v.phase === "lobby") return "lobby";
  if (v.myIdx < 0) return "spectate";
  return v.phase;
}

Object.assign(views, boggleViews);

/* ---------------- Rendering and input ---------------- */

const app = document.getElementById("app");
function render() {
  const view = currentView(), v = ui.view;
  const key = view + "|" + (v ? v.gid : "") + "|" + (v ? v.voteRound : "");
  // Mid-round Boggle updates only touch the parts that changed, so typing and swiping aren't interrupted.
  if (view === "bplay" && key === ui.lastKey && bState() === ui.bShownState && document.getElementById("bgrid")) { bPatch(); return; }
  if (key !== ui.lastKey) {
    if (view === "bplay") { ui.bPath = []; ui.bText = ""; ui.bToast = null; ui.bRot = 0; }
    if (v && ui.lastKey.split("|")[1] !== v.gid) ui.shown = false;
    ui.fakeVote = null;
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
  if (focused) { const el = document.getElementById(focused); if (el && !el.disabled) { el.focus(); if (el.setSelectionRange) try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} } }
  const bIn = document.getElementById("bIn");
  if (bIn) {
    bIn.addEventListener("input", () => { ui.bPath = []; ui.bText = cleanWord(bIn.value); bPaint(); });
    bIn.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); bSubmit(); } });
  }
  const qr = document.getElementById("qr");
  if (qr && window.QRCode) new QRCode(qr, { text: joinLink(v.code), width: 148, height: 148, colorDark: "#0e1d15", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
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
  retry() { ui.status = "opening"; render(); if (guest.client) guest.client.reconnect(); },
  // A new URL skips the browser's cached copy of the page.
  hardreload() { location.replace(location.pathname + "?r=" + Date.now() + (guest.code ? "#" + guest.code : location.hash)); },
  rejoin() { if (guest.active) { ui.status = "opening"; guest.join(); } else location.reload(); },
  quit() {
    if (guest.active && ui.view) guest.send({ type: "leave" });
    setTimeout(() => {
      if (host.active) { host.close(); lsSet("gekko-host", null); }
      history.replaceState(null, "", location.pathname);
      location.reload();
    }, 300);
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
  ready: () => act({ type: "ready" }),
  startanyway: () => act({ type: "startanyway" }),
  todefense: () => act({ type: "todefense" }),
  revote: () => act({ type: "revote" }),
  nextq: () => act({ type: "nextq", qi: ui.view.qi }),
  back: () => act({ type: "back", phase: ui.view.phase, qi: ui.view.qi }),
  swapq: () => act({ type: "swapq", qi: ui.view.qi }),
  pickq: el => act({ type: "pickq", qi: ui.view.qi, k: +el.dataset.v }),
  tovote: () => act({ type: "tovote" }),
  votenow: () => act({ type: "votenow" }),
  vote: el => act({ type: "vote", target: +el.dataset.i }),
  fakevote(el) { ui.fakeVote = +el.dataset.i; render(); },
  reveal: () => act({ type: "reveal" }),
  closevote: () => act({ type: "closevote" }),
  guess: el => act({ type: "guess", word: el.dataset.v }),
  tolobby: () => act({ type: "tolobby" }),
  game: el => act({ type: "game", g: el.dataset.v }),
  bmode: el => act({ type: "bmode", v: el.dataset.v }),
  bcancel: el => act({ type: "bcancel", v: +el.dataset.v }),
  bmin: el => act({ type: "bmin", v: +el.dataset.v }),
  brotate: () => bRotate(),
  breuse: el => act({ type: "breuse", v: +el.dataset.v }),
  bsize: el => act({ type: "bsize", v: +el.dataset.v }),
  bmins: el => act({ type: "bmins", v: +el.dataset.v }),
  bsubmit: () => bSubmit(),
  bend: () => act({ type: "bend" })
};

app.addEventListener("toggle", e => {
  if (e.target.classList.contains("recap-box")) ui.recapOpen = e.target.open;
  if (e.target.classList.contains("peek")) ui.peekOpen = e.target.open;
}, true);
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
// Coming back to a room you were already in (after a reload) rejoins it automatically.
if (ui.draftCode && ui.draftName && lsGet("gekko-joined-" + ui.draftCode) === ui.draftName.trim()) guest.start(ui.draftCode, ui.draftName.trim());
else render();
if (ui.draftCode && ui.draftName) document.getElementById("codeIn")?.focus();
