'use strict';

// ===== 定義 =====

const STORAGE_KEY = 'dmu-p4-assistant-v2';
const SCREEN_LABELS = ['GC①', 'ほ・つ①', 'GC②', 'ほ・つ②', '発動'];
const LAST_INPUT_SCREEN = 3;
const EXEC_SCREEN = 4;

const WT_NAME = { water: '水', thunder: '雷' };
const ELEM_NAME = { fire: 'ほのお', tsunami: 'つなみ' };

// ===== 判定 =====

// 水：真→頭割り／偽→散開　雷：真→散開／偽→頭割り
function judgeWT(kind, truth) {
  const stack = kind === 'water' ? truth : !truth;
  return stack ? '頭割り' : '散開';
}

const judgeAccel = (truth) => (truth ? '止まる' : '動く');
const judgeGaze = (truth) => (truth ? '見ない' : '見る');
const judgeStep = (truth) => (truth ? '踏まない' : '踏む');

// ほのお：真→タケノコ／偽→ドーナツ　つなみ：真→ドーナツ／偽→タケノコ
function judgeElem(type, truth) {
  const spike = type === 'fire' ? truth : !truth;
  return spike ? { main: '外へ', sub: 'タケノコ' } : { main: '中のまま', sub: 'ドーナツ' };
}

// マジックアウト：前回と真偽が違うほうを踏む
function judgeMagicOut(thunderPrev, thunderNow, icePrev, iceNow) {
  const thunder = thunderPrev !== thunderNow;
  const ice = icePrev !== iceNow;
  if (thunder && ice) return '両方踏む';
  if (thunder) return '雷踏む';
  if (ice) return '氷踏む';
  return '踏まない';
}

// ===== 状態 =====

