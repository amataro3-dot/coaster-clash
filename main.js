// COASTER CLASH 試作 v=1(練習モード: コンピューターと対戦)
// ルール: muddys-notes の coaster-clash_spec.md(2026-11-21 のルール)
'use strict';

// ---------- 点数カード ----------
const CARD = {
  1: 'お水', 2: 'ウーロン茶', 3: 'コーラ', 4: 'ビール', 5: 'レモンサワー',
  6: 'ハイボール', 7: 'マティーニ', 8: '赤ワイン', 9: 'ウイスキー', 10: 'シャンパン',
  '-3': 'こぼれたビール', '-5': 'からっぽの財布', '-7': 'お会計', '-10': '二日酔いでダウン',
};
const cardImg = v => `cards/card_${v > 0 ? 'plus' + v : 'minus' + (-v)}.webp?v=1`;
const pcHtml = (v, cls = '') => `<span class="pc ${cls}" style="background-image:url('${cardImg(v)}')" title="${fmt(v)} ${CARD[v]}"></span>`;
const fmt = v => (v > 0 ? '+' : '−') + Math.abs(v);

// ---------- コースターの絵(デザインは coaster-clash_coaster.html と同じ) ----------
function guitar(c) {
  return `<g transform="rotate(35 50 50) translate(50 50) scale(.78) translate(-50 -43)" fill="${c}">
<rect x="47" y="8" width="6" height="46" rx="1.5"/><path d="M45 2h10l1 9H44z"/>
<circle cx="44" cy="4" r="1.6"/><circle cx="44" cy="8" r="1.6"/><circle cx="56" cy="4" r="1.6"/><circle cx="56" cy="8" r="1.6"/>
<path d="M50 48c-9 0-13 5-12 11 1 4 3 5 1 9-3 6 0 16 11 16s14-10 11-16c-2-4 0-5 1-9 1-6-3-11-12-11z"/></g>`;
}
const STAR = 'M50.0 14.0 L59.1 39.5 L86.1 40.3 L64.7 56.8 L72.3 82.7 L50.0 67.5 L27.7 82.7 L35.3 56.8 L13.9 40.3 L40.9 39.5 Z';
function coaster(n) { // n = null で裏
  const z = n === 0;
  const bg = z ? '#151515' : '#1d6a3c', ring = z ? '#c9a04a' : '#fbefd6', g = z ? '#4a3e2a' : '#124a29', num = z ? '#ffd877' : '#fff6e2';
  const txt = n === null ? '' :
    `<text x="50" y="${n > 9 ? 62 : 64}" text-anchor="middle" font-family="Noto Sans CJK JP,Hiragino Sans,sans-serif" font-weight="900" font-size="${n > 9 ? 34 : 40}" fill="${num}" ${z ? 'style="filter:drop-shadow(0 0 3px #ffb84d)"' : ''} stroke="${z ? bg : '#111'}" stroke-width="${z ? 5 : 7}" stroke-linejoin="round" paint-order="stroke">${n}</text>`;
  return `<div class="co${z ? ' zero' : ''}" data-n="${n}"><svg viewBox="0 0 100 100">
<circle cx="50" cy="50" r="50" fill="${bg}"/>
<path d="${STAR}" fill="#d81e24" fill-opacity="${n === null ? .45 : .8}" stroke="#fbefd6" stroke-width="1.8" stroke-linejoin="round"/>
<circle cx="50" cy="50" r="45" fill="none" stroke="${ring}" stroke-width="3.5"/>
<circle cx="50" cy="50" r="40" fill="none" stroke="${ring}" stroke-width="1.2"/>
${guitar(g)}${txt}</svg></div>`;
}

// ---------- ルール ----------
function makePoints(N) {
  const k = N <= 11 ? 1 + ri(2) : 2;
  const minus = shuffle([-3, -5, -7]).slice(0, k);
  if (N === 13) minus.push(-10);
  const plus = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, N - minus.length);
  return shuffle([...minus, ...plus]);
}
// だれが取るか: { taker: 番号 or -1, how: 'zero'|'high'|'carry', top }
function resolve(plays) {
  const cnt = new Map();
  for (const c of plays) cnt.set(c, (cnt.get(c) || 0) + 1);
  const dup = [...cnt.values()].some(v => v >= 2);
  const zeros = plays.map((c, i) => c === 0 ? i : -1).filter(i => i >= 0);
  const top = Math.max(...plays);
  if (dup && zeros.length === 1) return { taker: zeros[0], how: 'zero', top, cnt };
  if (cnt.get(top) === 1) return { taker: plays.indexOf(top), how: 'high', top, cnt };
  return { taker: -1, how: 'carry', top, cnt };
}

