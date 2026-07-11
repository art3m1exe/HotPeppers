("use strict");

/* ============================ TELEGRAM WEB APP ============================ */
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const tgUser = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user : null;
if (tg) {
  try { tg.ready(); } catch (e) {}
  try { tg.expand(); } catch (e) {}
  try { tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) {}
}

/* ============================ CONFIG ============================ */
const CONFIG = {
  tickMs: 1000,
  saveMs: 10000,
  storageKey: "hotPepperSave",
  eventMinMs: 60000,
  eventMaxMs: 120000,
  eventChance: 0.18,
  rates: {
    waterDecay: 0.0015,
    foodDecay: 0.0012,
    lightOnGain: 0.0009,
    lightOffLoss: 0.0009,
    growth: 0.038,
    growthBad: 0.006,
    healthGood: 0.025,
    healthBad: 0.0025,
  },
  offlineMaxSec: 12 * 3600,
  action: { water: 28, feed: 22, overfillPenalty: 10 },
  xpForLevel: (n) => Math.round(100 * Math.pow(n, 1.4)),
};

const STRAINS = [
  { id: "star1",   name: "Халапеньо",        tier: "Стартовый",   seedPrice: 0,    baseReward: 60,   greenZone: { min: 25, max: 90 }, minLevel: 1,  starterDecay: true },
  { id: "aurora",  name: "Серрано",          tier: "Базовый",     seedPrice: 100,  baseReward: 150,  greenZone: { min: 38, max: 82 }, minLevel: 1 },
  { id: "cryo",    name: "Кайен",            tier: "Средний",     seedPrice: 400,  baseReward: 380,  greenZone: { min: 45, max: 75 }, minLevel: 3 },
  { id: "pulsar",  name: "Хабанеро",         tier: "Продвинутый", seedPrice: 1200, baseReward: 900,  greenZone: { min: 50, max: 70 }, minLevel: 5 },
  { id: "orion",   name: "Призрачный перец", tier: "Элитный",     seedPrice: 3000, baseReward: 2200, greenZone: { min: 55, max: 65 }, minLevel: 7 },
  { id: "quasar",  name: "Каролина Рипер",   tier: "Легендарный", seedPrice: 6500, baseReward: 5500, greenZone: { min: 55, max: 62 }, minLevel: 10 },
];

const UPGRADES = [
  { id: "autoLight", name: "Таймер света",   desc: "Сам держит свет в зелёной зоне",           price: 120 },
  { id: "ledPro",    name: "LED Pro",        desc: "+50% к росту при включённом свете",          price: 350 },
  { id: "autoWater", name: "Капельный полив", desc: "Скорость расхода воды ×0.5",                  price: 200 },
  { id: "phBuffer",  name: "Буфер pH",        desc: "Защита от перекорма (верх ед. до 95%)",      price: 180 },
];

const POTS = [
  { id: 0, name: "Горшок 1", price: 0,    minLevel: 1,  owned: true  },
  { id: 1, name: "Горшок 2", price: 500,  minLevel: 3,  owned: false },
  { id: 2, name: "Горшок 3", price: 1500, minLevel: 5,  owned: false },
  { id: 3, name: "Горшок 4", price: 3000, minLevel: 7,  owned: false },
  { id: 4, name: "Горшок 5", price: 6000, minLevel: 10, owned: false },
];

const ACHIEVEMENTS = [
  { id: "firstHarvest", name: "Первый сбор",          desc: "Собери первый перец",            icon: "🌶️", check: (s) => s.stats.harvests >= 1 },
  { id: "harvest10",    name: "Ботаник",               desc: "10 урожаев",                     icon: "🏆", check: (s) => s.stats.harvests >= 10 },
  { id: "perfect",      name: "Идеальный урожай",       desc: "Собери перец со 100% здоровья",   icon: "💯", check: (s) => s.stats.perfectCount >= 1 },
  { id: "level5",       name: "Опытный",                desc: "Достигни 5 уровня",              icon: "⭐", check: (s) => s.level >= 5 },
  { id: "strains5",     name: "Коллекционер",           desc: "Открой 5 сортов",                icon: "🌶️", check: (s) => s.strains.filter(x => x.owned).length >= 5 },
  { id: "survivor",     name: "Выживший",               desc: "Спаси перец при <10% здоровья",  icon: "🛡️", check: (s) => s.stats.saves >= 1 },
  { id: "death5",       name: "Горе-фермер",            desc: "Потеряй 5 перцев",               icon: "💀", check: (s) => s.stats.deaths >= 5 },
  { id: "streak30",     name: "В ударе",                desc: "Streak x30",                     icon: "🔥", check: (s) => s.stats.maxStreak >= 30 },
];

/* ============================ STATE ============================ */
const DEFAULT_STATE = {
  money: 50,
  xp: 0,
  level: 1,
  activePot: 0,
  introDone: false,
  muted: false,
  pots: [null, null, null, null, null],
  upgrades: { autoLight: false, ledPro: false, autoWater: false, phBuffer: false },
  strains: STRAINS.map((s) => ({ id: s.id, owned: s.id === "star1" })),
  potsOwned: [true, false, false, false, false],
  achievements: {},
  stats: { harvests: 0, totalEarned: 0, maxStreak: 0, bestHealth: 0, deaths: 0, perfectCount: 0, saves: 0 },
};

let state = clone(DEFAULT_STATE);
function clone(o) { return JSON.parse(JSON.stringify(o)); }

function makePlant(strainId) {
  return {
    strainId,
    stage: 0,
    growth: 0,
    water: 60,
    food: 60,
    light: 50,
    health: 100,
    lightOn: false,
    streak: 0,
    ageSec: 0,
    bornAt: Date.now(),
    event: null,      // {type, endsAt}
    sprEvent: null,   // disables { bugSpray:true }
  };
}

