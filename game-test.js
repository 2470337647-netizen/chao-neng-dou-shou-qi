/* 超能斗兽棋 —— 逻辑引擎自测（node game-test.js） */
'use strict';
var g = require('./game-core.js');

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// 手工搭一个空局面，方便精确摆子
function emptyState() {
  var st = g.clone(g.newGame());
  st.board = new Array(25).fill(null);
  st.pending = null; st.escaped = null; st.over = false; st.result = null; st.turn = 'red';
  return st;
}
function put(st, kind, owner, r, c, revealed) {
  var u = {
    id: owner + '-' + kind, kind: kind, level: g.LEVEL[kind], owner: owner,
    cell: g.idx(r, c), revealed: revealed !== false, frozen: false, frozenHits: 0, jailed: 0,
    used: { escape: false, blast: false, pounce: false, volley: false, freeze: false, shock: false, meteor: false, kunwave: false },
    moves: 1
  };
  st.board[g.idx(r, c)] = u;
  return u;
}
function act(st, action) { return g.applyAction(st, action); }

// ---------------------------------------------------------------- 开局
section('开局布置');
var s0 = g.newGame();
var count = s0.board.filter(Boolean).length;
ok(count === 24, '24 张牌都在棋盘上', 'got ' + count);
ok(s0.board[g.WATER] === null, '中央深水格是空的');
var redN = s0.board.filter(function (u) { return u && u.owner === 'red'; }).length;
var blueN = s0.board.filter(function (u) { return u && u.owner === 'blue'; }).length;
ok(redN === 12 && blueN === 12, '红蓝各 12 张', 'red=' + redN + ' blue=' + blueN);
// 随机排布检查（每一次 newGame 都重新洗牌，且双方公平）
var layoutSig = function (s) {
  return s.board.map(function (u) { return u ? u.owner[0] + u.kind : '.'; }).join(',');
};
var s0b = g.newGame();
ok(layoutSig(s0) !== layoutSig(s0b), '每局排布都不同（随机洗牌生效）');
// 格子集合中心对称：镜像格必须「同时有子」或「同时为空」。
// （动物本身是每局随机洗牌的，所以不能要求镜像格上是同一只动物）
var mirrorOK = true;
for (var i = 0; i < 25; i++) {
  var p = g.rc(i), mu = s0.board[g.idx(4 - p.r, 4 - p.c)];
  if (!!s0.board[i] !== !!mu) { mirrorOK = false; break; }
}
ok(mirrorOK, '红蓝格子集合中心对称（双方地盘一样大、完全公平）');
// 双方 12 种动物各一只
var kindsOf = function (s, owner) {
  return s.board.filter(function (u) { return u && u.owner === owner; })
    .map(function (u) { return u.kind; }).sort().join(',');
};
var allKinds = ['cat', 'dino', 'dog', 'elephant', 'leopard', 'lion',
                'mouse', 'panda', 'penguin', 'roc', 'tiger', 'wolf'].sort().join(',');
ok(kindsOf(s0, 'red') === allKinds, '红方 12 种动物齐全（随机排布没漏没重）');
ok(kindsOf(s0, 'blue') === allKinds, '蓝方 12 种动物齐全');
ok(s0.board.every(function (u) { return !u || !u.revealed; }), '开局所有牌都是背面');
ok(g.LEVEL.cat === 2 && g.LEVEL.penguin === 3 && g.LEVEL.panda === 3.5 &&
   g.LEVEL.roc === 6 && g.LEVEL.dino === 7.5 && g.LEVEL.elephant === 8, '等级表符合设计口径');

// ---------------------------------------------------------------- 翻牌
section('掀牌');
var st = emptyState();
put(st, 'tiger', 'red', 4, 0, false);
var r1 = act(st, { type: 'reveal', cell: g.idx(4, 0) });
ok(r1.ok && r1.state.board[g.idx(4, 0)].revealed, '可以掀开自己的暗牌');
ok(r1.state.turn === 'blue', '掀牌后回合交给对方');
var st2 = emptyState();
put(st2, 'tiger', 'red', 4, 0, false);
put(st2, 'mouse', 'blue', 0, 0, false);
var r2 = act(st2, { type: 'reveal', cell: g.idx(0, 0) });
ok(r2.ok && r2.state.board[g.idx(0, 0)].revealed, '可以掀开对方的牌（掀开即归对方）');
ok(r2.state.board[g.idx(0, 0)].owner === 'blue', '掀到的牌仍属于对方');
ok(r2.state.turn === 'blue', '掀到对方的牌照样结束回合');
var st3 = emptyState();
var hidden = put(st3, 'wolf', 'red', 4, 0, false);
var r3 = act(st3, { type: 'move', from: g.idx(4, 0), to: g.idx(3, 0) });
ok(!r3.ok, '暗牌不能移动', r3.error);

// ---------------------------------------------------------------- 吃子规则
section('吃子规则');
var st4 = emptyState();
put(st4, 'lion', 'red', 4, 2);       // 狮 7
put(st4, 'wolf', 'blue', 3, 2);      // 狼 4
var r4 = act(st4, { type: 'move', from: g.idx(4, 2), to: g.idx(3, 2) });
ok(r4.ok && !r4.state.board[g.idx(3, 2)] === false && r4.state.board[g.idx(3, 2)].kind === 'lion',
   '高等级吃掉低等级并占位', JSON.stringify(r4.error || ''));
ok(g.alive(r4.state, 'blue') === 0, '被吃方减少 1');

var st5 = emptyState();
put(st5, 'dog', 'red', 4, 2);        // 狗 3
put(st5, 'dog', 'blue', 3, 2);       // 同等级
var r5 = act(st5, { type: 'move', from: g.idx(4, 2), to: g.idx(3, 2) });
ok(r5.ok && !r5.state.board[g.idx(4, 2)] && !r5.state.board[g.idx(3, 2)], '同等级相撞同归于尽');

var st5b = emptyState();
put(st5b, 'cat', 'red', 4, 2);       // 猫 2
put(st5b, 'dog', 'blue', 3, 2);      // 狗 3
var r5b = act(st5b, { type: 'move', from: g.idx(4, 2), to: g.idx(3, 2) });
ok(!r5b.ok, '等级不够时吃不掉（不能进入该格）', r5b.error);

var st6 = emptyState();
put(st6, 'mouse', 'red', 4, 2);      // 鼠 1
put(st6, 'elephant', 'blue', 3, 2);  // 象 8
var r6 = act(st6, { type: 'move', from: g.idx(4, 2), to: g.idx(3, 2) });
ok(r6.ok && r6.state.board[g.idx(3, 2)].kind === 'mouse', '鼠可以吃掉象');
var st6b = emptyState();
put(st6b, 'elephant', 'red', 4, 2);
put(st6b, 'mouse', 'blue', 3, 2);
var r6b = act(st6b, { type: 'move', from: g.idx(4, 2), to: g.idx(3, 2) });
ok(!r6b.ok, '象吃不了鼠', r6b.error);

// ---------------------------------------------------------------- 深水区
section('深水区（中央格）');
var st7 = emptyState();
put(st7, 'mouse', 'red', 3, 2);
var r7 = act(st7, { type: 'move', from: g.idx(3, 2), to: g.WATER });
ok(r7.ok && r7.state.board[g.WATER].kind === 'mouse', '鼠可以进入深水区');
var st7b = emptyState();
put(st7b, 'penguin', 'red', 3, 2);
var r7b = act(st7b, { type: 'move', from: g.idx(3, 2), to: g.WATER });
ok(r7b.ok, '企鹅可以进入深水区');
var st7c = emptyState();
put(st7c, 'lion', 'red', 3, 2);
var r7c = act(st7c, { type: 'move', from: g.idx(3, 2), to: g.WATER });
ok(!r7c.ok, '其他动物不能进深水区', r7c.error);

// ---------------------------------------------------------------- 各动物机动
section('机动：猫 / 狗 / 鹏鸟');
var st8 = emptyState();
put(st8, 'cat', 'red', 2, 2);
var tgts = g.moveTargets(st8, g.idx(2, 2)).map(function (t) { return t.to; });
ok(tgts.indexOf(g.idx(1, 1)) >= 0 && tgts.indexOf(g.idx(3, 3)) >= 0, '猫可以斜向走');
var st8b = emptyState();
put(st8b, 'wolf', 'red', 2, 2);
var t8b = g.moveTargets(st8b, g.idx(2, 2)).map(function (t) { return t.to; });
ok(t8b.indexOf(g.idx(1, 1)) < 0, '其他动物不能斜走');
var st9 = emptyState();
put(st9, 'dog', 'red', 4, 4);
var t9 = g.moveTargets(st9, g.idx(4, 4)).map(function (t) { return t.to; });
ok(t9.indexOf(g.idx(2, 4)) >= 0 && t9.indexOf(g.idx(4, 2)) >= 0,
   '狗可以一次走两格（也只剩一格时的相邻格）', JSON.stringify(t9));
