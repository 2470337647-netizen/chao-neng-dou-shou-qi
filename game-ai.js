/* 超能斗兽棋 —— 电脑对手（启发式评分，不搜索深层）
   用法：CaptainAI.decide(state) → action（可直接交给 CaptainBeast.applyAction） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game-core.js'));
  else root.CaptainAI = factory(root.CaptainBeast);
})(typeof self !== 'undefined' ? self : this, function (g) {
  'use strict';

  function cellsOf(st, owner) {
    var out = [];
    for (var i = 0; i < st.board.length; i++) {
      var u = st.board[i];
      if (u && u.owner === owner) out.push(i);
    }
    return out;
  }

  // 场上（已公开的）还有没有某方的某种动物——AI 不许偷看暗牌，只能看明牌
  function hasRevealed(st, owner, kind) {
    for (var i = 0; i < 25; i++) {
      var u = st.board[i];
      if (u && u.revealed && u.owner === owner && u.kind === kind) return true;
    }
    return false;
  }

  // 这个格子会挨几下（敌方已公开单位里，有几个能打到它）
  function danger(st, cell, me) {
    var foe = g.other(me), n = 0;
    for (var i = 0; i < st.board.length; i++) {
      var u = st.board[i];
      if (!u || u.owner !== foe || !u.revealed) continue;
      var ts = g.moveTargets(st, i);
      for (var j = 0; j < ts.length; j++) if (ts[j].to === cell) n++;
    }
    return n;
  }

  // 危险要按「这只子值多少钱」打折——1 级鼠贴到 8 级象边上，和猫贴到狗边上，是不一样的
  function dangerCost(st, cell, me, u) {
    var d = danger(st, cell, me);
    if (!d) return 0;
    var lv = u ? g.LEVEL[u.kind] : 2;
    return d * (1.2 + lv * 0.8);
  }

  // ---- 两条「看一眼看不出、想一手才看得出」的倾向（2026-10-17 提出：
  //      以深算那几档为灵感，还有没有能提升 AI 棋力的新倾向）------------------------
  // 军师原本是纯静态评分：只看「这一步落点安不安全」，不看「走完之后自己还有没有子挂在对方嘴里」。
  // 深算赢贪心主要就赢在这里，所以把它做成两条可单独开关的评分项。

  // 一次把「对方所有明牌能打到的格子」全扫出来——要连着问很多格子时用它，比逐个格子调 danger() 省得多
  function attackMap(st, me) {
    var foe = g.other(me), m = {};
    for (var i = 0; i < st.board.length; i++) {
      var u = st.board[i];
      if (!u || u.owner !== foe || !u.revealed) continue;
      var ts = g.moveTargets(st, i);
      for (var j = 0; j < ts.length; j++) m[ts[j].to] = (m[ts[j].to] || 0) + 1;
    }
    return m;
  }

  // 现在这一方有多少子**白挂在**对方嘴里：对方已公开的子能打到它、而我没有子能反吃回来（换子不算白送）
  function hangOf(st, me) {
    var foe = g.other(me);
    var atkMap = attackMap(st, me), defMap = attackMap(st, foe);
    var total = 0;
    for (var i = 0; i < st.board.length; i++) {
      var u = st.board[i];
      if (!u || u.owner !== me) continue;
      var atk = atkMap[i] || 0;
      if (!atk) continue;
      if (defMap[i]) continue;
      total += g.LEVEL[u.kind] * (1 + (atk - 1) * 0.4);     // 等级越高越疼，被好几只盯上更疼
    }
    return total;
  }

  // 现在这一方有几个子正咬着对方的**明牌**（下一手能吃掉它）——只算已公开的，暗牌不敢押
  function threatOf(st, me) {
    var total = 0, seen = {};
    for (var i = 0; i < st.board.length; i++) {
      var u = st.board[i];
      if (!u || u.owner !== me || !u.revealed || u.moves <= 0) continue;
      var ts = g.moveTargets(st, i);
      for (var j = 0; j < ts.length; j++) {
        if (ts[j].kind !== 'eat' || seen[ts[j].to]) continue;
        var v = st.board[ts[j].to];
        if (!v || !v.revealed) continue;
        seen[ts[j].to] = 1;
        total += g.LEVEL[v.kind] * 0.6;
      }
    }
    return total;
  }

  // ⚠️ 这个文件浏览器也用 <script> 直接加载，**不能碰 process**（浏览器里没有它，
  // 顶层一读就 ReferenceError，整个 ai 模块全废——2026-10-17 就是这个把电脑搞得
  // 「一手都走不出来、只会放弃回合」）。环境变量一律走这三行。
  var ENV = (typeof process !== 'undefined' && process.env) ? process.env : {};
  function envNum(name, dflt) {
    var raw = ENV[name];
    var v = Number(raw);
    return (raw !== undefined && raw !== '' && isFinite(v)) ? v : dflt;
  }

  var HANG_W = envNum('WHALE_HANG_W', 12);        // 罚的力度（擂台扫过 6/12/24，差别不大）
  var THREAT_W = envNum('WHALE_THREAT_W', 8);     // 奖的力度（擂台扫过 2/4/8，8 最好）
  var REFINE = 40;                    // 给军师榜前 40 手补算这两条（AI 棋手只看前 8 条，够用了），别让每手拖到几十毫秒

  // 离最近的敌人有多远——没有这一项，两边会互相躲到天荒地老
  function nearestFoe(st, cell, me) {
    var foe = g.other(me), q = g.rc(cell), best = 99;
    for (var i = 0; i < st.board.length; i++) {
      var u = st.board[i];
      if (!u || u.owner !== foe) continue;
      var p = g.rc(i), d = Math.abs(q.r - p.r) + Math.abs(q.c - p.c);
      if (d < best) best = d;
    }
    return best === 99 ? 0 : best;
  }

  function around3(st, cell) {
    var q = g.rc(cell), out = [];
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var r = q.r + dr, c = q.c + dc;
        if (r < 0 || r >= g.N || c < 0 || c >= g.N) continue;
        out.push(g.idx(r, c));
      }
    }
    return out;
  }

  function ray(st, cell, dir) {
    var q = g.rc(cell), out = [], r = q.r + dir.dr, c = q.c + dir.dc;
    while (r >= 0 && r < g.N && c >= 0 && c < g.N) {
      out.push(g.idx(r, c));
      r += dir.dr; c += dir.dc;
    }
    return out;
  }

  // 逃生 / 连吃这类「已经在进行中的子决策」
  function resolvePending(st, me) {
    var p = st.pending;
    if (!p) return null;
    if (p.kind === 'escape') {
      var u0 = st.escaped && st.escaped.unit;
      // 逃生落点由「鼠的主人」点（规则书·鼠），而吃鼠那一手往往正是对方回合：
      // 立场必须按 u0.owner 算，跟着 st.turn 会把自家鼠送进敌人怀里（2026-10-16 修）
      var me2 = (u0 && u0.owner) ? u0.owner : me;
      var best = null, bestScore = -1e9;
      for (var i = 0; i < st.board.length; i++) {
        if (st.board[i]) continue;
        if (g.isWater(i) && u0 && !g.isSwimmer(u0)) continue;
        var d = 0, foe = g.other(me2);
        for (var k = 0; k < st.board.length; k++) {
          var e = st.board[k];
          if (e && e.owner === foe) {
            var q1 = g.rc(i), q2 = g.rc(k);
            d += Math.abs(q1.r - q2.r) + Math.abs(q1.c - q2.c);
          }
        }
        var score = d - danger(st, i, me2) * 20;
        if (score > bestScore) { bestScore = score; best = i; }
      }
      return best === null ? { type: 'skip' } : { type: 'escape', to: best };
    }
    if (p.kind === 'chain') {
      var w = st.board[p.cell];
      var best2 = null, best2Score = 0;
      for (var j = 0; j < p.targets.length; j++) {
        var t = p.targets[j], victim = st.board[t];
        if (!victim) continue;
        var s = 20 + g.LEVEL[victim.kind] * 10 - danger(st, t, me) * 6 - (w ? g.LEVEL[w.kind] * 4 : 0);
        if (s > best2Score) { best2Score = s; best2 = t; }
      }
      return best2 === null ? { type: 'skip' } : { type: 'move', from: p.cell, to: best2 };
    }
    return null;
  }

  // 把「所有合法动作 + 军师评分」都枚举出来（decide 与 rank 共用同一套评估）
  // ---- 军师评分项（2026-10-17：每一条倾向都能单独关掉）------------------
  // 关掉哪条，军师就不拿那条倾向给候选打分——招数照旧列出来，只是评分回到中性。
  var TERMS = [
    { id: 'eat',     title: '吃子收益：能吃的先吃',        text: '吃子按对方的等级算收益' },
    { id: 'danger',  title: '危险规避：别把子送到敌人嘴边', text: '落点被多少敌人盯着就扣多少分' },
    { id: 'value',   title: '保值：等级高的子不轻动',      text: '要动的这只等级越高，扣分越多' },
    { id: 'advance', title: '推进：主动往敌人身边压',      text: '离最近的敌人越近越加分' },
    { id: 'once',    title: '一次性技能省着用',            text: '自爆/陨石/猛扑/狮王矢的门槛与机会成本' },
    { id: 'thaw',    title: '敲冰：救自家被冰封的恐龙',    text: '撞自家冰龙优先' },
    { id: 'reveal',  title: '掀牌探路',                    text: '暗牌给一点基础分（不知道是谁，翻开看看）' },
    // 下面两条是「想一手」才看得出的补漏项——2026-10-17 擂台隔离实测（双方都只用军师榜第一名）：
    //   hang 单开 = 77% 胜 · threat 单开 = 66% 胜 · 两条一起开 = 92% 胜（对照 18% / 32% / 7%）
    { id: 'hang',    title: '补漏：走完别把子白挂在对方嘴里', text: '落子之后自己有子被吃、又没人能反吃回来，按等级扣分' },
    { id: 'threat',  title: '压子：咬住对方的明牌',          text: '下一手能吃到对方已公开的子，按它的等级加分' }
  ];
  function allTerms(on) {
    var o = {};
    TERMS.forEach(function (t) { o[t.id] = !t.off; });
    if (on && typeof on === 'object') {
      TERMS.forEach(function (t) { if (typeof on[t.id] === 'boolean') o[t.id] = on[t.id]; });
    }
    return o;
  }

  // 棋力档也管「眼力」（2026-10-17：50 局制、每级要拉开 70%）。
  // 光靠「认真概率」拉不开台阶：实测 p 0.05↔0.15 只有 54%、0.25↔1.00 只有 56~66%。
  // 低档索性少长一只眼——1 档什么都不看（乱走），2 档看吃子/子力/走位/危险/掀牌。
  // 3 档 = 老深算（就是改造前那个满搜索深算）；4 档 = 新深算（同样九条眼力之外，再往前多算一层）。
  // 注意：「补漏 hang」「压子 threat」这两条新眼力**故意不给本地 AI 的 3/4 档**——
  // 实测（2026-10-17，50 局）同样满搜索下带上它们反而 40.0% : 58.0% 输给不带的老深算，
  // 因为深搜本来就看得到还手。它们是给**AI 的军师榜**（rank()）用的，那条线不看 LEVEL_SIGHT。
  var SIGHT7 = { eat: true, value: true, advance: true, once: true, thaw: true, reveal: true, danger: true };
  var LEVEL_SIGHT = {
    1: {},
    2: SIGHT7,
    3: SIGHT7,
    4: SIGHT7
  };
  function sightTerms(n) {
    var s = LEVEL_SIGHT[n];
    if (!s) return null;
    var o = {};
    TERMS.forEach(function (t) { o[t.id] = !!s[t.id]; });
    return o;
  }

  // 搜索内部（对手还手要试很多个局面）用这份「去掉补漏项」的开关：补漏项要真走一手才算得出来，
  // 一局里被调用几百次会把每手拖到几十毫秒；而搜索本来就往前看，用不上它。
  function fastTerms(T) {
    if (!T || (!T.hang && !T.threat)) return T;
    var o = {};
    for (var k in T) o[k] = T[k];
    o.hang = false; o.threat = false;
    return o;
  }

  function scoreAll(st, me, last, T) {     // last = 上一手动作（用来惩罚原路往返）
    T = allTerms(T);
    var acts = [];
    var mine = cellsOf(st, me);

    mine.forEach(function (c) {
      var u = st.board[c];
      if (!u.revealed) return;

      g.skillsFor(st, c).forEach(function (sk) {
        if (sk.id === 'blast') {
          // 2026-10-17：自爆值不值，只看「这一下真能打死谁」，不看对方等级和
          // （5.5 伤害打 7 级狮、8 级象是白送一只豹）
          var pv = g.previewAction(st, { type: 'skill', cell: c, skill: 'blast' });
          if (pv.foeKills > 0 || !T.once) acts.push({ action: { type: 'skill', cell: c, skill: 'blast' },
                                           score: 40 + pv.foeGain * 14 - pv.ownLoss * 16 });
        }
        if (sk.id === 'meteor') {
          // 陨石砸不碎暗牌（只有已公开的会死），自己这条 7.5 级的命也要算成本
          var pv2 = g.previewAction(st, { type: 'skill', cell: c, skill: 'meteor' });
          var must = g.LEVEL[u.kind] + 4;      // 搭进去的命 + 一局只有一次的代价
          if (pv2.foeGain >= must && pv2.foeGain > pv2.ownLoss || !T.once)
            acts.push({ action: { type: 'skill', cell: c, skill: 'meteor' },
                        score: 30 + pv2.foeGain * 10 - pv2.ownLoss * 12 });
        }
        if (sk.id === 'pounce') {
          var q0 = g.rc(c);
          for (var dq = 0; dq < 4; dq++) {     // 猛扑只能打上下左右相邻格，斜角不算
            var rq = q0.r + g.DIR8[dq].dr, cq = q0.c + g.DIR8[dq].dc;
            if (rq < 0 || rq > 4 || cq < 0 || cq > 4) continue;
            var iq = rq * 5 + cq, eq = st.board[iq];
            if (!eq || !eq.revealed) continue;
            if (eq.owner === me) {
              // 冰封中的恐龙是中立困兽：自己的猛扑也能砸它，已经裂了一层就值得补一掌
              if (eq.kind === 'dino' && eq.frozen) {
                acts.push({ action: { type: 'skill', cell: c, skill: 'pounce', target: iq }, score: 26 + (eq.frozenHits === 1 ? 42 : 6) });
              }
              continue;
            }
            if (eq.kind === 'dino' && eq.frozen) {   // 对面的冰龙同样可以猛扑补刀
              acts.push({ action: { type: 'skill', cell: c, skill: 'pounce', target: iq }, score: 20 + (eq.frozenHits === 1 ? 46 : 4) });
              continue;
            }
            if (g.LEVEL[eq.kind] <= 7) {
              // 一局只有一次：走过去就能吃掉的（比如一只 1 级鼠）不值得动用猛扑
              var sc = 50 + g.LEVEL[eq.kind] * 14;
              var plain = g.moveTargets(st, c).some(function (x) { return x.to === iq && x.kind === 'eat'; });
              if (plain && T.once) sc -= 45 + g.LEVEL[eq.kind] * 14 - g.LEVEL[u.kind] * 3;
              acts.push({ action: { type: 'skill', cell: c, skill: 'pounce', target: iq }, score: sc });
            }
          }
        }
        if (sk.id === 'freeze') {
          cellsOf(st, g.other(me)).forEach(function (i) {
            var e = st.board[i];
            if (!e || !e.revealed) return;
            var s = g.LEVEL[e.kind] * 4 + (e.used && e.used.volley === false ? 6 : 0);
            acts.push({ action: { type: 'skill', cell: c, skill: 'freeze', target: i }, score: s });
          });
        }
        if (sk.id === 'kunwave') {
          // 十字波涛：上下左右四条臂各自穿到底（2026-10-18 从「周身一格」改成整臂），每格 6.5
          var pvk = g.previewAction(st, { type: 'skill', cell: c, skill: 'kunwave' });
          var gain = pvk.foeGain - pvk.ownLoss * 1.2;
          if (gain > 0 || !T.once) acts.push({ action: { type: 'skill', cell: c, skill: 'kunwave' },
                                               score: 26 + gain * 12 });
        }
        if (sk.id === 'volley' || sk.id === 'shock') {
          var isV = (sk.id === 'volley');
          for (var d = 0; d < g.DIR8.length; d++) {
            var line = ray(st, c, g.DIR8[d]);
            var g1 = 0, friendly = false;
            for (var li = 0; li < line.length; li++) {
              var e = st.board[line[li]];
              if (!e) continue;
              var dmg = isV ? 7 : 6.5;
              if (isV) {
                // 狮王矢不穿障（2026-10-16 削弱）：只看第一个挡路的单位，暗牌挡箭
                // 冰封中的恐龙是中立困兽，挡在箭路上就会被敲掉一层冰（不分敌我）
                if (e.kind === 'dino' && e.frozen) {
                  if (e.revealed) g1 += (e.owner === me ? 2.4 : 2.0) + (e.frozenHits === 1 ? 4.6 : 0);
                  break;
                }
                if (e.owner === me) break;
                // 打不动就别浪费一局一次的狮王矢（2026-10-17）
                if (e.revealed) {
                  if (g.LEVEL[e.kind] <= dmg) g1 += g.LEVEL[e.kind] * 2;
                  else if (T.once) g1 = -999;        // 打不动就别浪费一局一次的箭
                  else g1 += 0.6;                    // 关掉这条倾向时，打不动也只算一点零头
                }
                break;
              }
              if (e.owner === me) { if (e.revealed) friendly = true; continue; }
              if (!e.revealed) continue;
              g1 += g.LEVEL[e.kind] <= dmg ? g.LEVEL[e.kind] * 2 : 0.6;
            }
            if (friendly) continue;
            if (g1 <= 0) continue;
            acts.push({ action: { type: 'skill', cell: c, skill: sk.id, dir: d }, score: (isV ? 30 : 24) + g1 * 9 });
          }
        }
      });
    });

    // 移动 / 吃子
    var myEle = hasRevealed(st, me, 'elephant');       // 我的象在场 → 对方的鼠就是眼中钉
    mine.forEach(function (c) {
      var u = st.board[c];
      if (!u.revealed || u.moves <= 0) return;      // 行动力用光 / 被禁锢的不能动
      g.moveTargets(st, c).forEach(function (t) {
        var score;
        if (t.kind === 'eat') {
          var victim = st.board[t.to];
          score = (T.eat ? 45 + g.LEVEL[victim.kind] * 14 : 20)
                - (T.danger ? dangerCost(st, t.to, me, u) : 0)
                - (T.value ? g.LEVEL[u.kind] * 3 : 0);
          // 1 级鼠本身不值钱，但它攥着我象的命——清掉它比吃一只猫还值
          if (T.eat && victim.kind === 'mouse' && victim.owner !== me && myEle) score += 36;
          // 我的鼠咬死对方的象：全场最赚的一笔
          if (T.eat && u.kind === 'mouse' && victim.kind === 'elephant') score += 40;
        } else if (t.kind === 'thaw') {
          var icy = st.board[t.to];
          score = T.thaw ? 22 + (icy.frozenHits === 1 ? 34 : 4) : 5;   // 敲自家冰龙
          if (T.danger) score -= danger(st, t.to, me) * 2;
        } else {
          score = 2 + Math.random() * 2
                - (T.danger ? dangerCost(st, t.to, me, u) : 0)
                + (T.advance ? (4 - nearestFoe(st, t.to, me)) * 2.6 : 0);
          if (last && last.type === 'move' && last.from === t.to && last.to === c) score -= 12;
        }
        acts.push({ action: { type: 'move', from: c, to: t.to }, score: score });
      });
    });

    // 掀牌：连自己也不知道哪张是自己的（背面藏着归属），所以对全部暗牌一视同仁
    for (var rc2 = 0; rc2 < 25; rc2++) {
      if (!st.board[rc2] || st.board[rc2].revealed) continue;
      acts.push({ action: { type: 'reveal', cell: rc2 }, score: T.reveal ? 6 + Math.random() * 3 : 0.5 + Math.random() });
    }

    // ---- 补漏项（hang / threat）：真走一手再看「走完之后」的画面，只给榜上靠前的手补算
    if (T.hang || T.threat) {
      var base = acts.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, REFINE);
      var hb = T.hang ? hangOf(st, me) : 0, tb = T.threat ? threatOf(st, me) : 0;
      base.forEach(function (a) {
        var after = step(st, a.action, me);
        if (!after) return;
        if (T.hang) a.score -= HANG_W * (hangOf(after, me) - hb);
        if (T.threat) a.score += THREAT_W * (threatOf(after, me) - tb);
      });
    }

    return acts;
  }

  // ---- 深算档（2026-10-17 要的第三档）-------------------------------
  // 位置评估（站在 me 的角度）：明牌按等级算，暗牌按经验期望估，冰龙等于不存在；
  // 站在对方刀口上的自家子扣分；深海巨兽将临时，十字上的自家子也要躲。
  function evalState(st, me) {
    var s = 0, i, u;
    var foe = g.other(me);
    // 象的命攥在对方的鼠手里；鼠又是换象的宝贝——这两个得互相打折/加价
    var myMouseLive = hasRevealed(st, me, 'mouse') || !!(st.escaped && st.escaped.unit && st.escaped.unit.owner === me && st.escaped.unit.kind === 'mouse');
    var foeMouseLive = hasRevealed(st, foe, 'mouse') || !!(st.escaped && st.escaped.unit && st.escaped.unit.owner === foe && st.escaped.unit.kind === 'mouse');
    // 暗牌里可能还藏着鼠：对方还有几张暗牌，就按概率给象打一点折（两边一样对待）
    var foeHidden = 0, myHidden = 0;
    for (i = 0; i < 25; i++) {
      u = st.board[i];
      if (!u || u.revealed) continue;
      if (u.owner === foe) foeHidden++; else myHidden++;
    }
    for (i = 0; i < 25; i++) {
      u = st.board[i];
      if (!u) continue;
      var v = u.revealed ? u.level : 2.2;
      if (u.revealed && u.kind === 'dino' && u.frozen) v = 0;      // 冰龙不算兵力
      if (u.revealed && u.kind === 'mouse') {
        if (u.owner === me && hasRevealed(st, foe, 'elephant')) v += 2.6;   // 我的鼠能咬掉对方的象
        if (u.owner === foe && hasRevealed(st, me, 'elephant')) v += 2.6;
      }
      s += (u.owner === me ? v : -v);
      if (u.revealed && u.owner === me && danger(st, i, me) > 0) s -= u.level * 0.55;
    }
    var toWhale = g.pliesToWhale(st);
    if (toWhale > 0 && toWhale <= 2) {
      for (i = 0; i < g.WHALE_CELLS.length; i++) {
        u = st.board[g.WHALE_CELLS[i]];
        if (u && u.owner === me) s -= u.revealed ? u.level * 0.5 : 1.0;
      }
    }
    // 正在逃生的鼠还没落位，但它活着（吃鼠那一手不能当成已消灭）
    var esc = st.escaped && st.escaped.unit;
    if (esc) s += (esc.owner === me ? esc.level : -esc.level);
    if (st.over) s += (st.result === me ? 500 : (st.result === 'draw' ? 0 : -500));
    return s;
  }

  // 把一手真的走掉（顺带把「吃鼠等落点 / 狼连吃」这类子决策按最合理的方式结掉）
  function step(st, action, me) {
    var res = null;
    try { res = g.applyAction(st, action); } catch (e) { return null; }
    if (!res || !res.ok) return null;
    var after = res.state;
    var pd = resolvePending(after, after.turn);
    if (pd) {
      var rr = null;
      try { rr = g.applyAction(after, pd); } catch (e) { rr = null; }
      if (rr && rr.ok) after = rr.state;
    }
    return after;
  }

  // 对手会怎么还手：用同一套局面评估（evalState）挑他自己最赚的一手
  function bestReply(st, T, breadth) {
    var foe = st.turn;
    var list = scoreAll(st, foe, null, fastTerms(T));
    if (!list.length) return null;
    list.sort(function (a, b) { return b.score - a.score; });
    var best = null, bestV = -1e9, tried = 0, seen = {};
    for (var i = 0; i < list.length && tried < (breadth || 5); i++) {
      var key = JSON.stringify(list[i].action);
      if (seen[key]) continue;
      seen[key] = 1; tried++;
      var after = step(st, list[i].action, foe);
      if (!after) continue;
      var v = evalState(after, foe) + list[i].score * 0.004;   // 站在对手的角度看
      if (v > bestV) { bestV = v; best = list[i].action; }
    }
    return best;
  }

  // 深算的搜索参数（擂台实测调出来的：宽度指我自己试几手，reply 指对手还手试几手，follow 指我再走试几手）
  var SEARCH = { width: 20, widthBig: 14, reply: 10, follow: 8, reply2: 4, follow2: 3 };

  // 电脑棋力：1~4 四档（界面滑杆 step=1）。每档两个旋钮——
  //   p    = 这一手「认真走」的概率（认真 = 想两手的那套搜索）
  //   noise= 不认真时，愿意在军师榜上挑多差的棋（越大越像乱走）
  // 光靠「搜索/不搜索」分档会出现断崖（实测 3→4 档 83%、4→5 档 82% 一边倒），
  // 用「认真走的比例」分档，楼梯才均匀。
  // 2026-10-17 重新校准（补漏/压子两条倾向默认打开后，贪心变强、老参数把台阶压平了：
  // 旧参数下 2 档 vs 3 档 47.5%:47.5% 打平）——新参数实测每级约 20 个点：
  //   1→2 60.8% · 2→3 59.0%（p 0.30→0.10）· 3→4 58.0%（p 0.65→0.50）
  // 2026-10-17 二次校准（：50 局制、每级要 70%）：p 这个旋钮拧到头也只有 55~66%，
  // 所以四档改用四种不同的旋钮：① 眼力（LEVEL_SIGHT）② 认真概率 p ③ 随手噪声 noise
  // ④ 搜索深度 depth（1 = 我走→他还手；2 = 我走→他还手→我再走）
  var POWER = {
    1: { p: 0.00, noise: 34, depth: 1 },
    2: { p: 0.10, noise: 12, depth: 1 },
    3: { p: 1.00, noise: 0, depth: 1 },
    4: { p: 1.00, noise: 0, depth: 2 }
  };

  function tune(d) {
    var n = Math.round(Number(d));
    if (!isFinite(n)) n = 3;
    n = Math.max(1, Math.min(4, n));
    var t = POWER[n];
    return {
      d: n,
      p: envNum('WHALE_P' + n, t.p),
      noise: envNum('WHALE_NOISE' + n, t.noise),
      depth: t.depth || 2
    };
  }

  // 轮流往下看：depth = 还允许再走几手（1 = 对手还一手，2 = 我再一手…），lv 是层号（选宽度用）
  function minimax(st, me, T, depth, lv, S) {
    if (st.over || depth <= 0) return evalState(st, me);
    S = S || SEARCH;
    var mover = st.turn;
    var n = (mover === me) ? (lv <= 1 ? S.follow : S.follow2)
                           : (lv <= 1 ? S.reply : S.reply2);
    var list = topN(st, mover, T, n);
    if (!list.length) return evalState(st, me);
    var mine = (mover === me);
    var best = mine ? -1e9 : 1e9;
    for (var i = 0; i < list.length; i++) {
      var a = step(st, list[i].action, mover);
      if (!a) continue;
      var v = minimax(a, me, T, depth - 1, lv + 1, S) + list[i].score * 0.004;
      if (mine) { if (v > best) best = v; }
      else { if (v < best) best = v; }
    }
    return (best === -1e9 || best === 1e9) ? evalState(st, me) : best;
  }

  // 军师榜的前 n 手（按分数排序、去掉重复动作）
  function topN(st, me, T, n) {
    var list = scoreAll(st, me, null, T);
    list.sort(function (a, b) { return b.score - a.score; });
    var out = [], seen = {};
    for (var i = 0; i < list.length && out.length < n; i++) {
      var key = JSON.stringify(list[i].action);
      if (seen[key]) continue;
      seen[key] = 1;
      out.push(list[i]);
    }
    return out;
  }

  // 深算：把自己的前十几手都真走一遍，再让对手用同一套评估还一手，比「还手之后」的场面
  // deep=2 时还要再替自己想一手（我走→他走→我再走），这样才不会走出「看着赚、下一手就被吃」的棋
  function pickDeep(st, me, acts, T, deep, S) {
    S = S || SEARCH;
    var best = acts[0], bestV = -1e9, seen = {}, tried = 0;
    var width = (acts.length > 400) ? S.widthBig : S.width;   // 候选太多时少试几个，别把每手拖到太久
    for (var i = 0; i < acts.length && tried < width; i++) {
      var key = JSON.stringify(acts[i].action);
      if (seen[key]) continue;
      seen[key] = 1;
      tried++;
      var after = step(st, acts[i].action, me);
      if (!after) continue;
      var v = (deep <= 0) ? evalState(after, me) : minimax(after, me, T, deep, 1, S);
      v += acts[i].score * 0.005;                           // 同分时还是听军师的
      if (v > bestV) { bestV = v; best = acts[i]; }
    }
    return best;
  }

  // 对手会怎么还手（旧版：只看他自己的军师评分）——留着给外部/测试用
  function bestStatic(st, T) {
    var list = scoreAll(st, st.turn, null, T);
    if (!list.length) return null;
    var best = list[0];
    for (var i = 1; i < list.length; i++) if (list[i].score > best.score) best = list[i];
    return best.action;
  }

  function decide(st, level, opts) {
    var me = st.turn;
    var last = (opts && opts.type) ? opts : ((opts && opts.last) || null);
    var T = allTerms(opts && opts.terms);
    var num = (level !== null && level !== undefined && level !== '' && isFinite(Number(level)))
      ? Math.max(1, Math.min(4, Math.round(Number(level)))) : null;
    if (num) { var sg = sightTerms(num); if (sg) T = sg; }   // 低档少长一只眼（见 LEVEL_SIGHT）
    var pend = resolvePending(st, me);
    if (pend) return pend;

    var acts = scoreAll(st, me, last, T);
    if (!acts.length) return { type: 'skip' };
    acts.sort(function (a, b) { return b.score - a.score; });
    // 难度滑杆（1~4，数字或数字串）：按「这一手认真走的概率」决定是搜一把还是随手挑
    if (num) {
      var P = tune(num);
      if (Math.random() < P.p) return pickDeep(st, me, acts, T, P.depth, SEARCH).action;
      var pool = acts.filter(function (a) { return a.score >= acts[0].score - P.noise; });
      return (pool.length > 1 ? pool[Math.floor(Math.random() * pool.length)] : acts[0]).action;
    }
    if (level === 'careful') {
      // 内部档「认真候选」：一半手认真想一层（老深算），一半手直接听军师——用来填「随意↔深算」之间的断层
      if (Math.random() < 0.5) return pickDeep(st, me, acts, T, 1).action;
      return acts[0].action;
    }
    if (level === 'deep' || level === 'deep2' || level === 'deep3' || level === 'deep4') {
      // 层数：deep2 = 我走→他走；deep/deep3 = 我走→他走→我再走；deep4 = 再让他还一手
      var need = level === 'deep2' ? 1 : (level === 'deep4' ? 3 : 2);
      return pickDeep(st, me, acts, T, need).action;
    }
    var noise = level === 'hard' ? 0 : 12;      // 简单模式：在最优附近随机挑
    var top = acts.filter(function (a) { return a.score >= acts[0].score - noise; });
    return top[Math.floor(Math.random() * top.length)].action;
  }

  // 给外部用（AI 桥）：返回排序好的全部候选 [{action, score}]，让军师把好棋挑出来
  function rank(st, opts) {
    var me = st.turn;
    var T = allTerms(opts && opts.terms);
    var pend = resolvePending(st, me);     // 鼠逃生 / 狼连吃这种子决策优先，没得挑
    if (pend) return [{ action: pend, score: 999 }];
    var acts = scoreAll(st, me, (opts && opts.last) || null, T);
    acts.sort(function (a, b) { return b.score - a.score; });
    return acts;
  }

  return { decide: decide, rank: rank, danger: danger, cellsOf: cellsOf, tune: tune,
           // levels 留作兼容（界面已改成 0~5 的滑杆，不再按档名循环）；deep2/deep3/deep4 是擂台内部档
           evalState: evalState, levels: ['normal', 'hard', 'deep'],
           terms: TERMS, allTerms: allTerms, sightTerms: sightTerms };
});