/* ============================ STORAGE ============================ */
function save() {
  try {
    state.savedAt = Date.now();
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
  } catch (e) {}
}
function load() {
  try {
    let raw = localStorage.getItem(CONFIG.storageKey);
    // Миграция со старого ключа alienGroverSave
    if (!raw) {
      const legacy = localStorage.getItem("alienGroverSave");
      if (legacy) {
        localStorage.setItem(CONFIG.storageKey, legacy);
        localStorage.removeItem("alienGroverSave");
        raw = legacy;
      } else return false;
    }
    state = Object.assign(clone(DEFAULT_STATE), JSON.parse(raw));
    applyOffline();
    return true;
  } catch (e) { return false; }
}
function applyOffline() {
  if (!state.savedAt) return;
  const dtSec = Math.min((Date.now() - state.savedAt) / 1000, CONFIG.offlineMaxSec);
  if (dtSec < 60) return;
  // Пошаговая симуляция по минутам — точно учитывает когда шкала входит в bad-зону
  const steps = Math.ceil(dtSec / 60);
  const stepSec = dtSec / steps;
  const r = CONFIG.rates;
  let deathsMsg = [];
  state.pots.forEach((p, idx) => {
    if (!p) return;
    const z = zoneFor(p.strainId);
    p.event = null; // события не живут в оффлайне
    for (let s = 0; s < steps; s++) {
      const wMul = 1, fMul = 1;
      if (state.upgrades.autoLight) {
        if (p.light < z.min + 5) p.lightOn = true;
        else if (p.light > z.max) p.lightOn = false;
      }
      const wDecay = r.waterDecay * (state.upgrades.autoWater ? 0.5 : 1) * wMul;
      p.water = clamp(p.water - wDecay * stepSec);
      p.food = clamp(p.food - r.foodDecay * fMul * stepSec);
      const lDelta = p.lightOn ? r.lightOnGain : -r.lightOffLoss;
      p.light = clamp(p.light + lDelta * stepSec);
      const anyBad = p.water < 12 || p.food < 12 || p.light < 12 || p.water > 96 || p.food > 96 || p.light > 96;
      if (anyBad) p.health = clamp(p.health - r.healthBad * stepSec);
      else {
        const inZone = (v) => v >= z.min && v <= z.max;
        if (inZone(p.water) && inZone(p.food) && inZone(p.light)) {
          p.health = clamp(p.health + r.healthGood * stepSec);
          p.growth = clamp(p.growth + r.growth * stepSec, 0, 100);
        } else {
          p.growth = clamp(p.growth + r.growthBad * stepSec, 0, 100);
        }
      }
      if (p.health <= 0) break;
    }
    p.ageSec += Math.round(dtSec);
    p.stage = stageFor(p.growth);
    if (p.health <= 0) {
      state.pots[idx] = null;
      state.stats.deaths++;
      if (idx === state.activePot) deathsMsg.push("🥀 Перец " + strainById(p.strainId).name + " погиб, пока тебя не было");
    }
  });
  const hours = Math.floor(dtSec / 3600);
  const mins = Math.floor((dtSec % 3600) / 60);
  toast(`⏰ Тебя не было ${hours}ч ${mins}м`, "");
  deathsMsg.forEach(m => toast(m, "bad"));
}
function hardReset() {
  if (!confirm("Сбросить ВЕСЬ прогресс? Это нельзя отменить.")) return;
  localStorage.removeItem(CONFIG.storageKey);
  state = clone(DEFAULT_STATE);
  startGame();
  showIntro();
  render();
}

/* ============================ HELPERS ============================ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
function activePlant() { return state.pots[state.activePot]; }
function strainById(id) { return STRAINS.find((s) => s.id === id) || STRAINS[0]; }
function zoneFor(strainId) {
  const z = strainById(strainId).greenZone;
  return state.upgrades.phBuffer ? { min: z.min, max: 95 } : z;
}
function stageFor(g) { return g < 5 ? 0 : g < 35 ? 1 : g < 75 ? 2 : 3; }
function hasOwned(strainId) { return !!state.strains.find((x) => x.id === strainId)?.owned; }

// Индексы горшков, где растение упало ниже 12 HP — для достижения survivor.
// Хранится в памяти, НЕ сохраняется в localStorage (раньше протекало через p._saveTagged).
const _survivors = new Set();

/* ============================ AUDIO ============================ */
let audioCtx = null;
function beep(freq = 660, ms = 80, type = "sine", vol = 0.07) {
  try {
    if (state.muted) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + ms / 1000);
    o.stop(audioCtx.currentTime + ms / 1000);
  } catch (e) {}
}
const SFX = {
  water:  () => beep(520, 120, "sine", 0.08),
  feed:   () => beep(720, 90,  "triangle", 0.07),
  light:  () => beep(380, 120, "square", 0.05),
  harvest:() => { beep(660, 80); setTimeout(() => beep(880, 80), 90); setTimeout(() => beep(1100, 120), 180); },
  level:  () => { beep(523, 100); setTimeout(() => beep(659, 100), 110); setTimeout(() => beep(784, 200), 220); },
  death:  () => { beep(200, 200, "sawtooth", 0.1); setTimeout(() => beep(120, 300, "sawtooth", 0.1), 200); },
  event:  () => beep(440, 150, "square", 0.06),
  ach:    () => { beep(880, 80); setTimeout(() => beep(1320, 150), 90); },
};

/* ============================ TOASTS ============================ */
function toast(text, kind = "") {
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " toast--" + kind : "");
  el.textContent = text;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ============================ INTRO ============================ */
