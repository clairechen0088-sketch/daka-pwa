# 03 - 暑假任务打卡系统 · 实施计划

> 版本：V2.0 | 日期：2026-06-30 | 状态：待实现
>
> **V2 更新：** 以新规则重写迭代计划。废弃旧的 CompletionRate 结算引擎。
> 新核心：rulesConfig 驱动的结算引擎 + 任务组合判定有效学习日 + tier 兑换限制 + 抽奖关闭。

---

## 1. 技术栈

| 层 | 选型 | 原因 |
|----|------|------|
| 框架 | 无框架，纯 HTML/CSS/JS | 页面少，无构建工具链，iPad 兼容最佳 |
| 数据库 | IndexedDB（Dexie.js v4 封装） | 本地持久化，比 localStorage 容量大、结构化查询 |
| 离线 | Service Worker | PWA 离线可用 + 缓存静态资源 |
| 托管 | GitHub Pages / Vercel | 免费 HTTPS，iPad Safari 兼容 |
| 图标 | Emoji | 零加载体积，无需图片资源 |
| 库引入 | 本地 vendor | 不从 CDN 加载，离线稳定 |

## 2. 目录结构

```
/
├── index.html              # 入口，SPA 路由分发
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker
├── vendor/
│   └── dexie.min.js        # Dexie.js v4（本地引入，不用 CDN）
├── src/
│   ├── db.js               # IndexedDB schema + 查询层
│   ├── app.js              # 路由 + 全局状态
│   ├── engine.js           # 结算引擎（V2 重写：rulesConfig 驱动）
│   ├── rules.js            # 新增：rulesConfig 读取 + 积分计算 + 封顶 + 有效日判定
│   ├── backup.js           # 导出/导入逻辑
│   ├── utils.js            # 日期、格式化等工具
│   ├── ui/
│   │   ├── children/
│   │   │   ├── challenge.js    # 今日挑战页（checkbox + duration 任务）
│   │   │   ├── rewards.js      # 奖励页（仅积分兑换，抽奖隐藏）
│   │   │   └── history.js      # 积分流水页
│   │   └── parent/
│   │       ├── confirm.js      # 今日确认页（仅确认/撤销，不展示 partial）
│   │       ├── manage.js       # 奖励管理 + 规则配置
│   │       └── settings.js     # 设置页（任务配置+备份+PIN+rulesConfig）
│   └── styles/
│       ├── base.css         # 基础变量、游戏化暗色主题
│       ├── challenge.css    # 挑战页样式
│       ├── rewards.css      # 奖励页样式（含 tier 分组）
│       └── parent.css       # 家长端样式
└── assets/
    └── icons/               # PWA 图标（可选，可生成）
```

## 3. 开发顺序（V2 更新）

### S1：项目骨架 + IndexedDB + PWA + 备份

| 任务 | 说明 |
|------|------|
| 创建 `index.html` + 基础 HTML 结构 | 底部导航 + 页面容器 |
| 创建 `manifest.json` | PWA 配置：名称、图标、全屏模式 |
| 创建 `sw.js` | Service Worker 缓存静态资源 |
| 创建 `src/db.js` | Dexie.js 初始化 + 所有 Object Store（含 V2 新增：rulesConfig、protectionCardRecords） |
| 创建 `src/utils.js` | 日期工具（getToday、dayCutoff、formatDate） |
| 创建 `src/backup.js` | 导出完整备份 JSON + 导出配置模板 + 下载 |
| 创建 `src/styles/base.css` | CSS 变量、暗色主题、排版基础 |
| 初始化默认数据 | 默认 taskTemplates、默认 rulesConfig、默认 rewards |
| **验收：** 本地 HTTPS 打开 → 添加到主屏幕 → 可导出完整备份 JSON + 配置模板 JSON |

### S2：孩子端今日挑战页（使用新 taskTemplate 配置）

| 任务 | 说明 |
|------|------|
| 每日任务自动生成 | 根据 taskTemplate + weekday + active 生成 dailyTask |
| 挑战页 UI | 任务卡片列表、emoji 图标、任务名、建议时长、分值标签 |
| checkbox 任务 | 点击打卡/取消打卡 + childChecked 切换 + 动画 |
| duration 任务（熏听） | 时长选择器（0/30/60/90/120/150/180）+ 预计积分显示 |
| 实时预计得分 | 根据 rulesConfig 预估（不做最终复杂结算） |
| 页面状态渲染 | 未开始/进行中/全部完成/已确认/休息日 |
| 任务卡片状态 | 已打卡→"待确认"、家长确认后→"已得分" |
| **验收：** checkbox 可打卡/取消、duration 可选时长、状态切换正确、分值估算正确 |

