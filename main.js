// COASTER CLASH 試作 v=5(練習モード: コンピューターと対戦)
// ルール: muddys-notes の coaster-clash_spec.md(2026-11-21 のルール)
// v=5: かぶった数はとばす / 2人の 0 / 特殊カード(下剋上・ハッピーアワー・2軒目) / 同点は枚数
'use strict';

const VER = 5;

// ---------- 点数カード ----------
const CARD = {
  1: 'お水', 2: 'ウーロン茶', 3: 'コーラ', 4: 'ビール', 5: 'レモンサワー',
  6: 'ハイボール', 7: 'マティーニ', 8: '赤ワイン', 9: 'ウイスキー', 10: 'シャンパン',
  '-3': 'こぼれたビール', '-5': 'からっぽの財布', '-7': 'お会計', '-10': '二日酔いでダウン',
};
const cardImg = v => `cards/card_${v > 0 ? 'plus' + v : 'minus' + (-v)}.webp?v=${VER}`;
const pcHtml = (v, cls = '', extra = '') => `<span class="pc ${cls}" style="background-image:url('${cardImg(v)}');${extra}" title="${fmt(v)} ${CARD[v]}"></span>`;
const fmt = v => (v > 0 ? '+' : '−') + Math.abs(v);
const pts = v => `${v > 0 ? '+' : ''}${v}点`;

// ---------- 特殊カード ----------
// BOTTOMS = 下剋上(数の強さが逆) / HAPPY = ハッピーアワー(使った人が取ったら2倍) / BARHOP = 2軒目(2番目に強い人)
const SP = {
  BOTTOMS: { file: 'bottomsup', ja: '下剋上', en: 'BOTTOMS UP!', desc: '小さい数ほど強い' },
  HAPPY: { file: 'happyhour', ja: 'ハッピーアワー', en: 'HAPPY HOUR', desc: '自分が取ったら点数2倍' },
  BARHOP: { file: 'barhop', ja: '2軒目', en: 'BAR HOP', desc: '2番目に強い数の人が取る' },
};
const SP_KEYS = ['BOTTOMS', 'HAPPY', 'BARHOP'];
const specialsFor = n => n === 2 ? ['BOTTOMS', 'HAPPY'] : SP_KEYS; // 2人は 2軒目なし
const spHtml = (k, cls = '') => `<span class="sp ${cls}" style="background-image:url('cards/card_${SP[k].file}.webp?v=${VER}')" title="${SP[k].ja}"></span>`;

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

// 点数カードの裏(Muddy's Games のロゴ。デニムにワッペン)。回るときに見える
const CARD_BACK = `<img src="cardback.webp?v=${VER}" alt="" style="width:100%;height:100%;display:block">`;

// ---------- ルール ----------
function makePoints(N) {
  const k = N <= 11 ? 1 + ri(2) : 2;
  const minus = shuffle([-3, -5, -7]).slice(0, k);
  if (N === 13) minus.push(-10);
  const plus = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, N - minus.length);
  return shuffle([...minus, ...plus]);
}

// 出したものから、その回のルールを作る(同じ特殊カードは重ならない)
// acts: [{ c, use }] / sp: 各自の特殊カード(使ったら null)
function roundCtx(acts, sp, N) {
  const used = new Set(), happy = new Set();
  acts.forEach((a, i) => { if (a.use && sp[i]) { used.add(sp[i]); if (sp[i] === 'HAPPY') happy.add(i); } });
  return { N, rev: used.has('BOTTOMS'), second: used.has('BARHOP'), happy, used, mult: t => happy.has(t) ? 2 : 1 };
}

