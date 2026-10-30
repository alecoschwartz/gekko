// Scraps: Pictionary with pieces. One player gets a secret word and builds a picture out of shapes and
// a few body-part/symbol stickers (no whole objects, no letters). Everyone else watches it come together
// live and types guesses. Faster guesses score more; the builder scores for everyone who gets it.

const SCRAPS_DEFAULTS = { turns: 1, secs: 90 };
const SCRAP_MAX = 80, SCRAP_PICK_SECS = 20;
const SCRAP_COLORS = ["#e8443a", "#ff8a2a", "#ffd23f", "#4cbb5e", "#3b82f6", "#8b5cf6", "#f472b6", "#8b5a2b", "#f2c9a0", "#ffffff", "#9ca3af", "#1a1a1a"];
// Shapes are drawn in a 100 x 100 box centred on 0,0 and stretched to the piece's width and height.
const LINE = 'fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"';
const SCRAP_SHAPES = {
  ci: '<circle r="50"/>',
  ri: '<circle r="41" fill="none" stroke="currentColor" stroke-width="18"/>',
  sq: '<rect x="-50" y="-50" width="100" height="100"/>',
  rr: '<rect x="-50" y="-50" width="100" height="100" rx="20"/>',
  tr: '<polygon points="0,-50 50,50 -50,50"/>',
  rt: '<polygon points="-50,-50 50,50 -50,50"/>',
  ha: '<path d="M-50 50 A50 100 0 0 1 50 50 Z"/>',
  st: '<polygon points="0,-50 11.8,-16.2 47.6,-15.5 19,6.2 29.4,40.5 0,20 -29.4,40.5 -19,6.2 -47.6,-15.5 -11.8,-16.2"/>',
  he: '<path d="M0 46 C-72 2 -56 -62 0 -26 C56 -62 72 2 0 46Z"/>',
  ar: '<polygon points="-50,-14 12,-14 12,-40 50,0 12,40 12,14 -50,14"/>',
  cr: '<path d="M18 -48 A50 50 0 1 0 18 48 A38 48 0 0 1 18 -48Z"/>',
  dr: '<path d="M0 -50 C22 -18 38 2 38 20 A38 30 0 0 1 -38 20 C-38 2 -22 -18 0 -50Z"/>',
  pl: '<polygon points="-15,-50 15,-50 15,-15 50,-15 50,15 15,15 15,50 -15,50 -15,15 -50,15 -50,-15 -15,-15"/>',
  cu: `<path d="M-50 -22 Q0 70 50 -22" ${LINE}/>`,
  zz: `<polyline points="-50,0 -30,-35 -10,35 10,-35 30,35 50,0" ${LINE}/>`,
  wv: `<path d="M-50 0 C-35 -40 -15 -40 0 0 C15 40 35 40 50 0" ${LINE}/>`
};
const SCRAP_EMOJI = ["👁️", "👄", "👃", "👂", "✋", "👆", "🦶", "🔥", "⚡", "💨", "💤", "💬", "❓", "❗", "✨", "🎵", "💥", "🌀"];
// What the palette offers: shape kind, starting size and colour.
const SCRAP_PALETTE = [
  { k: "ci", w: 200, h: 200, c: 2 }, { k: "ci", w: 280, h: 160, c: 4 }, { k: "ri", w: 200, h: 200, c: 11 },
  { k: "sq", w: 200, h: 200, c: 0 }, { k: "rr", w: 220, h: 180, c: 6 }, { k: "sq", w: 360, h: 60, c: 7 },
  { k: "sq", w: 400, h: 16, c: 11 }, { k: "tr", w: 200, h: 200, c: 3 }, { k: "rt", w: 200, h: 200, c: 1 },
  { k: "ha", w: 220, h: 110, c: 5 }, { k: "st", w: 200, h: 200, c: 2 }, { k: "he", w: 180, h: 180, c: 0 },
  { k: "ar", w: 260, h: 140, c: 4 }, { k: "cr", w: 180, h: 200, c: 2 }, { k: "dr", w: 140, h: 190, c: 4 },
  { k: "pl", w: 160, h: 160, c: 0 }, { k: "cu", w: 220, h: 110, c: 11 }, { k: "zz", w: 260, h: 90, c: 11 },
  { k: "wv", w: 260, h: 80, c: 4 },
  ...SCRAP_EMOJI.map((_, i) => ({ k: "e" + i, w: 160, h: 160, c: 0 }))
];
const isEmojiK = k => /^e\d+$/.test(k) && +k.slice(1) < SCRAP_EMOJI.length;
const scrapKindOk = k => !!SCRAP_SHAPES[k] || isEmojiK(k);

