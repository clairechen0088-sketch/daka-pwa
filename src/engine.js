// src/engine.js – V2 结算引擎（rulesConfig 驱动）
// 暑假任务打卡积分系统 V2
// 11 步结算流程：幂等检查 → 收集任务 → 逐项计分 → 基础全完成 → 积分分配 → pointRecord → 有效日 → 连续 → 里程碑 → dailySummary → 锁定
// 注意：每日总积分封顶及学习/运动/总分的比例压缩已取消。家长确认后的最终积分 = 所有 approved 任务积分的真实合计。

const Engine = (() => {

  // ─── 主结算流程 ───

  /**
   * 执行每日结算
   * @param {string} childId - 孩子 ID
   * @param {string} date - 结算日期 YYYY-MM-DD
   * @param {object} parentDecisions - 家长确认项 { taskId: 'approved' | 'rejected' }
   * @returns {object} 结算结果
   */
  async function settle(childId, date, parentDecisions) {
    const now = Utils.nowISO();

    // ── Step 1: 幂等检查 ──
    const existingSummary = await DB.getDailySummary(childId, date);
    if (existingSummary) {
      return { success: false, error: '该日期已结算，不可重复结算' };
    }

    // 检查是否有已结算的 dailyTask
    const existingTasks = await DB.getDailyTasks(childId, date);
    const hasSettled = existingTasks.some(t => t.settled);
    if (hasSettled) {
      return { success: false, error: '该日期已有任务被结算' };
    }

    // ── Step 2: 收集当日 dailyTask ──
    // 确保 dailyTask 已生成
    let tasks = existingTasks;
    if (tasks.length === 0) {
      const dayOfWeek = Utils.getDayOfWeek(date);
      tasks = await DB.generateDailyTasks(childId, date, dayOfWeek);
    }

    if (tasks.length === 0) {
      return { success: false, error: '当日无任务' };
    }

    // 兜底过滤：inactiveToday 任务不参与结算
    tasks = tasks.filter(t => !t.inactiveToday);

    if (tasks.length === 0) {
      return { success: false, error: '当日无有效任务（所有任务已被模板关闭）' };
    }

    // 加载 rulesConfig
    const rulesConfig = await DB.getRulesConfig();
    if (!rulesConfig) {
      return { success: false, error: 'rulesConfig 未初始化' };
    }

    // 应用家长决策到 dailyTask
    for (const task of tasks) {
      const decision = parentDecisions[task.taskTemplateId];
      if (decision === 'approved') {
        task.parentStatus = 'approved';
      } else if (decision === 'rejected') {
        task.parentStatus = 'rejected';
      }
      // 未明确指定的保持 unreviewed（视为隐式 rejected，不产生积分）
    }

    // ── Step 3: 逐任务计算 raw 积分 ──
    const approvedTasks = tasks.filter(t => t.parentStatus === 'approved');
    const approvedTemplateIds = approvedTasks.map(t => t.taskTemplateId);

    let rawStudyPoints = 0;
    let rawSportPoints = 0;

    // 先计算每个 approved task 的 rawPoints（未封顶）
    for (const task of tasks) {
      if (task.parentStatus === 'approved') {
        if (task.taskType === 'checkbox') {
          task.rawPoints = task.plannedPoints;
        } else if (task.taskType === 'duration') {
          const minutes = task.durationMinutes || 0;
          const result = Rules.calcListeningPoints(
            minutes,
            rulesConfig.listeningRules,
            rulesConfig.caps.listeningCap
          );
          task.rawPoints = result.capped; // listening 已有独立 cap
        }
      } else {
        task.parentStatus = 'rejected';
        task.rawPoints = 0;
      }

      // 累加分类原始积分
      if (task.rawPoints > 0) {
        if (Rules.isStudyTask(task)) {
          rawStudyPoints += task.rawPoints;
        } else if (Rules.isSportTask(task)) {
          rawSportPoints += task.rawPoints;
        }
      }
    }

    // ── Step 4: 检查基础全完成 ──
    let basicStudyCompleted = false;
    let basicStudyBonusPoints = 0;

    if (Rules.isBasicStudyComplete(approvedTemplateIds, rulesConfig.basicStudyTasks)) {
      basicStudyCompleted = true;
      basicStudyBonusPoints = rulesConfig.basicStudyBonus.bonusPoints;
      rawStudyPoints += basicStudyBonusPoints; // bonus 计入 raw study
    }

    // ── Step 5: 积分汇总（封顶已取消，直接使用原始积分）──
    const capResult = Rules.applyCaps(rawStudyPoints, rawSportPoints, rulesConfig.caps);

    // ── Step 5.1: 积分分配（封顶已取消，rawPoints 直接作为最终积分）──
    // basicStudyBonus 全额发放（不再从 study cap 中扣除）
    let allocatedBonusPoints = 0;
    if (basicStudyCompleted && basicStudyBonusPoints > 0) {
      allocatedBonusPoints = basicStudyBonusPoints;
    }

    // 所有 approved 任务：cappedPoints = parentPoints = rawPoints
    for (const task of approvedTasks) {
      task.cappedPoints = task.rawPoints;
      task.parentPoints = task.rawPoints;
    }

    // 未 approved 的任务 cappedPoints = 0
    for (const task of tasks) {
      if (task.parentStatus !== 'approved') {
        task.cappedPoints = 0;
        task.parentPoints = 0;
      }
    }

    // ── Step 6: 生成 pointRecord ──
    const pointRecordIds = [];
    // 从数据库获取当前真实余额作为起始基准
    let runningBalance = await DB.calcCurrentBalance(childId);

    async function createPointRecord(type, source, points, relatedTaskId = null, relatedRedeemId = null) {
      runningBalance += points;
      const record = {
        id: Utils.genId('txn'),
        childId: childId,
        time: now,
        type: type,
        source: source,
        points: points,
        balance: runningBalance,
        date: date,
        relatedDailyTaskId: relatedTaskId,
        relatedRedeemId: relatedRedeemId,
        relatedLotteryId: null,
        operator: 'parent'
      };
      await DB.addPointRecord(record);
      pointRecordIds.push(record.id);
      return record;
    }

    // 逐任务创建 pointRecord（只对 approved 且有 cappedPoints 的任务）
    for (const task of approvedTasks) {
      if (task.cappedPoints > 0) {
        const record = await createPointRecord(
          'taskEarn',
          `每日任务-${task.taskName}`,
          task.cappedPoints,
          task.id
        );
        task.pointRecordId = record.id;
      }
    }

    // 基础全完成奖励 pointRecord（全额发放）
    if (allocatedBonusPoints > 0) {
      await createPointRecord(
        'basicStudyBonus',
        '基础学习全完成奖励',
        allocatedBonusPoints
      );
    }

    // ── Step 7: 判定有效学习日 ──
    const effectiveResult = Rules.isEffectiveDay(approvedTemplateIds, rulesConfig.effectiveDayRules);

    // ── Step 8: 计算连续天数 ──
    const streakResult = await computeStreak(childId, date, effectiveResult.effective, rulesConfig);

    // ── Step 9: 检查连续里程碑 ──
    let streakBonusPoints = 0;
    let protectionCardsEarned = 0;
    const triggeredMilestones = [];

    if (streakResult.current > 0) {
      const milestones = Rules.checkStreakMilestones(
        streakResult.current,
        rulesConfig.streakMilestones,
        streakResult.grantedMilestones || []
      );

      for (const ms of milestones) {
        // 幂等检查：该周期内该里程碑是否已发放
        const awardId = `${childId}-${streakResult.streakPeriodStart}-${ms.days}`;
        const existingAward = await DB.getStreakAward(childId, streakResult.streakPeriodStart, ms.days);

        if (!existingAward) {
          // 发放积分奖励
          if (ms.points > 0) {
            await createPointRecord('streakBonus', `连续${ms.days}天奖励`, ms.points);
            streakBonusPoints += ms.points;
          }

          // 发放保护卡
          if (ms.protectionCards > 0) {
            const cardBalance = await DB.getProtectionCardBalance(childId);
            await DB.db.protectionCardRecords.add({
              id: Utils.genId('pcard'),
              childId: childId,
              time: now,
              type: 'earn',
              source: `连续${ms.days}天奖励`,
              cards: ms.protectionCards,
              balance: cardBalance + ms.protectionCards,
              relatedDate: date,
              relatedStreakAwardId: awardId,
              operator: 'system'
            });
            protectionCardsEarned += ms.protectionCards;
          }

          // 写入 streakAwardRecord 防重复
          await DB.addStreakAward({
            id: awardId,
            childId: childId,
            date: date,
            milestone: ms.days,
            streakPeriodStart: streakResult.streakPeriodStart,
            pointsAwarded: ms.points,
            protectionCardsAwarded: ms.protectionCards,
            pointRecordId: pointRecordIds[pointRecordIds.length - 1] || null,
            chanceRecordIds: []
          });

          triggeredMilestones.push(ms.days);
        }
      }
    }

    // ── Step 10: 写入 dailySummary ──
    // taskEarnedPoints = 所有任务 rawPoints 之和（不含 basicStudyBonus）
    // 注意：封顶已取消，cappedPoints ≡ rawPoints，capped* ≡ raw*
    const taskEarnedPoints = tasks.reduce((sum, t) => sum + (t.cappedPoints || 0), 0);
    const totalEarned = taskEarnedPoints + allocatedBonusPoints + streakBonusPoints;

    const summaryId = `${date}-${childId}`;
    await DB.db.dailySummaries.add({
      id: summaryId,
      childId: childId,
      date: date,

      // 原始积分（封顶已取消，与 capped* 相同）
      rawStudyPoints: rawStudyPoints,
      rawSportPoints: rawSportPoints,
      rawTotalPoints: rawStudyPoints + rawSportPoints,

      // capped* 字段保留以兼容旧查询，值与 raw* 相同
      cappedStudyPoints: capResult.study,
      cappedSportPoints: capResult.sport,
      cappedTotalPoints: capResult.total,

      // 各类得分明细
      taskEarnedPoints: taskEarnedPoints,
      basicStudyBonusPoints: allocatedBonusPoints,
      streakBonusPoints: streakBonusPoints,
      totalEarnedPoints: totalEarned,

      // 任务计数
      completedTaskCount: approvedTasks.length,
      totalTaskCount: tasks.length,

      // 有效学习日判定
      basicStudyCompleted: basicStudyCompleted,
      isEffectiveDay: effectiveResult.effective,
      effectiveDayReason: effectiveResult.reason,
      overrideEffective: false,
      overrideReason: '',

      // 连续 & 保护卡
      streakMilestonesTriggered: triggeredMilestones,
      protectionCardsEarned: protectionCardsEarned,

      settledAt: now,
      pointRecordIds: pointRecordIds,
      chanceRecordIds: []
    });

    // ── Step 11: 标记所有 dailyTask 已结算 ──
    for (const task of tasks) {
      await DB.db.dailyTasks.update(task.id, {
        parentStatus: task.parentStatus,
        rawPoints: task.rawPoints,
        cappedPoints: task.cappedPoints,
        parentPoints: task.parentPoints,
        settled: true,
        pointRecordId: task.pointRecordId
      });
    }

    // 更新连续状态
    await DB.upsertStreak({
      childId: childId,
      current: streakResult.current,
      longest: Math.max(streakResult.current, streakResult.longest || 0),
      lastEffectiveDate: effectiveResult.effective ? date : streakResult.lastEffectiveDate,
      streakPeriodStart: streakResult.streakPeriodStart,
      grantedMilestones: [...(streakResult.grantedMilestones || []), ...triggeredMilestones]
    });

    // 同步积分缓存
    await DB.syncChildBalance(childId);

    return {
      success: true,
      summaryId: summaryId,
      data: {
        date: date,
        rawStudyPoints: rawStudyPoints,
        rawSportPoints: rawSportPoints,
        cappedStudyPoints: capResult.study,
        cappedSportPoints: capResult.sport,
        cappedTotalPoints: capResult.total,
        basicStudyCompleted: basicStudyCompleted,
        basicStudyBonusPoints: allocatedBonusPoints,
        streakBonusPoints: streakBonusPoints,
        totalEarnedPoints: totalEarned,
        isEffectiveDay: effectiveResult.effective,
        effectiveDayReason: effectiveResult.reason,
        streakCurrent: streakResult.current,
        triggeredMilestones: triggeredMilestones,
        protectionCardsEarned: protectionCardsEarned,
        wasCapped: capResult.wasCapped
      }
    };
  }

  // ─── 连续天数计算 ───

  /**
   * 计算连续有效天数
   * 规则：
   * - isEffectiveDay=true → 计入
   * - isEffectiveDay=false → 中断
   * - 休息日（无任务）→ 跳过不中断
   * - 有任务但未结算 → 中断
   */
  async function computeStreak(childId, date, isEffective, rulesConfig) {
    const streak = await DB.getStreak(childId);
    const current = streak || {
      childId: childId,
      current: 0,
      longest: 0,
      lastEffectiveDate: null,
      streakPeriodStart: date,
      grantedMilestones: []
    };

    if (!isEffective) {
      // 非有效学习日：中断连续
      return {
        current: 0,
        longest: current.longest || 0,
        lastEffectiveDate: current.lastEffectiveDate,
        streakPeriodStart: date, // 重置周期起始日
        grantedMilestones: []
      };
    }

    // 有效学习日：检查昨天是否也是有效学习日，决定连续还是中断
    let newCurrent;
    let streakPeriodStart = current.streakPeriodStart;
    let grantedMilestones = current.grantedMilestones || [];

    if (current.lastEffectiveDate) {
      const yesterday = Utils.addDays(date, -1);
      if (current.lastEffectiveDate === yesterday) {
        // 昨天也是有效日 → 连续+1
        newCurrent = (current.current || 0) + 1;
      } else {
        // 昨天不是有效日 / 中间断了一天 → 重置为 1
        newCurrent = 1;
        streakPeriodStart = date;
        grantedMilestones = [];
      }
    } else {
      // 第一次有效学习日
      newCurrent = 1;
      streakPeriodStart = date;
      grantedMilestones = [];
    }

    return {
      current: newCurrent,
      longest: current.longest || 0,
      lastEffectiveDate: date,
      streakPeriodStart: streakPeriodStart,
      grantedMilestones: grantedMilestones
    };
  }

  // ─── 补签（manual override）───

  /**
   * 手动补签：将某日标记为有效学习日（不产生积分，只修正连续天数）
   */
  async function markEffectiveDay(childId, date, reason) {
    const now = Utils.nowISO();

    // 更新 dailySummary
    const summaryId = `${date}-${childId}`;
    const summary = await DB.getDailySummary(childId, date);

    if (summary) {
      await DB.db.dailySummaries.update(summaryId, {
        isEffectiveDay: true,
        overrideEffective: true,
        overrideReason: reason
      });
    } else {
      // 创建最小 summary
      await DB.db.dailySummaries.add({
        id: summaryId,
        childId: childId,
        date: date,
        rawStudyPoints: 0, rawSportPoints: 0, rawTotalPoints: 0,
        cappedStudyPoints: 0, cappedSportPoints: 0, cappedTotalPoints: 0,
        taskEarnedPoints: 0, basicStudyBonusPoints: 0, streakBonusPoints: 0,
        totalEarnedPoints: 0,
        completedTaskCount: 0, totalTaskCount: 0,
        basicStudyCompleted: false,
        isEffectiveDay: true,
        effectiveDayReason: null,
        overrideEffective: true,
        overrideReason: reason,
        streakMilestonesTriggered: [],
        protectionCardsEarned: 0,
        settledAt: now,
        pointRecordIds: [],
        chanceRecordIds: []
      });
    }

    // 写入 manualOverrideRecord
    await DB.db.manualOverrideRecords.add({
      id: Utils.genId('override'),
      childId: childId,
      date: date,
      type: 'markEffectiveDay',
      reason: reason,
      relatedDailySummaryId: summaryId,
      operator: 'parent',
      time: now
    });

    // 重新计算连续天数（遍历所有 summary）
    await recalculateStreak(childId);

    return { success: true };
  }

  /**
   * 使用保护卡（保留连续天数）
   */
  async function useProtectionCard(childId, date, reason) {
    const now = Utils.nowISO();

    // 检查使用限制
    const records = await DB.db.protectionCardRecords
      .where('childId').equals(childId)
      .toArray();
    const usage = Rules.checkProtectionCardUsage(records, date);

    if (!usage.canUse) {
      return {
        success: false,
        error: `本月已使用 ${usage.used}/${usage.maxPerMonth} 次保护卡，已达上限`
      };
    }

    const balance = records.reduce((sum, r) => sum + r.cards, 0);
    if (balance <= 0) {
      return { success: false, error: '没有可用的保护卡' };
    }

    // 记录使用
    await DB.db.protectionCardRecords.add({
      id: Utils.genId('pcard'),
      childId: childId,
      time: now,
      type: 'use',
      source: reason || '保护连续天数',
      cards: -1,
      balance: balance - 1,
      relatedDate: date,
      relatedStreakAwardId: null,
      operator: 'parent'
    });

    // 写入 manualOverrideRecord
    await DB.db.manualOverrideRecords.add({
      id: Utils.genId('override'),
      childId: childId,
      date: date,
      type: 'useProtectionCard',
      reason: reason || '使用保护卡',
      relatedDailySummaryId: null,
      operator: 'parent',
      time: now
    });

    return { success: true, remaining: balance - 1 };
  }

  /**
   * 重新计算连续天数（遍历所有 summary）
   */
  async function recalculateStreak(childId) {
    const summaries = await DB.getAllSummaries(childId);
    // 按日期排序
    summaries.sort((a, b) => a.date.localeCompare(b.date));

    let current = 0;
    let longest = 0;
    let lastEffectiveDate = null;
    let streakPeriodStart = null;
    const grantedMilestones = [];

    // 获取已有里程碑
    const awards = await DB.db.streakAwardRecords
      .where('childId').equals(childId)
      .toArray();

    for (const summary of summaries) {
      if (summary.isEffectiveDay || summary.overrideEffective) {
        if (lastEffectiveDate) {
          const yesterday = Utils.addDays(summary.date, -1);
          if (lastEffectiveDate === yesterday) {
            current += 1;
          } else {
            // 中断，新周期
            current = 1;
            streakPeriodStart = summary.date;
            grantedMilestones.length = 0;
          }
        } else {
          current = 1;
          streakPeriodStart = summary.date;
        }

        lastEffectiveDate = summary.date;
        if (current > longest) longest = current;
      } else {
        // 非有效日：中断
        current = 0;
        streakPeriodStart = null;
        grantedMilestones.length = 0;
      }
    }

    // 收集当前周期已发放的里程碑
    if (streakPeriodStart) {
      const cycleAwards = awards.filter(a => a.streakPeriodStart === streakPeriodStart);
      for (const a of cycleAwards) {
        if (!grantedMilestones.includes(a.milestone)) {
          grantedMilestones.push(a.milestone);
        }
      }
    }

    await DB.upsertStreak({
      childId: childId,
      current: current,
      longest: longest,
      lastEffectiveDate: lastEffectiveDate,
      streakPeriodStart: streakPeriodStart || '',
      grantedMilestones: grantedMilestones
    });

    return { current, longest };
  }

  // ─── 公开 API ───
  return {
    settle,
    computeStreak,
    markEffectiveDay,
    useProtectionCard,
    recalculateStreak
  };

})();