function showIntro() { $("#intro").setAttribute("aria-hidden", "false"); }
function hideIntro() {
  state.introDone = true;
  $("#intro").setAttribute("aria-hidden", "true");
  save();
}

/* ============================ GAME LOOP ============================ */
let nextEventAt = 0;
function pickNextEvent() {
  nextEventAt = Date.now() + CONFIG.eventMinMs + Math.random() * (CONFIG.eventMaxMs - CONFIG.eventMinMs);
}

function tickPlant(p, idx) {
  if (!p) return;
  const z = zoneFor(p.strainId);
  p.ageSec++;
  // Мягкий старт: первые 30 мин decay ×0.5
  const soft = p.ageSec < 1800 ? 0.5 : 1;

  // Event-модификаторы decay
  let wMul = 1, fMul = 1, lightAuto = 0;
  if (p.event) {
    if (p.event.type === "bug")      fMul = 2;
    if (p.event.type === "wind")     wMul = 2;
    if (p.event.type === "heat")     lightAuto = +1.5;
    if (p.event.type === "luck")     { /* пассивный бонус, см. ниже */ }
    if (Date.now() > p.event.endsAt) p.event = null;
  }

  // Свет
  if (state.upgrades.autoLight) {
    if (p.light < z.min + 5) p.lightOn = true;
    else if (p.light > z.max) p.lightOn = false;
  }
  let lDelta = p.lightOn ? CONFIG.rates.lightOnGain : -CONFIG.rates.lightOffLoss;
  lDelta += lightAuto;
  p.light = clamp(p.light + lDelta);

  // Вода / еда
  const wDecay = (state.upgrades.autoWater ? CONFIG.rates.waterDecay * 0.5 : CONFIG.rates.waterDecay) * soft * wMul;
  const fDecay = CONFIG.rates.foodDecay * soft * fMul;
  p.water = clamp(p.water - wDecay);
  p.food  = clamp(p.food - fDecay);

  // Luck event: Todo в зоне → восстанавливаются
  if (p.event && p.event.type === "luck") {
    p.water = clamp(p.water + 0.4);
    p.food  = clamp(p.food  + 0.4);
  }

  const inZone = (v) => v >= z.min && v <= z.max;
  const allGood = inZone(p.water) && inZone(p.food) && inZone(p.light);

  let gRate = allGood ? CONFIG.rates.growth : CONFIG.rates.growthBad;
  if (state.upgrades.ledPro && p.lightOn) gRate *= 1.5;
  // Streak-бонус
  if (allGood) p.streak = (p.streak || 0) + 1;
  else p.streak = Math.max(0, (p.streak || 0) - 3);
  const streakMul = p.streak >= 10 ? 1.4 : 1;
  p.growth = clamp(p.growth + gRate * streakMul, 0, 100);
  state.stats.maxStreak = Math.max(state.stats.maxStreak, p.streak);

  const anyBad = p.water < 12 || p.food < 12 || p.light < 12 || p.water > 96 || p.food > 96 || p.light > 96;
  if (anyBad) {
    p.health = clamp(p.health - CONFIG.rates.healthBad);
    if (p.health < 12) _survivors.add(idx); // кандидат на достижение survivor
  } else if (allGood) {
    p.health = clamp(p.health + CONFIG.rates.healthGood);
    if (_survivors.has(idx) && p.health > 30) { state.stats.saves++; _survivors.delete(idx); checkAchievements(); }
  }

  p.stage = stageFor(p.growth);

  // Смерть
  if (p.health <= 0) {
    state.pots[idx] = null;
    state.stats.deaths++;
    _survivors.delete(idx);
    if (idx === state.activePot) {
      toast("🥀 Перец погиб — горшок свободен", "bad");
      SFX.death();
      renderEvent(idx);
    }
    checkAchievements();
  }
}

function loop() {
  state.pots.forEach(tickPlant);

  // События — на активном горшке
  const ap = activePlant();
  if (ap && !ap.event && Date.now() > nextEventAt && Math.random() < CONFIG.eventChance) {
    triggerEvent();
    pickNextEvent();
  } else if (Date.now() > nextEventAt) {
    pickNextEvent();
  }

  // Обновляем UI события (баннер)
  renderEvent();
  render();
  maybeCheckAchievements();
}

/* ============================ EVENTS ============================ */
const EVENT_TYPES = [
  { type: "bug",   icon: "🐛", text: "Тля напала! Удобрение расходуется быстрее. Обработай перец!", action: "Обработать", dur: 15000 },
  { type: "heat",  icon: "🥵", text: "Тепловой пик! Свет сам растёт. Выключай лампу!",                dur: 10000 },
  { type: "wind",  icon: "🌀", text: "Сквозняк! Вода испаряется быстрее.",                            dur: 12000 },
  { type: "luck",  icon: "🍀", text: "Удача! Все шкалы сами восстанавливаются. +5 🌶️ бонус",         dur: 30000, luck: true },
];
function triggerEvent() {
  const ap = activePlant();
  if (!ap) return;
  const def = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  ap.event = { type: def.type, endsAt: Date.now() + def.dur };
  if (def.luck) state.money += 5;
  showEventBanner(def);
  SFX.event();
}
function eventAction() {
  const ap = activePlant();
  if (!ap || !ap.event) return;
  if (ap.event.type === "bug") ap.food = clamp(ap.food + 30);
  ap.event = null;
  hideEventBanner();
  toast("Принято!", "good");
  beep(880, 80);
}

