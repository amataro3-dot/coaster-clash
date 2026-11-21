// COASTER CLASH コンピューター同士の対戦シミュレーター(ルールを決めるための道具。ゲームでは使わない)
// 使い方: node tools/sim.mjs                   (全部の人数×枚数を調べる)
//         node tools/sim.mjs skill 300         (考えるCPU 1人 vs ふつうのCPU で実力差)
//         node tools/sim.mjs special 2000      (特殊カードのバランス)
//         RULE=S node tools/sim.mjs            (ルールをえらぶ。下を見て)
//         SPECIAL=1 node tools/sim.mjs skill   (特殊カードありで調べる。special のときはいつもあり)
//         NS=8,10,13 node tools/sim.mjs skill  (調べる手札の枚数)
//         HH=self                              (ハッピーアワーを「使った人が取ったときだけ2倍」にする)
//         K=2                                  (2人のとき 0 が勝てる「上から何枚」。0 で特別ルールなし)
// ルール:
//   S  = いまのルール(2026-11-21 夜): かぶって 0 が1人 → 0。そうでなければ、かぶった数はとばして、いちばん大きい人。2人の特別ルールあり
//   C1 = 1つ前(いちばん大きい数がかぶったら持ちこし) / B = 最初のルール / A・A2・V2 = ほかの案
// 仕様は muddys-notes の coaster-clash_spec.md(2026-11-21 版)

// ---- 乱数(シードあり) ----
let seed = 12345;
function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const ri = n => Math.floor(rnd() * n);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---- 点数カードを作る ----
export function makePoints(N) {
  let k = N <= 11 ? 1 + ri(2) : 2;
  const minus = shuffle([-3, -5, -7]).slice(0, k);
  if (N === 13) minus.push(-10);
  const plus = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, N - minus.length);
  return shuffle([...minus, ...plus]);
}

// ---- 特殊カード ----
// BOTTOMS = 下剋上(数の強さが逆) / HAPPY = ハッピーアワー(点数2倍) / BARHOP = 2軒目(2番目に強い人)
export const SPECIALS = ['BOTTOMS', 'HAPPY', 'BARHOP'];
const SP_JA = { BOTTOMS: '下剋上', HAPPY: 'ハッピーアワー', BARHOP: '2軒目' };
const specialsFor = n => n === 2 ? ['BOTTOMS', 'HAPPY'] : SPECIALS; // 2人は 2軒目なし
let USE_SPECIAL = process.env.SPECIAL === '1';
const HH = process.env.HH || 'all'; // ハッピーアワー: all=だれが取っても2倍 / self=使った人が取ったときだけ2倍

// ---- だれが取るか ----
// plays: 出した数字の配列 / ctx: { n, N, rev(下剋上), second(2軒目) }
// 戻り値: { taker: プレイヤー番号 or -1(持ちこし), how: 'high'|'zero'|'carry' }
export let RULE = process.env.RULE || 'S';
const K = process.env.K !== undefined ? Number(process.env.K) : 2;
export function resolve(plays, ctx = {}) {
  if (RULE === 'S') return resolveS(plays, ctx);
  if (RULE === 'V2') return resolveV2(plays);
  if (RULE === 'C1') return resolveC1(plays);
  if (RULE === 'A' || RULE === 'A2') return resolveA(plays, RULE === 'A2');
  const cnt = new Map();
  for (const c of plays) cnt.set(c, (cnt.get(c) || 0) + 1);
  const dup = [...cnt.values()].some(v => v >= 2);
  if (!dup) {
    let best = -1, bi = -1;
    plays.forEach((c, i) => { if (c > best) { best = c; bi = i; } });
    return { taker: bi, how: 'high' };
  }
  const zeros = plays.map((c, i) => c === 0 ? i : -1).filter(i => i >= 0);
  if (zeros.length === 1) return { taker: zeros[0], how: 'zero' };
  return { taker: -1, how: 'carry' };
}