function initialState() {
  return {
    screen: 0,
    // wt: 'water' | 'thunder' | null、none: 「なし」を選んだか
    gc1: { truth: null, wt: null, accel: false, none: false, timing: null },
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

// GC①のデバフ（未選択なら null）
function gc1Option() {
  const { wt, accel, none } = state.gc1;
  if (!wt && !accel && !none) return null;
  return { wt, accel };
}

// GC①で水雷が付かなかった人だけ、GC②で水雷を選ぶ
function gc2NeedsWT() {
  const o = gc1Option();
  return !!o && !o.wt;
}

// 加速度はGC①かGC②のどちらか一方
function gc2HasAccel() {
  const o = gc1Option();
  return !!o && !o.accel;
}

const elem2Type = () => (state.elem1.type === 'fire' ? 'tsunami' : 'fire');

function isComplete(screen) {
  const { gc1, elem1, gc2, elem2 } = state;
  switch (screen) {
    case 0: {
      const o = gc1Option();
      return gc1.truth !== null && !!o && (!o.wt || gc1.timing !== null);
    }
    case 1: return elem1.truth !== null && elem1.type !== null;
    case 2: return gc2.truth !== null && (!gc2NeedsWT() || (gc2.wt !== null && gc2.timing !== null));
    case 3: return elem2.truth !== null;
    default: return true;
  }
}

// 指定タイミング（早/遅）で処理する水雷
function wtAt(timing) {
  const o = gc1Option();
  if (o && o.wt && state.gc1.timing === timing) {
    return { kind: o.wt, truth: state.gc1.truth };
  }
  if (gc2NeedsWT() && state.gc2.wt && state.gc2.timing === timing) {
    return { kind: state.gc2.wt, truth: state.gc2.truth };
  }
  return null;
}

function accelSource() {
  const o = gc1Option();
  if (!o) return null;
  return o.accel ? { truth: state.gc1.truth } : { truth: state.gc2.truth };
}

// ===== 操作 =====

let advanceTimer = null;
let resetArmedUntil = 0;

function setValue(path, raw) {
  const value = raw === 'true' ? true : raw === 'false' ? false : raw;
  const [group, key] = path.split('.');
  const wasComplete = isComplete(state.screen);
  state[group][key] = value;
  save();
  render();

  // このタップで入力がそろったときだけ自動で進む（戻って直す場合は「次へ」で進む）
  // ①は加速度を後から足せるので自動では進まない
  clearTimeout(advanceTimer);
  if (state.screen > 0 && state.screen <= LAST_INPUT_SCREEN && !wasComplete && isComplete(state.screen)) {
    advanceTimer = setTimeout(() => goTo(state.screen + 1), 180);
  }
}

// 水と雷はどちらか一方、加速度は水雷と併用可、なしは他を全解除
function toggleGC1(item) {
  const gc1 = state.gc1;
  if (item === 'none') {
    gc1.none = !gc1.none;
    if (gc1.none) { gc1.wt = null; gc1.accel = false; }
  } else {
    gc1.none = false;
    if (item === 'accel') gc1.accel = !gc1.accel;
    else gc1.wt = gc1.wt === item ? null : item;
  }
  if (!gc1.wt) gc1.timing = null;
  if (gc1.wt) { state.gc2.wt = null; state.gc2.timing = null; }
  save();
  render();
}

function goTo(screen) {
  clearTimeout(advanceTimer);
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
    button.textContent = 'もう一度押すとリセット';
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
});

// ===== 描画 =====

const app = document.getElementById('app');
const stepsEl = document.getElementById('steps');

function choice(path, value, label, color, sub) {
  const [group, key] = path.split('.');
  const current = state[group][key];
  const selected = String(current) === String(value);
  return `<button type="button" class="btn c-${color}${selected ? ' sel' : ''}" data-set="${path}" data-value="${value}" aria-pressed="${selected}">${label}${sub ? `<small>${sub}</small>` : ''}</button>`;
}

const truthChoices = (path) =>
  `<div class="choices">${choice(path, true, '真', 'true')}${choice(path, false, '偽', 'false')}</div>`;

const group = (label, body) =>
  `<div class="group"><div class="group-label">${label}</div>${body}</div>`;

const timingChoices = (path) =>
  `<div class="choices">${choice(path, 'early', '早', 'plain', '50')}${choice(path, 'late', '遅', 'plain', '1m')}</div>`;

function navButtons() {
  const back = state.screen > 0
    ? '<button type="button" class="btn" data-action="back">← 戻る</button>'
    : '';
  return `<div class="nav">${back}<button type="button" class="btn danger" data-action="reset">リセット</button></div>`;
}

function gc1Toggle(item, label, color, selected) {
  return `<button type="button" class="btn c-${color}${selected ? ' sel' : ''}" data-action="gc1" data-value="${item}" aria-pressed="${selected}">${label}</button>`;
}

function renderGC1() {
  const { wt, accel, none } = state.gc1;
  return `
    <h2 class="screen-title">GC①（グランドクロス1回目）</h2>
    <p class="screen-note">真偽と、自分に付いたデバフを選んで「次へ」。水か雷と加速度は両方選べます。</p>
    ${group('真偽', truthChoices('gc1.truth'))}
    ${group('自分のデバフ', `<div class="choices">
      ${gc1Toggle('water', '水', 'water', wt === 'water')}
      ${gc1Toggle('thunder', '雷', 'thunder', wt === 'thunder')}
      ${gc1Toggle('accel', '加速度', 'accel', accel)}
      ${gc1Toggle('none', 'なし', 'plain', none)}
    </div>`)}
    ${wt ? group(`${WT_NAME[wt]}の早遅`, timingChoices('gc1.timing')) : ''}
    ${nextButton()}
  `;
}

// 自動で決まる項目を、押せない選択済みボタンとして表示する
function fixedButton(label, color) {
  return `<div class="choices cols-1"><button type="button" class="btn c-${color} fixed sel" disabled>${label}</button></div>`;
}

function nextButton() {
  return `<button type="button" class="btn next" data-action="next"${isComplete(state.screen) ? '' : ' disabled'}>次へ →</button>`;
}

function renderElem1() {
  return `
    <h2 class="screen-title">ほのお／つなみ①</h2>
    <p class="screen-note">種類と真偽を選んでください。</p>
    ${group('真偽', truthChoices('elem1.truth'))}
    ${group('種類', `<div class="choices">${choice('elem1.type', 'fire', 'ほのお', 'fire')}${choice('elem1.type', 'tsunami', 'つなみ', 'tsunami')}</div>`)}
    ${nextButton()}
  `;
}

function renderGC2() {
  const needsWT = gc2NeedsWT();
  const hasAccel = gc2HasAccel();
  // 加速度・なしはGC①から決まるので、押せない選択済みボタンで表示する
  const debuffs = [
    needsWT ? `<div class="choices">${choice('gc2.wt', 'water', '水', 'water')}${choice('gc2.wt', 'thunder', '雷', 'thunder')}</div>` : '',
    hasAccel ? fixedButton('加速度', 'accel') : '',
    !needsWT && !hasAccel ? fixedButton('なし', 'plain') : '',
  ].join('');

  return `
    <h2 class="screen-title">GC②（グランドクロス2回目）</h2>
    ${group('真偽', truthChoices('gc2.truth'))}
    ${group('自分のデバフ', debuffs)}
    ${needsWT && state.gc2.wt ? group(`${WT_NAME[state.gc2.wt]}の早遅`, timingChoices('gc2.timing')) : ''}
    ${nextButton()}
  `;
}

function renderElem2() {
  const type = elem2Type();
  return `
    <h2 class="screen-title">ほのお／つなみ②</h2>
    ${group('真偽', truthChoices('elem2.truth'))}
    ${group('種類', fixedButton(ELEM_NAME[type], type))}
    ${nextButton()}
  `;
}

// --- 発動画面 ---

const EVENT_NO = ['①', '②', '③', '④', '⑤', '⑥'];

const label = (text, cls) => `<span class="row-label${cls ? ` k-${cls}` : ''}">${text}</span>`;

function elemText(type, truth) {
  const r = judgeElem(type, truth);
  return `${r.main}<span class="sub">（${r.sub}）</span>`;
}

// 結果を「＋」でつないで1行に並べる（未確定の項目は出さない。折り返しは項目の間だけ）
function resultLine(lbl, parts) {
  const text = parts.filter(Boolean).map((p) => `<span class="part">${p}</span>`).join('<span class="plus">＋</span>');
  return `<div class="line">${lbl}<div class="result">${text}</div></div>`;
}

function inputLine(lbl, path) {
  return `<div class="line">${lbl}<div class="mini">${choice(path, true, '真', 'true')}${choice(path, false, '偽', 'false')}</div></div>`;
}

function event(no, lines) {
  return `<section class="ev"><span class="ev-no">${EVENT_NO[no - 1]}</span><div class="ev-lines">${lines}</div></section>`;
}

const stepText = (value) => (value === null ? '' : judgeStep(value));

// 水雷＋加速度（水雷が付いていなければ頭割り）
function wtAccelParts(timing) {
  const wt = wtAt(timing);
  return {
    lbl: wt ? label(WT_NAME[wt.kind], wt.kind) : label('水雷'),
    parts: [wt ? judgeWT(wt.kind, wt.truth) : '頭割り', judgeAccel(accelSource().truth)],
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
      ${event(2, resultLine(label('視線'), [judgeGaze(gc1.truth), stepText(exec.thunder)]) +
        inputLine(label('雷', 'thunder'), 'exec.thunder'))}
      ${event(3, resultLine(label(ELEM_NAME.fire, 'fire'), [elemText('fire', fireTruth)]))}
      ${event(4, resultLine(late.lbl, [...late.parts, stepText(exec.ice)]) +
        inputLine(label('氷', 'ice'), 'exec.ice'))}
      ${event(5, resultLine(label('視線'), [judgeGaze(gc2.truth)]) +
        inputLine(label('雷', 'thunder'), 'exec.moThunder') +
        inputLine(label('氷', 'ice'), 'exec.moIce'))}
      ${event(6, resultLine(label(ELEM_NAME.tsunami, 'tsunami'), [elemText('tsunami', tsunamiTruth), magicOutText()]))}
    </div>
  `;
}

function renderSteps() {
  stepsEl.innerHTML = SCREEN_LABELS.map((label, i) => {
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
  renderSteps();
  app.innerHTML = screens[state.screen]() + navButtons();
}

render();
