// Scriptable widget for the 30-day push-up challenge.
// Name this script exactly "Pompes30" in Scriptable so the web app can sync it.

// ---------- Settings ----------
const APP_URL = "https://niangoos.github.io/challenge-pompes/";
const DEFAULT_START = "2026-10-12"; // Day 1, used until the web app syncs

const C = {
  bg: new Color("#0e131b"),
  card: new Color("#1c2533"),
  fg: new Color("#eef2f7"),
  muted: new Color("#95a1b2"),
  accent: new Color("#2fd27f"),
  missed: new Color("#f06a6a"),
  todo: new Color("#f5b942"),
  line: new Color("#2a3546"),
};

// ---------- Default program (same as the poster) ----------
function defaultDay(d) {
  if (d <= 7) return [60, "4 × 15"];
  if (d <= 14) return [75, "5 × 15"];
  if (d <= 21) return [80, "4 × 20"];
  if (d <= 27) return [90, "3 × 20 + 1 × 30"];
  if (d === 28) return [0, "Récupération"];
  if (d === 29) return [30, "30 faciles"];
  return [0, "Test final"];
}

// ---------- Storage ----------
const fm = FileManager.local();
const FILE = fm.joinPath(fm.documentsDirectory(), "pompes30.json");

function loadData() {
  try { if (fm.fileExists(FILE)) return JSON.parse(fm.readString(FILE)); } catch (e) {}
  return null;
}
function saveData(d) { fm.writeString(FILE, JSON.stringify(d)); }

// ---------- Dates ----------
const pad = n => String(n).padStart(2, "0");
function isoLocal(dt = new Date()) { return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`; }
function toUTC(iso) { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); }

// ---------- Sync from the web app (scriptable:///run/Pompes30?data=...) ----------
const params = args.queryParameters || {};
if (params.data) {
  try {
    const incoming = JSON.parse(params.data);
    incoming.syncedAt = new Date().toISOString();
    saveData(incoming);
    const a = new Alert();
    a.title = "Widget mis à jour ✓";
    a.message = `${incoming.d.length}/30 jours faits. Tu peux revenir à l'app.`;
    a.addAction("OK");
    await a.presentAlert();
  } catch (e) {
    const a = new Alert();
    a.title = "Synchronisation impossible";
    a.message = "Les données reçues sont invalides. Réessaie depuis l'app.";
    a.addAction("OK");
    await a.presentAlert();
  }
  Script.complete();
  return;
}

// ---------- Compute stats ----------
const data = loadData();
const start = data?.s || DEFAULT_START;
const doneSet = new Set(data?.d || []);
const synced = !!data;
const today = Math.floor((toUTC(isoLocal()) - toUTC(start)) / 864e5) + 1;
const dayInfo = d => (data?.x && data.x[d - 1]) || defaultDay(d);

const doneCount = doneSet.size;
const missed = [];
for (let d = 1; d < Math.min(today, 31); d++) if (!doneSet.has(d)) missed.push(d);
let streak = 0;
{
  let d = Math.min(today, 30);
  if (!doneSet.has(d)) d--;
  while (d >= 1 && doneSet.has(d)) { streak++; d--; }
}
const reps = data?.r ?? 0;
const planned = data?.p ?? 2135;

let status, statusColor;
if (today < 1) { status = today === 0 ? "Départ demain" : `Départ dans ${1 - today} j`; statusColor = C.muted; }
else if (today > 30) { status = doneCount === 30 ? "Challenge réussi !" : "Challenge terminé"; statusColor = C.accent; }
else if (doneSet.has(today)) { status = "✓ Fait aujourd'hui"; statusColor = C.accent; }
else if (!synced) { status = "Séance du jour"; statusColor = C.todo; }
else { status = "À faire aujourd'hui"; statusColor = C.todo; }

const shownDay = Math.min(Math.max(today, 1), 30);
const [target, scheme] = dayInfo(shownDay);

// ---------- Drawing helpers ----------
function progressBar(width, height, ratio, color) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const bg = new Path(); bg.addRoundedRect(new Rect(0, 0, width, height), height / 2, height / 2);
  dc.addPath(bg); dc.setFillColor(C.line); dc.fillPath();
  const w = Math.max(height, width * Math.min(1, ratio));
  if (ratio > 0) {
    const fg = new Path(); fg.addRoundedRect(new Rect(0, 0, w, height), height / 2, height / 2);
    dc.addPath(fg); dc.setFillColor(color); dc.fillPath();
  }
  return dc.getImage();
}

function dayGrid(width, cols, gap) {
  // One square per day: green done, red missed, amber outline today, grey upcoming.
  const rows = Math.ceil(30 / cols);
  const size = (width - gap * (cols - 1)) / cols;
  const dc = new DrawContext();
  dc.size = new Size(width, rows * size + (rows - 1) * gap);
  dc.opaque = false;
  dc.respectScreenScale = true;
  for (let d = 1; d <= 30; d++) {
    const i = d - 1, x = (i % cols) * (size + gap), y = Math.floor(i / cols) * (size + gap);
    const r = new Rect(x, y, size, size);
    const p = new Path(); p.addRoundedRect(r, 3, 3);
    dc.addPath(p);
    let fill = C.card;
    if (doneSet.has(d)) fill = C.accent;
    else if (synced && d < today) fill = C.missed;
    dc.setFillColor(fill); dc.fillPath();
    if (d === today) {
      const o = new Path(); o.addRoundedRect(new Rect(x + 1, y + 1, size - 2, size - 2), 3, 3);
      dc.addPath(o); dc.setStrokeColor(C.todo); dc.setLineWidth(2.5); dc.strokePath();
    }
  }
  return dc.getImage();
}