// ---------- 乱数 ----------
const ri = n => Math.floor(Math.random() * n);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- コンピューター ----------
// s = { me, hands, pot, future, n }
function cpuNormal(s) {
  const h = s.hands[s.me].slice().sort((a, b) => a - b);
  const nz = h.filter(c => c > 0);
  if (!nz.length) return 0;
  if (s.pot < 0) return nz[Math.min(nz.length - 1, Math.random() < 0.7 ? 0 : 1)];
  const all = [s.pot, ...s.future.filter(v => v > 0)].sort((a, b) => a - b);
  const q = all.length > 1 ? all.indexOf(s.pot) / (all.length - 1) : 1;
  if (h[0] === 0 && s.n >= 3 && q >= 0.7 && Math.random() < 0.45) return 0;
  let idx = Math.round(q * (nz.length - 1)) + (ri(3) - 1);
  return nz[Math.max(0, Math.min(nz.length - 1, idx))];
}
function cpuStrong(s, samples = 60, noise = 0.5) {
  const h = s.hands[s.me];
  if (h.length === 1) return h[0];
  const fut = s.future.length ? s.future.reduce((a, v) => a + Math.abs(v), 0) / s.future.length : 0;
  const sorted = h.slice().sort((a, b) => a - b);
  let best = h[0], bv = -1e9;
  for (const c of h) {
    let gain = 0;
    for (let k = 0; k < samples; k++) {
      const plays = s.hands.map((hh, i) => i === s.me ? c : cpuNormal({ ...s, me: i }));
      const r = resolve(plays);
      if (r.taker === s.me) gain += s.pot;
      else if (r.taker >= 0) gain -= s.pot / (s.n - 1) * 0.3;
      else gain += s.pot / s.n * 0.5;
    }
    gain /= samples;
    const rank = sorted.indexOf(c) / (sorted.length - 1);
    const cost = c === 0 ? 0.6 * fut * 0.9 : 0.6 * fut * rank * 0.8;
    // 少しゆらぎを入れる(全員が同じ答えにならないように)
    const v = gain - cost + (Math.random() - 0.5) * noise * (Math.abs(s.pot) + fut);
    if (v > bv) { bv = v; best = c; }
  }
  return best;
}

// ---------- 画面 ----------
const $ = id => document.getElementById(id);
const CPU_NAMES = ['マスター', 'ジョー', 'リサ', 'ケン', 'ミキ', 'トム', 'サラ'];
const recHand = n => n <= 4 ? 10 : n <= 6 ? 9 : 8;
const cfg = { n: 4, N: 10, level: 'normal', Nchanged: false };
let G = null; // ゲームの状態
const timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const clearTimers = () => { while (timers.length) clearTimeout(timers.pop()); };

function show(id) {
  for (const s of document.querySelectorAll('.scr')) s.classList.add('hide');
  $(id).classList.remove('hide');
  window.scrollTo(0, 0);
}

