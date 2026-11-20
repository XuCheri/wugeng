# 《五更天》架构与模块契约（多人并行开发必读）

> 设计来源：`docs/PLAN.md`（实施计划，所有数值/美术规范以它为准）。
> 本文件定义**模块边界与接口**。并行开发的每位工程师只改自己负责的目录；需要改动契约时，先在自己的汇报里提出，由集成负责人统一修改本文件。

## 0. 总原则

- 零构建：浏览器直接加载原生 ES Modules（`<script type="module">`），不引入任何打包器、框架或运行时依赖。本地调试用 `python3 -m http.server`（ESM 不支持 `file://`）。
- `src/sim/` 与 `src/core/` 是**纯逻辑**：禁止访问 `window`、`document`、`localStorage`、`Math.random`、`Date.now`。随机数一律用 `core/rng.js` 的种子 RNG，时间只来自 `stepRun` 的 `dt`。这样 Node 下的测试和平衡模拟器可以直接运行它们。
- 坐标系：世界坐标单位 = CSS 像素（竖屏逻辑视口约 390×844）。玩家出生在 (0,0)，地图无限延伸。角度用弧度，0 = 向右，顺时针为正（y 轴向下）。
- 逻辑步长固定 `DT = 1/60` 秒。
- 代码风格：现代 JS（ES2022），2 空格缩进，具名导出，不写 TypeScript；关键数值必须放在 `src/sim/balance.js`，不得散落在逻辑代码里。
- 注释、UI 文案用中文；标识符用英文。
- **不要执行 git commit / push**，提交由集成负责人统一完成。

## 1. 目录所有权

| 路径 | 负责人 |
|---|---|
| `index.html`、`src/main.js`、`src/game.js`、`src/input.js`、`tools/package_h5.py`、`e2e/`、`package.json`、`ARCHITECTURE.md` | 集成负责人 |
| `src/core/`、`src/sim/`、`tools/simulate.mjs`、`tests/sim/` | 玩法逻辑工程师（Sim） |
| `src/render/`、`style-lab.html`、`tests/render/` | 渲染美术工程师（Render） |
| `src/ui/`、`src/meta/`、`src/ads/`、`src/audio/`、`src/app.js`、`styles.css`、`privacy.html`、`assets/fonts/`、`tests/meta/`、`tests/ads/` | 界面与系统工程师（UI） |

## 2. ID 约定（全项目统一，禁止改名）

```
heroes:   zhou（打更人·老周） mian（纸扎匠·阿绵） daotong（小道童）
weapons:  gong 更锣 | lantern 灯笼 | talisman 符纸 | brush 墨笔 | coinsword 铜钱剑 | paperman 纸人 | firecracker 爆竹 | bell 铜铃
relics:   clapper 梆子 | censer 香炉 | cinnabar 朱砂 | inkstone 砚台 | bagua 八卦镜 | scissors 剪刀 | tinder 火折子 | redstring 红绳
evolved weapon names (weapon.evolved = true):
          gong→五更鸣锣 lantern→长明灯 talisman→天师符阵 brush→泼墨山河 coinsword→七星剑阵 paperman→纸扎仪仗 firecracker→满堂红 bell→千铃引魂
pairs:    gong+clapper lantern+censer talisman+cinnabar brush+inkstone coinsword+bagua paperman+scissors firecracker+tinder bell+redstring
enemies:  paperkid 纸扎童子 | shade 影祟 | lanternghost 灯笼鬼 | weasel 黄皮子 | sedan 纸轿子 | drowned 水鬼
bosses:   horse 纸马将军(4:00) | umbrella 无面伞女(8:00) | youshen 夜游神(10:00)
pickups:  xp | coin | bun 包子 | banner 招魂幡 | chest 供盒
meta shop:tizhi 体魄 | lidao 力道 | jiaoli 脚力 | yanli 眼力 | wuxing 悟性 | caiyun 财运 | jiyuan 机缘 | huchi 护持
```

## 3. Sim 接口（`src/sim/run.js` 导出）

```js
createRun({ seed, heroId, nightLevel = 0, meta = {}, charm = null }) → RunState
//  meta: getMetaBonuses(save) 的返回值（见 §5），缺省全 0
//  charm: 护身符，形如 { relicId } 或 null；开局直接获得该法器 1 级
stepRun(run, input, dt = DT)        // input: { moveX, moveY ∈ [-1,1]（已归一化，长度≤1）, ultimate: boolean }
chooseUpgrade(run, index)            // 在 status==='levelup' 时选第 index 张签
rerollChoices(run) → boolean         // 消耗 1 次刷新（先用免费，再用广告获得的）；无次数返回 false
grantAdRerolls(run) → boolean        // 广告奖励：+3 次刷新；超过每局上限返回 false
openChest(run) → { evolved: weaponId|null, upgrades: [...] }   // status==='chest' 时调用
revive(run) → boolean                // 广告复活：满血+清屏+无敌3秒；按 mode 检查次数
enterEndless(run)                    // status==='cleared' 时调用，进入无尽
endRun(run) → RunSummary             // 结算（死亡放弃复活 / 通关不进无尽 / 无尽中死亡）
```