// だれが取るか: { taker: 番号 or -1, how: 'zero'|'zero2'|'high'|'carry', cnt }
// ctx: { N, rev(下剋上), second(2軒目) }
function resolve(plays, ctx = {}) {
  const n = plays.length, N = ctx.N || 10;
  const cnt = new Map();
  for (const c of plays) cnt.set(c, (cnt.get(c) || 0) + 1);
  const dup = [...cnt.values()].some(v => v >= 2);
  const zeros = plays.map((c, i) => c === 0 ? i : -1).filter(i => i >= 0);
  // 0 のルールがいちばん先
  if (dup && zeros.length === 1) return { taker: zeros[0], how: 'zero', cnt };
  // 2人のとき: 相手が「その回でいちばん強い2枚」なら 0 の人(ふだんは上から2枚、下剋上は 1・2)
  if (n === 2 && zeros.length === 1) {
    const other = plays[1 - zeros[0]];
    const strong = ctx.rev ? other >= 1 && other <= 2 : other >= N - 2;
    if (strong) return { taker: zeros[0], how: 'zero2', cnt };
  }
  // かぶった数はとばす。0 はいちばん弱い。下剋上は 0 以外で小さいほど強い
  const str = c => c === 0 ? -1 : (ctx.rev ? 100 - c : c);
  const uniq = plays.map((c, i) => i).filter(i => cnt.get(plays[i]) === 1).sort((a, b) => str(plays[b]) - str(plays[a]));
  const k = ctx.second ? 1 : 0;
  if (uniq.length > k) { const t = uniq[k]; return { taker: t, how: plays[t] === 0 ? 'zero' : 'high', cnt }; }
  return { taker: -1, how: 'carry', cnt };
}

// ---------- 乱数 ----------
const ri = n => Math.floor(Math.random() * n);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- コンピューター ----------
// s = { me, hands, pot, future, n, N, sp } / 戻り値 { c: 出す数字, use: 特殊カードを使うか }
// シミュレーター(tools/sim.mjs)の「ふつう」「考える」と同じ考え方
function cpuNormal(s) {
  const h = s.hands[s.me].slice().sort((a, b) => a - b);
  const nz = h.filter(c => c > 0);
  const my = s.sp[s.me];
  if (!nz.length) return { c: 0, use: !!my && s.pot > 0 };
  if (s.pot < 0) return { c: nz[Math.min(nz.length - 1, Math.random() < 0.7 ? 0 : 1)], use: false }; // マイナスは小さい数でにげる
  const futPos = s.future.filter(v => v > 0);
  const all = [s.pot, ...futPos].sort((a, b) => a - b);
  const q = all.length > 1 ? all.indexOf(s.pot) / (all.length - 1) : 1;
  const last = h.length === 1;
  // 特殊カード(大きい点のときに使う)
  if (my && s.pot > 0) {
    const big = s.pot >= Math.max(0, ...futPos);
    if (my === 'BOTTOMS' && (last || (q >= 0.6 && Math.random() < 0.5))) return { c: nz[0], use: true };
    if (my === 'BARHOP' && (last || (q >= 0.6 && Math.random() < 0.5))) return { c: nz[Math.min(nz.length - 1, Math.floor(nz.length * 0.6))], use: true };
    if (my === 'HAPPY' && (last || (big && Math.random() < 0.7))) {
      if (h[0] === 0 && s.n >= 3 && Math.random() < 0.4) return { c: 0, use: true };
      return { c: nz[Math.max(0, nz.length - 1 - ri(2))], use: true };
    }
  }
  if (h[0] === 0 && q >= 0.7 && Math.random() < 0.45) return { c: 0, use: false };
  let idx = Math.round(q * (nz.length - 1)) + (ri(3) - 1);
  return { c: nz[Math.max(0, Math.min(nz.length - 1, idx))], use: false };
}
// つよい: 相手が「ふつう」で出すとして、出す候補ごとに何十回もためして、いちばん得なものを選ぶ
// 少しゆらぎを入れる(同じ答えばかりにならないように)
function cpuStrong(s, samples = 40, noise = 0.5) {
  const h = s.hands[s.me];
  const my = s.sp[s.me];
  const opts = [];
  for (const c of h) { opts.push({ c, use: false }); if (my) opts.push({ c, use: true }); }
  if (opts.length === 1) return opts[0];
  const fut = s.future.length ? s.future.reduce((a, v) => a + Math.abs(v), 0) / s.future.length : 0;
  const futMax = Math.max(0, ...s.future);
  const sorted = h.slice().sort((a, b) => a - b);
  let best = opts[0], bv = -1e9;
  for (const o of opts) {
    let gain = 0;
    for (let k = 0; k < samples; k++) {
      const acts = s.hands.map((hh, i) => i === s.me ? o : cpuNormal({ ...s, me: i }));
      const ctx = roundCtx(acts, s.sp, s.N);
      const r = resolve(acts.map(a => a.c), ctx);
      if (r.taker === s.me) gain += s.pot * ctx.mult(s.me);
      else if (r.taker >= 0) gain -= s.pot * ctx.mult(r.taker) / (s.n - 1) * 0.3;
      else gain += s.pot / s.n * 0.5;
    }
    gain /= samples;
    const rank = sorted.length > 1 ? sorted.indexOf(o.c) / (sorted.length - 1) : 0;
    let cost = h.length === 1 ? 0 : (o.c === 0 ? 0.6 * fut * 0.9 : 0.6 * fut * rank * 0.8);
    if (o.use && h.length > 1) cost += 0.6 * futMax * 0.4; // 特殊カードも、あとで使いたい
    const v = gain - cost + (Math.random() - 0.5) * noise * (Math.abs(s.pot) + fut);
    if (v > bv) { bv = v; best = o; }
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
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
    players: [{ name, me: true }, ...names.map(nm => ({ name: nm, me: false }))].map(p => ({ ...p, hand: [...Array(cfg.N).keys()], score: 0, got: [], sp: null, spUsed: false })),
    order: makePoints(cfg.N), r: 0, pot: [], pick: null, useSp: false, cpuAct: [], mySp: null,
  };
  showLineup();
}

