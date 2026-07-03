// src/rules.js – rulesConfig 驱动引擎
// 暑假任务打卡积分系统 V2
// 所有规则计算函数：熏听积分、有效学习日判定、积分封顶、连续里程碑

const Rules = (() => {

  // ─── 熏听积分计算 ───

  /**
   * 根据熏听分钟数计算积分
   * @param {number} minutes - 熏听分钟数
   * @param {Array} listeningRules - rulesConfig.listeningRules
   * @param {number} cap - rulesConfig.caps.listeningCap
   * @returns {{raw: number, capped: number}}
   */
  function calcListeningPoints(minutes, listeningRules, cap) {
    if (!minutes || minutes <= 0) return { raw: 0, capped: 0 };

    let points = 0;

    // 按区间匹配
    for (const rule of listeningRules) {
      if (minutes >= rule.minMinutes && minutes <= rule.maxMinutes) {
        points = rule.points;
        break;
      }
    }

    // 超过最大区间，取最大值
    if (points === 0 && listeningRules.length > 0) {
      const lastRule = listeningRules[listeningRules.length - 1];
      if (minutes > lastRule.maxMinutes) {
        points = lastRule.points;
      }
    }

    return {
      raw: points,
      capped: Math.min(points, cap)
    };
  }

  // ─── 有效学习日判定 ───

  /**
   * 判定当天是否为有效学习日（任务组合判定）
   * @param {string[]} approvedTaskIds - 家长确认通过的任务 templateId 列表
   * @param {object} effectiveDayRules - rulesConfig.effectiveDayRules
   * @returns {{effective: boolean, reason: string|null}}
   */
  function isEffectiveDay(approvedTaskIds, effectiveDayRules) {
    if (!effectiveDayRules || effectiveDayRules.mode !== 'taskCombination') {
      return { effective: false, reason: null };
    }

    const has = (id) => approvedTaskIds.includes(id);
    const hasAnyMorning = () => has('chineseMorningRead') || has('englishMorningRead');

    for (const combo of effectiveDayRules.validCombinations) {
      const allMatch = combo.every(id => {
        if (id === 'anyMorningRead') return hasAnyMorning();
        return has(id);
      });

      if (allMatch) {
        return { effective: true, reason: 'valid' };
      }
    }

    return { effective: false, reason: null };
  }

  // ─── 积分汇总（原封顶函数，现已取消封顶）───

  /**
   * 积分封顶已取消 — 家长确认后的最终积分等于所有 approved 任务积分的真实合计。
   * 保留此函数签名以兼容调用方，但不再执行任何封顶或比例压缩。
   * @param {number} studyPoints - 学习积分（含 basicStudyBonus）
   * @param {number} sportPoints - 运动积分
   * @param {object} _caps - rulesConfig.caps（未使用，保留兼容）
   * @returns {{study: number, sport: number, total: number, wasCapped: boolean}}
   */
  function applyCaps(studyPoints, sportPoints, _caps) {
    return {
      study: studyPoints,
      sport: sportPoints,
      total: studyPoints + sportPoints,
      wasCapped: false
    };
  }

  // ─── 基础全完成判定 ───

  /**
   * 检查基础学习任务是否全部完成
   * @param {string[]} approvedTaskIds - 家长确认通过的任务 templateId 列表
   * @param {string[]} basicStudyTasks - rulesConfig.basicStudyTasks
   * @returns {boolean}
   */
  function isBasicStudyComplete(approvedTaskIds, basicStudyTasks) {
    if (!basicStudyTasks || basicStudyTasks.length === 0) return false;
    return basicStudyTasks.every(taskId => approvedTaskIds.includes(taskId));
  }

  // ─── 连续里程碑检查 ───

  /**
   * 检查当前连续天数触发了哪些里程碑
   * @param {number} currentStreak - 当前连续天数
   * @param {Array} streakMilestones - rulesConfig.streakMilestones
   * @param {string[]} grantedMilestones - 当前周期已发放的里程碑
   * @returns {Array} 本日新触发的里程碑
   */
  function checkStreakMilestones(currentStreak, streakMilestones, grantedMilestones) {
    if (!streakMilestones || streakMilestones.length === 0) return [];

    const triggered = [];
    for (const ms of streakMilestones) {
      if (currentStreak >= ms.days && !grantedMilestones.includes(ms.days)) {
        triggered.push(ms);
      }
    }

    return triggered;
  }

  // ─── 任务分类 ───

  /**
   * 判断任务是否为学习类任务
   */
  function isStudyTask(task) {
    return task.category === 'study';
  }

  /**
   * 判断任务是否为运动类任务
   */
  function isSportTask(task) {
    return task.category === 'bigSport' || task.category === 'smallSport';
  }

  // ─── 粗略预估算分（孩子端实时显示用，不做复杂封顶） ───

  /**
   * 预估算分（用于孩子端实时显示）
   * 不做完整封顶，只做简单的单任务评分
   */
  function estimatePoints(checkedTasks, listeningMinutes, listeningRules) {
    let estimate = 0;

    for (const task of checkedTasks) {
      if (task.taskType === 'checkbox') {
        estimate += task.plannedPoints;
      } else if (task.taskType === 'duration' && listeningMinutes > 0) {
        const result = calcListeningPoints(listeningMinutes, listeningRules, 5);
        estimate += result.raw;
      }
    }

    return estimate;
  }

  // ─── 兑换频率检查 ───

  /**
   * 检查是否超出 tier 兑换频率限制
   * @param {string} tier - 奖励 tier
   * @param {object} limits - rulesConfig.redemption.limits
   * @param {number} countInPeriod - 当前周期已兑换次数
   * @returns {{allowed: boolean, reason: string}}
   */
  function checkRedeemLimit(tier, limits, countInPeriod) {
    const limit = limits[tier];
    if (!limit) return { allowed: true, reason: '' };

    // super tier 不限
    if (limit.period === 'none' || limit.count === 0) {
      return { allowed: true, reason: '' };
    }

    if (countInPeriod >= limit.count) {
      const periodName = { day: '今天', week: '本周', month: '本月' };
      return {
        allowed: false,
        reason: `${periodName[limit.period] || '当前周期'}已兑换 ${countInPeriod}/${limit.count} 次`
      };
    }

    return { allowed: true, reason: '' };
  }

  // ─── 奖励自身限制检查 ───

  /**
   * 检查 reward 自身的 dailyLimit / weeklyLimit / monthlyLimit
   * @param {object} reward - reward 对象
   * @param {number} countInPeriod - 当前周期该 reward 已兑换次数
   * @param {string} period - 'day' | 'week' | 'month'
   * @returns {{allowed: boolean, reason: string}}
   */
  function checkRewardSelfLimit(reward, countInPeriod, period) {
    let limitValue = null;
    if (period === 'day') limitValue = reward.dailyLimit;
    else if (period === 'week') limitValue = reward.weeklyLimit;
    else if (period === 'month') limitValue = reward.monthlyLimit;

    if (limitValue === null || limitValue === undefined) {
      return { allowed: true, reason: '' };
    }

    if (countInPeriod >= limitValue) {
      const periodName = { day: '今天', week: '本周', month: '本月' };
      return {
        allowed: false,
        reason: `${periodName[period]}该奖励已兑换 ${countInPeriod}/${limitValue} 次`
      };
    }

    return { allowed: true, reason: '' };
  }

  /**
   * 综合检查兑换限制：取 tier 限制、reward 自身限制、屏幕全局限制中最严格的
   * @returns {{allowed: boolean, reason: string}}
   */
  function checkAllRedeemLimits(tier, tierCountInPeriod, limits, reward,
    rewardCountDay, rewardCountWeek, rewardCountMonth, screenCountToday) {
    // 1. Tier 限制
    const tierResult = checkRedeemLimit(tier, limits, tierCountInPeriod);
    if (!tierResult.allowed) return tierResult;

    // 2. Reward 自身限制（日/周/月）
    const dayResult = checkRewardSelfLimit(reward, rewardCountDay, 'day');
    if (!dayResult.allowed) return dayResult;

    const weekResult = checkRewardSelfLimit(reward, rewardCountWeek, 'week');
    if (!weekResult.allowed) return weekResult;

    const monthResult = checkRewardSelfLimit(reward, rewardCountMonth, 'month');
    if (!monthResult.allowed) return monthResult;

    // 3. Screen 全局限制：同一 childId 同一天最多 1 条 screen pending/fulfilled
    if (reward.category === 'screen' && screenCountToday >= 1) {
      return { allowed: false, reason: '今天已兑换过屏幕类奖励，每天限 1 次' };
    }

    return { allowed: true, reason: '' };
  }

  // ─── 保护卡使用限制检查 ───

  /**
   * 检查本月保护卡使用次数
   * @param {Array} records - protectionCardRecords
   * @param {string} dateStr - 当前日期 YYYY-MM-DD
   * @returns {{used: number, maxPerMonth: number, canUse: boolean}}
   */
  function checkProtectionCardUsage(records, dateStr) {
    const MAX_PER_MONTH = 2;
    const monthStart = dateStr.substring(0, 7) + '-01';

    const usedThisMonth = records
      .filter(r => r.type === 'use' && r.time >= monthStart)
      .reduce((sum, r) => sum + Math.abs(r.cards), 0);

    return {
      used: usedThisMonth,
      maxPerMonth: MAX_PER_MONTH,
      canUse: usedThisMonth < MAX_PER_MONTH
    };
  }

  // ─── 孩子端货架规则 ───

  /** 兼容布尔值、数字和字符串的标志位判断：true / 1 / '1' / 'true' */
  function isTruthyFlag(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  /** 判断一个 reward 是否属于孩子端货架商品 */
  function isChildStorefrontReward(reward) {
    return isTruthyFlag(reward.active)
      && isTruthyFlag(reward.visibleToChild)
      && reward.displaySection !== 'hidden';
  }

  /** 货架上架限制常量 */
  const STOREFRONT_LIMITS = {
    totalVisible: 15,
    sectionMax: {
      today: 5,
      weekly: 5,
      goal: 5
    },
    highRiskTotal: 2,
    highRiskPerSection: 1,
    screenTotal: 2,
    screenPerSection: 1,
    privilegeTotal: 2,
    privilegePerSection: 1,
    applicationTotal: 1
  };

  /**
   * 统计 rewards 数组的货架分布
   * @param {Array} rewards - reward 数组
   * @returns {object} stats
   */
  function calculateStorefrontStats(rewards) {
    const stats = {
      totalVisible: 0,
      sectionCounts: { today: 0, weekly: 0, goal: 0 },
      highRiskVisible: 0,
      highRiskBySection: { today: 0, weekly: 0, goal: 0 },
      screenVisible: 0,
      screenBySection: { today: 0, weekly: 0, goal: 0 },
      privilegeVisible: 0,
      privilegeBySection: { today: 0, weekly: 0, goal: 0 },
      applicationVisible: 0
    };

    for (const r of rewards) {
      if (!isChildStorefrontReward(r)) continue;

      stats.totalVisible++;
      const ds = r.displaySection;
      if (stats.sectionCounts[ds] !== undefined) {
        stats.sectionCounts[ds]++;
      }

      if (r.riskLevel === 'high') {
        stats.highRiskVisible++;
        if (stats.highRiskBySection[ds] !== undefined) {
          stats.highRiskBySection[ds]++;
        }
      }

      if (r.category === 'screen') {
        stats.screenVisible++;
        if (stats.screenBySection[ds] !== undefined) {
          stats.screenBySection[ds]++;
        }
      }

      if (r.category === 'privilege') {
        stats.privilegeVisible++;
        if (stats.privilegeBySection[ds] !== undefined) {
          stats.privilegeBySection[ds]++;
        }
      }

      if (r.fulfillmentType === 'application') {
        stats.applicationVisible++;
      }
    }

    return stats;
  }

  /**
   * 校验候选 reward 是否允许上架到孩子端货架
   *
   * 保护条件：
   * 1. candidateReward 先 normalize（displaySection=hidden 强制 visibleToChild=0）
   * 2. 用 candidateReward 替换 allRewards 同 id 旧商品后再统计
   * 3. 如果 candidateReward 不属于孩子端货架 → 直接 allowed=true（允许下架/隐藏/停用）
   *
   * @param {object} candidateReward - 即将保存的 reward
   * @param {Array} allRewards - 当前数据库所有 reward
   * @returns {{allowed: boolean, reason: string, stats: object}}
   */
  function validateRewardStorefront(candidateReward, allRewards) {
    // ── 保护 1+3: normalize candidate ──
    const normalized = { ...candidateReward };
    if (normalized.displaySection === 'hidden') {
      normalized.visibleToChild = 0;
    }

    // ── 保护 4: 用 candidate 替换同 id 旧商品 ──
    const simulatedRewards = allRewards.map(r =>
      r.id === normalized.id ? normalized : r
    );
    // 新增商品（allRewards 中无此 id）
    const existsInDb = allRewards.some(r => r.id === normalized.id);
    if (!existsInDb) {
      simulatedRewards.push(normalized);
    }

    // ── 保护 2: 非货架商品直接放行（允许下架/隐藏/停用）──
    if (!isChildStorefrontReward(normalized)) {
      return {
        allowed: true,
        reason: '',
        stats: calculateStorefrontStats(simulatedRewards)
      };
    }

    const stats = calculateStorefrontStats(simulatedRewards);
    const ds = normalized.displaySection;

    // ── 保护 5: 错误按风险优先级检查 ──

    // 1. application 只能放 goal
    if (normalized.fulfillmentType === 'application' && ds !== 'goal') {
      return {
        allowed: false,
        reason: '申请卡只能放在「大目标」分区',
        stats
      };
    }

    // 2. today + screen + high 不允许上架
    if (ds === 'today' && normalized.category === 'screen' && normalized.riskLevel === 'high') {
      return {
        allowed: false,
        reason: '「今日小奖励」分区不允许上架高风险屏幕类商品',
        stats
      };
    }

    // 3. 分区超过上限
    const sectionLimits = STOREFRONT_LIMITS.sectionMax;
    const sectionNames = { today: '今日小奖励', weekly: '本周推荐', goal: '大目标' };
    if (sectionLimits[ds] && stats.sectionCounts[ds] > sectionLimits[ds]) {
      return {
        allowed: false,
        reason: `「${sectionNames[ds]}」分区最多 ${sectionLimits[ds]} 个商品，当前已有 ${stats.sectionCounts[ds]} 个（含本次变更）`,
        stats
      };
    }

    // 4. 总数超过上限
    if (stats.totalVisible > STOREFRONT_LIMITS.totalVisible) {
      return {
        allowed: false,
        reason: `孩子端货架最多 ${STOREFRONT_LIMITS.totalVisible} 个商品，当前已有 ${stats.totalVisible} 个（含本次变更）`,
        stats
      };
    }

    // 5. high risk 总数超限
    if (stats.highRiskVisible > STOREFRONT_LIMITS.highRiskTotal) {
      return {
        allowed: false,
        reason: `高风险商品最多 ${STOREFRONT_LIMITS.highRiskTotal} 个，当前已有 ${stats.highRiskVisible} 个（含本次变更）`,
        stats
      };
    }

    // 5b. high risk 单分区超限
    if (stats.highRiskBySection[ds] > STOREFRONT_LIMITS.highRiskPerSection) {
      return {
        allowed: false,
        reason: `「${sectionNames[ds]}」分区高风险商品最多 ${STOREFRONT_LIMITS.highRiskPerSection} 个`,
        stats
      };
    }

    // 6. screen 总数超限
    if (stats.screenVisible > STOREFRONT_LIMITS.screenTotal) {
      return {
        allowed: false,
        reason: `屏幕类商品最多 ${STOREFRONT_LIMITS.screenTotal} 个，当前已有 ${stats.screenVisible} 个（含本次变更）`,
        stats
      };
    }

    // 6b. screen 单分区超限
    if (stats.screenBySection[ds] > STOREFRONT_LIMITS.screenPerSection) {
      return {
        allowed: false,
        reason: `「${sectionNames[ds]}」分区屏幕类商品最多 ${STOREFRONT_LIMITS.screenPerSection} 个`,
        stats
      };
    }

    // 7. privilege 总数超限
    if (stats.privilegeVisible > STOREFRONT_LIMITS.privilegeTotal) {
      return {
        allowed: false,
        reason: `特权类商品最多 ${STOREFRONT_LIMITS.privilegeTotal} 个，当前已有 ${stats.privilegeVisible} 个（含本次变更）`,
        stats
      };
    }

    // 7b. privilege 单分区超限
    if (stats.privilegeBySection[ds] > STOREFRONT_LIMITS.privilegePerSection) {
      return {
        allowed: false,
        reason: `「${sectionNames[ds]}」分区特权类商品最多 ${STOREFRONT_LIMITS.privilegePerSection} 个`,
        stats
      };
    }

    // 8. application 总数超限
    if (stats.applicationVisible > STOREFRONT_LIMITS.applicationTotal) {
      return {
        allowed: false,
        reason: `申请卡最多 ${STOREFRONT_LIMITS.applicationTotal} 个，当前已有 ${stats.applicationVisible} 个（含本次变更）`,
        stats
      };
    }

    return { allowed: true, reason: '', stats };
  }

  /**
   * 根据 reward 属性自动建议孩子端展示分区
   *
   * 优先级从高到低：
   * 1. fulfillmentType === 'application' → goal
   * 2. riskLevel === 'high' → goal
   * 3. category === 'screen' && riskLevel === 'high' → goal
   * 4. category === 'screen' → weekly
   * 5. tier === 'small' → today
   * 6. tier === 'medium' → weekly
   * 7. tier === 'high' 或 'super' → goal
   * 8. 按 cost 兜底：<=40 → today, <=150 → weekly, >150 → goal
   * 9. 其他 → weekly
   *
   * @param {object} reward - reward 对象
   * @returns {'today'|'weekly'|'goal'}
   */
  function suggestDisplaySectionForReward(reward) {
    // 1. 申请卡 → 大目标
    if (reward.fulfillmentType === 'application') return 'goal';

    // 2. 高风险 → 大目标
    if (reward.riskLevel === 'high') return 'goal';

    // 3. 高风险屏幕 → 大目标（被规则2覆盖，保留显式检查）
    if (reward.category === 'screen' && reward.riskLevel === 'high') return 'goal';

    // 4. 屏幕类 → 本周推荐
    if (reward.category === 'screen') return 'weekly';

    // 5. small → 今日
    if (reward.tier === 'small') return 'today';

    // 6. medium → 本周
    if (reward.tier === 'medium') return 'weekly';

    // 7. high / super → 大目标
    if (reward.tier === 'high' || reward.tier === 'super') return 'goal';

    // 8. 按 cost 兜底
    if (reward.cost !== undefined && reward.cost !== null) {
      if (reward.cost <= 40) return 'today';
      if (reward.cost <= 150) return 'weekly';
      if (reward.cost > 150) return 'goal';
    }

    // 9. 无法判断 → 本周推荐（最安全默认值）
    return 'weekly';
  }

  // ─── 公开 API ───
  return {
    calcListeningPoints,
    isEffectiveDay,
    applyCaps,
    isBasicStudyComplete,
    checkStreakMilestones,
    isStudyTask,
    isSportTask,
    estimatePoints,
    checkRedeemLimit,
    checkRewardSelfLimit,
    checkAllRedeemLimits,
    checkProtectionCardUsage,
    // 货架规则
    STOREFRONT_LIMITS,
    isTruthyFlag,
    isChildStorefrontReward,
    calculateStorefrontStats,
    validateRewardStorefront,
    suggestDisplaySectionForReward
  };

})();