### S3：家长确认 + V2 结算引擎（核心重写）

| 任务 | 说明 |
|------|------|
| PIN 码输入页 | 4 位数字输入 + SHA-256 验证 |
| 确认页 UI | 单孩子任务表 + 仅确认/撤销两个操作（不展示 partial） |
| `src/rules.js` | rulesConfig 读取 + 各规则计算函数 |
| 结算引擎 V2（`src/engine.js`） | **完全重写**，见下方结算引擎设计 |
| 熏听积分计算 | 根据 durationMinutes + rulesConfig.listeningRules 查表 |
| 基础全完成奖励 | 判断 basicStudyTasks 是否全部 approved → +3 |
| 积分封顶 | 学习 45 / 运动 22 / 总 60 / 熏听 5 → 截断入账 |
| 有效学习日判定 | 任务组合判定（废弃 completionRate ≥ 60%） |
| 连续天数计算 | 向前遍历 effective day + 休息日不打断 |
| 连续奖励发放 | 检测里程碑 → streakBonus + protectionCard → streakAwardRecord |
| 保护卡发放 | 连续 7 天时自动 earn |
| 结算幂等 | dailySummary.id + dailyTask.settled 双重校验 |
| 导出完整备份 | S1 已有，S3 补全所有数据 |
| 导入完整备份 | JSON 读取 → 校验 → 覆盖提示 → 写入 |
| **验收：** 见下方验收测试清单 1–30 |

### S4：积分流水 + 奖励兑换（V2 tier 限制）

| 任务 | 说明 |
|------|------|
| 积分流水页 | pointRecord 列表，按时间倒序、类型标签 |
| 兑换商店 UI | reward 按 tier 分组、网格展示、按钮状态 |
| 兑换逻辑 | 余额校验 → tier 频率校验 → 扣减积分 → redeemRecord |
| 兑换频率控制 | small: 每天1次 / medium: 每周2次 / high: 每月2次 / super: 不限 |
| 取消兑换 | status → cancelled + pointRecord: refund |
| 积分不足显示 | "还差 XX 分" |
| 频率达上限显示 | "已达上限" |
| pending 未兑现显示 | "等待兑现中" |
| 家长奖励管理 | 增删改 reward、查看兑换记录、标记 fulfilled |
| 导出配置模板 | rulesConfig + taskTemplates + rewards + lotteryConfig |
| 导入配置模板 | 仅覆盖配置数据，不影响个人数据 |
| **验收：** 兑换扣分正确、取消返还正确、tier 频率限制正确、配置可跨设备复用 |

### S5：设置页完善 + 配置模板管理

| 任务 | 说明 |
|------|------|
| 孩子资料编辑 | 名字、头像 emoji 选择 |
| 任务模板管理 | 增删改、启用/停用、subCategory、taskType、星期勾选、分值设置 |
| rulesConfig 配置 | UI 编辑器（积分上限、有效学习日组合、连续奖励、兑换限制） |
| 奖励商品管理 | S4 已有，S5 完善 tier 编辑 |
| 修改 PIN 码 | 旧 PIN 验证 → 新 PIN 设置 |
| 备份提醒 | 显示上次备份时间，超过 7 天提示 |
| **验收：** 全流程可配置、配置变更后结算行为正确 |

### S6：V1 polish + iPad 实测

| 任务 | 说明 |
|------|------|
| 动画微调 | 打卡完成动画、结算动画、兑换动画 |
| 抽奖 Tab 处理 | 隐藏或显示"暂未开放" |
| iPad 适配测试 | 实际 iPad Safari 测试所有页面 |
| 离线测试 | 断网后 PWA 正常打开和操作 |
| 备份恢复测试 | 导出 → 清空 → 导入 → 数据完全恢复 |
| **验收：** 全流程可用、无 UI 错位、无功能 bug |

---

## 4. V2 结算引擎设计

### 4.1 结算流程