let lastEventDef = null;
function showEventBanner(def) {
  lastEventDef = def;
  const b = $("#eventBanner");
  $(".event__icon", b).textContent = def.icon;
  $(".event__text", b).textContent = def.text;
  const act = $("#eventAction");
  if (def.action) { act.style.display = ""; act.textContent = def.action; }
  else act.style.display = "none";
  b.classList.toggle("event--luck", !!def.luck);
  b.setAttribute("aria-hidden", "false");
}
function hideEventBanner() { $("#eventBanner").setAttribute("aria-hidden", "true"); }
function renderEvent() {
  const ap = activePlant();
  if (!ap || !ap.event) { hideEventBanner(); return; }
  if (!lastEventDef || lastEventDef.type !== ap.event.type) {
    const def = EVENT_TYPES.find(e => e.type === ap.event.type);
    showEventBanner(def);
  }
}

/* ============================ ACTIONS ============================ */
function doWater() {
  const p = activePlant(); if (!p) return;
  const prev = p.water;
  p.water = clamp(p.water + CONFIG.action.water);
  if (prev > 92) { p.health = clamp(p.health - CONFIG.action.overfillPenalty); toast("Избыток воды! -" + CONFIG.action.overfillPenalty + " HP", "bad"); }
  spawnFx(["💧"]);
  SFX.water();
}
function doFeed() {
  const p = activePlant(); if (!p) return;
  const prev = p.food;
  p.food = clamp(p.food + CONFIG.action.feed);
  if (prev > 92) { p.health = clamp(p.health - CONFIG.action.overfillPenalty); toast("Перекорм! -" + CONFIG.action.overfillPenalty + " HP", "bad"); }
  spawnFx(["🧪"]);
  SFX.feed();
}
function doLight() {
  const p = activePlant(); if (!p) return;
  if (state.upgrades.autoLight) return;
  p.lightOn = !p.lightOn;
  SFX.light();
}
function doHarvest() {
  const p = activePlant();
  if (!p || p.growth < 100) { toast("Перец ещё не вырос", "bad"); return; }
  const strain = strainById(p.strainId);
  const reward = Math.round(strain.baseReward * (p.health / 100));
  const xpGain = Math.round(reward * 0.6);
  state.money += reward;
  state.xp += xpGain;
  state.stats.harvests++;
  state.stats.totalEarned += reward;
  state.stats.bestHealth = Math.max(state.stats.bestHealth, Math.round(p.health));
  const perfect = p.health >= 99.5;
  if (perfect) state.stats.perfectCount++;
  let leveled = false;
  while (state.xp >= CONFIG.xpForLevel(state.level)) {
    state.xp -= CONFIG.xpForLevel(state.level);
    state.level++;
    leveled = true;
  }
  spawnFx(["🌶️", "💰"]);
  SFX.harvest();
  // Освобождаем горшок и показываем пост-уборочную модалку (без авто-пересева)
  state.pots[state.activePot] = null;
  _survivors.delete(state.activePot);
  renderPots();
  checkAchievements();
  save();
  openHarvestModal({ reward, xpGain, leveled, strainId: strain.id, strainName: strain.name, perfect });
}
function plantSeed(strainId) {
  const s = strainById(strainId);
  if (!hasOwned(strainId)) {
    if (state.level < s.minLevel) { toast("Требуется уровень " + s.minLevel, "bad"); return; }
    if (state.money < s.seedPrice) { toast("Не хватает 🌶️ " + s.seedPrice, "bad"); return; }
    state.money -= s.seedPrice;
    state.strains.find(x => x.id === strainId).owned = true;
    toast("Открыт сорт: " + s.name, "ach");
    beep(660, 80);
  }
  if (activePlant()) { if (!confirm("Заменить текущий перец? Прогресс будет потерян.")) return; }
  state.pots[state.activePot] = makePlant(strainId);
  toast("Посажен сорт: " + s.name, "good");
  renderPots();
  checkAchievements();
}

/* ============================ HARVEST MODAL ============================ */
let lastHarvest = null;
function openHarvestModal(info) {
  lastHarvest = info;
  const m = $("#harvestModal");
  $("#harvestReward").textContent = "+🌶️ " + info.reward;
  $("#harvestXp").textContent = "+" + info.xpGain + " XP";
  $("#harvestStrain").textContent = info.strainName;
  $("#harvestPerfect").style.display = info.perfect ? "" : "none";
  $("#harvestLevelUp").style.display = info.leveled ? "" : "none";
  m.setAttribute("aria-hidden", "false");
  beep(660, 80);
  if (info.leveled) SFX.level();
  else toast(`+🌶️ ${info.reward} · +${info.xpGain} XP`, "good");
}
function closeHarvestModal() { $("#harvestModal").setAttribute("aria-hidden", "true"); lastHarvest = null; }
function plantSameStrain() {
  if (!lastHarvest) { closeHarvestModal(); return; }
  const id = lastHarvest.strainId;
  if (!hasOwned(id)) id = "star1";
  if (activePlant() && !confirm("Заменить текущий перец?")) return;
  state.pots[state.activePot] = makePlant(id);
  closeHarvestModal();
  renderPots();
  render();
  toast("Посажен сорт: " + strainById(id).name, "good");
}
function harvestGoShop() {
  closeHarvestModal();
  openShop();
}

/* ============================ FX (particles) ============================ */
function spawnFx(emojis) {
  const fx = $("#fx");
  emojis.forEach((e, i) => {
    const span = document.createElement("span");
    span.className = "p";
    span.textContent = e;
    const dx = (Math.random() * 60 - 30);
    span.style.setProperty("--dx", dx + "px");
    span.style.left = (50 + (i - emojis.length / 2) * 6) + "%";
    span.style.animationDelay = (i * 0.06) + "s";
    fx.appendChild(span);
    setTimeout(() => span.remove(), 1300);
  });
}