// Words to build. "a|b" means b is also accepted. Mixed difficulty, teen-friendly.
const SCRAP_WORDS = ("snowman|traffic light|rocket|volcano|jellyfish|octopus|ice cream cone|birthday cake|pizza|hamburger|robot|ghost|alien|pirate|vampire|mermaid|unicorn|dragon|castle|lighthouse|rainbow|tornado|sunset|campfire|tent|roller coaster|ferris wheel|hot air balloon|submarine|helicopter|sailboat|bicycle|skateboard|train|school bus|fire truck|tractor|spaceship|satellite|black hole|solar system|shooting star|eclipse|planet|" +
  "brain freeze|sunburn|sneeze|hiccups|nightmare|daydream|homework|detention|group chat|selfie|wifi|low battery|password|screenshot|video call|livestream|plot twist|spoiler|cliffhanger|sleepwalking|jet lag|sugar rush|food coma|stage fright|lie detector|time travel|invisibility|superhero|villain|haunted house|zombie|werewolf|mummy|skeleton|witch|wizard|magic wand|crystal ball|treasure map|message in a bottle|desert island|shipwreck|quicksand|waterfall|iceberg|" +
  "eiffel tower|statue of liberty|pyramid|stonehenge|mount everest|leaning tower of pisa|big ben|mount rushmore|" +
  "flamingo|peacock|giraffe|porcupine|snail|turtle|crab|shark|whale|penguin|owl|bat|spider|bee|butterfly|caterpillar|ladybug|scorpion|dinosaur|snake|frog|duck|chicken|pig|cow|sheep|llama|kangaroo|koala|sloth|panda|polar bear|hedgehog|seahorse|starfish|lobster|jellyfish|squid|peacock|mosquito|" +
  "taco|sushi|spaghetti|popcorn|pancakes|waffle|donut|cupcake|hot dog|french fries|popsicle|watermelon|fried egg|corn on the cob|cheese|sandwich|milkshake|cereal|pretzel|candy cane|gingerbread man|burrito|lollipop|cotton candy|" +
  "toilet|bathtub|shower|couch|bunk bed|lamp|alarm clock|toaster|microwave|fridge|washing machine|vacuum|umbrella|glasses|sunglasses|backpack|sneakers|high heels|crown|top hat|bow tie|necktie|mustache|beard|braces|wig|tattoo|headphones|microphone|guitar|drum set|piano|trumpet|video game|controller|tv remote|smartphone|laptop|keyboard|printer|camera|light bulb|battery|magnet|key|lock|ladder|hammer|scissors|pencil|calculator|globe|telescope|microscope|magnifying glass|compass|flag|trophy|medal|" +
  "basketball|soccer|bowling|golf|tennis|surfing|skiing|snowboarding|ice skating|swimming pool|diving board|trampoline|slide|swing|sandcastle|beach ball|kite|fishing|scuba diver|astronaut|firefighter|chef|doctor|dentist|teacher|ninja|knight|cowboy|clown|mime|magician|dj|referee|lifeguard|farmer|scarecrow|garden gnome|santa claus|easter bunny|jack-o'-lantern|christmas tree|fireworks|snow globe|igloo|snowball fight|sledding|" +
  "hospital|school|library|zoo|aquarium|airport|gas station|movie theater|treehouse|farm|desert|jungle|cave|island|bridge|skyscraper|windmill|barn|" +
  "cactus|mushroom|palm tree|lightning|thunderstorm|earthquake|flood|sunrise|mountain|ocean wave|music|sleep|idea|explosion|love|" +
  "cat nap|couch potato|brainstorm|bookworm|night owl|piggy bank|eyeball|high five|thumbs up|bad hair day|cold shoulder|break a leg|raining cats and dogs|elephant in the room|piece of cake|fish out of water|early bird|crybaby|hot potato|butterflies in your stomach|heartbreak|tongue twister|eye roll|facepalm|mind blown|wake-up call|chain reaction|road trip|sleepover|traffic jam|pillow fight|tug of war|hide and seek|musical chairs|lemonade stand|fire drill|spelling bee|science fair|pop quiz|" +
  "snot|burp|toothache|broken heart|tears of joy|loud music|bad smell|sunglasses at night|ice age|stone age|caveman|time machine|crash landing|mad scientist|evil laugh|secret agent|bank robbery|getaway car|police chase|alien abduction|zombie apocalypse|haircut|first day of school|lost luggage|power outage|hurricane|tidal wave|lava lamp|disco ball|karaoke|selfie stick|emoji|meme|hashtag")
  .split("|").filter((w, i, a) => w && a.indexOf(w) === i);
// Alternates that should also count as right.
const SCRAP_ALTS = { "tv remote": ["remote", "remote control"], "smartphone": ["phone", "cell phone", "iphone"], "wifi": ["wi-fi", "internet"], "dj": ["disc jockey"], "jack-o'-lantern": ["jack o lantern", "pumpkin"], "santa claus": ["santa"], "fridge": ["refrigerator"], "ocean wave": ["wave"], "soccer": ["football"], "garden gnome": ["gnome"], "christmas tree": ["xmas tree"], "video game": ["videogame", "gaming"], "french fries": ["fries", "chips"], "hot dog": ["hotdog"], "high five": ["hi five"], "time travel": ["time traveling", "time travelling"], "solar system": ["planets"] };

/* ---------- Host side ---------- */