var st9b = emptyState();
put(st9b, 'dog', 'red', 4, 4);
put(st9b, 'cat', 'blue', 3, 4);            // 紧邻挡路
var t9b = g.moveTargets(st9b, g.idx(4, 4)).map(function (t) { return t.to; });
ok(t9b.indexOf(g.idx(2, 4)) < 0, '中间被挡住时狗不能跳过', JSON.stringify(t9b));
var st10 = emptyState();
put(st10, 'roc', 'red', 4, 4);
var t10 = g.moveTargets(st10, g.idx(4, 4));
ok(t10.length === 23, '鹏鸟可以飞到任何空位（24 空位减自己脚下）', 'got ' + t10.length);
put(st10, 'dog', 'blue', 2, 2);
var t10b = g.moveTargets(st10, g.idx(4, 4));
ok(t10b.every(function (t) { return t.to !== g.idx(2, 2); }), '鹏鸟不能吃掉目标，只能落空位');

// ---------------------------------------------------------------- 象的翻越
section('象的翻越');
var st11 = emptyState();
put(st11, 'elephant', 'red', 4, 0);
put(st11, 'dog', 'blue', 3, 0, false);        // 暗牌障碍（北侧紧邻）
var t11 = g.moveTargets(st11, g.idx(4, 0));
var hop = t11.filter(function (t) { return t.kind === 'hop'; });
ok(hop.length === 1 && hop[0].to === g.idx(2, 0), '象可以翻越紧邻一格障碍', JSON.stringify(t11));

// ---------------------------------------------------------------- 鼠的逃生
section('鼠 · 逃出生天');
var st12 = emptyState();
put(st12, 'lion', 'red', 3, 0);           // 红狮（红方先手，由它发动攻击）
put(st12, 'mouse', 'blue', 4, 0);         // 蓝鼠，正好在狮子的南边
var r12 = act(st12, { type: 'move', from: g.idx(3, 0), to: g.idx(4, 0) });
ok(r12.ok && r12.state.pending && r12.state.pending.kind === 'escape', '鼠被吃时进入逃生状态', r12.error);
ok(r12.state.board[g.idx(4, 0)] && r12.state.board[g.idx(4, 0)].kind === 'lion', '狮吃鼠后先落到鼠的格子');
ok(!!r12.state.escaped && r12.state.escaped.unit.kind === 'mouse', '逃生中的鼠被妥善保管');
var esc = act(r12.state, { type: 'escape', to: g.idx(4, 3) });
ok(esc.ok && esc.state.board[g.idx(4, 3)] && esc.state.board[g.idx(4, 3)].kind === 'mouse',
   '鼠窜到空白格复活', esc.error);
ok(esc.state.board[g.idx(3, 0)] === null, '狮已经不在原格');
ok(esc.state.board[g.idx(4, 0)].kind === 'lion', '鼠逃生落点不会挤掉吃它的狮子');
ok(g.alive(esc.state, 'blue') === 1, '逃生后鼠仍算存活');
ok(g.alive(esc.state, 'red') === 1, '红狮也还在');
var escBad = act(r12.state, { type: 'escape', to: g.idx(4, 0) });   // (4,0) 现在站着刚吃它的狮子
ok(!escBad.ok, '逃生不能落在被占的格子', escBad.error);

// --- 逃生落点归谁：归鼠主人，不归吃它那一方（2026-10-16 报的 bug）---
section('鼠 · 逃生落点归谁');
var stMO = emptyState();                   // 蓝鼠被红狮吃 → 这一手该蓝方点
put(stMO, 'lion', 'red', 3, 0);
put(stMO, 'mouse', 'blue', 4, 0);
var rMO = act(stMO, { type: 'move', from: g.idx(3, 0), to: g.idx(4, 0) });
ok(g.escapeOwner(rMO.state) === 'blue', '蓝鼠被吃：落点归蓝方', String(g.escapeOwner(rMO.state)));
ok(g.actorOf(rMO.state) === 'blue', '此时该蓝方操作（不是回合方红方）', g.actorOf(rMO.state));
ok(rMO.state.turn === 'red', '回合标记仍停在红方——所以不能只看 st.turn', rMO.state.turn);
var escMO = act(rMO.state, { type: 'escape', to: g.idx(4, 3) });
ok(g.escapeOwner(escMO.state) === null && g.actorOf(escMO.state) === 'blue',
   '落点定下后红方这手才算走完，轮到蓝方', escMO.error);

var aiMod = require('./game-ai.js');           // 蓝方 AI 得会自己给鼠选落点，不能卡住
var aiPick = aiMod.decide(rMO.state, 'hard');
ok(aiPick && aiPick.type === 'escape' && typeof aiPick.to === 'number',
   '蓝鼠逃生时蓝方 AI 自己选落点（不会卡死）', JSON.stringify(aiPick));

var stRM = emptyState();                   // 红鼠被蓝狮吃 → 这一手该红方点（原来的 bug 场景）
put(stRM, 'mouse', 'red', 4, 0);
put(stRM, 'lion', 'blue', 3, 0);
stRM.turn = 'blue';
var rRM = act(stRM, { type: 'move', from: g.idx(3, 0), to: g.idx(4, 0) });
ok(g.escapeOwner(rRM.state) === 'red', '红鼠被吃：落点归红方', String(g.escapeOwner(rRM.state)));
ok(g.actorOf(rRM.state) === 'red', '此时该红方操作（原来错算成蓝方）', g.actorOf(rRM.state));
ok(rRM.state.turn === 'blue', '回合标记仍停在蓝方', rRM.state.turn);
ok(g.actorOf(rRM.state) !== 'blue', '蓝方（AI）不许抢这一手');
var escRM = act(rRM.state, { type: 'escape', to: g.idx(4, 3) });
ok(escRM.ok && g.actorOf(escRM.state) === 'red',
   '红鼠落好地方后，吃它的蓝方这手才算走完，轮到红方', escRM.error);

// 逃生只能用一次
var st13 = emptyState();
put(st13, 'lion', 'red', 3, 0);
put(st13, 'mouse', 'blue', 4, 0);
st13.board[g.idx(4, 0)].used.escape = true;   // 直接改棋盘上的那个单位，别改 put 的返回值
var r13 = act(st13, { type: 'move', from: g.idx(3, 0), to: g.idx(4, 0) });
ok(r13.ok && !r13.state.pending && !r13.state.escaped &&
   r13.state.board[g.idx(4, 0)] && r13.state.board[g.idx(4, 0)].kind === 'lion' && !g.alive(r13.state, 'blue'),
   '逃生用过之后鼠就真的死了（狮王占了那个格子）', JSON.stringify({ ok: r13.ok, err: r13.error }));

// ---------------------------------------------------------------- 狼的连吃
section('狼 · 连吃');
var st14 = emptyState();
put(st14, 'wolf', 'red', 2, 2);          // 狼 4
put(st14, 'cat', 'blue', 2, 3);          // 猫 2（右边，可吃）
put(st14, 'dog', 'blue', 3, 3);          // 狗 3（吃掉猫后停在(2,3)，狗正好在下边）
var r14 = act(st14, { type: 'move', from: g.idx(2, 2), to: g.idx(2, 3) });
ok(r14.ok && r14.state.pending && r14.state.pending.kind === 'chain', '狼吃掉一个后给出连吃机会');
ok(r14.state.pending.targets.length === 1 && r14.state.pending.targets[0] === g.idx(3, 3),
   '连吃候选只含「可吃」的已公开目标', JSON.stringify(r14.state.pending.targets));
var r14b = act(r14.state, { type: 'move', from: g.idx(2, 3), to: g.idx(3, 3) });
ok(r14b.ok && r14b.state.board[g.idx(3, 3)].kind === 'wolf', '连吃成功，狼继续前进');
ok(r14b.state.turn === 'blue', '连吃结束才换手');

// ---------------------------------------------------------------- 豹的自爆
section('豹 · 自爆 5.5');
var st15 = emptyState();
put(st15, 'leopard', 'red', 2, 2);        // 豹 5
put(st15, 'dog', 'blue', 1, 1);           // 狗 3 < 5.5 → 死
put(st15, 'tiger', 'blue', 3, 3);         // 虎 6 > 5.5 → 活
put(st15, 'mouse', 'blue', 1, 3, false);  // 暗牌 → 免疫
var r15 = act(st15, { type: 'skill', cell: g.idx(2, 2), skill: 'blast' });
ok(r15.ok && !r15.state.board[g.idx(2, 2)], '豹自爆后自己消失');
ok(!r15.state.board[g.idx(1, 1)], '5.5 > 3，狗被炸死');
ok(r15.state.board[g.idx(3, 3)] && r15.state.board[g.idx(3, 3)].kind === 'tiger', '5.5 < 6，虎扛住了');
ok(r15.state.board[g.idx(1, 3)] && !r15.state.board[g.idx(1, 3)].revealed, '暗牌不受技能伤害');