### RunState（渲染层与 UI 只读）

```js
{
  seed, heroId, nightLevel,
  time,                // 秒，主线 0→600+，无尽继续累加
  watch,               // 1..5 当前更次；通关后为 6（天亮）
  mode,                // 'main' | 'endless'
  status,              // 'playing' | 'levelup' | 'chest' | 'dead' | 'cleared'
  darkness,            // 0..1 夜色遮罩强度（随更次递增，鸡鸣后归 0），渲染层直接用
  player: { x, y, r, hp, maxHp, armor, speed, level, xp, xpNext, facingX, facingY,
            moving, ult, ultMax, invulnT, hurtT, heroId },
  enemies: [ { id, type, x, y, r, hp, maxHp, elite, boss, hitT, slowT, state, angle } ],
  projectiles: [ { id, kind, x, y, r, angle, t, life, ...kindFields } ],   // 见 §3.1
  pickups: [ { id, kind, x, y, value, tier } ],                            // tier: xp 的 1/2/3 档
  props:   [ { id, kind: 'lanternpost' | 'well' | 'arch', x, y, r, hp } ], // 可破坏灯笼柱 / 古井 / 牌坊
  weapons: [ { id, level, evolved, cd } ],          // 最多 4
  relics:  [ { id, level } ],                       // 最多 4
  choices: null | [ { kind: 'weapon'|'relic'|'overflow'|'coin'|'bun', id, level, isNew, evolvable } ],
  rerolls: { free, ad, adGrants, adGrantMax },      // free/ad 为剩余次数；adGrants 为本局已看广告次数
  revives: { mainUsed, endlessUsed },
  boss: null | { id, type, hp, maxHp, phase },      // 当前存活 Boss，用于顶部 Boss 血条
  stats: { kills, coins, bunsEaten, damageDealt, maxHit, killsByType: {} },
  events: [ ... ]      // 本帧事件，stepRun 开头清空；见 §3.2
}
```

### 3.1 projectile.kind（渲染层按 kind 绘制）

| kind | 关键字段 | 说明 |
|---|---|---|
| `gongPulse` | `radius, maxRadius` | 更锣震波，`t/life` 为进度 |
| `ultPulse` | `radius, maxRadius` | 大招震波 |
| `lantern` | `orbitIndex` | 环绕灯笼 |
| `flameRing` | `radius` | 长明灯常驻火环 |
| `talisman` | `vx, vy, pierce` | 追踪符纸 |
| `brushArc` | `radius, spread` | 墨笔扇形刀光，`angle` 为朝向 |
| `inkPool` | `radius` | 泼墨地面墨迹 |
| `coinsword` | `vx, vy, returning` | 回旋铜钱剑 |
| `paperman` | `targetId, mode` | 纸人召唤物 |
| `firecracker` | `fromX, fromY, toX, toY` | 抛物线爆竹，`t/life` 为飞行进度 |
| `explosion` | `radius` | 爆炸 |
| `bellChain` | `points: [{x,y}]` | 铜铃连锁弧线 |
| `enemyBullet` | `vx, vy, style: 'paperMoney'|'ink'` | Boss 弹幕（伤害玩家） |

Sim 可新增 kind，但必须在本表补一行并通知渲染层。

### 3.2 events（本帧事件，供渲染特效 / 音效 / 伤害数字使用）

```
{ type: 'hit', x, y, amount, crit, enemyId, weaponId }
{ type: 'kill', x, y, enemyType, elite, boss }
{ type: 'playerHurt', amount }
{ type: 'pickup', kind, value }
{ type: 'fire', weaponId }                  // 每次武器触发（用于音效）
{ type: 'ult', x, y }
{ type: 'levelup', level }
{ type: 'watchChange', watch }               // 进入新的一更
{ type: 'bossSpawn', bossType }
{ type: 'bossDefeated', bossType }
{ type: 'evolve', weaponId }
{ type: 'propBreak', x, y, kind }
{ type: 'dawn' }                             // 鸡鸣通关
{ type: 'revive' }
```

### RunSummary

