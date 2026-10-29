'use strict';

// ===== 定義 =====

const STORAGE_KEY = 'dmu-p4-assistant-v2';
const LANG_KEY = 'dmu-p4-assistant-lang';
const EXEC_SCREEN = 4;

// ===== 表示する文言（日本語／英語） =====
// 英語は TRANSLATION.md の対訳表（WTFDIG!? の表記を参考）に合わせる

const TEXT = {
  ja: {
    pageTitle: '絶妖星乱舞 P4 アシスタント',
    siteSub: 'ヤーン式',
    metaDesc: 'FF14 絶妖星乱舞 P4（ヤーン式）の暗記入力と発動タイムライン表示ツール',
    steps: ['GC①', 'ほ・つ①', 'GC②', 'ほ・つ②', '発動'],
    gc1Title: 'グランドクロス（1回目）',
    gc2Title: 'グランドクロス（2回目）',
    elem1Title: 'ほのお／つなみ（1回目）',
    elem2Title: 'ほのお／つなみ（2回目）',
    real: '真', fake: '偽',
    water: '水', thunder: '雷',
    early: '早', late: '遅',
    accel: '加速度',
    fireBtn: 'ほのお', tsunamiBtn: 'つなみ',
    next: '次へ →', back: '← 戻る', reset: 'リセット', resetConfirm: 'もう一度押すとリセット',
    lblWT: '水雷', lblGaze: '視線', lblFire: 'ほのお', lblTsunami: 'つなみ',
    stack: '頭割り', spread: '散開',
    stop: '止まる', move: '動く',
    lookAway: '見ない', lookAt: '見る',
    avoid: '踏まない', soak: '踏む',
    out: '外へ', outSub: '（タケノコ）',
    stay: '中のまま', staySub: '（ドーナツ）',
    moAvoid: '踏まない', moBoth: '両方踏む', moThunder: '⚡踏む', moIce: '⛄踏む',
  },
  en: {
    pageTitle: 'DMU P4 Assistant',
    siteSub: '',
    metaDesc: 'FFXIV Dancing Mad (Ultimate) P4 helper: memorize the debuffs, then follow the resolve timeline',
    steps: ['NEX 1', 'Chaos 1', 'NEX 2', 'Chaos 2', 'Resolve'],
    gc1Title: 'Neo Exdeath #1',
    gc2Title: 'Neo Exdeath #2',
    elem1Title: 'Chaos #1',
    elem2Title: 'Chaos #2',
    real: 'Real', fake: 'Fake',
    water: 'Water', thunder: 'Lightning',
    early: 'Short', late: 'Long',
    accel: 'Accel Bomb',
    fireBtn: 'Fire', tsunamiBtn: 'Water',
    next: 'Next →', back: '← Back', reset: 'Reset', resetConfirm: 'Tap again to reset',
    lblWT: 'W/L', lblGaze: 'Gaze', lblFire: 'Inferno', lblTsunami: 'Tsunami',
    stack: 'Stack', spread: 'Spread',
    stop: 'Stillness', move: 'Motion',
    lookAway: 'Look away', lookAt: 'Look at',
    avoid: 'Avoid', soak: 'Soak',
    out: 'Out', outSub: '(AOE)',
    stay: 'Stay in', staySub: '(Donut)',
    moAvoid: 'Avoid both', moBoth: 'Soak both', moThunder: 'Soak ⚡', moIce: 'Soak ⛄',
  },
};