// S(いまのルール)。特殊カードの下剋上・2軒目にも対応
function resolveS(plays, ctx) {
  const n = plays.length, N = ctx.N || 10;
  const cnt = new Map();
  for (const c of plays) cnt.set(c, (cnt.get(c) || 0) + 1);
  const dup = [...cnt.values()].some(v => v >= 2);
  const zeros = plays.map((c, i) => c === 0 ? i : -1).filter(i => i >= 0);
  // 0 のルールがいちばん先
  if (dup && zeros.length === 1) return { taker: zeros[0], how: 'zero' };
  // 2人のとき: 相手が「その回でいちばん強い K 枚」なら 0 の人(ふだんは上から、下剋上は 1・2…)
  if (n === 2 && zeros.length === 1 && K > 0) {
    const other = plays[1 - zeros[0]];
    const strong = ctx.rev ? other >= 1 && other <= K : other >= N - K;
    if (strong) return { taker: zeros[0], how: 'zero' };
  }
  // かぶった数はとばす。0 はいちばん弱い。下剋上は 0 以外で小さいほど強い
  const str = c => c === 0 ? -1 : (ctx.rev ? 100 - c : c);
  const uniq = plays.map((c, i) => i).filter(i => cnt.get(plays[i]) === 1).sort((a, b) => str(plays[b]) - str(plays[a]));
  const pick = ctx.second ? 1 : 0;
  if (uniq.length > pick) { const t = uniq[pick]; return { taker: t, how: plays[t] === 0 ? 'zero' : 'high' }; }
  return { taker: -1, how: 'carry' };
}

// V2: かぶった数字は消える。のこった中でいちばん大きい数(0以外)の人が取る。
//     0以外が全部消えたら、0 が1人なら 0 の人。それ以外は持ちこし
function resolveV2(plays) {
  const cnt = new Map();
  for (const c of plays) cnt.set(c, (cnt.get(c) || 0) + 1);
  let best = 0, bi = -1;
  plays.forEach((c, i) => { if (c > 0 && cnt.get(c) === 1 && c > best) { best = c; bi = i; } });
  if (bi >= 0) return { taker: bi, how: 'high' };
  const zeros = plays.map((c, i) => c === 0 ? i : -1).filter(i => i >= 0);
  if (zeros.length === 1) return { taker: zeros[0], how: 'zero' };
  return { taker: -1, how: 'carry' };
}

// A: いちばん大きい数がかぶっていなければ、その人。かぶっていたら 0 の人(1人のとき)
// A2: A で 0 がいない・0もかぶりのときは、かぶっていない中でいちばん大きい人。それもなければ持ちこし
function resolveA(plays, fallback) {
  const cnt = new Map();
  for (const c of plays) cnt.set(c, (cnt.get(c) || 0) + 1);
  const mx = Math.max(...plays);
  if (cnt.get(mx) === 1) return { taker: plays.indexOf(mx), how: 'high' };
  const zeros = plays.map((c, i) => c === 0 ? i : -1).filter(i => i >= 0);
  if (zeros.length === 1) return { taker: zeros[0], how: 'zero' };
  if (fallback) {
    let best = 0, bi = -1;
    plays.forEach((c, i) => { if (c > 0 && cnt.get(c) === 1 && c > best) { best = c; bi = i; } });
    if (bi >= 0) return { taker: bi, how: 'high' };
  }
  return { taker: -1, how: 'carry' };
}

// C1: どこかでかぶって 0 が1人 → 0 の人。そうでなければ、いちばん大きい数がかぶっていなければその人。かぶっていたら持ちこし
function resolveC1(plays) {
  const cnt = new Map();
  for (const c of plays) cnt.set(c, (cnt.get(c) || 0) + 1);
  const dup = [...cnt.values()].some(v => v >= 2);
  const zeros = plays.map((c, i) => c === 0 ? i : -1).filter(i => i >= 0);
  if (dup && zeros.length === 1) return { taker: zeros[0], how: 'zero' };
  const mx = Math.max(...plays);
  if (cnt.get(mx) === 1) return { taker: plays.indexOf(mx), how: 'high' };
  return { taker: -1, how: 'carry' };
}

// 出したものから、その回のルールを作る(同じ特殊カードは重ならない)
function roundCtx(acts, sp, n, N) {
  const used = new Set(), happy = new Set();
  acts.forEach((a, i) => { if (a.use && sp[i]) { used.add(sp[i]); if (sp[i] === 'HAPPY') happy.add(i); } });
  // HH=self: 使った人が取ったときだけ2倍 / ふだん: だれが取っても2倍
  const mult = t => HH === 'self' ? (happy.has(t) ? 2 : 1) : (happy.size ? 2 : 1);
  return { n, N, rev: used.has('BOTTOMS'), second: used.has('BARHOP'), mult };
}

