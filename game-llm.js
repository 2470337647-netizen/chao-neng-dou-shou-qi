/* 超能斗兽棋 · AI 接口（浏览器直连 OpenAI 兼容接口）
 * 只用登录在这台浏览器里的配置，不经过任何服务器。
 * 接口：window.BeastLLM = { load, save, ready, describe, askMove, askReview, test, DEFAULT_BASE, DEFAULT_MODEL }
 */
(function (root) {
  'use strict';

  var g = root.CaptainBeast;
  var ai = root.CaptainAI;
  var KEY = 'superbeast.llm';
  var DEFAULT_BASE = 'https://api.deepseek.com';
  var DEFAULT_MODEL = 'deepseek-chat';

  // ---------------- 配置 ----------------
  function load() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      return {
        base: c.base || '',
        model: c.model || '',
        key: c.key || '',
        useMove: c.useMove !== false,
        useReview: c.useReview !== false
      };
    } catch (e) {
      return { base: '', model: '', key: '', useMove: true, useReview: true };
    }
  }

  function save(c) {
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
    return c;
  }

  function ready() {
    var c = load();
    return !!(c.key && (c.base || DEFAULT_BASE) && (c.model || DEFAULT_MODEL));
  }

  function endpoint(c) {
    var base = String((c && c.base) || DEFAULT_BASE).replace(/\/+$/, '');
    if (/\/chat\/completions$/.test(base)) return base;
    return base + '/chat/completions';
  }

  function post(c, body, timeoutMs) {
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 45000) : null;
    return fetch(endpoint(c), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) {
          var msg = 'HTTP ' + r.status;
          try { var j = JSON.parse(t); msg += ' · ' + ((j.error && (j.error.message || j.error)) || t.slice(0, 160)); }
          catch (e) { msg += ' · ' + String(t).slice(0, 160); }
          throw new Error(msg);
        }
        try { return JSON.parse(t); } catch (e) { throw new Error('接口返回的不是 JSON：' + String(t).slice(0, 160)); }
      });
    }).catch(function (e) {
      if (e && e.name === 'AbortError') throw new Error('接口超时（没在限定时间内回话）');
      if (e && e.message === 'Failed to fetch') {
        throw new Error('连不上这个地址（网络、代理，或对方的接口不允许网页直接调用）');
      }
      throw e;
    }).then(function (j) {
      if (timer) clearTimeout(timer);
      var m = j && j.choices && j.choices[0] && j.choices[0].message;
      if (!m) throw new Error('接口没按 OpenAI 格式回话');
      return m.content || '';
    }, function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }

  function pickJson(text) {
    var s = String(text || '').trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    var i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i < 0 || j <= i) throw new Error('AI 没按格式回话：' + s.slice(0, 120));
    try { return JSON.parse(s.slice(i, j + 1)); }
    catch (e) { throw new Error('AI 回的话不是合法 JSON：' + s.slice(i, i + 160)); }
  }

  // ---------------- 局面 -> 文字 ----------------
  function sideName(owner) { return owner === 'red' ? '红' : '蓝'; }

  function cellName(i) {
    var p = g.rc(i);
    return '(' + (p.r + 1) + ',' + (p.c + 1) + ')';
  }

  function unitName(u) {
    if (!u) return '';
    return (u.level) + '级' + (g.NAME[u.kind] || u.kind);
  }

  function boardText(st) {
    var lines = [];
    for (var r = 0; r < 5; r++) {
      var row = [];
      for (var c = 0; c < 5; c++) {
        var i = g.idx(r, c), u = st.board[i];
        if (g.isWater(i)) row.push('水');
        else if (!u) row.push('空');
        else if (!u.revealed) row.push('暗');
        else row.push(sideName(u.owner) + unitName(u) + (u.frozen ? '（冰）' : '') + (u.jailed ? '（禁）' : ''));
      }
      lines.push('第' + (r + 1) + '行：' + row.join(' | '));
    }
    return lines.join('\n');
  }

  function rosterText(st) {
    var mine = [], theirs = [], ice = 0;
    for (var i = 0; i < st.board.length; i++) {
      var u = st.board[i];
      if (!u || !u.revealed) continue;
      var s = unitName(u) + cellName(i);
      if (u.owner === st.turn) mine.push(s); else theirs.push(s);
      if (u.frozen) ice++;
    }
    return '我方（' + sideName(st.turn) + '）：' + (mine.join('、') || '场上已公开的棋子全没了') + '\n' +
           '敌方已公开：' + (theirs.join('、') || '一张都没掀开') + '\n' +
           '轮到：' + sideName(st.turn) + '　第 ' + (st.ply + 1) + ' 手' +
           (st.pending ? '　（有一手待处理）' : '');
  }

  var RULES = [
    '5×5 棋盘，24 张牌暗牌铺满（除中央深水），红蓝各 12 张混在一起，背面一模一样。',
    '每回合二选一：掀一张任意暗牌（掀到自己人→亮出激活，回合结束；掀到对方→该牌归对方、亮出，回合照样结束）；或指挥自己一只已公开动物移动/用技能。',
    '吃子：上下左右相邻的已公开敌方动物，等级≥对方即可吃；同级同归于尽；鼠可以吃象；深水区只有鼠/企鹅/鲲能进，岸上动物吃不到水里。',
    '暗牌不能动、不能吃、也不能被吃；掀牌有风险，掀到对方的牌等于送他一个棋子。',
    '技能：鼠·逃出生天（被吃时免费落到空格）、猫·侧击（斜走斜吃）、狗·疾行（两格）、狼·连吃、豹·自爆、虎·猛扑、狮·狮王矢、象·巨力、企鹅·冰封、熊猫·吃啥补啥（吃被动本领、等级+1）、鹏鸟·翱翔（飞任意空位，落点必须空）、鲲（鹏鸟吃敌方企鹅后变身·十字波涛）、恐龙·冰封之躯/冲击波/陨石。',
    '伤害≥目标等级即击杀，不够就没事。一方全灭判负；40 手无进展 / 双方无子可动按规则决算。',
    '重要：你只能看到已公开的信息。暗牌可能是你的、也可能不是。掀牌是赌博，掀到对方的牌会直接送给对手。'
  ].join('\n');

  function historyText(st, n) {
    var h = st.history || [];
    if (!h.length) return '（还没走过棋）';
    return h.slice(-(n || 10)).map(function (x) {
      return '第' + x.ply + '手 ' + sideName(x.turn) + '：' + x.label;
    }).join('\n');
  }

  // ---------------- 动作 -> 中文 ----------------
  function describe(st, a) {
    if (!a) return '（无效动作）';
    if (a.type === 'reveal') return '掀开' + cellName(a.cell) + '的暗牌';
    if (a.type === 'skip') return '跳过（不动）';
    if (a.type === 'escape') return '鼠逃出生天 → ' + cellName(a.to);
    var u = st.board[a.from];
    var who = u ? (g.ICON[u.kind] || '') + unitName(u) + ' ' + cellName(a.from) : cellName(a.from);
    if (a.type === 'move') return who + ' 走到 ' + cellName(a.to);
    if (a.type === 'skill') {
      var sk = g.SKILL_TEXT && g.SKILL_TEXT[a.skill];
      var name = (sk && (sk.name || sk)) || a.skill;
      var tail = '';
      if (a.to !== undefined && a.to !== null) tail = ' → ' + cellName(a.to);
      if (a.dir) tail = ' 方向 ' + a.dir;
      if (a.target !== undefined && a.target !== null) tail = ' 目标 ' + cellName(a.target);
      return who + ' 使用「' + name + '」' + tail;
    }
    return JSON.stringify(a);
  }

  // ---------------- 让 AI 选一手 ----------------
  function candidates(st, n) {
    var list = [];
    try { list = ai.rank(st, {}) || []; } catch (e) { list = []; }
    var out = [], seen = {};
    for (var i = 0; i < list.length && out.length < (n || 10); i++) {
      var a = list[i] && list[i].action;
      if (!a) continue;
      var k = JSON.stringify(a);
      if (seen[k]) continue;
      seen[k] = 1;
      var pv = null;
      try { pv = g.previewAction(st, a); } catch (e2) { pv = null; }
      out.push({ action: a, score: Math.round(list[i].score), text: describe(st, a), hint: (pv && pv.text) || '' });
    }
    return out;
  }

  function askMove(st) {
    var c = load();
    if (!c.key) return Promise.reject(new Error('还没填 API Key'));
    var cands = candidates(st, 10);
    if (!cands.length) return Promise.reject(new Error('引擎没给出候选'));
    var lines = cands.map(function (x, i) {
      return (i + 1) + '. ' + x.text + (x.hint ? '（' + x.hint + '）' : '');
    }).join('\n');
    var sys = '你在玩《超能斗兽棋》（船长自制斗兽棋的网页版），你执' + sideName(st.turn) + '方，对手是' + (st.turn === 'red' ? '蓝' : '红') + '方。' +
      '每回合只能从给定候选里挑一手，别自己发明动作。\n规则：\n' + RULES +
      '\n回答必须是严格 JSON，不要多余文字：{"pick": 序号(整数), "think": "80~200字的盘算，像人一样想，可以权衡风险和赌一把", "say": "一句话碎嘴（不超过20字）"}';
    var user = '棋盘（水=深水区，暗=背面朝上，空=空格）：\n' + boardText(st) + '\n\n局面：\n' + rosterText(st) +
      '\n\n最近几手：\n' + historyText(st, 8) + '\n\n候选（带分数的已经按引擎评估从高到低排好，分数只是参考，你可以逆着选）：\n' + lines +
      '\n\n现在轮到你，挑一手。';
    return post(c, {
      model: c.model || DEFAULT_MODEL,
      temperature: 0.55,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }]
    }).then(function (txt) {
      var j = pickJson(txt);
      var n = Math.round(Number(j.pick));
      if (!(n >= 1 && n <= cands.length)) n = 1;
      return {
        action: cands[n - 1].action,
        think: String(j.think || '').slice(0, 600),
        say: String(j.say || '').slice(0, 60),
        candidates: cands
      };
    });
  }

  // ---------------- 复盘点评 ----------------
  function askReview(row) {
    var c = load();
    if (!c.key) return Promise.reject(new Error('还没填 API Key'));
    var steps = (row && row.steps) || [];
    if (!steps.length) return Promise.reject(new Error('这一局没有棋谱'));
    var who = row.result === 'red' ? '红方胜' : (row.result === 'blue' ? '蓝方胜' : '平局');
    var sys = '你是一位下棋很厉害、说话不客气但讲道理的教练，给一盘《超能斗兽棋》写赛后点评。' +
      '规则要点：' + RULES + '\n只写实质内容，不奉承。回答用中文纯文本，分四段，每段一两句，不要 markdown 标题。';
    var user = '这局结果：' + who + '，共 ' + row.ply + ' 手' +
      (row.giant ? '，开启了巨兽天降' : '') + '，对手是' + (row.opp || '本地 AI') + '。\n\n棋谱：\n' +
      steps.join('\n') +
      '\n\n请写四段：①整盘的转折点在第几手、发生了什么；②输的一方（或败着）错在哪，给一个更好的选择；③赢的一方赢在哪；④下次开局给一条最该记住的建议。';
    return post(c, {
      model: c.model || DEFAULT_MODEL,
      temperature: 0.7,
      max_tokens: 900,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }]
    });
  }

  function test(c) {
    if (!c || !c.key) return Promise.reject(new Error('还没填 API Key'));
    return post(c, {
      model: c.model || DEFAULT_MODEL,
      temperature: 0,
      max_tokens: 16,
      messages: [{ role: 'user', content: '回一个字：好' }]
    }, 20000).then(function (t) {
      return '模型回话：' + String(t).replace(/\s+/g, ' ').slice(0, 40);
    });
  }

  root.BeastLLM = {
    DEFAULT_BASE: DEFAULT_BASE,
    DEFAULT_MODEL: DEFAULT_MODEL,
    KEY: KEY,
    load: load,
    save: save,
    ready: ready,
    describe: describe,
    candidates: candidates,
    askMove: askMove,
    askReview: askReview,
    test: test,
    boardText: boardText,
    rosterText: rosterText
  };

  // node 下（跑测试）也能 require 到
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BeastLLM;
})(typeof window !== 'undefined' ? window : globalThis);
