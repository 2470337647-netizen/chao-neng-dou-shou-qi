# 超能斗兽棋

初中时用纸片自制的斗兽棋，复刻成能直接玩的网页版。24 张手搓卡牌、5×5 暗牌棋盘、连阵营都藏在背面。

**在线玩**：

- GitHub Pages（主站）：<https://2470337647-netizen.github.io/chao-neng-dou-shou-qi/>
- VibeDrop（备用镜像）：<https://57363tym.vibedrop.site>

主站带版本历史，改版后跟着仓库走；VibeDrop 是独立的一份拷贝，互不影响。

本项目现在是《船长斗兽棋》目录下的子项目：`C:\Users\24703\Desktop\船长斗兽棋\超能斗兽棋\`。老版（带鲸鲸对弈服务的那一版）在上一级目录，两套代码互不引用。

---

## 两条使用路径

| 想干的事 | 打开哪个 |
|---|---|
| 直接玩 / 发给别人 | `超能斗兽棋.html`（单文件，双击即开，可整页托管） |
| 改代码 | `index.html` + 四个 `.js` + `规则书.md` |

`超能斗兽棋.html` 是 `_build/build-single.mjs` 打出来的产物：脚本全部内联、规则书原文内嵌，所以它在任何地方打开都完整可用（包括没有网络的文件系统）。

## 这一版砍掉了什么

上一版项目里有「AI 对战模式」：一个本机 Node 服务（`whale-server.mjs`）把局面发给 DeepSeek，由 AI 执蓝，还带聊天、用量统计、大脑设置。这一版整块移除：

- 没有服务器、没有后端依赖，纯静态页面
- 界面上的「服务」按钮、聊天输入、AI 的大脑设置、用量统计全部删掉
- 天降玩法改叫「深海巨兽天降」（内部字段仍叫 `whale`，不影响逻辑与测试）
- 战绩不再写 `对局记录.jsonl`，改成存在浏览器 `localStorage`（最多 60 局）

## 换来的新东西：访客可以接自己的 AI

顶栏「⚙ 接口」填一个 **OpenAI 兼容**接口（Base URL / 模型 / API Key），点「对手：我的 AI」之后蓝方就由它来下：

- 只存在这台浏览器的 `localStorage`（键 `superbeast.llm`），本站没有服务器，收不到它
- 每手把当前局面 + 引擎给出的候选动作列表发给模型，让它从中挑一个并写一段盘算，回到右侧「AI 的思考」面板
- 模型没答上来时，这一手自动退回本地引擎，不影响继续下
- 复盘点评同理：由访客自己的 AI 写，本地引擎不联网

实测允许浏览器直连（CORS）的服务：DeepSeek、OpenRouter、硅基流动、Moonshot。自建服务需自行放开跨域。

## 文件

| 文件 | 作用 |
|---|---|
| `game-core.js` | 纯逻辑引擎：规则、走法、技能、结算、天降、胜负（可在 node 里跑） |
| `game-ai.js` | 本地 AI：候选生成与打分，棋力 1~4 |
| `game-llm.js` | 浏览器直连 OpenAI 兼容接口：提示词、候选映射、复盘点评 |
| `game-ui.js` | 界面与交互：棋盘渲染、战报、悔棋、复盘、战绩、弹窗 |
| `game-test.js` | 206 项断言：规则回归 + 界面调度 + 伤害账 + 决算判定 |
| `规则书.md` | 规则原文，页面里「规则书」按钮直接渲染这一份 |
| `_build/` | 拼接与打包脚本、原始文件留档 |

## 重建与自检

```powershell
cd C:\Users\24703\Desktop\船长斗兽棋\超能斗兽棋

node game-test.js            # 回归测试，应为 206 项全通过
node _build/build-single.mjs # 重新打单文件
```

`_build/` 里：`build-single.mjs` 产出单文件；`normalize-names.mjs` 把源码与文档里的私人称呼统一成中性说法（幂等，可重复跑）。`splice-ui.mjs` / `splice-html.mjs` 是当初迁移界面时的一次性拼接脚本，会拿 `*.orig.*` 留档重建文件——现在别再跑，否则会把后来的改动一起盖回去。

页面内置几个自检彩蛋：`?ui=1` 自动点一遍悔棋/复盘/候选/战绩/规则书并把结果写进战报，`?fx=giant` 反复放天降特效，`?sim=escape` 摆一个「鼠被吃」的局面验证逃生落点归谁点。

## 发布

### GitHub Pages（主站）

仓库：<https://github.com/2470337647-netizen/chao-neng-dou-shou-qi>

```powershell
$env:GHT = 'github_pat_xxx'   # fine-grained token：Contents + Pages + Administration 读写
node _build\gh-deploy.mjs all # 第一次建仓 + 传文件 + 开 Pages；再跑就是更新
```

脚本走 GitHub REST API，不需要本机装 git。它上传 `index.html`（单文件版）、`README.md`、`规则书.md` 和四个源码文件；`README` 里的路径与本地一致，改完重跑一遍就同步了。Pages 首次生效约 30~90 秒。

### VibeDrop（备用镜像）

```powershell
# 当前线上：slug 57363tym  →  https://57363tym.vibedrop.site
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\24703\Desktop\chatbox\publish.ps1 `
  "C:\Users\24703\Desktop\船长斗兽棋\超能斗兽棋\超能斗兽棋.html" -Title "超能斗兽棋" -Visibility public
```

不带 `-Slug` 会新建一个站点；带 `-Slug` 名义上是更新已有的那个。

⚠️ 实测（2026-10-30）：带 `-Slug` 重新 inline 之后，地址能访问但内容还是旧版（CDN 缓存），加 `?v=xxx` 也一样。改完要真正上线，得先 `-Delete <旧slug>` 删掉，再不带 `-Slug` 新建，会拿到一个新地址（地址换了要同步改上面「在线玩」那行）。

---

规则由口述整理成册，实现与文案是这一版重写的。