// ---- CPU ----
// state: { me, hands[][], pot, future[](まだ出ていない点数。順番は不明), n, N, sp[](各自の特殊カード。使ったら null) }
// 戻り値: { c: 出す数字, use: 特殊カードを使うか }
const policies = {
  // でたらめ
  random(s) { const h = s.hands[s.me]; return { c: h[ri(h.length)], use: !!s.sp?.[s.me] && rnd() < 1 / h.length }; },

  // ふつう: 点数の高さに合わせて手札の高さを選ぶ。大きい点のときは 0 も使う
  normal(s) {
    const h = s.hands[s.me].slice().sort((a, b) => a - b);
    const nz = h.filter(c => c > 0);
    const my = s.sp?.[s.me];
    if (nz.length === 0) return { c: 0, use: !!my && s.pot > 0 };
    if (s.pot < 0) { // マイナス: 小さい数でにげる(0 は出さない)
      return { c: nz[Math.min(nz.length - 1, rnd() < 0.7 ? 0 : 1)], use: false };
    }
    const futPos = s.future.filter(v => v > 0);
    const all = [s.pot, ...futPos].sort((a, b) => a - b);
    const q = all.length > 1 ? all.indexOf(s.pot) / (all.length - 1) : 1;
    const last = h.length === 1;
    // 特殊カード(大きい点のときに使う)
    if (my && s.pot > 0) {
      const big = s.pot >= Math.max(0, ...futPos);
      if (my === 'BOTTOMS' && (last || (q >= 0.6 && rnd() < 0.5))) return { c: nz[0], use: true }; // 小さい数で取りにいく
      if (my === 'BARHOP' && (last || (q >= 0.6 && rnd() < 0.5))) return { c: nz[Math.min(nz.length - 1, Math.floor(nz.length * 0.6))], use: true }; // 上のほうの真ん中
      if (my === 'HAPPY' && (last || (big && rnd() < 0.7))) {
        if (h[0] === 0 && s.n >= 3 && rnd() < 0.4) return { c: 0, use: true };
        return { c: nz[Math.max(0, nz.length - 1 - ri(2))], use: true }; // 強い数で取りにいく
      }
    }
    const zeroOK = s.n >= 3 || RULE === 'S';
    if (h[0] === 0 && zeroOK && q >= 0.7 && rnd() < 0.45) return { c: 0, use: false };
    let idx = Math.round(q * (nz.length - 1)) + (ri(3) - 1);
    idx = Math.max(0, Math.min(nz.length - 1, idx));
    return { c: nz[idx], use: false };
  },
};

// 考える: 相手が「ふつう」で出すとして、出す候補ごとに何十回もためして、いちばん得なものを選ぶ
// (相手はふつうなので、考えるどうしで同じ手になりすぎることはない)
function makeThinker(samples = 80, lam = 0.6) {
  return function think(s) {
    const h = s.hands[s.me];
    const my = s.sp?.[s.me];
    const fut = s.future.length ? s.future.reduce((a, v) => a + Math.abs(v), 0) / s.future.length : 0;
    const futMax = Math.max(0, ...s.future);
    const sorted = h.slice().sort((a, b) => a - b);
    const opts = [];
    for (const c of h) { opts.push({ c, use: false }); if (my) opts.push({ c, use: true }); }
    if (opts.length === 1) return opts[0];
    const S = USE_SPECIAL ? Math.round(samples / 2) : samples;
    let best = null, bv = -1e9;
    for (const o of opts) {
      let gain = 0;
      for (let k = 0; k < S; k++) {
        const acts = s.hands.map((hh, i) => i === s.me ? o : policies.normal({ ...s, me: i }));
        const ctx = roundCtx(acts, s.sp || [], s.n, s.N);
        const r = resolve(acts.map(a => a.c), ctx);
        if (r.taker === s.me) gain += s.pot * ctx.mult(s.me);
        else if (r.taker >= 0) gain -= s.pot * ctx.mult(r.taker) / (s.n - 1) * 0.3; // 相手が取ると少し損
        else gain += s.pot / s.n * 0.5; // 持ちこしは、あとでだれかのものに
      }
      gain /= S;
      // 手札を使うコスト(強いカード・0 ほど、あとで使いたい)
      const rank = sorted.length > 1 ? sorted.indexOf(o.c) / (sorted.length - 1) : 0;
      let cost = h.length === 1 ? 0 : (o.c === 0 ? lam * fut * 0.9 : lam * fut * rank * 0.8);
      if (o.use && h.length > 1) cost += lam * futMax * 0.4; // 特殊カードも、あとで使いたい
      const v = gain - cost;
      if (v > bv) { bv = v; best = o; }
    }
    return best;
  };
}
policies.thinker = makeThinker();