const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v || 0)));
function cleanPieces(p) {
  return (Array.isArray(p) ? p : []).slice(0, SCRAP_MAX).filter(q => q && scrapKindOk(q.k)).map(q => ({
    k: q.k, x: clampN(q.x, -100, 1100), y: clampN(q.y, -100, 1100), w: clampN(q.w, 12, 1600), h: clampN(q.h, 12, 1600),
    r: ((clampN(q.r, -720, 720) % 360) + 360) % 360, c: clampN(q.c, 0, SCRAP_COLORS.length - 1), f: q.f ? 1 : 0
  }));
}
const scrapAnswers = w => [w, ...(SCRAP_ALTS[w] || [])];
const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
// Spaces and hyphens don't matter ("hot dog" = "hotdog").
const squash = s => normFib(s).replace(/ /g, "");

const scrapsHost = {
  newGame(G, seats) {
    const set = { ...SCRAPS_DEFAULTS, ...(G.sset || {}) }, order = shuffle(seats), turns = [];
    for (let t = 0; t < set.turns; t++) turns.push(...order);
    const total = {}; seats.forEach(p => { total[p] = 0; });
    const g = { gid: "s" + Date.now().toString(36), phase: "spick", players: seats, usedScraps: (G.usedScraps || []).filter(w => SCRAP_WORDS.includes(w)), s: { turns, ti: 0, secs: set.secs, total } };
    this.startTurn(g);
    return g;
  },

  // Two words nobody has built recently.
  startTurn(G) {
    const s = G.s, used = G.usedScraps || [];
    const fresh = shuffle(SCRAP_WORDS.filter(w => !used.includes(w)));
    const opts = (fresh.length >= 2 ? fresh : shuffle(SCRAP_WORDS)).slice(0, 2);
    Object.assign(s, { builder: s.turns[s.ti], opts, word: null, pieces: [], guessed: [], feed: [], pickBy: Date.now() + SCRAP_PICK_SECS * 1000, startsAt: 0, endsAt: 0, hintAt: 0, hi: -1, round: null });
    G.phase = "spick";
  },

  pick(G, k) {
    const s = G.s, word = s.opts[k] || s.opts[0], now = Date.now();
    const letters = [...word].map((ch, i) => /[a-z]/i.test(ch) ? i : -1).filter(i => i >= 0);
    Object.assign(s, { word, startsAt: now, endsAt: now + s.secs * 1000, hintAt: now + s.secs * 500, hi: letters.length > 3 ? pick(letters) : -1 });
    G.usedScraps = [...(G.usedScraps || []).filter(w => w !== word), word].slice(-Math.floor(SCRAP_WORDS.length * 0.8));
    G.phase = "splay";
  },

  guess(G, who, raw) {
    const s = G.s, text = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!text) return null;
    if (s.guessed.includes(who)) return { ok: true, msg: "You already got it!" };
    const g = squash(text), answers = scrapAnswers(s.word).map(squash);
    if (answers.includes(g)) {
      s.guessed.push(who);
      s.feed.push({ p: who, ok: true });
      if (s.guessed.length >= G.players.length - 1) this.endTurn(G);
      return { ok: true, right: true, msg: "You got it!" };
    }
    const close = answers.some(a => a.length >= 4 && lev(a, g) <= (a.length >= 8 ? 2 : 1)) ||
      normFib(s.word).split(" ").length > 1 && normFib(s.word).split(" ").some(part => part.length > 2 && part === normFib(text));
    // A near miss is announced but not shown, or it would give the word away.
    s.feed.push(close ? { p: who, close: true } : { p: who, text });
    if (s.feed.length > 40) s.feed.splice(0, s.feed.length - 40);
    return close ? { ok: false, msg: "So close!" } : null;
  },

  // Guessers: 3 points for first, 2 for second, 1 after that. Builder: 1 for everyone who got it.
  endTurn(G) {
    const s = G.s, d = {};
    G.players.forEach(p => { d[p] = 0; });
    s.guessed.forEach((p, k) => { d[p] += k === 0 ? 3 : k === 1 ? 2 : 1; });
    if (d[s.builder] != null) d[s.builder] += s.guessed.length;
    G.players.forEach(p => { s.total[p] = (s.total[p] || 0) + d[p]; });
    s.round = { d };
    G.phase = "sreveal";
  },

  next(G) {
    const s = G.s;
    if (s.ti < s.turns.length - 1) { s.ti++; this.startTurn(G); return; }
    G.sscores = G.sscores || {};
    G.players.forEach(p => { G.sscores[p] = (G.sscores[p] || 0) + (s.total[p] || 0); });
    G.phase = "sresults";
  },

  view(G, name, last) {
    const s = G.s, now = Date.now(), me = s.builder === name, open = G.phase === "sreveal" || G.phase === "sresults";
    const v = { ti: s.ti, n: s.turns.length, builder: s.builder, isBuilder: me, pieces: s.pieces, guessed: s.guessed, feed: s.feed, total: s.total, secs: s.secs, last: last || null };
    if (G.phase === "spick") { v.pickIn = s.pickBy - now; if (me) v.opts = s.opts; }
    if (G.phase === "splay") {
      v.startsIn = s.startsAt - now; v.endsIn = s.endsAt - now;
      if (me || s.guessed.includes(name)) v.word = s.word;
      else { v.hint = s.word.replace(/[a-z0-9]/gi, "_"); if (s.hi >= 0) { v.hintIn = s.hintAt - now; v.hi = s.hi; v.hc = s.word[s.hi]; } }
    }
    if (open) { v.word = s.word; v.round = s.round; }
    return v;
  }
};

