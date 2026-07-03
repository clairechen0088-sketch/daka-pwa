# 02 - 暑假任务打卡系统 · 数据模型

> 版本：V2.0 | 日期：2026-06-30 | 状态：待实现
>
> **V2 更新：** 新增 rulesConfig、taskTemplate 新字段、dailyTask 新字段、dailySummary 新字段、reward.tier、protectionCardRecord。
> 旧 V1 草案的 lotterConfig.enabled 改为 false，chanceRecord/lotteryRecord 保留但 V1 不主动使用。

---

## 0. 数据分类

| 分类 | 内容 | 导出范围 |
|------|------|----------|
| **系统数据** | appConfig、PIN 哈希 | 仅完整备份 |
| **个人数据** | child、dailyTask、dailySummary、pointRecord、redeemRecord、streak、streakAwardRecord、protectionCardRecord、manualOverrideRecord、(lotteryRecord)、(chanceRecord) | 仅完整备份 |
| **配置数据** | rulesConfig、taskTemplate、reward、lotteryConfig | 完整备份 + 配置模板导出 |

配置模板导出 → 可导入另一台 iPad 复用规则。个人数据不跨设备导入。

---

## 1. appConfig — 设备与系统配置

```js
appConfig: {
  schemaVersion: 2,                     // V2 升级
  deviceId: "ipad-xiaoming-001",        // 设备标识
  boundChildId: "child-xiaoming",       // 绑定孩子 ID
  timezone: "Asia/Shanghai",            // 时区
  dayCutoffHour: 4,                     // 日界线偏移（凌晨 0:00~3:59 算前一天）
  parentPinHash: "sha256...",           // SHA-256( PIN )
  createdAt: "2026-06-30T10:00:00+08:00",
  lastBackupAt: null                    // 上次备份时间
}
```

---

## 2. rulesConfig — 积分规则配置（新增）

**配置数据。** 控制积分上限、基础全完成奖励、熏听规则、有效学习日组合、连续奖励、兑换限制、抽奖开关。支持完整备份 + 配置模板导出。

```js
rulesConfig: {
  id: "singleton",

  // ─── 积分封顶 ───
  caps: {
    dailyStudyCap: 45,                  // 每日学习积分封顶
    dailySportCap: 22,                  // 每日运动积分封顶
    dailyTotalCap: 60,                  // 每日总积分封顶
    listeningCap: 5                     // 熏听积分封顶
  },

  // ─── 基础学习任务列表 ───
  basicStudyTasks: [
    "chineseMorningRead",
    "englishMorningRead",
    "chineseMain",
    "mathMain",
    "englishIntensive"
  ],

  // ─── 基础全完成奖励 ───
  basicStudyBonus: {
    bonusPoints: 3                      // 5 项基础全完成额外奖励
  },

  // ─── 熏听积分规则 ───
  listeningRules: [
    { minMinutes: 1,   maxMinutes: 60,  points: 1 },
    { minMinutes: 61,  maxMinutes: 90,  points: 2 },
    { minMinutes: 91,  maxMinutes: 120, points: 3 },
    { minMinutes: 121, maxMinutes: 150, points: 4 },
    { minMinutes: 151, maxMinutes: 180, points: 5 }
  ],

  // ─── 有效学习日规则 ───
  effectiveDayRules: {
    mode: "taskCombination",            // 废弃旧的 completionRate 模式
    validCombinations: [
      ["chineseMain", "mathMain"],
      ["chineseMain", "englishIntensive", "anyMorningRead"],
      ["mathMain", "englishIntensive", "anyMorningRead"]
    ]
    // anyMorningRead 表示 chineseMorningRead 或 englishMorningRead 任一完成
  },

  // ─── 连续打卡里程碑 ───
  streakMilestones: [
    { days: 3,  points: 5,  protectionCards: 0 },
    { days: 7,  points: 15, protectionCards: 1 },
    { days: 14, points: 30, protectionCards: 0 },
    { days: 30, points: 80, protectionCards: 0 }
  ],

  // ─── 兑换规则 ───
  redemption: {
    allowNegativeBalance: false,        // 不允许负分
    requireParentFulfillment: true,     // 需要家长兑现
    limits: {
      small: { period: "day",   count: 1 },
      medium:{ period: "week",  count: 2 },
      high:  { period: "month", count: 2 },
      super: { period: "none",  count: 0 }  // 0 = 不限
    }
  },

  // ─── 抽奖开关 ───
  lottery: {
    enabled: false,                     // V1 默认关闭
    allowPointCost: false,              // 不允许花积分抽奖
    maxDaily: 0,
    maxWeekly: 0
  },

  updatedAt: "2026-06-30T10:00:00+08:00"
}
```