// ---- 1試合 ----
// pick: 各自の特殊カード(null なら特殊カードなし。'rand' ならランダム)
export function playGame(n, N, pol, pick = null) {
  const hands = Array.from({ length: n }, () => [...Array(N).keys()]);
  const order = makePoints(N);
  const scores = Array(n).fill(0), got = Array(n).fill(0);
  const avail = specialsFor(n);
  const chosen = Array.from({ length: n }, (_, i) => {
    if (!pick) return null;
    const p = Array.isArray(pick) ? pick[i] : pick;
    return p === 'rand' ? avail[ri(avail.length)] : p;
  });
  const sp = chosen.slice();
  const st = { rounds: N, carry: 0, zero: 0, high: 0, leftover: 0, leftoverAbs: 0, spRounds: 0, usedBy: Array(n).fill(0) };
  let pot = 0, potCards = 0;
  for (let r = 0; r < N; r++) {
    pot += order[r]; potCards++;
    const future = order.slice(r + 1);
    const acts = hands.map((h, i) => policies[pol[i]]({ me: i, hands, pot, future, n, N, sp }));
    acts.forEach((a, i) => hands[i].splice(hands[i].indexOf(a.c), 1));
    const ctx = roundCtx(acts, sp, n, N);
    if (acts.some((a, i) => a.use && sp[i])) st.spRounds++;
    acts.forEach((a, i) => { if (a.use && sp[i]) { sp[i] = null; st.usedBy[i] = 1; } });
    const res = resolve(acts.map(a => a.c), ctx);
    st[res.how]++;
    // ハッピーアワーの回に持ちこしになったら、2倍にはしない(取った回だけ2倍)
    if (res.taker >= 0) { scores[res.taker] += pot * ctx.mult(res.taker); got[res.taker] += potCards; pot = 0; potCards = 0; }
  }
  // 最後の持ちこしは、だれのものにもならない
  st.leftover = pot !== 0 ? 1 : 0; st.leftoverAbs = Math.abs(pot);
  // 順位: 点数 → 同じなら取ったカードの枚数
  const key = i => scores[i] * 100 + got[i];
  const top = Math.max(...scores.map((_, i) => key(i)));
  const winners = scores.map((_, i) => key(i) === top ? i : -1).filter(i => i >= 0);
  st.tieTop = winners.length > 1 ? 1 : 0;
  const sortedS = scores.slice().sort((a, b) => b - a);
  st.margin = sortedS[0] - sortedS[1];
  st.winners = winners; st.scores = scores; st.chosen = chosen;
  return st;
}

// ---- 調べる ----
function survey(pol, games) {
  const rows = [];
  for (let n = 2; n <= 8; n++) for (let N = 8; N <= 13; N++) {
    const a = { carry: 0, zero: 0, high: 0, rounds: 0, leftover: 0, leftoverAbs: 0, tieTop: 0, margin: 0 };
    for (let g = 0; g < games; g++) {
      const st = playGame(n, N, Array(n).fill(pol), USE_SPECIAL ? 'rand' : null);
      for (const k in a) a[k] += st[k];
    }
    rows.push({ n, N, carry: a.carry / a.rounds, zero: a.zero / a.rounds, high: a.high / a.rounds, leftover: a.leftover / games, leftoverAbs: a.leftoverAbs / games, tieTop: a.tieTop / games, margin: a.margin / games });
  }
  return rows;
}

function skill(games) {
  const rows = [];
  for (let n = 2; n <= 8; n++) for (const N of (process.env.NS || '8,10,13').split(',').map(Number)) {
    let share = 0;
    for (let g = 0; g < games; g++) {
      const pol = Array(n).fill('normal'); const me = g % n; pol[me] = 'thinker';
      const st = playGame(n, N, pol, USE_SPECIAL ? 'rand' : null);
      if (st.winners.includes(me)) share += 1 / st.winners.length;
    }
    rows.push({ n, N, win: share / games, base: 1 / n });
  }
  return rows;
}