/* ---------- Drawing ---------- */

function scrapPiece(p, i) {
  const t = `translate(${p.x} ${p.y}) rotate(${p.r})`;
  if (isEmojiK(p.k)) return `<g class="pc" data-pi="${i}" transform="${t} scale(${p.f ? -1 : 1} 1)"><text font-size="${p.w}" text-anchor="middle" dominant-baseline="central">${SCRAP_EMOJI[+p.k.slice(1)]}</text></g>`;
  return `<g class="pc" data-pi="${i}" transform="${t} scale(${(p.f ? -1 : 1) * p.w / 100} ${p.h / 100})" style="color:${SCRAP_COLORS[p.c] || "#1a1a1a"}" fill="currentColor">${SCRAP_SHAPES[p.k]}</g>`;
}
const scrapSize = p => isEmojiK(p.k) ? [p.w, p.w] : [p.w, p.h];
// Handles go wherever they stay on the canvas: rotate above (or below), resize on the first corner that's visible.
function scrapSel(p) {
  const [w, h] = scrapSize(p), t = p.r * Math.PI / 180;
  const world = (lx, ly) => [p.x + lx * Math.cos(t) - ly * Math.sin(t), p.y + lx * Math.sin(t) + ly * Math.cos(t)];
  const inside = (lx, ly) => { const [X, Y] = world(lx, ly); return X > 40 && X < 960 && Y > 40 && Y < 960; };
  const ry = [-h / 2 - 90, h / 2 + 90, -h / 2 - 50, h / 2 + 50].find(y => inside(0, y)) ?? 0;
  const corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([a, b]) => [a * (w / 2 + 8), b * (h / 2 + 8)]);
  const [cx, cy] = corners.find(([x, y]) => inside(x, y)) || [Math.min(w / 2, 300), Math.min(h / 2, 300)];
  return `<g transform="translate(${p.x} ${p.y}) rotate(${p.r})" class="sel">
    <rect x="${-w / 2 - 8}" y="${-h / 2 - 8}" width="${w + 16}" height="${h + 16}" class="selbox"/>
    ${ry ? `<line x1="0" y1="${ry < 0 ? -h / 2 - 8 : h / 2 + 8}" x2="0" y2="${ry}" class="selline"/>` : ""}
    <circle class="hdl" data-h="rot" cy="${ry}" r="38"/><path class="hdl-ico" d="M-14 ${ry - 4} a15 15 0 1 1 6 14" />
    <circle class="hdl" data-h="size" cx="${cx}" cy="${cy}" r="38"/><path class="hdl-ico" d="M${cx - 14} ${cy + 14} L${cx + 14} ${cy - 14} M${cx + 2} ${cy - 14} L${cx + 14} ${cy - 14} L${cx + 14} ${cy - 2}"/>
  </g>`;
}
function scrapsSvg(pieces, opts = {}) {
  return `<svg ${opts.id ? `id="${opts.id}"` : ""} class="scv ${opts.cls || ""}" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">${scrapsInner(pieces, opts.sel)}</svg>`;
}
function scrapsInner(pieces, sel) {
  return `<rect class="scbg" width="1000" height="1000"/>${pieces.map(scrapPiece).join("")}${sel != null && sel >= 0 && pieces[sel] ? scrapSel(pieces[sel]) : ""}`;
}
function scrapThumb(item) {
  const p = { ...item, x: 0, y: 0, r: 0, f: 0 }, [w, h] = scrapSize(p), m = Math.max(w, h) * 0.62;
  return `<svg viewBox="${-m} ${-m} ${2 * m} ${2 * m}">${scrapPiece(p, -1)}</svg>`;
}

/* ---------- Player side ---------- */

// ui.sPieces: the builder's own copy of the picture (the host's copy only flows to watchers).
function noteScrapsView(v) {
  if (!v || !v.s) return;
  const now = Date.now();
  ui.sClock = { pick: now + (v.s.pickIn || 0), start: now + (v.s.startsIn || 0), end: now + (v.s.endsIn || 0), hint: v.s.hintIn != null ? now + v.s.hintIn : null };
  const last = v.s.last;
  if (last && last.n !== ui.sLastN) { if (ui.sLastN != null || now - (last.at || 0) < 3000) ui.sMsg = { ...last, shown: now }; ui.sLastN = last.n; }
}
function scrapsReset(v) {
  ui.sPieces = v && v.s ? cleanPieces(v.s.pieces) : []; ui.sSel = -1; ui.sHist = []; ui.sMsg = null; ui.sDraft = "";
}