// 試合の最初: その試合の点数カードを全部、大きく並べる
function showLineup() {
  const all = G.order.slice().sort((a, b) => b - a);
  $('lineup').innerHTML = all.map((v, i) => pcHtml(v, '', `animation-delay:${i * 60}ms`)).join('');
  const plus = all.filter(v => v > 0).reduce((a, v) => a + v, 0), minus = all.filter(v => v < 0).reduce((a, v) => a + v, 0);
  $('lineupSum').textContent = `プラス 合計 +${plus}点 / マイナス 合計 ${minus}点 / ${G.N}回勝負`;
  show('scr-lineup');
}

// 特殊カードを選ぶ(点数カードを見たあと)
function showSpPick() {
  G.mySp = null;
  $('spLineup').innerHTML = G.order.slice().sort((a, b) => b - a).map(v => pcHtml(v)).join('');
  drawSpPick();
  show('scr-sp');
}
function drawSpPick() {
  const keys = specialsFor(G.n);
  $('spPick').style.gridTemplateColumns = `repeat(${keys.length},1fr)`;
  $('spPick').innerHTML = keys.map(k => `<div class="sp-opt ${G.mySp === k ? 'on' : G.mySp ? 'off' : ''}" data-k="${k}">${spHtml(k)}<div class="jn">${SP[k].ja}</div><div class="en">${SP[k].en}</div><div class="ds">${SP[k].desc}</div></div>`).join('');
  for (const el of $('spPick').querySelectorAll('.sp-opt')) el.onclick = () => { G.mySp = el.dataset.k; drawSpPick(); };
  const b = $('btnSp');
  b.disabled = !G.mySp;
  b.textContent = G.mySp ? `${SP[G.mySp].ja} にする` : 'カードを選んでね';
  $('spNote').textContent = G.n === 2 ? '選んだカードは、みんなに見えるよ(2人のときは 2軒目なし)' : '選んだカードは、みんなに見えるよ';
}
// みんなの特殊カード(コンピューターはランダムに選ぶ)
function showWho() {
  const keys = specialsFor(G.n);
  G.players.forEach(p => { p.sp = p.me ? G.mySp : keys[ri(keys.length)]; p.spUsed = false; });
  $('who').innerHTML = G.players.map(p => `<div class="w${p.me ? ' me' : ''}">${spHtml(p.sp)}<div class="t">${esc(p.name)}<small>${SP[p.sp].ja}</small></div></div>`).join('');
  $('whoCnt').textContent = keys.map(k => `${SP[k].ja} ×${G.players.filter(p => p.sp === k).length}`).join(' ・ ');
  show('scr-who');
}

function potValue() { return G.pot.reduce((a, v) => a + v, 0); }
const spNow = () => G.players.map(p => p.spUsed ? null : p.sp);

function drawBoard(el, status) {
  const top = Math.max(...G.players.map(p => p.score));
  el.innerHTML = G.players.map((p, i) => `<div class="pl${p.me ? ' me' : ''}${p.score === top && top !== 0 ? ' lead' : ''}">
<div class="nm">${esc(p.name)}</div><div class="sc">${p.score}</div>${p.sp ? spHtml(p.sp, 'ic' + (p.spUsed ? ' used' : '')) : ''}<div class="st ${status && status[i] ? 'ok' : ''}">${status ? (status[i] ? '✓ 決めた' : '考え中…') : ''}</div></div>`).join('');
}