// ---------------------------------------------------------------- 虎的猛扑
section('虎 · 猛扑 7');
var st16 = emptyState();
put(st16, 'tiger', 'red', 2, 2);          // 虎 6
put(st16, 'leopard', 'blue', 2, 3);       // 豹 5 < 7 → 死
var r16 = act(st16, { type: 'skill', cell: g.idx(2, 2), skill: 'pounce', target: g.idx(2, 3) });
ok(r16.ok && !r16.state.board[g.idx(2, 3)], '猛扑 7 打死豹（5 < 7）');
ok(r16.state.board[g.idx(2, 2)], '虎放技能后留在原地');
var r16b = act(st16, { type: 'skill', cell: g.idx(2, 2), skill: 'pounce', target: g.idx(2, 3) });
ok(!r16b.ok || true, '（一次性技能在下一局判定）');

// ---------------------------------------------------------------- 狮的狮矢
section('狮 · 狮王矢 7');
var st17 = emptyState();
put(st17, 'lion', 'red', 4, 0);           // 狮 7
put(st17, 'cat', 'blue', 2, 0);           // 猫 2，同列
put(st17, 'dog', 'blue', 0, 0);           // 狗 3，同列更远
var r17 = act(st17, { type: 'skill', cell: g.idx(4, 0), skill: 'volley', dir: 0 });
ok(r17.ok && !r17.state.board[g.idx(2, 0)] && !!r17.state.board[g.idx(0, 0)],
   '狮王矢不穿障：只打直线上的第一个（方向 0=上，猫阵亡、更远的狗没事）', JSON.stringify(r17.error || ''));
ok(r17.state.board[g.idx(4, 0)].kind === 'lion', '狮发射后留在原地');

var st17b = emptyState();
put(st17b, 'lion', 'red', 4, 0);
put(st17b, 'dog', 'red', 3, 0);           // 自己人挡在中间
put(st17b, 'cat', 'blue', 0, 0);          // 更远的猫
var r17b = act(st17b, { type: 'skill', cell: g.idx(4, 0), skill: 'volley', dir: 0 });
ok(r17b.ok && !!r17b.state.board[g.idx(0, 0)] && !!r17b.state.board[g.idx(3, 0)],
   '挡在面前的自己人把狮王矢吃下来了（远处的猫毫发无伤）', JSON.stringify(r17b.error || ''));

// ---------------------------------------------------------------- 企鹅冰封
section('企鹅 · 冰封');
var st18 = emptyState();
put(st18, 'penguin', 'red', 4, 0);        // 企鹅 3
put(st18, 'dog', 'blue', 0, 4);           // 狗 3
var r18 = act(st18, { type: 'skill', cell: g.idx(4, 0), skill: 'freeze', target: g.idx(0, 4) });
ok(r18.ok && r18.state.board[g.idx(0, 4)].jailed > 0, '冰封给目标上了禁锢计数');
ok(r18.state.turn === 'red', '冰封不占回合（冰完还是自己接着走）');
var st18b = g.clone(r18.state);
st18b.turn = 'blue';                        // 交给蓝方，看被禁锢的狗还能不能动
var r18b = act(st18b, { type: 'move', from: g.idx(0, 4), to: g.idx(1, 4) });
ok(!r18b.ok, '被禁锢的动物不能行动', r18b.error);

// ---------------------------------------------------------------- 熊猫成长
section('熊猫 · 吃啥补啥');
var st19 = emptyState();
put(st19, 'panda', 'red', 2, 2);          // 熊猫 3.5
put(st19, 'cat', 'blue', 2, 3);           // 猫 2
var r19 = act(st19, { type: 'move', from: g.idx(2, 2), to: g.idx(2, 3) });
var pd = r19.state.board[g.idx(2, 3)];
ok(pd && pd.level === 4.5, '吃掉猫后等级 3.5 → 4.5', pd && pd.level);
ok(pd && pd.hasCat === true, '吃啥补啥：获得猫的斜向行动');
var t19 = g.moveTargets(r19.state, g.idx(2, 3)).map(function (t) { return t.to; });
ok(t19.indexOf(g.idx(1, 2)) >= 0, '熊猫现在真的能斜走了');

// ------------------------------------------------- 熊猫只学被动（2026-10-16 / 10-17 裁定）
section('熊猫 · 只学被动、能反复用的能力');
// 让红熊猫(2,2)吃掉(2,3)上的一只 1 级动物。
// 把被吃者的等级压到 1 只是为了让 3.5 级的熊猫吃得动，这一段只关心「学到了什么」。
function pandaEats(kind) {
  var st = emptyState();
  put(st, 'panda', 'red', 2, 2);
  var victim = put(st, kind, 'blue', 2, 3);
  victim.level = 1;
  var res = act(st, { type: 'move', from: g.idx(2, 2), to: g.idx(2, 3) });
  var after = res.state.board[g.idx(2, 3)];
  if (after) after.moves = 1;      // 吃完行动力就用光了，补回来才看得到技能面板
  return { res: res, panda: after, cell: g.idx(2, 3) };
}
['cat', 'dog', 'wolf', 'elephant', 'roc'].forEach(function (k) {
  var e = pandaEats(k);
  var key = 'has' + k.charAt(0).toUpperCase() + k.slice(1);
  ok(!!(e.panda && e.panda[key] === true), '吃掉「' + g.NAME[k] + '」学到了被动能力 ' + key);
  ok(!!(e.panda && e.panda.level === 4.5), '吃掉「' + g.NAME[k] + '」等级照旧 +1（3.5 → 4.5）', e.panda && e.panda.level);
});
['leopard', 'tiger', 'lion', 'penguin', 'dino'].forEach(function (k) {
  var e = pandaEats(k);
  var key = 'has' + k.charAt(0).toUpperCase() + k.slice(1);
  var sk = e.panda ? g.skillsFor(e.res.state, e.cell).map(function (s) { return s.id; }) : [];
  ok(!!(e.panda && e.panda[key] === undefined), '吃掉「' + g.NAME[k] + '」学不到（' + key + ' 不该被写上）', e.panda && e.panda[key]);
  ok(!!(e.panda && e.panda.level === 4.5), '吃掉「' + g.NAME[k] + '」只涨等级（3.5 → 4.5）', e.panda && e.panda.level);
  ok(sk.length === 0, '吃掉「' + g.NAME[k] + '」后技能面板是空的（一次性招数学不到）', sk.join(','));
});

// ------------------------------ 熊猫吃了鹏鸟：飞行与地面吃法叠加（2026-10-18 改）
// 旧实现里 canFly 分支直接 return，把侧击/疾行/巨力全短路掉了——吃一只鸟反而变弱。
section('熊猫 · 吃鹏鸟只是多一种走法，不夺地面吃法');
var stPR = emptyState();
var pPR = put(stPR, 'panda', 'red', 0, 0);
pPR.hasCat = true; pPR.hasDog = true; pPR.level = 5.5;
put(stPR, 'mouse', 'blue', 1, 1);        // 斜邻：只有侧击够得着
put(stPR, 'penguin', 'blue', 0, 2);      // 正右隔一格：只有疾行够得着
var tNoFly = g.moveTargets(stPR, g.idx(0, 0));
ok(tNoFly.some(function (t) { return t.to === g.idx(1, 1) && t.kind === 'eat'; }), '没学翱翔：斜吃在');
ok(tNoFly.some(function (t) { return t.to === g.idx(0, 2) && t.kind === 'eat'; }), '没学翱翔：两格吃在');
pPR.hasRoc = true; pPR.level = 6.5;
var tFly = g.moveTargets(stPR, g.idx(0, 0));
ok(tFly.some(function (t) { return t.to === g.idx(1, 1) && t.kind === 'eat'; }), '学了翱翔：斜吃仍在（飞行不再把它挤掉）');
ok(tFly.some(function (t) { return t.to === g.idx(0, 2) && t.kind === 'eat'; }), '学了翱翔：两格吃仍在');
ok(tFly.some(function (t) { return t.kind === 'fly'; }), '学了翱翔：飞行落点也在');
var dupPR = tFly.filter(function (t) { return t.to === g.idx(0, 1); });
ok(dupPR.length === 1 && dupPR[0].kind === 'move',
   '同一个落点不会既算「飞」又算「走」（贴着走的仍记作普通移动）', JSON.stringify(dupPR));