```js
{ heroId, nightLevel, cleared, mode, timeSec, reachedWatch, level, kills, coins,
  bunsEaten, maxHit, killsByType, weapons, relics }
```
`coins` 为本局铜钱（已乘财运加成、夜色加成；**不含**广告翻倍，翻倍由 UI 层处理）。

## 4. 渲染接口（`src/render/renderer.js` 导出）

```js
createRenderer(canvas, { lowQuality = false }) → renderer
renderer.resize(cssWidth, cssHeight, dpr)          // dpr 上限 2
renderer.render(run, alpha, realDt, settings)      // settings: { shake, dmgText: 'all'|'crit'|'off' }
renderer.consumeEvents(run.events)                 // 由 game.js 每个逻辑步调用一次，生成特效/伤害数字
renderer.hitstop → 当前顿帧剩余秒数（game.js 据此暂停逻辑推进）
```
- 渲染层负责：纸纹、夜色遮罩与灯笼光圈、地面（石板街巷程序生成，按区块缓存）、所有实体、特效、伤害数字、Canvas HUD（经验条、印章计时器「三更 · 05:12」、血量朱印、大招按钮外观、Boss 血条）。
- 大招按钮的**命中区域**由 `renderer.getUltButtonRect()` 返回 `{x,y,w,h}`（CSS 像素），input.js 用它判断点击。
- 渲染层**禁止修改** run 对象。

## 5. 元系统接口（UI 工程师负责）

```js
// src/meta/save.js
loadSave() → Save; saveSave(save); defaultSave(); migrateSave(raw) → Save
// src/meta/shop.js
getMetaBonuses(save) → { maxHpPct, dmgPct, speedPct, pickupPct, xpPct, coinPct, freeRerolls, armor }
//   百分比用小数（0.15 = +15%）。freeRerolls 为额外免费刷新次数（0..2），armor 为整数
// src/meta/unlocks.js
evaluateUnlocks(save, summary) → [{ kind: 'hero'|'night', id }]   // 同时写入 save
// src/meta/checkin.js
getCheckinState(save, now: Date) → { day: 1..7, canClaim, rewards: [...] }
claimCheckin(save, now, doubled: boolean) → reward
// src/ads/ads.js
adsEnabled() → boolean                 // 无广告位 ID 且未开启 mock 时为 false，所有广告入口隐藏
watchAd(placement) → Promise<'completed'|'skipped'|'unavailable'>
//   placement: 'reroll' | 'revive' | 'resultDouble' | 'checkinDouble'
```

## 6. 游戏外壳（集成负责人）

```js
// src/game.js
createGame({ canvas, onStatusChange(run), onSummary(summary), onEvents(events, run), onAutoPause(run) }) → game
//   onStatusChange：run.status 变化时调用（levelup / chest / dead / cleared）
//   onEvents：每个逻辑步的事件数组（UI 层喂给 audio.onEvents）
//   onAutoPause：切到后台时自动暂停，UI 应显示暂停菜单
game.start({ heroId, nightLevel, meta, charm, seed? }) → run
game.pause(); game.resume(); game.isPaused()
game.finish() → RunSummary   // 调用 sim.endRun 并触发 onSummary
game.clear()                 // 回到菜单时清空画面
game.run            // 当前 RunState（UI 用于读取 choices、rerolls 等）
game.settings       // { shake, dmgText, lowQuality }，UI 修改后调用 game.applySettings()
// 所有对 run 的操作（chooseUpgrade/rerollChoices/grantAdRerolls/openChest/revive/enterEndless/endRun）
// 由 UI 直接 import sim 函数调用 game.run，然后调用 game.resume()
```
- `src/app.js`（UI 工程师）：屏幕流转 —— 标题（适龄 12+ 标识、隐私）→ 更房 / 更簿 / 英雄选择 → 局内（三选一、供盒、暂停、复活、通关选择无尽）→ 结算。`src/main.js` 只做 `import { startApp } from './app.js'; startApp()`。
- DOM 层：`#game-canvas`（全屏 Canvas）+ `#ui`（覆盖层，所有菜单面板）。

## 7. 广告规则（UI 层实现，Sim 只负责计数上限）

- 每局前 60 秒（`run.time < 60`）不显示任何广告入口。
- 换签：免费次数用完时才显示「看广告 · 再换三次」，每局最多 `adGrantMax = 2` 次。
- 复活：主线 1 次，无尽 1 次；复活界面必须同时有「不了，结算」。
- 结算翻倍：每次结算 1 次；更簿双倍：每天 1 次。
- `adsEnabled() === false` 时所有广告入口隐藏，游戏照常可玩。
- 只有 `'completed'` 才发奖励；`'skipped'` 提示「看完才能领取奖励」；`'unavailable'` 提示「广告暂时不可用」。
