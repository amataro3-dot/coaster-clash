// COASTER CLASH オンライン対戦(v=6〜)
// しくみ(ホスト方式): 部屋を作った人(ホスト)のスマホが、点数カードを混ぜる・判定・コンピューターの思考をして Firebase に書く。
// ほかの人は表示と操作の送信だけ。画面の表示は main.js の関数を使う。
//
// Firebase(専用プロジェクト coaster-clash-e0449)の場所
//   cc-rooms/{番号}            … 部屋(だれでも読める)
//     host                     … ホストの uid
//     createdAt / gidN         … 作った時刻 / 何試合目か
//     cfg {N, auto}            … 手札の枚数(auto = 人数でおすすめ)
//     players/{uid}            … {name, joined, on(つながっているか)}
//     cpus/{id}                … {name, level, at}
//     game                     … 試合(ホストが書く。下の startGame)
//   cc-acts/{番号}/{gk}/{sp | r0..}/{uid} … 出したもの(ホストだけ読める。本人は1回だけ書ける)
//   cc-host/{番号}             … 点数カードの順番(ホストだけ読み書きできる)
'use strict';

const Online = (() => {
  const ROOT = 'cc-rooms', ACTS = 'cc-acts', HOSTP = 'cc-host';
  const S = TIME_SCALE;
  const PICK_MS = 45000 * S, SP_MS = 30000 * S, INTRO_MS = 2600 * S, LINEUP_MS = 6000 * S, WHO_MS = 4500 * S;
  const STALE_MS = 12 * 3600 * 1000; // 12時間たった部屋は、新しい部屋で上書きしてよい
  const TAKEOVER_MS = 3000 * S;      // ホストが切れて、これだけたったら引き継ぐ
  const MAX = 8;

  let db = null, uid = null, ready = false;
  let code = null, room = null, roomRef = null, connected = true;
  let isHost = false, hostTimer = null, actsRef = null, acts = null, hostSec = null;
  let shownKey = '', takeoverAt = 0, cpuLevel = 'normal';
  const stepped = new Set(); // ホスト: 同じ段階を2回進めない
  const TS = () => firebase.database.ServerValue.TIMESTAMP;

  // ---------- 小さい道具 ----------
  const arr = v => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : [];
  const dec = s => s === undefined || s === null || s === '' ? [] : String(s).split(',').map(Number);
  const enc = a => a.join(',');
  const humans = r => Object.entries((r && r.players) || {}).map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (a.joined || 0) - (b.joined || 0) || (a.id < b.id ? -1 : 1));
  const cpus = r => Object.entries((r && r.cpus) || {}).map(([id, c]) => ({ id, ...c })).sort((a, b) => (a.at || 0) - (b.at || 0));
  const hash = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  const rref = p => db.ref(`${ROOT}/${code}${p ? '/' + p : ''}`);
  const err = t => { $('onErr').textContent = t || ''; };
  function net(t) { $('net').textContent = t || ''; $('net').classList.toggle('hide', !t); }
  function warn(where) { return e => { console.warn(where, e); if (e && /permission/i.test(String(e.code || e.message))) net(`うまく書きこめませんでした(${where})`); }; }

  // ---------- はじめる ----------
  function init() {
    try {
      if (!window.firebase || typeof firebaseConfig === 'undefined') throw new Error('Firebase がありません');
      firebase.initializeApp(firebaseConfig);
      if (APP_CHECK_KEY && firebase.appCheck) {
        try { firebase.appCheck().activate(new firebase.appCheck.ReCaptchaEnterpriseProvider(APP_CHECK_KEY), true); } catch (e) { console.warn('App Check', e); }
      }
      db = firebase.database();
      db.ref('.info/serverTimeOffset').on('value', s => { window.SERVER_OFFSET = s.val() || 0; });
      db.ref('.info/connected').on('value', s => {
        connected = s.val() === true;
        if (code) net(connected ? '' : 'つながっていません… 少し待ってね');
        if (connected && code && room && room.players && room.players[uid]) presence();
      });
      firebase.auth().signInAnonymously().then(c => {
        uid = c && c.user && c.user.uid;
        if (!uid) throw new Error('uid がありません');
        ready = true;
        resume();
      }).catch(e => { console.warn('ログイン', e); err('オンラインにつながりませんでした(練習モードは遊べます)'); });
    } catch (e) {
      console.warn(e);
      err('オンラインにつながりませんでした(練習モードは遊べます)');
    }
    setInterval(clientTick, 1000 * S);
  }
  // 前に入っていた部屋に、自動で戻る(同じブラウザ)
  function resume() {
    let s = null;
    try { s = JSON.parse(lsGet('cc-room') || 'null'); } catch (e) { s = null; }
    if (s && s.uid === uid && /^\d{4}$/.test(s.code)) join(s.code, true);
  }
  function presence() {
    const on = rref(`players/${uid}/on`);
    on.onDisconnect().set(false);
    on.set(true).catch(() => { /* 部屋から出たあとなど */ });
  }

  // ---------- 部屋を作る・入る・出る ----------
  async function make() {
    err('');
    if (!ready) return err('つながるまで少し待ってね');
    const name = myName();
    if (!name) { $('inName').focus(); return err('名前を入れてね'); }
    $('btnMake').disabled = true;
    try {
      for (let k = 0; k < 12; k++) {
        const c = String(1000 + ri(9000));
        const s = await db.ref(`${ROOT}/${c}`).once('value');
        const v = s.val();
        if (v && !(v.createdAt < nowMs() - STALE_MS)) continue;
        await db.ref(`${ROOT}/${c}`).set({
          host: uid, createdAt: TS(), gidN: 0, cfg: { N: 10, auto: true },
          players: { [uid]: { name, joined: TS(), on: true } },
        });
        // 古い部屋の残りを消す(ホストになったので消せる)
        await db.ref(`${ACTS}/${c}`).remove().catch(() => {});
        await db.ref(`${HOSTP}/${c}`).remove().catch(() => {});
        enter(c);
        return;
      }
      err('部屋を作れませんでした。もう一度ためしてね');
    } catch (e) { console.warn(e); err('部屋を作れませんでした(' + (e.code || e.message) + ')'); }
    finally { $('btnMake').disabled = false; }
  }

  async function join(c, silent) {
    err('');
    if (!ready) return err('つながるまで少し待ってね');
    c = String(c || '').replace(/\D/g, '');
    if (!/^\d{4}$/.test(c)) return err('4けたの番号を入れてね');
    const name = myName();
    if (!name && !silent) { $('inName').focus(); return err('名前を入れてね'); }
    $('btnJoin').disabled = true;
    try {
      const v = (await db.ref(`${ROOT}/${c}`).once('value')).val();
      const fail = t => { if (silent) lsSet('cc-room', null); else err(t); };
      if (!v || v.createdAt < nowMs() - STALE_MS) return fail('その番号の部屋はありません');
      const seat = v.game ? arr(v.game.seat) : [];
      const si = seat.indexOf(uid);
      const mine = v.players && v.players[uid];
      if (v.game && si < 0) return fail('ゲーム中なので入れません。終わるまで待ってね');
      if (!mine && si < 0 && humans(v).length + cpus(v).length >= MAX) return fail('満員です(8人まで)');
      const nm = si >= 0 ? arr(v.game.names)[si] : mine ? mine.name : name;
      if (!nm) return fail('名前を入れてね');
      await db.ref(`${ROOT}/${c}/players/${uid}`).set({ name: nm, joined: mine ? mine.joined : TS(), on: true });
      enter(c);
    } catch (e) { console.warn(e); if (!silent) err('入れませんでした(' + (e.code || e.message) + ')'); }
    finally { $('btnJoin').disabled = false; }
  }

  function enter(c) {
    code = c;
    lsSet('cc-room', JSON.stringify({ code: c, uid }));
    shownKey = '';
    presence();
    roomRef = db.ref(`${ROOT}/${c}`);
    roomRef.on('value', onRoom, e => { console.warn('部屋', e); leaveLocal('部屋が読めませんでした'); });
  }

  async function leave() {
    const c = code, r = room;
    if (!c) { backToTitle(); return; }
    stopListen();
    try {
      const me = db.ref(`${ROOT}/${c}/players/${uid}`);
      await me.child('on').onDisconnect().cancel();
      if (r && r.host === uid) {
        const others = humans(r).filter(p => p.id !== uid && p.on);
        if (others.length) await db.ref(`${ROOT}/${c}/host`).set(others[0].id);
        else {
          // 人がだれもいなくなるので、部屋ごと消す
          await db.ref(`${ACTS}/${c}`).remove();
          await db.ref(`${HOSTP}/${c}`).remove();
          await db.ref(`${ROOT}/${c}`).remove();
          leaveLocal();
          return;
        }
      }
      await me.remove();
    } catch (e) { console.warn('出る', e); }
    leaveLocal();
  }
  function stopListen() { if (roomRef) roomRef.off(); roomRef = null; stopHost(); }
  function leaveLocal(msg) {
    stopListen();
    code = null; room = null; shownKey = ''; isHost = false;
    lsSet('cc-room', null);
    net('');
    $('askBox').classList.add('hide');
    backToTitle();
    if (msg) err(msg);
  }

  // ---------- 部屋が変わったとき(全員) ----------
  function onRoom(s) {
    const v = s.val();
    if (!code) return;
    if (!v) return leaveLocal('部屋がなくなりました');
    room = v;
    const inSeat = v.game && arr(v.game.seat).includes(uid);
    if (!(v.players && v.players[uid])) {
      if (inSeat) { // ゲーム中に消されたとき(つながり直し)は、もう一度入る
        rref(`players/${uid}`).set({ name: arr(v.game.names)[arr(v.game.seat).indexOf(uid)], joined: TS(), on: true }).then(presence).catch(warn('入り直し'));
      } else return leaveLocal('部屋から出ました');
    }
    checkHost();
    render();
  }

  function checkHost() {
    if (!room) return;
    const now = room.host === uid;
    if (now !== isHost) { isHost = now; if (isHost) startHost(); else stopHost(); }
    const hp = room.players && room.players[room.host];
    if (hp && hp.on) { takeoverAt = 0; return; }
    // ホストがいない・切れた → つながっている人の中で、先に入った人が引き継ぐ
    const first = humans(room).find(p => p.on);
    if (!first || first.id !== uid) { takeoverAt = 0; return; }
    if (!takeoverAt) takeoverAt = nowMs() + TAKEOVER_MS;
    else if (nowMs() >= takeoverAt) { takeoverAt = 0; rref('host').set(uid).catch(warn('ホストの引き継ぎ')); }
  }
  function clientTick() { if (code && room) checkHost(); }

  // ---------- 表示 ----------
  function render() {
    if (!room.game) return renderLobby();
    renderGame(room.game);
  }

  function renderLobby() {
    if (shownKey !== 'lobby') {
      shownKey = 'lobby';
      clearTimers(); stopCountdown(); G = null;
      $('intro').classList.add('hide'); $('band').classList.add('hide');
    }
    const hs = humans(room), cs = cpus(room);
    const total = hs.length + cs.length;
    const N = room.cfg && !room.cfg.auto ? room.cfg.N : recHand(Math.max(2, total));
    $('roomNo').textContent = code;
    const cell = (h) => `<div class="m${h.id === uid ? ' me' : ''}${h.on ? '' : ' off'}">${coaster(hash(h.id) % 12 + 1)}<div class="t">${esc(h.name)}${sub(h)}</div></div>`;
    const sub = h => {
      const t = [h.id === room.host ? 'ホスト' : '', h.id === uid ? 'あなた' : '', h.on ? '' : '切断中'].filter(Boolean).join('・');
      return t ? `<small class="${h.id === uid || h.id === room.host ? 'h' : ''}">${t}</small>` : '';
    };
    const ccell = c => `<div class="m cpu">${coaster(null)}<div class="t">${esc(c.name)}<small>${c.level === 'strong' ? 'つよい' : 'ふつう'}</small></div>${isHost ? `<button class="x" data-c="${c.id}" aria-label="消す">×</button>` : ''}</div>`;
    $('mem').innerHTML = hs.map(cell).join('') + cs.map(ccell).join('') + '<div class="m empty">あき</div>'.repeat(Math.max(0, MAX - total));
    for (const b of $('mem').querySelectorAll('.x')) b.onclick = () => rref(`cpus/${b.dataset.c}`).remove().catch(warn('コンピューター'));
    $('memCnt').textContent = `${total}人 / ${MAX}人まで`;
    $('hostBox').classList.toggle('hide', !isHost);
    $('guestBox').textContent = isHost ? '' : `ホストが始めるのを待っています…(手札 ${N}枚)`;
    if (isHost) {
      seg($('segCL'), [['normal', 'ふつう'], ['strong', 'つよい']], () => cpuLevel, v => { cpuLevel = v; renderLobby(); });
      $('btnCpu').disabled = total >= MAX;
      seg($('segLH'), [8, 9, 10, 11, 12, 13].map(v => [v, v, v === recHand(Math.max(2, total))]), () => N, v => rref('cfg').set({ N: +v, auto: false }).catch(warn('手札')));
      $('hintLH').textContent = `${total}人なら ${recHand(Math.max(2, total))}枚がおすすめ・0〜${N - 1} のコースター・${N}回勝負`;
      const n = hs.filter(h => h.on).length + cs.length;
      $('btnGoGame').disabled = n < 2;
      $('btnGoGame').textContent = n < 2 ? 'あと1人(コンピューターでもOK)' : `▶ スタート(${n}人)`;
    }
    show('scr-lobby');
  }

  function addCpu() {
    if (!isHost || !room) return;
    const cs = cpus(room);
    if (humans(room).length + cs.length >= MAX) return;
    const used = new Set(cs.map(c => c.name));
    let k = 1; while (used.has(`CPU ${k}`)) k++;
    rref(`cpus/c${Date.now().toString(36)}${ri(1000)}`).set({ name: `CPU ${k}`, level: cpuLevel, at: TS() }).catch(warn('コンピューター'));
  }

  // Firebase の game から、画面用の G を作る(点数カードの順番は、出たところまでしかわからない)
  function buildG(g) {
    const seat = arr(g.seat), names = arr(g.names), cpu = arr(g.cpu), hands = arr(g.hands), scores = arr(g.scores),
      got = arr(g.got), sp = arr(g.sp), spUsed = arr(g.spUsed), done = arr(g.done);
    const seq = dec(g.seq), cards = dec(g.cards);
    const order = [...seq, ...cards.filter(v => !seq.includes(v))];
    const players = seat.map((id, i) => ({
      id, name: names[i] || '?', me: id === uid, cpu: !!cpu[i], hand: dec(hands[i]), score: +scores[i] || 0, got: dec(got[i]),
      sp: sp[i] || null, spUsed: !!spUsed[i], off: !cpu[i] && !(room.players && room.players[id] && room.players[id].on),
    }));
    return {
      online: true, isHost, gid: g.gid, gk: g.gk, n: seat.length, N: g.N, players, order, r: Math.max(0, seq.length - 1),
      pot: dec(g.pot), status: seat.map((_, i) => !!done[i]), pick: null, useSp: false, sent: false, mySp: null, spSent: false,
    };
  }

  function renderGame(g) {
    const key = `${g.gid}:${g.phase}:${g.r}`;
    const fresh = key !== shownKey;
    shownKey = key;
    const meI = arr(g.seat).indexOf(uid);
    if (fresh) clearTimers();
    if (!fresh && G) { // つながり・えらんだ印だけ新しくする
      const done = arr(g.done);
      G.isHost = isHost;
      G.players.forEach((p, i) => { p.off = !p.cpu && !(room.players && room.players[p.id] && room.players[p.id].on); });
      G.status = G.players.map((_, i) => !!done[i]);
    }
    switch (g.phase) {
      case 'lineup':
        if (fresh) { stopCountdown(); G = buildG(g); showLineup(); }
        break;
      case 'sp':
        if (fresh) {
          G = buildG(g); G.spSent = !!G.status[meI];
          const last = sentMemo();
          if (last && last.k === `${uid}:${code}:${g.gk}:sp`) { G.spSent = true; G.mySp = last.sp; }
          showSpPick();
          countdown('spRing', 'spBar', g.deadline, SP_MS);
        } else if (G.status[meI] && !G.spSent) { G.spSent = true; drawSpPick(); } else drawSpWait();
        break;
      case 'who':
        if (fresh) { stopCountdown(); G = buildG(g); renderWho(); }
        break;
      case 'pick':
        if (fresh) {
          G = buildG(g); G.sent = !!G.status[meI];
          // 開き直したとき: もう出していたら、その手を出す
          const last = sentMemo();
          if (last && last.k === `${uid}:${code}:${g.gk}:r${g.r}`) { G.sent = true; G.pick = last.c; G.useSp = last.use; }
          renderPick(); showIntro();
          countdown('pkRing', 'pkBar', g.deadline, PICK_MS);
        } else {
          if (G.status[meI] && !G.sent) { G.sent = true; drawHand(); }
          drawBoard($('board'), G.status);
        }
        break;
      case 'res':
        if (fresh) {
          stopCountdown(); G = buildG(g);
          const plays = dec(g.res && g.res.plays), use = dec(g.res && g.res.use);
          playRound(plays.map((c, i) => ({ c, use: !!use[i] })));
        }
        break;
      case 'end':
        if (fresh) { stopCountdown(); $('intro').classList.add('hide'); $('band').classList.add('hide'); G = buildG(g); endGame(); }
        else drawEndButtons();
        break;
    }
  }

  // ---------- 送る(全員) ----------
  // 出したものは、このブラウザにも覚えておく(開き直したときに、もう出したとわかるように)
  function sentMemo() { try { return JSON.parse(lsGet('cc-sent') || 'null'); } catch (e) { return null; } }
  // 1回しか書けないので、2回目ははねられる(前に出したものが使われる)。そのときは何も言わない
  const quiet = where => e => { if (!(e && /permission/i.test(String(e.code || e.message)))) warn(where)(e); };
  function sendPick() {
    if (!G || G.pick === null || G.sent || !code) return;
    const me = meP();
    const use = !!(G.useSp && me.sp && !me.spUsed);
    G.sent = true; drawHand();
    lsSet('cc-sent', JSON.stringify({ k: `${uid}:${code}:${G.gk}:r${G.r}`, c: G.pick, use }));
    db.ref(`${ACTS}/${code}/${G.gk}/r${G.r}/${uid}`).set({ c: G.pick, use }).catch(quiet('コースター'));
  }
  function sendSp() {
    if (!G || !G.mySp || G.spSent || !code) return;
    G.spSent = true; drawSpPick();
    lsSet('cc-sent', JSON.stringify({ k: `${uid}:${code}:${G.gk}:sp`, sp: G.mySp }));
    db.ref(`${ACTS}/${code}/${G.gk}/sp/${uid}`).set(G.mySp).catch(quiet('特殊カード'));
  }

  // ---------- ホストの仕事 ----------
  function startHost() {
    stopHost();
    acts = null; hostSec = null;
    actsRef = db.ref(`${ACTS}/${code}`);
    actsRef.on('value', s => { acts = s.val() || {}; }, e => console.warn('acts', e));
    db.ref(`${HOSTP}/${code}`).once('value').then(s => { hostSec = s.val() || {}; }).catch(() => { hostSec = {}; });
    hostTimer = setInterval(hostTick, 300 * S);
    if (G) { G.isHost = true; if (curScr === 'scr-end') drawEndButtons(); }
  }
  function stopHost() {
    clearInterval(hostTimer); hostTimer = null;
    if (actsRef) actsRef.off(); actsRef = null; acts = null;
  }

  async function startGame() {
    if (!isHost || !room || room.game) return;
    const hs = humans(room), cs = cpus(room);
    const on = hs.filter(h => h.on), off = hs.filter(h => !h.on);
    const seat = [...on.map(h => h.id), ...cs.map(c => 'cpu-' + c.id)];
    if (seat.length < 2) return;
    const n = seat.length;
    const N = room.cfg && !room.cfg.auto ? room.cfg.N : recHand(n);
    const order = makePoints(N);
    const gid = (room.gidN || 0) + 1, gk = 'g' + gid;
    const z = seat.map(() => '');
    const g = {
      gid, gk, phase: 'lineup', r: -1, N, seat,
      names: [...on.map(h => h.name), ...cs.map(c => c.name)],
      cpu: [...on.map(() => ''), ...cs.map(c => c.level || 'normal')],
      cards: enc(order.slice().sort((a, b) => a - b)), seq: '', pot: '',
      hands: seat.map(() => enc([...Array(N).keys()])), scores: seat.map(() => 0), got: z, sp: z, spUsed: seat.map(() => false),
      done: seat.map(() => false), at: nowMs(), deadline: nowMs() + LINEUP_MS,
    };
    $('btnGoGame').disabled = true;
    try {
      hostSec = { gk, order: enc(order) };
      await db.ref(`${HOSTP}/${code}`).set(hostSec);
      await db.ref(`${ACTS}/${code}`).remove();
      const up = { game: g, gidN: gid };
      for (const h of off) up[`players/${h.id}`] = null; // 切れている人は外す
      await roomRef.update(up);
    } catch (e) { warn('スタート')(e); $('btnGoGame').disabled = false; }
  }

  async function again() {
    if (!isHost || !room || !room.game) return;
    try {
      await db.ref(`${ACTS}/${code}`).remove();
      await db.ref(`${HOSTP}/${code}`).remove();
      await rref('game').remove();
    } catch (e) { warn('もう1回')(e); }
  }

  // 試合の状態(ホストの計算用)
  function stateOf(g) {
    const seat = arr(g.seat);
    return {
      N: g.N, n: seat.length, seat, cpu: arr(g.cpu),
      hands: arr(g.hands).map(dec), scores: arr(g.scores).map(Number), got: arr(g.got).map(dec),
      sp: arr(g.sp).map(k => k || null), spUsed: arr(g.spUsed).map(Boolean), pot: dec(g.pot),
    };
  }
  const encState = st => ({ hands: st.hands.map(enc), scores: st.scores, got: st.got.map(enc), sp: st.sp.map(k => k || ''), spUsed: st.spUsed, pot: enc(st.pot) });
  // 1回ぶん進める(main.js の playRound・finishRound と同じ計算)
  function applyRound(st, a) {
    const spn = st.sp.map((k, i) => st.spUsed[i] ? null : k);
    const ctx = roundCtx(a, spn, st.N);
    const plays = a.map(x => x.c);
    plays.forEach((c, i) => { const h = st.hands[i]; const k = h.indexOf(c); if (k >= 0) h.splice(k, 1); });
    a.forEach((x, i) => { if (x.use && spn[i]) st.spUsed[i] = true; });
    const res = resolve(plays, ctx);
    const val = st.pot.reduce((s, v) => s + v, 0);
    if (res.taker >= 0) { st.scores[res.taker] += val * ctx.mult(res.taker); st.got[res.taker].push(...st.pot); st.pot = []; }
    return st;
  }
  // 点数カードの順番(ホストが切れて引き継いだときに、なければ残りを混ぜ直す。残りの順番はもともとランダム)
  function orderOf(g) {
    if (hostSec && hostSec.gk === g.gk && hostSec.order) return dec(hostSec.order);
    const seq = dec(g.seq), rest = shuffle(dec(g.cards).filter(v => !seq.includes(v)));
    hostSec = { gk: g.gk, order: enc([...seq, ...rest]) };
    db.ref(`${HOSTP}/${code}`).set(hostSec).catch(warn('順番'));
    return dec(hostSec.order);
  }
  const cpuDelay = (i, r) => (600 + hash(`${i}:${r}`) % 1800) * S;
  const setGame = patch => rref('game').update(patch);

  function hostTick() {
    const g = room && room.game;
    if (!isHost || !g || acts === null || hostSec === null) return;
    const t = nowMs();
    const key = `${g.gid}:${g.phase}:${g.r}`;
    if (stepped.has(key)) return;
    const st = stateOf(g);
    const A = acts[g.gk] || {};
    const step = (patch) => { stepped.add(key); setGame(patch).catch(e => { stepped.delete(key); warn('進行')(e); }); };
    const sameDone = d => d.every((x, i) => x === !!arr(g.done)[i]);
    switch (g.phase) {
      case 'lineup':
        if (t >= g.deadline) step({ phase: 'sp', deadline: t + SP_MS, done: st.seat.map((_, i) => !!st.cpu[i]) });
        break;
      case 'sp': {
        const a = A.sp || {}, keys = specialsFor(st.n);
        const ok = id => keys.includes(a[id]);
        const done = st.seat.map((id, i) => !!st.cpu[i] || ok(id));
        if (done.every(Boolean) || t >= g.deadline) {
          const sp = st.seat.map((id, i) => !st.cpu[i] && ok(id) ? a[id] : keys[ri(keys.length)]);
          step({ phase: 'who', sp, done, deadline: t + WHO_MS });
        } else if (!sameDone(done)) setGame({ done }).catch(warn('進行'));
        break;
      }
      case 'who':
        if (t >= g.deadline) { stepped.add(key); startRound(g, st, 0).catch(e => { stepped.delete(key); warn('進行')(e); }); }
        break;
      case 'pick': {
        const rk = 'r' + g.r, a = A[rk] || {};
        // コンピューターの分がなければ書く(ホストを引き継いだときなど)
        const missing = st.seat.filter((id, i) => st.cpu[i] && !a[id]);
        if (missing.length) { writeCpu(g, st, orderOf(g)); return; }
        const valid = (x, i) => x && Number.isInteger(x.c) && st.hands[i].includes(x.c);
        const cpuReady = t >= g.at + INTRO_MS + Math.max(0, ...st.seat.map((_, i) => st.cpu[i] ? cpuDelay(i, g.r) : 0));
        const done = st.seat.map((id, i) => st.cpu[i] ? t >= g.at + INTRO_MS + cpuDelay(i, g.r) : valid(a[id], i));
        if ((done.every(Boolean) && cpuReady) || t >= g.deadline) {
          // 時間切れの人は、のこりの手札からランダム(特殊カードは使わない)
          const fin = st.seat.map((id, i) => valid(a[id], i) ? { c: a[id].c, use: !!a[id].use && !!st.sp[i] && !st.spUsed[i] } : { c: st.hands[i][ri(st.hands[i].length)], use: false });
          const spn = st.sp.map((k, i) => st.spUsed[i] ? null : k);
          const bands = roundCtx(fin, spn, st.N).used.size;
          step({ phase: 'res', done: st.seat.map(() => true), res: { plays: enc(fin.map(x => x.c)), use: enc(fin.map(x => x.use ? 1 : 0)) }, deadline: t + (resDuration(st.n, bands) + 700) * S });
        } else if (!sameDone(done)) setGame({ done }).catch(warn('進行'));
        break;
      }
      case 'res':
        if (t >= g.deadline) {
          stepped.add(key);
          const plays = dec(g.res.plays), use = dec(g.res.use);
          applyRound(st, plays.map((c, i) => ({ c, use: !!use[i] })));
          const next = g.r + 1;
          const p = next < st.N ? startRound(g, st, next) : setGame({ phase: 'end', r: next, res: null, done: st.seat.map(() => false), ...encState(st) });
          p.catch(e => { stepped.delete(key); warn('進行')(e); });
        }
        break;
    }
  }

  // 次の回をはじめる: 点数カードを1枚出して、コンピューターの分を決める
  async function startRound(g, st, r) {
    const order = orderOf(g);
    st.pot = [...st.pot, order[r]];
    const t = nowMs();
    const patch = {
      phase: 'pick', r, seq: enc(order.slice(0, r + 1)), at: t, deadline: t + INTRO_MS + PICK_MS,
      done: st.seat.map(() => false), res: null, ...encState(st),
    };
    await writeCpu({ ...g, r }, st, order);
    await setGame(patch);
  }
  const cpuWritten = new Set();
  function writeCpu(g, st, order) {
    const k = `${g.gk}:r${g.r}`;
    if (cpuWritten.has(k)) return Promise.resolve();
    cpuWritten.add(k);
    const pot = st.pot.reduce((s, v) => s + v, 0);
    const base = { hands: st.hands, pot, future: order.slice(g.r + 1), n: st.n, N: st.N, sp: st.sp.map((x, i) => st.spUsed[i] ? null : x) };
    const up = {};
    st.seat.forEach((id, i) => {
      if (!st.cpu[i]) return;
      const a = st.cpu[i] === 'strong' ? cpuStrong({ ...base, me: i }) : cpuNormal({ ...base, me: i });
      up[id] = { c: a.c, use: !!a.use };
    });
    return db.ref(`${ACTS}/${code}/${g.gk}/r${g.r}`).update(up).catch(e => { cpuWritten.delete(k); warn('コンピューター')(e); });
  }

  // ---------- ボタン ----------
  $('btnMake').onclick = make;
  $('btnJoin').onclick = () => join($('inCode').value);
  $('inCode').addEventListener('keydown', e => { if (e.key === 'Enter') join($('inCode').value); });
  $('btnLeave').onclick = () => ask('部屋から出ますか?', leave);
  $('btnCpu').onclick = addCpu;
  $('btnGoGame').onclick = startGame;

  init();
  return { leave, again, sendPick, sendSp, get uid() { return uid; }, get code() { return code; }, get isHost() { return isHost; } };
})();
window.Online = Online; // テスト用