---

## 3. child — 孩子信息

```js
child: {
  id: "child-xiaoming",
  name: "小明",
  avatar: "🦊",
  level: 8,                             // 可缓存，由累计积分计算
  currentBalance: 256,                  // 缓存快照，实际从 pointRecord 汇总
  lifetimeEarnedPoints: 1200,           // 累计总积分，只增不减（兑换不影响）
  active: true,
  createdAt: "2026-06-30T10:00:00+08:00"
}
```

**重要规则：**
- `currentBalance` 为缓存快照，结算/兑换时从 pointRecord 汇总重算
- `lifetimeEarnedPoints` 只记录正向已确认获得积分总和，兑换扣分不影响
- 不存储裸 `totalPoints` 字段

---

## 4. taskTemplate — 任务模板（V2 新增字段）

```js
taskTemplate: {
  id: "chineseMain",
  name: "语文主线",
  icon: "✏️",
  category: "study",                    // study | bigSport | smallSport
  subCategory: "main",                  // 新增：morning | main | intensive | rotation | optional | listening | relaxed
  taskType: "checkbox",                 // 新增："checkbox" | "duration"
  defaultPoints: 10,
  suggestedMinutes: 40,                 // 新增：建议时长
  description: "暑假静坐学习核心任务，重点鼓励",  // 新增：任务说明
  maxCountPerDay: 1,                    // 新增：每天最多完成次数（默认 1）
  active: true,                         // 启用/停用
  required: true,                       // 是否必做任务
  weekdays: [1,2,3,4,5,6,7],           // 1=周一~7=周日
  sortOrder: 3,
  updatedAt: "2026-06-30T10:00:00+08:00"
}
```

**配置数据。** 可导出模板给另一台 iPad 复用。

**subCategory 枚举：**

| subCategory | 含义 | 示例 |
|-------------|------|------|
| morning | 晨读启动项 | 语文晨读、英语晨读 |
| main | 核心主线任务 | 语文主线、数学主线 |
| intensive | 精读任务 | 英语精读 |
| rotation | 轮换任务 | 英语泛读、英语复述 |
| optional | 自愿加分 | 数学浅奥 |
| listening | 熏听 | 英语熏听 |
| relaxed | 放松输入 | 英语动画、亲子阅读 |

**taskType 枚举：**

| taskType | 含义 | 计分方式 |
|----------|------|----------|
| checkbox | 完成/未完成 | 完成得 defaultPoints |
| duration | 按分钟数 | 根据 rulesConfig.listeningRules 计算 |

---

## 5. dailyTask — 每日任务实例（V2 新增字段）

```js
dailyTask: {
  id: "20260630-chineseMain-child-xiaoming",
  childId: "child-xiaoming",
  date: "2026-06-30",

  // 来自模板快照（生成时复制，模板后续修改不影响历史）
  taskTemplateId: "chineseMain",
  taskName: "语文主线",                  // 快照
  taskIcon: "✏️",                        // 快照
  category: "study",                    // 快照
  subCategory: "main",                  // 新增快照
  taskType: "checkbox",                 // 新增快照
  plannedPoints: 10,                    // 快照
  suggestedMinutes: 40,                 // 新增快照
  required: true,                       // 新增快照
  maxCountPerDay: 1,                    // 新增快照

  // duration 类型专用字段
  durationMinutes: null,                // 新增：孩子记录的分钟数（仅 taskType=duration）

  // 积分追踪
  rawPoints: null,                      // 新增：原始计算积分（封顶前）
  cappedPoints: null,                   // 新增：封顶后积分

  // 孩子操作
  childChecked: false,
  childCheckTime: null,                 // ISO 时间戳

  // 家长操作
  parentStatus: "unreviewed",           // unreviewed | approved | rejected
                                        // 注：V1 不展示 partial
  parentPoints: null,                   // 家长确认给的分，结算后填充
  parentNote: "",

  // 结算控制
  settled: false,                       // 是否已结算
  pointRecordId: null                   // 关联的积分流水 ID
}
```

**防重复结算：**
- 主锚点：`dailySummary.id = ${date}-${childId}` 是否存在。
- 辅锚点：`dailyTask.settled = true`。
- 已结算日期的所有 dailyTask 不可再次参与结算。
- `dailyTask.pointRecordId` 仅用于关联有积分入账的任务（rejected 任务不产生 pointRecord，此字段可为 null）。

---