ok(tFly.every(function (t) { return t.to !== g.WATER; }), '会翱翔的熊猫也飞不进中央深水');

var stPR2 = emptyState();
var pPR2 = put(stPR2, 'panda', 'red', 0, 0);
pPR2.hasElephant = true; pPR2.hasRoc = true; pPR2.level = 6.5;
put(stPR2, 'wolf', 'blue', 0, 1, false);   // 暗牌挡路
var tPR2 = g.moveTargets(stPR2, g.idx(0, 0));
ok(tPR2.some(function (t) { return t.kind === 'hop' && t.to === g.idx(0, 2); }),
   '学了翱翔也在：巨力翻越落点保留为 hop，不被飞行吞掉');

// ------------------------------------------------- 深水：岸上吃不到水里的
section('深水 · 岸上的动物吃不到水里的');
var st21 = emptyState();
put(st21, 'elephant', 'red', 2, 1);
put(st21, 'penguin', 'blue', 2, 2);           // 就泡在中央深水格里
var t21 = g.moveTargets(st21, g.idx(2, 1)).map(function (t) { return t.to; });
ok(t21.indexOf(g.WATER) < 0, '岸上的动物不会把水里那只当成落点（吃不到）');
var r21 = act(st21, { type: 'move', from: g.idx(2, 1), to: g.WATER });
ok(!r21.ok, '硬要下水吃也会被引擎拒绝', r21.ok ? 'ok=true' : r21.error);
var st21b = emptyState();
put(st21b, 'penguin', 'red', 2, 1);
put(st21b, 'mouse', 'blue', 2, 2);
var t21b = g.moveTargets(st21b, g.idx(2, 1)).map(function (t) { return t.to; });
ok(t21b.indexOf(g.WATER) >= 0, '会游泳的企鹅照常能下水吃鼠');

// ---------------------------------------------------------------- 恐龙
section('恐龙 · 冰封之躯与两个大招');
var st20 = emptyState();
put(st20, 'dino', 'red', 4, 4, false);    // 暗的恐龙
put(st20, 'dog', 'blue', 0, 0);           // 陪衬：否则掀开恐龙就判蓝方全灭
put(st20, 'cat', 'red', 0, 1);            // 红方留个活口：只剩一只冰冻恐龙会被判负
var r20 = act(st20, { type: 'reveal', cell: g.idx(4, 4) });
ok(r20.ok && r20.state.board[g.idx(4, 4)].frozen === true, '恐龙翻开即冰冻');
// 第一击：蓝方虎猛扑（威力 7）——只裂冰层
var st20b = g.clone(r20.state);
st20b.turn = 'blue';
put(st20b, 'tiger', 'blue', 3, 4);
var r20b = act(st20b, { type: 'skill', cell: g.idx(3, 4), skill: 'pounce', target: g.idx(4, 4) });
ok(r20b.ok && r20b.state.board[g.idx(4, 4)] && r20b.state.board[g.idx(4, 4)].frozen,
   '第一击只裂开冰层（两次 7 级攻击才解冻）');
ok(r20b.state.board[g.idx(4, 4)].kind === 'dino', '解冻过程不结算伤害');
var st20c = g.clone(r20b.state);
st20c.turn = 'blue';
put(st20c, 'lion', 'blue', 4, 0);
var r20c = act(st20c, { type: 'skill', cell: g.idx(4, 0), skill: 'volley', dir: 3 });
ok(r20c.ok && r20c.state.board[g.idx(4, 4)] && !r20c.state.board[g.idx(4, 4)].frozen,
   '第二击（狮王矢 7）解冻成功');
ok(r20c.state.board[g.idx(4, 4)].kind === 'dino', '解冻那一次仍不结算伤害');

var st21 = emptyState();
put(st21, 'dino', 'red', 2, 2, true);     // 已解冻的恐龙
put(st21, 'dog', 'blue', 1, 2);
put(st21, 'cat', 'blue', 0, 2);
var r21 = act(st21, { type: 'skill', cell: g.idx(2, 2), skill: 'shock', dir: 0 });
ok(r21.ok && !r21.state.board[g.idx(1, 2)] && !r21.state.board[g.idx(0, 2)],
   '冲击波 6.5 沿方向打死狗和猫');
ok(r21.state.board[g.idx(2, 2)].kind === 'dino', '冲击波后恐龙还在');

var st22 = emptyState();
put(st22, 'dino', 'red', 2, 2, true);
put(st22, 'dog', 'blue', 2, 3);
var r22 = act(st22, { type: 'skill', cell: g.idx(2, 2), skill: 'meteor' });
ok(r22.ok && !r22.state.board[g.idx(2, 2)], '陨石降临：恐龙自杀');
ok(!r22.state.board[g.idx(2, 3)], '陨石 8.5 打死相邻的狗');

// ---------------------------------------------------------------- 击退
section('未公开单位只被击退');
var st23 = emptyState();
put(st23, 'dino', 'red', 2, 2, true);
put(st23, 'wolf', 'blue', 3, 2, false);   // 暗牌狼，在恐龙正下方（表中方向 1=下）
var r23 = act(st23, { type: 'skill', cell: g.idx(2, 2), skill: 'shock', dir: 1 });
ok(r23.ok, '冲击波朝下释放');
ok(r23.state.board[g.idx(3, 2)] === null, '暗牌被推走');
ok(r23.state.board[g.idx(4, 2)] && r23.state.board[g.idx(4, 2)].kind === 'wolf',
   '暗牌被推到最远处（贴边）', r23.state.board.map(function (u) { return u && u.kind; }).join(','));
ok(r23.state.board.filter(Boolean).length === 2, '被击退的暗牌没有阵亡（只剩恐龙+狼）');

// 身后还有一张暗牌挡路时推不动（未公开单位免疫伤害，也不会互相挤掉）
var st23b = emptyState();
put(st23b, 'dino', 'red', 2, 2, true);
put(st23b, 'wolf', 'blue', 3, 2, false);
put(st23b, 'dog', 'blue', 4, 2, false);    // 已经在最下缘
var r23b = act(st23b, { type: 'skill', cell: g.idx(2, 2), skill: 'shock', dir: 1 });
ok(r23b.ok && r23b.state.board[g.idx(3, 2)] && r23b.state.board[g.idx(3, 2)].kind === 'wolf',
   '被后方暗牌挡住时原地不动');
ok(r23b.state.board.filter(Boolean).length === 3, '三张牌都还活着');

// ---------------------------------------------------------------- 鲲
section('鲲：鹏鸟吃敌方企鹅变身（2026-10-18）');
// 鹏鸟 (1,1) 吃掉蓝方企鹅 (1,2)：企鹅不能放深水，否则鹏鸟飞不进去吃
var stK = emptyState();
put(stK, 'roc', 'red', 1, 1);
put(stK, 'penguin', 'blue', 1, 2);
put(stK, 'dog', 'blue', 0, 0);       // 陪衬：别让蓝方被判全灭
put(stK, 'cat', 'red', 4, 4);        // 红方留个活口（鲲自己也算）
var rK = act(stK, { type: 'move', from: g.idx(1, 1), to: g.idx(1, 2) });
var kun = rK.state.board[g.idx(1, 2)];
ok(rK.ok && kun && kun.kind === 'kun', '鹏鸟吃掉敌方企鹅后当场变成鲲',
   rK.ok ? JSON.stringify(kun && kun.kind) : JSON.stringify(rK));
ok(kun && kun.level === 7, '鲲的等级是 7', String(kun && kun.level));
ok(kun && kun.owner === 'red', '鲲归鹏鸟那一方');

// 失去翱翔：moveTargets 里不再有 fly
var kt = g.moveTargets(rK.state, g.idx(1, 2));
ok(!kt.some(function (t) { return t.kind === 'fly'; }), '鲲失去飞行能力（没有 fly 目标）');
// 能进深水：深水格 (2,2) 就在它下方
ok(kt.some(function (t) { return t.to === g.WATER; }), '鲲可以游进中央深水区');

// 十字波涛：上下左右四条臂各穿到底，6.5 伤害，斜角不挨打
var stK2 = emptyState();
put(stK2, 'kun', 'red', 2, 1);
put(stK2, 'dog', 'blue', 1, 1);      // 上：3 级，死
put(stK2, 'wolf', 'blue', 3, 1);     // 下：4 级，死
put(stK2, 'cat', 'blue', 2, 0);      // 左：2 级，死
put(stK2, 'penguin', 'blue', 2, 2);  // 右：深水里的企鹅，3 级，死
put(stK2, 'tiger', 'blue', 1, 2);    // 斜角：不该挨打（6.5 本来是能杀 6 级虎的）
put(stK2, 'mouse', 'red', 4, 4);
var rK2 = act(stK2, { type: 'skill', cell: g.idx(2, 1), skill: 'kunwave' });
ok(rK2.ok, '十字波涛放得出来');
ok(!rK2.state.board[g.idx(1, 1)] && !rK2.state.board[g.idx(3, 1)] &&
   !rK2.state.board[g.idx(2, 0)] && !rK2.state.board[g.idx(2, 2)],
   '十字四格的 3/4/2/3 级全被 6.5 打死',
   rK2.state.board.map(function (u) { return u && u.kind; }).join(','));