```
家长点击"确认结算"
  │
  ├─ 1. 幂等检查：dailySummary(id=date-childId) 是否已存在
  │     └─ 是 → 拒绝，返回错误
  │
  ├─ 2. 收集当日 dailyTask
  │     按 parentStatus 分类：approved / rejected
  │
  ├─ 3. 逐任务计算积分
  │     ├─ taskType=checkbox + parentStatus=approved → rawPoints = plannedPoints
  │     ├─ taskType=duration + parentStatus=approved  → rawPoints = calcListening(durationMinutes)
  │     └─ parentStatus=rejected → rawPoints = 0
  │
  ├─ 4. 检查基础全完成
  │     basicStudyTasks 全部 approved? → basicStudyBonus = +3
  │
  ├─ 5. 分类积分封顶
  │     ├─ rawStudyPoints = Σ(study 类 approved) + basicStudyBonus
  │     ├─ cappedStudyPoints = min(rawStudyPoints, caps.dailyStudyCap)
  │     ├─ rawSportPoints = Σ(sport 类 approved)
  │     ├─ cappedSportPoints = min(rawSportPoints, caps.dailySportCap)
  │     ├─ rawTotalPoints = cappedStudyPoints + cappedSportPoints
  │     └─ cappedTotalPoints = min(rawTotalPoints, caps.dailyTotalCap)
  │
  ├─ 6. 生成 pointRecord（逐任务 + bonus）
  │     balance 按时间顺序递增
  │
  ├─ 7. 判定有效学习日
  │     根据 effectiveDayRules.validCombinations 匹配
  │     anyMorningRead → chineseMorningRead OR englishMorningRead approved
  │
  ├─ 8. 计算连续天数
  │     从当前日期向前遍历 dailySummary：
  │       - isEffectiveDay=true → 计入
  │       - isEffectiveDay=false → 中断
  │       - 休息日/无任务 → 跳过不中断
  │       - 有任务未结算 → 中断（除非未过 dayCutoff）
  │
  ├─ 9. 检查连续里程碑
  │     遍历 rulesConfig.streakMilestones：
  │       当前连续 ≥ days 且 该 milestone 在当前周期未发放？
  │         → 生成 streakBonus pointRecord
  │         → 生成 protectionCardRecord（如有）
  │         → 写入 streakAwardRecord 防重复
  │
  ├─ 10. 写入 dailySummary
  │       raw × capped 积分、basicStudyCompleted、effectiveDayReason
  │       streakMilestonesTriggered、protectionCardsEarned
  │
  └─ 11. 标记所有 dailyTask.settled = true
```

### 4.2 熏听积分计算函数

```js
function calcListeningPoints(minutes, listeningRules, cap) {
  if (!minutes || minutes <= 0) return { raw: 0, capped: 0 };

  let points = 0;
  for (const rule of listeningRules) {
    if (minutes >= rule.minMinutes && minutes <= rule.maxMinutes) {
      points = rule.points;
      break;
    }
  }
  // 超过最大区间，取最大值
  if (points === 0 && minutes > listeningRules[listeningRules.length - 1].maxMinutes) {
    points = listeningRules[listeningRules.length - 1].points;
  }

  return {
    raw: points,
    capped: Math.min(points, cap)
  };
}
```

### 4.3 有效学习日判定函数

```js
function isEffectiveDay(approvedTaskIds, effectiveDayRules) {
  const has = (id) => approvedTaskIds.includes(id);
  const hasAnyMorning = () => has("chineseMorningRead") || has("englishMorningRead");

  for (const combo of effectiveDayRules.validCombinations) {
    const allMatch = combo.every(id => {
      if (id === "anyMorningRead") return hasAnyMorning();
      return has(id);
    });
    if (allMatch) return { effective: true, reason: combo };
  }

  return { effective: false, reason: null };
}
```

### 4.4 积分封顶函数

```js
function applyCaps(studyPoints, sportPoints, caps) {
  const cappedStudy = Math.min(studyPoints, caps.dailyStudyCap);
  const cappedSport = Math.min(sportPoints, caps.dailySportCap);
  const total = cappedStudy + cappedSport;
  const cappedTotal = Math.min(total, caps.dailyTotalCap);

  // 如果总积分被截断，按比例缩减学习和运动积分
  if (cappedTotal < total) {
    const ratio = cappedTotal / total;
    return {
      study: Math.floor(cappedStudy * ratio),
      sport: Math.floor(cappedSport * ratio),
      total: cappedTotal,
      wasCapped: true
    };
  }

  return {
    study: cappedStudy,
    sport: cappedSport,
    total: cappedTotal,
    wasCapped: false
  };
}
```

---

## 5. 默认配置初始化

### 5.1 默认 taskTemplates（16 个）