## 6. dailySummary — 每日结算汇总（V2 重写）

```js
dailySummary: {
  id: "20260630-child-xiaoming",
  childId: "child-xiaoming",
  date: "2026-06-30",

  // ─── 原始积分（封顶前）───
  rawStudyPoints: 27,                   // 新增：原始学习积分
  rawSportPoints: 19,                   // 新增：原始运动积分
  rawTotalPoints: 46,                   // 新增：原始总积分

  // ─── 封顶后积分 ───
  cappedStudyPoints: 27,                // 新增：封顶后学习积分
  cappedSportPoints: 19,                // 新增：封顶后运动积分
  cappedTotalPoints: 46,                // 新增：封顶后总积分

  // ─── 各类得分明细 ───
  taskEarnedPoints: 27,                 // 任务实际得分（封顶后）
  basicStudyBonusPoints: 3,             // 新增：基础全完成奖励（替代旧 dailyBonusPoints）
  streakBonusPoints: 0,                 // 连续奖励积分（替代旧 bonusPoints）
  totalEarnedPoints: 30,                // 当天总入账得分

  // ─── 任务计数 ───
  completedTaskCount: 6,
  totalTaskCount: 7,

  // ─── 废弃字段（V2 不再使用）───
  // completionRate — 已废弃，改用 taskCombination
  // dailyBonusPoints — 已废弃，改用 basicStudyBonusPoints
  // bonusPoints — 已废弃，改用 streakBonusPoints

  // ─── 有效学习日判定 ───
  basicStudyCompleted: true,            // 新增：5 项基础学习是否全部完成
  isEffectiveDay: true,                 // 由 effectiveDayRules 组合判定
  effectiveDayReason: "conditionA",     // 新增：命中条件（conditionA / conditionB）
  overrideEffective: false,             // 补签标记
  overrideReason: "",

  // ─── 连续 & 保护卡 ───
  streakMilestonesTriggered: [],        // 本日触发的里程碑 [3, 7, 14, 30]
  protectionCardsEarned: 0,             // 新增：本日获得的保护卡数量

  settledAt: "2026-06-30T20:10:00+08:00",
  pointRecordIds: [],                   // 本日所有 pointRecord ID
  chanceRecordIds: []                   // 本日所有 chanceRecord ID（V1 暂不使用）
}
```

---

## 7. pointRecord — 积分流水（只追加，不可修改/删除）

```js
pointRecord: {
  id: "txn-20260630-001",
  childId: "child-xiaoming",
  time: "2026-06-30T20:10:00+08:00",

  type: "taskEarn",                     // taskEarn | basicStudyBonus | streakBonus
                                        // | redeem | lotteryPrize | adjust | refund
                                        // 注：dailyBonus 已废弃，改用 basicStudyBonus
  source: "每日任务-语文主线",           // 人类可读的描述
  points: +10,                          // 正数=收入，负数=支出
  balance: 10,                          // 操作后余额（快照，用于快速展示）

  relatedDailyTaskId: "20260630-chineseMain-child-xiaoming",
  relatedRedeemId: null,
  relatedLotteryId: null,
  operator: "parent"                    // child | parent | system
}
```

**pointRecord.type 枚举（V2 更新）：**

| type | 含义 | 方向 |
|------|------|:----:|
| taskEarn | 任务得分（checkbox 或 duration） | + |
| basicStudyBonus | 基础全完成奖励（替代旧 dailyBonus） | + |
| streakBonus | 连续打卡奖励 | + |
| redeem | 兑换扣分 | - |
| lotteryPrize | 抽奖中奖加分（V1 不使用） | + |
| adjust | 家长手动调整 | ± |
| refund | 取消兑换返还 | + |

---

## 8. reward — 奖励商品（V2 新增 tier 字段）

```js
reward: {
  id: "reward-s-1",
  name: "选一个贴纸 / 小卡片",
  icon: "🎟️",
  cost: 30,                             // 所需积分
  tier: "small",                        // 新增：small | medium | high | super
  active: true,
  sortOrder: 1,
  updatedAt: "2026-06-30T10:00:00+08:00"
}
```

**配置数据。** 导出/导入时不带兑换记录。

**tier 枚举：**
| tier | 价格区间 | 默认兑换频率 |
|------|:--------:|-------------|
| small | 30–60 | 每天 1 次 |
| medium | 100–180 | 每周 2 次 |
| high | 300–450 | 每月 2 次 |
| super | 800–1200 | 不限 |

---

## 9. redeemRecord — 兑换记录（快照）

