// src/db.js – IndexedDB 数据库层（Dexie.js v4 封装）
// 暑假任务打卡积分系统 V2 → V3
// V3: 兑换商城 V1.1 增强 — 新增 reward 分类/展示/风险字段、redeemRecord 快照字段
// 所有 Object Store 定义 + 查询方法

// ─── 暑假计划常量 ───
const SUMMER_PLAN = {
  startDate: '2026-07-06',
  endDate: '2026-08-31',
  totalDays: 57,
  englishTargetMinutes: 80 * 60
};

const DB = (() => {

  // ─── 数据库初始化 ───
  const db = new Dexie('CheckinPWA');

  db.version(2).stores({
    // 系统 & 配置（singleton，主键固定）
    appConfig:        'id',
    rulesConfig:      'id',
    lotteryConfig:    'id',

    // 孩子信息
    child:            'id, name',

    // 任务模板（配置数据）
    taskTemplates:    'id, category, subCategory, active, groupKey, sortOrder',

    // 每日任务实例
    dailyTasks:       'id, childId, date, settled, taskType',

    // 每日结算汇总
    dailySummaries:   'id, childId, date',

    // 积分流水（只追加）
    pointRecords:     'id, childId, time, type',

    // 奖励商品（配置数据）
    rewards:          'id, active, tier, sortOrder',

    // 兑换记录
    redeemRecords:    'id, childId, time, status, tier',

    // 抽奖（V1 保留但关闭）
    lotteryRecords:   'id, childId, time',

    // 抽奖机会（V1 不使用）
    chanceRecords:    'id, childId, time, type',

    // 连续打卡
    streak:           'id, childId',

    // 连续里程碑奖励记录
    streakAwardRecords: 'id, childId, date, milestone',

    // 保护卡记录
    protectionCardRecords: 'id, childId, time, type',

    // 家长手动覆盖
    manualOverrideRecords: 'id, childId, date'
  });

  // V3: 新增 reward 索引字段、redeemRecord 快照字段
  // Dexie 的 schema 升级通过声明新的 version().stores() 实现，
  // 但对于纯新增字段（非索引），Dexie 自动兼容，无需显式 schema 变更。
  // 字段补齐在迁移函数 migrateRewardsV3 / migrateRedeemRecordsV3 中完成。
  db.version(3).stores({
    appConfig:        'id',
    rulesConfig:      'id',
    lotteryConfig:    'id',
    child:            'id, name',
    taskTemplates:    'id, category, subCategory, active, groupKey, sortOrder',
    dailyTasks:       'id, childId, date, settled, taskType, [childId+date], taskTemplateId',
    dailySummaries:   'id, childId, date, [childId+date]',
    pointRecords:     'id, childId, time, date, type, [childId+date]',
    rewards:          'id, active, tier, sortOrder, category, displaySection, visibleToChild',
    redeemRecords:    'id, childId, time, status, tier, categorySnapshot, redeemedAt, [childId+status]',
    lotteryRecords:   'id, childId, time',
    chanceRecords:    'id, childId, time, type',
    streak:           'id, childId',
    streakAwardRecords: 'id, childId, date, milestone',
    protectionCardRecords: 'id, childId, time, type',
    manualOverrideRecords: 'id, childId, date'
  });

  // V4: 补充 compound indexes + date/time type indexes for performance
  db.version(4).stores({
    appConfig:        'id',
    rulesConfig:      'id',
    lotteryConfig:    'id',
    child:            'id, name',
    taskTemplates:    'id, category, subCategory, active, groupKey, sortOrder',
    dailyTasks:       'id, childId, date, settled, taskType, [childId+date], taskTemplateId',
    dailySummaries:   'id, childId, date, [childId+date]',
    pointRecords:     'id, childId, time, type, date, [childId+date]',
    rewards:          'id, active, tier, sortOrder, category, displaySection, visibleToChild',
    redeemRecords:    'id, childId, time, status, tier, categorySnapshot, redeemedAt, [childId+status]',
    lotteryRecords:   'id, childId, time',
    chanceRecords:    'id, childId, time, type',
    streak:           'id, childId',
    streakAwardRecords: 'id, childId, date, milestone',
    protectionCardRecords: 'id, childId, time, type',
    manualOverrideRecords: 'id, childId, date'
  });

  // V5: 新增视频名单表（白名单/黑名单备忘录）
  db.version(5).stores({
    appConfig:        'id',
    rulesConfig:      'id',
    lotteryConfig:    'id',
    child:            'id, name',
    taskTemplates:    'id, category, subCategory, active, groupKey, sortOrder',
    dailyTasks:       'id, childId, date, settled, taskType, [childId+date], taskTemplateId',
    dailySummaries:   'id, childId, date, [childId+date]',
    pointRecords:     'id, childId, time, type, date, [childId+date]',
    rewards:          'id, active, tier, sortOrder, category, displaySection, visibleToChild',
    redeemRecords:    'id, childId, time, status, tier, categorySnapshot, redeemedAt, [childId+status]',
    lotteryRecords:   'id, childId, time',
    chanceRecords:    'id, childId, time, type',
    streak:           'id, childId',
    streakAwardRecords: 'id, childId, date, milestone',
    protectionCardRecords: 'id, childId, time, type',
    manualOverrideRecords: 'id, childId, date',
    videoListItems:   'id, listType, active, sortOrder'
  });

  // V6: 新增家长成长评分表（孩子给家长打分）
  db.version(6).stores({
    appConfig:        'id',
    rulesConfig:      'id',
    lotteryConfig:    'id',
    child:            'id, name',
    taskTemplates:    'id, category, subCategory, active, groupKey, sortOrder',
    dailyTasks:       'id, childId, date, settled, taskType, [childId+date], taskTemplateId',
    dailySummaries:   'id, childId, date, [childId+date]',
    pointRecords:     'id, childId, time, type, date, [childId+date]',
    rewards:          'id, active, tier, sortOrder, category, displaySection, visibleToChild',
    redeemRecords:    'id, childId, time, status, tier, categorySnapshot, redeemedAt, [childId+status]',
    lotteryRecords:   'id, childId, time',
    chanceRecords:    'id, childId, time, type',
    streak:           'id, childId',
    streakAwardRecords: 'id, childId, date, milestone',
    protectionCardRecords: 'id, childId, time, type',
    manualOverrideRecords: 'id, childId, date',
    videoListItems:   'id, listType, active, sortOrder',
    parentScores:     'id, childId, date, [childId+date]'
  });

  // V7: 新增今日鼓励信表（家长写给孩子的每日鼓励信）
  db.version(7).stores({
    appConfig:        'id',
    rulesConfig:      'id',
    lotteryConfig:    'id',
    child:            'id, name',
    taskTemplates:    'id, category, subCategory, active, groupKey, sortOrder',
    dailyTasks:       'id, childId, date, settled, taskType, [childId+date], taskTemplateId',
    dailySummaries:   'id, childId, date, [childId+date]',
    pointRecords:     'id, childId, time, type, date, [childId+date]',
    rewards:          'id, active, tier, sortOrder, category, displaySection, visibleToChild',
    redeemRecords:    'id, childId, time, status, tier, categorySnapshot, redeemedAt, [childId+status]',
    lotteryRecords:   'id, childId, time',
    chanceRecords:    'id, childId, time, type',
    streak:           'id, childId',
    streakAwardRecords: 'id, childId, date, milestone',
    protectionCardRecords: 'id, childId, time, type',
    manualOverrideRecords: 'id, childId, date',
    videoListItems:   'id, listType, active, sortOrder',
    parentScores:     'id, childId, date, [childId+date]',
    parentLetters:    'id, childId, date, readStatus, [childId+date]'
  });

  // ─── 默认数据 ───

  /** 默认 rulesConfig
   *  @deprecated caps.dailyStudyCap / dailySportCap / dailyTotalCap — 每日积分封顶已取消。
   *    这些字段保留仅为向后兼容（设置页 UI 仍显示），不再影响实际积分计算。
   *    listeningCap 仍然生效：限制单次熏听任务最高 5 分。 */
  const DEFAULT_RULES_CONFIG = {
    id: 'singleton',
    caps: {
      dailyStudyCap: 45,    // @deprecated — 不再用于积分封顶
      dailySportCap: 22,    // @deprecated — 不再用于积分封顶
      dailyTotalCap: 60,    // @deprecated — 不再用于积分封顶
      listeningCap: 5       // 仍生效：熏听单任务积分上限
    },
    basicStudyTasks: [
      'chineseMorningRead',
      'englishMorningRead',
      'chineseMain',
      'mathMain',
      'englishIntensive'
    ],
    basicStudyBonus: {
      bonusPoints: 3
    },
    listeningRules: [
      { minMinutes: 1,   maxMinutes: 60,  points: 1 },
      { minMinutes: 61,  maxMinutes: 90,  points: 2 },
      { minMinutes: 91,  maxMinutes: 120, points: 3 },
      { minMinutes: 121, maxMinutes: 150, points: 4 },
      { minMinutes: 151, maxMinutes: 180, points: 5 }
    ],
    effectiveDayRules: {
      mode: 'taskCombination',
      validCombinations: [
        ['chineseMain', 'mathMain'],
        ['chineseMain', 'englishIntensive', 'anyMorningRead'],
        ['mathMain', 'englishIntensive', 'anyMorningRead']
      ]
    },
    streakMilestones: [
      { days: 3,  points: 5,  protectionCards: 0 },
      { days: 7,  points: 15, protectionCards: 1 },
      { days: 14, points: 30, protectionCards: 0 },
      { days: 30, points: 80, protectionCards: 0 }
    ],
    redemption: {
      allowNegativeBalance: false,
      requireParentFulfillment: true,
      limits: {
        small:  { period: 'day',   count: 1 },
        medium: { period: 'week',  count: 2 },
        high:   { period: 'month', count: 2 },
        super:  { period: 'none',  count: 0 }
      }
    },
    lottery: {
      enabled: false,
      allowPointCost: false,
      maxDaily: 0,
      maxWeekly: 0
    },
    updatedAt: null
  };

  /** 默认 taskTemplates（18 个：17 active + 1 inactive）
   *  section / sortOrder / active / requiresDuration / englishEnergyRate 对齐
   *  checkin_config_template_20260703.json */
  const DEFAULT_TASK_TEMPLATES = [
    // ═══ today_required ═══
    { id:'chineseMorningRead',  name:'语文晨读',   icon:'📖', category:'study', subCategory:'morning',   groupKey:'basic',    taskType:'checkbox', defaultPoints:1,  suggestedMinutes:15, description:'大声朗读语文课文，培养语感和专注力',                         maxCountPerDay:1, required:true,  active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:1,  updatedAt:null, section:'today_required',     requiresDuration:false, englishEnergyRate:null },
    { id:'englishMorningRead',  name:'英语晨读',   icon:'🔤', category:'study', subCategory:'morning',   groupKey:'basic',    taskType:'checkbox', defaultPoints:1,  suggestedMinutes:15, description:'朗读英语课文或单词，开口练习发音',                             maxCountPerDay:1, required:true,  active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:2,  updatedAt:null, section:'today_required',     requiresDuration:false, englishEnergyRate:null },
    { id:'parentReading',       name:'亲子阅读',   icon:'👨‍👩‍👧', category:'study', subCategory:'relaxed',   groupKey:'basic',    taskType:'checkbox', defaultPoints:2,  suggestedMinutes:25, description:'每日亲子课外阅读 20–30 分钟，放松陪伴',                          maxCountPerDay:1, required:true,  active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:4,  updatedAt:null, section:'today_required',     requiresDuration:false, englishEnergyRate:null },
    { id:'chineseMain',         name:'语文主线',   icon:'✏️', category:'study', subCategory:'main',      groupKey:'chinese',  taskType:'checkbox', defaultPoints:10, suggestedMinutes:40, description:'40 分钟：20min 学习 + 5min 休息 + 20min 习题。前期可做旧课复习、生字听写、练字；后期可做新课预习、生字抄写。具体前后期由家长按孩子进度调整。', maxCountPerDay:1, required:true,  active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:20, updatedAt:null, section:'today_required',     requiresDuration:false, englishEnergyRate:null },
    { id:'mathMain',            name:'数学主线',   icon:'➕', category:'study', subCategory:'main',      groupKey:'math',     taskType:'checkbox', defaultPoints:10, suggestedMinutes:40, description:'40 分钟：口算 10min + 20min 知识点 + 5min 休息 + 10min 习题。前期可做旧知识复盘、错题重做；后期可做新课例题理解、基础预习练习。具体前后期由家长按孩子进度调整。', maxCountPerDay:1, required:true,  active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:30, updatedAt:null, section:'today_required',     requiresDuration:false, englishEnergyRate:null },
    // ═══ english_energy ═══
    { id:'englishListening',    name:'英语熏听',   icon:'🎧', category:'study', subCategory:'listening', groupKey:'basic',    taskType:'duration', defaultPoints:0,  suggestedMinutes:60, description:'全天碎片化英语听力输入，无坐姿要求，根据累计时长计分',           maxCountPerDay:1, required:true,  active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:3,  updatedAt:null, section:'english_energy',     requiresDuration:true,  englishEnergyRate:1 },
    { id:'englishCartoon',      name:'英语动画',   icon:'📺', category:'study', subCategory:'relaxed',   groupKey:'english',  taskType:'checkbox', defaultPoints:1,  suggestedMinutes:40, description:'放松型英语输入，低分鼓励',                                      maxCountPerDay:1, required:false, active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:10, updatedAt:null, section:'english_energy',     requiresDuration:false, englishEnergyRate:1 },
    { id:'englishIntensive',    name:'英语精读',   icon:'📚', category:'study', subCategory:'intensive', groupKey:'english',  taskType:'checkbox', defaultPoints:5,  suggestedMinutes:30, description:'分级读物逐句细读、认单词、理解句子',                             maxCountPerDay:1, required:true,  active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:11, updatedAt:null, section:'english_energy',     requiresDuration:false, englishEnergyRate:1 },
    { id:'englishExtensive',    name:'英语泛读',   icon:'📘', category:'study', subCategory:'extensive', groupKey:'english',  taskType:'checkbox', defaultPoints:4,  suggestedMinutes:30, description:'英语泛读输入型任务，不做系统轮换排期',                           maxCountPerDay:1, required:false, active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:12, updatedAt:null, section:'english_energy',     requiresDuration:false, englishEnergyRate:1 },
    // ═══ sports_challenge ═══
    { id:'bigSport',            name:'大运动',     icon:'🏃', category:'bigSport',    subCategory:'sport', groupKey:'sport',    taskType:'checkbox', defaultPoints:10, suggestedMinutes:50, description:'轮滑、游泳、篮球、足球、户外运动 40–60 分钟',                     maxCountPerDay:1, required:false, active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:50, updatedAt:null, section:'sports_challenge',   requiresDuration:false, englishEnergyRate:null },
    { id:'smallSport1',         name:'引体向上',   icon:'🤸', category:'smallSport',  subCategory:'sport', groupKey:'sport',    taskType:'checkbox', defaultPoints:3,  suggestedMinutes:10, description:'拉伸、跳绳、核心、平衡等小运动',                                 maxCountPerDay:1, required:false, active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:51, updatedAt:null, section:'sports_challenge',   requiresDuration:false, englishEnergyRate:null },
    { id:'smallSport2',         name:'倒立',       icon:'💪', category:'smallSport',  subCategory:'sport', groupKey:'sport',    taskType:'checkbox', defaultPoints:3,  suggestedMinutes:10, description:'拉伸、跳绳、核心、平衡等小运动',                                 maxCountPerDay:1, required:false, active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:52, updatedAt:null, section:'sports_challenge',   requiresDuration:false, englishEnergyRate:null },
    { id:'smallSport3',         name:'小燕飞',     icon:'🧘', category:'smallSport',  subCategory:'sport', groupKey:'sport',    taskType:'checkbox', defaultPoints:3,  suggestedMinutes:10, description:'拉伸、跳绳、核心、平衡等小运动',                                 maxCountPerDay:1, required:false, active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:53, updatedAt:null, section:'sports_challenge',   requiresDuration:false, englishEnergyRate:null },
    { id:'smallSport4',         name:'小运动4',    icon:'🌱', category:'smallSport',  subCategory:'sport', groupKey:'sport',    taskType:'checkbox', defaultPoints:3,  suggestedMinutes:10, description:'备用小运动，默认关闭',                                             maxCountPerDay:1, required:false, active:0, weekdays:[1,2,3,4,5,6,7], sortOrder:54, updatedAt:null, section:'sports_challenge',   requiresDuration:false, englishEnergyRate:null },
    // ═══ extra_bonus ═══
    { id:'mathThinking',        name:'数学浅奥',   icon:'🧠', category:'study', subCategory:'optional',  groupKey:'optional', taskType:'checkbox', defaultPoints:5,  suggestedMinutes:20, description:'有余力时的思维挑战，抗拒可直接跳过',                               maxCountPerDay:1, required:false, active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:10, updatedAt:null, section:'extra_bonus',        requiresDuration:false, englishEnergyRate:null },
    { id:'mathTeacher',         name:'做数学小老师',icon:'👩‍🏫', category:'study', subCategory:'optional',  groupKey:'optional', taskType:'checkbox', defaultPoints:3,  suggestedMinutes:15, description:'把一道题或一个知识点讲给家长听，表达清楚即可',                     maxCountPerDay:1, required:false, active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:20, updatedAt:null, section:'extra_bonus',        requiresDuration:false, englishEnergyRate:null },
    { id:'handwritingPractice', name:'练字帖',     icon:'✍️', category:'study', subCategory:'optional',  groupKey:'optional', taskType:'checkbox', defaultPoints:2,  suggestedMinutes:15, description:'自愿练字帖，作为额外加分，不替代语文主线',                           maxCountPerDay:1, required:false, active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:30, updatedAt:null, section:'extra_bonus',        requiresDuration:false, englishEnergyRate:null },
    { id:'englishRetell',       name:'英语复述',   icon:'🗣️', category:'study', subCategory:'optional',  groupKey:'optional', taskType:'checkbox', defaultPoints:5,  suggestedMinutes:15, description:'英语输出型自愿加分任务，抗拒可跳过',                                 maxCountPerDay:1, required:false, active:1, weekdays:[1,2,3,4,5,6,7], sortOrder:40, updatedAt:null, section:'extra_bonus',        requiresDuration:false, englishEnergyRate:null }
  ];

  // ─── reward 新字段默认值工厂 ───
  function defaultRewardV3Fields(tier, displaySection) {
    const ds = displaySection || 'hidden';
    return {
      category: 'physical',
      visibleToChild: ds !== 'hidden' ? 1 : 0,
      displaySection: ds,
      riskLevel: 'low',
      requiresParentApproval: true,
      fulfillmentType: 'voucher',
      dailyLimit: null,
      weeklyLimit: null,
      monthlyLimit: null,
      parentNote: '',
      childDescription: ''
    };
  }

  /** 默认 rewards（大童修正版 — 第 1 周启动强刺激期）
   *  基于 reward_storefront_2026-07-06_to_2026-07-12.json
   *  包含 56 个奖励（9 个新增大童奖励 + 5 个低吸引下架隐藏） */
  const DEFAULT_REWARDS = [
    // ═══════════════════════════════════════════
    // today — 5 个对孩子可见（第 1 周）
    // ═══════════════════════════════════════════
    { id:'story_choice',              name:'睡前故事选择权',       icon:'📖',   cost:25,  tier:'small',  active:1, sortOrder:1,  updatedAt:null, category:'choice',     visibleToChild:1, displaySection:'today',    riskLevel:'low',    requiresParentApproval:false, fulfillmentType:'instant',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'今晚听哪个故事？你来选！' },
    { id:'parent_game_10',            name:'亲子小游戏 10 分钟',   icon:'🎲',   cost:25,  tier:'small',  active:1, sortOrder:2,  updatedAt:null, category:'parentTime', visibleToChild:1, displaySection:'today',    riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'和爸爸妈妈玩 10 分钟小游戏' },
    { id:'task_order_choice',         name:'任务顺序选择卡',       icon:'🗂️',   cost:30,  tier:'small',  active:1, sortOrder:3,  updatedAt:null, category:'privilege',  visibleToChild:1, displaySection:'today',    riskLevel:'low',    requiresParentApproval:false, fulfillmentType:'instant',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'今天先做哪项任务？你说了算！' },
    { id:'custom-board-game-duel-15', name:'桌游 / 棋类对战 15 分钟', icon:'♟️', cost:40,  tier:'small',  active:1, sortOrder:4,  updatedAt:null, category:'parentTime', visibleToChild:1, displaySection:'today',    riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'替代低吸引的小贴纸奖励。适合五子棋、UNO、桌游、口算对战等。', childDescription:'和爸爸妈妈来一局 15 分钟桌游或棋类对战' },
    { id:'custom-building-theme-choice', name:'拼搭主题决定权',    icon:'🏗️',   cost:40,  tier:'small',  active:1, sortOrder:5,  updatedAt:null, category:'choice',     visibleToChild:1, displaySection:'today',    riskLevel:'low',    requiresParentApproval:false, fulfillmentType:'instant',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'不额外增加屏幕时间，只给孩子主题控制感。', childDescription:'今天搭什么主题，由你决定！' },

    // ═══════════════════════════════════════════
    // today — 已下架隐藏（低吸引 / 自然发生）
    // ═══════════════════════════════════════════
    { id:'sticker_card',        name:'选一个贴纸 / 小卡片',  icon:'🎟️', cost:30,  tier:'small',  active:0, sortOrder:1,  updatedAt:null, category:'physical',   visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:false, fulfillmentType:'instant',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'已按大童修正版下架：低吸引/自然发生/重复奖励。', childDescription:'选一个喜欢的贴纸或小卡片' },
    { id:'fruit_choice',        name:'晚餐水果选择权',       icon:'🍎', cost:20,  tier:'small',  active:0, sortOrder:2,  updatedAt:null, category:'choice',     visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:false, fulfillmentType:'instant',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'已按大童修正版下架：低吸引/自然发生/重复奖励。', childDescription:'今天晚餐吃哪种水果，由你决定！' },
    { id:'outfit_choice',       name:'明天穿搭选择权',       icon:'👗', cost:20,  tier:'small',  active:0, sortOrder:5,  updatedAt:null, category:'choice',     visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:false, fulfillmentType:'instant',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'已按大童修正版下架：低吸引/自然发生/重复奖励。', childDescription:'明天穿什么？你自己搭配！' },
    { id:'music_choice',        name:'音乐播放选择权',       icon:'🎵', cost:20,  tier:'small',  active:0, sortOrder:6,  updatedAt:null, category:'choice',     visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:false, fulfillmentType:'instant',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'已按大童修正版下架：低吸引/自然发生/重复奖励。', childDescription:'想听什么音乐？你说了算！' },
    { id:'extra_story',         name:'妈妈哄睡',             icon:'📚', cost:100, tier:'medium', active:1, sortOrder:7,  updatedAt:null, category:'parentTime', visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'让妈妈多讲一个故事给你听' },

    // ═══════════════════════════════════════════
    // weekly — 5 个对孩子可见（第 1 周）
    // ═══════════════════════════════════════════
    { id:'cartoon_15',          name:'动画 15 分钟',         icon:'📺', cost:40,  tier:'small',  active:1, sortOrder:10, updatedAt:null, category:'screen',     visibleToChild:1, displaySection:'weekly',   riskLevel:'medium',  requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:1,    weeklyLimit:null, monthlyLimit:null, parentNote:'睡前 1 小时不使用', childDescription:'看 15 分钟动画，仅限家长白名单内容' },
    { id:'parent_game_20',      name:'亲子小游戏 20 分钟',   icon:'🎲', cost:50,  tier:'small',  active:1, sortOrder:11, updatedAt:null, category:'parentTime', visibleToChild:1, displaySection:'weekly',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'和爸爸妈妈玩 20 分钟小游戏' },
    { id:'small_stationery',    name:'小文具',               icon:'✏️', cost:30,  tier:'small',  active:1, sortOrder:12, updatedAt:null, category:'physical',   visibleToChild:1, displaySection:'weekly',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'physical',    dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'选一个小文具，橡皮、铅笔、小本子都可以' },
    { id:'stationery_blind_bag',name:'文具盲袋',             icon:'🎁', cost:80,  tier:'medium', active:1, sortOrder:13, updatedAt:null, category:'physical',   visibleToChild:1, displaySection:'weekly',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'physical',    dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'拆一个文具盲袋，里面是什么惊喜呢？' },
    { id:'custom-snack-supply-10', name:'10 元运动补给 / 小零食', icon:'🥤', cost:60,  tier:'medium', active:1, sortOrder:14, updatedAt:null, category:'physical',   visibleToChild:1, displaySection:'weekly',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'physical',    dailyLimit:null, weeklyLimit:1,  monthlyLimit:null, parentNote:'家长确认范围；不建议睡前兑换，不用高糖作为长期主奖励。', childDescription:'选一个 10 元以内的运动补给或小零食' },

    // ═══════════════════════════════════════════
    // goal — 5 个对孩子可见（第 1 周）
    // ═══════════════════════════════════════════
    { id:'one_on_one_30',       name:'1V1 单独陪伴 30 分钟', icon:'💝', cost:120, tier:'medium', active:1, sortOrder:20, updatedAt:null, category:'parentTime', visibleToChild:1, displaySection:'goal',     riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'scheduled',   dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'爸爸妈妈单独陪你 30 分钟，只属于你的时间！' },
    { id:'park_1h',             name:'公园 1 小时',          icon:'🌳', cost:200, tier:'high',   active:1, sortOrder:21, updatedAt:null, category:'outing',     visibleToChild:1, displaySection:'goal',     riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'scheduled',   dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'去公园玩 1 小时！' },
    { id:'picture_book',        name:'选一本书',             icon:'📖', cost:30,  tier:'small',  active:1, sortOrder:22, updatedAt:null, category:'physical',   visibleToChild:1, displaySection:'goal',     riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'physical',    dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'去书店选一本喜欢的绘本' },
    { id:'restaurant_choice',   name:'去喜欢的餐厅',         icon:'🍽️', cost:400, tier:'high',   active:1, sortOrder:23, updatedAt:null, category:'outing',     visibleToChild:1, displaySection:'goal',     riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'scheduled',   dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'去你最喜欢的餐厅吃一顿！' },
    { id:'toy_50',              name:'50 元以内玩具',        icon:'🎮', cost:350, tier:'high',   active:1, sortOrder:24, updatedAt:null, category:'physical',   visibleToChild:1, displaySection:'goal',     riskLevel:'medium',  requiresParentApproval:true,  fulfillmentType:'physical',    dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'选一个 50 元以内的玩具' },

    // ═══════════════════════════════════════════
    // 屏幕类 screen — 全部隐藏
    // ═══════════════════════════════════════════
    { id:'cartoon_10',          name:'动画 10 分钟',         icon:'📺', cost:30,  tier:'small',  active:1, sortOrder:20, updatedAt:null, category:'screen',     visibleToChild:0, displaySection:'hidden',   riskLevel:'medium',  requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:1,    weeklyLimit:null, monthlyLimit:null, parentNote:'睡前 1 小时不使用', childDescription:'看 10 分钟动画，仅限家长白名单内容' },
    { id:'cartoon_30',          name:'动画 30 分钟',         icon:'📺', cost:70,  tier:'medium', active:1, sortOrder:22, updatedAt:null, category:'screen',     visibleToChild:0, displaySection:'hidden',   riskLevel:'high',    requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:1,    weeklyLimit:null, monthlyLimit:null, parentNote:'睡前 1 小时不使用', childDescription:'看 30 分钟动画，仅限家长白名单内容' },
    { id:'game_10',             name:'游戏 10 分钟',         icon:'🎮', cost:50,  tier:'medium', active:1, sortOrder:23, updatedAt:null, category:'screen',     visibleToChild:0, displaySection:'hidden',   riskLevel:'high',    requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:1,    weeklyLimit:null, monthlyLimit:null, parentNote:'睡前 1 小时不使用', childDescription:'玩 10 分钟游戏，仅限家长白名单内容' },
    { id:'game_20',             name:'游戏 20 分钟',         icon:'🎮', cost:90,  tier:'medium', active:1, sortOrder:24, updatedAt:null, category:'screen',     visibleToChild:0, displaySection:'hidden',   riskLevel:'high',    requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:1,    weeklyLimit:null, monthlyLimit:null, parentNote:'睡前 1 小时不使用', childDescription:'玩 20 分钟游戏，仅限家长白名单内容' },
    { id:'weekend_game_30',     name:'周末游戏 30 分钟',     icon:'🎮', cost:150, tier:'high',   active:1, sortOrder:25, updatedAt:null, category:'screen',     visibleToChild:0, displaySection:'hidden',   riskLevel:'high',    requiresParentApproval:true,  fulfillmentType:'scheduled',   dailyLimit:1,    weeklyLimit:null, monthlyLimit:null, parentNote:'睡前 1 小时不使用', childDescription:'周末玩 30 分钟游戏，仅限家长白名单内容' },
    { id:'family_movie_night',  name:'家庭电影夜',           icon:'🎬', cost:250, tier:'high',   active:1, sortOrder:26, updatedAt:null, category:'screen',     visibleToChild:0, displaySection:'hidden',   riskLevel:'medium',  requiresParentApproval:true,  fulfillmentType:'scheduled',   dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'睡前 1 小时不使用', childDescription:'全家人一起看一部电影，仅限家长白名单内容' },
    { id:'video_choice_card',   name:'视频内容选择卡',       icon:'▶️', cost:60,  tier:'medium', active:1, sortOrder:27, updatedAt:null, category:'screen',     visibleToChild:0, displaySection:'hidden',   riskLevel:'medium',  requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:1,    weeklyLimit:null, monthlyLimit:null, parentNote:'睡前 1 小时不使用', childDescription:'选择想看的视频内容，仅限家长白名单内容' },

    // ═══════════════════════════════════════════
    // 亲子陪伴 parentTime — 隐藏
    // ═══════════════════════════════════════════
    { id:'building_20',         name:'陪搭积木 20 分钟',     icon:'🧱', cost:60,  tier:'medium', active:1, sortOrder:31, updatedAt:null, category:'parentTime', visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'爸爸妈妈陪你搭 20 分钟积木' },
    { id:'walk_1v1',            name:'1V1 楼下散步',         icon:'🚶', cost:150, tier:'high',   active:1, sortOrder:33, updatedAt:null, category:'parentTime', visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'scheduled',   dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'和爸爸或妈妈单独下楼散步聊天' },

    // ═══════════════════════════════════════════
    // 外出 outing — 隐藏
    // ═══════════════════════════════════════════
    { id:'convenience_store',   name:'楼下便利店选 1 样',    icon:'🏪', cost:80,  tier:'medium', active:1, sortOrder:41, updatedAt:null, category:'outing',     visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'scheduled',   dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'去楼下便利店选一样喜欢的东西' },
    { id:'skating_practice',    name:'小区轮滑陪练 30 分钟', icon:'🛼', cost:100, tier:'medium', active:0, sortOrder:42, updatedAt:null, category:'outing',     visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'scheduled',   dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'已按大童修正版下架：低吸引/自然发生/重复奖励。', childDescription:'爸爸妈妈陪你练轮滑 30 分钟' },
    { id:'bookstore_date',      name:'1V1 书店约会',         icon:'📚', cost:350, tier:'high',   active:1, sortOrder:43, updatedAt:null, category:'outing',     visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'scheduled',   dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'和爸爸或妈妈一起去书店，享受阅读时光' },
    { id:'sports_center',       name:'运动馆体验',           icon:'🤸', cost:600, tier:'super',  active:1, sortOrder:45, updatedAt:null, category:'outing',     visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'scheduled',   dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'去运动馆体验各种运动项目' },
    { id:'half_day_date',       name:'1V1 半日约会',         icon:'💕', cost:800, tier:'super',  active:1, sortOrder:46, updatedAt:null, category:'outing',     visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'scheduled',   dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'和爸爸或妈妈单独出去约会半天！' },
    { id:'indoor_playground',   name:'室内乐园半天',         icon:'🎠', cost:800, tier:'super',  active:1, sortOrder:47, updatedAt:null, category:'outing',     visibleToChild:0, displaySection:'hidden',   riskLevel:'medium',  requiresParentApproval:true,  fulfillmentType:'scheduled',   dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'去室内游乐场玩半天！' },
    { id:'museum_zoo',          name:'科技馆 / 博物馆 / 动物园', icon:'🏛️', cost:1000, tier:'super', active:1, sortOrder:48, updatedAt:null, category:'outing',   visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'scheduled',   dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'选一个想去的地方：科技馆、博物馆或动物园' },
    { id:'day_trip_proposal',   name:'周边一日游提案权',     icon:'🗺️', cost:1500, tier:'super',  active:1, sortOrder:49, updatedAt:null, category:'outing',     visibleToChild:0, displaySection:'hidden',   riskLevel:'medium',  requiresParentApproval:true,  fulfillmentType:'application', dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'这是申请卡，家长最终决定是否同意。提议一次周边一日游！' },
    { id:'summer_wish_ticket',  name:'暑假大奖愿望券',       icon:'🏆', cost:2000, tier:'super',  active:1, sortOrder:50, updatedAt:null, category:'outing',     visibleToChild:0, displaySection:'hidden',   riskLevel:'medium',  requiresParentApproval:true,  fulfillmentType:'application', dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'这是申请卡，家长最终决定是否同意。许下一个暑假大愿望！' },

    // ═══════════════════════════════════════════
    // 特权 / 申请卡 privilege — 全部隐藏
    // ═══════════════════════════════════════════
    { id:'calm_talk_card',      name:'冷静沟通卡',           icon:'💬', cost:80,  tier:'medium', active:1, sortOrder:60, updatedAt:null, category:'privilege',  visibleToChild:0, displaySection:'hidden',   riskLevel:'medium',  requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'遇到矛盾时，使用此卡让爸爸妈妈耐心听你说' },
    { id:'new_video_request',   name:'新视频申请卡',         icon:'🎬', cost:100, tier:'medium', active:1, sortOrder:61, updatedAt:null, category:'privilege',  visibleToChild:0, displaySection:'hidden',   riskLevel:'medium',  requiresParentApproval:true,  fulfillmentType:'application', dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'这是申请卡，家长最终决定是否同意。申请看一个新视频' },
    { id:'small_task_skip',     name:'小任务免除卡',         icon:'⏭️', cost:100, tier:'medium', active:1, sortOrder:62, updatedAt:null, category:'privilege',  visibleToChild:0, displaySection:'hidden',   riskLevel:'medium',  requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'免除一项小任务（不含语数主线）' },
    { id:'new_channel_request', name:'新频道申请卡',         icon:'📡', cost:150, tier:'high',   active:1, sortOrder:63, updatedAt:null, category:'privilege',  visibleToChild:0, displaySection:'hidden',   riskLevel:'high',    requiresParentApproval:true,  fulfillmentType:'application', dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'这是申请卡，家长最终决定是否同意。申请看一个新频道' },
    { id:'low_energy_card',     name:'今日低能量卡',         icon:'🔋', cost:150, tier:'high',   active:1, sortOrder:64, updatedAt:null, category:'privilege',  visibleToChild:0, displaySection:'hidden',   riskLevel:'medium',  requiresParentApproval:true,  fulfillmentType:'application', dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'这是申请卡，家长最终决定是否同意。今天能量不足，申请减少任务量' },
    { id:'class_leave_request', name:'兴趣课请假申请卡',     icon:'📝', cost:200, tier:'high',   active:1, sortOrder:65, updatedAt:null, category:'privilege',  visibleToChild:0, displaySection:'hidden',   riskLevel:'high',    requiresParentApproval:true,  fulfillmentType:'application', dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'这是申请卡，家长最终决定是否同意。申请兴趣课请假一次' },

    // ═══════════════════════════════════════════
    // 实物 / 书籍 physical — 隐藏
    // ═══════════════════════════════════════════
    { id:'toy_10',              name:'10 元以内小玩具',      icon:'🧸', cost:80,  tier:'medium', active:1, sortOrder:71, updatedAt:null, category:'physical',   visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'physical',    dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'选一个 10 元以内的小玩具' },
    { id:'toy_20',              name:'20 元以内小玩具',      icon:'🧸', cost:150, tier:'high',   active:1, sortOrder:73, updatedAt:null, category:'physical',   visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'physical',    dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'选一个 20 元以内的玩具' },
    { id:'comic_book',          name:'选一本漫画',           icon:'📚', cost:150, tier:'high',   active:1, sortOrder:74, updatedAt:null, category:'physical',   visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'physical',    dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'选一本喜欢的漫画书' },
    { id:'science_book',        name:'选一本科普书',         icon:'🔬', cost:250, tier:'high',   active:1, sortOrder:75, updatedAt:null, category:'physical',   visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'physical',    dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'选一本科普书，探索世界的奥秘' },
    { id:'toy_100',             name:'100 元以内玩具',       icon:'🎁', cost:700, tier:'super',  active:1, sortOrder:77, updatedAt:null, category:'physical',   visibleToChild:0, displaySection:'hidden',   riskLevel:'medium',  requiresParentApproval:true,  fulfillmentType:'physical',    dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'选一个 100 元以内的玩具' },
    { id:'lego_small',          name:'乐高 / 积木小套装',    icon:'🧱', cost:1000, tier:'super', active:1, sortOrder:78, updatedAt:null, category:'physical',  visibleToChild:0, displaySection:'hidden',   riskLevel:'medium',  requiresParentApproval:true,  fulfillmentType:'physical',    dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'', childDescription:'一套乐高或积木小套装' },

    // ═══════════════════════════════════════════
    // ★ 大童修正版新增奖励（非第 1 周展示 = 隐藏）
    // ═══════════════════════════════════════════
    { id:'custom-extra-bedtime-chat',  name:'睡前悄悄话 10 分钟',   icon:'🌙', cost:40,  tier:'small',  active:1, sortOrder:83, updatedAt:null, category:'parentTime', visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'可替代音乐播放选择权，避免孩子总是兑换中文故事/音频。', childDescription:'睡前和爸爸妈妈单独聊 10 分钟' },
    { id:'custom-sports-project-choice', name:'今日运动项目选择权', icon:'🏀', cost:50,  tier:'small',  active:1, sortOrder:84, updatedAt:null, category:'choice',     visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:false, fulfillmentType:'instant',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'不兑换陪练本身，只兑换运动项目/路线的选择权。', childDescription:'今天运动做什么项目，由你来选' },
    { id:'custom-project-showcase-15', name:'作品展示 15 分钟',     icon:'🎤', cost:50,  tier:'small',  active:1, sortOrder:85, updatedAt:null, category:'parentTime', visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'voucher',     dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'适合展示拼搭、画画、机器人、数学讲解、英语朗读等。', childDescription:'你来当主角，展示一个作品或技能 15 分钟' },
    { id:'custom-weekend-breakfast-choice', name:'周末早餐选择权',  icon:'🥞', cost:80,  tier:'medium', active:1, sortOrder:87, updatedAt:null, category:'choice',     visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'scheduled',   dailyLimit:null, weeklyLimit:1,  monthlyLimit:null, parentNote:'比晚餐水果更有稀缺感，建议仅周末兑现。', childDescription:'周末早餐吃什么，你来提议一次' },
    { id:'custom-mystery-supply-box', name:'神秘补给包',           icon:'🎒', cost:120, tier:'medium', active:1, sortOrder:88, updatedAt:null, category:'physical',   visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'physical',    dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'可放低价文具、运动小配件、贴纸不是主奖，只作补充。', childDescription:'领取一个神秘补给包，内容由家长准备' },
    { id:'custom-gear-upgrade-20', name:'20 元运动 / 文具装备升级券', icon:'🧢', cost:150, tier:'high',   active:1, sortOrder:89, updatedAt:null, category:'physical',   visibleToChild:0, displaySection:'hidden',   riskLevel:'low',    requiresParentApproval:true,  fulfillmentType:'physical',    dailyLimit:null, weeklyLimit:null, monthlyLimit:null, parentNote:'可用于轮滑袜、护具贴纸、笔袋挂件、文具配件等。', childDescription:'选择一个 20 元以内的小装备升级' }
  ];

  /** 默认 appConfig */
  function defaultAppConfig(childId, childName) {
    return {
      id: 'singleton',
      schemaVersion: 2,
      deviceId: `ipad-${childId}`,
      boundChildId: childId,
      timezone: 'Asia/Shanghai',
      dayCutoffHour: 4,
      parentPinHash: null, // 首次启动时设置
      createdAt: Utils.nowISO(),
      lastBackupAt: null
    };
  }

  /** 默认 child */
  function defaultChild(childId, childName, avatarId = 'football') {
    return {
      id: childId,
      name: childName,
      avatar: '\u{1F98A}',    // 向后兼容旧 emoji 字段
      avatarId: avatarId,      // V5: 默认头像库 ID
      level: 1,
      currentBalance: 0,
      lifetimeEarnedPoints: 0,
      active: true,
      createdAt: Utils.nowISO()
    };
  }

  /** 深度比较 listeningRules 是否与默认配置一致（用于检测旧版规则） */
  function listeningRulesMatchDefault(rules) {
    const def = DEFAULT_RULES_CONFIG.listeningRules;
    if (!rules || rules.length !== def.length) return false;
    for (let i = 0; i < def.length; i++) {
      if (rules[i].minMinutes !== def[i].minMinutes
        || rules[i].maxMinutes !== def[i].maxMinutes
        || rules[i].points !== def[i].points) {
        return false;
      }
    }
    return true;
  }

  /** 默认 lotteryConfig（V1 关闭） */
  const DEFAULT_LOTTERY_CONFIG = {
    id: 'singleton',
    enabled: false,
    allowPointCost: false,
    maxDaily: 0,
    maxWeekly: 0,
    streakRequired: 0,
    prizes: [],
    updatedAt: null
  };

  /** 默认视频名单示例数据（仅首次初始化时写入） */
  const DEFAULT_VIDEO_LIST_ITEMS = [
    // 白名单示例
    {
      id: 'vlist-whitelist-001',
      listType: 'whitelist',
      title: 'Peppa Pig English',
      platform: 'YouTube',
      note: '英文动画，语速适中',
      active: 1,
      sortOrder: 10,
      createdAt: null,
      updatedAt: null
    },
    {
      id: 'vlist-whitelist-002',
      listType: 'whitelist',
      title: 'Numberblocks',
      platform: 'YouTube',
      note: '数学英语动画，寓教于乐',
      active: 1,
      sortOrder: 20,
      createdAt: null,
      updatedAt: null
    },
    {
      id: 'vlist-whitelist-003',
      listType: 'whitelist',
      title: 'BBC Earth Kids',
      platform: 'YouTube',
      note: '自然科普纪录片',
      active: 1,
      sortOrder: 30,
      createdAt: null,
      updatedAt: null
    },
    // 黑名单示例
    {
      id: 'vlist-blacklist-001',
      listType: 'blacklist',
      title: '短视频刷屏',
      platform: '抖音 / 快手 / Shorts',
      note: '容易无意识刷很久，仅作为家长提醒',
      active: 1,
      sortOrder: 10,
      createdAt: null,
      updatedAt: null
    },
    {
      id: 'vlist-blacklist-002',
      listType: 'blacklist',
      title: '游戏解说沉迷类',
      platform: '各平台',
      note: '内容空洞、容易沉迷，仅作为家长提醒',
      active: 1,
      sortOrder: 20,
      createdAt: null,
      updatedAt: null
    }
  ];

  // ─── 初始化（逐表自修复）───

  /** 确保 appConfig 存在 */
  async function ensureAppConfig(childId, childName) {
    const cfg = await db.appConfig.get('singleton');
    if (!cfg) {
      await db.appConfig.add(defaultAppConfig(childId, childName));
      console.log('[Init] appConfig 已创建');
    }
    return cfg;
  }

  /** 确保 bound child 存在 */
  async function ensureBoundChild(childId, childName, avatarId) {
    const child = await db.child.get(childId);
    if (!child) {
      await db.child.add(defaultChild(childId, childName, avatarId));
      console.log(`[Init] child "${childId}" 已创建`);
    } else {
      // V5: 补齐 avatarId 字段（兼容旧数据）
      if (!child.avatarId) {
        const fallbackId = (child.avatar && child.avatar !== '🦊') ? 'robot' : 'football';
        await db.child.update(childId, { avatarId: fallbackId });
        console.log(`[Init] child "${childId}" avatarId 已补齐 → ${fallbackId}`);
      }
    }
    return child;
  }

  /** 确保 rulesConfig 存在 */
  async function ensureRulesConfig() {
    const now = Utils.nowISO();
    const rules = await db.rulesConfig.get('singleton');
    if (!rules) {
      const rc = Utils.deepClone(DEFAULT_RULES_CONFIG);
      rc.updatedAt = now;
      await db.rulesConfig.add(rc);
      console.log('[Init] rulesConfig 已创建');
      return;
    }
    // 存在则修复缺失字段
    let changed = false;
    const updates = {};
    if (!rules.caps) { updates.caps = DEFAULT_RULES_CONFIG.caps; changed = true; }
    if (!rules.basicStudyTasks || !Array.isArray(rules.basicStudyTasks)) {
      updates.basicStudyTasks = DEFAULT_RULES_CONFIG.basicStudyTasks; changed = true;
    }
    if (!rules.basicStudyBonus) { updates.basicStudyBonus = DEFAULT_RULES_CONFIG.basicStudyBonus; changed = true; }
    if (!rules.listeningRules || !Array.isArray(rules.listeningRules)) {
      updates.listeningRules = DEFAULT_RULES_CONFIG.listeningRules; changed = true;
    } else if (!listeningRulesMatchDefault(rules.listeningRules)) {
      // 检测旧版熏听规则（6 区间或 1–30 分段等），升级到新版 5 区间
      updates.listeningRules = DEFAULT_RULES_CONFIG.listeningRules; changed = true;
      console.log('[Init] listeningRules 已更新为新版 5 区间规则');
    }
    if (!rules.effectiveDayRules) { updates.effectiveDayRules = DEFAULT_RULES_CONFIG.effectiveDayRules; changed = true; }
    if (!rules.streakMilestones) { updates.streakMilestones = DEFAULT_RULES_CONFIG.streakMilestones; changed = true; }
    if (!rules.redemption) { updates.redemption = DEFAULT_RULES_CONFIG.redemption; changed = true; }
    if (!rules.lottery) { updates.lottery = DEFAULT_RULES_CONFIG.lottery; changed = true; }
    if (changed) {
      updates.updatedAt = now;
      await db.rulesConfig.update('singleton', updates);
      console.log('[Init] rulesConfig 缺失字段已补齐');
    }
  }

  /** 确保 lotteryConfig 存在 */
  async function ensureLotteryConfig() {
    const lc = await db.lotteryConfig.get('singleton');
    if (!lc) {
      const newLc = Utils.deepClone(DEFAULT_LOTTERY_CONFIG);
      newLc.updatedAt = Utils.nowISO();
      await db.lotteryConfig.add(newLc);
      console.log('[Init] lotteryConfig 已创建');
    }
  }

  /** 确保视频名单示例数据（仅首次初始化） */
  async function ensureVideoListItems() {
    const cfg = await db.appConfig.get('singleton');
    if (cfg && cfg.videoListInitialized === true) {
      console.log('[Init] 视频名单已初始化，跳过');
      return;
    }

    const count = await db.videoListItems.count();
    if (count > 0) {
      // 已有数据（可能是导入的），标记已初始化
      await db.appConfig.update('singleton', { videoListInitialized: true });
      console.log('[Init] 视频名单已有数据，标记已初始化');
      return;
    }

    const now = Utils.nowISO();
    for (const item of DEFAULT_VIDEO_LIST_ITEMS) {
      const clone = Utils.deepClone(item);
      clone.createdAt = now;
      clone.updatedAt = now;
      await db.videoListItems.add(clone);
    }
    await db.appConfig.update('singleton', { videoListInitialized: true });
    console.log('[Init] 视频名单示例数据已创建，videoListInitialized → true');
  }

  /** 确保 taskTemplates 完整（补齐缺失、禁用废弃、修复字段） */
  async function ensureTaskTemplatesComplete() {
    const now = Utils.nowISO();
    const existing = await db.taskTemplates.toArray();
    const existingMap = {};
    for (const t of existing) { existingMap[t.id] = t; }

    // ── 1. 修复现有模板字段 ──
    for (const t of existing) {
      const fixes = {};
      let needsFix = false;

      // active 布尔→数字
      if (t.active === true || t.active === 'true') { fixes.active = 1; needsFix = true; }
      else if (t.active === false || t.active === 'false') { fixes.active = 0; needsFix = true; }
      else if (t.active === undefined || t.active === null) { fixes.active = 1; needsFix = true; }

      // weekdays 缺失
      if (!t.weekdays || !Array.isArray(t.weekdays) || t.weekdays.length === 0) {
        fixes.weekdays = [1,2,3,4,5,6,7]; needsFix = true;
      }

      if (needsFix) {
        fixes.updatedAt = now;
        await db.taskTemplates.update(t.id, fixes);
      }
    }

    // ── 2. 禁用旧拆分任务 ──
    const DEPRECATED_IDS = ['chineseStudy','chineseExercise','oralMath','mathKnowledge','mathExercise'];
    for (const depId of DEPRECATED_IDS) {
      const tmpl = existingMap[depId];
      if (tmpl && tmpl.active !== 0) {
        await db.taskTemplates.update(depId, { active: 0, updatedAt: now });
        console.log(`[Init] 禁用旧拆分任务: ${depId}`);
      }
    }

    // ── 2.1 清理未结算的旧拆分 dailyTask ──
    const deprecatedDailyTasks = await db.dailyTasks
      .filter(t => DEPRECATED_IDS.includes(t.taskTemplateId) && !t.settled)
      .toArray();
    if (deprecatedDailyTasks.length > 0) {
      await db.dailyTasks.bulkDelete(deprecatedDailyTasks.map(t => t.id));
      console.log(`[Init] 删除 ${deprecatedDailyTasks.length} 条未结算旧拆分 dailyTask:`,
        deprecatedDailyTasks.map(t => t.taskTemplateId));
    }

    // ── 3. 补齐缺失的默认模板 ──
    for (const dt of DEFAULT_TASK_TEMPLATES) {
      if (!existingMap[dt.id]) {
        const t = Utils.deepClone(dt);
        t.updatedAt = now;
        await db.taskTemplates.add(t);
        console.log(`[Init] 补齐缺失模板: ${dt.id}`);
      } else if (!existingMap[dt.id].groupKey || existingMap[dt.id].groupKey !== dt.groupKey) {
        // 更新 groupKey 为正确值
        await db.taskTemplates.update(dt.id, { groupKey: dt.groupKey, updatedAt: now });
      }
    }

    // ── 4. 确保旧 chineseMain/mathMain 使用正确的 groupKey 且 active=1 ──
    if (existingMap['chineseMain']) {
      const t = existingMap['chineseMain'];
      if (t.active !== 1 || t.groupKey !== 'chinese') {
        await db.taskTemplates.update('chineseMain', { active: 1, groupKey: 'chinese',
          suggestedMinutes: 40, defaultPoints: 10, updatedAt: now });
        console.log('[Init] 重新启用 chineseMain');
      }
    }
    if (existingMap['mathMain']) {
      const t = existingMap['mathMain'];
      if (t.active !== 1 || t.groupKey !== 'math') {
        await db.taskTemplates.update('mathMain', { active: 1, groupKey: 'math',
          suggestedMinutes: 40, defaultPoints: 10, updatedAt: now });
        console.log('[Init] 重新启用 mathMain');
      }
    }

    // ── 5. 更新 groupKey 迁移 ──
    if (existingMap['englishIntensive'] && existingMap['englishIntensive'].groupKey !== 'english') {
      await db.taskTemplates.update('englishIntensive', { groupKey: 'english', updatedAt: now });
    }
    if (existingMap['englishExtensive'] && existingMap['englishExtensive'].groupKey !== 'english') {
      await db.taskTemplates.update('englishExtensive', { active: 1, groupKey: 'english', updatedAt: now });
    }
    if (existingMap['englishRetell'] && existingMap['englishRetell'].groupKey !== 'optional') {
      await db.taskTemplates.update('englishRetell', { active: 1, groupKey: 'optional', updatedAt: now });
    }
    // englishListening groupKey → basic (required daily task)
    if (existingMap['englishListening'] && existingMap['englishListening'].groupKey !== 'basic') {
      await db.taskTemplates.update('englishListening', { groupKey: 'basic', updatedAt: now });
    }
    // englishCartoon groupKey → english (英语主线)
    if (existingMap['englishCartoon'] && existingMap['englishCartoon'].groupKey !== 'english') {
      await db.taskTemplates.update('englishCartoon', { groupKey: 'english', updatedAt: now });
    }
    // parentReading groupKey → basic (required daily task)
    if (existingMap['parentReading'] && existingMap['parentReading'].groupKey !== 'basic') {
      await db.taskTemplates.update('parentReading', { groupKey: 'basic', updatedAt: now });
    }
    // smallSport1-4 names/icons/defaults update
    const OLD_SPORT_NAMES = new Set(['小运动 1','小运动 2','小运动 3','小运动 4']);
    const sportDefaults = {
      smallSport1: { name:'引体向上', icon:'🤸', description:'拉伸、跳绳、核心、平衡等小运动' },
      smallSport2: { name:'倒立',     icon:'💪', description:'拉伸、跳绳、核心、平衡等小运动' },
      smallSport3: { name:'小燕飞',   icon:'🧘', description:'拉伸、跳绳、核心、平衡等小运动' },
      smallSport4: { name:'小运动4',  icon:'🌱', description:'备用小运动，默认关闭' }
    };
    for (const [sid, sdef] of Object.entries(sportDefaults)) {
      if (existingMap[sid]) {
        const t = existingMap[sid];
        const isDefault = OLD_SPORT_NAMES.has(t.name) || t.name === sdef.name;
        if (isDefault && (t.name !== sdef.name || t.icon !== sdef.icon || t.description !== sdef.description)) {
          await db.taskTemplates.update(sid, { ...sdef, updatedAt: now });
        }
        if (t.groupKey !== 'sport') {
          await db.taskTemplates.update(sid, { groupKey: 'sport', updatedAt: now });
        }
      }
    }

    // ── 6. V5: section 字段兼容迁移 ──
    const SECTION_MAP = {
      chineseMorningRead: 'today_required', englishMorningRead: 'today_required',
      chineseMain: 'today_required', mathMain: 'today_required',
      parentReading: 'today_required',
      englishListening: 'english_energy', englishCartoon: 'english_energy',
      englishIntensive: 'english_energy', englishExtensive: 'english_energy',
      bigSport: 'sports_challenge', smallSport1: 'sports_challenge',
      smallSport2: 'sports_challenge', smallSport3: 'sports_challenge',
      smallSport4: 'sports_challenge',
      mathThinking: 'extra_bonus', mathTeacher: 'extra_bonus',
      handwritingPractice: 'extra_bonus', englishRetell: 'extra_bonus'
    };
    for (const t of existing) {
      const patches = {};
      let needsFix = false;
      if (!t.section) {
        patches.section = SECTION_MAP[t.id] || guessSectionV5(t);
        needsFix = true;
      }
      if (t.englishEnergyRate === undefined) {
        patches.englishEnergyRate = (patches.section || t.section) === 'english_energy' ? (t.id === 'englishListening' ? 0.5 : 1) : null;
        needsFix = true;
      }
      if (t.requiresDuration === undefined) {
        patches.requiresDuration = t.taskType === 'duration';
        needsFix = true;
      }
      if (needsFix) {
        patches.updatedAt = now;
        await db.taskTemplates.update(t.id, patches);
      }
    }
    console.log('[Init] V5 section 字段迁移完成');
  }

  /** 根据任务名称模糊匹配 section（用于自定义/未知任务） */
  function guessSectionV5(t) {
    const name = (t.name || '').toLowerCase();
    const cat = (t.category || '').toLowerCase();
    const gk = (t.groupKey || '').toLowerCase();
    const combined = cat + gk + name;
    if (/跳绳|运动|跑步|轮滑|户外|sport|bigsport|smallsport/.test(combined)) return 'sports_challenge';
    if (/英语|english|熏听|动画|cartoon|精读|泛读|复述/.test(name + gk)) return 'english_energy';
    if (/家务|阅读加分|额外训练|额外任务|加分项|bonus|extra|chore/.test(combined)) return 'extra_bonus';
    return 'today_required';
  }

  // ─── V3 数据迁移 ───

  /** 迁移 rewards → V3：补齐新字段 */
  async function migrateRewardsV3() {
    const now = Utils.nowISO();
    const existing = await db.rewards.toArray();
    const existingMap = {};
    for (const r of existing) { existingMap[r.id] = r; }

    // ── 1. 修复已有 reward 的 active 字段 ──
    for (const r of existing) {
      const fixes = {};
      let needsFix = false;

      if (r.active === true || r.active === 'true') { fixes.active = 1; needsFix = true; }
      else if (r.active === false || r.active === 'false') { fixes.active = 0; needsFix = true; }
      else if (r.active === undefined || r.active === null) { fixes.active = 1; needsFix = true; }

      // 补齐 V3 新字段
      if (r.category === undefined) {
        fixes.category = guessCategory(r);
        needsFix = true;
      }
      if (r.visibleToChild === undefined) {
        fixes.visibleToChild = r.active ? 1 : 0;
        needsFix = true;
      }
      if (r.displaySection === undefined) {
        fixes.displaySection = guessDisplaySection(r.tier);
        needsFix = true;
      }
      if (r.riskLevel === undefined) {
        fixes.riskLevel = 'low';
        needsFix = true;
      }
      if (r.requiresParentApproval === undefined) {
        fixes.requiresParentApproval = true;
        needsFix = true;
      }
      if (r.fulfillmentType === undefined) {
        fixes.fulfillmentType = 'voucher';
        needsFix = true;
      }
      if (r.dailyLimit === undefined) { fixes.dailyLimit = null; needsFix = true; }
      if (r.weeklyLimit === undefined) { fixes.weeklyLimit = null; needsFix = true; }
      if (r.monthlyLimit === undefined) { fixes.monthlyLimit = null; needsFix = true; }
      if (r.parentNote === undefined) { fixes.parentNote = ''; needsFix = true; }
      if (r.childDescription === undefined) { fixes.childDescription = r.name || ''; needsFix = true; }

      // displaySection=hidden 时强制 visibleToChild=false
      const finalDs = fixes.displaySection !== undefined ? fixes.displaySection : r.displaySection;
      if (finalDs === 'hidden' && (fixes.visibleToChild !== undefined ? fixes.visibleToChild : r.visibleToChild) !== 0) {
        fixes.visibleToChild = 0;
        needsFix = true;
      }

      if (needsFix) {
        fixes.updatedAt = now;
        await db.rewards.update(r.id, fixes);
        console.log(`[Migrate] reward "${r.id}" V3 字段已补齐`);
      }
    }

    // ── 2. 增量补齐默认 reward ──
    // 只添加不存在的，不覆盖已有
    for (const dr of DEFAULT_REWARDS) {
      if (!existingMap[dr.id]) {
        const r = Utils.deepClone(dr);
        r.updatedAt = now;
        await db.rewards.add(r);
        console.log(`[Init] 补齐缺失奖励: ${dr.id}`);
      } else {
        // 已存在：只补齐 V3 新增字段，不覆盖 name/cost/active/visibleToChild/sortOrder
        const cur = existingMap[dr.id];
        const patches = {};
        let needsPatch = false;

        if (cur.category === undefined) { patches.category = dr.category; needsPatch = true; }
        if (cur.displaySection === undefined) { patches.displaySection = dr.displaySection; needsPatch = true; }
        if (cur.riskLevel === undefined) { patches.riskLevel = dr.riskLevel; needsPatch = true; }
        if (cur.requiresParentApproval === undefined) { patches.requiresParentApproval = dr.requiresParentApproval; needsPatch = true; }
        if (cur.fulfillmentType === undefined) { patches.fulfillmentType = dr.fulfillmentType; needsPatch = true; }
        if (cur.dailyLimit === undefined) { patches.dailyLimit = dr.dailyLimit; needsPatch = true; }
        if (cur.weeklyLimit === undefined) { patches.weeklyLimit = dr.weeklyLimit; needsPatch = true; }
        if (cur.monthlyLimit === undefined) { patches.monthlyLimit = dr.monthlyLimit; needsPatch = true; }
        if (cur.parentNote === undefined || cur.parentNote === '') { patches.parentNote = dr.parentNote; needsPatch = true; }
        if (cur.childDescription === undefined || cur.childDescription === '') { patches.childDescription = dr.childDescription; needsPatch = true; }
        if (cur.icon === undefined || cur.icon === '') { patches.icon = dr.icon; needsPatch = true; }
        if (cur.tier === undefined) { patches.tier = dr.tier; needsPatch = true; }

        // displaySection=hidden 时强制 visibleToChild=false
        const curDs = patches.displaySection !== undefined ? patches.displaySection : cur.displaySection;
        if (curDs === 'hidden' && cur.visibleToChild !== 0) {
          patches.visibleToChild = 0;
          needsPatch = true;
        }

        if (needsPatch) {
          patches.updatedAt = now;
          await db.rewards.update(dr.id, patches);
          console.log(`[Init] reward "${dr.id}" 默认字段补齐`);
        }
      }
    }
  }

  /** 根据旧 reward 名称猜测 category */
  function guessCategory(reward) {
    const name = (reward.name || '').toLowerCase();
    if (/动画|视频|屏幕|游戏|电影|cartoon|video|game|movie|screen/.test(name)) return 'screen';
    if (/亲子|陪伴|散步|陪|park|walk/.test(name)) return 'parentTime';
    if (/外出|公园|游乐|动物|博物馆|科技馆|outing|trip|date|约会/.test(name)) return 'outing';
    if (/选择|决定|choice|pick/.test(name)) return 'choice';
    if (/任务|免除|请假|申请|特权|卡片|卡/.test(name)) return 'privilege';
    if (/文具|玩具|书|绘本|漫画|乐高|积木|橡皮|贴纸|盲袋|stationery|toy|book|lego/.test(name)) return 'physical';
    if (/水果|食物|餐厅|restaurant|food/.test(name)) return 'physical';
    return 'physical';
  }

  /** 根据 tier 默认 displaySection */
  function guessDisplaySection(tier) {
    switch (tier) {
      case 'small': return 'today';
      case 'medium': return 'weekly';
      case 'high': return 'goal';
      case 'super': return 'goal';
      default: return 'hidden';
    }
  }

  /** 迁移 redeemRecords → V3：补齐快照字段和时间字段 */
  async function migrateRedeemRecordsV3() {
    const childId = (await db.appConfig.get('singleton'))?.boundChildId;
    if (!childId) return;

    const records = await db.redeemRecords
      .where('childId').equals(childId)
      .toArray();

    for (const r of records) {
      const patches = {};
      let needsPatch = false;

      // 时间字段迁移：旧字段 → 新字段
      if (r.redeemedAt === undefined) {
        patches.redeemedAt = r.redeemedAt || r.time || null;
        needsPatch = true;
      }
      if (r.fulfilledAt === undefined) {
        patches.fulfilledAt = r.fulfilledAt || r.fulfilledTime || null;
        needsPatch = true;
      }
      if (r.cancelledAt === undefined) {
        patches.cancelledAt = r.cancelledAt || r.cancelledTime || null;
        needsPatch = true;
      }

      // 快照字段
      if (r.rewardNameSnapshot === undefined) {
        patches.rewardNameSnapshot = r.rewardName || '';
        needsPatch = true;
      }
      if (r.costSnapshot === undefined) {
        patches.costSnapshot = r.cost || 0;
        needsPatch = true;
      }
      if (r.categorySnapshot === undefined) {
        // 尝试从对应 reward 获取 category
        const reward = r.rewardId ? await db.rewards.get(r.rewardId) : null;
        patches.categorySnapshot = (reward && reward.category) || 'physical';
        needsPatch = true;
      }
      if (r.fulfillmentTypeSnapshot === undefined) {
        const reward = r.rewardId ? await db.rewards.get(r.rewardId) : null;
        patches.fulfillmentTypeSnapshot = (reward && reward.fulfillmentType) || 'voucher';
        needsPatch = true;
      }
      if (r.childDescriptionSnapshot === undefined) {
        const reward = r.rewardId ? await db.rewards.get(r.rewardId) : null;
        patches.childDescriptionSnapshot = (reward && reward.childDescription) || r.rewardName || '';
        needsPatch = true;
      }
      if (r.parentNoteSnapshot === undefined) {
        const reward = r.rewardId ? await db.rewards.get(r.rewardId) : null;
        patches.parentNoteSnapshot = (reward && reward.parentNote) || '';
        needsPatch = true;
      }
      if (r.pointRecordId === undefined && r.pointRecordId !== null) {
        // 保留已有的 pointRecordId（V2 redeem 已包含）
        patches.pointRecordId = r.pointRecordId || null;
        needsPatch = true;
      }
      if (r.refundPointRecordId === undefined) {
        patches.refundPointRecordId = null;
        needsPatch = true;
      }
      if (r.scheduledFor === undefined) {
        patches.scheduledFor = null;
        needsPatch = true;
      }

      if (needsPatch) {
        await db.redeemRecords.update(r.id, patches);
        console.log(`[Migrate] redeemRecord "${r.id}" V3 字段已补齐`);
      }
    }
  }

  /** 校验默认商品库货架合规性，并修复违规 */
  async function validateDefaultStorefront() {
    // Rules 由 rules.js 定义（db.js 之前加载，但此函数仅在 initDefaults 中异步调用，此时 Rules 已就绪）
    if (typeof Rules === 'undefined' || !Rules.isChildStorefrontReward) {
      console.warn('[Validate] Rules 未就绪，跳过货架合规校验');
      return;
    }
    let allRewards = await db.rewards.toArray();
    if (allRewards.length === 0) return;

    // 统计可见商品
    const visibleRewards = allRewards.filter(r =>
      Rules.isChildStorefrontReward(r)
    );

    const todayCount = visibleRewards.filter(r => r.displaySection === 'today').length;
    const weeklyCount = visibleRewards.filter(r => r.displaySection === 'weekly').length;
    const goalCount = visibleRewards.filter(r => r.displaySection === 'goal').length;
    const highRiskCount = visibleRewards.filter(r => r.riskLevel === 'high').length;
    const screenCount = visibleRewards.filter(r => r.category === 'screen').length;
    const privilegeCount = visibleRewards.filter(r => r.category === 'privilege').length;
    const applicationCount = visibleRewards.filter(r => r.fulfillmentType === 'application').length;

    const violations = [];

    if (visibleRewards.length > 15) violations.push(`孩子端可见商品 ${visibleRewards.length} > 15`);
    if (todayCount > 5) violations.push(`today 分区 ${todayCount} > 5`);
    if (weeklyCount > 5) violations.push(`weekly 分区 ${weeklyCount} > 5`);
    if (goalCount > 5) violations.push(`goal 分区 ${goalCount} > 5`);
    if (highRiskCount > 2) violations.push(`高风险 ${highRiskCount} > 2`);
    if (screenCount > 2) violations.push(`屏幕类 ${screenCount} > 2`);
    if (privilegeCount > 2) violations.push(`特权类 ${privilegeCount} > 2`);
    if (applicationCount > 1) violations.push(`申请卡 ${applicationCount} > 1`);

    // 检查 hidden 商品是否错误设为 visibleToChild
    const hiddenButVisible = allRewards.filter(r =>
      r.displaySection === 'hidden' && Rules.isTruthyFlag(r.visibleToChild)
    );
    if (hiddenButVisible.length > 0) {
      for (const r of hiddenButVisible) {
        await db.rewards.update(r.id, { visibleToChild: 0, updatedAt: Utils.nowISO() });
        console.log(`[Validate] 修复: "${r.id}" displaySection=hidden 但 visibleToChild=true → 强制置 0`);
      }
    }

    // 检查 application 是否放在非 goal 分区
    const appInWrongSection = visibleRewards.filter(r =>
      r.fulfillmentType === 'application' && r.displaySection !== 'goal'
    );
    if (appInWrongSection.length > 0) {
      for (const r of appInWrongSection) {
        await db.rewards.update(r.id, { displaySection: 'goal', updatedAt: Utils.nowISO() });
        console.log(`[Validate] 修复: "${r.id}" application 不在 goal → 移至 goal`);
      }
    }

    if (violations.length > 0) {
      console.warn('[Validate] 默认商品库货架违规（不自动修复）:', violations.join('; '));
      // ★ 不再自动隐藏超出限额的商品。家长端管理页已有上架校验，
      //    此处只报告违规，由家长在管理页手动调整。
    } else {
      console.log('[Validate] 默认商品库货架合规 ✓');
    }
  }

  /** 将布尔/字符串标志位归一化为 0 或 1 */
  function normalizeFlag(value, defaultVal) {
    if (value === true || value === 'true' || value === '1' || value === 1) return 1;
    if (value === false || value === 'false' || value === '0' || value === 0) return 0;
    return defaultVal;
  }

  /** 返回 DEFAULT_REWARDS 的 id→reward Map */
  function getDefaultRewardMap() {
    return new Map(DEFAULT_REWARDS.map(r => [r.id, r]));
  }

  /** 确保 V3.1 reward 字段完整（幂等，每次初始化都执行）
   *  修复策略：DEFAULT_REWARDS 为权威来源，不先 guess 再 default */
  async function ensureRewardsV31Complete() {
    const now = Utils.nowISO();
    const DEFAULT_MAP = getDefaultRewardMap();
    let fixedCount = 0;
    let addedCount = 0;

    // ═══ Step 1: 处理 DEFAULT_REWARDS（权威字段来源） ═══
    const allRewards = await db.rewards.toArray();
    const existingMap = {};
    for (const r of allRewards) { existingMap[r.id] = r; }

    for (const dr of DEFAULT_REWARDS) {
      if (!existingMap[dr.id]) {
        // 数据库不存在 → 完整新增
        const r = Utils.deepClone(dr);
        r.updatedAt = now;
        await db.rewards.add(r);
        addedCount++;
        console.log(`[V31] 补齐缺失默认奖励: ${dr.id}`);
      } else {
        // 数据库已存在 → 以 DEFAULT_REWARDS 为权威字段来源
        const cur = existingMap[dr.id];
        const patches = {};
        let needsPatch = false;

        // ── V1.1 权威字段：强制同步 ──
        const AUTHORITATIVE_FIELDS = [
          'category', 'riskLevel', 'requiresParentApproval', 'fulfillmentType',
          'dailyLimit', 'weeklyLimit', 'monthlyLimit',
          'parentNote', 'childDescription', 'tier', 'sortOrder'
        ];
        for (const field of AUTHORITATIVE_FIELDS) {
          const defVal = dr[field];
          const curVal = cur[field];
          // 对于 null/undefined 字段，用默认值；对于已有值但不同于默认的，也强制覆盖
          if (curVal === undefined || curVal === null || curVal !== defVal) {
            // sortOrder / dailyLimit / weeklyLimit / monthlyLimit 允许 null
            if ((field === 'dailyLimit' || field === 'weeklyLimit' || field === 'monthlyLimit') && defVal === null) {
              if (curVal !== null && curVal !== undefined) {
                patches[field] = null; needsPatch = true;
              } else if (curVal === undefined) {
                patches[field] = null; needsPatch = true;
              }
            } else {
              patches[field] = defVal; needsPatch = true;
            }
          }
        }

        // ── 用户可修改字段：保留当前值，除非为空 ──
        if (cur.name === undefined || cur.name === null || cur.name === '') {
          patches.name = dr.name; needsPatch = true;
        }
        if (cur.icon === undefined || cur.icon === null || cur.icon === '') {
          patches.icon = dr.icon; needsPatch = true;
        }
        if (cur.cost === undefined || cur.cost === null) {
          patches.cost = dr.cost; needsPatch = true;
        }
        // active: 保留用户值，除非为空
        if (cur.active === undefined || cur.active === null) {
          patches.active = dr.active; needsPatch = true;
        } else {
          // 归一化 active
          const normalized = normalizeFlag(cur.active, 1);
          if (normalized !== cur.active) { patches.active = normalized; needsPatch = true; }
        }

        // ── visibleToChild / displaySection：仅在字段缺失时填入默认值，不覆盖家长已设置的配置 ──
        if (cur.visibleToChild === undefined || cur.visibleToChild === null) {
          patches.visibleToChild = dr.visibleToChild; needsPatch = true;
        }
        if (cur.displaySection === undefined || cur.displaySection === null) {
          patches.displaySection = dr.displaySection; needsPatch = true;
        }

        // ── 硬规则：displaySection=hidden → visibleToChild=0 ──
        const finalDs = patches.displaySection !== undefined ? patches.displaySection : cur.displaySection;
        const finalVtc = patches.visibleToChild !== undefined ? patches.visibleToChild : normalizeFlag(cur.visibleToChild, 0);
        if (finalDs === 'hidden' && finalVtc !== 0) {
          patches.visibleToChild = 0; needsPatch = true;
        }

        // ── 硬规则：category=screen 强制 dailyLimit≤1 ──
        const finalCat = patches.category !== undefined ? patches.category : cur.category;
        if (finalCat === 'screen') {
          const finalDl = patches.dailyLimit !== undefined ? patches.dailyLimit : cur.dailyLimit;
          if (finalDl !== null && finalDl !== undefined && finalDl > 1) {
            patches.dailyLimit = 1; needsPatch = true;
          }
        }

        if (needsPatch) {
          patches.updatedAt = now;
          await db.rewards.update(dr.id, patches);
          fixedCount++;
        }
      }
    }

    // ═══ Step 2: 处理非 DEFAULT_REWARDS（旧 reward / custom reward） ═══
    const refreshedAll = await db.rewards.toArray();
    const nonDefaultRewards = refreshedAll.filter(r => !DEFAULT_MAP.has(r.id));

    // 旧系统 reward ID 模式
    const LEGACY_REWARD_PATTERN = /^reward-[smhx]-\d+$/;

    for (const r of nonDefaultRewards) {
      const patches = {};
      let needsPatch = false;

      // 归一化 active
      const normalizedActive = normalizeFlag(r.active, 1);
      if (r.active !== normalizedActive) { patches.active = normalizedActive; needsPatch = true; }

      // 归一化 visibleToChild
      const normalizedVtc = normalizeFlag(r.visibleToChild, 0);

      if (r.id.startsWith('custom-')) {
        // custom-* 保留，补齐字段
        if (r.category === undefined || r.category === null) {
          patches.category = 'physical'; needsPatch = true;
        }
        if (r.riskLevel === undefined || r.riskLevel === null) {
          patches.riskLevel = 'low'; needsPatch = true;
        }
        if (r.fulfillmentType === undefined || r.fulfillmentType === null) {
          patches.fulfillmentType = 'voucher'; needsPatch = true;
        }
        if (r.displaySection === undefined || r.displaySection === null) {
          patches.displaySection = 'hidden'; needsPatch = true;
        }

        // displaySection === 'hidden' → 强制 visibleToChild=0
        const finalDs = patches.displaySection !== undefined ? patches.displaySection : r.displaySection;
        if (finalDs === 'hidden' && normalizedVtc !== 0) {
          patches.visibleToChild = 0; needsPatch = true;
        } else if (normalizedVtc !== r.visibleToChild && patches.visibleToChild === undefined) {
          patches.visibleToChild = normalizedVtc; needsPatch = true;
        }
      } else if (LEGACY_REWARD_PATTERN.test(r.id)) {
        // 旧系统 reward-s-* / reward-m-* / reward-h-* / reward-x-*
        // 保留在家长库，但强制从孩子端下架
        if (normalizedVtc !== 0) {
          patches.visibleToChild = 0; needsPatch = true;
        }
        if (r.displaySection !== 'hidden') {
          patches.displaySection = 'hidden'; needsPatch = true;
        }
        // 补齐缺失字段
        if (r.category === undefined || r.category === null) {
          patches.category = 'physical'; needsPatch = true;
        }
        if (r.riskLevel === undefined || r.riskLevel === null) {
          patches.riskLevel = 'low'; needsPatch = true;
        }
        if (r.fulfillmentType === undefined || r.fulfillmentType === null) {
          patches.fulfillmentType = 'voucher'; needsPatch = true;
        }
        if (r.requiresParentApproval === undefined || r.requiresParentApproval === null) {
          patches.requiresParentApproval = true; needsPatch = true;
        }
        if (r.dailyLimit === undefined) { patches.dailyLimit = null; needsPatch = true; }
        if (r.weeklyLimit === undefined) { patches.weeklyLimit = null; needsPatch = true; }
        if (r.monthlyLimit === undefined) { patches.monthlyLimit = null; needsPatch = true; }
        if (r.parentNote === undefined) { patches.parentNote = ''; needsPatch = true; }
        if (r.childDescription === undefined) {
          patches.childDescription = r.name || ''; needsPatch = true;
        }
        if (r.tier === undefined || r.tier === null) {
          patches.tier = 'small'; needsPatch = true;
        }
        if (r.sortOrder === undefined || r.sortOrder === null) {
          patches.sortOrder = 99; needsPatch = true;
        }
      } else {
        // 其他未知 reward：补齐字段，不强制修改 visibleToChild/displaySection
        if (r.category === undefined || r.category === null) {
          patches.category = 'physical'; needsPatch = true;
        }
        if (r.riskLevel === undefined || r.riskLevel === null) {
          patches.riskLevel = 'low'; needsPatch = true;
        }
        if (r.fulfillmentType === undefined || r.fulfillmentType === null) {
          patches.fulfillmentType = 'voucher'; needsPatch = true;
        }
        if (r.displaySection === undefined || r.displaySection === null) {
          patches.displaySection = 'hidden'; needsPatch = true;
        }
        // displaySection=hidden 强制 visibleToChild=0
        const finalDs = patches.displaySection !== undefined ? patches.displaySection : r.displaySection;
        if (finalDs === 'hidden' && normalizedVtc !== 0) {
          patches.visibleToChild = 0; needsPatch = true;
        } else if (normalizedVtc !== r.visibleToChild && patches.visibleToChild === undefined) {
          patches.visibleToChild = normalizedVtc; needsPatch = true;
        }
      }

      if (needsPatch) {
        patches.updatedAt = now;
        await db.rewards.update(r.id, patches);
        fixedCount++;
      }
    }

    // ═══ Step 3: 验收日志 ═══
    const finalRewards = await db.rewards.toArray();
    const visibleRewards = finalRewards.filter(r =>
      typeof Rules !== 'undefined' && Rules.isChildStorefrontReward
        ? Rules.isChildStorefrontReward(r)
        : (normalizeFlag(r.active, 0) === 1 && normalizeFlag(r.visibleToChild, 0) === 1 && r.displaySection !== 'hidden')
    );
    const todayCount = visibleRewards.filter(r => r.displaySection === 'today').length;
    const weeklyCount = visibleRewards.filter(r => r.displaySection === 'weekly').length;
    const goalCount = visibleRewards.filter(r => r.displaySection === 'goal').length;
    const hiddenButVisible = finalRewards.filter(r =>
      r.displaySection === 'hidden' && normalizeFlag(r.visibleToChild, 0) === 1
    );

    console.log(`[V31] ensureRewardsV31Complete: 总计 ${finalRewards.length} 商品, `
      + `修复 ${fixedCount} 个, 新增 ${addedCount} 个, `
      + `孩子可见=${visibleRewards.length} (today=${todayCount} weekly=${weeklyCount} goal=${goalCount}), `
      + `hidden但visible=${hiddenButVisible.length}`);

    return { total: finalRewards.length, fixed: fixedCount, added: addedCount,
      visible: visibleRewards.length, today: todayCount, weekly: weeklyCount, goal: goalCount,
      hiddenButVisible: hiddenButVisible.length };
  }

  /** 强制恢复默认 5/5/5 孩子端货架
   *  必须在 ensureRewardsV31Complete() 之后调用 */
  async function enforceDefaultStorefrontV31() {
    const now = Utils.nowISO();

    // 默认 15 个可见 reward 的精确定义（大童修正版第 1 周 5/5/5）
    const STOREFRONT_DEFAULTS = {
      today: [
        'story_choice',
        'parent_game_10',
        'task_order_choice',
        'custom-board-game-duel-15',
        'custom-building-theme-choice'
      ],
      weekly: [
        'cartoon_15',
        'parent_game_20',
        'small_stationery',
        'stationery_blind_bag',
        'custom-snack-supply-10'
      ],
      goal: [
        'one_on_one_30',
        'park_1h',
        'picture_book',
        'restaurant_choice',
        'toy_50'
      ]
    };

    const VISIBLE_IDS = new Set([
      ...STOREFRONT_DEFAULTS.today,
      ...STOREFRONT_DEFAULTS.weekly,
      ...STOREFRONT_DEFAULTS.goal
    ]);

    const DEFAULT_MAP = getDefaultRewardMap();
    const allRewards = await db.rewards.toArray();

    // ── 1. 确保 15 个默认 reward 在货架上 ──
    for (const section of ['today', 'weekly', 'goal']) {
      for (const id of STOREFRONT_DEFAULTS[section]) {
        const r = allRewards.find(rw => rw.id === id);
        if (!r) continue; // 不应该发生（ensureRewardsV31Complete 已补齐）
        const patches = {};
        let needsPatch = false;
        if (normalizeFlag(r.active, 0) !== 1) { patches.active = 1; needsPatch = true; }
        if (normalizeFlag(r.visibleToChild, 0) !== 1) { patches.visibleToChild = 1; needsPatch = true; }
        if (r.displaySection !== section) { patches.displaySection = section; needsPatch = true; }
        if (needsPatch) {
          patches.updatedAt = now;
          await db.rewards.update(id, patches);
          console.log(`[V31] enforceDefaultStorefrontV31: "${id}" → ${section}`);
        }
      }
    }

    // ── 2. 其余 DEFAULT_REWARDS 强制隐藏 ──
    for (const dr of DEFAULT_REWARDS) {
      if (VISIBLE_IDS.has(dr.id)) continue;
      const r = allRewards.find(rw => rw.id === dr.id);
      if (!r) continue;
      const patches = {};
      let needsPatch = false;
      if (normalizeFlag(r.visibleToChild, 0) !== 0) { patches.visibleToChild = 0; needsPatch = true; }
      if (r.displaySection !== 'hidden') { patches.displaySection = 'hidden'; needsPatch = true; }
      if (needsPatch) {
        patches.updatedAt = now;
        await db.rewards.update(dr.id, patches);
        console.log(`[V31] enforceDefaultStorefrontV31: "${dr.id}" → hidden`);
      }
    }

    // ── 3. 非 DEFAULT_REWARDS 的旧 reward（非 custom-*）强制隐藏 ──
    const LEGACY_REWARD_PATTERN = /^reward-[smhx]-\d+$/;
    for (const r of allRewards) {
      if (DEFAULT_MAP.has(r.id)) continue;
      if (r.id.startsWith('custom-')) continue;
      // 旧 reward 或未知 reward：强制隐藏
      const patches = {};
      let needsPatch = false;
      if (normalizeFlag(r.visibleToChild, 0) !== 0) { patches.visibleToChild = 0; needsPatch = true; }
      if (r.displaySection !== 'hidden') { patches.displaySection = 'hidden'; needsPatch = true; }
      if (needsPatch) {
        patches.updatedAt = now;
        await db.rewards.update(r.id, patches);
        console.log(`[V31] enforceDefaultStorefrontV31: 旧reward "${r.id}" → hidden`);
      }
    }

    // ── 4. 验收日志 ──
    const finalRewards = await db.rewards.toArray();
    const visible = finalRewards.filter(r =>
      normalizeFlag(r.active, 0) === 1
      && normalizeFlag(r.visibleToChild, 0) === 1
      && r.displaySection !== 'hidden'
    );
    const todayIds = visible.filter(r => r.displaySection === 'today').map(r => r.id).sort();
    const weeklyIds = visible.filter(r => r.displaySection === 'weekly').map(r => r.id).sort();
    const goalIds = visible.filter(r => r.displaySection === 'goal').map(r => r.id).sort();
    const hiddenButVisible = finalRewards.filter(r =>
      r.displaySection === 'hidden' && normalizeFlag(r.visibleToChild, 0) === 1
    ).map(r => r.id);

    const expectedToday = [...STOREFRONT_DEFAULTS.today].sort();
    const expectedWeekly = [...STOREFRONT_DEFAULTS.weekly].sort();
    const expectedGoal = [...STOREFRONT_DEFAULTS.goal].sort();

    console.log(`[V31] enforceDefaultStorefrontV31 完成:`);
    console.log(`  totalRewards = ${finalRewards.length}`);
    console.log(`  visible = ${visible.length}`);
    console.log(`  today = ${todayIds.length}`);
    console.log(`  weekly = ${weeklyIds.length}`);
    console.log(`  goal = ${goalIds.length}`);
    console.log(`  hiddenButVisible = ${hiddenButVisible.length}`);
    console.log(`  visibleIds = [${visible.map(r => r.id).join(', ')}]`);

    // 严格验收
    const todayMatch = todayIds.length === expectedToday.length
      && expectedToday.every((id, i) => id === todayIds[i]);
    const weeklyMatch = weeklyIds.length === expectedWeekly.length
      && expectedWeekly.every((id, i) => id === weeklyIds[i]);
    const goalMatch = goalIds.length === expectedGoal.length
      && expectedGoal.every((id, i) => id === goalIds[i]);

    if (!todayMatch || !weeklyMatch || !goalMatch || hiddenButVisible.length > 0) {
      const details = {
        todayMatch, weeklyMatch, goalMatch,
        todayIds, expectedToday,
        weeklyIds, expectedWeekly,
        goalIds, expectedGoal,
        hiddenButVisible
      };
      console.error('[V31] enforceDefaultStorefrontV31 验收失败:', JSON.stringify(details, null, 2));
      throw new Error(`[V31] enforceDefaultStorefrontV31 验收失败: `
        + `today=${todayMatch} weekly=${weeklyMatch} goal=${goalMatch} hiddenButVisible=${hiddenButVisible.length}`);
    }

    console.log('[V31] enforceDefaultStorefrontV31 验收通过 ✓');
  }

  /** V3 迁移主入口 */
  async function migrateToV3() {
    const cfg = await db.appConfig.get('singleton');
    const rewardCount = await db.rewards.count();

    // 如果 rewards 表为空，强制执行补齐（修复因 schemaVersion 提前置为 3 导致的问题）
    const needsRewardMigration = rewardCount === 0;

    if (cfg && cfg.schemaVersion >= 3 && !needsRewardMigration) {
      console.log('[Migrate] schemaVersion 已是 v3，跳过 V3 迁移（ensureRewardsV31Complete 将兜底）');
      return;
    }

    if (needsRewardMigration) {
      console.log('[Migrate] rewards 表为空，强制执行 V3 迁移...');
    } else {
      console.log('[Migrate] 开始 V3 迁移...');
    }
    await migrateRewardsV3();
    await migrateRedeemRecordsV3();

    // 更新 schemaVersion
    await db.appConfig.update('singleton', { schemaVersion: 3 });
    console.log('[Migrate] V3 迁移完成，schemaVersion → 3');
  }

  /** 主初始化入口 */
  async function initDefaults(childId = 'child-default', childName = '小朋友', avatarId = 'football') {
    await ensureAppConfig(childId, childName);
    await ensureBoundChild(childId, childName, avatarId);
    await ensureRulesConfig();
    await ensureTaskTemplatesComplete();
    await ensureLotteryConfig();
    await ensureVideoListItems();

    // V3 迁移（包含 reward 补齐 + redeemRecord 补齐）
    await migrateToV3();

    // V3.1 幂等修复：无论 schemaVersion，每次启动都执行字段补齐
    await ensureRewardsV31Complete();

    // V3.1 默认货架：仅首次初始化时执行一次，之后不覆盖家长配置
    const cfg = await db.appConfig.get('singleton');
    const storefrontInitialized = cfg?.storefrontInitializedV31 === true;
    if (!storefrontInitialized) {
      await enforceDefaultStorefrontV31();
      await db.appConfig.update('singleton', { storefrontInitializedV31: true });
      console.log('[Init] 首次初始化默认货架完成，storefrontInitializedV31 → true');
    } else {
      console.log('[Init] 货架已初始化，跳过 enforceDefaultStorefrontV31');
    }

    // 默认商品库货架合规校验（不对已有配置做自动修改，只输出违规警告）
    await validateDefaultStorefront();

    console.log('[Init] 初始化完成');
  }

  /** 完整重置数据库（用于导入备份前） */
  async function resetAll() {
    await db.delete();
    await db.open();
  }

  // ─── 查询方法 ───

  // -- rulesConfig --
  async function getRulesConfig() {
    return await db.rulesConfig.get('singleton');
  }

  async function updateRulesConfig(changes) {
    changes.updatedAt = Utils.nowISO();
    return await db.rulesConfig.update('singleton', changes);
  }

  // -- child --
  async function getChild(childId) {
    return await db.child.get(childId);
  }

  async function getActiveChild() {
    const cfg = await db.appConfig.get('singleton');
    if (!cfg || !cfg.boundChildId) return null;
    return await db.child.get(cfg.boundChildId);
  }

  async function updateChild(childId, changes) {
    return await db.child.update(childId, changes);
  }

  /** 从 pointRecord 汇总当前积分余额 */
  async function calcCurrentBalance(childId) {
    const result = await db.pointRecords
      .where('childId').equals(childId)
      .toArray();
    return result.reduce((sum, r) => sum + r.points, 0);
  }

  /** 计算累计总积分（只增不减，不含退款） */
  async function calcLifetimePoints(childId) {
    const result = await db.pointRecords
      .where('childId').equals(childId)
      .filter(r => r.points > 0 && r.type !== 'refund')
      .toArray();
    return result.reduce((sum, r) => sum + r.points, 0);
  }

  /** 同步 child 缓存积分 */
  async function syncChildBalance(childId) {
    const balance = await calcCurrentBalance(childId);
    const lifetime = await calcLifetimePoints(childId);
    await db.child.update(childId, {
      currentBalance: balance,
      lifetimeEarnedPoints: lifetime
    });
    return { currentBalance: balance, lifetimeEarnedPoints: lifetime };
  }

  // -- taskTemplates --
  async function getActiveTemplates(dayOfWeek) {
    const allActive = await db.taskTemplates
      .where('active').equals(1)
      .toArray();
    allActive.sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
    return allActive.filter(t => t.weekdays && t.weekdays.includes(dayOfWeek));
  }

  async function getAllTemplates() {
    const all = await db.taskTemplates.toArray();
    all.sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
    return all;
  }

  // -- dailyTasks --
  async function getDailyTasks(childId, date) {
    return await db.dailyTasks
      .where({ childId: childId, date: date })
      .toArray();
  }

  /** 将当天未结算 dailyTasks 同步到最新 taskTemplates
   *  规则：
   *  - 只同步 settled !== true 的 dailyTasks
   *  - 已结算任务绝对不能改
   *  - 不能修改 pointRecords / dailySummaries
   *  - 模板 active → dailyTask 保持可见（inactiveToday = false）
   *  - 模板 inactive → dailyTask 标记为 inactiveToday
   *  - 今天缺少某个启用模板对应的 dailyTask 时补齐（仅当天无已结算任务时）
   *  @param {string} childId
   *  @param {string} date - appDate (YYYY-MM-DD, 已考虑 dayCutoffHour)
   */
  async function syncTodayUnsettledDailyTasksFromTemplates(childId, date) {
    // 字段映射：模板字段 → dailyTask 字段
    const SYNC_FIELD_MAP = {
      name:              'taskName',
      icon:              'taskIcon',
      category:          'category',
      subCategory:       'subCategory',
      groupKey:          'groupKey',
      section:           'section',
      requiresDuration:  'requiresDuration',
      taskType:          'taskType',
      defaultPoints:     'plannedPoints',
      suggestedMinutes:  'suggestedMinutes',
      required:          'required',
      maxCountPerDay:    'maxCountPerDay',
      sortOrder:         'sortOrder'
    };

    const allTemplates = await db.taskTemplates.toArray();
    const templateMap = {};
    for (const t of allTemplates) { templateMap[t.id] = t; }

    const dailyTasks = await getDailyTasks(childId, date);
    const hasSettledTask = dailyTasks.some(t => t.settled === true);

    let syncedCount = 0;
    let inactivatedCount = 0;
    let reactivatedCount = 0;
    let addedCount = 0;

    // ── Step 1: 同步已有未结算 dailyTask ──
    for (const task of dailyTasks) {
      if (task.settled === true) continue; // 已结算：绝不修改

      const template = templateMap[task.taskTemplateId];

      if (!template || !template.active) {
        // 模板已删除或停用 → 标记 inactiveToday
        if (!task.inactiveToday) {
          await db.dailyTasks.update(task.id, { inactiveToday: true });
          task.inactiveToday = true;
          inactivatedCount++;
        }
        continue;
      }

      // 模板 active → 清除可能的 inactiveToday 标记
      if (task.inactiveToday) {
        await db.dailyTasks.update(task.id, { inactiveToday: false });
        task.inactiveToday = false;
        reactivatedCount++;
      }

      // 同步展示字段
      const syncData = {};
      let needsSync = false;

      for (const [templateField, taskField] of Object.entries(SYNC_FIELD_MAP)) {
        const templateVal = template[templateField];
        const taskVal = task[taskField];

        if (templateVal !== undefined && templateVal !== null && taskVal !== templateVal) {
          syncData[taskField] = templateVal;
          task[taskField] = templateVal;
          needsSync = true;
        }
      }

      if (needsSync) {
        await db.dailyTasks.update(task.id, syncData);
        syncedCount++;
      }
    }

    // ── Step 2: 补齐缺失的 dailyTask（仅在当天无已结算任务时）──
    if (!hasSettledTask) {
      const existingTemplateIds = new Set(dailyTasks.map(t => t.taskTemplateId));
      const dayOfWeek = Utils.getDayOfWeek(date);
      const activeTemplates = allTemplates.filter(t => t.active && t.weekdays && t.weekdays.includes(dayOfWeek));

      const newTasks = [];
      for (const template of activeTemplates) {
        if (!existingTemplateIds.has(template.id)) {
          newTasks.push({
            id: `${date}-${template.id}-${childId}`,
            childId: childId,
            date: date,
            taskTemplateId: template.id,
            taskName: template.name,
            taskIcon: template.icon,
            category: template.category,
            subCategory: template.subCategory,
            groupKey: template.groupKey || template.subCategory || 'other',
            section: template.section || null,
            requiresDuration: template.requiresDuration || (template.taskType === 'duration'),
            taskType: template.taskType,
            plannedPoints: template.defaultPoints,
            suggestedMinutes: template.suggestedMinutes,
            required: template.required,
            maxCountPerDay: template.maxCountPerDay,
            sortOrder: template.sortOrder,
            durationMinutes: null,
            rawPoints: null,
            cappedPoints: null,
            childChecked: false,
            childCheckTime: null,
            parentStatus: 'unreviewed',
            parentPoints: null,
            parentNote: '',
            settled: false,
            pointRecordId: null,
            inactiveToday: false
          });
        }
      }

      if (newTasks.length > 0) {
        await db.dailyTasks.bulkAdd(newTasks);
        addedCount = newTasks.length;
      }
    }

    if (syncedCount > 0 || inactivatedCount > 0 || reactivatedCount > 0 || addedCount > 0) {
      console.log(`[syncTodayUnsettled] ${date}: synced=${syncedCount} inactivated=${inactivatedCount} reactivated=${reactivatedCount} added=${addedCount}`);
    }

    return { syncedCount, inactivatedCount, reactivatedCount, addedCount };
  }

  async function getDailyTask(id) {
    return await db.dailyTasks.get(id);
  }

  /** 生成每日任务（幂等补齐模式 + 未结算任务同步）
   *  规则：
   *  - 已结算任务 (settled=true)：绝不修改，保留历史快照
   *  - 未结算任务 (settled!==true)：跟随 taskTemplates 同步展示字段
   *  - 模板已停用/删除的未结算任务：标记 inactiveToday，不删除 */
  async function generateDailyTasks(childId, date, dayOfWeek) {
    const weekday = (typeof dayOfWeek === 'number') ? dayOfWeek : Utils.getDayOfWeek(date);

    // 获取所有 active 模板（不仅仅是当天匹配的，因为停用模板也需要检测）
    const allActiveTemplates = await db.taskTemplates
      .where('active').equals(1)
      .toArray();

    const matchingTemplates = allActiveTemplates
      .filter(t => t.weekdays && t.weekdays.includes(weekday))
      .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));

    const existingTasks = await getDailyTasks(childId, date);

    const DEPRECATED_IDS = ['chineseStudy','chineseExercise','oralMath','mathKnowledge','mathExercise'];
    const validExistingTasks = existingTasks.filter(t => !DEPRECATED_IDS.includes(t.taskTemplateId));

    // ── 构建模板映射（所有 active 模板，用于检测停用）──
    const allTemplateMap = {};
    for (const t of allActiveTemplates) {
      allTemplateMap[t.id] = t;
    }

    // ── 同步未结算任务：从 taskTemplates 更新展示字段 ──
    // 模板字段 → dailyTask 字段映射
    const SYNC_FIELD_MAP = {
      name:              'taskName',
      icon:              'taskIcon',
      category:          'category',
      subCategory:       'subCategory',
      groupKey:          'groupKey',
      section:           'section',
      requiresDuration:  'requiresDuration',
      taskType:          'taskType',
      defaultPoints:     'plannedPoints',
      suggestedMinutes:  'suggestedMinutes',
      required:          'required',
      maxCountPerDay:    'maxCountPerDay',
      sortOrder:         'sortOrder'
    };

    for (const task of validExistingTasks) {
      if (task.settled === true) continue; // 已结算：绝对不修改

      const template = allTemplateMap[task.taskTemplateId];

      if (!template) {
        // 模板已停用或删除 → 标记 inactiveToday（不删除，保留数据）
        if (!task.inactiveToday) {
          await db.dailyTasks.update(task.id, { inactiveToday: true });
          task.inactiveToday = true;
        }
        continue;
      }

      // 清除可能之前标记的 inactiveToday
      if (task.inactiveToday) {
        await db.dailyTasks.update(task.id, { inactiveToday: false });
        task.inactiveToday = false;
      }

      // 检查各字段是否需要同步
      const syncData = {};
      let needsSync = false;

      for (const [templateField, taskField] of Object.entries(SYNC_FIELD_MAP)) {
        const templateVal = template[templateField];
        const taskVal = task[taskField];

        if (templateVal !== undefined && templateVal !== null && taskVal !== templateVal) {
          syncData[taskField] = templateVal;
          task[taskField] = templateVal; // 同步到内存
          needsSync = true;
        }
      }

      if (needsSync) {
        await db.dailyTasks.update(task.id, syncData);
        console.log(`[generateDailyTasks] 同步未结算任务 ${task.taskTemplateId}:`,
          Object.keys(syncData).join(', '));
      }
    }

    // ── 补齐缺失任务（只在没有任何已结算任务时才补齐）──
    const hasSettledTask = validExistingTasks.some(t => t.settled === true);
    if (hasSettledTask) {
      // 已结算日期：不再补齐新任务，但过滤掉 inactiveToday 和弃用任务
      const activeExisting = validExistingTasks.filter(t =>
        !DEPRECATED_IDS.includes(t.taskTemplateId) && !t.inactiveToday
      );
      return activeExisting;
    }

    if (matchingTemplates.length === 0) {
      console.warn(`[generateDailyTasks] 无匹配模板: weekday=${weekday}`);
      // 返回非弃用、非停用的已有任务
      return validExistingTasks.filter(t =>
        !DEPRECATED_IDS.includes(t.taskTemplateId) && !t.inactiveToday
      );
    }

    const existingTemplateIds = new Set(validExistingTasks.map(t => t.taskTemplateId));
    const missingTemplates = matchingTemplates.filter(t => !existingTemplateIds.has(t.id));

    const newTasks = missingTemplates.map(t => ({
      id: `${date}-${t.id}-${childId}`,
      childId: childId,
      date: date,
      taskTemplateId: t.id,
      taskName: t.name,
      taskIcon: t.icon,
      category: t.category,
      subCategory: t.subCategory,
      groupKey: t.groupKey || t.subCategory || 'other',
      section: t.section || null,
      requiresDuration: t.requiresDuration || (t.taskType === 'duration'),
      taskType: t.taskType,
      plannedPoints: t.defaultPoints,
      suggestedMinutes: t.suggestedMinutes,
      required: t.required,
      maxCountPerDay: t.maxCountPerDay,
      sortOrder: t.sortOrder,
      durationMinutes: null,
      rawPoints: null,
      cappedPoints: null,
      childChecked: false,
      childCheckTime: null,
      parentStatus: 'unreviewed',
      parentPoints: null,
      parentNote: '',
      settled: false,
      pointRecordId: null
    }));

    if (newTasks.length > 0) {
      await db.dailyTasks.bulkAdd(newTasks);
      console.log(`[generateDailyTasks] 补齐 ${newTasks.length} 个任务:`, newTasks.map(t => t.taskTemplateId));
    }

    // 返回时过滤 inactiveToday 和弃用任务
    return [...validExistingTasks.filter(t =>
      !DEPRECATED_IDS.includes(t.taskTemplateId) && !t.inactiveToday
    ), ...newTasks];
  }

  /** 获取指定日期范围内的 dailyTasks（按 date 升序） */
  async function getDailyTasksInRange(childId, startDate, endDate) {
    const all = await db.dailyTasks
      .where('childId').equals(childId)
      .toArray();
    return all
      .filter(t => t.date >= startDate && t.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // -- 英语能量统计 --

  /** 英语能量统计（只统计已结算且家长确认通过的任务）
   *  V1.2: 80小时循环晋级模型 + 长期累计（不受暑假范围限制）
   *  - 不传 startDate/endDate = 全部历史累计
   *  - 传 startDate/endDate = 指定范围统计（用于调试对比） */
  async function getEnglishEnergyStats(childId, startDate = null, endDate = null) {
    const ENGLISH_TASK_IDS = [
      'englishIntensive',
      'englishExtensive',
      'englishCartoon',
      'englishListening'
    ];

    const FALLBACK_MINUTES = {
      englishIntensive: 30,
      englishExtensive: 30,
      englishCartoon: 40
    };

    // ── 80小时循环晋级常量 ──
    const LEVEL_TARGET_MINUTES = 80 * 60; // 4800

    const allTasks = await db.dailyTasks
      .where('childId').equals(childId)
      .toArray();

    // 日期过滤：不传参数 = 全部历史累计
    let tasks = allTasks;
    if (startDate) {
      tasks = tasks.filter(t => t.date >= startDate);
    }
    if (endDate) {
      tasks = tasks.filter(t => t.date <= endDate);
    }

    // 只统计已结算且家长确认通过的英语任务
    const approvedTasks = tasks.filter(t =>
      t.settled === true
      && t.parentStatus === 'approved'
      && ENGLISH_TASK_IDS.includes(t.taskTemplateId)
    );

    let intensiveMinutes = 0;
    let extensiveMinutes = 0;
    let cartoonMinutes = 0;
    let listeningRawMinutes = 0;

    const byDateMap = {};

    for (const t of approvedTasks) {
      const d = t.date;
      if (!byDateMap[d]) {
        byDateMap[d] = {
          date: d,
          intensiveMinutes: 0,
          extensiveMinutes: 0,
          readingMinutes: 0,
          cartoonMinutes: 0,
          listeningRawMinutes: 0,
          listeningEffectiveMinutes: 0,
          effectiveTotalMinutes: 0
        };
      }

      if (t.taskTemplateId === 'englishIntensive') {
        const mins = t.suggestedMinutes || FALLBACK_MINUTES.englishIntensive;
        intensiveMinutes += mins;
        byDateMap[d].intensiveMinutes += mins;
      } else if (t.taskTemplateId === 'englishExtensive') {
        const mins = t.suggestedMinutes || FALLBACK_MINUTES.englishExtensive;
        extensiveMinutes += mins;
        byDateMap[d].extensiveMinutes += mins;
      } else if (t.taskTemplateId === 'englishCartoon') {
        const mins = t.suggestedMinutes || FALLBACK_MINUTES.englishCartoon;
        cartoonMinutes += mins;
        byDateMap[d].cartoonMinutes += mins;
      } else if (t.taskTemplateId === 'englishListening') {
        const mins = t.durationMinutes || 0;
        listeningRawMinutes += mins;
        byDateMap[d].listeningRawMinutes += mins;
      }
    }

    const readingMinutes = intensiveMinutes + extensiveMinutes;
    const listeningEffectiveMinutes = listeningRawMinutes * 0.5;
    const totalEffectiveMinutes = readingMinutes + cartoonMinutes + listeningEffectiveMinutes;

    // 组装 byDate 并计算派生字段
    const byDate = Object.values(byDateMap).sort((a, b) => a.date.localeCompare(b.date));
    for (const entry of byDate) {
      entry.readingMinutes = entry.intensiveMinutes + entry.extensiveMinutes;
      entry.listeningEffectiveMinutes = entry.listeningRawMinutes * 0.5;
      entry.effectiveTotalMinutes = entry.readingMinutes + entry.cartoonMinutes + entry.listeningEffectiveMinutes;
    }

    // ── 80小时循环晋级模型 ──
    const completedLevels = Math.floor(totalEffectiveMinutes / LEVEL_TARGET_MINUTES);
    const currentLevel = completedLevels + 1;
    const currentLevelStartMinutes = completedLevels * LEVEL_TARGET_MINUTES;
    const currentLevelProgressMinutes = totalEffectiveMinutes - currentLevelStartMinutes;
    const currentLevelProgressHours = currentLevelProgressMinutes / 60;
    const currentLevelProgressPercent = Math.min(100, Math.round((currentLevelProgressMinutes / LEVEL_TARGET_MINUTES) * 100));
    const remainingToNextLevelMinutes = LEVEL_TARGET_MINUTES - currentLevelProgressMinutes;
    const remainingToNextLevelHours = remainingToNextLevelMinutes / 60;
    const nextLevel = currentLevel + 1;
    const justLeveledUp = currentLevelProgressMinutes === 0 && totalEffectiveMinutes > 0;

    // ── 最近7天速度（不受暑假范围限制，按 appDate 往前7天）──
    const config = await db.appConfig.get('singleton');
    const todayAppDate = (typeof Utils !== 'undefined')
      ? Utils.getAppDate(new Date(), config?.dayCutoffHour || 4)
      : new Date().toISOString().substring(0, 10);

    // 从 todayAppDate 往前包含今天，共7天
    const recent7Start = (() => {
      const d = new Date(todayAppDate);
      d.setDate(d.getDate() - 6);
      return d.toISOString().substring(0, 10);
    })();

    const recent7Entries = byDate.filter(e => e.date >= recent7Start && e.date <= todayAppDate);
    const recent7DaysEffectiveMinutes = recent7Entries.reduce((sum, e) => sum + e.effectiveTotalMinutes, 0);
    const recent7DaysAverageMinutes = recent7DaysEffectiveMinutes / 7;

    // ── 预计晋级天数（预测下一阶段，使用 remainingToNextLevelMinutes）──
    let estimatedDaysToNextLevel;
    if (remainingToNextLevelMinutes <= 0) {
      estimatedDaysToNextLevel = 0;
    } else if (recent7DaysAverageMinutes > 0) {
      estimatedDaysToNextLevel = Math.ceil(remainingToNextLevelMinutes / recent7DaysAverageMinutes);
    } else {
      estimatedDaysToNextLevel = null;
    }

    return {
      startDate: startDate || null,
      endDate: endDate || null,

      // ═══ 80小时循环晋级模型 ═══
      levelTargetMinutes: LEVEL_TARGET_MINUTES,
      levelTargetHours: 80,

      totalEffectiveMinutes,
      totalEffectiveHours: totalEffectiveMinutes / 60,

      completedLevels,
      currentLevel,
      nextLevel,

      currentLevelProgressMinutes,
      currentLevelProgressHours,
      currentLevelProgressPercent,

      remainingToNextLevelMinutes,
      remainingToNextLevelHours,

      justLeveledUp,

      // ═══ 向后兼容字段（现在指向当前阶段） ═══
      targetMinutes: LEVEL_TARGET_MINUTES,
      effectiveTotalMinutes: totalEffectiveMinutes,
      effectiveTotalHours: totalEffectiveMinutes / 60,
      progressPercent: currentLevelProgressPercent,
      remainingMinutes: remainingToNextLevelMinutes,
      remainingHours: remainingToNextLevelHours,

      // ═══ 最近7天 & 预测 ═══
      recent7DaysEffectiveMinutes,
      recent7DaysAverageMinutes,
      estimatedDaysToNextLevel,

      // ═══ 三类占比 ═══
      readingMinutes,
      readingHours: readingMinutes / 60,

      cartoonMinutes,
      cartoonHours: cartoonMinutes / 60,

      listeningRawMinutes,
      listeningRawHours: listeningRawMinutes / 60,
      listeningEffectiveMinutes,
      listeningEffectiveHours: listeningEffectiveMinutes / 60,

      byDate
    };
  }

  // -- 暑假成长统计 --

  /** 暑假成长统计：返回暑假周期的进度卡片数据 */
  async function getSummerGrowthStats(childId) {
    const { startDate, endDate, totalDays } = SUMMER_PLAN;

    const config = await db.appConfig.get('singleton');
    const todayAppDate = (typeof Utils !== 'undefined')
      ? Utils.getAppDate(new Date(), config?.dayCutoffHour || 4)
      : new Date().toISOString().substring(0, 10);

    // 已经过了 X 天
    let elapsedDays;
    if (todayAppDate < startDate) {
      elapsedDays = 0;
    } else if (todayAppDate > endDate) {
      elapsedDays = totalDays;
    } else {
      // startDate 到 todayAppDate 的包含天数
      elapsedDays = Utils.diffDays(startDate, todayAppDate) + 1;
    }

    // 还剩 X 天（不允许负数）
    const remainingDays = Math.max(0, totalDays - elapsedDays);

    // 获取暑假范围内的 dailySummaries
    const summaries = await getSummariesInRange(childId, startDate, endDate);

    // 已确认打卡 X 天：有 dailySummary 即视为已打卡（不再依赖 totalEarnedPoints > 0）
    const checkedDays = summaries.length;

    // 有效学习日 X 天：isEffectiveDay === true
    const effectiveDays = summaries.filter(s => s.isEffectiveDay === true).length;

    // summariesByDate
    const summariesByDate = {};
    for (const s of summaries) {
      summariesByDate[s.date] = s;
    }

    return {
      startDate,
      endDate,
      totalDays,
      elapsedDays,
      remainingDays,
      checkedDays,
      effectiveDays,
      summariesByDate
    };
  }

  // -- dailySummaries --
  async function getDailySummary(childId, date) {
    return await db.dailySummaries.get(`${date}-${childId}`);
  }

  async function getAllSummaries(childId) {
    return await db.dailySummaries
      .where('childId').equals(childId)
      .toArray();
  }

  /** 获取指定日期范围内的 dailySummaries（按 date 升序） */
  async function getSummariesInRange(childId, startDate, endDate) {
    const all = await db.dailySummaries
      .where('childId').equals(childId)
      .toArray();
    return all
      .filter(s => s.date >= startDate && s.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // -- pointRecords --
  async function getPointRecords(childId, limit = 50) {
    return await db.pointRecords
      .where('childId').equals(childId)
      .reverse()
      .sortBy('time');
  }

  async function addPointRecord(record) {
    return await db.pointRecords.add(record);
  }

  // -- rewards --
  async function getAllRewards() {
    return await db.rewards.orderBy('sortOrder').toArray();
  }

  async function getActiveRewards() {
    return await db.rewards
      .where('active').equals(1)
      .sortBy('sortOrder');
  }

  /** 获取孩子端可见奖励，统一使用货架规则 */
  async function getChildVisibleRewards() {
    const all = await db.rewards.toArray();
    return all
      .filter(r => Rules.isChildStorefrontReward(r))
      .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
  }

  /** 获取指定 displaySection 的孩子可见奖励（最多 maxCount 个），统一使用货架规则 */
  async function getChildSectionRewards(section, maxCount = 5) {
    const all = await db.rewards.toArray();
    const filtered = all
      .filter(r => Rules.isChildStorefrontReward(r) && r.displaySection === section)
      .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
    return filtered.slice(0, maxCount);
  }

  async function getReward(id) {
    return await db.rewards.get(id);
  }

  // -- redeemRecords --
  /** 获取某孩子的全部兑换记录（含 pending / fulfilled / cancelled） */
  async function getRedeemRecords(childId) {
    if (!childId) {
      console.warn('[getRedeemRecords] childId 为空');
      return [];
    }
    try {
      const all = await db.redeemRecords.toArray();
      const records = all.filter(r => r.childId === childId);
      // 按时间/兑换时间倒序（最新在前）
      records.sort((a, b) => {
        const ta = a.redeemedAt || a.time || '';
        const tb = b.redeemedAt || b.time || '';
        return tb.localeCompare(ta);
      });
      return records;
    } catch (e) {
      console.error('[getRedeemRecords] 查询失败:', e);
      return [];
    }
  }

  /** 获取待处理兑换记录（我的券包）
   *  返回 requested + pending 状态的记录
   *  不依赖 reward.active / visibleToChild / displaySection / fulfillmentType */
  async function getPendingRedeemRecords(childId) {
    if (!childId) {
      console.warn('[getPendingRedeemRecords] childId 为空');
      return [];
    }
    try {
      // 先取全量再 JS 过滤，避免 Dexie compound index 边缘情况
      const all = await db.redeemRecords.toArray();
      const open = all.filter(r =>
        r.childId === childId && (r.status === 'requested' || r.status === 'pending')
      );
      // 按兑换时间倒序（最新在前）
      open.sort((a, b) => {
        const ta = a.requestedAt || a.redeemedAt || a.time || '';
        const tb = b.requestedAt || b.redeemedAt || b.time || '';
        return tb.localeCompare(ta);
      });
      return open;
    } catch (e) {
      console.error('[getPendingRedeemRecords] 查询失败:', e);
      return [];
    }
  }

  /** 获取孩子端券包应显示的兑换记录（requested + pending）
   *  getOpenRedeemRecords 是 getPendingRedeemRecords 的别名，语义更清晰 */
  async function getOpenRedeemRecords(childId) {
    return await getPendingRedeemRecords(childId);
  }

  /** 统计某个时间段内某个 tier 的兑换次数（不含 cancelled），使用 appDate */
  async function countRedeemsInPeriod(childId, tier, periodStart, periodEnd) {
    const records = await db.redeemRecords
      .where('childId').equals(childId)
      .filter(r => r.tier === tier && (r.status === 'pending' || r.status === 'fulfilled'))
      .toArray();
    return records.filter(r => {
      const d = r.appDate || (r.redeemedAt || r.time || '').substring(0, 10);
      return d >= periodStart && d <= periodEnd;
    }).length;
  }

  /** 统计 reward 自身限制在周期内的兑换次数，使用 appDate */
  async function countRewardRedeemsInPeriod(childId, rewardId, periodStart, periodEnd) {
    const records = await db.redeemRecords
      .where('childId').equals(childId)
      .filter(r => r.rewardId === rewardId && (r.status === 'pending' || r.status === 'fulfilled'))
      .toArray();
    return records.filter(r => {
      const d = r.appDate || (r.redeemedAt || r.time || '').substring(0, 10);
      return d >= periodStart && d <= periodEnd;
    }).length;
  }

  /** 统计当天屏幕类兑换次数（pending + fulfilled），使用 appDate */
  async function countScreenRedeemsToday(childId, appDate) {
    const records = await db.redeemRecords
      .where('childId').equals(childId)
      .filter(r => (r.status === 'pending' || r.status === 'fulfilled'))
      .toArray();
    return records.filter(r => {
      const recordAppDate = r.appDate || (r.redeemedAt || r.time || '').substring(0, 10);
      return recordAppDate === appDate && r.categorySnapshot === 'screen';
    }).length;
  }

  // ─── 事务方法：申请 / 确认 / 取消 / 兑现 ───

  /**
   * 孩子申请兑换（只创建申请，不扣分）
   * @param {string} childId
   * @param {string} rewardId
   * @returns {object} { redeemId }
   */
  async function requestRedeem(childId, rewardId) {
    const now = Utils.nowISO();
    const config = await getAppConfig();
    const dayCutoffHour = config?.dayCutoffHour ?? 4;
    const appDate = Utils.getAppDate(new Date(), dayCutoffHour);

    // 在事务外预检余额（事务内没有 db.pointRecords 权限）
    const balance = await calcCurrentBalance(childId);

    return db.transaction('rw',
      db.rewards, db.redeemRecords, db.child,
      async () => {
        // 1. 读取 child
        const child = await db.child.get(childId);
        if (!child) throw new Error('孩子不存在');

        // 2. 读取 reward
        const reward = await db.rewards.get(rewardId);
        if (!reward) throw new Error('奖励不存在');

        // 3. 确认 reward 仍是孩子端可兑换商品
        if (typeof Rules !== 'undefined' && Rules.isChildStorefrontReward) {
          if (!Rules.isChildStorefrontReward(reward)) {
            throw new Error('该奖励当前不可兑换');
          }
        } else {
          if (!reward.active || !reward.visibleToChild || reward.displaySection === 'hidden') {
            throw new Error('该奖励当前不可兑换');
          }
        }

        // 4. 检查余额（事务外已预检）
        if (balance < reward.cost) {
          throw new Error(`积分不足（当前 ${balance}，需要 ${reward.cost}）`);
        }

        // 5. 检查是否已存在同 reward 的 requested / pending，避免重复申请
        const existingOpen = await db.redeemRecords
          .where('childId').equals(childId)
          .filter(r => r.rewardId === rewardId && (r.status === 'requested' || r.status === 'pending'))
          .toArray();
        if (existingOpen.length > 0) {
          throw new Error('该奖励已有待处理申请，请等待家长确认');
        }

        // 6. 生成 redeemId（不创建 pointRecord）
        const redeemId = Utils.genId('redeem');

        // 7. 创建 redeemRecord（status=requested，不扣分）
        await db.redeemRecords.add({
          id: redeemId,
          childId,
          rewardId: reward.id,
          rewardName: reward.name,
          rewardIcon: reward.icon || '🎁',
          cost: reward.cost,
          tier: reward.tier,

          status: 'requested',

          pointRecordId: null,
          refundPointRecordId: null,

          requestedAt: now,
          confirmedAt: null,
          redeemedAt: null,
          appDate,

          fulfilledAt: null,
          cancelledAt: null,

          rewardNameSnapshot: reward.name,
          costSnapshot: reward.cost,
          categorySnapshot: reward.category || 'physical',
          fulfillmentTypeSnapshot: reward.fulfillmentType || 'voucher',
          childDescriptionSnapshot: reward.childDescription || '',
          parentNoteSnapshot: reward.parentNote || '',
          scheduledFor: null,

          time: now
        });

        console.log(`[RequestRedeem] 申请兑换: ${reward.name}, redeemId=${redeemId}, status=requested, appDate=${appDate}`);
        return { redeemId };
      });
  }

  /**
   * 家长确认兑换（requested → pending，此时才扣分）
   * @param {string} redeemId
   * @returns {object} { pointRecordId, newBalance }
   */
  async function confirmRedeem(redeemId) {
    const now = Utils.nowISO();
    const config = await getAppConfig();
    const dayCutoffHour = config?.dayCutoffHour ?? 4;
    const appDate = Utils.getAppDate(new Date(), dayCutoffHour);
    const date = Utils.getToday(dayCutoffHour);
    const weekStart = Utils.getWeekStart(date);
    const monthStart = Utils.getMonthStart(date);
    const rulesConfig = await db.rulesConfig.get('singleton');
    const limits = rulesConfig?.redemption?.limits;

    return db.transaction('rw',
      db.redeemRecords, db.pointRecords, db.child, db.rewards,
      async () => {
        // 1. 读取 redeemRecord
        const record = await db.redeemRecords.get(redeemId);
        if (!record) throw new Error('兑换记录不存在');

        // 2. 确认 status === "requested"
        if (record.status !== 'requested') {
          throw new Error(`只能确认 requested 状态的兑换，当前状态: ${record.status}`);
        }

        const childId = record.childId;
        const cost = record.costSnapshot ?? record.cost ?? 0;

        // 3. 读取 child
        const child = await db.child.get(childId);
        if (!child) throw new Error('孩子不存在');

        // 4. 尝试读取 reward（可能已下架，用快照兜底）
        const reward = record.rewardId ? await db.rewards.get(record.rewardId) : null;

        // 5. 计算当前余额
        const balance = await calcCurrentBalance(childId);
        if (balance < cost) {
          throw new Error(`积分不足（当前 ${balance}，需要 ${cost}）`);
        }

        // 6. Tier 限制（pending + fulfilled 计数，requested 不计数）
        if (limits) {
          const tierLimit = limits[record.tier];
          if (tierLimit && tierLimit.period !== 'none' && tierLimit.count > 0) {
            let ps, pe;
            if (tierLimit.period === 'day') { ps = date; pe = date; }
            else if (tierLimit.period === 'week') { ps = weekStart; pe = date; }
            else if (tierLimit.period === 'month') { ps = monthStart; pe = date; }
            const tierCount = await countRedeemsInPeriodTx(childId, record.tier, ps, pe);
            if (tierCount >= tierLimit.count) {
              const pn = { day: '今天', week: '本周', month: '本月' };
              throw new Error(`${pn[tierLimit.period]}已兑换 ${tierCount}/${tierLimit.count} 次`);
            }
          }
        }

        // 7. Reward 自身限制（使用快照中的 rewardId）
        if (record.rewardId) {
          const rwdCountDay = await countRewardRedeemsInPeriodTx(childId, record.rewardId, date, date);
          if (reward && reward.dailyLimit !== null && reward.dailyLimit !== undefined && rwdCountDay >= reward.dailyLimit) {
            throw new Error(`今天该奖励已兑换 ${rwdCountDay}/${reward.dailyLimit} 次`);
          }
          const rwdCountWeek = await countRewardRedeemsInPeriodTx(childId, record.rewardId, weekStart, date);
          if (reward && reward.weeklyLimit !== null && reward.weeklyLimit !== undefined && rwdCountWeek >= reward.weeklyLimit) {
            throw new Error(`本周该奖励已兑换 ${rwdCountWeek}/${reward.weeklyLimit} 次`);
          }
          const rwdCountMonth = await countRewardRedeemsInPeriodTx(childId, record.rewardId, monthStart, date);
          if (reward && reward.monthlyLimit !== null && reward.monthlyLimit !== undefined && rwdCountMonth >= reward.monthlyLimit) {
            throw new Error(`本月该奖励已兑换 ${rwdCountMonth}/${reward.monthlyLimit} 次`);
          }
        }

        // 8. Screen 全局限制
        if (record.categorySnapshot === 'screen') {
          const screenCount = await countScreenRedeemsTodayTx(childId, appDate);
          if (screenCount >= 1) {
            throw new Error('今天已确认过屏幕类奖励，每天限 1 次');
          }
        }

        // 9. 创建 pointRecord（扣分）
        const pointRecordId = Utils.genId('txn');
        const newBalance = balance - cost;

        await db.pointRecords.add({
          id: pointRecordId,
          childId,
          time: now,
          type: 'redeem',
          source: `确认兑换-${record.rewardNameSnapshot || ''}`,
          points: -cost,
          balance: newBalance,
          date: appDate,
          relatedDailyTaskId: null,
          relatedRedeemId: redeemId,
          relatedLotteryId: null,
          operator: 'parent'
        });

        // 10. 更新 redeemRecord（requested → pending）
        await db.redeemRecords.update(redeemId, {
          status: 'pending',
          pointRecordId,
          confirmedAt: now,
          redeemedAt: now,
          appDate
        });

        // 11. 同步 child 余额（不增加 lifetimeEarnedPoints）
        const lifetime = await calcLifetimePoints(childId);
        await db.child.update(childId, {
          currentBalance: newBalance,
          lifetimeEarnedPoints: lifetime
        });

        console.log(`[ConfirmRedeem] 确认兑换: redeemId=${redeemId}, cost=${cost}, balance ${balance}→${newBalance}`);
        return { redeemId, pointRecordId, newBalance };
      });
  }

  /**
   * 取消兑换（区分 requested 和 pending）
   * - requested: 直接取消，不退款（还没扣分）
   * - pending: 退款 + 取消
   * @param {string} redeemId
   * @returns {object} { refundPointRecordId, returnedPoints }
   */
  async function cancelRedeem(redeemId) {
    const now = Utils.nowISO();
    const config = await getAppConfig();
    const dayCutoffHour = config?.dayCutoffHour ?? 4;
    const appDate = Utils.getAppDate(new Date(), dayCutoffHour);

    return db.transaction('rw',
      db.redeemRecords, db.pointRecords, db.child,
      async () => {
        // 1. 读取 redeemRecord
        const record = await db.redeemRecords.get(redeemId);
        if (!record) throw new Error('兑换记录不存在');

        // 2. 确认状态是 requested 或 pending
        if (record.status !== 'requested' && record.status !== 'pending') {
          throw new Error(`只能取消 requested/pending 状态的兑换，当前状态: ${record.status}`);
        }

        const cost = record.costSnapshot ?? record.cost ?? 0;
        const childId = record.childId;

        // ── A. status=requested：还没扣分，直接取消 ──
        if (record.status === 'requested') {
          await db.redeemRecords.update(redeemId, {
            status: 'cancelled',
            cancelledAt: now,
            refundPointRecordId: null
          });

          console.log(`[Cancel] 取消申请 (requested, 未扣分): redeemId=${redeemId}`);
          return { refundPointRecordId: null, returnedPoints: 0 };
        }

        // ── B. status=pending：已扣分，退款 + 取消 ──

        // 3. 确认 refundPointRecordId 为空（防止重复退款）
        if (record.refundPointRecordId) {
          throw new Error('该兑换已退款，不可重复取消');
        }

        // 4. 计算新余额
        const balance = await calcCurrentBalance(childId);
        const newBalance = balance + cost;
        const refundPointRecordId = Utils.genId('txn');

        // 5. 创建 refund pointRecord
        await db.pointRecords.add({
          id: refundPointRecordId,
          childId,
          time: now,
          type: 'refund',
          source: `取消兑换-${record.rewardNameSnapshot || record.rewardName || ''}`,
          points: cost,
          balance: newBalance,
          date: appDate,
          relatedDailyTaskId: null,
          relatedRedeemId: redeemId,
          relatedLotteryId: null,
          operator: 'parent'
        });

        // 6. 更新 redeemRecord
        await db.redeemRecords.update(redeemId, {
          status: 'cancelled',
          cancelledAt: now,
          refundPointRecordId
        });

        // 7. 同步 child 余额（不增加 lifetimeEarnedPoints）
        const lifetime = await calcLifetimePoints(childId);
        await db.child.update(childId, {
          currentBalance: newBalance,
          lifetimeEarnedPoints: lifetime
        });

        console.log(`[Cancel] 取消兑换 (pending, 退款 ${cost} 分): redeemId=${redeemId}, balance ${balance}→${newBalance}`);
        return { refundPointRecordId, returnedPoints: cost, newBalance };
      });
  }

  /**
   * 兑现兑换（Dexie transaction，不新增 pointRecord，不影响 balance）
   * @param {string} redeemId
   * @returns {object} { fulfilledAt }
   */
  async function fulfillRedeem(redeemId) {
    const now = Utils.nowISO();

    return db.transaction('rw',
      db.redeemRecords,
      async () => {
        // 1. 读取 redeemRecord
        const record = await db.redeemRecords.get(redeemId);
        if (!record) throw new Error('兑换记录不存在');

        // 2. 确认 status === "pending"
        if (record.status !== 'pending') {
          throw new Error(`只能兑现 pending 状态的兑换，当前状态: ${record.status}`);
        }

        // 3. 标记 fulfilled（不新增 pointRecord，不影响 currentBalance，不影响 lifetimeEarnedPoints）
        await db.redeemRecords.update(redeemId, {
          status: 'fulfilled',
          fulfilledAt: now,
          usedAt: now
        });

        console.log(`[Fulfill] 兑现: redeemId=${redeemId}`);
        return { fulfilledAt: now };
      });
  }

  // ─── 事务内计数辅助函数（与外部同名函数使用 appDate 兼容逻辑）───

  async function countRedeemsInPeriodTx(childId, tier, periodStart, periodEnd) {
    const records = await db.redeemRecords
      .where('childId').equals(childId)
      .filter(r => r.tier === tier && (r.status === 'pending' || r.status === 'fulfilled'))
      .toArray();
    return records.filter(r => {
      const d = r.appDate || (r.redeemedAt || r.time || '').substring(0, 10);
      return d >= periodStart && d <= periodEnd;
    }).length;
  }

  async function countRewardRedeemsInPeriodTx(childId, rewardId, periodStart, periodEnd) {
    const records = await db.redeemRecords
      .where('childId').equals(childId)
      .filter(r => r.rewardId === rewardId && (r.status === 'pending' || r.status === 'fulfilled'))
      .toArray();
    return records.filter(r => {
      const d = r.appDate || (r.redeemedAt || r.time || '').substring(0, 10);
      return d >= periodStart && d <= periodEnd;
    }).length;
  }

  async function countScreenRedeemsTodayTx(childId, appDate) {
    const records = await db.redeemRecords
      .where('childId').equals(childId)
      .filter(r => (r.status === 'pending' || r.status === 'fulfilled'))
      .toArray();
    return records.filter(r => {
      const recordAppDate = r.appDate || (r.redeemedAt || r.time || '').substring(0, 10);
      return recordAppDate === appDate && r.categorySnapshot === 'screen';
    }).length;
  }

  // -- streak --
  async function getStreak(childId) {
    return await db.streak.get(childId);
  }

  async function upsertStreak(data) {
    const existing = await db.streak.get(data.childId);
    if (existing) {
      return await db.streak.update(data.childId, { ...data, lastUpdatedAt: Utils.nowISO() });
    } else {
      return await db.streak.add({ id: data.childId, ...data, lastUpdatedAt: Utils.nowISO() });
    }
  }

  // -- streakAwardRecords --
  async function getStreakAward(childId, streakPeriodStart, milestone) {
    const id = `${childId}-${streakPeriodStart}-${milestone}`;
    return await db.streakAwardRecords.get(id);
  }

  async function addStreakAward(record) {
    return await db.streakAwardRecords.add(record);
  }

  // -- protectionCardRecords --
  async function getProtectionCardBalance(childId) {
    const records = await db.protectionCardRecords
      .where('childId').equals(childId)
      .toArray();
    return records.reduce((sum, r) => sum + r.cards, 0);
  }

  // -- videoListItems --
  /** 获取全部视频名单（按 sortOrder 排序） */
  async function getVideoListItems() {
    const items = await db.videoListItems.toArray();
    items.sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
    return items;
  }

  /** 按类型获取视频名单 */
  async function getVideoListItemsByType(listType) {
    const items = await db.videoListItems
      .where('listType').equals(listType)
      .toArray();
    items.sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
    return items;
  }

  /** 新增视频名单条目 */
  async function addVideoListItem(item) {
    const now = Utils.nowISO();
    const newItem = {
      ...item,
      id: item.id || Utils.genId('vlist'),
      active: item.active !== undefined ? item.active : 1,
      sortOrder: item.sortOrder || await getNextVideoListSortOrder(item.listType),
      createdAt: now,
      updatedAt: now
    };
    await db.videoListItems.add(newItem);
    return newItem;
  }

  /** 获取指定 listType 的下一个 sortOrder */
  async function getNextVideoListSortOrder(listType) {
    const items = await db.videoListItems
      .where('listType').equals(listType)
      .toArray();
    if (items.length === 0) return 10;
    const maxSort = Math.max(...items.map(i => i.sortOrder || 0));
    return Math.ceil((maxSort + 10) / 10) * 10;
  }

  /** 更新视频名单条目 */
  async function updateVideoListItem(id, patch) {
    patch.updatedAt = Utils.nowISO();
    return await db.videoListItems.update(id, patch);
  }

  /** 删除视频名单条目 */
  async function deleteVideoListItem(id) {
    return await db.videoListItems.delete(id);
  }

  // -- appConfig --
  async function getAppConfig() {
    return await db.appConfig.get('singleton');
  }

  async function updateAppConfig(changes) {
    return await db.appConfig.update('singleton', changes);
  }

  // -- 批量导入 --
  async function bulkImport(tableName, items) {
    if (!items || items.length === 0) return;
    await db.table(tableName).bulkAdd(items);
  }

  /** 导入后标准化 reward 字段（用于备份导入） */
  function normalizeRewardForImport(reward) {
    const ds = reward.displaySection || 'hidden';
    return {
      ...reward,
      category: reward.category || 'physical',
      visibleToChild: ds === 'hidden' ? 0 : (reward.visibleToChild ?? (reward.active ? 1 : 0)),
      displaySection: ds,
      riskLevel: reward.riskLevel || 'low',
      requiresParentApproval: reward.requiresParentApproval ?? true,
      fulfillmentType: reward.fulfillmentType || 'voucher',
      dailyLimit: reward.dailyLimit ?? null,
      weeklyLimit: reward.weeklyLimit ?? null,
      monthlyLimit: reward.monthlyLimit ?? null,
      parentNote: reward.parentNote || '',
      childDescription: reward.childDescription || reward.name || ''
    };
  }

  /** 导入后标准化 redeemRecord 字段（用于备份导入） */
  function normalizeRedeemRecordForImport(record) {
    return {
      ...record,
      redeemedAt: record.redeemedAt || record.time || null,
      fulfilledAt: record.fulfilledAt || record.fulfilledTime || null,
      cancelledAt: record.cancelledAt || record.cancelledTime || null,
      rewardNameSnapshot: record.rewardNameSnapshot || record.rewardName || '',
      costSnapshot: record.costSnapshot ?? record.cost ?? 0,
      categorySnapshot: record.categorySnapshot || 'physical',
      fulfillmentTypeSnapshot: record.fulfillmentTypeSnapshot || 'voucher',
      childDescriptionSnapshot: record.childDescriptionSnapshot || record.rewardName || '',
      parentNoteSnapshot: record.parentNoteSnapshot || record.parentNote || '',
      pointRecordId: record.pointRecordId || null,
      refundPointRecordId: record.refundPointRecordId || null,
      scheduledFor: record.scheduledFor || null
    };
  }

  // ─── V6: 家长成长评分 ───

  /** 获取某天某孩子的家长评分 */
  async function getParentScore(childId, date) {
    return await db.parentScores.get(`pscore-${date}-${childId}`);
  }

  /** 获取日期范围内的家长评分（按日期升序） */
  async function getParentScoresInRange(childId, startDate, endDate) {
    const all = await db.parentScores
      .where('childId').equals(childId)
      .toArray();
    return all
      .filter(r => r.date >= startDate && r.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** 获取所有家长评分（用于计算连续天数） */
  async function getAllParentScores(childId) {
    return await db.parentScores
      .where('childId').equals(childId)
      .toArray();
  }

  /** 幂等保存家长评分 */
  async function upsertParentScore(data) {
    const id = `pscore-${data.date}-${data.childId}`;
    const existing = await db.parentScores.get(id);
    if (existing) {
      await db.parentScores.update(id, { ...data, id });
      return id;
    } else {
      data.id = id;
      data.createdAt = data.createdAt || Utils.nowISO();
      await db.parentScores.add(data);
      return id;
    }
  }

  // ─── V7: 今日鼓励信 ───

  /** 幂等保存鼓励信（同一天同一孩子覆盖旧信） */
  async function upsertParentLetter(data) {
    const id = `pletter-${data.childId}-${data.date}`;
    const now = Utils.nowISO();
    const content = (data.content || '').trim();

    if (!content || content.length === 0) {
      throw new Error('鼓励信内容不能为空');
    }
    if (content.length > 120) {
      throw new Error(`鼓励信最多120字，当前${content.length}字`);
    }

    const existing = await db.parentLetters.get(id);
    const record = {
      id,
      childId: data.childId,
      date: data.date,
      content: content,
      templateId: data.templateId || null,
      authorName: data.authorName || '爸爸妈妈',
      readStatus: existing ? existing.readStatus : 'unread',
      readAt: existing ? existing.readAt : null,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    if (existing) {
      await db.parentLetters.update(id, record);
    } else {
      await db.parentLetters.add(record);
    }
    return id;
  }

  /** 获取某天某孩子的鼓励信 */
  async function getParentLetter(childId, date) {
    const id = `pletter-${childId}-${date}`;
    return await db.parentLetters.get(id) || null;
  }

  /** 获取某天某孩子的未读鼓励信 */
  async function getUnreadParentLetter(childId, date) {
    const letter = await getParentLetter(childId, date);
    if (letter && letter.readStatus === 'unread') return letter;
    return null;
  }

  /** 标记鼓励信为已读 */
  async function markParentLetterRead(childId, date) {
    const id = `pletter-${childId}-${date}`;
    const existing = await db.parentLetters.get(id);
    if (!existing) return null;
    await db.parentLetters.update(id, {
      readStatus: 'read',
      readAt: Utils.nowISO(),
      updatedAt: Utils.nowISO()
    });
    return id;
  }

  // ─── 公开 API ───
  return {
    db,
    // 常量
    SUMMER_PLAN,
    // 默认数据
    DEFAULT_RULES_CONFIG,
    DEFAULT_TASK_TEMPLATES,
    DEFAULT_REWARDS,
    DEFAULT_LOTTERY_CONFIG,
    // 初始化
    initDefaults,
    resetAll,
    migrateToV3,
    migrateRewardsV3,
    migrateRedeemRecordsV3,
    ensureRewardsV31Complete,
    enforceDefaultStorefrontV31,
    // 标准化
    normalizeRewardForImport,
    normalizeRedeemRecordForImport,
    // 查询
    getRulesConfig,
    updateRulesConfig,
    getChild,
    getActiveChild,
    updateChild,
    calcCurrentBalance,
    calcLifetimePoints,
    syncChildBalance,
    getActiveTemplates,
    getAllTemplates,
    getDailyTasks,
    getDailyTask,
    generateDailyTasks,
    syncTodayUnsettledDailyTasksFromTemplates,
    getDailySummary,
    getAllSummaries,
    getSummariesInRange,
    getDailyTasksInRange,
    getEnglishEnergyStats,
    getSummerGrowthStats,
    getPointRecords,
    addPointRecord,
    getAllRewards,
    getActiveRewards,
    getChildVisibleRewards,
    getChildSectionRewards,
    getReward,
    getRedeemRecords,
    getPendingRedeemRecords,
    getOpenRedeemRecords,
    countRedeemsInPeriod,
    countRewardRedeemsInPeriod,
    countScreenRedeemsToday,
    // 事务方法
    requestRedeem,
    confirmRedeem,
    cancelRedeem,
    fulfillRedeem,
    getStreak,
    upsertStreak,
    getStreakAward,
    addStreakAward,
    getProtectionCardBalance,
    getAppConfig,
    updateAppConfig,
    bulkImport,
    ensureTaskTemplatesComplete,
    ensureRulesConfig,
    // 视频名单
    getVideoListItems,
    getVideoListItemsByType,
    addVideoListItem,
    updateVideoListItem,
    deleteVideoListItem,
    DEFAULT_VIDEO_LIST_ITEMS,
    // 家长成长评分 V6
    getParentScore,
    getParentScoresInRange,
    getAllParentScores,
    upsertParentScore,
    // 今日鼓励信 V7
    upsertParentLetter,
    getParentLetter,
    getUnreadParentLetter,
    markParentLetterRead
  };

})();