```js
const DEFAULT_TASK_TEMPLATES = [
  // ─── 基础学习任务 ───
  { id:"chineseMorningRead",  name:"语文晨读",   icon:"📖", category:"study", subCategory:"morning",   taskType:"checkbox", defaultPoints:1,  suggestedMinutes:15, required:true,  active:true,  weekdays:[1,2,3,4,5,6,7], sortOrder:1 },
  { id:"englishMorningRead",  name:"英语晨读",   icon:"🔤", category:"study", subCategory:"morning",   taskType:"checkbox", defaultPoints:1,  suggestedMinutes:15, required:true,  active:true,  weekdays:[1,2,3,4,5,6,7], sortOrder:2 },
  { id:"chineseMain",         name:"语文主线",   icon:"✏️", category:"study", subCategory:"main",      taskType:"checkbox", defaultPoints:10, suggestedMinutes:40, required:true,  active:true,  weekdays:[1,2,3,4,5,6,7], sortOrder:3 },
  { id:"mathMain",            name:"数学主线",   icon:"➕", category:"study", subCategory:"main",      taskType:"checkbox", defaultPoints:10, suggestedMinutes:40, required:true,  active:true,  weekdays:[1,2,3,4,5,6,7], sortOrder:4 },
  { id:"englishIntensive",    name:"英语精读",   icon:"📚", category:"study", subCategory:"intensive", taskType:"checkbox", defaultPoints:5,  suggestedMinutes:30, required:true,  active:true,  weekdays:[1,2,3,4,5,6,7], sortOrder:5 },
  // ─── 轮换任务 ───
  { id:"englishExtensive",    name:"英语泛读",   icon:"📘", category:"study", subCategory:"rotation",  taskType:"checkbox", defaultPoints:4,  suggestedMinutes:30, required:false, active:false, weekdays:[1,2,3,4,5,6,7], sortOrder:6 },
  { id:"englishRetell",       name:"英语复述",   icon:"🗣️", category:"study", subCategory:"rotation",  taskType:"checkbox", defaultPoints:5,  suggestedMinutes:15, required:false, active:false, weekdays:[1,2,3,4,5,6,7], sortOrder:7 },
  // ─── 自愿加分 ───
  { id:"mathThinking",        name:"数学浅奥",   icon:"🧠", category:"study", subCategory:"optional",  taskType:"checkbox", defaultPoints:5,  suggestedMinutes:20, required:false, active:true,  weekdays:[1,2,3,4,5,6,7], sortOrder:8, maxCountPerDay:1 },
  // ─── 熏听 ───
  { id:"englishListening",    name:"英语熏听",   icon:"🎧", category:"study", subCategory:"listening", taskType:"duration", defaultPoints:0,  suggestedMinutes:30, required:false, active:true,  weekdays:[1,2,3,4,5,6,7], sortOrder:9 },
  // ─── 放松输入 ───
  { id:"englishCartoon",      name:"英语动画",   icon:"📺", category:"study", subCategory:"relaxed",   taskType:"checkbox", defaultPoints:1,  suggestedMinutes:40, required:false, active:true,  weekdays:[1,2,3,4,5,6,7], sortOrder:10 },
  { id:"parentReading",       name:"亲子阅读",   icon:"👨‍👩‍👧", category:"study", subCategory:"relaxed", taskType:"checkbox", defaultPoints:2,  suggestedMinutes:25, required:false, active:true,  weekdays:[1,2,3,4,5,6,7], sortOrder:11 },
  // ─── 运动任务 ───
  { id:"bigSport",            name:"大运动",     icon:"🏃", category:"bigSport",    subCategory:"",  taskType:"checkbox", defaultPoints:10, suggestedMinutes:50, required:false, active:true,  weekdays:[1,2,3,4,5,6,7], sortOrder:20 },
  { id:"smallSport1",         name:"小运动1",    icon:"🤸", category:"smallSport",  subCategory:"",  taskType:"checkbox", defaultPoints:3,  suggestedMinutes:10, required:false, active:true,  weekdays:[1,2,3,4,5,6,7], sortOrder:21 },
  { id:"smallSport2",         name:"小运动2",    icon:"🤸", category:"smallSport",  subCategory:"",  taskType:"checkbox", defaultPoints:3,  suggestedMinutes:10, required:false, active:true,  weekdays:[1,2,3,4,5,6,7], sortOrder:22 },
  { id:"smallSport3",         name:"小运动3",    icon:"🤸", category:"smallSport",  subCategory:"",  taskType:"checkbox", defaultPoints:3,  suggestedMinutes:10, required:false, active:true,  weekdays:[1,2,3,4,5,6,7], sortOrder:23 },
  { id:"smallSport4",         name:"小运动4",    icon:"🤸", category:"smallSport",  subCategory:"",  taskType:"checkbox", defaultPoints:3,  suggestedMinutes:10, required:false, active:false, weekdays:[1,2,3,4,5,6,7], sortOrder:24 }
];
```

