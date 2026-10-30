/* 超能斗兽棋 —— 网页界面逻辑 */
(function () {
  'use strict';
  // node 下（跑 game-test.js 的界面调度自测）直接 require；浏览器里拿两个全局
  var inNode = (typeof document === 'undefined');
  var g = inNode ? require('./game-core.js') : window.CaptainBeast;
  var ai = inNode ? require('./game-ai.js') : window.CaptainAI;
  var st, sel = null, pendingSkill = null, aiOn = false, aiLevel = 3, turnNo = 1;
  var giantOn = true, pendingWhaleFx = false;
  var views = null, replay = null, stats = null, loggedOver = false;   // 复盘视图 / 战绩

  var $ = function (id) { return document.getElementById(id); };
  var boardEl, skillsEl, logEl, turnEl, hintEl;

  function nameOf(u) { return (u.owner === 'red' ? '红' : '蓝') + g.NAME[u.kind]; }

  // 深海巨兽天降：闪光 + 棋盘抖一下 + 中央浮出一只大怪兽（等 render 之后再放，免得被重绘冲掉）
  function playWhaleFx() {
    if (!boardEl) return;
    boardEl.classList.add('whaleBoard');
    setTimeout(function () { boardEl.classList.remove('whaleBoard'); }, 500);
    g.WHALE_CELLS.forEach(function (cell) {
      var el = boardEl.querySelector('[data-i="' + cell + '"]');
      if (!el) return;
      el.classList.add('whaleHit');
      setTimeout(function () { el.classList.remove('whaleHit'); }, 1000);
    });
    var tag = document.createElement('div');
    tag.className = 'whaleEmoji';
    tag.textContent = '🐋';
    boardEl.appendChild(tag);
    setTimeout(function () { if (tag.parentNode) tag.parentNode.removeChild(tag); }, 1300);
  }

  function logEvents(events) {
    if (!events || !events.length) return;
    for (var w = 0; w < events.length; w++) if (events[w].t === 'whale') { pendingWhaleFx = true; break; }
    events.forEach(function (e) {
      if (e.t === 'turn') return;
      var div = document.createElement('div');
      div.className = 'line t-' + e.t;
      div.textContent = e.text;
      logEl.appendChild(div);
    });
    logEl.scrollTop = logEl.scrollHeight;
  }

  function say(text, cls) {
    var div = document.createElement('div');
    div.className = 'line ' + (cls || 'sys');
    div.textContent = text;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // 谁该操作：鼠逃生命中归鼠的主人，其余时候归当前回合方（与 game-core 的 actorOf 同一条规则）
  function actorOfIn(s) { return g.actorOf(s); }

  // 人类能不能动：轮到红方就能动；轮到蓝方、或者在替蓝方的鼠挑逃生落点时，开着电脑对手就交给它
  function humanCanPlayIn(s, aiOnFlag) {
    if (!s || s.over) return false;
    return !(aiOnFlag && g.actorOf(s) === 'blue');
  }
  function humanCanPlay() { return st ? humanCanPlayIn(st, aiOn) : false; }

  // 该不该叫电脑对手出手——看的是「当前该谁操作」，不是 st.turn：
  // 蓝方吃掉红方鼠时 st.turn 还停在 blue，但落点得由红方自己点，AI 不许抢这一手
  function aiShouldActIn(s, aiOnFlag) {
    if (!s || s.over || !aiOnFlag) return false;
    return g.actorOf(s) === 'blue';
  }
  function aiShouldAct() { return st ? aiShouldActIn(st, aiOn) : false; }

  function escapeOwner() { return st ? g.escapeOwner(st) : null; }

  // 顶部回合条：逃生命中要把「这一手归谁」写清楚，别让人以为轮到对面了
  function turnbarText(s, no) {
    if (s.over) return s.result === 'draw' ? '平局' : (s.result === 'red' ? '红方胜利' : '蓝方胜利');
    var eo = g.escapeOwner(s);
    if (eo) return '第 ' + no + ' 回合 · ' + (eo === 'red' ? '红' : '蓝') + '方的鼠正在逃生——落点由它自己选（不占回合）';
    return '第 ' + no + ' 回合 · 轮到' + (s.turn === 'red' ? '红方' : '蓝方');
  }

  // 决算倒计时：连续 20 手没有实质进展就到决算，剩 10 手以内开始提醒（船长 2026-10-18 要的）
  var SETTLE_IDLE = 20;
  function paintSettleCd() {
    var el = $('settleCd');
    if (!el) return;
    var left = SETTLE_IDLE - (st.idle || 0);
    if (st.over || left >= 10) { el.hidden = true; return; }
    el.hidden = false;
    el.className = 'settleCd' + (left <= 5 ? ' hot' : '');
    el.textContent = '⚖️ 决算倒计时：还剩 ' + left + ' 手没有实质进展就到决算' +
      (left <= 5 ? '——快掀牌、吃子或放个技能把它掐掉' : '');
  }

  function hintText() {    if (st.over) return st.result === 'draw' ? '平局——双方同归于尽' : (st.result === 'red' ? '红方胜利！' : '蓝方胜利！');
    var eo = escapeOwner();
    if (eo) return (eo === 'red' ? '红' : '蓝') + '方的鼠挣脱了——点任意空格把它放下去（不占回合）';
    if (st.pending && st.pending.kind === 'chain') {
      return '狼可以连吃！点红框目标继续，或点自己（' + g.NAME[st.board[st.pending.cell].kind] + '）放弃';
    }
    if (pendingSkill) {
      if (pendingSkill.id === 'volley' || pendingSkill.id === 'shock') return '点一个相邻格作为方向';
      return '点一个敌方单位作为目标（灰框可取消）';
    }
    if (sel !== null && st.board[sel] && st.board[sel].moves <= 0) {
      return '这只「' + g.NAME[st.board[sel].kind] + '」本回合已经动过了（狼连吃、企鹅冰封之后也是这样）；点空白处换个动物';
    }
    if (sel !== null) {
      var tl = g.moveTargets(st, sel) || [];
      var hasThaw = tl.filter(function (x) { return x.kind === 'thaw'; }).length > 0;
      return '点了高亮的格子就走过去 / 吃掉它' + (hasThaw ? '；自家冰龙那一格是敲冰（敲一次裂一层）' : '') + '；再点一次取消';
    }
    return (st.turn === 'red' ? '红方' : '蓝方') + '行动：掀一张暗牌（谁的都可能），或指挥自己已公开的动物行动';
  }

  function render() {
    var movable = {}, eatable = {}, pickable = {}, dirHint = {};

    if (st.pending && st.pending.kind === 'chain') {
      st.pending.targets.forEach(function (t) { eatable[t] = true; });
    }
    if (st.pending && st.pending.kind === 'escape') {
      for (var i0 = 0; i0 < st.board.length; i0++) if (!st.board[i0]) movable[i0] = true;
    }
    if (pendingSkill) {
      if (pendingSkill.id === 'pounce') {
        var qp = g.rc(pendingSkill.cell);
        for (var i1 = 0; i1 < st.board.length; i1++) {
          var e1 = st.board[i1];
          if (!e1 || !e1.revealed) continue;
          var anyIce1 = (e1.kind === 'dino' && e1.frozen);   // 冰封中的恐龙是中立困兽，谁的猛扑都能砸
          if (e1.owner === st.turn && !anyIce1) continue;
          var qe = g.rc(i1);
          if (Math.abs(qp.r - qe.r) + Math.abs(qp.c - qe.c) === 1) pickable[i1] = true;
        }
      } else if (pendingSkill.id === 'freeze') {
        for (var i2 = 0; i2 < st.board.length; i2++) {
          var e2 = st.board[i2];
          if (e2 && e2.owner !== st.turn && e2.revealed) pickable[i2] = true;
        }
      } else if (pendingSkill.id === 'volley' || pendingSkill.id === 'shock') {
        var q0 = g.rc(pendingSkill.cell);
        g.DIR8.forEach(function (d) {
          var r = q0.r + d.dr, c = q0.c + d.dc;
          if (r >= 0 && r < g.N && c >= 0 && c < g.N) dirHint[g.idx(r, c)] = true;
        });
      }
    }
    if (sel !== null && st.board[sel] && st.board[sel].moves > 0) {
      g.moveTargets(st, sel).forEach(function (t) {
        if (t.kind === 'eat') eatable[t.to] = true; else movable[t.to] = true;
      });
    }

    boardEl.innerHTML = '';
    for (var i = 0; i < 25; i++) {
      var u = st.board[i];
      var cell = document.createElement('div');
      var ownerSide = (u && u.revealed) ? u.owner : null;   // 暗牌不透露归属
      cell.className = 'cell ' + (ownerSide ? 'side-' + ownerSide : 'side-none');
      if (g.isWater(i)) cell.className += ' water';
      if (sel === i) cell.className += ' sel';
      if (movable[i]) cell.className += ' movable';
      if (eatable[i]) cell.className += ' eatable';
      if (pickable[i]) cell.className += ' pickable';
      if (dirHint[i]) cell.className += ' dirHint';
      if (st.pending && st.pending.kind === 'chain' && st.pending.cell === i) cell.className += ' sel';

      if (u) {
        var tile = document.createElement('div');
        tile.className = 'tile ' + (u.revealed ? ('face owner-' + u.owner) : 'back');
        if (u.revealed) {
          tile.innerHTML = '<span class="icon">' + (g.ICON[u.kind] || '?') + '</span>' +
            '<span class="nm">' + g.NAME[u.kind] + '</span>' +
            '<span class="lv">' + u.level + '</span>' +
            (u.jailed > 0 ? '<span class="badge">🔒</span>' : '') +
            (u.frozen ? '<span class="badge">❄️</span>' : '');
          tile.title = nameOf(u) + ' · 等级 ' + u.level + (u.frozen ? ' · 冰封中（需两次威力≥7 的攻击解冻）' : '') + (u.jailed > 0 ? ' · 被冰封禁锢' : '');
        } else {
          tile.innerHTML = '<span class="qn">?</span>';
          tile.title = '未公开的牌（只受击退，不受伤害）';
        }
        cell.appendChild(tile);
      } else if (g.isWater(i)) {
        cell.innerHTML = '<span class="waterTag">深水区</span>';
      }
      cell.dataset.i = i;
      cell.addEventListener('click', onCellClick);
      boardEl.appendChild(cell);
    }

    turnEl.textContent = turnbarText(st, turnNo);
    turnEl.className = 'turnbar ' + (st.over ? 'over' : 'turn-' + (g.escapeOwner(st) || st.turn));
    paintSettleCd();
    hintEl.textContent = hintText();
    if (pendingWhaleFx) { pendingWhaleFx = false; playWhaleFx(); }

    // 技能面板
    skillsEl.innerHTML = '';
    if (sel !== null && st.board[sel] && st.board[sel].revealed) {
      var su = st.board[sel];
      var list = (humanCanPlay() && su.owner === st.turn) ? g.skillsFor(st, sel) : [];
      var head = document.createElement('div');
      head.className = 'skHead';
      head.textContent = nameOf(su) + ' 的技能' + (su.owner === st.turn ? '' : '（对方的）');
      skillsEl.appendChild(head);
      var skText = g.SKILL_TEXT && g.SKILL_TEXT[su.kind];
      if (skText) {
        var skDesc = document.createElement('div');
        skDesc.className = 'skText';
        skDesc.textContent = skText;
        skillsEl.appendChild(skDesc);
      }
      if (!list.length) {
        var none = document.createElement('div');
        none.className = 'skNone';
        none.textContent = (su.owner === st.turn)
          ? '这只暂时没有可用技能（或已经用掉了）'
          : '现在不是它的回合';
        skillsEl.appendChild(none);
      }
      list.forEach(function (sk) {
        var b = document.createElement('button');
        b.className = 'skBtn';
        b.textContent = sk.label;
        b.onclick = function () { useSkill(sk.id); };
        skillsEl.appendChild(b);
      });
    } else {
      var d = document.createElement('div');
      d.className = 'skNone';
      d.textContent = humanCanPlay() ? '点一个自己的动物，看它能做什么' : '等对方行动…';
      skillsEl.appendChild(d);
    }
  }

  function ownerOfCell(i) { return currentSides[i] || null; }

  var currentSides = [];

  function computeSides() {
    // 开局分区是固定的：拿一局新棋看每个格子的归属（空格 = 中央深水区，无归属）
    currentSides = g.newGame().board.map(function (u) { return u ? u.owner : null; });
  }

  function doAction(action, quiet) {
    if (replay) { say('复盘模式里不能落子——先点「回到最新」', 'bad'); return false; }
    var r = g.applyAction(st, action);
    if (!r.ok) { if (!quiet) say('不能这么做：' + r.error, 'bad'); return false; }
    var prevTurn = st.turn;
    st = r.state;
    if (st.turn !== prevTurn) turnNo++;
    logEvents(r.events);
    sel = null; pendingSkill = null;
    render();
    logIfOver();
    maybeAi();
    return true;
  }

  function maybeAi() {
    if (replay) return;
    if (aiShouldAct()) setTimeout(aiTurn, 420);
  }

  // 收工的活儿：本地 AI 顶一手
  function localTurn() {
    var r = g.applyAction(st, safeLocal());
    if (!r.ok) r = g.applyAction(st, { type: 'skip' });
    if (!r.ok) return;
    var prev = st.turn;
    st = r.state;
    if (st.turn !== prev) turnNo++;
    logEvents(r.events);
    render();
    maybeAi();
  }
  // 电脑这一手：万一算不出来（脚本没加载全 / 某个局面把评分算崩了），
  // 不要闷声放弃回合——退一步用军师榜第一名，并把原因说给船长听。
  function safeLocal() {
    try {
      var a = ai.decide(st, aiLevel);
      if (a) return a;
    } catch (e) {
      try {
        var list = ai.rank(st, {});
        if (list && list.length) {
          say('电脑这手算炸了（' + (e && e.message ? e.message : e) + '），改听军师榜第一名', 'bad');
          return list[0].action;
        }
      } catch (e2) {}
      say('电脑这手算不出来：' + (e && e.message ? e.message : e), 'bad');
    }
    return { type: 'skip' };
  }

  // ---------------- 对手：本地引擎，或者访客自己接的大模型 ----------------
  // oppMode: 0 = 无对手   1 = 本地 AI（默认，离线也能下）   2 = 我的 AI（浏览器直连访客自己填的接口）
  var oppMode = 1;
  var OPP_LABEL = { 0: '对手：无', 1: '对手：本地 AI', 2: '对手：我的 AI' };
  var llm = (typeof window !== 'undefined' && window.BeastLLM)
    || (inNode && typeof require === 'function' ? require('./game-llm.js') : null);

  // 只有三样都填了才算「接上了」——缺一样就退回本地引擎，不弹一堆错
  function llmReady() {
    if (!llm) return false;
    var c = llm.load();
    return !!(c.base && c.model && c.key && c.useMove !== false);
  }

  function paintOpp() {
    var b = $('btnAi'); if (!b) return;
    aiOn = oppMode > 0;
    b.textContent = OPP_LABEL[oppMode] + (oppMode === 2 && !llmReady() ? '（未配置）' : '');
    b.classList.toggle('on', oppMode > 0);
  }

  // 访客自己的 AI 执蓝：把局面拼成提示词，直连它填的接口（浏览器 → 对方的 API，本站不经手）
  function llmTurn() {
    say('🤖 你的 AI 正在想这一步……', 'sys');
    llm.askMove(st).then(function (j) {
      if (!j || !j.action) throw new Error((j && j.error) || '它没给出走法');
      var r2 = g.applyAction(st, j.action);
      if (!r2.ok) throw new Error('这一步不合法：' + (r2.error || ''));
      var prev = st.turn;
      st = r2.state;
      if (st.turn !== prev) turnNo++;
      // 把这一手的长想法挂进棋谱——复盘时还能回看它当时在想什么
      if (st.history && st.history.length) {
        var lastH = st.history[st.history.length - 1];
        if (j.think) lastH.think = j.think;
        if (j.say) lastH.say = j.say;
      }
      renderThinkLog();
      if (j.say) saySoft(j.say, 'sys', '🤖 ', '');
      else say('🤖 （这一手它没吭声，想法在右边「AI 的思考」里）', 'sys');
      sel = null; pendingSkill = null;
      logEvents(r2.events);
      render();
      logIfOver();
      maybeAi();
    }).catch(function (e) {
      say('你自己的接口没答上来（' + ((e && e.message) || e) + '）——这一手让本地引擎顶上', 'bad');
      if (aiShouldAct()) localTurn();
    });
  }
  // 战报里把提到评分/候选的那几句收进「▸ 引擎的话」折叠块，默认收起、点一下展开。
  // 只管显示——引擎照旧打分。
  var ADVISOR_RE = /军师|评分|打分|候选表|候选项|候补|排在前|排第一/;
  function splitAdvisor(t) {
    var s = String(t == null ? '' : t), keep = '', adv = '', buf = '';
    for (var i = 0; i < s.length; i++) {
      buf += s[i];
      if ('，,。；;！!？?、\n'.indexOf(s[i]) >= 0) {
        if (ADVISOR_RE.test(buf)) adv += buf; else keep += buf;
        buf = '';
      }
    }
    if (buf) { if (ADVISOR_RE.test(buf)) adv += buf; else keep += buf; }
    var cut = function (x) { return x.replace(/^[\s，,。；;、]+/, '').replace(/[\s，,。；;、]+$/, ''); };
    return { keep: cut(keep), adv: cut(adv) };
  }

  // 一整行战报：AI 说的话正常显示，引擎相关的碎碎念折起来
  function saySoft(text, cls, prefix, suffix) {
    var r = splitAdvisor(text);
    var div = document.createElement('div');
    div.className = 'line ' + (cls || 'sys');
    div.appendChild(document.createTextNode(prefix + r.keep + (r.keep ? suffix : '')));
    if (r.adv) {
      var det = document.createElement('details');
      det.className = 'adv';
      var sm = document.createElement('summary');
      sm.textContent = '引擎的话';
      det.appendChild(sm);
      det.appendChild(document.createTextNode(r.adv + suffix));
      div.appendChild(det);
    } else if (!r.keep) {
      div.textContent = prefix + suffix;
    }
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function aiTurn() {
    if (!aiShouldAct()) return;       // 只有「该蓝方操作」时电脑才出手，逃生命中看的是鼠主人
    if (oppMode === 2 && llmReady()) { llmTurn(); return; }
    localTurn();
  }

  // ---------------- 战绩：全部记在这台浏览器的 localStorage 里（不上传任何东西）----------------
  // 原来这套是 POST 给本机一个对战服务的接口；公开版没有服务器了，
  // 就地把最近 60 局存在浏览器里。清缓存 = 战绩清零，页面上写清楚了。
  var REC_KEY = 'superbeast.records';
  var REC_MAX = 60;

  function readRecords() {
    try {
      var a = JSON.parse(localStorage.getItem(REC_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  function writeRecords(a) {
    try { localStorage.setItem(REC_KEY, JSON.stringify(a.slice(-REC_MAX))); } catch (e) {}
  }

  function thinkSnippet(t) {
    var s = String(t || '').replace(/\s+/g, ' ').trim();
    return s.length > 200 ? s.slice(0, 200) + '…' : s;
  }

  // mid = true 表示「这局还没下完」（F10 手动存档用），棋谱照样带上，方便事后复盘
  function recordRow(mid) {
    var steps = (st.history || []).map(function (h) {
      return h.label + (h.think ? '（AI 当时的想法：' + thinkSnippet(h.think) + '）' : '');
    });
    var who = oppMode === 2 ? '我的 AI' : '本地 AI';
    return {
      over: !mid, result: mid ? 'unfinished' : st.result, ply: st.ply,
      giant: !!giantOn, level: aiLevel, opp: aiOn ? who : '双人',
      at: new Date().toISOString(), steps: steps
    };
  }

  function saveRecord(mid) {
    var row = recordRow(mid);
    var a = readRecords();
    a.push(row);
    writeRecords(a);
    return row;
  }

  function logIfOver() {
    if (!st.over || loggedOver) return;
    loggedOver = true;
    saveRecord(false);
    renderStats();
  }

  function loadStats() { renderStats(); }

  function statRow(k, v) { return '<div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div>'; }

  // 电脑棋力：新记录存的是 1~4 的数字档，老记录存的是 normal/hard/deep 这种名字
  var LEVEL_NAME = { 1: '随意', 2: '细心', 3: '老深算', 4: '新深算' };
  var LEVEL_OLD = { normal: '随意', hard: '细心', deep: '老深算' };
  function levelName(v) {
    if (v === undefined || v === null || v === '') return '';
    var n = Math.round(Number(v));
    if (isFinite(n) && LEVEL_NAME[n]) return n + '·' + LEVEL_NAME[n];
    return LEVEL_OLD[v] || String(v);
  }

  function renderStats() {
    var el = $('stats'); if (!el) return;
    var rows = readRecords().filter(function (r) { return r.over && r.result !== 'unfinished'; });
    if (!rows.length) {
      el.innerHTML = '<div class="skNone">还没有记录。打完一局自动记在这台浏览器里（不联网、不上传）。</div>';
      return;
    }
    var total = rows.length, red = 0, blue = 0, draw = 0, plies = 0, giants = 0, mine = 0;
    rows.forEach(function (r) {
      if (r.result === 'red') red++;
      else if (r.result === 'blue') blue++;
      else draw++;
      plies += Number(r.ply) || 0;
      if (r.giant) giants++;
      if (r.opp === '我的 AI') mine++;
    });
    var rate = function (n) { return Math.round(n / total * 100) + '%'; };
    var h = '<div class="statGrid">' +
      statRow('总对局', total) +
      statRow('红胜（你）', red + ' · ' + rate(red)) +
      statRow('蓝胜（对手）', blue + ' · ' + rate(blue)) +
      statRow('平局', draw) +
      statRow('平均手数', Math.round(plies / total)) +
      statRow('带巨兽天降', giants) +
      statRow('对手是我自己的 AI', mine) +
      '</div>';
    h += '<div class="statLine">最近 ' + Math.min(5, rows.length) + ' 局</div>';
    rows.slice(-5).reverse().forEach(function (r) {
      var who = r.result === 'red' ? '红胜' : (r.result === 'blue' ? '蓝胜' : '平局');
      var at = String(r.at || '').replace('T', ' ').slice(5, 16);
      h += '<div class="statLine">' + esc(at) + ' · ' + who + ' · ' + esc(r.ply) + ' 手 · ' +
           (r.giant ? '带天降' : '无天降') + ' · ' + esc(levelName(r.level)) + ' · ' + esc(r.opp || '') + '</div>';
    });
    el.innerHTML = h;
  }

  // 复盘点评：交给访客自己的 AI 来写（本地引擎只在内部算分，不会写字）
  function runReview() {
    var box = $('reviewBox'); if (!box) return;
    var rows = readRecords();
    var row = null;
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i].steps && rows[i].steps.length) { row = rows[i]; break; }
    }
    if (!row) {
      box.innerHTML = '<div class="skNone">还没有棋谱。下完一局会自动留一份（对局中按 F10 也能手动存）。</div>';
      return;
    }
    if (!llmReady()) {
      box.innerHTML = '<div class="skNone">复盘点评要一个会写字的 AI——点顶栏「⚙ AI 接口」填上你自己的接口（Base URL / 模型 / Key），再回来点这里。棋盘和规则不用联网。</div>';
      return;
    }
    box.innerHTML = '<div class="skNone">你的 AI 正在翻棋谱…（要几秒）</div>';
    llm.askReview(row).then(function (text) {
      var who = row.result === 'red' ? '红胜（你）' : (row.result === 'blue' ? '蓝胜（对手）' : '平局');
      box.innerHTML = '<div class="statLine">最近一局 · ' + esc(who) + ' · ' + esc(row.ply) + ' 手 · ' +
        esc(row.steps.length) + ' 步棋谱</div>' +
        '<div class="reviewText">' + esc(text).replace(/\n/g, '<br>') + '</div>';
    }).catch(function (e) {
      box.innerHTML = '<div class="skNone">点评没写出来：' + esc((e && e.message) || e) + '</div>';
    });
  }

  // ---------------- AI 的思考（长想法记在右侧面板，战报里只留一句自言自语）----------------
  function thinkEntries() {
    var out = [];
    if (!st.history) return out;
    for (var i = st.history.length - 1; i >= 0; i--) {
      if (st.history[i].think) out.push(st.history[i]);
    }
    return out;
  }

  function renderThinkLog() {
    var el = $('aiThink');
    if (!el) return;
    var list = thinkEntries();
    if (!list.length) {
      el.className = 'skNone';
      el.textContent = '对手还没开始想棋。用「本地 AI」时它不写长想法；切成「对手：我的 AI」并填好接口，每一手的盘算都会记在这儿。';
      return;
    }
    el.className = 'thinkList';
    var html = '<div class="skNone" style="margin:0 0 4px">最新的在最上面 · 已记 ' + list.length + ' 手</div>';
    list.forEach(function (h) {
      var who = (h.turn === 'red') ? '你' : '对手';
      var side = (h.turn === 'red') ? '红方' : '蓝方';
      html += '<div class="thinkItem"><div class="thinkHead">第 ' + h.ply + ' 手 · ' + who + '（' + side + '）· ' + esc(h.label) + '</div>' +
        '<div class="thinkBody">' + esc(h.think) + '</div>' +
        (h.say ? '<div class="thinkSay">🤖 ' + esc(h.say) + '</div>' : '') +
        '</div>';
    });
    el.innerHTML = html;
  }

  // ---------------- 候选表：本地引擎当场算一遍（不联网、不起服务）----------------
  function loadCandidates() {
    var el = $('cands'); if (!el) return;
    el.innerHTML = '<div class="skNone">本地引擎正在算……</div>';
    var now = function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); };
    var t0 = now();
    var list = [];
    try { list = ai.rank(st, {}) || []; }
    catch (e) { el.innerHTML = '<div class="skNone">算不出来：' + esc(e.message || e) + '</div>'; return; }
    var t1 = now();
    var seen = {}, out = [];
    for (var i = 0; i < list.length && out.length < 12; i++) {
      var a = list[i] && list[i].action;
      if (!a) continue;
      var key = JSON.stringify(a);
      if (seen[key]) continue;
      seen[key] = 1;
      var pv = null;
      try { pv = g.previewAction(st, a); } catch (e2) { pv = null; }
      out.push({
        score: Math.round(list[i].score),
        text: llm ? llm.describe(st, a) : key,
        outcome: (pv && pv.text) || ''
      });
    }
    if (!out.length) { el.innerHTML = '<div class="skNone">这个局面它算不出候选。</div>'; return; }
    var h = '';
    out.forEach(function (c, k) {
      h += '<div class="candRow' + (k === 0 ? ' top' : '') + '">' +
           '<span class="cs">' + esc(c.score) + '</span>' +
           '<span class="ct">' + esc(c.text) + '</span></div>';
      if (c.outcome) h += '<div class="candRow" style="border:none;padding:0 0 3px"><span class="cs"></span><span class="co">' + esc(c.outcome) + '</span></div>';
    });
    h += '<div class="statLine">分数最高的那条就是它的首选，算一遍 ' + Math.round(t1 - t0) + ' ms。' +
         '拿它跟自己的判断比一比，就能知道这台引擎值不值得信。</div>';
    el.innerHTML = h;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : (c === '<' ? '&lt;' : '&gt;');
    });
  }

  // ---------------- 悔棋 / 复盘回放 ----------------
  function undoOnce() {
    var r = g.undo(st);
    if (!r.ok) return false;
    st = r.state; sel = null; pendingSkill = null;
    turnNo = Math.max(1, Math.floor(st.ply / 2) + 1);
    return true;
  }

  function doUndo() {
    if (replay) exitReplay();
    if (!undoOnce()) { say('已经在开局那一手了，没得悔', 'bad'); return; }
    var guard = 0;
    while (aiShouldAct() && guard++ < 3) { if (!undoOnce()) break; }   // 一路退到「轮到自己做决定」的那一手
    loggedOver = false;
    logEl.innerHTML = '';
    say('悔棋：退回上一手（战报另起一页；棋谱留着，点「复盘」能看全程）。', 'sys');
    render();
  }

  function enterReplay(at) {
    if (replay) exitReplay();
    views = g.timeline(st);
    replay = { live: st, i: (at == null ? views.length - 1 : at) };
    sel = null;
    showReplayView();
  }

  function exitReplay() {
    if (!replay) return;
    st = replay.live; replay = null; views = null;
    var bar = $('replayBar'); if (bar) bar.style.display = 'none';
    sel = null;
    render();
  }

  function showReplayView() {
    // game-core 的 timeline() 直接给一串「局面快照」，快照上多带一个 stepLabel
    var v = views[replay.i];
    st = v;
    var bar = $('replayBar'); if (bar) bar.style.display = 'flex';
    var stp = $('replayStep');
    if (stp) stp.textContent = '第 ' + replay.i + ' / ' + (views.length - 1) + ' 手';
    var lb = $('replayLabel'); if (lb) lb.textContent = v.stepLabel || '';
    render();
  }

  function replayStep(d) {
    if (!replay) return;
    var n = replay.i + d;
    if (n < 0 || n > views.length - 1) return;
    replay.i = n;
    showReplayView();
  }

  // ---------------- 规则书：直接读 规则书.md（一处改、到处生效）----------------
  function mdToHtml(md) {
    var lines = String(md || '').split(/\r?\n/);
    var out = [], inUl = false, inOl = false, inTbl = false, tblRow = 0;
    function closeAll() {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (inTbl) { out.push('</table>'); inTbl = false; }
    }
    function inline(s) {
      return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
    }
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t) { closeAll(); continue; }
      var m = /^(#{1,4})\s+(.*)$/.exec(t);
      if (m) {
        closeAll();
        var lv = Math.min(4, m[1].length + 1);
        out.push('<h' + lv + '>' + inline(m[2]) + '</h' + lv + '>');
        continue;
      }
      if (/^-{3,}$/.test(t)) { closeAll(); out.push('<hr>'); continue; }
      if (t.charAt(0) === '|') {
        if (!inTbl) { closeAll(); out.push('<table>'); inTbl = true; tblRow = 0; }
        var cells = t.replace(/^\||\|$/g, '').split('|');
        var sep = cells.every(function (c) { return /^[\s:\-]+$/.test(c); });
        if (sep) continue;
        var tag = tblRow === 0 ? 'th' : 'td';
        tblRow++;
        out.push('<tr>' + cells.map(function (c) { return '<' + tag + '>' + inline(c.trim()) + '</' + tag + '>'; }).join('') + '</tr>');
        continue;
      }
      if (inTbl) { out.push('</table>'); inTbl = false; }
      if (/^[-*]\s+/.test(t) || /^\d+[.、]\s*/.test(t)) {
        var ordered = /^\d/.test(t);
        if (ordered && !inOl) { closeAll(); out.push('<ol>'); inOl = true; }
        else if (!ordered && !inUl) { closeAll(); out.push('<ul>'); inUl = true; }
        out.push('<li>' + inline(t.replace(/^[-*]\s+/, '').replace(/^\d+[.、]\s*/, '')) + '</li>');
        continue;
      }
      closeAll();
      out.push('<p>' + inline(t) + '</p>');
    }
    closeAll();
    return out.join('\n');
  }

  // ---------------- 规则书：优先读同目录的 规则书.md；单文件发布时用内嵌的那一份 ----------------
  function loadRulesText() {
    var live = $('rulesLive'), stat = $('rulesStatic');
    if (!live || live.dataset.loaded === '1') return;
    function use(md) {
      if (!md) return false;
      live.innerHTML = mdToHtml(md);
      live.dataset.loaded = '1';
      live.style.display = '';
      if (stat) stat.style.display = 'none';     // 现读的这份说了算，内置副本让位
      return true;
    }
    // build 时把 md 塞进 window.__RULES_MD；开发时没有内嵌就去 fetch 同目录的 md
    if (use(window.__RULES_MD)) return;
    live.innerHTML = '<p class="skNone">正在读 规则书.md …</p>';
    live.style.display = '';
    fetch('规则书.md').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (md) {
      if (!use(md)) throw new Error('规则书是空的');
    }).catch(function () {
      live.innerHTML = ''; live.style.display = 'none';
      if (stat) stat.style.display = '';
    });
  }

  function useSkill(id) {
    // 参数怎么要问引擎的 SKILL_NEED 表（不要再在这里维护一份名单，两边漂移过一次）：
    // null = 不用选目标，点下去就放（自爆 / 陨石降临 / 十字波涛）
    if (g.skillNeed(id) === null) { doAction({ type: 'skill', cell: sel, skill: id }); return; }
    pendingSkill = { id: id, cell: sel };
    sel = null;
    render();
    var cn = { volley: '狮王矢', shock: '冲击波', pounce: '猛扑', freeze: '冰封', kunwave: '十字波涛' }[id] || id;
    say('选择「' + cn + '」的目标', 'sys');
  }

  function onCellClick(ev) {
    var cell = parseInt(ev.currentTarget.dataset.i, 10);
    if (!humanCanPlay()) return;

    if (st.pending && st.pending.kind === 'escape') {
      if (st.board[cell]) { say('逃生只能落在空白格', 'bad'); return; }
      doAction({ type: 'escape', to: cell });
      return;
    }
    if (st.pending && st.pending.kind === 'chain') {
      if (cell === st.pending.cell) { doAction({ type: 'skip' }); return; }
      if (st.pending.targets.indexOf(cell) >= 0) { doAction({ type: 'move', from: st.pending.cell, to: cell }); return; }
      say('只能吃红框里的目标，或点自己放弃', 'bad');
      return;
    }
    if (pendingSkill) {
      var ps = pendingSkill;
      if (ps.id === 'volley' || ps.id === 'shock') {
        var q1 = g.rc(ps.cell), q2 = g.rc(cell);
        var dr = q2.r - q1.r, dc = q2.c - q1.c;
        var di = -1;
        g.DIR8.forEach(function (d, k) { if (d.dr === dr && d.dc === dc) di = k; });
        if (di < 0) { say('方向只能选上下左右相邻的那四格', 'bad'); return; }
        pendingSkill = null;
        doAction({ type: 'skill', cell: ps.cell, skill: ps.id, dir: di });
        return;
      }
      pendingSkill = null;
      doAction({ type: 'skill', cell: ps.cell, skill: ps.id, target: cell });
      return;
    }

    var u = st.board[cell];
    if (sel !== null && cell !== sel) {
      var ts = g.moveTargets(st, sel);
      var hit = null;
      ts.forEach(function (t) { if (t.to === cell) hit = t; });
      if (hit) { doAction({ type: 'move', from: sel, to: cell }); return; }
    }
    if (!u) { sel = null; render(); return; }
    if (!u.revealed) { doAction({ type: 'reveal', cell: cell }); return; }
    if (u.owner !== st.turn) { say('那是' + (u.owner === 'red' ? '红方' : '蓝方') + '的动物', 'bad'); return; }
    sel = (sel === cell) ? null : cell;
    render();
  }

  function newGame() {
    st = g.newGame({ whale: giantOn });
    sel = null; pendingSkill = null; turnNo = 1;
    loggedOver = false; replay = null; views = null;
    var rbar = $('replayBar'); if (rbar) rbar.style.display = 'none';
    computeSides();
    logEl.innerHTML = '';
    say('新的一局开始了。24 张牌背面朝上随机铺满棋盘——连红蓝归属都藏在背面，掀开才知道是谁的。', 'sys');
    say('规则：每回合二选一——掀一张暗牌（掀到对方的牌就归对方，本回合结束），或指挥自己已公开的动物行动。', 'sys');
    if (oppMode === 2 && !llmReady()) {
      say('提示：你选的是「对手：我的 AI」，但接口还没填——这一局先由本地引擎代打。点顶栏「⚙ AI 接口」可以填。', 'sys');
    }
    render();
    renderThinkLog();
    maybeAi();
  }

  // ---------------- AI 接口弹窗：填 Base URL / 模型 / Key，只存在这台浏览器里 ----------------
  function openAiCfg() {
    var m = $('aiCfg'); if (!m) return;
    var c = (llm && llm.load()) || {};
    $('cfgBase').value = c.base || '';
    $('cfgModel').value = c.model || '';
    $('cfgKey').value = c.key || '';
    $('cfgUseMove').checked = c.useMove !== false;
    $('cfgUseReview').checked = c.useReview !== false;
    $('cfgMsg').textContent = '';
    m.classList.add('show');
  }

  function closeAiCfg() {
    var m = $('aiCfg'); if (m) m.classList.remove('show');
  }

  function saveAiCfg() {
    if (!llm) return null;
    var c = {
      base: ($('cfgBase').value || '').trim() || llm.DEFAULT_BASE,
      model: ($('cfgModel').value || '').trim() || llm.DEFAULT_MODEL,
      key: ($('cfgKey').value || '').trim(),
      useMove: !!$('cfgUseMove').checked,
      useReview: !!$('cfgUseReview').checked
    };
    llm.save(c);
    paintOpp();
    return c;
  }

  function testAiCfg() {
    var c = saveAiCfg();
    var msg = $('cfgMsg');
    if (!c || !c.key) { msg.textContent = '先填一个 API Key 才能试。'; return; }
    msg.textContent = '正在连着试试……';
    llm.test(c).then(function (r) {
      msg.textContent = '通了 ✓ ' + (r || '');
    }).catch(function (e) {
      msg.textContent = '没通：' + ((e && e.message) || e) +
        '　（常见的三种：Key 写错了、模型名不存在、对方的接口不允许浏览器直连）';
    });
  }

  function bindAiCfg() {
    if (!llm) return;
    $('btnAiCfg').onclick = openAiCfg;
    $('cfgSave').onclick = function () {
      var c = saveAiCfg();
      $('cfgMsg').textContent = (c && c.key)
        ? '已保存到这台浏览器。切到「对手：我的 AI」就能让它执蓝。'
        : '已保存。Key 还空着——这样不会真的调用接口。';
    };
    $('cfgTest').onclick = testAiCfg;
    $('cfgClose').onclick = closeAiCfg;
    $('aiCfg').addEventListener('click', function (e) { if (e.target === this) closeAiCfg(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAiCfg(); });
  }

  function boot() {
    boardEl = $('board'); skillsEl = $('skills'); logEl = $('log');
    turnEl = $('turnbar'); hintEl = $('hint');

    $('btnNew').onclick = function () { newGame(); };

    // 对手切换：无 → 本地 AI → 我的 AI
    aiOn = true; oppMode = 1;
    paintOpp();
    $('btnAi').onclick = function () {
      oppMode = (oppMode + 1) % 3;
      paintOpp();
      if (oppMode === 2) {
        if (!llmReady()) {
          say('「我的 AI」还没接口——点顶栏「⚙ AI 接口」填上 Base URL / 模型 / Key，就能让它替你执蓝。没填之前蓝方还是本地引擎在走。', 'sys');
        } else {
          say('蓝方交给你的 AI 来下（' + llm.load().model + '）。棋盘、规则、记账都还留在这台浏览器里。', 'sys');
        }
      }
      maybeAi();
      render();
    };

    // 电脑棋力：一根 1~4 的滑杆（1 = 随便玩，3 = 会认真想一手，4 = 每手都想两手），拖完就生效、值记在本地
    var POWER_KEY = 'superbeast.aiPower';
    var savedPower = null;
    try { savedPower = localStorage.getItem(POWER_KEY); } catch (e) { savedPower = null; }
    if (savedPower !== null && savedPower !== '' && isFinite(Number(savedPower))) {
      aiLevel = Math.max(1, Math.min(4, Math.round(Number(savedPower))));
    }
    var powerEl = $('aiPower'), powerValEl = $('aiPowerVal');
    function showPower() { powerValEl.textContent = String(aiLevel); }
    powerEl.value = aiLevel;
    showPower();
    powerEl.oninput = function () {
      aiLevel = Math.max(1, Math.min(4, Math.round(Number(this.value))));
      showPower();
      try { localStorage.setItem(POWER_KEY, String(aiLevel)); } catch (e) {}
      if (aiOn) maybeAi();          // 轮到电脑时，拖完这一下立刻按新棋力走
    };

    $('btnUndo').onclick = function () { doUndo(); };
    $('btnReplay').onclick = function () { if (replay) exitReplay(); else enterReplay(null); };
    $('btnPrev').onclick = function () { replayStep(-1); };
    $('btnNext').onclick = function () { replayStep(1); };
    $('btnLive').onclick = function () { exitReplay(); };
    $('btnCands').onclick = function () {
      var d = document.querySelector('details.advWrap');
      if (d) d.open = true;
      loadCandidates();
    };
    $('btnReview').onclick = function () { runReview(); };
    $('btnRules').onclick = function () {
      $('rules').classList.add('show');
      loadRulesText();
    };
    $('rulesClose').onclick = function () { $('rules').classList.remove('show'); };
    $('rules').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('show'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('rules').classList.remove('show'); });
    $('btnSkip').onclick = function () { if (humanCanPlay()) doAction({ type: 'skip' }); };
    $('btnGiant').onclick = function () {
      giantOn = !giantOn;
      this.textContent = '天降：' + (giantOn ? '开' : '关');
      newGame();
    };
    bindAiCfg();

    // 棋盘大小：拖动即时生效，并记住（下次打开还是这个大小）
    var zoomEl = $('zoom'), zoomValEl = $('zoomVal');
    function applyZoom(v) {
      document.documentElement.style.setProperty('--zoom', v / 100);
      zoomValEl.textContent = v + '%';
      try { localStorage.setItem('superbeast.zoom', String(v)); } catch (e) {}
    }
    var savedZoom = 100;
    try { savedZoom = parseInt(localStorage.getItem('superbeast.zoom'), 10) || 100; } catch (e) {}
    if (!(savedZoom >= 55 && savedZoom <= 160)) savedZoom = 100;
    zoomEl.value = savedZoom;
    applyZoom(savedZoom);
    zoomEl.addEventListener('input', function () { applyZoom(parseInt(zoomEl.value, 10)); });

    // 调试彩蛋：地址栏加 ?fx=giant 就反复放天降特效，方便看效果（不影响正常对局）
    if (location.search.indexOf('fx=giant') >= 0 || location.search.indexOf('fx=whale') >= 0) {
      setTimeout(playWhaleFx, 600);
      setInterval(playWhaleFx, 1600);
    }

    // 调试彩蛋：地址栏加 ?auto=1 就自动替红方掀一张牌
    if (location.search.indexOf('auto=1') >= 0) setTimeout(function () {
      for (var i = 0; i < 25; i++) {
        if (st.board[i] && !st.board[i].revealed) { doAction({ type: 'reveal', cell: i }); return; }
      }
    }, 900);

    // 调试彩蛋：地址栏加 ?sim=escape 摆一个「蓝方吃掉红方鼠」的局面，
    // 复验逃生落点到底归谁点——红鼠的落点必须由红方（人类）来点，AI 不许抢
    if (location.search.indexOf('sim=escape') >= 0) setTimeout(function () {
      function mk(kind, owner, r, c) {
        return {
          id: owner + '-' + kind, kind: kind, level: g.LEVEL[kind], owner: owner,
          cell: g.idx(r, c), revealed: true, frozen: false, frozenHits: 0, jailed: 0,
          used: { escape: false, blast: false, pounce: false, volley: false, freeze: false, shock: false, meteor: false, kunwave: false },
          moves: 1
        };
      }
      st = g.newGame({ whale: false });
      st.board = new Array(25).fill(null);
      st.turn = 'blue';                       // 蓝方（AI）刚动手吃掉红方的鼠
      st.board[g.idx(3, 0)] = mk('lion', 'blue', 3, 0);
      st.board[g.idx(4, 0)] = mk('mouse', 'red', 4, 0);
      sel = null; pendingSkill = null; turnNo = 1;
      logEl.innerHTML = '';
      say('【彩蛋】蓝方狮 (3,0) 吃掉红方鼠 (4,0)', 'sys');
      var rSim = g.applyAction(st, { type: 'move', from: g.idx(3, 0), to: g.idx(4, 0) });
      st = rSim.state;
      render();
      say('落点归谁：' + (g.escapeOwner(st) || '无') + ' · 该谁操作：' + g.actorOf(st), 'sys');
      say('AI 还会抢这一手吗：' + (aiShouldAct() ? '会 ✗（没修好）' : '不会 ✓'), aiShouldAct() ? 'bad' : 'sys');
      say('红方现在能点落点吗：' + (humanCanPlay() ? '能 ✓' : '不能 ✗'), humanCanPlay() ? 'sys' : 'bad');
      setTimeout(function () {
        say('—— 假装红方点了 (4,3) ——', 'sys');
        doAction({ type: 'escape', to: g.idx(4, 3) });
        say('落点后的该谁操作：' + g.actorOf(st) + (g.actorOf(st) === 'red' ? ' ✓（轮到红方接着走）' : ' ✗'), 'sys');
      }, 1200);
    }, 600);

    // 调试彩蛋：按 F9（或地址栏加 ?ui=1）就把新功能自己点一遍——悔棋/复盘/候选表/战绩/规则书，
    // 结果全写进战报，用来肉眼核对；不影响正常对局
    function runUiSelfCheck() {
      var keepAi = aiOn, keepOpp = oppMode;
      try {
        aiOn = false; oppMode = 0;                            // 自检时别让对手插一脚
        function hiddenCount() { var n = 0; for (var i = 0; i < 25; i++) if (st.board[i] && !st.board[i].revealed) n++; return n; }
        var hid = -1;
        for (var i = 0; i < 25; i++) { if (st.board[i] && !st.board[i].revealed) { hid = i; break; } }
        say('【自检】① 掀牌 → 悔棋', 'sys');
        doAction({ type: 'reveal', cell: hid });
        var a1 = hiddenCount();
        doUndo();
        say('【自检】掀牌后剩 ' + a1 + ' 张暗牌，悔棋后回到 ' + hiddenCount() + ' 张（应为 24）', 'sys');
        say('【自检】② 再掀一张 → 复盘步进 → 回到最新', 'sys');
        doAction({ type: 'reveal', cell: hid });
        enterReplay(null);
        say('【自检】复盘：共 ' + (views ? views.length : '?') + ' 个视图，现在停在第 ' + replay.i + ' 手', 'sys');
        replayStep(-1); replayStep(-1);
        say('【自检】复盘停在：' + ($('replayStep') ? $('replayStep').textContent : '?') +
            ' ｜ ' + ($('replayLabel') ? $('replayLabel').textContent : ''), 'sys');
        exitReplay();
        say('【自检】回到最新：暗牌 ' + hiddenCount() + ' 张 · 轮到' +
            (st.turn === 'red' ? '红方' : '蓝方') + ' · 第 ' + turnNo + ' 回合', 'sys');
        say('【自检】③ 候选表 + 战绩面板（右侧两张卡）', 'sys');
        loadCandidates();
        loadStats();
        aiOn = keepAi; oppMode = keepOpp;
        paintOpp();
        setTimeout(function () {
          say('【自检】④ 规则书弹窗', 'sys');
          $('rules').classList.add('show');
          loadRulesText();
        }, 2600);
      } catch (err) {
        aiOn = keepAi; oppMode = keepOpp;
        paintOpp();
        say('【自检】✗ 出错：' + (err && err.message ? err.message : err), 'bad');
      }
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'F9') { e.preventDefault(); runUiSelfCheck(); }
      // 彩蛋：F10 = 把这局的棋谱手动存进本机账本（没下完也行），之后点「复盘点评」就有料
      if (e.key === 'F10') {
        e.preventDefault();
        var n = (st.history || []).length;
        saveRecord(!st.over);
        say('这一局的棋谱存好了（' + n + ' 手，记在这台浏览器里）——点右侧「复盘点评」能让你的 AI 点评。', 'me');
        loadStats();
      }
    });
    if (location.search.indexOf('ui=1') >= 0) setTimeout(runUiSelfCheck, 900);

    newGame();
    loadStats();
  }

  // node 下（跑测试脚本）只导出能脱离 DOM 测的纯函数
  if (inNode) {
    if (typeof module !== 'undefined' && module.exports) module.exports = { mdToHtml: mdToHtml, splitAdvisor: splitAdvisor };
    return;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();