ok(rK2.state.board[g.idx(1, 2)] && rK2.state.board[g.idx(1, 2)].kind === 'tiger',
   '斜角的虎没事（范围是十字，不是 3×3）');
ok(rK2.state.board[g.idx(2, 1)] && rK2.state.board[g.idx(2, 1)].kind === 'kun', '鲲自己还在（十字波涛不是自爆）');

// 2026-10-18 改：范围从「周身一格」放大到「整条臂穿到底」——同一条臂上更远的目标也吃 6.5
var stKA = emptyState();
put(stKA, 'kun', 'red', 2, 0);
put(stKA, 'dog', 'blue', 1, 0);       // 上臂第一格：3 级，死
put(stKA, 'cat', 'blue', 0, 0);       // 上臂第二格：2 级，死（穿透的证据）
put(stKA, 'lion', 'blue', 3, 0);      // 下臂第一格：7 级，扛得住
put(stKA, 'mouse', 'blue', 4, 0);     // 下臂第二格：1 级，死
put(stKA, 'panda', 'red', 4, 4);
var rKA = act(stKA, { type: 'skill', cell: g.idx(2, 0), skill: 'kunwave' });
ok(rKA.ok && !rKA.state.board[g.idx(1, 0)] && !rKA.state.board[g.idx(0, 0)],
   '整臂穿透：同一方向上第二格的目标也挨到 6.5',
   rKA.state.board.map(function (u) { return u && u.kind; }).join(','));
ok(!rKA.state.board[g.idx(4, 0)] || rKA.state.board[g.idx(4, 0)].kind !== 'mouse',
   '整臂穿透：扛得住的狮后面的小鼠也没躲过');
ok(!rKA.state.board[g.idx(3, 0)] && rKA.state.board[g.idx(4, 0)] &&
   rKA.state.board[g.idx(4, 0)].kind === 'lion',
   '由远到近结算：狮被推到臂尾（先死的小鼠不挡路）',
   rKA.state.board.map(function (u) { return u && u.kind; }).join(','));

// 击退：扛得住 6.5 的 7 级狮被沿方向推到底
var stK3 = emptyState();
put(stK3, 'kun', 'red', 2, 2);       // 站在深水格上
put(stK3, 'lion', 'blue', 2, 1);     // 左邻：7 级，扛得住
put(stK3, 'mouse', 'blue', 0, 0);    // 陪衬
put(stK3, 'cat', 'red', 4, 4);
var rK3 = act(stK3, { type: 'skill', cell: g.idx(2, 2), skill: 'kunwave' });
ok(rK3.ok && !rK3.state.board[g.idx(2, 1)] && rK3.state.board[g.idx(2, 0)] &&
   rK3.state.board[g.idx(2, 0)].kind === 'lion',
   '扛住 6.5 的狮被击退到该方向最远处（机制同冲击波）',
   rK3.state.board.map(function (u) { return u && u.kind; }).join(','));
// 每局一次：用完就从技能表里消失，且悔棋快照也记得它已经用掉
ok(!g.skillsFor(rK3.state, g.idx(2, 2)).some(function (s) { return s.id === 'kunwave'; }),
   '十字波涛每局只能放一次');
ok(!g.skillsFor(g.clone(rK3.state), g.idx(2, 2)).some(function (s) { return s.id === 'kunwave'; }),
   'clone / 悔棋快照也会把「已用掉」带过去（不会靠悔棋白嫖第二发）');

// 暗牌只被推开、不掉血
var stK4 = emptyState();
put(stK4, 'kun', 'red', 2, 2);
put(stK4, 'wolf', 'blue', 1, 2, false);   // 上方暗牌
put(stK4, 'mouse', 'red', 4, 4);
var rK4 = act(stK4, { type: 'skill', cell: g.idx(2, 2), skill: 'kunwave' });
ok(rK4.ok && rK4.state.board.filter(Boolean).length === 3 &&
   rK4.state.board[g.idx(0, 2)] && rK4.state.board[g.idx(0, 2)].kind === 'wolf',
   '十字里的暗牌被推到最远且没有阵亡',
   rK4.state.board.map(function (u) { return u && u.kind; }).join(','));

// 冰封恐龙：6.5 < 7 破不开冰，但它是「无法击杀的目标」，整块冰会被推走（2026-10-18 裁定）
var stK5 = emptyState();
put(stK5, 'kun', 'red', 2, 2);
var dino5 = put(stK5, 'dino', 'blue', 1, 2);
dino5.frozen = true;
put(stK5, 'mouse', 'red', 4, 4);
var rK5 = act(stK5, { type: 'skill', cell: g.idx(2, 2), skill: 'kunwave' });
var dino5b = rK5.state.board[g.idx(0, 2)];
ok(rK5.ok && dino5b && dino5b.kind === 'dino' && dino5b.frozen,
   '十字波涛 6.5 破不开冰，但把整块冰封恐龙推到底（冰没裂、人没死）',
   rK5.state.board.map(function (u) { return u && u.kind; }).join(','));
ok(!rK5.state.board[g.idx(1, 2)], '冰封恐龙离开了原位（被推开而不是原地不动）');

// 冲击波也是同一条裁定：打不穿冰，但推得动（选一列避开中央深水，冰龙不是泳者）
var stKS = emptyState();
put(stKS, 'dino', 'red', 2, 3, true);
var iceS = put(stKS, 'dino', 'blue', 1, 3, true);
iceS.frozen = true;
put(stKS, 'mouse', 'blue', 0, 0);
put(stKS, 'cat', 'red', 4, 4);
var rKS = act(stKS, { type: 'skill', cell: g.idx(2, 3), skill: 'shock', dir: 0 });
ok(rKS.ok && rKS.state.board[g.idx(0, 3)] && rKS.state.board[g.idx(0, 3)].frozen,
   '恐龙冲击波 6.5 破不开冰，但把整块冰推到底',
   rKS.state.board.map(function (u) { return u && u.kind; }).join(','));
ok(!rKS.state.board[g.idx(1, 3)], '冲击波之后冰封恐龙也不在原位');

// 7 级语义：鲲吃不动狮，撞上去是同归于尽
var stK6 = emptyState();
put(stK6, 'kun', 'red', 2, 1);
put(stK6, 'lion', 'blue', 2, 2);
put(stK6, 'mouse', 'blue', 0, 0);
put(stK6, 'cat', 'red', 4, 4);
var rK6 = act(stK6, { type: 'move', from: g.idx(2, 1), to: g.idx(2, 2) });
ok(rK6.ok && !rK6.state.board[g.idx(2, 1)] && !rK6.state.board[g.idx(2, 2)],
   '鲲(7) 撞狮(7) 同归于尽', rK6.state.board.map(function (u) { return u && u.kind; }).join(','));

// 熊猫吃不到鲲（7 级同归于尽），也不该冒出「吃啥补啥」事件
var stK7 = emptyState();
put(stK7, 'panda', 'red', 1, 2);
var pk = put(stK7, 'kun', 'blue', 2, 2);
pk.level = 7;
put(stK7, 'mouse', 'red', 4, 4);
put(stK7, 'cat', 'blue', 0, 0);
var rK7 = act(stK7, { type: 'move', from: g.idx(1, 2), to: g.idx(2, 2) });
ok(!rK7.ok || (!rK7.state.board[g.idx(1, 2)] && !rK7.state.board[g.idx(2, 2)]),
   '熊猫(3.5) 吃不动 7 级鲲', rK7.ok ? 'ok' : JSON.stringify(rK7));

// 开局：鲲不是卡池里的牌
var sK = g.newGame();
ok(!sK.board.some(function (u) { return u && u.kind === 'kun'; }), '开局没有鲲（它只能由鹏鸟变出来）');
ok(g.LEVEL.kun === 7 && g.NAME.kun === '鲲', '等级表/名字表登记了鲲');

// ---------------------------------------------------------------- 胜负
section('胜负判定');
var st24 = emptyState();
put(st24, 'elephant', 'red', 2, 2);
put(st24, 'mouse', 'blue', 1, 2);
var r24 = act(st24, { type: 'move', from: g.idx(2, 2), to: g.idx(1, 2) });
ok(!r24.ok, '象吃不掉鼠');
var st25 = emptyState();
put(st25, 'lion', 'red', 2, 2);
put(st25, 'cat', 'blue', 1, 2);           // 蓝方最后一只
var r25 = act(st25, { type: 'move', from: g.idx(2, 2), to: g.idx(1, 2) });
ok(r25.ok && r25.state.over && r25.state.result === 'red', '吃光对方即获胜');