```js
redeemRecord: {
  id: "redeem-001",
  childId: "child-xiaoming",
  time: "2026-07-01T20:00:00+08:00",

  // 奖励快照
  rewardId: "reward-s-1",
  rewardName: "选一个贴纸 / 小卡片",     // 快照
  rewardIcon: "🎟️",                      // 快照
  cost: 30,                             // 快照
  tier: "small",                        // 新增快照

  status: "pending",                    // pending | fulfilled | cancelled
  pointRecordId: "txn-redeem-001",
  fulfilledTime: null,
  cancelledTime: null,
  parentNote: ""
}
```

**取消兑换：** status → cancelled，生成 pointRecord: refund。

---

## 10. streak — 连续打卡状态

```js
streak: {
  childId: "child-xiaoming",
  current: 12,                          // 当前连续有效天数
  longest: 15,                          // 历史最长连续
  lastEffectiveDate: "2026-06-30",      // 最后一个有效打卡日
  streakPeriodStart: "2026-06-19",      // 新增：当前连续周期起始日
  grantedMilestones: [3, 7],            // 当前连续周期内已发放的里程碑
  lastUpdatedAt: "2026-06-30T20:10:00+08:00"
}
```

**不存储 lotteryChances。** 从 chanceRecord 汇总计算（V1 不使用）。

---

## 11. streakAwardRecord — 里程碑奖励发放记录

```js
streakAwardRecord: {
  id: "child-xiaoming-2026-06-19-7",    // childId-streakPeriodStart-milestone
  childId: "child-xiaoming",
  date: "2026-07-03",
  milestone: 7,
  streakPeriodStart: "2026-06-27",      // 当前连续周期的起始日
  pointsAwarded: 15,                    // 新增：积分奖励
  protectionCardsAwarded: 1,            // 新增：保护卡奖励
  pointRecordId: "txn-streak-001",      // streakBonus 流水
  chanceRecordIds: []                   // V1 不使用抽奖机会
}
```

**防重复发放：** 唯一键 `childId + streakPeriodStart + milestone`。

---

## 12. protectionCardRecord — 保护卡流水（新增）

```js
protectionCardRecord: {
  id: "pcard-001",
  childId: "child-xiaoming",
  time: "2026-07-07T20:10:00+08:00",

  type: "earn",                         // earn | use | adjust
  source: "连续7天奖励",                 // 人类可读来源
  cards: +1,                            // 正数=获得，负数=使用
  balance: 1,                           // 操作后余额

  relatedDate: "2026-07-07",            // 相关日期
  relatedStreakAwardId: "child-xiaoming-2026-06-27-7",
  operator: "system"                    // system | parent
}
```

**保护卡余额 = Σ protectionCardRecord.cards。**

**规则：**
- 每连续 7 天获得 1 张（通过 streakMilestone[7].protectionCards）
- 每月最多使用 2 次
- 只保护连续天数，不直接兑换积分
- 不是抽奖机会

---

## 13. lotteryConfig — 抽奖配置（保留但关闭）

```js
lotteryConfig: {
  id: "singleton",
  enabled: false,                       // V1 默认关闭
  allowPointCost: false,                // 不允许花积分抽奖
  maxDaily: 0,
  maxWeekly: 0,
  streakRequired: 0,                    // 不设置连续天数解锁
  prizes: [
    // 保留结构，V1 不使用
    // { name: "小奖励", icon: "🎁", type: "reward", weight: 30, value: 0 },
    // { name: "加倍积分", icon: "⭐", type: "points", weight: 25, value: 20 },
    // { name: "再来一次", icon: "🎫", type: "chance", weight: 20, value: 1 },
    // { name: "谢谢参与", icon: "🙂", type: "none", weight: 25, value: 0 }
  ],
  updatedAt: "2026-06-30T10:00:00+08:00"
}
```

**配置数据。V1 保留结构但不启用。**

---

## 14. lotteryRecord — 抽奖结果记录（保留，V1 不使用）

```js
lotteryRecord: {
  id: "lottery-001",
  childId: "child-xiaoming",
  time: "2026-07-01T20:10:00+08:00",

  costType: "chance",                   // chance | points
  costPoints: 0,
  chanceUsed: 1,

  prizeName: "加倍积分",
  prizeIcon: "⭐",
  prizeType: "points",                  // none | points | reward | chance
  prizeValue: 20,

  pointRecordId: null,
  chanceRecordId: null,
  relatedRedeemId: null,
  parentConfirmed: false
}
```

---

## 15. chanceRecord — 抽奖机会流水（保留，V1 不使用）