// 最初はブラウザの言語設定に合わせる。切り替えたら覚えておく
function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'ja' || saved === 'en') return saved;
  } catch (e) { /* 読めなければブラウザの設定で決める */ }
  return (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

let lang = detectLang();
const t = (key) => TEXT[lang][key];

// ===== 判定 =====

// 水：真→頭割り／偽→散開　雷：真→散開／偽→頭割り
function judgeWT(kind, truth) {
  const stack = kind === 'water' ? truth : !truth;
  return stack ? t('stack') : t('spread');
}

const judgeAccel = (truth) => (truth ? t('stop') : t('move'));
const judgeGaze = (truth) => (truth ? t('lookAway') : t('lookAt'));
const judgeStep = (truth) => (truth ? t('avoid') : t('soak'));

// ほのお：真→タケノコ／偽→ドーナツ　つなみ：真→ドーナツ／偽→タケノコ
function judgeElem(type, truth) {
  const spike = type === 'fire' ? truth : !truth;
  return spike ? { main: t('out'), sub: t('outSub') } : { main: t('stay'), sub: t('staySub') };
}

// マジックアウト：前回と真偽が違うほうを踏む
function judgeMagicOut(thunderPrev, thunderNow, icePrev, iceNow) {
  const thunder = thunderPrev !== thunderNow;
  const ice = icePrev !== iceNow;
  if (thunder && ice) return t('moBoth');
  if (thunder) return t('moThunder');
  if (ice) return t('moIce');
  return t('moAvoid');
}

// ===== 状態 =====

function initialState() {
  return {
    screen: 0,
    // wt: 'water' | 'thunder' | null（水雷も加速度も選ばなければ「なし」）
    gc1: { truth: null, wt: null, accel: false, timing: null },
    elem1: { truth: null, type: null },
    gc2: { truth: null, wt: null, timing: null },
    elem2: { truth: null },
    exec: { thunder: null, ice: null, moThunder: null, moIce: null },
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved.screen === 'number') return { ...initialState(), ...saved };
  } catch (e) { /* 読めなければ初期状態 */ }
  return initialState();
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 保存できなくても動作は継続 */ }
}

let state = load();

// GC①で水雷が付かなかった人だけ、GC②で水雷を選ぶ
const gc2NeedsWT = () => !state.gc1.wt;

// 加速度はGC①かGC②のどちらか一方
const gc2HasAccel = () => !state.gc1.accel;

const elem2Type = () => (state.elem1.type === 'fire' ? 'tsunami' : 'fire');

function isComplete(screen) {
  const { gc1, elem1, gc2, elem2 } = state;
  switch (screen) {
    // 真偽を選べば進める。水か雷を選んだときは早遅も必須
    case 0: return gc1.truth !== null && (!gc1.wt || gc1.timing !== null);
    case 1: return elem1.truth !== null && elem1.type !== null;
    case 2: return gc2.truth !== null && (!gc2NeedsWT() || !gc2.wt || gc2.timing !== null);
    case 3: return elem2.truth !== null;
    default: return true;
  }
}

// 指定タイミング（早/遅）で処理する水雷
function wtAt(timing) {
  if (state.gc1.wt && state.gc1.timing === timing) {
    return { kind: state.gc1.wt, truth: state.gc1.truth };
  }
  if (gc2NeedsWT() && state.gc2.wt && state.gc2.timing === timing) {
    return { kind: state.gc2.wt, truth: state.gc2.truth };
  }
  return null;
}

function accelSource() {
  return state.gc1.accel ? { truth: state.gc1.truth } : { truth: state.gc2.truth };
}

// ===== 操作 =====

let resetArmedUntil = 0;

function setValue(path, raw) {
  const value = raw === 'true' ? true : raw === 'false' ? false : raw;
  const [group, key] = path.split('.');
  // GC②の水雷は、選択中のボタンをもう一度押すと解除できる
  if (path === 'gc2.wt' && state.gc2.wt === value) {
    state.gc2.wt = null;
    state.gc2.timing = null;
  } else {
    state[group][key] = value;
  }
  // 画面は自動では進めない（すべて「次へ」で進む）
  save();
  render();
}

// 水と雷はどちらか一方、加速度は水雷と併用可。もう一度押すと解除
function toggleGC1(item) {
  const gc1 = state.gc1;
  if (item === 'accel') gc1.accel = !gc1.accel;
  else gc1.wt = gc1.wt === item ? null : item;
  if (!gc1.wt) gc1.timing = null;
  if (gc1.wt) { state.gc2.wt = null; state.gc2.timing = null; }
  save();
  render();
}