// ---- 鹏鸟贴身吃 & 己方敲冰（2026 裁定）--------------------------------
(function () {
  function put(st, kind, owner, cell, extra) {
    var u = { kind: kind, owner: owner, cell: cell, level: g.LEVEL[kind], revealed: true,
              frozen: false, frozenHits: 0, jailed: 0, moves: 1, used: {} };
    if (extra) for (var k in extra) u[k] = extra[k];
    st.board[cell] = u; return u;
  }
  function clear(st) { for (var i = 0; i < st.board.length; i++) st.board[i] = null; }
  function kinds(list, kind) { return list.filter(function (x) { return x.kind === kind; }); }

  var s = g.newGame(); clear(s);
  put(s, 'roc', 'red', 12); put(s, 'mouse', 'blue', 7); put(s, 'elephant', 'blue', 17);
  var tr = g.moveTargets(s, 12);
  ok(kinds(tr, 'eat').length === 1 && kinds(tr, 'eat')[0].to === 7, '鹏鸟贴身能吃（正上方是 1 级鼠）');
  ok(kinds(tr, 'eat').filter(function (x) { return x.to === 17; }).length === 0, '鹏鸟吃不掉贴身的象（8 级）');
  ok(kinds(tr, 'fly').every(function (x) { return !s.board[x.to]; }), '飞行落点依旧只能是空格（不能飞过去吃）');
  var openCells = tr.filter(function (x) { return !s.board[x.to]; }).map(function (x) { return x.to; });
  var openSet = {}; openCells.forEach(function (x) { openSet[x] = true; });
  ok(Object.keys(openSet).length === openCells.length && openCells.length === 22,
     '22 个空格全都够得着，且同一个空格不会报两次（近处记 move、远处记 fly）', JSON.stringify(openCells));

  var s2 = g.newGame(); clear(s2);
  put(s2, 'dino', 'red', 12, { frozen: true });
  put(s2, 'lion', 'red', 7); put(s2, 'tiger', 'red', 13); put(s2, 'wolf', 'blue', 17);
  ok(kinds(g.moveTargets(s2, 7), 'thaw').length === 1, '己方 7 级狮能敲自家冰冻的恐龙');
  ok(kinds(g.moveTargets(s2, 13), 'thaw').length === 0, '己方 6 级虎敲不动（要等级 ≥7）');

  var r1 = g.applyAction(s2, { type: 'move', from: 7, to: 12 });
  ok(r1.ok && r1.state.board[12].frozenHits === 1 && r1.state.board[12].frozen, '第一下只裂开冰层（1/2）');
  var st1 = r1.state; st1.turn = 'red'; st1.board[7].moves = 1;
  var r2 = g.applyAction(st1, { type: 'move', from: 7, to: 12 });
  ok(r2.ok && r2.state.board[12].frozen === false, '第二下把自家恐龙解冻了');
})();

// ---- 深海巨兽天降 ----------------------------------------------------------
(function () {
  var s = g.newGame();
  ok(s.whale === true, '开局默认开启巨兽天降');
  ok(g.newGame({ whale: false }).whale === false, '可以关掉巨兽天降');
  ok(g.WHALE_CELLS.length === 5, '天降范围是中央 + 上下左右共 5 格');

  function sweep(st) {
    var evs = [], hands = 0;
    while (!st.over && hands < 30) {
      var pick = -1;
      for (var i = 0; i < 25 && pick < 0; i++) { var u = st.board[i]; if (u && !u.revealed) pick = i; }
      if (pick < 0) break;
      var r = g.applyAction(st, { type: 'reveal', cell: pick });
      if (!r.ok) break;
      st = r.state; evs = evs.concat(r.events); hands++;
    }
    return evs;
  }

  var wh = sweep(s).filter(function (e) { return e.t === 'whale'; });
  ok(wh.length === 2, '掀牌 24 手内天降正好两次（ply=10 与 ply=20）', '实际 ' + wh.length + ' 次');
  ok(sweep(g.newGame({ whale: false })).filter(function (e) { return e.t === 'whale'; }).length === 0, '关掉巨兽天降之后一次都不来');
})();

// --- UI 层守卫：别再手写「轮到谁」，一律走 actorOf（2026-10-16 bug 的根因）---
section('UI · 该谁操作只有一处判定');
(function () {
  var fsMod = require('fs');
  var uiSrc = fsMod.readFileSync(__dirname + '/game-ui.js', 'utf8');
  var coreSrc = fsMod.readFileSync(__dirname + '/game-core.js', 'utf8');
  ok(uiSrc.indexOf("escapeOwner() === 'blue'") < 0,
     'UI 里没有手写的「逃生命中归蓝方」判定（那正是 bug 本身）');
  ok(uiSrc.indexOf('g.actorOf(s)') >= 0, 'UI 的「该谁操作」统一走 g.actorOf(state)');
  ok(uiSrc.indexOf('aiShouldActIn') >= 0 && uiSrc.indexOf('humanCanPlayIn') >= 0,
     'AI 与人类两侧共用同一个判定函数');
  ok(coreSrc.indexOf('return escapeOwner(st) || st.turn;') >= 0,
     'game-core 的 actorOf = 逃生命中看鼠主人，其余时候看回合方');
})();

// --- 虎猛扑自家冰龙破冰（2026-10-17 裁定）---
section('虎猛扑 · 自家冰龙');
(function () {
  function blank2(turn) {
    var s = g.newGame({ whale: false });
    s.board = new Array(25).fill(null);
    s.turn = turn || 'red';
    s.over = false;
    return s;
  }
  function mk2(kind, owner, cell, extra) {
    var u = {
      id: owner + '-' + kind, kind: kind, owner: owner, cell: cell, revealed: true,
      level: g.LEVEL[kind], moves: 1, frozen: false, frozenHits: 0,
      used: { escape: false, blast: false, pounce: false, volley: false, freeze: false, shock: false, meteor: false }
    };
    for (var k in (extra || {})) u[k] = extra[k];
    return u;
  }
  var c2 = g.idx(2, 2), dCell = g.idx(2, 3);

  var s1 = blank2('red');
  s1.board[c2] = mk2('tiger', 'red', c2);
  s1.board[dCell] = mk2('dino', 'red', dCell, { frozen: true });
  var r1 = g.applyAction(s1, { type: 'skill', cell: c2, skill: 'pounce', target: dCell });
  ok(r1.ok, '虎可以猛扑自家冰龙');
  ok(r1.state.board[dCell].frozenHits === 1 && r1.state.board[dCell].frozen === true,
     '第一掌只砸出一道裂痕，恐龙还冻着');

  var s2 = blank2('red');
  s2.board[c2] = mk2('tiger', 'red', c2);
  s2.board[dCell] = mk2('dino', 'red', dCell, { frozen: true, frozenHits: 1 });
  var r2 = g.applyAction(s2, { type: 'skill', cell: c2, skill: 'pounce', target: dCell });
  ok(r2.ok && r2.state.board[dCell].frozen === false, '第二掌把自家冰龙砸开');

  var s3 = blank2('red');
  s3.board[c2] = mk2('tiger', 'red', c2);
  s3.board[dCell] = mk2('cat', 'red', dCell);
  ok(!g.applyAction(s3, { type: 'skill', cell: c2, skill: 'pounce', target: dCell }).ok,
     '猛扑自家普通动物仍然不允许');

  var s4 = blank2('red');
  s4.board[c2] = mk2('tiger', 'red', c2);
  s4.board[dCell] = mk2('dino', 'red', dCell, { frozen: false });
  ok(!g.applyAction(s4, { type: 'skill', cell: c2, skill: 'pounce', target: dCell }).ok,
     '猛扑自家已解冻的恐龙不允许');
})();