### 5.2 默认 rewards（15 个，按 tier 分组）

```js
const DEFAULT_REWARDS = [
  // small
  { id:"reward-s-1",  name:"选一个贴纸/小卡片",   icon:"🎟️", cost:30,  tier:"small",  active:true, sortOrder:1 },
  { id:"reward-s-2",  name:"睡前多听1个故事",     icon:"📖", cost:40,  tier:"small",  active:true, sortOrder:2 },
  { id:"reward-s-3",  name:"选择一次晚餐水果",     icon:"🍎", cost:50,  tier:"small",  active:true, sortOrder:3 },
  { id:"reward-s-4",  name:"多10分钟亲子游戏",     icon:"🎲", cost:60,  tier:"small",  active:true, sortOrder:4 },
  // medium
  { id:"reward-m-1",  name:"周末看一集动画",       icon:"📺", cost:100, tier:"medium", active:true, sortOrder:5 },
  { id:"reward-m-2",  name:"买一个小文具",         icon:"✏️", cost:120, tier:"medium", active:true, sortOrder:6 },
  { id:"reward-m-3",  name:"选择一次家庭小游戏",   icon:"🎯", cost:150, tier:"medium", active:true, sortOrder:7 },
  { id:"reward-m-4",  name:"周末去小公园/游乐区",  icon:"🛝", cost:180, tier:"medium", active:true, sortOrder:8 },
  // high
  { id:"reward-h-1",  name:"买一个小玩具",         icon:"🧸", cost:300, tier:"high",   active:true, sortOrder:9 },
  { id:"reward-h-2",  name:"去一次喜欢的运动场地", icon:"🏟️", cost:350, tier:"high",   active:true, sortOrder:10 },
  { id:"reward-h-3",  name:"选择一次亲子外出项目", icon:"🚗", cost:400, tier:"high",   active:true, sortOrder:11 },
  { id:"reward-h-4",  name:"买一本喜欢的书/漫画",  icon:"📚", cost:450, tier:"high",   active:true, sortOrder:12 },
  // super
  { id:"reward-x-1",  name:"大玩具/模型/乐高套装", icon:"🧱", cost:800,  tier:"super",  active:true, sortOrder:13 },
  { id:"reward-x-2",  name:"特别亲子日活动",       icon:"🌟", cost:1000, tier:"super",  active:true, sortOrder:14 },
  { id:"reward-x-3",  name:"主题外出(科技馆/动物园)", icon:"🦁", cost:1200, tier:"super", active:true, sortOrder:15 }
];
```

### 5.3 默认 rulesConfig

参见 `02-data-model.md` §2 中的完整结构。

---

## 6. 验收测试清单（V2 完整版）