function beginRound() {
  G.pot.push(G.order[G.r]);
  G.pick = null; G.useSp = false;
  const v = G.order[G.r];
  $('roundNo').textContent = `${G.r + 1} / ${G.N} 回目`;
  $('nextT').innerHTML = `次は <b class="${v < 0 ? 'm' : ''}">${fmt(v)} ${CARD[v]}</b> だ!`;
  $('pot').innerHTML = G.pot.map(x => pcHtml(x)).join('');
  $('carryT').textContent = G.pot.length > 1 ? `持ちこし ${G.pot.length - 1}枚つき! 合わせて ${pts(potValue())}` : '';
  // のこりの点数カード(全部見せる。点数の順)
  const all = G.order.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  $('remain').innerHTML = all.map(({ x, i }) => pcHtml(x, i < G.r ? 'used' : i === G.r ? 'now' : '')).join('');
  // 2人のときの 0
  $('rule2').classList.toggle('hide', G.n !== 2);
  if (G.n === 2) $('rule2').innerHTML = `2人のときは <b>${G.N - 2}・${G.N - 1}</b> に 0 が勝つ<small>(下剋上の回は 1・2)</small>`;
  // コンピューターは、この時点の情報で決める(あなたの選びは見ない)
  const st = { hands: G.players.map(p => p.hand), pot: potValue(), future: G.order.slice(G.r + 1), n: G.n, N: G.N, sp: spNow() };
  G.cpuAct = G.players.map((p, i) => p.me ? null : (G.level === 'strong' ? cpuStrong({ ...st, me: i }) : cpuNormal({ ...st, me: i })));
  // 決めた印は、少しずつつける(雰囲気)
  G.decided = G.players.map(() => false);
  drawBoard($('board'), G.decided);
  G.players.forEach((p, i) => { if (!p.me) later(() => { G.decided[i] = true; drawBoard($('board'), G.decided); }, 500 + Math.random() * 1800); });
  drawHand();
  show('scr-pick');
  showIntro(v);
}

// 毎回の最初: 点数カードを大きく出して、少しして消す
function showIntro(v) {
  const el = $('intro');
  $('introRn').textContent = `${G.r + 1} / ${G.N} 回目`;
  $('introBig').className = 'big' + (G.pot.length > 1 ? ' many' : '');
  $('introBig').innerHTML = G.pot.map((x, i) => `<div class="spin" style="animation-delay:${i * 180}ms">${pcHtml(x)}<div class="cback">${CARD_BACK}</div></div>`).join('');
  $('introT').innerHTML = `次は <b class="${v < 0 ? 'm' : ''}">${fmt(v)} ${CARD[v]}</b> だ!`;
  $('introC').textContent = G.pot.length > 1 ? `持ちこしつき! 合わせて ${pts(potValue())}` : '';
  el.classList.remove('hide', 'out');
  const close = () => { el.classList.add('out'); setTimeout(() => el.classList.add('hide'), 350); };
  el.onclick = close;
  later(close, 2200 + (G.pot.length - 1) * 180);
}

function drawHand() {
  const me = G.players[0];
  $('hand').innerHTML = me.hand.map(c => coaster(c)).join('');
  for (const el of $('hand').querySelectorAll('.co')) {
    if (+el.dataset.n === G.pick) el.classList.add('sel');
    el.onclick = () => { G.pick = +el.dataset.n; drawHand(); };
  }
  // 自分の特殊カード(タップで使う / やめる)
  const ms = $('mysp');
  ms.className = 'mysp' + (me.spUsed ? ' used' : G.useSp ? ' on' : '');
  ms.innerHTML = `${spHtml(me.sp)}<div class="lb">${me.spUsed ? '使った' : G.useSp ? '使う!' : 'タップで使う'}</div>`;
  ms.onclick = me.spUsed ? null : () => { G.useSp = !G.useSp; drawHand(); };
  const b = $('btnGo');
  b.disabled = G.pick === null;
  b.classList.toggle('spgo', G.useSp && G.pick !== null);
  b.textContent = G.pick === null ? 'コースターを選んでね' : G.useSp ? `${G.pick} ＋ ${SP[me.sp].ja} で勝負!` : `${G.pick} で勝負!`;
}