// 特殊カードのバランス: 全員ふつう、特殊カードはランダム。カードごとの勝率と、ゲームの変わり方
function special(games) {
  const Ns = (process.env.NS || '10').split(',').map(Number);
  for (const N of Ns) {
    console.log(`\n=== 特殊カードのバランス(ハッピーアワー=${HH === 'self' ? '使った人だけ2倍' : 'だれでも2倍'}、全員ふつう、手札${N}枚、各${games}試合) ===`);
    console.log(' 人数 | カードごとの勝率(基準=1/人数)                  | 使った率(下剋上/HH/2軒目) | 特殊カードが出た回');
    for (let n = 2; n <= 8; n++) {
      const avail = specialsFor(n);
      const win = {}, cntC = {}, used = {};
      for (const c of avail) { win[c] = 0; cntC[c] = 0; used[c] = 0; }
      let spR = 0, rounds = 0;
      for (let g = 0; g < games; g++) {
        const st = playGame(n, N, Array(n).fill('normal'), 'rand');
        st.chosen.forEach((c, i) => { cntC[c]++; used[c] += st.usedBy[i]; if (st.winners.includes(i)) win[c] += 1 / st.winners.length; });
        spR += st.spRounds; rounds += st.rounds;
      }
      const base = 1 / n;
      const w = SPECIALS.map(c => avail.includes(c) ? `${SP_JA[c]} ${pct(win[c] / cntC[c])}(${(win[c] / cntC[c] / base).toFixed(2)})` : `${SP_JA[c]}   -`.padEnd(14)).join('  ');
      const u = SPECIALS.map(c => avail.includes(c) ? pct(used[c] / cntC[c]) : '  -').join(' ');
      console.log(`  ${n}人 | ${w} | ${u} | ${pct(spR / rounds)}`);
    }
    // 1人だけ特殊カードを持っている(ほかはなし)ときの勝率 = カードそのものの強さ
    console.log(`\n--- 1人だけ特殊カードあり(ほかはなし)の勝率。1.00倍なら得も損もない ---`);
    for (let n = 2; n <= 8; n++) {
      const avail = specialsFor(n);
      const parts = [];
      for (const c of avail) {
        let share = 0;
        for (let g = 0; g < games; g++) {
          const me = g % n; const pick = Array(n).fill(null); pick[me] = c;
          const st = playGame(n, N, Array(n).fill('normal'), pick);
          if (st.winners.includes(me)) share += 1 / st.winners.length;
        }
        parts.push(`${SP_JA[c]} ${(share / games * n).toFixed(2)}倍`);
      }
      console.log(`  ${n}人 | ${parts.join('  ')}`);
    }
    // 特殊カードなし/ありで、ゲームの形がどう変わるか
    console.log(`\n--- ゲームの形(なし → あり) ---`);
    console.log(' 人数 | 持ちこし      | 0 で取る      | 最後に捨てる点');
    for (let n = 2; n <= 8; n++) {
      const r = [null, 'rand'].map(p => {
        const a = { carry: 0, zero: 0, rounds: 0, leftoverAbs: 0 };
        for (let g = 0; g < games; g++) { const st = playGame(n, N, Array(n).fill('normal'), p); for (const k in a) a[k] += st[k]; }
        return a;
      });
      console.log(`  ${n}人 | ${pct(r[0].carry / r[0].rounds)} → ${pct(r[1].carry / r[1].rounds)}  | ${pct(r[0].zero / r[0].rounds)} → ${pct(r[1].zero / r[1].rounds)}  | ${(r[0].leftoverAbs / games).toFixed(1)} → ${(r[1].leftoverAbs / games).toFixed(1)}`);
    }
  }
}

const pct = x => (x * 100).toFixed(0).padStart(3) + '%';
const direct = import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
const mode = direct ? (process.argv[2] || 'survey') : 'none';
if (mode === 'survey') {
  for (const pol of ['normal', 'random']) {
    const games = 3000;
    console.log(`\n=== ルール${RULE}${USE_SPECIAL ? '・特殊カードあり' : ''} 全員「${pol}」 各${games}試合 ===`);
    console.log(' 人数 枚数 | 持ちこし 0で取る 大で取る | 最後に残る(平均点) | 1位が同点 平均点差');
    for (const r of survey(pol, games)) console.log(`  ${r.n}人 ${String(r.N).padStart(2)}枚 |   ${pct(r.carry)}    ${pct(r.zero)}    ${pct(r.high)}  |  ${pct(r.leftover)} (${r.leftoverAbs.toFixed(1)}) | ${pct(r.tieTop)}  ${r.margin.toFixed(1)}`);
  }
} else if (mode === 'skill') {
  const games = Number(process.argv[3] || 400);
  console.log(`\n=== ルール${RULE}${USE_SPECIAL ? '・特殊カードあり' : ''} 考えるCPU 1人 vs ふつう 各${games}試合(勝率。ふつうと同じ強さなら「基準」と同じ) ===`);
  for (const r of skill(games)) console.log(`  ${r.n}人 ${String(r.N).padStart(2)}枚 | 勝率 ${pct(r.win)}  基準 ${pct(r.base)}  (${(r.win / r.base).toFixed(2)}倍)`);
} else if (mode === 'special') {
  USE_SPECIAL = true;
  special(Number(process.argv[3] || 2000));
}