function setLang(next) {
  if (next !== 'ja' && next !== 'en') return;
  lang = next;
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* 保存できなくても切り替えは行う */ }
  render();
}

function goTo(screen) {
  state.screen = Math.max(0, Math.min(EXEC_SCREEN, screen));
  save();
  render();
  window.scrollTo(0, 0);
}

function reset(button) {
  // 誤タップ防止のため2回押しでリセット
  if (Date.now() > resetArmedUntil) {
    resetArmedUntil = Date.now() + 2000;
    button.classList.add('armed');
    button.textContent = t('resetConfirm');
    setTimeout(() => {
      if (Date.now() >= resetArmedUntil) render();
    }, 2050);
    return;
  }
  resetArmedUntil = 0;
  state = initialState();
  goTo(0);
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.set) setValue(btn.dataset.set, btn.dataset.value);
  else if (btn.dataset.action === 'gc1') toggleGC1(btn.dataset.value);
  else if (btn.dataset.action === 'next') { if (isComplete(state.screen)) goTo(state.screen + 1); }
  else if (btn.dataset.action === 'back') goTo(state.screen - 1);
  else if (btn.dataset.action === 'reset') reset(btn);
  else if (btn.dataset.action === 'lang') setLang(btn.dataset.value);
});

// ===== 描画 =====

const app = document.getElementById('app');
const stepsEl = document.getElementById('steps');
const navArea = document.getElementById('nav-area');

// off：表示はするが押せない状態にする
function choice(path, value, label, color, sub, off = false) {
  const [group, key] = path.split('.');
  const current = state[group][key];
  const selected = String(current) === String(value);
  return `<button type="button" class="btn c-${color}${selected ? ' sel' : ''}${off ? ' off' : ''}" data-set="${path}" data-value="${value}" aria-pressed="${selected}"${off ? ' disabled' : ''}>${label}${sub ? `<small>${sub}</small>` : ''}</button>`;
}

const truthChoices = (path) =>
  `<div class="choices seg divided">${choice(path, true, t('real'), 'true')}${choice(path, false, t('fake'), 'false')}</div>`;

const group = (label, body) =>
  `<div class="group">${label ? `<div class="group-label">${label}</div>` : ''}${body}</div>`;

// earlySec / lateSec：デバフアイコンに表示される秒数（GC①は 50／1m、GC②は 35／59）
// enabled：水か雷を選ぶまでは、表示だけして押せない状態にする
const timingChoices = (path, earlySec, lateSec, enabled) =>
  `<div class="choices seg divided">${choice(path, 'early', t('early'), 'plain', earlySec, !enabled)}${choice(path, 'late', t('late'), 'plain', lateSec, !enabled)}</div>`;

function navButtons() {
  const back = state.screen > 0
    ? `<button type="button" class="btn" data-action="back">${t('back')}</button>`
    : '';
  return `<div class="nav">${back}<button type="button" class="btn danger" data-action="reset">${t('reset')}</button></div>`;
}

// 水・雷のボタン（アイコン＋文字）。選択は灰色の濃淡で表す
function wtButton(kind, current, attrs) {
  const selected = current === kind;
  return `<button type="button" class="btn wt-btn${selected ? ' sel' : ''}" ${attrs} data-value="${kind}" aria-pressed="${selected}"><img class="wt-icon" src="${ICONS[kind]}" alt=""><span>${t(kind)}</span></button>`;
}

function gc1Toggle(item, label, color, selected) {
  return `<button type="button" class="btn c-${color}${selected ? ' sel' : ''}" data-action="gc1" data-value="${item}" aria-pressed="${selected}">${label}</button>`;
}