// 特殊カードの帯
const BAND = {
  BOTTOMS: () => 'この回は 小さい数が強い!',
  HAPPY: names => `${names} が取ったら 2倍!`,
  BARHOP: () => 'この回は 2番目に強い数の人が取る!',
};

function go() {
  if (G.pick === null) return;
  clearTimers();
  $('intro').classList.add('hide');
  const acts = G.players.map((p, i) => p.me ? { c: G.pick, use: G.useSp } : G.cpuAct[i]);
  const sp = spNow();
  const ctx = roundCtx(acts, sp, G.N);
  const plays = acts.map(a => a.c);
  const usedBy = acts.map((a, i) => !!(a.use && sp[i]));
  plays.forEach((c, i) => { const h = G.players[i].hand; h.splice(h.indexOf(c), 1); });
  usedBy.forEach((u, i) => { if (u) G.players[i].spUsed = true; });
  const res = resolve(plays, ctx);
  const val = potValue();
  // 結果発表の画面
  $('roundNo2').textContent = `${G.r + 1} / ${G.N} 回目`;
  $('pot2').innerHTML = G.pot.map(x => pcHtml(x)).join('');
  $('reveal').innerHTML = G.players.map((p, i) => `<div class="rv" id="rv${i}"><div class="fw"><div class="flip"><div class="flip-in"><div class="face back">${coaster(null)}</div><div class="face front">${coaster(plays[i])}</div></div></div>${usedBy[i] ? spHtml(sp[i], 'usp') : ''}</div><div class="nm">${esc(p.name)}</div></div>`).join('');
  $('msg').innerHTML = '';
  $('btnNext').classList.add('hide');
  drawBoard($('board2'));
  $('seno').textContent = 'せーの!';
  show('scr-res');
  const step = 260;
  G.players.forEach((p, i) => later(() => $('rv' + i).classList.add('op'), 500 + i * step));
  let t = 500 + G.n * step + 500;
  // 特殊カードの帯(使われたカードごとに1回)
  for (const k of SP_KEYS) {
    if (!ctx.used.has(k)) continue;
    const names = G.players.filter((p, i) => usedBy[i] && sp[i] === k).map(p => esc(p.name)).join('・');
    later(() => showBand(k, BAND[k](names)), t);
    t += 1600;
  }
  later(() => finishRound(plays, res, ctx, val), t);
}

function showBand(k, sub) {
  const el = $('band');
  $('bandIn').innerHTML = `${spHtml(k)}<div class="bt">${SP[k].ja}!</div><div class="bs">${sub}</div>`;
  el.classList.remove('hide', 'out');
  // 帯の動きは CSS のアニメーション。もう一度動かすためにつけ直す
  void el.offsetWidth;
  later(() => el.classList.add('out'), 1250);
  later(() => el.classList.add('hide'), 1550);
}

function finishRound(plays, res, ctx, val) {
  $('band').classList.add('hide');
  // かぶった数字をゆらす
  plays.forEach((c, i) => { if (res.cnt.get(c) >= 2) $('rv' + i).classList.add('dup'); });
  const who = res.taker >= 0 ? G.players[res.taker] : null;
  const mult = res.taker >= 0 ? ctx.mult(res.taker) : 1;
  const dupNums = [...res.cnt.entries()].filter(([, v]) => v >= 2).map(([c]) => c).sort((a, b) => b - a);
  const dupTxt = dupNums.join('・');
  const vtxt = mult === 2 ? `${fmt(val)} の2倍 <b>${pts(val * 2)}</b>` : pts(val);
  const head = SP_KEYS.filter(k => ctx.used.has(k)).map(k => `<span class="spn">${SP[k].ja}!</span> `).join('');
  let m;
  if (res.how === 'zero') m = `${dupTxt} がかぶった! 0 の <b>${esc(who.name)}</b> が ${vtxt} をゲット!`;
  else if (res.how === 'zero2') m = `0 が ${plays[1 - res.taker]} に勝った! <b>${esc(who.name)}</b> が ${vtxt} をゲット!`;
  else if (res.how === 'high') {
    const word = ctx.rev ? (ctx.second ? '2番目に小さい' : 'いちばん小さい') : (ctx.second ? '2番目に大きい' : 'いちばん大きい');
    m = `${dupTxt ? dupTxt + ' がかぶって、' : ''}${word} ${plays[res.taker]} の <b>${esc(who.name)}</b> が ${vtxt} をゲット!`;
  } else m = dupTxt && plays.every(c => res.cnt.get(c) >= 2) ? `${dupTxt} がかぶった! 持ちこし!` : '2番目がいない! 持ちこし!';
  m = head + m;
  if (who && val < 0) m += '<small>(マイナスを引き取っちゃった…)</small>';
  if (res.taker < 0 && ctx.happy.size) m += '<small>(持ちこしなので、ハッピーアワーの2倍はなし)</small>';
  if (who) {
    $('rv' + res.taker).classList.remove('dup');
    $('rv' + res.taker).classList.add('win');
    who.score += val * mult; who.got.push(...G.pot); G.pot = [];
    if (mult === 2) $('pot2').insertAdjacentHTML('beforeend', '<span class="stamp">×2</span>');
  }
  $('seno').textContent = res.taker < 0 ? '持ちこし!' : 'ゲット!';
  $('msg').innerHTML = m;
  drawBoard($('board2'));
  G.r++;
  const last = G.r >= G.N;
  $('btnNext').textContent = last ? '最終結果へ' : '次へ';
  $('btnNext').classList.remove('hide');
  later(() => nextStep(), 3800);
}