function sSync(force) {
  clearTimeout(ui.sSyncT);
  const go = () => { ui.sSyncAt = Date.now(); act({ type: "spieces", p: ui.sPieces }); };
  if (force || Date.now() - (ui.sSyncAt || 0) > 220) go(); else ui.sSyncT = setTimeout(go, 220);
}
function sCommit() { ui.sHist.push(JSON.stringify(ui.sPieces)); if (ui.sHist.length > 60) ui.sHist.shift(); }
function sDraw() {
  const cv = document.getElementById("scv"); if (cv) cv.innerHTML = scrapsInner(ui.sPieces, ui.sSel);
  const tb = document.getElementById("stools"); if (tb) tb.innerHTML = scrapTools();
}
function scrapTools() {
  const p = ui.sPieces[ui.sSel];
  if (!p) return `<p class="muted small">${ui.sPieces.length ? "Tap a piece in the picture to change it." : "Tap a piece above to add it."} Drag to move. Grab the handles to resize or rotate.</p>
    <div class="stoolrow"><button class="btn ghost slim" data-act="sundo" ${ui.sHist.length ? "" : "disabled"}>Undo</button><button class="btn ghost slim" data-act="sclear" ${ui.sPieces.length ? "" : "disabled"}>${ui.sClearArm ? "Tap again to clear" : "Clear all"}</button></div>`;
  return `${isEmojiK(p.k) ? "" : `<div class="sswatches">${SCRAP_COLORS.map((c, i) => `<button class="sw" data-act="scolor" data-v="${i}" style="background:${c}" aria-label="Color ${i + 1}" aria-pressed="${p.c === i}"></button>`).join("")}</div>`}
    <div class="stoolrow"><button class="btn ghost slim" data-act="sflip">Flip</button><button class="btn ghost slim" data-act="scopy">Copy</button><button class="btn ghost slim" data-act="sfront">To front</button><button class="btn ghost slim" data-act="sback">To back</button><button class="btn ghost slim danger" data-act="sdel">Delete</button><button class="btn ghost slim" data-act="sundo" ${ui.sHist.length ? "" : "disabled"}>Undo</button></div>`;
}

const scrapsActions = {
  sturns: el => act({ type: "sturns", v: +el.dataset.v }),
  ssecs: el => act({ type: "ssecs", v: +el.dataset.v }),
  spick: el => act({ type: "spick", k: +el.dataset.v, ti: ui.view.s.ti }),
  snext: () => act({ type: "snext", ti: ui.view.s.ti }),
  sguess: () => scrapsGuess(),
  sadd(el) {
    if (ui.sPieces.length >= SCRAP_MAX) { ui.sMsg = { ok: false, msg: `That's the limit (${SCRAP_MAX} pieces).`, shown: Date.now() }; scrapsPatch(); return; }
    sCommit();
    const item = SCRAP_PALETTE[+el.dataset.v], jit = () => Math.round((Math.random() - 0.5) * 120);
    ui.sPieces.push({ k: item.k, x: 500 + jit(), y: 500 + jit(), w: item.w, h: item.h, r: 0, c: item.c, f: 0 });
    ui.sSel = ui.sPieces.length - 1; ui.sClearArm = false;
    sDraw(); sSync(true);
    document.getElementById("scv")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  },
  scolor(el) { const p = ui.sPieces[ui.sSel]; if (!p) return; sCommit(); p.c = +el.dataset.v; sDraw(); sSync(true); },
  sflip() { const p = ui.sPieces[ui.sSel]; if (!p) return; sCommit(); p.f = p.f ? 0 : 1; sDraw(); sSync(true); },
  scopy() { const p = ui.sPieces[ui.sSel]; if (!p || ui.sPieces.length >= SCRAP_MAX) return; sCommit(); ui.sPieces.push({ ...p, x: p.x + 40, y: p.y + 40 }); ui.sSel = ui.sPieces.length - 1; sDraw(); sSync(true); },
  sfront() { const p = ui.sPieces[ui.sSel]; if (!p) return; sCommit(); ui.sPieces.splice(ui.sSel, 1); ui.sPieces.push(p); ui.sSel = ui.sPieces.length - 1; sDraw(); sSync(true); },
  sback() { const p = ui.sPieces[ui.sSel]; if (!p) return; sCommit(); ui.sPieces.splice(ui.sSel, 1); ui.sPieces.unshift(p); ui.sSel = 0; sDraw(); sSync(true); },
  sdel() { if (!ui.sPieces[ui.sSel]) return; sCommit(); ui.sPieces.splice(ui.sSel, 1); ui.sSel = -1; sDraw(); sSync(true); },
  sundo() { const h = ui.sHist.pop(); if (!h) return; ui.sPieces = JSON.parse(h); ui.sSel = -1; sDraw(); sSync(true); },
  sclear() {
    if (!ui.sClearArm) { ui.sClearArm = true; sDraw(); setTimeout(() => { ui.sClearArm = false; sDraw(); }, 3000); return; }
    sCommit(); ui.sPieces = []; ui.sSel = -1; ui.sClearArm = false; sDraw(); sSync(true);
  }
};

