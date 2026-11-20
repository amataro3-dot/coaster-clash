// COASTER CLASH コンピューター同士の対戦シミュレーター(ルールを決めるための道具。ゲームでは使わない)
// 使い方: node tools/sim.mjs                 (全部の人数×枚数を調べる)
//         node tools/sim.mjs skill 300       (考えるCPU 1人 vs ふつうのCPU で実力差)
//         RULE=C1 node tools/sim.mjs         (ルールをえらぶ: B=最初のルール, C1=いまのルール, A, A2, V2=ほかの案)
// ルールは muddys-notes の coaster-clash_spec.md(2026-11-20 版)どおり

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

// ---- だれが取るか ----
// 戻り値: { taker: プレイヤー番号 or -1(持ちこし), how: 'high'|'zero'|'carry' }
export let RULE = process.env.RULE || 'B';
export function resolve(plays) {
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

// V2: かぶった数字は消える。のこった中でいちばん大きい数(0以外)の人が取る。
//     0以外が全部消えたら、0 が1人なら 0 の人。それ以外は持ちこし
function resolveV2(plays) {
  const cnt = new Map();
  for (const c of plays) cnt.set(c, (cnt.get(c) || 0) + 1);
  let best = 0, bi = -1;
  plays.forEach((c, i) => { if (c > 0 && cnt.get(c) === 1 && c > best) { best = c; bi = i; } });
  const dup = [...cnt.values()].some(v => v >= 2);
  if (bi >= 0) return { taker: bi, how: 'high' };
  const zeros = plays.map((c, i) => c === 0 ? i : -1).filter(i => i >= 0);
  if (zeros.length === 1 && dup) return { taker: zeros[0], how: 'zero' };
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

// ---- CPU ----
// state: { me, hands[][], pot, future[](まだ出ていない点数。順番は不明), n }
const policies = {
  // でたらめ
  random(s) { const h = s.hands[s.me]; return h[ri(h.length)]; },

  // ふつう: 点数の高さに合わせて手札の高さを選ぶ。大きい点のときは 0 も使う
  normal(s) {
    const h = s.hands[s.me].slice().sort((a, b) => a - b);
    const nz = h.filter(c => c > 0);
    if (nz.length === 0) return 0;
    if (s.pot < 0) { // マイナス: 小さい数でにげる(0 は出さない)
      return nz[Math.min(nz.length - 1, rnd() < 0.7 ? 0 : 1)];
    }
    const all = [s.pot, ...s.future.filter(v => v > 0)].sort((a, b) => a - b);
    const q = all.length > 1 ? all.indexOf(s.pot) / (all.length - 1) : 1;
    if (h[0] === 0 && s.n >= 3 && q >= 0.7 && rnd() < 0.45) return 0;
    let idx = Math.round(q * (nz.length - 1)) + (ri(3) - 1);
    idx = Math.max(0, Math.min(nz.length - 1, idx));
    return nz[idx];
  },
};

// 考える: 相手が「ふつう」で出すとして、出す候補ごとに何十回もためして、いちばん得なものを選ぶ
function makeThinker(samples = 80, lam = 0.6) {
  return function think(s) {
    const h = s.hands[s.me];
    if (h.length === 1) return h[0];
    const fut = s.future.length ? s.future.reduce((a, v) => a + Math.abs(v), 0) / s.future.length : 0;
    const sorted = h.slice().sort((a, b) => a - b);
    let best = null, bv = -1e9;
    for (const c of h) {
      let gain = 0;
      for (let k = 0; k < samples; k++) {
        const plays = s.hands.map((hh, i) => i === s.me ? c : policies.normal({ ...s, me: i }));
        const r = resolve(plays);
        if (r.taker === s.me) gain += s.pot;
        else if (r.taker >= 0) gain -= s.pot / (s.n - 1) * 0.3; // 相手が取ると少し損
        else gain += s.pot / s.n * 0.5; // 持ちこしは、あとでだれかのものに
      }
      gain /= samples;
      // 手札を使うコスト(強いカード・0 ほど、あとで使いたい)
      const rank = sorted.indexOf(c) / (sorted.length - 1);
      const cost = c === 0 ? lam * fut * 0.9 : lam * fut * rank * 0.8;
      const v = gain - cost;
      if (v > bv) { bv = v; best = c; }
    }
    return best;
  };
}
policies.thinker = makeThinker();

// ---- 1試合 ----
export function playGame(n, N, pol) {
  const hands = Array.from({ length: n }, () => [...Array(N).keys()]);
  const order = makePoints(N);
  const scores = Array(n).fill(0);
  const st = { rounds: N, carry: 0, zero: 0, high: 0, leftover: 0, leftoverAbs: 0 };
  let pot = 0;
  for (let r = 0; r < N; r++) {
    pot += order[r];
    const future = order.slice(r + 1);
    const plays = hands.map((h, i) => {
      const c = policies[pol[i]]({ me: i, hands, pot, future, n });
      return c;
    });
    plays.forEach((c, i) => hands[i].splice(hands[i].indexOf(c), 1));
    const res = resolve(plays);
    st[res.how]++;
    if (res.taker >= 0) { scores[res.taker] += pot; pot = 0; }
  }
  if (pot !== 0 || st.carry && pot === 0) { /* 最後の持ちこし */ }
  st.leftover = pot !== 0 ? 1 : 0; st.leftoverAbs = Math.abs(pot);
  const top = Math.max(...scores);
  const winners = scores.map((v, i) => v === top ? i : -1).filter(i => i >= 0);
  st.tieTop = winners.length > 1 ? 1 : 0;
  const sortedS = scores.slice().sort((a, b) => b - a);
  st.margin = sortedS[0] - sortedS[1];
  st.winners = winners; st.scores = scores;
  return st;
}

// ---- 調べる ----
function survey(pol, games) {
  const rows = [];
  for (let n = 2; n <= 8; n++) for (let N = 8; N <= 13; N++) {
    const a = { carry: 0, zero: 0, high: 0, rounds: 0, leftover: 0, leftoverAbs: 0, tieTop: 0, margin: 0 };
    for (let g = 0; g < games; g++) {
      const st = playGame(n, N, Array(n).fill(pol));
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
      const st = playGame(n, N, pol);
      if (st.winners.includes(me)) share += 1 / st.winners.length;
    }
    rows.push({ n, N, win: share / games, base: 1 / n });
  }
  return rows;
}

const pct = x => (x * 100).toFixed(0).padStart(3) + '%';
const mode = process.argv[2] || 'survey';
if (mode === 'survey') {
  for (const pol of ['normal', 'random']) {
    const games = 3000;
    console.log(`\n=== 全員「${pol}」 各${games}試合 ===`);
    console.log(' 人数 枚数 | 持ちこし 0で取る 大で取る | 最後に残る(平均点) | 1位が同点 平均点差');
    for (const r of survey(pol, games)) console.log(`  ${r.n}人 ${String(r.N).padStart(2)}枚 |   ${pct(r.carry)}    ${pct(r.zero)}    ${pct(r.high)}  |  ${pct(r.leftover)} (${r.leftoverAbs.toFixed(1)}) | ${pct(r.tieTop)}  ${r.margin.toFixed(1)}`);
  }
} else if (mode === 'skill') {
  const games = Number(process.argv[3] || 400);
  console.log(`\n=== 考えるCPU 1人 vs ふつう 各${games}試合(勝率。ふつうと同じ強さなら「基準」と同じ) ===`);
  for (const r of skill(games)) console.log(`  ${r.n}人 ${String(r.N).padStart(2)}枚 | 勝率 ${pct(r.win)}  基準 ${pct(r.base)}  (${(r.win / r.base).toFixed(2)}倍)`);
}