function nextStep() {
  clearTimers();
  if (G.r >= G.N) endGame(); else beginRound();
}

// 順位: 点数 → 同じなら取ったカードの枚数(持ちこしのカードも1枚ずつ数える)。それでも同じなら同じ順位
function endGame() {
  const ps = G.players.map((p, i) => ({ ...p, i, k: p.got.length })).sort((a, b) => b.score - a.score || b.k - a.k);
  let rank = 0, prev = null;
  $('rank').innerHTML = ps.map((p, j) => {
    if (!prev || p.score !== prev.score || p.k !== prev.k) rank = j + 1;
    prev = p;
    const same = ps.filter(q => q.score === p.score);
    let tie = '';
    if (same.length > 1) {
      const minK = Math.min(...same.map(q => q.k));
      tie = p.k > minK ? `<span class="tie">同点・枚数で上(${p.k}枚)</span>` : `<span class="tie gray">同点(${p.k}枚)</span>`;
    }
    return `<div class="rk${p.me ? ' me' : ''}"><span class="no">${rank === 1 ? '👑' : rank}</span><span class="nm">${esc(p.name)}${tie}</span><span class="got">${p.got.slice().sort((a, b) => b - a).map(v => pcHtml(v)).join('')}</span><span class="sc">${p.score}</span></div>`;
  }).join('');
  const lost = potValue();
  $('lost').innerHTML = G.pot.length ? `最後の持ちこし(${pts(lost)})は、だれのものにもならなかった` : '';
  show('scr-end');
}

function ask(text, yes) {
  $('askT').textContent = text;
  $('askBox').classList.remove('hide');
  $('askYes').onclick = () => { $('askBox').classList.add('hide'); yes(); };
  $('askNo').onclick = () => $('askBox').classList.add('hide');
}
function quit() {
  ask('ゲームをやめますか?', () => { clearTimers(); G = null; $('intro').classList.add('hide'); $('band').classList.add('hide'); show('scr-title'); });
}

// ---------- はじめる ----------
$('heroCo').innerHTML = [7, 0, 12].map(coaster).join('');
cfg.N = recHand(cfg.n);
drawTitle();
$('btnStart').onclick = startGame;
$('btnGo').onclick = go;
$('btnLineup').onclick = showSpPick;
$('btnSp').onclick = () => { if (G.mySp) showWho(); };
$('btnWho').onclick = () => beginRound();
$('btnNext').onclick = nextStep;
$('btnAgain').onclick = startGame;
$('btnTop').onclick = () => show('scr-title');
$('btnQuit').onclick = quit;
$('btnRule').onclick = () => $('ruleBox').classList.remove('hide');
$('btnRuleClose').onclick = () => $('ruleBox').classList.add('hide');
$('ruleBox').onclick = e => { if (e.target.id === 'ruleBox') $('ruleBox').classList.add('hide'); };

// テスト用(画面確認の自動プレイ)
window.__cc = { get G() { return G; }, cfg, startGame, go, nextStep, resolve, roundCtx, makePoints, cpuNormal, cpuStrong, showSpPick, showWho, beginRound, endGame };