function renderGC1() {
  const { wt, accel } = state.gc1;
  return `
    <h2 class="screen-title">${t('gc1Title')}</h2>
    ${group('', truthChoices('gc1.truth'))}
    ${group('', `<div class="choices seg divided">
      ${wtButton('water', wt, 'data-action="gc1"')}
      ${wtButton('thunder', wt, 'data-action="gc1"')}
    </div>${timingChoices('gc1.timing', '50', '1m', !!wt)}`)}
    ${group('', `<div class="choices cols-1">${gc1Toggle('accel', t('accel'), 'accel', accel)}</div>`)}
    ${nextButton()}
  `;
}

// 自動で決まる項目を、押せない選択済みボタンとして表示する
function fixedButton(label, color) {
  return `<div class="choices cols-1"><button type="button" class="btn c-${color} fixed sel" disabled>${label}</button></div>`;
}

function nextButton() {
  return `<button type="button" class="btn next" data-action="next"${isComplete(state.screen) ? '' : ' disabled'}>${t('next')}</button>`;
}

function renderElem1() {
  return `
    <h2 class="screen-title">${t('elem1Title')}</h2>
    ${group('', truthChoices('elem1.truth'))}
    ${group('', `<div class="choices seg">${choice('elem1.type', 'fire', t('fireBtn'), 'fire')}${choice('elem1.type', 'tsunami', t('tsunamiBtn'), 'tsunami')}</div>`)}
    ${nextButton()}
  `;
}

function renderGC2() {
  const needsWT = gc2NeedsWT();
  const hasAccel = gc2HasAccel();
  // 加速度はGC①から決まるので、押せない選択済みボタンで表示する
  return `
    <h2 class="screen-title">${t('gc2Title')}</h2>
    ${group('', truthChoices('gc2.truth'))}
    ${needsWT ? group('', `<div class="choices seg divided">${wtButton('water', state.gc2.wt, 'data-set="gc2.wt"')}${wtButton('thunder', state.gc2.wt, 'data-set="gc2.wt"')}</div>${timingChoices('gc2.timing', '35', '59', !!state.gc2.wt)}`) : ''}
    ${hasAccel ? group('', fixedButton(t('accel'), 'accel')) : ''}
    ${nextButton()}
  `;
}

function renderElem2() {
  const type = elem2Type();
  return `
    <h2 class="screen-title">${t('elem2Title')}</h2>
    ${group('', truthChoices('elem2.truth'))}
    ${group('', fixedButton(t(type === 'fire' ? 'fireBtn' : 'tsunamiBtn'), type))}
    ${nextButton()}
  `;
}

// --- 発動画面 ---

const label = (text, cls) => `<span class="row-label${cls ? ` k-${cls}` : ''}">${text}</span>`;

function elemText(type, truth) {
  const r = judgeElem(type, truth);
  return `${r.main}<span class="sub">${r.sub}</span>`;
}

// 結果を「＋」でつないで1行に並べる（未確定の項目は出さない。折り返しは項目の間だけ）
function resultLine(lbl, parts) {
  const text = parts.filter(Boolean).map((p) => `<span class="part">${p}</span>`).join('<span class="plus">＋</span>');
  return `<div class="line">${lbl}<div class="result">${text}</div></div>`;
}

// trueLabel / falseLabel：ボタンの表示名（②④は「踏まない／踏む」、⑤は「真／偽」）
function inputLine(lbl, path, trueLabel = t('real'), falseLabel = t('fake')) {
  return `<div class="line input-line">${lbl}<div class="mini seg divided">${choice(path, true, trueLabel, 'true')}${choice(path, false, falseLabel, 'false')}</div></div>`;
}

// tint：背景に色を付ける場合の種類（'fire' | 'tsunami'）
function event(no, lines, tint) {
  return `<section class="ev${tint ? ` ev-${tint}` : ''}"><span class="ev-no">${no}</span><div class="ev-lines">${lines}</div></section>`;
}

const stepText = (value) => (value === null ? '' : judgeStep(value));

// 加速度は目立たせる（止まる＝赤文字、動く＝緑文字）
const accelText = (truth) =>
  `<span class="${truth ? 'accel-stop' : 'accel-move'}">${judgeAccel(truth)}</span>`;