/* ============================ RENDER ============================ */
// Плавный твин чисел через requestAnimationFrame (ease-out-cubic, ~400ms).
// Хранит активный твин на el._tween; повторный запуск отменяет предыдущий.
// formatter применяет итоговое значение (по умолчанию Math.round).
function tweenNum(el, to, formatter) {
  if (!el) return;
  if (typeof formatter !== "function") formatter = (v) => Math.round(v);
  const target = formatter(to);
  const curTxt = el.textContent;
  if (curTxt === String(target)) return;
  const from = parseFloat(curTxt) || 0;
  if (el._tween) cancelAnimationFrame(el._tween);
  if (from === to) { el.textContent = String(target); return; }
  const DUR = 400, t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / DUR);
    const e = 1 - Math.pow(1 - t, 3); // ease-out-cubic
    el.textContent = String(formatter(from + (to - from) * e));
    if (t < 1) el._tween = requestAnimationFrame(step);
    else { el._tween = null; el.textContent = String(target); }
  };
  el._tween = requestAnimationFrame(step);
}

const _meterCache = {};
function setMeter(name, value) {
  const row = document.querySelector(`[data-meter="${name}"]`);
  if (!row) return;
  const valEl = $(".meter__value", row);
  const want = Math.round(value);
  if (_meterCache[name + "_v"] !== want) { tweenNum(valEl, value); _meterCache[name + "_v"] = want; }
  const fill = $(".meter__fill", row);
  const w = Math.round(value * 10) / 10;
  if (_meterCache[name] !== w) { fill.style.setProperty("--w", value + "%"); _meterCache[name] = w; }
  const bar = $(".meter__bar", row);
  const wantDanger = value < 20 || value > 92;
  const wantLow = !wantDanger && (value < 35 || value > 87);
  bar.classList.toggle("danger", wantDanger);
  bar.classList.toggle("low", wantLow);
  const u = $(".meter__urgency", row);
  if (u) u.setAttribute("aria-hidden", wantDanger ? "false" : "true");
}

let _hudMoneyT = -1, _hudXpT = -1, _hudLevelT = -1;
function renderHUD() {
  const me = $("#hudMoney .stat__value");
  if (_hudMoneyT !== state.money) { tweenNum(me, state.money); _hudMoneyT = state.money; }
  const xe = $("#hudXp .stat__value");
  if (_hudXpT !== state.xp) { tweenNum(xe, state.xp); _hudXpT = state.xp; }
  const le = $("#hudLevel .stat__value");
  if (_hudLevelT !== state.level) { tweenNum(le, state.level); _hudLevelT = state.level; }
  const mu = state.muted ? "🔇" : "🔊";
  const mb = $("#btnMute");
  if (mb.textContent !== mu) mb.textContent = mu;
  // Ник игрока из Telegram (если есть)
  const ue = $("#hudUser");
  if (ue) {
    if (tgUser && tgUser.first_name) {
      const name = tgUser.first_name;
      const uv = ue.querySelector(".stat__value");
      if (uv.textContent !== name) uv.textContent = name;
      if (ue.getAttribute("aria-hidden") !== "false") ue.setAttribute("aria-hidden", "false");
    } else {
      if (ue.getAttribute("aria-hidden") !== "true") ue.setAttribute("aria-hidden", "true");
    }
  }
}

function moodAndSpeech(p) {
  let mood = "🙂", speech = "🌶️ Расту!";
  if (!p) return null;
  const z = zoneFor(p.strainId);

  // Приоритет критики
  if (p.health <= 20) { mood = "🥀"; speech = "🥀 Мне плохо..."; }
  else if (p.water < 22) { mood = "😟"; speech = "💧 Хочу пить!"; }
  else if (p.food < 22)  { mood = "😟"; speech = "🧪 Нужны удобрения!"; }
  else if (p.light < 22 && !p.lightOn) { mood = "😟"; speech = "☀️ Темно..."; }
  else if (p.light > 92 && p.lightOn) { mood = "🥵"; speech = "🥵 Жарко!"; }
  else if (p.water > 90) { mood = "😌"; speech = "💧 Перелив..."; }
  else if (p.food > 90)  { mood = "😌"; speech = "🧪 Перекорм..."; }
  else if (p.growth >= 100) { mood = "😍"; speech = "🌶️ Готов к сбору!"; }
  else if (p.streak >= 10) { mood = "😍"; speech = "😊 Всё отлично!"; }
  else { mood = "🙂"; speech = "🌶️ Расту..."; }

  // Body-language class для plant
  let bodyClass = "plant--happy";
  if (p.health <= 20) bodyClass = "plant--droopy";
  else if (p.water < 22) bodyClass = "plant--thirsty";
  else if (p.light > 90 && p.lightOn) bodyClass = "plant--hot";
  else if (p.streak >= 10) bodyClass = "plant--happy";

  return { mood, speech, bodyClass };
}