```js
chanceRecord: {
  id: "chance-001",
  childId: "child-xiaoming",
  time: "2026-06-30T20:00:00+08:00",

  type: "earn",                         // earn | use | adjust
  source: "连续打卡3天",                 // V1 不使用此来源
  chances: 0,                           // V1 不产生抽奖机会
  balance: 0,
  relatedMilestone: null,
  relatedLotteryId: null
}
```

---

## 16. manualOverrideRecord — 家长覆盖记录

```js
manualOverrideRecord: {
  id: "override-001",
  childId: "child-xiaoming",
  date: "2026-07-02",
  type: "markEffectiveDay",             // markEffectiveDay | adjustPoints | cancelRedeem | useProtectionCard
  reason: "生病补签",
  relatedDailySummaryId: "20260702-child-xiaoming",
  operator: "parent",
  time: "2026-07-03T20:00:00+08:00"
}
```

---

## 17. 备份 JSON 格式（V2 更新）

### 完整备份

```json
{
  "exportType": "full",
  "exportVersion": 2,
  "exportedAt": "2026-07-01T20:00:00+08:00",
  "deviceId": "ipad-xiaoming-001",
  "boundChildId": "child-xiaoming",
  "data": {
    "appConfig": { },
    "rulesConfig": { },
    "child": { },
    "taskTemplates": [ ],
    "dailyTasks": [ ],
    "dailySummaries": [ ],
    "pointRecords": [ ],
    "rewards": [ ],
    "redeemRecords": [ ],
    "lotteryConfig": { },
    "lotteryRecords": [ ],
    "chanceRecords": [ ],
    "streak": { },
    "streakAwardRecords": [ ],
    "protectionCardRecords": [ ],
    "manualOverrideRecords": [ ]
  }
}
```

### 配置模板（V2 新增 rulesConfig）

```json
{
  "exportType": "template",
  "exportVersion": 2,
  "exportedAt": "2026-07-01T20:00:00+08:00",
  "sourceDeviceId": "ipad-xiaoming-001",
  "data": {
    "rulesConfig": { },
    "taskTemplates": [ ],
    "rewards": [ ],
    "lotteryConfig": { }
  }
}
```

**导入完整备份 → 提示会覆盖当前所有数据（含家长 PIN）→ 需 PIN 确认。**
导入后家长 PIN 将恢复为备份中的 PIN，如需保留当前 PIN 请导入后重新设置。

**导入配置模板 → 只覆盖 rulesConfig / taskTemplates / rewards / lotteryConfig → 不影响个人数据。**

---

## 18. 关键数据规则（V2 更新）

| 规则 | 实现方式 |
|------|----------|
| 积分余额不存裸数 | SUM(pointRecord.points) |
| 累计总积分只增不减 | SUM(pointRecord.points WHERE points > 0) |
| 抽奖机会不存裸数 | SUM(chanceRecord.chances)（V1 不使用） |
| 保护卡余额不存裸数 | SUM(protectionCardRecord.cards) |
| 任务快照防污染 | dailyTask 生成时复制模板字段 |
| 兑换快照防污染 | redeemRecord 生成时复制 reward 字段 |
| 结算幂等 | dailySummary.id 存在 + dailyTask.settled 双重校验 |
| 里程碑不重复 | streakAwardRecord.streakPeriodStart + milestone 唯一 |
| 兑换不超余额 | 余额校验在扣减前 |
| 兑换不超频率 | 按 tier + period 统计 redeemRecord |
| 取消可追溯 | status → cancelled + pointRecord: refund |
| 历史日期不可改 | 结算后走 manualOverrideRecord |
| 备份可验证 | 导入时校验 schemaVersion 和 childId |

---

## 19. IndexedDB 表设计（V2 更新）

| Object Store | 主键 | 索引 |
|--------------|------|------|
| appConfig | id (固定 "singleton") | — |
| rulesConfig | id (固定 "singleton") | — |
| child | id | name |
| taskTemplates | id | category, subCategory, active |
| dailyTasks | id (date-templateId-childId) | childId, date, settled, taskType |
| dailySummaries | id (date-childId) | childId, date |
| pointRecords | id | childId, time, type |
| rewards | id | active, tier, sortOrder |
| redeemRecords | id | childId, time, status, tier |
| lotteryConfig | id (固定 "singleton") | — |
| lotteryRecords | id | childId, time |
| chanceRecords | id | childId, time, type |
| streak | id (固定 childId) | childId |
| streakAwardRecords | id | childId, date, milestone |
| protectionCardRecords | id | childId, time, type |
| manualOverrideRecords | id | childId, date |