function text(stack, str, font, color, opts = {}) {
  const t = stack.addText(str);
  t.font = font; t.textColor = color;
  if (opts.lines) t.lineLimit = opts.lines;
  if (opts.scale) t.minimumScaleFactor = opts.scale;
  return t;
}

// ---------- Widgets ----------
function headerLine(stack) {
  const label = today < 1 ? "CHALLENGE POMPES" : today > 30 ? "30/30 JOURS" : `JOUR ${today}/30`;
  text(stack, label, Font.heavySystemFont(13), C.accent);
}

function targetBlock(stack, big) {
  if (target > 0) {
    const row = stack.addStack();
    row.bottomAlignContent();
    text(row, String(target), Font.heavyRoundedSystemFont(big), C.fg);
    row.addSpacer(4);
    text(row, "pompes", Font.mediumSystemFont(12), C.muted);
    text(stack, scheme, Font.mediumSystemFont(12), C.muted, { lines: 1, scale: 0.7 });
  } else {
    text(stack, scheme, Font.heavySystemFont(big * 0.55), C.fg, { lines: 1, scale: 0.6 });
  }
}

function buildSmall(w) {
  headerLine(w);
  w.addSpacer(2);
  targetBlock(w, 40);
  w.addSpacer();
  text(w, status, Font.semiboldSystemFont(12), statusColor, { lines: 1, scale: 0.7 });
  w.addSpacer(5);
  w.addImage(progressBar(260, 10, doneCount / 30, C.accent)).imageSize = new Size(130, 5);
}

function statBlock(stack, value, label, color) {
  const s = stack.addStack();
  s.layoutVertically();
  text(s, value, Font.heavyRoundedSystemFont(20), color || C.fg);
  text(s, label, Font.mediumSystemFont(10), C.muted);
}

function buildMedium(w) {
  const row = w.addStack();
  const left = row.addStack();
  left.layoutVertically();
  headerLine(left);
  left.addSpacer(2);
  targetBlock(left, 38);
  left.addSpacer();
  text(left, status, Font.semiboldSystemFont(12), statusColor, { lines: 1, scale: 0.7 });
  row.addSpacer(14);
  const right = row.addStack();
  right.layoutVertically();
  right.addImage(dayGrid(330, 10, 5)).imageSize = new Size(165, 47);
  right.addSpacer();
  const stats = right.addStack();
  statBlock(stats, `${doneCount}/30`, "jours faits");
  stats.addSpacer();
  statBlock(stats, String(streak), "d'affilée", streak > 0 ? C.accent : C.fg);
  stats.addSpacer();
  statBlock(stats, String(missed.length), "manqués", synced && missed.length ? C.missed : C.fg);
}

function buildLarge(w) {
  headerLine(w);
  w.addSpacer(4);
  targetBlock(w, 52);
  w.addSpacer(6);
  text(w, status, Font.semiboldSystemFont(14), statusColor);
  w.addSpacer(12);
  w.addImage(dayGrid(600, 10, 8)).imageSize = new Size(300, 92);
  w.addSpacer(12);
  const stats = w.addStack();
  statBlock(stats, `${doneCount}/30`, "jours faits");
  stats.addSpacer();
  statBlock(stats, String(streak), "d'affilée", streak > 0 ? C.accent : C.fg);
  stats.addSpacer();
  statBlock(stats, String(missed.length), "manqués", synced && missed.length ? C.missed : C.fg);
  stats.addSpacer();
  statBlock(stats, reps.toLocaleString("fr-FR"), `pompes / ${planned.toLocaleString("fr-FR")}`);
  w.addSpacer();
  w.addImage(progressBar(600, 12, doneCount / 30, C.accent)).imageSize = new Size(300, 6);
  w.addSpacer(6);
  const foot = synced
    ? `Mis à jour ${new Date(data.syncedAt).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
    : "Synchronise depuis l'app pour voir tes séances faites";
  text(w, foot, Font.mediumSystemFont(10), C.muted, { lines: 1, scale: 0.7 });
}

function buildAccessoryRect(w) {
  text(w, today < 1 || today > 30 ? "Pompes 30J" : `Jour ${today}/30 · ${doneCount} faits`, Font.semiboldSystemFont(13), Color.white(), { lines: 1, scale: 0.7 });
  text(w, target > 0 ? `${target} pompes · ${scheme}` : scheme, Font.systemFont(12), Color.white(), { lines: 1, scale: 0.7 });
  text(w, status, Font.systemFont(12), Color.white(), { lines: 1, scale: 0.7 });
}

function buildAccessoryCircle(w) {
  w.addSpacer();
  const t = text(w, today >= 1 && today <= 30 ? String(today) : "30", Font.heavyRoundedSystemFont(20), Color.white());
  t.centerAlignText();
  const s = text(w, doneSet.has(today) ? "✓" : "/30", Font.systemFont(10), Color.white());
  s.centerAlignText();
  w.addSpacer();
}

// ---------- Build ----------
const family = config.widgetFamily || "medium";
const w = new ListWidget();
w.url = APP_URL;
if (family.startsWith("accessory")) {
  family === "accessoryCircular" ? buildAccessoryCircle(w) : buildAccessoryRect(w);
} else {
  w.backgroundColor = C.bg;
  w.setPadding(14, 14, 14, 14);
  if (family === "small") buildSmall(w);
  else if (family === "large" || family === "extraLarge") buildLarge(w);
  else buildMedium(w);
}

// Refresh soon after midnight so the new day shows up, otherwise every 30 minutes.
const midnight = new Date(); midnight.setHours(24, 1, 0, 0);
w.refreshAfterDate = new Date(Math.min(midnight.getTime(), Date.now() + 30 * 60 * 1000));

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  await w.presentMedium();
}
Script.complete();