let lastStage = -1, lastBodyClass = "", lastSpeech = "", lastMood = "", lastStrainId = "", lastLightOn = null, lastStreakShown = -2;
function renderPlant() {
  const p = activePlant();
  const plantEl = $("#plant");
  const speechEl = $("#speech");
  const moodEl = $("#mood");
  const strainName = $("#strainName");
  const strainBadge = $("#strainBadge");

  if (!p) {
    if (lastStage !== 0) { plantEl.classList.remove(...plantEl.classList.values().filter(c => c.startsWith("plant--s"))); plantEl.classList.add("plant--s0"); lastStage = 0; }
    if (lastBodyClass !== "plant--happy") { plantEl.classList.remove(...plantEl.classList.values().filter(c => c.startsWith("plant--") && !c.startsWith("plant--s"))); plantEl.classList.add("plant--happy"); lastBodyClass = "plant--happy"; }
    if (speechEl.getAttribute("aria-hidden") !== "true") speechEl.setAttribute("aria-hidden", "true");
    if (moodEl.textContent !== "💤") moodEl.textContent = "💤";
    if (strainName.textContent !== "Пустой горшок") strainName.textContent = "Пустой горшок";
    if (strainBadge.textContent !== "—") strainBadge.textContent = "—";
    lastStrainId = "";
    lastSpeech = ""; lastMood = ""; lastLightOn = null;
    if ($("#lamp").getAttribute("data-state") !== "off") $("#lamp").setAttribute("data-state", "off");
    const lampBtnOff = $("#btnLight");
    if (lampBtnOff && lampBtnOff.classList.contains("btn--lamp-on")) lampBtnOff.classList.remove("btn--lamp-on");
    if ($("#sky").style.background !== "linear-gradient(180deg, rgba(10,10,14,0.62) 0%, rgba(20,20,26,0.42) 100%)") $("#sky").style.background = "linear-gradient(180deg, rgba(10,10,14,0.62) 0%, rgba(20,20,26,0.42) 100%)";
    const sb = $("#streakBadge");
    if (sb.getAttribute("aria-hidden") !== "true") sb.setAttribute("aria-hidden", "true");
    lastStreakShown = -2;
    return;
  }

  // Stage
  if (p.stage !== lastStage) {
    plantEl.classList.remove("plant--s0", "plant--s1", "plant--s2", "plant--s3");
    plantEl.classList.add("plant--s" + p.stage);
    lastStage = p.stage;
  }
  // Body-language
  const info = moodAndSpeech(p);
  if (info.bodyClass !== lastBodyClass) {
    plantEl.classList.remove("plant--happy", "plant--thirsty", "plant--hot", "plant--droopy");
    plantEl.classList.add(info.bodyClass);
    lastBodyClass = info.bodyClass;
  }
  // Speech
  if (info.speech !== lastSpeech) { speechEl.textContent = info.speech; lastSpeech = info.speech; }
  speechEl.setAttribute("aria-hidden", "false");
  // Mood
  if (info.mood !== lastMood) { moodEl.textContent = info.mood; lastMood = info.mood; }
  // Strain info
  if (p.strainId !== lastStrainId) {
    const s = strainById(p.strainId);
    strainName.textContent = s.name;
    strainBadge.textContent = s.tier;
    lastStrainId = p.strainId;
  }
  // Lamp
  const on = p.lightOn;
  if (on !== lastLightOn) {
    $("#lamp").setAttribute("data-state", on ? "on" : "off");
    const lampBtn = $("#btnLight");
    if (lampBtn) lampBtn.classList.toggle("btn--lamp-on", on);
    $("#sky").style.background = on
      ? "linear-gradient(180deg, rgba(255,140,0,0.42) 0%, rgba(255,179,0,0.18) 55%, rgba(255,59,48,0.26) 100%)"
      : "linear-gradient(180deg, rgba(10,10,14,0.62) 0%, rgba(20,20,26,0.42) 100%)";
    lastLightOn = on;
  }
  // Streak badge
  const sb = $("#streakBadge");
  const streakVisible = p.streak >= 5;
  if (streakVisible) {
    if (sb.getAttribute("aria-hidden") !== "false") sb.setAttribute("aria-hidden", "false");
    const txt = "🔥 x" + p.streak;
    if (sb.textContent !== txt) sb.textContent = txt;
    sb.classList.toggle("streak--hot", p.streak >= 30);
    if (p.streak !== lastStreakShown) lastStreakShown = p.streak;
  } else if (sb.getAttribute("aria-hidden") !== "true") {
    sb.setAttribute("aria-hidden", "true");
  }
}

let _lastGrowthW = -1, _lastGrowthTxt = "", _lastEta = "";
function renderProgress() {
  const p = activePlant();
  const bar = $(".growth-progress__fill");
  const pct = $("#growthPct");
  const eta = $("#growthEta");
  if (!p) {
    if (_lastGrowthW !== 0) { bar.style.setProperty("--w", "0%"); _lastGrowthW = 0; }
    if (_lastGrowthTxt !== "0%") { tweenNum(pct, 0, (v) => Math.round(v) + "%"); _lastGrowthTxt = "0%"; }
    if (_lastEta !== "Посадите саженец") { eta.textContent = "Посадите саженец"; _lastEta = "Посадите саженец"; }
    return;
  }
  const w = Math.round(p.growth * 10) / 10;
  if (_lastGrowthW !== w) { bar.style.setProperty("--w", p.growth + "%"); _lastGrowthW = w; }
  const pctTxt = Math.round(p.growth) + "%";
  if (_lastGrowthTxt !== pctTxt) { tweenNum(pct, p.growth, (v) => Math.round(v) + "%"); _lastGrowthTxt = pctTxt; }
  let etaTxt;
  if (p.growth >= 100) etaTxt = "Готов!";
  else {
    const z = zoneFor(p.strainId);
    const inZone = (v) => v >= z.min && v <= z.max;
    const allGood = inZone(p.water) && inZone(p.food) && inZone(p.light);
    let rate = allGood ? CONFIG.rates.growth : CONFIG.rates.growthBad;
    if (state.upgrades.ledPro && p.lightOn) rate *= 1.5;
    if (allGood && p.streak >= 10) rate *= 1.4;
    const remaining = 100 - p.growth;
    const secs = rate > 0 ? Math.max(0, Math.round(remaining / rate)) : 0;
    etaTxt = secs > 0 ? `~${formatTime(secs)}` : "Сейчас…";
  }
  if (_lastEta !== etaTxt) { eta.textContent = etaTxt; _lastEta = etaTxt; }
}
function formatTime(s) {
  if (s < 60) return s + "с";
  return Math.floor(s / 60) + "м " + (s % 60) + "с";
}