function seg(el, items, get, set) {
  el.innerHTML = items.map(([v, label, rec]) => `<button data-v="${v}" class="${get() == v ? 'on' : ''}">${label}${rec ? '<span class="rec">おすすめ</span>' : ''}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('button'); if (!b) return; set(b.dataset.v); };
}
function drawTitle() {
  seg($('segN'), [2, 3, 4, 5, 6, 7, 8].map(v => [v, v + '人']), () => cfg.n, v => { cfg.n = +v; if (!cfg.Nchanged) cfg.N = recHand(cfg.n); drawTitle(); });
  seg($('segH'), [8, 9, 10, 11, 12, 13].map(v => [v, v, v === recHand(cfg.n)]), () => cfg.N, v => { cfg.N = +v; cfg.Nchanged = true; drawTitle(); });
  seg($('segL'), [['normal', 'ふつう'], ['strong', 'つよい']], () => cfg.level, v => { cfg.level = v; drawTitle(); });
  $('hintH').textContent = `0〜${cfg.N - 1} のコースター・${cfg.N}回勝負`;
}

function startGame() {
  clearTimers();
  const name = ($('inName').value || 'あなた').trim().slice(0, 8) || 'あなた';
  const names = shuffle(CPU_NAMES.slice()).slice(0, cfg.n - 1);
  G = {
    n: cfg.n, N: cfg.N, level: cfg.level,
    players: [{ name, me: true }, ...names.map(nm => ({ name: nm, me: false }))].map(p => ({ ...p, hand: [...Array(cfg.N).keys()], score: 0, got: [] })),
    order: makePoints(cfg.N), r: 0, pot: [], pick: null, cpuPick: [],
  };
  beginRound();
}

function potValue() { return G.pot.reduce((a, v) => a + v, 0); }

function drawBoard(el, status) {
  const top = Math.max(...G.players.map(p => p.score));
  el.innerHTML = G.players.map((p, i) => `<div class="pl${p.me ? ' me' : ''}${p.score === top && top !== 0 ? ' lead' : ''}">
<div class="nm">${esc(p.name)}</div><div class="sc">${p.score}</div><div class="st ${status && status[i] ? 'ok' : ''}">${status ? (status[i] ? '✓ 決めた' : '考え中…') : ''}</div></div>`).join('');
}
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function beginRound() {
  G.pot.push(G.order[G.r]);
  G.pick = null;
  const v = G.order[G.r];
  $('roundNo').textContent = `${G.r + 1} / ${G.N} 回目`;
  $('nextT').innerHTML = `次は <b class="${v < 0 ? 'm' : ''}">${fmt(v)} ${CARD[v]}</b> だ!`;
  $('pot').innerHTML = G.pot.map(x => pcHtml(x)).join('');
  $('carryT').textContent = G.pot.length > 1 ? `持ちこし ${G.pot.length - 1}枚つき! 合わせて ${potValue() > 0 ? '+' : ''}${potValue()}点` : '';
  // のこりの点数カード(全部見せる。点数の順)
  const used = G.order.slice(0, G.r);
  const all = G.order.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  $('remain').innerHTML = all.map(({ x, i }) => pcHtml(x, i < G.r ? 'used' : i === G.r ? 'now' : '')).join('');
  // コンピューターは、この時点の情報で決める(あなたの選びは見ない)
  const st = { hands: G.players.map(p => p.hand), pot: potValue(), future: G.order.slice(G.r + 1), n: G.n };
  G.cpuPick = G.players.map((p, i) => p.me ? null : (G.level === 'strong' ? cpuStrong({ ...st, me: i }) : cpuNormal({ ...st, me: i })));
  // 決めた印は、少しずつつける(雰囲気)
  G.decided = G.players.map(p => false);
  drawBoard($('board'), G.decided);
  G.players.forEach((p, i) => { if (!p.me) later(() => { G.decided[i] = true; drawBoard($('board'), G.decided); }, 500 + Math.random() * 1800); });
  drawHand();
  show('scr-pick');
}

function drawHand() {
  const me = G.players[0];
  $('hand').innerHTML = me.hand.map(c => coaster(c)).join('');
  for (const el of $('hand').querySelectorAll('.co')) {
    if (+el.dataset.n === G.pick) el.classList.add('sel');
    el.onclick = () => { G.pick = +el.dataset.n; drawHand(); };
  }
  const b = $('btnGo');
  b.disabled = G.pick === null;
  b.textContent = G.pick === null ? 'コースターを選んでね' : `${G.pick} で勝負!`;
}

function go() {
  if (G.pick === null) return;
  clearTimers();
  const plays = G.players.map((p, i) => p.me ? G.pick : G.cpuPick[i]);
  plays.forEach((c, i) => { const h = G.players[i].hand; h.splice(h.indexOf(c), 1); });
  const res = resolve(plays);
  const val = potValue();
  // 結果発表の画面
  $('roundNo2').textContent = `${G.r + 1} / ${G.N} 回目`;
  $('pot2').innerHTML = G.pot.map(x => pcHtml(x)).join('');
  $('reveal').innerHTML = G.players.map((p, i) => `<div class="rv" id="rv${i}"><div class="flip"><div class="flip-in"><div class="face back">${coaster(null)}</div><div class="face front">${coaster(plays[i])}</div></div></div><div class="nm">${esc(p.name)}</div></div>`).join('');
  $('msg').innerHTML = '';
  $('btnNext').classList.add('hide');
  drawBoard($('board2'));
  $('seno').textContent = 'せーの!';
  show('scr-res');
  const step = 260;
  G.players.forEach((p, i) => later(() => $('rv' + i).querySelector('.flip').classList.add('open'), 500 + i * step));
  later(() => {
    // かぶった数字をゆらす
    plays.forEach((c, i) => { if (res.cnt.get(c) >= 2) $('rv' + i).classList.add('dup'); });
    const who = res.taker >= 0 ? G.players[res.taker] : null;
    const vtxt = `${val > 0 ? '+' : ''}${val}点`;
    let m;
    if (res.how === 'zero') m = `数字がかぶった! 0 の <b>${esc(who.name)}</b> が ${vtxt} をゲット!`;
    else if (res.how === 'high') m = `いちばん大きい ${res.top} の <b>${esc(who.name)}</b> が ${vtxt} をゲット!`;
    else m = `いちばん大きい ${res.top} がかぶった! 持ちこし!`;
    if (who && val < 0) m += '<small>(マイナスを引き取っちゃった…)</small>';
    if (res.taker >= 0) {
      $('rv' + res.taker).classList.remove('dup');
      $('rv' + res.taker).classList.add('win');
      who.score += val; who.got.push(...G.pot); G.pot = [];
    }
    $('seno').textContent = res.how === 'carry' ? '持ちこし!' : 'ゲット!';
    $('msg').innerHTML = m;
    drawBoard($('board2'));
    G.r++;
    const last = G.r >= G.N;
    $('btnNext').textContent = last ? '最終結果へ' : '次へ';
    $('btnNext').classList.remove('hide');
    G.autoNext = later(() => nextStep(), 3500);
  }, 500 + G.n * step + 500);
}

function nextStep() {
  clearTimers();
  if (G.r >= G.N) endGame(); else beginRound();
}

function endGame() {
  const ps = G.players.map((p, i) => ({ ...p, i })).sort((a, b) => b.score - a.score);
  let rank = 0, prev = null;
  $('rank').innerHTML = ps.map((p, k) => {
    if (p.score !== prev) { rank = k + 1; prev = p.score; }
    return `<div class="rk${p.me ? ' me' : ''}"><span class="no">${rank === 1 ? '👑' : rank}</span><span class="nm">${esc(p.name)}</span><span class="got">${p.got.slice().sort((a, b) => b - a).map(v => pcHtml(v)).join('')}</span><span class="sc">${p.score}</span></div>`;
  }).join('');
  const lost = potValue();
  $('lost').innerHTML = G.pot.length ? `最後の持ちこし(${lost > 0 ? '+' : ''}${lost}点)は、だれのものにもならなかった` : '';
  show('scr-end');
}

function ask(text, yes) {
  $('askT').textContent = text;
  $('askBox').classList.remove('hide');
  $('askYes').onclick = () => { $('askBox').classList.add('hide'); yes(); };
  $('askNo').onclick = () => $('askBox').classList.add('hide');
}
function quit() {
  ask('ゲームをやめますか?', () => { clearTimers(); G = null; show('scr-title'); });
}

// ---------- はじめる ----------
$('heroCo').innerHTML = [7, 0, 12].map(coaster).join('');
cfg.N = recHand(cfg.n);
drawTitle();
$('btnStart').onclick = startGame;
$('btnGo').onclick = go;
$('btnNext').onclick = nextStep;
$('btnAgain').onclick = startGame;
$('btnTop').onclick = () => show('scr-title');
$('btnQuit').onclick = quit;
$('btnRule').onclick = () => $('ruleBox').classList.remove('hide');
$('btnRuleClose').onclick = () => $('ruleBox').classList.add('hide');
$('ruleBox').onclick = e => { if (e.target.id === 'ruleBox') $('ruleBox').classList.add('hide'); };

// テスト用(画面確認の自動プレイ)
window.__cc = { get G() { return G; }, cfg, startGame, go, nextStep, resolve, makePoints, cpuNormal };