// 水雷＋加速度（ラベルはデバフに関係なく「水雷」。水雷が付いていなければ頭割り）
function wtAccelParts(timing) {
  const wt = wtAt(timing);
  return {
    lbl: label(t('lblWT')),
    parts: [wt ? judgeWT(wt.kind, wt.truth) : t('stack'), accelText(accelSource().truth)],
  };
}

function magicOutText() {
  const { thunder, ice, moThunder, moIce } = state.exec;
  if ([thunder, ice, moThunder, moIce].includes(null)) return '';
  return judgeMagicOut(thunder, moThunder, ice, moIce);
}

function renderExec() {
  const { gc1, gc2, elem1, elem2, exec } = state;
  // 暗記した順番に関わらず、発動はほのおが先・つなみが後
  const fireTruth = elem1.type === 'fire' ? elem1.truth : elem2.truth;
  const tsunamiTruth = elem1.type === 'tsunami' ? elem1.truth : elem2.truth;
  const early = wtAccelParts('early');
  const late = wtAccelParts('late');

  return `
    <div class="timeline">
      ${event(1, resultLine(early.lbl, early.parts))}
      ${event(2, resultLine(label(t('lblGaze')), [judgeGaze(gc1.truth), stepText(exec.thunder)]) +
        inputLine(label('⚡', 'emoji'), 'exec.thunder', t('avoid'), t('soak')))}
      ${event(3, resultLine(label(t('lblFire')), [elemText('fire', fireTruth)]), 'fire')}
      ${event(4, resultLine(late.lbl, [...late.parts, stepText(exec.ice)]) +
        inputLine(label('⛄', 'emoji'), 'exec.ice', t('avoid'), t('soak')))}
      ${event(5, resultLine(label(t('lblGaze')), [judgeGaze(gc2.truth)]) +
        inputLine(label('⚡', 'emoji'), 'exec.moThunder') +
        inputLine(label('⛄', 'emoji'), 'exec.moIce'))}
      ${event(6, resultLine(label(t('lblTsunami')), [elemText('tsunami', tsunamiTruth), magicOutText()]), 'tsunami')}
    </div>
  `;
}

// 画面の外枠（タイトル・ページ情報・言語切り替え）を今の言語で描き直す
function renderChrome() {
  document.documentElement.lang = lang;
  document.title = t('pageTitle');
  document.querySelector('meta[name="description"]').setAttribute('content', t('metaDesc'));
  document.getElementById('site-title').textContent = t('pageTitle');
  const sub = document.getElementById('site-sub');
  sub.textContent = t('siteSub');
  sub.hidden = !t('siteSub');
  document.getElementById('lang-switch').innerHTML = [['ja', '日本語'], ['en', 'English']]
    .map(([code, name]) => `<button type="button" class="btn${lang === code ? ' sel' : ''}" data-action="lang" data-value="${code}" aria-pressed="${lang === code}">${name}</button>`)
    .join('');
}

function renderSteps() {
  stepsEl.innerHTML = t('steps').map((label, i) => {
    const cls = i === state.screen ? 'current' : i < state.screen ? 'done' : '';
    return `<span class="step ${cls}">${label}</span>`;
  }).join('');
}

function render() {
  // 途中の画面が未入力のまま先に進んでいる場合は、未入力の画面に戻す
  for (let i = 0; i < state.screen; i++) {
    if (!isComplete(i)) { state.screen = i; break; }
  }
  const screens = [renderGC1, renderElem1, renderGC2, renderElem2, renderExec];
  renderChrome();
  renderSteps();
  app.innerHTML = screens[state.screen]();
  app.classList.toggle('input-screen', state.screen !== EXEC_SCREEN);
  // 戻る・リセットは、下部フローの下に置く
  navArea.innerHTML = navButtons();
}

// ===== アイコン画像 =====

// 水・雷のデバフアイコン（20260808_JS_FFXIV_DMU-P4-helper から流用。作者本人の画像）
const ICONS = {
  water: 'data:image/png;base64,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',
  thunder: 'data:image/png;base64,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',
};

render();