let potsUIInit = false;
function renderPots() {
  const list = $("#potsList");
  if (!potsUIInit) {
    list.innerHTML = "";
    POTS.forEach((slot) => {
      const li = document.createElement("li");
      li.className = "pot";
      li.dataset.pot = slot.id;
      li.innerHTML = `<span class="pot__num">${slot.id + 1}</span><span class="pot__dot dot dot--green"></span><span class="pot__status">Свободен</span>`;
      li.addEventListener("click", () => {
        if (!state.potsOwned[slot.id]) { toast("Купи в магазине (ур." + slot.minLevel + ")", "bad"); return; }
        state.activePot = slot.id;
        render();
      });
      list.appendChild(li);
    });
    potsUIInit = true;
  }
  POTS.forEach((slot) => {
    const li = list.querySelector(`li[data-pot="${slot.id}"]`);
    if (!li) return;
    const owned = state.potsOwned[slot.id];
    li.classList.toggle("pot--active", state.activePot === slot.id);
    li.classList.toggle("pot--locked", !owned);

    const p = state.pots[slot.id];
    let dotClass = "dot--green";
    let statusText = owned ? "Свободен" : "🔒 ур." + slot.minLevel;
    if (p) {
      dotClass = p.health < 25 ? "dot--red" : "dot--gold";
      const s = strainById(p.strainId);
      statusText = Math.round(p.growth) + "% · " + s.name;
    }
    const dot = li.querySelector(".pot__dot");
    dot.classList.remove("dot--green", "dot--gold", "dot--red");
    dot.classList.add(dotClass);
    const status = li.querySelector(".pot__status");
    if (status.textContent !== statusText) status.textContent = statusText;
  });
}

function renderActionHints() {
  const p = activePlant();
  const wBtn = $("#btnWater"), fBtn = $("#btnFeed"), lBtn = $("#btnLight"), hBtn = $("#btnHarvest");
  const wantWater = !!p && p.water < 38;
  const wantFood = !!p && p.food < 38;
  const wantLight = !!p && !state.upgrades.autoLight && p.light < 38 && !p.lightOn;
  const wantHarvest = !!p && p.growth >= 100;
  wBtn.classList.toggle("btn--glow", wantWater);
  fBtn.classList.toggle("btn--glow", wantFood);
  lBtn.classList.toggle("btn--glow", wantLight);
  hBtn.classList.toggle("btn--pulse", wantHarvest);
}

function render() {
  renderHUD();
  renderPlant();
  renderPots();
  renderProgress();
  const p = activePlant();
  if (!p) {
    ["growth", "water", "food", "light", "health"].forEach(m => setMeter(m, 0));
  } else {
    setMeter("growth", p.growth);
    setMeter("water", p.water);
    setMeter("food", p.food);
    setMeter("light", p.light);
    setMeter("health", p.health);
  }
  renderActionHints();
}

/* ============================ SHOP ============================ */
const shopModal = $("#shopModal");
function openShop() { renderShop(); shopModal.setAttribute("aria-hidden", "false"); }
function closeShop() { shopModal.setAttribute("aria-hidden", "true"); }
function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u || state.upgrades[id]) return;
  if (state.money < u.price) { toast("Не хватает 🌶️ " + u.price, "bad"); return; }
  state.money -= u.price;
  state.upgrades[id] = true;
  toast("Куплено: " + u.name, "ach");
  beep(880, 80);
  renderShop(); render(); save();
}
function buyPot(id) {
  const slot = POTS.find(p => p.id === id);
  if (!slot || state.potsOwned[id]) return;
  if (state.level < slot.minLevel) { toast("Требуется ур." + slot.minLevel, "bad"); return; }
  if (state.money < slot.price) { toast("Не хватает 🌶️ " + slot.price, "bad"); return; }
  state.money -= slot.price;
  state.potsOwned[id] = true;
  toast("Открыт: " + slot.name, "ach");
  beep(990, 100);
  renderShop(); renderPots(); render(); save();
}

function renderShop() {
  const body = $("#shopBody");
  body.innerHTML = "";

  // Семена
  const sg = document.createElement("section");
  sg.className = "shop__group";
  sg.innerHTML = "<h4>🌶️ Саженцы</h4>";
  STRAINS.forEach(s => {
    const owned = hasOwned(s.id);
    const locked = state.level < s.minLevel;
    const btn = document.createElement("button");
    btn.className = "shop__item" + (locked ? " shop__item--locked" : "");
    btn.innerHTML = `
      <span class="shop__name">${s.name} ${locked ? "🔒" : ""}</span>
      <span class="shop__desc">${s.tier} · награда 🌶️${s.baseReward} · зона ${s.greenZone.min}-${s.greenZone.max}%${locked ? " · ур." + s.minLevel : ""}</span>
      <span class="shop__price">${owned ? "Посадить" : "🌶️ " + s.seedPrice}</span>`;
    if (!locked) btn.onclick = () => { plantSeed(s.id); closeShop(); };
    sg.appendChild(btn);
  });
  body.appendChild(sg);

  // Оборудование
  const eg = document.createElement("section");
  eg.className = "shop__group";
  eg.innerHTML = "<h4>⚙️ Модули</h4>";
  UPGRADES.forEach(u => {
    const owned = state.upgrades[u.id];
    const btn = document.createElement("button");
    btn.className = "shop__item" + (owned ? " shop__item--owned" : "");
    btn.innerHTML = `
      <span class="shop__name">${u.name}${owned ? " ✓" : ""}</span>
      <span class="shop__desc">${u.desc}</span>
      <span class="shop__price">${owned ? "Куплено" : "🌶️ " + u.price}</span>`;
    if (!owned) btn.onclick = () => buyUpgrade(u.id);
    eg.appendChild(btn);
  });
  body.appendChild(eg);

  // Горшки
  const pg = document.createElement("section");
  pg.className = "shop__group";
  pg.innerHTML = "<h4>Горшки</h4>";
  POTS.forEach(slot => {
    const owned = state.potsOwned[slot.id];
    const locked = state.level < slot.minLevel;
    const btn = document.createElement("button");
    btn.className = "shop__item" + (owned || locked ? " shop__item--locked" : "");
    btn.innerHTML = `
      <span class="shop__name">${slot.name} ${owned ? "✓" : locked ? "🔒" : ""}</span>
      <span class="shop__desc">${owned ? "Разблокирован" : locked ? "Требуется ур." + slot.minLevel : "Новый слот"}</span>
      <span class="shop__price">${owned ? "—" : "🌶️ " + slot.price}</span>`;
    if (!owned && !locked) btn.onclick = () => buyPot(slot.id);
    pg.appendChild(btn);
  });
  body.appendChild(pg);
}