| # | 测试项 | 预期结果 |
|---|--------|----------|
| 1 | 完成 5 个基础学习任务后 | 额外 +3 分（basicStudyBonus） |
| 2 | 只完成晨读 + 熏听 + 动画 | 不算有效学习日 |
| 3 | 完成语文主线 + 数学主线 | 算有效学习日（条件 A） |
| 4 | 完成语文主线 + 英语精读 + 任意晨读 | 算有效学习日（条件 B） |
| 5 | 只完成一个主线任务 | 不算有效学习日，但正常得分 |
| 6 | 熏听 0 分钟 | 得 0 分 |
| 7 | 熏听 60 分钟 | 得 1 分 |
| 8 | 熏听 90 分钟 | 得 2 分 |
| 9 | 熏听 120 分钟 | 得 3 分 |
| 10 | 熏听 180 分钟 | 得 5 分 |
| 11 | 熏听超过 180 分钟 | 仍最多 5 分（封顶） |
| 12 | 小运动多个任务累计 | 运动积分不超过 22 分 |
| 13 | 学习积分计算 | 不超过 45 分 |
| 14 | 每日总积分 | 不超过 60 分 |
| 15 | 连续 3 天有效学习日 | 发 +5 分 streakBonus |
| 16 | 连续 7 天有效学习日 | 发 +15 分 + 1 张保护卡 |
| 17 | 连续 14 天有效学习日 | 发 +30 分 |
| 18 | 连续 30 天有效学习日 | 发 +80 分 |
| 19 | 同一连续周期内同一里程碑 | 不重复发 |
| 20 | 断签后重新连续达到里程碑 | 可重新发 |
| 21 | 重复点击"确认结算" | 不重复生成 pointRecord（幂等） |
| 22 | 修改任务模板分值 | 历史 dailyTask.plannedPoints 不变（快照） |
| 23 | 兑换后余额 | balance >= 0，不会出现负数 |
| 24 | 取消 pending 兑换 | 生成 pointRecord: refund，不直接删记录 |
| 25 | 兑换奖励快照 | 改 reward 名称/价格后，历史 redeemRecord 不变 |
| 26 | 积分不足兑换 | 不允许兑换，提示"还差 XX 分" |
| 27 | V1 不显示 partial | 家长确认页只有确认/撤销 |
| 28 | V1 不开启抽奖 | lottery.enabled=false，抽奖 Tab 隐藏 |
| 29 | 小奖励每天最多兑换 1 次 | 超过提示"已达上限" |
| 30 | 中奖励每周最多兑换 2 次 | 超过提示"已达上限" |
| 31 | 高奖励每月最多兑换 2 次 | 超过提示"已达上限" |
| 32 | 配置模板导出 | 包含 rulesConfig、taskTemplates、rewards，不含积分流水 |
| 33 | 完整备份导出 | 包含所有个人数据 |
| 34 | 导入完整备份 | 提示覆盖当前数据和 PIN |
| 35 | 休息日 | 不增加、不打断连续天数 |
| 36 | 家长补签 | 生成 manualOverrideRecord |
| 37 | 结算后修正 | 走 adjust，不直接改 dailyTask |
| 38 | 导入配置模板 | 不覆盖积分和打卡记录 |
| 39 | iPad Safari 添加到主屏幕 | 全屏打开，无浏览器栏 |
| 40 | 离线使用 | 断网后 PWA 正常打开和操作 |
| 41 | 日界线 | 凌晨 3:59 前操作算前一天 |
| 42 | dailySummary 记录 raw 和 capped | rawEarnedPoints 和 cappedEarnedPoints 均有值 |
| 43 | 保护卡每月最多使用 2 次 | 超过时提示 |
| 44 | 保护卡只保护连续天数 | 不能直接兑换积分 |

---

## 7. 开发顺序依赖（V2 更新）

```
S1 ──→ S2 ──→ S3 ──→ S4 ──→ S5
                           └──→ S6
```

S2 依赖 S1（数据层），S3 依赖 S2（打卡数据），S4 依赖 S3（积分余额 + rulesConfig），S5 依赖 S3/S4。

S6 可与 S4/S5 并行。

**关键变更点：**
- S3 结算引擎完全重写，不再是简单的 completionRate 判定
- S4 新增 tier 兑换频率控制
- S5 新增 rulesConfig UI 编辑器
- 抽奖（旧 S5）不再作为独立迭代，lottery 结构调整为 V1 关闭

---

## 8. V1.5 后续迭代（不在 V1 范围内）

| 功能 | 说明 |
|------|------|
| 抽奖系统 | lottery.enabled = true，chanceRecord 激活 |
| 每日宝箱 | Day 1–14 高频启动期 |
| 星星系统 | Day 15–28 三星宝箱 |
| 成长地图 | Day 29–42 52 格暑假地图 |
| 终局挑战 | Day 43–52 终局宝箱 |
| 保护卡完整 UI | 使用保护卡、查看余额、月度限制 |
| 多设备同步 | Supabase 等云数据库 |

---

## 9. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|:----:|------|
| IndexedDB 在 iPad Safari 行为异常 | 中 | S1 做 iOS 兼容性验证 |
| Service Worker 缓存策略导致更新困难 | 中 | 使用版本号缓存，强制更新 SW |
| 结算引擎逻辑错误（V2 复杂规则） | **高** | S3 用完整测试用例覆盖（44 项验收） |
| 数据丢失（清理 Safari 数据） | 高 | S1 就做导出，S3 完善导入恢复 |
| 两个孩子任务配置不一致 | 低 | S4 配置模板导入导出解决 |
| V2 规则遗漏边界条件 | 中 | 积分封顶、有效日判定等函数独立单元测试 |