function scrapsGuess() {
  const inp = document.getElementById("sIn"), text = (inp ? inp.value : "").trim();
  if (!text) return;
  if (inp) inp.value = "";
  ui.sDraft = "";
  act({ type: "sguess", text });
}

// Builder input: drag pieces, and the resize/rotate handles on the selected one.
const sDrag = { mode: null };
function svgPoint(svg, e) { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
document.addEventListener("pointerdown", e => {
  const svg = e.target.closest && e.target.closest("#scv");
  if (!svg || !ui.view || !ui.view.s || !ui.view.s.isBuilder || ui.view.phase !== "splay" || scrapsState() !== "play") return;
  e.preventDefault();
  const P = svgPoint(svg, e), hdl = e.target.closest(".hdl"), pc = e.target.closest(".pc");
  if (hdl && ui.sPieces[ui.sSel]) {
    sCommit(); sDrag.mode = hdl.dataset.h;
    const p = ui.sPieces[ui.sSel]; sDrag.a0 = Math.atan2(P.y - p.y, P.x - p.x) * 180 / Math.PI; sDrag.r0 = p.r;
  }
  else if (pc) {
    sCommit();
    ui.sSel = +pc.dataset.pi; const p = ui.sPieces[ui.sSel];
    sDrag.mode = "move"; sDrag.dx = P.x - p.x; sDrag.dy = P.y - p.y;
  } else { sDrag.mode = null; ui.sSel = -1; }
  sDrag.svg = svg; sDrag.moved = false; ui.sClearArm = false;
  sDraw();
});
document.addEventListener("pointermove", e => {
  if (!sDrag.mode || !sDrag.svg) return;
  const p = ui.sPieces[ui.sSel]; if (!p) return;
  const P = svgPoint(sDrag.svg, e);
  if (sDrag.mode === "move") { p.x = Math.round(Math.max(-50, Math.min(1050, P.x - sDrag.dx))); p.y = Math.round(Math.max(-50, Math.min(1050, P.y - sDrag.dy))); }
  else {
    const dx = P.x - p.x, dy = P.y - p.y;
    if (sDrag.mode === "rot") {
      // Turn by however far the finger has swung around the centre since grabbing the handle.
      let a = sDrag.r0 + Math.atan2(dy, dx) * 180 / Math.PI - sDrag.a0;
      a = ((a % 360) + 360) % 360;
      const snap = Math.round(a / 45) * 45; if (Math.abs(a - snap) < 6) a = snap;
      p.r = Math.round(((a % 360) + 360) % 360);
    } else {
      const t = -p.r * Math.PI / 180, lx = dx * Math.cos(t) - dy * Math.sin(t), ly = dx * Math.sin(t) + dy * Math.cos(t);
      const w = Math.max(20, Math.min(1600, Math.round(2 * Math.abs(lx) - 16))), h = Math.max(12, Math.min(1600, Math.round(2 * Math.abs(ly) - 16)));
      if (isEmojiK(p.k)) p.w = p.h = Math.max(w, h); else { p.w = w; p.h = h; }
    }
  }
  sDrag.moved = true;
  sDraw(); sSync(false);
});
const sEnd = () => { if (!sDrag.mode) return; const moved = sDrag.moved; sDrag.mode = null; if (moved) sSync(true); else ui.sHist.pop(); };
document.addEventListener("pointerup", sEnd);
document.addEventListener("pointercancel", sEnd);

function scrapsState() {
  const c = ui.sClock, now = Date.now();
  if (!c) return "play";
  return now < c.start ? "count" : now < c.end ? "play" : "over";
}
function scrapsHint() {
  const s = ui.view.s; if (!s.hint) return "";
  let h = s.hint;
  if (s.hi >= 0 && ui.sClock.hint && Date.now() >= ui.sClock.hint) h = h.slice(0, s.hi) + s.hc + h.slice(s.hi + 1);
  return [...h].map(ch => ch === " " ? "&nbsp;&nbsp;" : esc(ch.toUpperCase())).join(" ");
}
const scrapWho = names => names.map(esc).join(", ");
function scrapsFeed() {
  const s = ui.view.s;
  return s.feed.slice(-12).reverse().map(f => f.ok ? `<li class="ok"><b>${esc(f.p)}</b> got it!</li>` : f.close ? `<li class="close"><b>${esc(f.p)}</b> is close!</li>` : `<li><b>${esc(f.p)}</b> ${esc(f.text)}</li>`).join("") || `<li class="muted">No guesses yet.</li>`;
}
function scrapsStatus() {
  const v = ui.view, s = v.s, guessers = v.players.filter(p => p !== s.builder);
  return `<div class="row-between"><div class="label">Got it</div><span class="muted small">${s.guessed.length} of ${guessers.length}</span></div>
    <div class="progress"><div style="width:${guessers.length ? (s.guessed.length / guessers.length) * 100 : 0}%"></div></div>
    <p class="muted small">${s.guessed.length ? scrapWho(s.guessed) : "Nobody yet."}</p>`;
}
const scrapsMsgHtml = () => ui.sMsg && Date.now() - ui.sMsg.shown < 3500 ? `<span class="${ui.sMsg.ok ? "good" : "bad"}">${esc(ui.sMsg.msg)}</span>` : "&nbsp;";

// Mid-turn updates only touch the parts that changed, so typing and dragging aren't interrupted.
function scrapsPatch() {
  const v = ui.view, s = v.s;
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set("sfeed", scrapsFeed()); set("sstatus", scrapsStatus()); set("smsg", scrapsMsgHtml());
  if (!s.isBuilder) {
    const cv = document.getElementById("scv"); if (cv) cv.innerHTML = scrapsInner(s.pieces);
  }
  // The builder's canvas and tools are local; redrawing them here could swallow a tap mid-click.
}
const scrapsKey = v => v.s ? `${v.s.ti}|${v.s.word ? 1 : 0}|${v.s.isBuilder || (v.s.guessed || []).includes(v.me) ? 1 : 0}` : "";

function scrapsAfterRender() {
  const sIn = document.getElementById("sIn");
  if (sIn) {
    sIn.addEventListener("input", () => { ui.sDraft = sIn.value; });
    sIn.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); scrapsGuess(); } });
  }
}