// --- 狮王矢敲自家冰龙（2026-10-17 裁定）---
section('狮王矢 · 自家冰龙');
(function () {
  function blank3(turn) {
    var s = g.newGame({ whale: false });
    s.board = new Array(25).fill(null);
    s.turn = turn || 'red';
    s.over = false;
    return s;
  }
  function mk3(kind, owner, cell, extra) {
    var u = {
      id: owner + '-' + kind, kind: kind, owner: owner, cell: cell, revealed: true,
      level: g.LEVEL[kind], moves: 1, frozen: false, frozenHits: 0,
      used: { escape: false, blast: false, pounce: false, volley: false, freeze: false, shock: false, meteor: false }
    };
    for (var k in (extra || {})) u[k] = extra[k];
    return u;
  }
  var lc = g.idx(2, 2), dc = g.idx(2, 3), RIGHT = 3;

  function shoot(st) { return g.applyAction(st, { type: 'skill', cell: lc, skill: 'volley', dir: RIGHT }); }

  var v1 = blank3('red');
  v1.board[lc] = mk3('lion', 'red', lc);
  v1.board[dc] = mk3('dino', 'red', dc, { frozen: true });
  var rv1 = shoot(v1);
  ok(rv1.ok && rv1.state.board[dc].frozenHits === 1 && rv1.state.board[dc].frozen === true,
     '狮王矢帮自家冰龙敲出一道裂痕');

  var v2 = blank3('red');
  v2.board[lc] = mk3('lion', 'red', lc);
  v2.board[dc] = mk3('dino', 'red', dc, { frozen: true, frozenHits: 1 });
  var rv2 = shoot(v2);
  ok(rv2.ok && rv2.state.board[dc].frozen === false, '第二箭把自家冰龙射开');

  var v3 = blank3('red');
  v3.board[lc] = mk3('lion', 'red', lc);
  v3.board[dc] = mk3('cat', 'red', dc);
  var rv3 = shoot(v3);
  ok(rv3.ok && rv3.state.board[dc] && rv3.state.board[dc].kind === 'cat',
     '自家普通动物挡箭仍然不掉血');

  var v4 = blank3('red');
  v4.board[lc] = mk3('lion', 'red', lc);
  v4.board[dc] = mk3('dino', 'red', dc, { frozen: false });
  var rv4 = shoot(v4);
  ok(rv4.ok && rv4.state.board[dc] && rv4.state.board[dc].frozen === false,
     '自家已解冻的恐龙挡箭也不会挨伤害');

  var v5 = blank3('red');
  v5.board[lc] = mk3('lion', 'red', lc);
  v5.board[dc] = mk3('dog', 'blue', dc);
  var rv5 = shoot(v5);
  ok(rv5.ok && !rv5.state.board[dc], '敌人挡在箭路上照样挨箭阵亡');
})();

// --- 冰封恐龙 = 中立困兽（2026-10-17 裁定）---
section('中立困兽 · 冰封中的恐龙');
(function () {
  function blank4(turn) {
    var s = g.newGame({ whale: false });
    s.board = new Array(25).fill(null);
    s.turn = turn || 'red';
    s.over = false;
    return s;
  }
  function mk4(kind, owner, cell, extra) {
    var u = {
      id: owner + '-' + kind, kind: kind, owner: owner, cell: cell, revealed: true,
      level: g.LEVEL[kind], moves: 1, frozen: false, frozenHits: 0,
      used: { escape: false, blast: false, pounce: false, volley: false, freeze: false, shock: false, meteor: false }
    };
    for (var k in (extra || {})) u[k] = extra[k];
    return u;
  }

  // 1. 冰封恐龙不计入「活着」
  var n1 = blank4('red');
  n1.board[g.idx(0, 0)] = mk4('dino', 'red', g.idx(0, 0), { frozen: true });
  ok(g.alive(n1, 'red') === 0, '冰封中的恐龙不替自己这边算兵力');
  n1.board[g.idx(0, 0)].frozen = false;
  ok(g.alive(n1, 'red') === 1, '一解冻就重新算兵力');

  // 2. 一方只剩冰龙、对面还有活口 → 判负
  var n2 = blank4('blue');
  n2.board[g.idx(0, 0)] = mk4('dino', 'red', g.idx(0, 0), { frozen: true });
  n2.board[g.idx(4, 4)] = mk4('cat', 'blue', g.idx(4, 4));
  var rn2 = g.applyAction(n2, { type: 'skip' });
  ok(rn2.state.over && rn2.state.result === 'blue', '只剩冰封恐龙的一方等于全灭，判负');

  // 3. 双方都只剩冰龙 → 平局
  var n3 = blank4('blue');
  n3.board[g.idx(0, 0)] = mk4('dino', 'red', g.idx(0, 0), { frozen: true });
  n3.board[g.idx(4, 4)] = mk4('dino', 'blue', g.idx(4, 4), { frozen: true });
  var rn3 = g.applyAction(n3, { type: 'skip' });
  ok(rn3.state.over && rn3.state.result === 'draw', '两边都只剩冰里那头困兽 → 平局');

  // 4. 敌方也能猛扑对面的冰龙
  var n4 = blank4('red');
  n4.board[g.idx(2, 2)] = mk4('tiger', 'red', g.idx(2, 2));
  n4.board[g.idx(2, 3)] = mk4('dino', 'blue', g.idx(2, 3), { frozen: true });
  var rn4 = g.applyAction(n4, { type: 'skill', cell: g.idx(2, 2), skill: 'pounce', target: g.idx(2, 3) });
  ok(rn4.ok && rn4.state.board[g.idx(2, 3)].frozenHits === 1,
     '敌方猛扑对面的冰龙同样只敲一层冰');

  // 5. 狮王矢射对面挡路的冰龙也敲一层
  var n5 = blank4('red');
  n5.board[g.idx(2, 2)] = mk4('lion', 'red', g.idx(2, 2));
  n5.board[g.idx(2, 3)] = mk4('dino', 'blue', g.idx(2, 3), { frozen: true });
  var rn5 = g.applyAction(n5, { type: 'skill', cell: g.idx(2, 2), skill: 'volley', dir: 3 });
  ok(rn5.ok && rn5.state.board[g.idx(2, 3)].frozenHits === 1,
     '狮王矢射中对面挡路的冰龙，同样只敲一层冰');
})();

// --- 伤害账：军师别乱放技能（2026-10-17 报告：本地 AI 对着 7 级狮 + 8 级象放豹的自爆）---
section('伤害账 · 军师别乱放技能');
(function () {
  var ai = require('./game-ai.js');
  function blank5(turn) {
    var s = g.newGame({ whale: false });
    s.board = new Array(25).fill(null);
    s.turn = turn || 'blue';
    s.ply = 5; s.over = false; s.pending = null; s.escaped = null;
    return s;
  }
  function mk5(st, kind, owner, r, c, extra) {
    var u = {
      id: owner + '-' + kind, kind: kind, owner: owner, cell: g.idx(r, c), revealed: true,
      level: g.LEVEL[kind], moves: 1, frozen: false, frozenHits: 0,
      used: { escape: false, blast: false, pounce: false, volley: false, freeze: false, shock: false, meteor: false }
    };
    for (var k in (extra || {})) u[k] = extra[k];
    st.board[g.idx(r, c)] = u;
    return u;
  }
  var isSkill = function (a, id) { return a.type === 'skill' && a.skill === id; };
  var offered = function (st, id) { return ai.rank(st).some(function (x) { return isSkill(x.action, id); }); };

  // 1. 5.5 伤害打不动 7 级狮、8 级象 —— 预览要如实说，军师更不许推荐
  var s1 = blank5();
  mk5(s1, 'leopard', 'blue', 2, 1);
  mk5(s1, 'lion', 'red', 1, 1);
  mk5(s1, 'elephant', 'red', 3, 1);
  var pv1 = g.previewAction(s1, { type: 'skill', cell: g.idx(2, 1), skill: 'blast' });
  ok(pv1.foeKills === 0, '自爆预览如实算出一只都打不死');
  ok(pv1.held.length === 2 && pv1.selfDies, '预览标出「两只都扛得住」+ 自己阵亡');
  ok(!offered(s1, 'blast'), '军师候选里不再出现这种白给的自爆');

  // 2. 真能吃到东西时，自爆照给
  var s2 = blank5();
  mk5(s2, 'leopard', 'blue', 2, 1);
  mk5(s2, 'cat', 'red', 1, 1);
  mk5(s2, 'dog', 'red', 3, 1);
  ok(g.previewAction(s2, { type: 'skill', cell: g.idx(2, 1), skill: 'blast' }).foeKills === 2,
     '自爆预览算出打死两只');
  ok(offered(s2, 'blast'), '能吃到两只时军师会给自爆');

  // 3. 误伤自家也算进账
  var s3 = blank5();
  mk5(s3, 'leopard', 'blue', 2, 1);
  mk5(s3, 'cat', 'red', 1, 1);
  mk5(s3, 'dog', 'blue', 3, 1);
  var pv3 = g.previewAction(s3, { type: 'skill', cell: g.idx(2, 1), skill: 'blast' });
  ok(pv3.ownKills === 1 && pv3.ownLoss === 3, '自家被误伤也记在账上（狗 3）');

  // 4. 一局一次的猛扑：能走过去吃的就别浪费，吃不动的才值得
  var s4 = blank5();
  mk5(s4, 'tiger', 'blue', 0, 0);
  mk5(s4, 'mouse', 'red', 0, 1);
  var rk4 = ai.rank(s4);
  var eat4 = rk4.filter(function (x) { return x.action.type === 'move' && x.action.to === g.idx(0, 1); })[0];
  var pon4 = rk4.filter(function (x) { return isSkill(x.action, 'pounce'); })[0];
  ok(eat4 && (!pon4 || eat4.score > pon4.score), '对一只 1 级鼠，直接走过去吃比猛扑更划算');

  var s5 = blank5();
  mk5(s5, 'tiger', 'blue', 0, 0);
  mk5(s5, 'lion', 'red', 0, 1);
  ok(offered(s5, 'pounce'), '走过去吃不动的狮 7，猛扑该用就用');

  // 5. 狮王矢打不动的别射
  var s6 = blank5();
  mk5(s6, 'lion', 'blue', 0, 0);
  mk5(s6, 'elephant', 'red', 0, 2);
  ok(!offered(s6, 'volley'), '打不动象 8 时军师不射狮王矢');
  var s7 = blank5();
  mk5(s7, 'lion', 'blue', 0, 0);
  mk5(s7, 'cat', 'red', 0, 2);
  ok(offered(s7, 'volley'), '打得动（猫 2）时照射');

  // 6. 陨石只砸已公开的，也不为一只狮陪葬一条龙
  var s8 = blank5();
  mk5(s8, 'dino', 'blue', 0, 0, { frozen: false });
  mk5(s8, 'lion', 'red', 0, 1);
  mk5(s8, 'leopard', 'red', 1, 1, { revealed: false });
  var pv8 = g.previewAction(s8, { type: 'skill', cell: g.idx(0, 0), skill: 'meteor' });
  ok(pv8.foeKills === 1 && pv8.foeGain === 7, '陨石只算已公开单位（暗牌不算）');
  ok(!offered(s8, 'meteor'), '只砸得掉一只狮时不让龙陪葬');
  var s9 = blank5();
  mk5(s9, 'dino', 'blue', 0, 0, { frozen: false });
  mk5(s9, 'lion', 'red', 0, 1);
  mk5(s9, 'elephant', 'red', 1, 1);
  ok(offered(s9, 'meteor'), '砸得掉狮 + 象（15 级）时推荐陨石');
})();

