/* =============================================================================
 * 超能斗兽棋 —— 纯逻辑引擎（无 UI、无依赖、可在 node 里跑）
 * 设计：源自初中纸片自制游戏规则复现 + 空白处裁定补全
 * 用法：浏览器 <script src="game-core.js"> 得到 window.CaptainBeast
 *       node   require('./game-core.js')  得到 module.exports
 * ========================================================================== */
(function (root) {
  'use strict';

  var N = 5;                       // 棋盘 5x5
  var WATER = 12;                  // 中央格（行2列2，0-based）＝深水区

  // ---- 等级表（吃子用「攻击方等级 >= 目标等级 即可吃」）---------------------
  var LEVEL = {
    mouse: 1, cat: 2, dog: 3, wolf: 4, leopard: 5, tiger: 6, lion: 7, elephant: 8,
    penguin: 3, panda: 3.5, roc: 6, dino: 7.5,
    kun: 7                         // 特殊变种：鹏鸟吞下敌方企鹅后化身，不进开局卡池
  };
  var NAME = {
    mouse: '鼠', cat: '猫', dog: '狗', wolf: '狼', leopard: '豹', tiger: '虎',
    lion: '狮', elephant: '象', penguin: '企鹅', panda: '熊猫', roc: '鹏鸟', dino: '恐龙',
    kun: '鲲'
  };
  var ICON = {
    mouse: '🐭', cat: '🐱', dog: '🐶', wolf: '🐺', leopard: '🐆', tiger: '🐯',
    lion: '🦁', elephant: '🐘', penguin: '🐧', panda: '🐼', roc: '🦅', dino: '🦖',
    kun: '🐳'
  };
  var ROSTER = ['mouse', 'cat', 'dog', 'wolf', 'leopard', 'tiger', 'lion', 'elephant',
                'penguin', 'panda', 'roc', 'dino'];
  var SIMPLE = { mouse: true, cat: true, dog: true, wolf: true, leopard: true,
                 tiger: true, lion: true, elephant: true };       // 经典八级

  var SKILL_TEXT = {
    mouse: '逃出生天：被吃掉时不算真死，立即免费行动一次，只能落到空白格。每局一次，不占回合。',
    cat: '侧击：上下左右之外还能斜着行动与吃子（一共 8 个方向）。',
    dog: '疾行：一次可以走两格（可吃第二格目标）。',
    wolf: '连吃：吃掉一个后，检查四周四格是否还有可吃的已公开目标，可由你选择是否继续连吃。不占回合。',
    leopard: '自爆：自身为中心 3×3 内所有已公开单位受到 5.5 伤害，自身阵亡。占回合，每局一次。',
    tiger: '猛扑：对相邻已公开目标发动一次威力 7 的攻击。每局一次，占回合。也可以猛扑冰封中的恐龙（不分敌我），等于隔空帮它敲掉一层冰。',
    lion: '狮王矢：远程发射一枚威力 7 的箭，沿一条直线只命中第一个挡路的单位——是已公开的敌方就挨箭；暗牌或自己人会把箭挡下来（谁都不掉血）。唯一例外：挡路的是冰封中的恐龙，这一箭敲掉它一层冰。每局一次，占回合。',
    elephant: '巨力：可以翻越紧邻的一格障碍（翻越后落在障碍后方的格子）。',
    penguin: '冰封：指定一个已公开敌方单位，令其下一回合被禁锢（效果公开可见）。每局一次，不占回合。',
    panda: '成长·吃啥补啥：每吃掉一个动物，等级 +1，并永久获得它「被动、能反复用」的能力（吃猫得侧击、吃狗得疾行、吃狼得连吃、吃象得巨力、吃鹏鸟得翱翔）。最高 8.5 级，吃子规则与他人相同。一次性的招数学不到：豹的自爆、虎的猛扑、狮王矢、企鹅的冰封，以及恐龙的冲击波/陨石——吃了只涨等级。',
    roc: '翱翔：可以飞往任意空位，无视障碍，但飞行落点必须是空格，不能直接吃掉目标。',
    dino: '冰封之躯：初次翻开时处于冰冻状态（期间无敌），需两次「等级≥7 的攻击或威力≥7 的技能」才能解冻，解冻那一下不结算伤害。冲击波：选一个方向，该方向所有单位受到 6.5 伤害并击退。陨石降临：自爆并对周围 3×3 造成 8.5 伤害——威力大到连冰层带恐龙一起砸碎。两技能各一次，均占回合。',
    kun: '鲲：鹏鸟吞下敌方企鹅后化而为鲲——等级 7。失去翱翔（不能再飞），但能进中央深水区（水里的它只有同为水中单位才咬得到）。十字波涛：以自身为中心，上下左右四条臂各自一路穿到棋盘边缘，臂上每个单位受 6.5 伤害；扛得住的已公开目标和暗牌都会被沿各自方向击退（机制同恐龙冲击波）。每局一次，占回合。'
  };

  // 每个技能要什么参数：'unit' = 指定一个目标格；'dir' = 指定一个方向；null = 不需要参数
  // UI / AI 都照这张表生成动作，别再各写一份映射（两边漂移过一次）
  var SKILL_NEED = { blast: null, pounce: 'unit', volley: 'dir', freeze: 'unit', shock: 'dir', meteor: null, kunwave: null };
  function skillNeed(id) { return SKILL_NEED[id] === undefined ? null : SKILL_NEED[id]; }

  // ---- 基础工具 -------------------------------------------------------------
  function idx(r, c) { return r * N + c; }
  function rc(i) { return { r: Math.floor(i / N), c: i % N }; }
  function inBoard(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
  function other(p) { return p === 'red' ? 'blue' : 'red'; }

  // 可复现的伪随机（种下同一个种子就能重摆同一局）
  var rng = (function () {
    var s = (Math.random() * 0xffffffff) >>> 0;
    return {
      setSeed: function (n) { s = (n >>> 0) || 1; },
      getSeed: function () { return s; },
      next: function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; },
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) {
          var j = Math.floor(this.next() * (i + 1)), t = arr[i];
          arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      }
    };
  })();

  var DIR8 = [
    { dr: -1, dc: 0, name: '上' }, { dr: 1, dc: 0, name: '下' },
    { dr: 0, dc: -1, name: '左' }, { dr: 0, dc: 1, name: '右' }
  ];
  var DIR4 = DIR8.concat([
    { dr: -1, dc: -1, name: '左上' }, { dr: -1, dc: 1, name: '右上' },
    { dr: 1, dc: -1, name: '左下' }, { dr: 1, dc: 1, name: '右下' }
  ]);

  function clone(st) {
    var b = new Array(N * N);
    for (var i = 0; i < N * N; i++) {
      var u = st.board[i];
      if (!u) { b[i] = null; continue; }
      var copy = {
        id: u.id, kind: u.kind, level: u.level, owner: u.owner, cell: u.cell,
        revealed: u.revealed, frozen: u.frozen, frozenHits: u.frozenHits,
        jailed: u.jailed, moves: u.moves,
        used: {
          escape: !!u.used.escape, blast: !!u.used.blast, pounce: !!u.used.pounce,
          volley: !!u.used.volley, freeze: !!u.used.freeze,
          shock: !!u.used.shock, meteor: !!u.used.meteor,
          kunwave: !!u.used.kunwave
        }
      };
      // 熊猫「吃啥补啥」学到的能力（hasCat / hasDog / …）必须跟着复制
      for (var k in u) {
        if (!Object.prototype.hasOwnProperty.call(u, k)) continue;
        if (k === 'used') continue;
        if (copy[k] === undefined) copy[k] = u[k];
      }
      b[i] = copy;
    }
    var out = {
      board: b, turn: st.turn, ply: st.ply, history: st.history.slice(),
      pending: st.pending ? JSON.parse(JSON.stringify(st.pending)) : null,
      escaped: null, idle: st.idle || 0,
      over: st.over, result: st.result, whale: st.whale,
      // 规则开关（自对弈对照组用）：null/undefined 视为全开，正式对局不受影响
      flags: st.flags ? { kun: st.flags.kun !== false, panda: st.flags.panda !== false, thaw: st.flags.thaw !== false } : null
    };
    // 正在逃生的鼠不在棋盘上，必须单独搬过去
    if (st.escaped && st.escaped.unit) {
      var eu = st.escaped.unit, ec = {
        id: eu.id, kind: eu.kind, level: eu.level, owner: eu.owner, cell: eu.cell,
        revealed: eu.revealed, frozen: eu.frozen, frozenHits: eu.frozenHits,
        jailed: eu.jailed, moves: eu.moves,
        used: {
          escape: !!eu.used.escape, blast: !!eu.used.blast, pounce: !!eu.used.pounce,
          volley: !!eu.used.volley, freeze: !!eu.used.freeze,
          shock: !!eu.used.shock, meteor: !!eu.used.meteor,
          kunwave: !!eu.used.kunwave
        }
      };
      out.escaped = { cell: st.escaped.cell, unit: ec };
    }
    return out;
  }

  // ---- 开局格（除中央深水格以外的 24 格，红蓝随机混放）-----------------------
  var CELLS = (function () {
    var list = [];
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        if (idx(r, c) === WATER) continue;
        list.push([r, c]);
      }
    }
    if (list.length !== 24) throw new Error('开局格数错误');
    return list;
  })();

  // ---- 初始棋盘 -------------------------------------------------------------
  // 24 张牌铺满除中央深水格以外的 24 格：红蓝各 12 张，合并后随机洗牌，
  // 格子也随机洗牌 —— 阵营与位置都完全随机，背面看不出任何区别。
  function newGame(opts) {
    var st = { board: new Array(N * N).fill(null), turn: 'red', ply: 1, history: [],
               pending: null, escaped: null, idle: 0, over: false, result: null,
               // 记下这一局的种子：外面 setSeed(st.seed) 之后再 newGame() 就能原样重摆同一局
               seed: rng.getSeed(),
               whale: !(opts && opts.whale === false),
               // 规则开关：只给自对弈做对照实验用（noKun / noPanda 关掉变身或熊猫成长）
               flags: { kun: !(opts && opts.noKun), panda: !(opts && opts.noPanda), thaw: !(opts && opts.noThaw) } };
    function put(kind, owner, r, c) {
      st.board[idx(r, c)] = {
        id: owner + '-' + kind, kind: kind, level: LEVEL[kind], owner: owner,
        cell: idx(r, c), revealed: false, frozen: false, frozenHits: 0, jailed: 0,
        used: { escape: false, blast: false, pounce: false, volley: false, freeze: false, shock: false, meteor: false, kunwave: false },
        moves: 0
      };
    }
    var pool = ['elephant', 'lion', 'tiger', 'leopard', 'roc', 'wolf',
                'dog', 'panda', 'penguin', 'cat', 'mouse', 'dino'];
    var cards = [];
    rng.shuffle(pool.slice()).forEach(function (k) { cards.push({ kind: k, owner: 'red' }); });
    rng.shuffle(pool.slice()).forEach(function (k) { cards.push({ kind: k, owner: 'blue' }); });
    rng.shuffle(cards);
    var cells = rng.shuffle(CELLS.slice());
    for (var i = 0; i < 24; i++) put(cards[i].kind, cards[i].owner, cells[i][0], cells[i][1]);
    return st;
  }

  // ---- 判定辅助 -------------------------------------------------------------
  function isWater(i) { return i === WATER; }
  function isSwimmer(u) { return u.kind === 'mouse' || u.kind === 'penguin' || u.kind === 'kun'; }
  // 深水是泳者的地盘：岸上的动物不但不能停进去，连「吃掉水里的它、顺势占位」也不行。
  // （2026-10-16 压测抓到：大象吃掉水里的企鹅后会站进深水，破坏「深水只有泳者」的铁律）
  function canStand(u, i) { return !(isWater(i) && !isSwimmer(u)); }
  function canEat(atk, def) {                       // 「等级 >= 对方即可吃」
    if (atk.kind === 'mouse' && def.kind === 'elephant') return true;
    if (atk.kind === 'elephant' && def.kind === 'mouse') return false;
    return atk.level >= def.level;
  }
  function isOpen(u) { return !!u && u.revealed; }
  function sameSide(a, b) { return a.owner === b.owner; }
  // 平衡实验开关：st.flags.thaw === false 时冰封恐龙不可破（默认开启，正式对局不受影响）
  function crackAllowed(st) { return !(st.flags && st.flags.thaw === false); }

  // 「逃出生天」的落点决定权归鼠的主人：哪怕是对手回合吃掉它，也由它自己的主人来点落点。
  // 这里有个陷阱——吃鼠那一方的回合此时还没走完（st.turn 仍是吃子方），
  // 所以判定「这一手该谁动」一律用下面的 actorOf()，不要只看 st.turn。
  function escapeOwner(st) {
    if (st.pending && st.pending.kind === 'escape' && st.escaped && st.escaped.unit) {
      return st.escaped.unit.owner;
    }
    return null;
  }

  // 当前该谁操作：鼠正在逃生命中归鼠主人，其余时候归当前回合方
  function actorOf(st) {
    return escapeOwner(st) || st.turn;
  }

  // 「活着」= 还能动的兵力。冰封中的恐龙是中立困兽，不替任何一方算数（2026-10-17 裁定）
  function alive(st, owner) {
    var n = 0;
    for (var i = 0; i < st.board.length; i++) {
      var u = st.board[i];
      if (u && u.owner === owner && !(u.kind === 'dino' && u.frozen)) n++;
    }
    return n;
  }

  // 结算：把一个单位从棋盘上移除；fromEat=true 表示「被吃掉」（鼠可以走逃出生天）
  function kill(st, cell, killerCell, events, fromEat) {
    var u = st.board[cell];
    if (!u) return;
    if (fromEat === true && u.kind === 'mouse' && !u.used.escape) {
      u.used.escape = true;
      u.revealed = true;
      u.jailed = 0;
      st.board[cell] = null;
      st.escaped = { cell: cell, unit: u };          // 挂在棋盘外，等待选落点
      st.pending = { kind: 'escape', unitCell: cell, unitId: u.id };
      events.push({ t: 'escape-ready', cell: cell, text: '鼠挣脱了！立刻可以窜到任意空白格（不占回合）' });
      return;
    }
    st.board[cell] = null;
    events.push({ t: 'death', cell: cell, text: (u.owner === 'red' ? '红' : '蓝') + NAME[u.kind] + ' 阵亡' });
  }

  // ---- 冷却/回合推进 --------------------------------------------------------
  function beginTurn(st, events) {
    var p = st.turn;
    for (var i = 0; i < st.board.length; i++) {
      var u = st.board[i];
      if (u && u.owner === p) {
        u.moves = 1;
        if (u.jailed > 0) {
          u.jailed--;
          events.push({ t: 'jail', cell: i, text: NAME[u.kind] + ' 被冰封，本回合无法行动' });
        }
      }
    }
  }

  function endTurn(st, events) {
    st.turn = other(st.turn);
    st.ply++;
    // 深海巨兽天降：从第 10 回合开始，之后每 10 回合一次
    if (st.whale !== false && st.ply % 10 === 0) {
      whaleStrike(st, events);
      checkOver(st, events);
    }
    return beginTurn(st, events);
  }

  // ---- 深海巨兽天降 ---------------------------------------------------------
  var WHALE_CELLS = [WATER, idx(1, 2), idx(3, 2), idx(2, 1), idx(2, 3)];   // 中央 + 上下左右

  // 距离下一次天降还有几次行动（10 = 刚拍完，下一掌要等满 10 回合）
  function pliesToWhale(st) {
    if (st.whale === false) return -1;
    return 10 - (st.ply % 10);
  }

  function whaleStrike(st, events) {
    events.push({ t: 'whale', text: '深海巨兽从海底浮上来，一巴掌把中央拍平了！（9 级 · 中央十字）' });
    for (var i = 0; i < WHALE_CELLS.length; i++) {
      var cell = WHALE_CELLS[i], u = st.board[cell];
      if (!u) continue;
      if (!u.revealed) { whaleBlowAway(st, cell, events); continue; }
      // 冰封中的恐龙：解冻本来就够折腾了，这一掌只算击退，不当场打死
      if (u.kind === 'dino' && u.frozen) { whaleBlowAway(st, cell, events); continue; }
      kill(st, cell, -1, events, false);             // 9 级高于全场最高（熊猫顶格 8.5）→ 必杀
    }
  }

  // 暗牌不吃伤害，被拍飞出打击范围：从中央朝外的方向推出去
  function whaleBlowAway(st, cell, events) {
    var dirs = [], k;
    if (cell === WATER) { for (k = 0; k < DIR8.length; k++) dirs.push(DIR8[k]); }
    else {
      var q = rc(cell), w = rc(WATER);
      for (k = 0; k < DIR8.length; k++) if (DIR8[k].dr === q.r - w.r && DIR8[k].dc === q.c - w.c) dirs.push(DIR8[k]);
    }
    for (k = 0; k < dirs.length; k++) {
      if (!st.board[cell]) return;
      pushUnit(st, cell, dirs[k], events);
      if (!st.board[cell]) return;                   // 推走了就收工
    }
    events.push({ t: 'immune', cell: cell, text: '暗牌被拍得动弹不得（退无可退）' });
  }

  // ---- 可行动作枚举 ---------------------------------------------------------
  function moveTargets(st, cell) {
    var u = st.board[cell];
    if (!u || !u.revealed || u.jailed > 0) return [];
    if (u.kind === 'dino' && u.frozen) return [];
    var out = [];
    // 己方等级≥7 的动物可以敲自家冰冻的恐龙，帮它解冻（一次一层，占回合；2026 裁定）
    if (u.level >= 7 && crackAllowed(st)) {
      for (var d1 = 0; d1 < 4; d1++) {
        var r1 = rc(cell).r + DIR8[d1].dr, c1 = rc(cell).c + DIR8[d1].dc;
        if (!inBoard(r1, c1)) continue;
        var i1 = idx(r1, c1), t1 = st.board[i1];
        if (t1 && t1.owner === u.owner && t1.kind === 'dino' && t1.frozen) out.push({ to: i1, kind: 'thaw' });
      }
    }
    var dirs = (u.kind === 'cat' || (u.kind === 'panda' && u.hasCat)) ? DIR4 : DIR8.slice(0, 4);
    var reach = (u.kind === 'dog' || (u.kind === 'panda' && u.hasDog)) ? 2 : 1;
    var hops = (u.kind === 'elephant' || (u.kind === 'panda' && u.hasElephant)) ? 1 : 0;  // 象可以翻越一格障碍
    for (var d = 0; d < dirs.length; d++) {
      var dr = dirs[d].dr, dc = dirs[d].dc;
      var r = rc(cell).r + dr, c = rc(cell).c + dc;
      var steps = 0, jumped = false;
      while (inBoard(r, c) && steps < reach) {
        var i2 = idx(r, c);
        var t = st.board[i2];
        if (!t) {
          if (jumped) {
            if (!(isWater(i2) && !isSwimmer(u))) out.push({ to: i2, kind: 'move' });
          } else {
            // 空格就是空格：绝不因为「后面还有空格」而凭空翻越（象只翻障碍）
            if (!(isWater(i2) && !isSwimmer(u))) out.push({ to: i2, kind: 'move' });
          }
        } else if (t.owner !== u.owner && t.revealed && canEat(u, t) && canStand(u, i2)) {
          out.push({ to: i2, kind: (t.kind === 'dino' && t.frozen) ? 'thaw' : 'eat' });
          break;
        } else if (t.owner !== u.owner && t.revealed && hops > 0 && !jumped) {
          var r4 = r + dr, c4 = c + dc;
          if (inBoard(r4, c4) && !st.board[idx(r4, c4)] && !(isWater(idx(r4, c4)) && !isSwimmer(u))) {
            out.push({ to: idx(r4, c4), kind: 'hop', over: i2 });   // 翻过吃不动的敌人
          }
          break;
        } else if (hops > 0 && !jumped) {
          // 紧邻的是障碍（己方或暗牌，或吃不动的敌人）：翻过去吃后面的，或落在后面的空格
          var r3 = r + dr, c3 = c + dc;
          if (inBoard(r3, c3)) {
            var i3 = idx(r3, c3), t3 = st.board[i3];
            if (t3 && t3.owner !== u.owner && t3.revealed && canEat(u, t3) && canStand(u, i3)) {
              out.push({ to: i3, kind: (t3.kind === 'dino' && t3.frozen) ? 'thaw' : 'eat', over: i2 });          // 翻越障碍后吃
              break;
            }
            if (!t3 && !(isWater(i3) && !isSwimmer(u))) {
              out.push({ to: i3, kind: 'hop', over: i2 });          // 翻越障碍落空位
              jumped = true;
              r += dr; c += dc;
              steps++;
              continue;
            }
          }
          break;
        } else {
          break;
        }
        steps++; r += dr; c += dc;
      }
    }
    // 翱翔＝「多一种走法」，不是「换一种走法」的心智（2026-10-18 裁定）。
    // 追加在通用循环之后：贴着走得到的格子仍记作普通移动，只有够不着的远方才标成 fly。
    // 鹏鸟本身没有侧击/疾行/巨力，走通用循环与旧分支完全等价（四方向一格 + 贴身照常吃）；
    // 吃过鹏鸟的熊猫则把飞行与它已经学到的地面吃法叠在一起——否则吃一只鸟反倒会变弱。
    var canFly = (u.kind === 'roc') || (u.kind === 'panda' && !!u.hasRoc);
    if (canFly) {
      var taken = Object.create(null);
      for (var k0 = 0; k0 < out.length; k0++) taken[out[k0].to] = 1;
      for (var fi = 0; fi < st.board.length; fi++) {
        if (fi === cell || st.board[fi] || taken[fi]) continue;
        if (isWater(fi) && !isSwimmer(u)) continue;
        out.push({ to: fi, kind: 'fly' });
      }
    }
    return out;
  }

  function skillsFor(st, cell) {
    var u = st.board[cell];
    if (!u || !u.revealed || u.jailed > 0) return [];
    if (u.moves <= 0) return [];      // 这一回合的行动力已经用掉了（狼连吃、企鹅冰封之后都是这种情况）
    var out = [];
    var has = function (k) {
      if (u.kind === k) return true;
      if (u.kind === 'panda') return !!u['has' + k.charAt(0).toUpperCase() + k.slice(1)];
      return false;
    };
    if (has('leopard') && !u.used.blast) out.push({ id: 'blast', need: SKILL_NEED.blast, label: '自爆 5.5（3×3，占回合）' });
    if (has('tiger') && !u.used.pounce) out.push({ id: 'pounce', need: SKILL_NEED.pounce, label: '猛扑 7（相邻，占回合）' });
    if (has('lion') && !u.used.volley) out.push({ id: 'volley', need: SKILL_NEED.volley, label: '狮王矢 7（直线单体，占回合）' });
    if (has('penguin') && !u.used.freeze) out.push({ id: 'freeze', need: SKILL_NEED.freeze, label: '冰封（禁锢敌方 1 回合，不占回合）' });
    if (u.kind === 'dino' && !u.frozen && !u.used.shock) out.push({ id: 'shock', need: SKILL_NEED.shock, label: '冲击波 6.5（一个方向，占回合）' });
    if (u.kind === 'dino' && !u.frozen && !u.used.meteor) out.push({ id: 'meteor', need: SKILL_NEED.meteor, label: '陨石降临 8.5（自爆 3×3，占回合）' });
    if (u.kind === 'kun' && !u.used.kunwave) out.push({ id: 'kunwave', need: SKILL_NEED.kunwave, label: '十字波涛 6.5（上下左右四条臂穿到底，占回合）' });
    return out;
  }

  // ---- 动作执行 -------------------------------------------------------------
  // 双方都磨不动时的兜底：连续 20 手「没掀牌、没吃子、没放技能」，按场上等级总和决算
  // 只数「放弃行动」是不够的：对方挪一步就把计数清零，于是双方来回踱步能磨到天荒地老。
  function boardCount(st) {
    var n = 0;
    for (var i = 0; i < st.board.length; i++) if (st.board[i]) n++;
    return n;
  }

  // 场上的等级总和（冰封的恐龙不算战力，与 alive() 保持一致）
  function rankSum(st, owner) {
    var s = 0;
    for (var i = 0; i < st.board.length; i++) {
      var u = st.board[i];
      if (!u || u.owner !== owner) continue;
      if (u.kind === 'dino' && u.frozen) continue;
      s += u.level;
    }
    return s;
  }

  // 「无人可挡」：对方场上没有任何动物吃得掉它（含鼠吃象特例）。
  // 对方的暗牌按「可能有威胁」算。只算等级与吃子特例，不把技能算进去（2026-10-18 定）。
  function unbeatableUnits(st, owner) {
    var foe = owner === 'red' ? 'blue' : 'red', out = [];
    for (var i = 0; i < st.board.length; i++) {
      var u = st.board[i];
      if (!u || u.owner !== owner || !u.revealed) continue;
      // 冰封的恐龙是中立困兽：不参与决算（2026-10-18 裁定）——
      // 解不解封是它主人的决策，决算不替他兜底。
      if (u.kind === 'dino' && u.frozen) continue;
      var safe = true;
      for (var j = 0; j < st.board.length; j++) {
        var v = st.board[j];
        if (!v || v.owner !== foe) continue;
        if (!v.revealed) { safe = false; break; }          // 暗牌不知道是什么，按有威胁算
        if (v.kind === 'dino' && v.frozen) continue;       // 冻着的龙动不了
        if (canEat(v, u)) { safe = false; break; }
      }
      if (safe) out.push(u);
    }
    return out;
  }

  // 双方都磨不动时的兜底（2026-10-18 反馈：原来的「比总和」会让必败方靠飞行躲到决算捡赢）
  // 先看有没有「无人可挡」的动物：只有一方握有它时，僵持改变不了结局，直接判该方胜；
  // 双方都没有（或有来有回）才回到等级总和决算。
  function settleByRank(st, events) {
    var ru = unbeatableUnits(st, 'red'), bu = unbeatableUnits(st, 'blue');
    if (!ru.length !== !bu.length) {
      var win = ru.length ? 'red' : 'blue';
      var mine = ru.length ? ru : bu;
      var names = mine.map(function (u) { return NAME[u.kind] + '（' + u.level + '）'; }).join('、');
      st.over = true;
      st.result = win;
      events.push({
        t: 'over',
        text: '双方连续 20 手没有实质进展，但' + (win === 'red' ? '红' : '蓝') + '方的 ' + names +
          ' 无人可挡——对方没有任何动物吃得掉它，躲下去也改变不了结局，判' + (win === 'red' ? '红' : '蓝') + '方胜'
      });
      return;
    }
    var rs = rankSum(st, 'red'), bs = rankSum(st, 'blue');
    st.over = true;
    st.result = rs > bs ? 'red' : (bs > rs ? 'blue' : 'draw');
    events.push({
      t: 'over',
      text: '双方连续 20 手没有实质进展——按场上等级总和决算：红 ' + rs + ' / 蓝 ' + bs + '，' +
        (st.result === 'draw' ? '平局' : (st.result === 'red' ? '红方胜' : '蓝方胜'))
    });
  }

  // ---- 棋谱：悔棋与复盘（2026-10-17 要的）----------------------------
  // history 里每一条是「走这一步之前」的局面快照，条目自带一句人话说明。
  function cellName(i) { return '(' + (Math.floor(i / N) + 1) + ',' + (i % N + 1) + ')'; }
  var SKILL_CN = { blast: '自爆', pounce: '猛扑', volley: '狮王矢', freeze: '冰封', shock: '冲击波', meteor: '陨石', kunwave: '十字波涛' };

  function labelOf(pre, action) {
    var who = pre.turn === 'red' ? '红' : '蓝';
    var u = null;
    if (action.type === 'reveal') {
      u = pre.board[action.cell];
      return who + '方掀开 ' + cellName(action.cell) +
        (u ? '（' + NAME[u.kind] + ' ' + LEVEL[u.kind] + '，归' + (u.owner === 'red' ? '红' : '蓝') + '方）' : '');
    }
    if (action.type === 'escape') {
      u = pre.escaped && pre.escaped.unit;
      return who + '方 ' + (u ? NAME[u.kind] : '鼠') + ' 逃出生天 → ' + cellName(action.to);
    }
    if (action.type === 'move') {
      u = pre.board[action.from];
      var vic = pre.board[action.to];
      var tail = '';
      if (vic) {
        tail = (vic.kind === 'dino' && vic.frozen)
          ? (' 敲冰' + (u && vic.owner === u.owner
              ? '（自家恐龙 ' + vic.level + '，值得敲开）'
              : '（敌方恐龙 ' + vic.level + '，敲开等于帮它）'))
          : (' 吃掉' + (vic.owner === 'red' ? '红' : '蓝') + '方 ' + NAME[vic.kind] + ' ' + vic.level);
      }
      return who + '方 ' + (u ? NAME[u.kind] + ' ' + u.level : '动物') + ' ' +
        cellName(action.from) + '→' + cellName(action.to) + tail;
    }
    if (action.type === 'skill') {
      u = pre.board[action.cell];
      var pv = null;
      try { pv = previewAction(pre, action); } catch (e) { pv = null; }
      var tail2 = '';
      if (pv) {
        if (pv.kills.length) {
          tail2 = '：击杀 ' + pv.kills.length + ' 只（' + pv.kills.map(function (k) {
            return (k.u.owner === 'red' ? '红' : '蓝') + NAME[k.u.kind];
          }).join('、') + '）';
        } else if (pv.held.length) {
          tail2 = '：一个都没打死';
        }
      }
      return who + '方 ' + (u ? NAME[u.kind] : '') + ' 放「' + (SKILL_CN[action.skill] || action.skill) + '」' +
        (action.dir !== undefined ? ' 朝' + ['上', '右', '下', '左'][action.dir] : '') +
        (action.target !== undefined ? ' → ' + cellName(action.target) : '') + tail2;
    }
    if (action.type === 'skip') return who + '方放弃行动';
    return who + '方 ' + action.type;
  }

  function pushHist(pre, action, res) {
    var snap = clone(pre);
    snap.history = [];                                  // 快照不带更早的棋谱，免得套娃
    var entry = { label: labelOf(pre, action), state: snap, ply: pre.ply, turn: pre.turn };
    res.state.history = res.state.history || [];
    res.state.history.push(entry);
    if (res.state.history.length > 500) res.state.history = res.state.history.slice(-500);
  }

  // 悔棋：退回上一步（手上的未来就没了，符合直觉）
  function undo(st) {
    if (!st.history || !st.history.length) return { ok: false, error: '已经在开局了' };
    var h = st.history.slice();
    var entry = h.pop();
    var back = clone(entry.state);
    back.history = h;
    return { ok: true, state: back, label: entry.label };
  }

  // 复盘：把整局摊成 n+1 个视图（最后一个就是当前局面），供界面一页页翻
  function timeline(st) {
    var views = [];
    for (var i = 0; i < st.history.length; i++) {
      var v = clone(st.history[i].state);
      v.history = st.history.slice(0, i);
      v.stepLabel = st.history[i].label;
      views.push(v);
    }
    var last = clone(st);
    last.stepLabel = '（当前局面）';
    views.push(last);
    return views;
  }

  function applyAction(state, action) {
    var before = state && state.board ? boardCount(state) : 0;
    var res = applyActionRaw(state, action);
    if (res && res.ok) {
      var st2 = res.state;
      pushHist(state, action, res);                      // 记一步棋（悔棋/复盘用）
      // 只有「掀牌」「放技能」「场上少了动物」才算实质进展；来回踱步不重置计数
      var progressed = (action.type === 'reveal') || (action.type === 'skill') ||
        (boardCount(st2) < before);
      if (progressed) st2.idle = 0; else st2.idle = (st2.idle || 0) + 1;
      if (!st2.over && st2.idle >= 20) settleByRank(st2, res.events);
    }
    return res;
  }

  function applyActionRaw(state, action) {
    var st = clone(state);
    var events = [];
    if (st.over) return { state: st, events: events, ok: false, error: '对局已结束' };
    var me = st.turn;

    // 逃生命中：只能落空白格
    if (st.pending && st.pending.kind === 'escape') {
      if (action.type !== 'escape') return fail(st, events, '鼠正在逃生，请先选择落点');
      var u0 = st.escaped && st.escaped.unit;
      var to = action.to;
      if (!u0) { st.pending = null; return fail(st, events, '逃生状态异常'); }
      if (st.board[to]) return fail(st, events, '逃生只能落在空白格');
      if (isWater(to) && !isSwimmer(u0)) return fail(st, events, '深水区只有鼠和企鹅能进');
      u0.cell = to; st.board[to] = u0;
      st.escaped = null; st.pending = null;
      events.push({ t: 'escape', cell: to, text: '鼠窜到了安全处（不占回合）' });
      endTurn(st, events);                        // 逃生不占用回合，对手继续
      return { state: st, events: events, ok: true };
    }

    // 狼的连吃选择
    if (st.pending && st.pending.kind === 'chain') {
      if (action.type === 'skip') { st.pending = null; finishMove(st, events); return { state: st, events: events, ok: true }; }
      if (action.type === 'move') {
        var w0 = st.board[action.from];
        if (!w0 || st.pending.cell !== action.from) return fail(st, events, '连吃对象不合法');
        if (st.pending.targets.indexOf(action.to) < 0) return fail(st, events, '这个目标不在连吃范围内');
        doEatChain(st, action.from, action.to, events);
        if (st.pending) return { state: st, events: events, ok: true };   // 还能继续连吃
        finishMove(st, events);
        return { state: st, events: events, ok: true };
      }
      return fail(st, events, '请选择连吃目标或放弃');
    }

    switch (action.type) {
      case 'skip':
        events.push({ t: 'skip', text: '放弃本回合的行动' });
        finishMove(st, events);
        break;
      case 'reveal': {
        var u = st.board[action.cell];
        if (!u || u.revealed) return fail(st, events, '这里没有可掀的牌');
        var isMine = (u.owner === me);
        u.revealed = true;
        events.push({ t: 'reveal', cell: action.cell, mine: isMine,
          text: '掀开 ' + NAME[u.kind] + '（等级 ' + u.level + '）' +
                (isMine ? '' : '——竟然是' + (u.owner === 'red' ? '红方' : '蓝方') + '的！') });
        if (u.kind === 'dino') {
          u.frozen = true; u.frozenHits = 0;
          events.push({ t: 'frozen', cell: action.cell, text: '恐龙带着冰封之躯现身——需要等级≥7 的攻击才能解冻' });
        }
        finishMove(st, events);
        break;
      }
      case 'move': {
        var mv = st.board[action.from];
        if (!mv) return fail(st, events, '这里没有你的动物');
        if (mv.owner !== me) return fail(st, events, '不是你的动物');
        if (!mv.revealed) return fail(st, events, '暗牌不能移动，先把它掀开');
        if (mv.moves <= 0) return fail(st, events, '这个动物本回合已经行动过了');
        if (mv.jailed > 0) return fail(st, events, '被冰封的动物无法行动');
        if (mv.kind === 'dino' && mv.frozen) return fail(st, events, '冰冻的恐龙无法行动');
        var list = moveTargets(st, action.from);
        var found = null;
        for (var i = 0; i < list.length; i++) if (list[i].to === action.to) found = list[i];
        if (!found) return fail(st, events, '不能走到那里');
        var tgt = st.board[action.to];
        if (found.kind === 'fly') {
          st.board[action.from] = null; mv.cell = action.to; st.board[action.to] = mv; mv.moves--;
          events.push({ t: 'fly', cell: action.to, text: NAME[mv.kind] + '掠过棋盘，落在空位' });
          finishMove(st, events);
        } else if (found.kind === 'hop') {
          st.board[action.from] = null; mv.cell = action.to; st.board[action.to] = mv; mv.moves--;
          events.push({ t: 'move', cell: action.to, text: NAME[mv.kind] + '翻越障碍落位' });
          finishMove(st, events);
        } else if (found.kind === 'thaw') {
          var din = st.board[action.to];
          if (crackAllowed(st)) {
            din.frozenHits = (din.frozenHits || 0) + 1;
            events.push({ t: 'thawHit', cell: action.to, text: (din.owner === mv.owner ? '自家 ' : '') + NAME[mv.kind] + ' 撞在冰层上（' + din.frozenHits + '/2）' });
            if (din.frozenHits >= 2) {
              din.frozen = false; din.frozenHits = 0;
              events.push({ t: 'thaw', cell: action.to, text: '冰层碎了——恐龙解冻成功！' });
            }
          } else {
            events.push({ t: 'thawHit', cell: action.to, text: NAME[mv.kind] + ' 撞在冰层上，冰面纹丝不动' });
          }
          mv.moves--;
          finishMove(st, events);
        } else if (tgt) {
          doEatChain(st, action.from, action.to, events);
          if (st.pending) return { state: st, events: events, ok: true };   // 等逃生 / 等连吃选择
          finishMove(st, events);
        } else {
          st.board[action.from] = null; mv.cell = action.to; st.board[action.to] = mv; mv.moves--;
          finishMove(st, events);
        }
        break;
      }
      case 'skill':
        return applySkill(st, events, me, action);
      default:
        return fail(st, events, '未知动作');
    }
    if (st.pending) return { state: st, events: events, ok: true };  // 等待子决策
    return { state: st, events: events, ok: true };
  }

  function fail(st, events, msg) {
    return { state: clone(st), events: [], ok: false, error: msg };
  }

  function doEat(st, from, to, events) {
    if (doEatBase(st, from, to, events)) return;   // 等待鼠逃生
    finishMove(st, events);
  }

  // 连吃用：吃掉后继续检查连吃机会，不结束回合
  function doEatChain(st, from, to, events) {
    if (doEatBase(st, from, to, events)) return;
    st.pending = null;              // 旧的连吃状态作废，由 checkChain 按新位置重算
    checkChain(st, to, events);
  }

  // 返回 true 表示正在等待「鼠逃生」的子决策
  function doEatBase(st, from, to, events) {
    var oldPending = st.pending;   // 连吃时旧 pending 会残留，先存一份
    var atk = st.board[from], def = st.board[to];
    var defKind = def.kind;
    events.push({ t: 'attack', text: NAME[atk.kind] + ' 吃 ' + NAME[def.kind] });
    // 冰封的恐龙是无敌的：任何攻击撞上去都只是敲冰（一次一层），攻方留在原地、占回合
    // （2026-10-16 裁定：大象的撞击是解封恐龙，而不是连冰块吞下）
    if (def.kind === 'dino' && def.frozen) {
      atk.moves = Math.max(0, atk.moves - 1);
      if (crackAllowed(st)) {
        def.frozenHits = (def.frozenHits || 0) + 1;
        events.push({ t: 'thawHit', cell: to, text: NAME[atk.kind] + ' 撞在冰层上（' + def.frozenHits + '/2）' });
        if (def.frozenHits >= 2) {
          def.frozen = false; def.frozenHits = 0;
          events.push({ t: 'thaw', cell: to, text: '冰层碎了——恐龙解冻成功！' });
        }
      } else {
        events.push({ t: 'thawHit', cell: to, text: NAME[atk.kind] + ' 撞在冰层上，冰面纹丝不动' });
      }
      st.pending = null;
      finishMove(st, events);
      return false;
    }
    // 同级同归于尽：两个都碎，鼠的「逃出生天」是躲开致命一击，这里逃不掉
    if (def.level === atk.level) {
      st.pending = null;
      events.push({ t: 'clash', text: '同级相撞，同归于尽' });
      st.board[to] = null;
      st.board[from] = null;
      kill(st, from, -1, events, false);
      return false;
    }
    if (canEat(atk, def)) {
      var snapshot = { kind: def.kind, level: def.level, owner: def.owner };
      st.pending = null;                        // 清掉旧的连吃状态，才判得准新产生的子决策
      kill(st, to, from, events, true);
      var escaping = !!st.pending;              // 鼠触发了逃出生天
      if (!escaping) st.pending = oldPending;   // 连吃选择留给调用方重新计算
      // 吃子一律先落位（自爆 / 冲击波 / 陨石 / 狮王矢那些技能不走这里）
      st.board[from] = null; atk.cell = to; st.board[to] = atk; atk.moves = Math.max(0, atk.moves - 1);
      if (!escaping) afterMeal(st, atk, to, events, snapshot);   // 鼠窜了就不算吃到：熊猫不成长、狼也不连吃
      return escaping;
    }
    return false;
  }

  // 吃啥补啥：熊猫只学「被动、能反复用」的能力（2026-10-16 裁定）
  //   · 学得到：猫侧击、狗疾行、狼连吃、象巨力、鹏鸟翱翔
  //   · 学不到：豹自爆、虎猛扑、狮王矢、企鹅冰封（都是一次性招数），恐龙的冲击波/陨石同理 —— 吃了只涨等级
  // 以后要加新能力，只把「被动·无限次」的写进 LEARNABLE，并接上 moveTargets/skillsFor 里的 hasXxx 判断。
  var LEARNABLE = { cat: '侧击', dog: '疾行', wolf: '连吃', elephant: '巨力', roc: '翱翔' };
  var NOT_LEARNABLE = { leopard: '自爆', tiger: '猛扑', lion: '狮王矢', penguin: '冰封',
                        dino: '冲击波/陨石', kun: '十字波涛' };

  function inherit(st, panda, eatenKind, atkCell, events) {
    var gained = false;
    var key = 'has' + eatenKind.charAt(0).toUpperCase() + eatenKind.slice(1);
    if (LEARNABLE[eatenKind]) {
      if (!panda[key]) { panda[key] = true; gained = true; }
      events.push({ t: 'learn', cell: atkCell,
        text: '熊猫吃啥补啥：获得 ' + NAME[eatenKind] + ' 的「' + LEARNABLE[eatenKind] + '」' + (gained ? '' : '（已拥有）') });
      return;
    }
    if (NOT_LEARNABLE[eatenKind]) {
      events.push({ t: 'learn', cell: atkCell,
        text: '熊猫吃啥补啥：「' + NOT_LEARNABLE[eatenKind] + '」是一次性的招数，学不到（只涨等级）' });
    }
  }

  // 鹏鸟吞下敌方企鹅 → 化身为「鲲」（2026-10-18 追加的特殊变种）：
  // 等级升到 7，失去翱翔（不能再飞），换来会游泳（可进中央深水），并得到一次性的「十字波涛」。
  // 变身只是换 kind / level，owner、id、moves 都不动 —— 吃子这一手照常结束。
  function evolveToKun(atk, atkCell, events) {
    atk.kind = 'kun';
    atk.level = LEVEL.kun;
    atk.used.kunwave = false;
    events.push({ t: 'evolve', cell: atkCell,
      text: '鹏鸟吞下企鹅——化而为鲲！等级升到 ' + LEVEL.kun + '：失去翱翔，能入深水，多出一记「十字波涛」' });
  }

  // 熊猫成长（吃掉后）
  function afterMeal(st, atk, atkCell, events, eaten) {
    if (!(st.flags && st.flags.kun === false) &&
        atk.kind === 'roc' && eaten && eaten.kind === 'penguin' && eaten.owner !== atk.owner) {
      evolveToKun(atk, atkCell, events);
      return;
    }
    if (atk.kind === 'panda' && !(st.flags && st.flags.panda === false)) {
      var before = atk.level;
      atk.level = Math.min(8.5, atk.level + 1);
      events.push({ t: 'grow', cell: atkCell, text: '熊猫成长：等级 ' + before + ' → ' + atk.level });
      if (eaten) inherit(st, atk, eaten.kind, atkCell, events);
    }
  }

  // 狼连吃检测（CORE_MARK_2026）
  function checkChain(st, wolfCell, events) {
    var w = st.board[wolfCell];
    if (!w) return;
    var canChain = (w.kind === 'wolf') || (w.kind === 'panda' && !!w.hasWolf);
    if (!canChain) return;
    var targets = [];
    var r0 = Math.floor(wolfCell / N), c0 = wolfCell - r0 * N;
    var deltas = [[r0 - 1, c0], [r0 + 1, c0], [r0, c0 - 1], [r0, c0 + 1]];
    for (var k = 0; k < 4; k++) {
      var rr = deltas[k][0], cc = deltas[k][1];
      if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
      var nb = rr * N + cc;
      var tt = st.board[nb];
      if (!tt || !tt.revealed) continue;
      if (tt.owner === w.owner) continue;
      if (canEat(w, tt) && canStand(w, nb)) targets.push(nb);
    }
    if (targets.length) {
      st.pending = { kind: 'chain', cell: wolfCell, targets: targets };
      events.push({ t: 'chain', cell: wolfCell, text: '连吃机会：四周有 ' + targets.length + ' 个可吃目标，可继续吃或放弃' });
    }
  }

  function finishMove(st, events) {
    if (st.over) return;
    endTurn(st, events);
    checkOver(st, events);
  }

  // 某一方还有没有冻在冰里的恐龙（中立困兽：不顶兵力，但双方都够得着）
  function hasIce(st, owner) {
    for (var i = 0; i < st.board.length; i++) {
      var u = st.board[i];
      if (u && u.owner === owner && u.kind === 'dino' && u.frozen) return true;
    }
    return false;
  }

  function checkOver(st, events) {
    // 冰封中的恐龙不算兵力（2026-10-17：它是中立存在，不影响胜局）
    var r = alive(st, 'red'), b = alive(st, 'blue');
    var rIce = hasIce(st, 'red'), bIce = hasIce(st, 'blue');
    if (r === 0 && b === 0) {
      st.over = true; st.result = 'draw';
      events.push({ t: 'over', text: (rIce || bIce) ? '两边都没了能动的动物，只剩冰里那头困兽——平局' : '双方同归于尽，平局' });
    } else if (b === 0) {
      st.over = true; st.result = 'red';
      events.push({ t: 'over', text: bIce ? '蓝方只剩一只冰封中的恐龙（它不算任何一方的兵力），等不来解封——红方胜利！' : '蓝方全灭，红方胜利！' });
    } else if (r === 0) {
      st.over = true; st.result = 'blue';
      events.push({ t: 'over', text: rIce ? '红方只剩一只冰封中的恐龙（它不算任何一方的兵力），等不来解封——蓝方胜利！' : '红方全灭，蓝方胜利' });
    }
  }

  // ---- 技能 -----------------------------------------------------------------
  function applySkill(st, events, me, action) {
    var u = st.board[action.cell];
    if (!u || u.owner !== me) return fail(st, events, '不是你的动物');
    var sk = skillsFor(st, action.cell);
    var has = false;
    for (var i = 0; i < sk.length; i++) if (sk[i].id === action.skill) has = true;
    if (!has) return fail(st, events, '这个技能现在不能用');

    if (action.skill === 'freeze') {
      var tgt = st.board[action.target];
      if (!tgt || tgt.owner === me || !tgt.revealed) return fail(st, events, '冰封只能选一个已公开的敌方单位');
      tgt.jailed = 2;                                  // 本回合计数器，跨到下个对方回合时生效一次
      u.used.freeze = true;
      events.push({ t: 'freeze', cell: action.target, text: '企鹅冰封了 ' + NAME[tgt.kind] + '（公开可见，下一回合无法行动）' });
      // 规则：冰封「不占回合」——这一手不算你的回合，你还能指挥别的动物或掀牌；
      // 但企鹅放完技能就动不了了（否则一只企鹅能白嫖一次满额行动）。
      u.moves = 0;
      return { state: st, events: events, ok: true };
    }

    if (action.skill === 'blast') {
      if (u.used.blast) return fail(st, events, '自爆已经用过了');
      u.used.blast = true;
      var p = rc(action.cell);
      st.board[action.cell] = null;
      events.push({ t: 'blast', text: '豹自爆！（3×3 / 5.5 伤害）' });
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        var r = p.r + dr, c = p.c + dc;
        if (!inBoard(r, c)) continue;
        var t2 = st.board[idx(r, c)];
        if (!t2 || !t2.revealed) continue;
        hitWithDamage(st, idx(r, c), 5.5, -1, events);   // 5.5 伤害：扛不住的死，扛得住的不动
      }
      if (st.pending) return { state: st, events: events, ok: true };
      endTurn(st, events); checkOver(st, events);
      return { state: st, events: events, ok: true };
    }

    if (action.skill === 'pounce') {
      var t3 = st.board[action.target];
      // 冰封中的恐龙是中立困兽，谁的猛扑都能砸它（2026-10-17）
      var anyIce = !!(t3 && t3.kind === 'dino' && t3.frozen);
      if (!t3 || (!anyIce && t3.owner === me) || !t3.revealed) return fail(st, events, '猛扑目标是相邻的已公开敌方单位（冰封中的恐龙谁都能砸）');
      if (Math.abs(rc(action.cell).r - rc(action.target).r) + Math.abs(rc(action.cell).c - rc(action.target).c) !== 1)
        return fail(st, events, '猛扑只能打上下左右相邻');
      u.used.pounce = true;
      events.push({ t: 'pounce', text: anyIce
        ? (t3.owner === me ? '虎猛扑自家恐龙，一掌砸在冰层上（威力 7）' : '虎猛扑那头冰封中的恐龙，一掌砸在冰层上（威力 7）')
        : '虎猛扑 ' + NAME[t3.kind] + '（威力 7）' });
      hitWithDamage(st, action.target, 7, action.cell, events);
      if (st.pending) return { state: st, events: events, ok: true };
      endTurn(st, events); checkOver(st, events);
      return { state: st, events: events, ok: true };
    }

    if (action.skill === 'volley') {
      u.used.volley = true;
      var dir = DIR8[action.dir];
      if (!dir) return fail(st, events, '需要选择一个方向');
      var q = rc(action.cell), rr = q.r + dir.dr, cc = q.c + dir.dc, hitCells = [];
      // 削弱（2026-10-16）：不再穿障——遇到第一个挡路的单位就停下，
      // 只有那一个「已公开的敌人」会挨这一箭；暗牌挡箭不掉血
      while (inBoard(rr, cc) && !st.board[idx(rr, cc)]) { rr += dir.dr; cc += dir.dc; }
      var armor = inBoard(rr, cc) ? st.board[idx(rr, cc)] : null;
      // 冰封中的恐龙是中立困兽：谁的箭射中它，都是帮它敲掉一层冰（2026-10-17）
      var anyIce2 = !!(armor && armor.revealed && armor.kind === 'dino' && armor.frozen);
      if (armor && armor.revealed && (armor.owner !== me || anyIce2)) hitCells.push(idx(rr, cc));
      events.push({ t: 'volley', text: '狮王矢沿「' + dir.name + '」射出（威力 7）'
        + (anyIce2 ? '，正中那头冰封中的恐龙' : (armor && !hitCells.length ? '，被前方的东西挡了下来' : (armor ? '' : '，一路空落'))) });
      for (var z = 0; z < hitCells.length; z++) hitWithDamage(st, hitCells[z], 7, action.cell, events);
      if (st.pending) return { state: st, events: events, ok: true };
      endTurn(st, events); checkOver(st, events);
      return { state: st, events: events, ok: true };
    }

    if (action.skill === 'shock') {
      var dir2 = DIR8[action.dir];
      if (!dir2) return fail(st, events, '需要选择一个方向');
      u.used.shock = true;
      events.push({ t: 'shock', text: '恐龙释放冲击波，向「' + dir2.name + '」横扫（6.5 伤害，未公开单位被击退）' });
      var q2 = rc(action.cell), r2 = q2.r + dir2.dr, c2 = q2.c + dir2.dc;
      var victims = [];
      while (inBoard(r2, c2)) {
        var t5 = st.board[idx(r2, c2)];
        if (t5) victims.push({ cell: idx(r2, c2), u: t5 });
        r2 += dir2.dr; c2 += dir2.dc;
      }
      // 从远到近结算，避免推动顺序问题
      victims.reverse();
      for (var v = 0; v < victims.length; v++) {
        var cell = victims[v].cell, unit = st.board[cell];
        if (!unit) continue;
        if (!unit.revealed) { pushUnit(st, cell, dir2, events); continue; }
        if (unit.owner === u.owner) { /* 友军：波只打敌人？——按「所有目标」，含友军 */ }
        hitWithDamage(st, cell, 6.5, action.cell, events, dir2, true);
      }
      if (st.pending) return { state: st, events: events, ok: true };
      endTurn(st, events); checkOver(st, events);
      return { state: st, events: events, ok: true };
    }

    if (action.skill === 'kunwave') {
      // 十字波涛：以鲲为中心，上下左右**四条臂各自穿到棋盘边缘**，每个目标 6.5 伤害；
      // 扛得住的已公开目标与暗牌沿「各自所在方向」被击退 —— 与恐龙冲击波的击退机制同源。
      // 每条臂内部从远到近结算（同冲击波），四条臂互不相交，臂与臂之间顺序无关。
      u.used.kunwave = true;
      events.push({ t: 'kunwave', text: '鲲搅起十字波涛！（上下左右整整四条臂 / 6.5 伤害，扛得住的和暗牌被击退）' });
      var kp = rc(action.cell);
      for (var kd = 0; kd < 4; kd++) {
        var kdir = DIR8[kd];
        var karm = [];
        var kr = kp.r + kdir.dr, kc = kp.c + kdir.dc;
        while (inBoard(kr, kc)) {
          var kcell = idx(kr, kc);
          if (st.board[kcell]) karm.push(kcell);
          kr += kdir.dr; kc += kdir.dc;
        }
        karm.reverse();   // 从远到近结算，避免推动顺序问题
        for (var ka = 0; ka < karm.length; ka++) {
          var kc2 = karm[ka], kunit = st.board[kc2];
          if (!kunit) continue;
          if (!kunit.revealed) { pushUnit(st, kc2, kdir, events); continue; }
          hitWithDamage(st, kc2, 6.5, action.cell, events, kdir, true);
        }
      }
      if (st.pending) return { state: st, events: events, ok: true };
      endTurn(st, events); checkOver(st, events);
      return { state: st, events: events, ok: true };
    }

    if (action.skill === 'meteor') {
      u.used.meteor = true;
      var mp = rc(action.cell);
      st.board[action.cell] = null;
      events.push({ t: 'meteor', text: '恐龙自爆——陨石降临！（3×3 / 8.5 伤害）' });
      for (var dr2 = -1; dr2 <= 1; dr2++) for (var dc2 = -1; dc2 <= 1; dc2++) {
        var rr2 = mp.r + dr2, cc2 = mp.c + dc2;
        if (!inBoard(rr2, cc2)) continue;
        var tv = st.board[idx(rr2, cc2)];
        if (tv && tv.revealed) kill(st, idx(rr2, cc2), -1, events, false);
      }
      if (st.pending) return { state: st, events: events, ok: true };
      endTurn(st, events); checkOver(st, events);
      return { state: st, events: events, ok: true };
    }

    return fail(st, events, '技能未实现');
  }

  // ---- 结算预览（2026-10-17）-------------------------------------------
  // 不动手，先把这一招「会打死谁、谁扛得住」算出来。
  // 军师评分（game-ai.js）和 AI 棋手的说明书（game-llm.js）都用它，
  // 免得两边各算一遍、各错一遍（「对着 7 级狮 + 8 级象放 5.5 自爆」就是这么来的）。
  function previewAction(st, action) {
    var me = null;
    if (action.type === 'skill' && st.board[action.cell]) me = st.board[action.cell].owner;
    else if (action.type === 'move' && st.board[action.from]) me = st.board[action.from].owner;
    if (!me) me = st.turn;
    function label(u) { return (u.owner === 'red' ? '红' : '蓝') + NAME[u.kind] + LEVEL[u.kind]; }

    var res = { kills: [], held: [], hidden: 0, blocked: null, selfDies: false,
                foeGain: 0, ownLoss: 0, text: '' };

    function hit(cell, dmg, push) {
      var u = st.board[cell];
      if (!u) return;
      if (u.kind === 'dino' && u.frozen) {   // 冰封中的恐龙：伤害≥7 才裂一层，那一下也不掉血；不够就只被推
        res.held.push({ u: u, why: dmg >= 7 ? '冰层裂一层' : (push ? '破不开冰，但整块冰被推开' : '破不开冰') });
        return;
      }
      if (!u.revealed) {
        res.hidden++;
        if (push) res.held.push({ u: u, why: '暗牌只被击退，不掉血' });
        return;
      }
      if (dmg >= LEVEL[u.kind]) {
        res.kills.push({ u: u, cell: cell });
        if (u.owner === me) res.ownLoss += LEVEL[u.kind]; else res.foeGain += LEVEL[u.kind];
      } else {
        res.held.push({ u: u, why: '等级 ' + LEVEL[u.kind] + ' > 伤害 ' + dmg + '，白打' + (push ? '（被击退）' : '') });
      }
    }

    if (action.type === 'skill') {
      var u0 = st.board[action.cell];
      var p = u0 ? rc(action.cell) : { r: 0, c: 0 };
      if (action.skill === 'blast' || action.skill === 'meteor') {
        var isM = (action.skill === 'meteor');
        res.selfDies = true;
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
          var r = p.r + dr, c = p.c + dc;
          if (!inBoard(r, c) || idx(r, c) === action.cell) continue;
          var cell = idx(r, c), u = st.board[cell];
          if (!u) continue;
          if (isM) {          // 陨石：3×3 里已公开的一律砸碎（连冰龙一起），暗牌不受影响
            if (!u.revealed) continue;
            res.kills.push({ u: u, cell: cell });
            if (u.owner === me) res.ownLoss += LEVEL[u.kind]; else res.foeGain += LEVEL[u.kind];
          } else {
            hit(cell, 5.5, false);
          }
        }
      } else if (action.skill === 'pounce') {
        hit(action.target, 7, false);
      } else if (action.skill === 'volley') {
        var dir = DIR8[action.dir];
        if (dir) {
          var rr = p.r + dir.dr, cc = p.c + dir.dc;
          while (inBoard(rr, cc) && !st.board[idx(rr, cc)]) { rr += dir.dr; cc += dir.dc; }
          if (inBoard(rr, cc)) {
            var arm = st.board[idx(rr, cc)];
            var ice = !!(arm.revealed && arm.kind === 'dino' && arm.frozen);
            if (arm.revealed && (arm.owner !== me || ice)) hit(idx(rr, cc), 7, false);
            else res.blocked = (arm.revealed ? label(arm) : '一张暗牌');
          }
        }
      } else if (action.skill === 'shock') {
        var d2 = DIR8[action.dir];
        if (d2) {
          var r2 = p.r + d2.dr, c2 = p.c + d2.dc;
          while (inBoard(r2, c2)) { hit(idx(r2, c2), 6.5, true); r2 += d2.dr; c2 += d2.dc; }
        }
      } else if (action.skill === 'kunwave') {
        // 十字四条臂各穿到底：臂上每个目标 6.5，扛得住的和暗牌被击退
        for (var kd2 = 0; kd2 < 4; kd2++) {
          var kdir2 = DIR8[kd2];
          var kr2 = p.r + kdir2.dr, kc2 = p.c + kdir2.dc;
          while (inBoard(kr2, kc2)) { hit(idx(kr2, kc2), 6.5, true); kr2 += kdir2.dr; kc2 += kdir2.dc; }
        }
      } else if (action.skill === 'freeze') {
        var ft = st.board[action.target];
        res.text = ft ? ('禁锢 ' + label(ft) + '（下一回合动不了，不掉血）') : '';
        return res;
      }
    } else if (action.type === 'move') {
      var mv = st.board[action.from], tg = st.board[action.to];
      if (mv && tg && tg.revealed && tg.owner !== me) {
        if (LEVEL[tg.kind] === LEVEL[mv.kind]) {   // 同级同归于尽
          res.selfDies = true;
          res.kills.push({ u: tg, cell: action.to });
          res.ownLoss += LEVEL[mv.kind]; res.foeGain += LEVEL[tg.kind];
        } else {
          hit(action.to, LEVEL[mv.kind], false);
        }
      }
    }

    var foeKills = res.kills.filter(function (k) { return k.u.owner !== me; });
    var ownKills = res.kills.filter(function (k) { return k.u.owner === me; });
    var parts = [];
    if (foeKills.length) parts.push('打死 ' + foeKills.length + ' 只（' + foeKills.map(function (k) { return label(k.u); }).join('、') + '）');
    if (ownKills.length) parts.push('误伤自家 ' + ownKills.length + ' 只（' + ownKills.map(function (k) { return label(k.u); }).join('、') + '）');
    if (res.held.length) parts.push('打不动：' + res.held.map(function (h) { return label(h.u) + '（' + h.why + '）'; }).join('、'));
    if (res.blocked) parts.push('被 ' + res.blocked + ' 挡下，谁都没伤到');
    if (res.selfDies) parts.push('自己阵亡');
    if (!parts.length && res.hidden) parts.push('只推走 ' + res.hidden + ' 张暗牌');
    res.text = parts.join('；');
    res.foeKills = foeKills.length;
    res.ownKills = ownKills.length;
    return res;
  }

  // 伤害结算（会处理冰冻解冻、未公开免疫、等级>=7 解冻）
  // pushSurvive：目标扛住时是否被击退 —— 只有冲击波（恐龙）与十字波涛（鲲）带击退效果
  function hitWithDamage(st, cell, dmg, fromCell, events, pushDir, pushSurvive) {
    var t = st.board[cell];
    if (!t) return;
    if (!t.revealed) { events.push({ t: 'immune', text: '暗牌不受伤害（只被击退）' }); if (pushDir) pushUnit(st, cell, pushDir, events); return; }
    if (t.kind === 'dino' && t.frozen) {
      if (dmg >= 7 && crackAllowed(st)) {
        t.frozenHits = (t.frozenHits || 0) + 1;
        if (t.frozenHits >= 2) {
          t.frozen = false;
          t.frozenHits = 0;
          events.push({ t: 'thaw', cell: cell, text: '冰层彻底碎裂——恐龙解冻并现身！' });
        } else {
          events.push({ t: 'thaw', cell: cell, text: '冰层出现裂痕（还需一次威力≥7的攻击）' });
        }
        return;                                      // 解冻当次不结算伤害
      } else {
        // 2026-10-18 裁定：冰封恐龙「无法被击杀」，所以它和别的扛住者一样会被击退
        // （冰层本身不裂 —— 破冰仍要威力 ≥7；只是整块冰被推着走）
        if (pushSurvive && pushDir) {
          pushUnit(st, cell, pushDir, events);
          events.push({ t: 'immune', cell: cell, text: '破不开冰层（需威力≥7），但整块冰被推开了' });
        } else {
          events.push({ t: 'immune', cell: cell, text: '伤害不足以破开冰层（需威力≥7）' });
        }
        return;
      }
    }
    var lethal = dmg >= t.level;
    if (lethal) kill(st, cell, fromCell, events, false);
    else {
      if (pushSurvive && pushDir) pushUnit(st, cell, pushDir, events);
      events.push({ t: 'scratch', cell: cell, text: NAME[t.kind] + ' 扛住了（伤害 ' + dmg + ' < 等级 ' + t.level + '）' });
    }
  }

  function pushUnit(st, cell, dir, events) {
    var u = st.board[cell];
    if (!u) return;
    var q = rc(cell), r = q.r, c = q.c, last = cell;
    while (true) {
      var nr = r + dir.dr, nc = c + dir.dc;
      if (!inBoard(nr, nc)) break;
      var ni = idx(nr, nc);
      if (st.board[ni]) break;
      if (isWater(ni) && !isSwimmer(u)) break;
      last = ni; r = nr; c = nc;
    }
    if (last === cell) return;
    st.board[cell] = null; u.cell = last; st.board[last] = u;
    events.push({ t: 'push', cell: last, text: NAME[u.kind] + ' 被击退' });
  }

  // ---- 输出 -----------------------------------------------------------------
  var API = {
    N: N, WATER: WATER, LEVEL: LEVEL, NAME: NAME, ICON: ICON, ROSTER: ROSTER,
    SKILL_TEXT: SKILL_TEXT, SKILL_NEED: SKILL_NEED, skillNeed: skillNeed,
    newGame: newGame, clone: clone, setSeed: rng.setSeed, getSeed: rng.getSeed,
    applyAction: applyAction, moveTargets: moveTargets, skillsFor: skillsFor,
    previewAction: previewAction,
    undo: undo, timeline: timeline, cellName: cellName,
    canEat: canEat, alive: alive, other: other, idx: idx, rc: rc, isWater: isWater,
    escapeOwner: escapeOwner, actorOf: actorOf,
    isSwimmer: isSwimmer, DIR8: DIR8, DIR4: DIR4, pushUnit: pushUnit,
    WHALE_CELLS: WHALE_CELLS, pliesToWhale: pliesToWhale, whaleStrike: whaleStrike
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CaptainBeast = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