// Local clock: timer, hint letter, and the countdown before building starts.
setInterval(() => {
  const v = ui.view;
  if (!v || !v.s || !["spick", "splay"].includes(v.phase) || currentView() !== v.phase) return;
  const now = Date.now(), t = document.getElementById("stimer");
  if (v.phase === "spick") { if (t) t.textContent = Math.max(0, Math.ceil((ui.sClock.pick - now) / 1000)) + "s"; return; }
  const st = scrapsState();
  if (st !== ui.sShownState) return render();
  if (t) { const left = ui.sClock.end - now; t.textContent = fmtTime(left); t.classList.toggle("low", left < 10000); }
  const h = document.getElementById("shint"); if (h) { const html = scrapsHint(); if (h.innerHTML !== html) h.innerHTML = html; }
  const m = document.getElementById("smsg"); if (m && ui.sMsg && now - ui.sMsg.shown > 3500 && m.innerHTML !== "&nbsp;") m.innerHTML = "&nbsp;";
}, 250);

const scrapStep = v => `Scraps · turn ${v.s.ti + 1} of ${v.s.n}`;

const scrapsViews = {
  spick() {
    const v = ui.view, s = v.s;
    if (!s.isBuilder) return head(scrapStep(v)) + `
      <section class="card center spot"><div class="label">Up next</div><div class="big-name">${esc(s.builder)}</div><p class="muted">is picking something to build…</p></section>
      ${scrapsScoreCard(v)}`;
    return head(scrapStep(v)) + `
      <section class="card spot center">
        <div class="label">Your turn to build</div>
        <p class="muted small">Pick one. Only you can see these. Picking for you in <b id="stimer">${Math.max(0, Math.ceil(s.pickIn / 1000))}s</b></p>
      </section>
      <div class="fopts">${s.opts.map((w, k) => `<button class="fopt sword" data-act="spick" data-v="${k}">${esc(w.toUpperCase())}</button>`).join("")}</div>
      <section class="card"><ul class="rules"><li>Build it from the pieces. No letters or numbers.</li><li>You get a point for everyone who guesses it.</li></ul></section>`;
  },

  splay() {
    const v = ui.view, s = v.s, st = scrapsState(); ui.sShownState = st;
    const timer = `<span class="btimer" id="stimer">${fmtTime(ui.sClock.end - Date.now())}</span>`;
    if (s.isBuilder) return head(scrapStep(v)) + `
      <section class="card sbar"><div><div class="label">Build this</div><div class="sbuild">${esc(s.word.toUpperCase())}</div></div>${timer}</section>
      <div class="scwrap">${scrapsSvg(ui.sPieces, { id: "scv", cls: "edit", sel: ui.sSel })}</div>
      <div class="spal" aria-label="Pieces">${SCRAP_PALETTE.map((it, i) => `<button class="spc" data-act="sadd" data-v="${i}" aria-label="Add piece">${scrapThumb(it)}</button>`).join("")}</div>
      <section class="card stools" id="stools">${scrapTools()}</section>
      <p class="smsg center-text" id="smsg">${scrapsMsgHtml()}</p>
      <section class="card" id="sstatus">${scrapsStatus()}</section>
      <section class="card"><div class="label">Guesses</div><ul class="sfeed" id="sfeed">${scrapsFeed()}</ul></section>`;
    const got = s.guessed.includes(v.me);
    return head(scrapStep(v)) + `
      <section class="card sbar"><div><div class="label">${esc(s.builder)} is building</div>${got ? `<div class="sbuild good">${esc(s.word.toUpperCase())}</div>` : `<div class="shint mono" id="shint">${scrapsHint()}</div>`}</div>${timer}</section>
      <div class="scwrap">${scrapsSvg(s.pieces, { id: "scv" })}</div>
      ${got ? `<section class="card center"><p class="good"><b>You got it!</b> Watch the others squirm.</p></section>` : `<section class="card">
        <div class="bentry"><input class="field fib" id="sIn" maxlength="40" placeholder="Your guess" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="send" value="${esc(ui.sDraft || "")}"><button class="btn" data-act="sguess">Guess</button></div>
        <p class="smsg" id="smsg">${scrapsMsgHtml()}</p>
      </section>`}
      <section class="card" id="sstatus">${scrapsStatus()}</section>
      <section class="card"><div class="label">Guesses</div><ul class="sfeed" id="sfeed">${scrapsFeed()}</ul></section>`;
  },

  sreveal() {
    const v = ui.view, s = v.s, last = s.ti === s.n - 1;
    return head(scrapStep(v)) + `
      <section class="card spot center"><div class="label">${esc(s.builder)} built</div><div class="big-name">${esc(s.word.toUpperCase())}</div>
        <p class="muted small">${s.guessed.length ? `Got it: ${s.guessed.map((p, k) => `${esc(p)} <em>+${k === 0 ? 3 : k === 1 ? 2 : 1}</em>`).join(", ")}` : "Nobody got it!"}${s.guessed.length ? ` · ${esc(s.builder)} <em>+${s.guessed.length}</em>` : ""}</p></section>
      <div class="scwrap">${scrapsSvg(s.pieces)}</div>
      ${scrapsScoreCard(v)}
      <button class="btn" data-act="snext">${last ? "See final scores" : "Next turn"}</button>`;
  },

  sresults() {
    const v = ui.view, s = v.s, order = v.players.slice().sort((a, b) => (s.total[b] || 0) - (s.total[a] || 0));
    const top = s.total[order[0]] || 0, winners = order.filter(p => (s.total[p] || 0) === top && top > 0);
    return head("Scraps · Game over") + `
      <section class="card center"><div class="label">${winners.length > 1 ? "Tied for the win" : winners.length ? "Winner" : "Nobody scored"}</div>
        ${winners.length ? `<div class="big-name">${winners.map(esc).join(" & ")}</div><p class="muted">${top} points</p>` : ""}</section>
      <section class="card"><div class="label">This game</div><ul class="players">${order.map(p => `<li class="${p === v.me ? "you" : ""}"><span>${esc(p)}</span><em>${s.total[p] || 0}</em></li>`).join("")}</ul></section>
      <section class="card"><div class="label">Scraps scoreboard</div><ul class="players">${v.players.slice().sort((a, b) => (v.sscores[b] || 0) - (v.sscores[a] || 0)).map(p => `<li class="${p === v.me ? "you" : ""}"><span>${esc(p)}</span><em>${v.sscores[p] || 0}</em></li>`).join("")}</ul></section>
      <button class="btn" data-act="start">Play again</button>
      <button class="btn ghost" data-act="tolobby">Back to lobby</button>`;
  }
};