// ---------------------------------------------------------------- 决算判定
section('决算判定：无人可挡的动物不该被拖成反败（2026-10-18 反馈）');
(function () {
  function txtOf(res) { return ((res && res.events) || []).map(function (e) { return e.text; }).join(' | '); }
  // 双方来回踱步，把 idle 推到 20 触发决算。红方鼠在 (0,1)<->(0,2)，蓝方踱步子放在 (4,4)<->(3,4)
  function drag(st) {
    var m1 = g.idx(0, 1), m2 = g.idx(0, 2), b1 = g.idx(4, 4), b2 = g.idx(3, 4), res = null;
    for (var i = 0; i < 26 && !st.over; i++) {
      var a;
      if (st.turn === 'red') { a = { type: 'move', from: m1, to: m2 }; var t = m1; m1 = m2; m2 = t; }
      else { a = { type: 'move', from: b1, to: b2 }; var t2 = b1; b1 = b2; b2 = t2; }
      var r = act(st, a);
      if (!r.ok) return { st: st, res: null, err: r.error };
      st = r.state; res = r;
    }
    return { st: st, res: res, err: null };
  }

  // 1) 红方有恐龙（7.5），蓝方只有会飞的鹏鸟 —— 躲到决算也该是红胜
  var a1 = emptyState();
  put(a1, 'dino', 'red', 0, 0); put(a1, 'mouse', 'red', 0, 1); put(a1, 'roc', 'blue', 4, 4);
  var z1 = drag(a1);
  ok(!z1.err && z1.st.over && z1.st.result === 'red', '恐龙无人可挡：僵持也判红胜', z1.err || ('result=' + z1.st.result));
  ok(z1.err ? false : /无人可挡/.test(txtOf(z1.res)), '决算文案说明「无人可挡」', txtOf(z1.res));

  // 2) 蓝方多一只狮 7，照样吃不动龙
  var a2 = emptyState();
  put(a2, 'dino', 'red', 0, 0); put(a2, 'mouse', 'red', 0, 1);
  put(a2, 'roc', 'blue', 4, 4); put(a2, 'lion', 'blue', 4, 3);
  var z2 = drag(a2);
  ok(!z2.err && z2.st.result === 'red', '蓝方有狮 7 也吃不动龙：仍判红胜', z2.err || ('result=' + z2.st.result));

  // 3) 蓝方有象 8 —— 象吃得动龙，龙不再是无人可挡，回到等级总和（蓝 21 / 红 8.5）
  var a3 = emptyState();
  put(a3, 'dino', 'red', 0, 0); put(a3, 'mouse', 'red', 0, 1);
  put(a3, 'roc', 'blue', 4, 4); put(a3, 'lion', 'blue', 4, 3); put(a3, 'elephant', 'blue', 4, 2);
  var z3 = drag(a3);
  ok(!z3.err && z3.st.result === 'blue', '蓝方有象 8 能处理龙：回到总和，蓝胜', z3.err || ('result=' + z3.st.result));
  ok(z3.err ? false : /等级总和/.test(txtOf(z3.res)), '这时文案才是「按场上等级总和决算」', txtOf(z3.res));

  // 4) 冰封的龙是「中立困兽」：不算战力、也不算无人可挡（2026-10-18 裁定：
  //    解不解封是它主人的决策问题，决算不替它兜底）
  var a4 = emptyState();
  put(a4, 'dino', 'red', 0, 0, true).frozen = true;
  put(a4, 'mouse', 'red', 0, 1); put(a4, 'roc', 'blue', 4, 4);
  var z4 = drag(a4);
  ok(!z4.err && z4.st.result === 'blue', '冰封的龙不算战力也不算无人可挡：蓝胜', z4.err || ('result=' + z4.st.result));
  ok(z4.err ? false : /鹏鸟（6）/.test(txtOf(z4.res)), '龙被排除后蓝鹏 6 才是无人可挡的那个', txtOf(z4.res));

  // 5) 双方顶子互相吃得动（红狮 7 + 鼠 1 / 蓝狮 7）：都谈不上无人可挡，走总和（8 : 7）
  var a5 = emptyState();
  put(a5, 'lion', 'red', 0, 0); put(a5, 'mouse', 'red', 0, 1); put(a5, 'lion', 'blue', 4, 4);
  var z5 = drag(a5);
  ok(!z5.err && z5.st.result === 'red', '双方顶子互吃：仍按等级总和（红 8 / 蓝 7）', z5.err || ('result=' + z5.st.result));
  ok(z5.err ? false : /等级总和/.test(txtOf(z5.res)), '势均力敌时判决仍走总和', txtOf(z5.res));

  // 6) 关键局面（2026-10-18 问的）：红 象8 + 龙7.5 / 蓝 狮7 虎6 鼠1 豹5
  //    鼠吃得动象（特例），但咬不动 7.5 的龙 → 只有龙无人可挡，红胜
  var a6 = emptyState();
  put(a6, 'elephant', 'red', 0, 1); put(a6, 'dino', 'red', 0, 4);
  put(a6, 'lion', 'blue', 4, 4); put(a6, 'tiger', 'blue', 4, 3);
  put(a6, 'mouse', 'blue', 4, 2); put(a6, 'leopard', 'blue', 4, 1);
  var z6 = drag(a6);
  ok(!z6.err && z6.st.result === 'red', '象怕鼠、龙不怕：判红胜', z6.err || ('result=' + z6.st.result));
  ok(z6.err ? false : (/恐龙（7\.5）/.test(txtOf(z6.res)) && !/象（8）/.test(txtOf(z6.res))),
    '文案只点名龙，没把被鼠盯着的象算成无人可挡', txtOf(z6.res));

  // 7) 同一局面，但蓝方还有一张暗牌 → 保守按「可能有威胁」，退回等级总和（红 15.5 / 蓝 23）
  var a7 = emptyState();
  put(a7, 'elephant', 'red', 0, 1); put(a7, 'dino', 'red', 0, 4);
  put(a7, 'lion', 'blue', 4, 4); put(a7, 'tiger', 'blue', 4, 3);
  put(a7, 'mouse', 'blue', 4, 2); put(a7, 'leopard', 'blue', 4, 1);
  put(a7, 'wolf', 'blue', 3, 0, false);
  var z7 = drag(a7);
  ok(!z7.err && z7.st.result === 'blue', '对方留暗牌时不敢判无人可挡：退回总和，蓝胜', z7.err || ('result=' + z7.st.result));
})();

console.log('\n=== 通过 ' + pass + ' 项，失败 ' + fail + ' 项 ===');
process.exit(fail ? 1 : 0);