/* ============================ STATS ============================ */
const statsModal = $("#statsModal");
function openStats() { renderStats(); statsModal.setAttribute("aria-hidden", "false"); }
function closeStats() { statsModal.setAttribute("aria-hidden", "true"); }
function renderStats() {
  const body = $("#statsBody");
  const s = state.stats;
  body.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-card__label">Урожаев</div><div class="stat-card__value">${s.harvests}</div></div>
      <div class="stat-card"><div class="stat-card__label">Всего заработано</div><div class="stat-card__value">🌶️${s.totalEarned}</div></div>
      <div class="stat-card"><div class="stat-card__label">Max streak</div><div class="stat-card__value">🔥${s.maxStreak}</div></div>
      <div class="stat-card"><div class="stat-card__label">Лучший результат</div><div class="stat-card__value">${s.bestHealth}%</div></div>
      <div class="stat-card"><div class="stat-card__label">Идеальных</div><div class="stat-card__value">${s.perfectCount}</div></div>
      <div class="stat-card"><div class="stat-card__label">Потерь</div><div class="stat-card__value">💀${s.deaths}</div></div>
    </div>
    <div class="achievements">
      <h4>🏅 Достижения</h4>
      ${ACHIEVEMENTS.map(a => `
        <div class="ach ${state.achievements[a.id] ? "ach--unlocked" : ""}">
          <span class="ach__icon">${a.icon}</span>
          <div><div class="ach__name">${a.name}</div><div class="ach__desc">${a.desc}</div></div>
        </div>`).join("")}
    </div>`;
}

/* ============================ ACHIEVEMENTS ============================ */
let checkCooldown = 0;
function maybeCheckAchievements() {
  if (Date.now() < checkCooldown) return;
  checkCooldown = Date.now() + 1500;
  checkAchievements();
}
function checkAchievements() {
  ACHIEVEMENTS.forEach(a => {
    if (state.achievements[a.id]) return;
    if (a.check(state)) {
      state.achievements[a.id] = true;
      toast(`🏅 Достижение: ${a.name}`, "ach");
      SFX.ach();
    }
  });
}

/* ============================ EVENTS (DOM) ============================ */
$("#btnIntro")?.addEventListener("click", hideIntro);
$("#btnShop")?.addEventListener("click", openShop);
$("#btnStats")?.addEventListener("click", openStats);
$("#btnMute")?.addEventListener("click", () => { state.muted = !state.muted; renderHUD(); });
$("#btnReset")?.addEventListener("click", hardReset);
$$("[data-close]").forEach(b => b.addEventListener("click", () => {
  closeShop(); closeStats(); closeHarvestModal();
}));
$("#btnHarvestReplant")?.addEventListener("click", plantSameStrain);
$("#btnHarvestShop")?.addEventListener("click", harvestGoShop);
$("#btnWater")?.addEventListener("click", doWater);
$("#btnFeed")?.addEventListener("click", doFeed);
$("#btnLight")?.addEventListener("click", doLight);
$("#btnHarvest")?.addEventListener("click", doHarvest);
$("#eventAction")?.addEventListener("click", eventAction);

// Клик по культуре — бодрит (мелкий feedback)
$("#growbox")?.addEventListener("click", (e) => {
  if (e.target.closest("button")) return;
  spawnFx(["✨"]);
  beep(740, 60, "sine", 0.04);
});

/* ============================ BOOT ============================ */
function ensureFirstPlant() {
  // При загрузке старого/нового save: если горшок 1 свободен и Owned — авто-сажаем стартовый сорт
  if (state.potsOwned[0] && !state.pots[0]) state.pots[0] = makePlant("star1");
}
function startGame() {
  ensureFirstPlant();
  pickNextEvent();
}
if (!load()) startGame();
else {
  ensureFirstPlant();
  pickNextEvent();
}
if (state.introDone) $("#intro").setAttribute("aria-hidden", "true");
else showIntro();
render();
setInterval(loop, CONFIG.tickMs);
setInterval(save, CONFIG.saveMs);
window.addEventListener("beforeunload", save);
window.state = state;
window.dev = {
  money: (n) => { state.money = n; render(); },
  level: (n) => { state.level = n; render(); },
  kill:  ()  => { const p = activePlant(); if (p) { p.health = 1; } },
  event: ()  => { nextEventAt = 0; },
  clearSave: () => { localStorage.removeItem(CONFIG.storageKey); location.reload(); },
};