function scrapsScoreCard(v) {
  const s = v.s, order = v.players.slice().sort((a, b) => (s.total[b] || 0) - (s.total[a] || 0)), d = s.round ? s.round.d : {};
  return `<section class="card"><div class="label">Scores</div><ul class="players">${order.map(p => `<li class="${p === v.me ? "you" : ""}"><span>${esc(p)} <small class="muted">${d[p] ? `+${d[p]} this turn` : ""}</small></span><em>${s.total[p] || 0}</em></li>`).join("")}</ul></section>`;
}

function scrapsLobby(v, lock, isHost) {
  const ss = v.sset;
  return `<section class="card">
      <div class="label">Turns to build (each)</div>
      <div class="chips">${[1, 2, 3].map(n => `<button class="chip" data-act="sturns" data-v="${n}" ${lock} aria-pressed="${ss.turns === n}">${n}</button>`).join("")}</div>
      <div class="label">Time to build</div>
      <div class="chips">${[60, 90, 120].map(n => `<button class="chip" data-act="ssecs" data-v="${n}" ${lock} aria-pressed="${ss.secs === n}">${n === 60 ? "1 min" : n === 90 ? "1½ min" : "2 min"}</button>`).join("")}</div>
      ${isHost ? "" : `<p class="muted small">${esc(v.hostName)} picks the settings.</p>`}
    </section>
    <button class="btn" data-act="start" ${v.seats.length >= 2 ? "" : "disabled"}>Start Scraps</button>
    <section class="card"><div class="label">How Scraps works</div><ul class="rules">
      <li>Players take turns building. The builder secretly picks one of two words.</li>
      <li>Build it out of shapes and stickers: drag to move, use the handles to resize and rotate, tap a piece to recolor or flip it. No letters.</li>
      <li>Everyone else watches the picture come together live and types guesses. A letter of the word shows up halfway through.</li>
      <li>Guessers get <b>3</b> for first, <b>2</b> for second, <b>1</b> after that. The builder gets <b>1</b> for each person who gets it.</li></ul></section>`;
}
