// src/ui/children/history.js – 成长记录页 V1.3.1
// 暑假任务打卡积分系统 V3
// 三个 Tab：成长日历 / 英语能量 / 积分流水
// V1.2: 暑假周期统计 + 80小时英语晋级预测
// V1.3: 日历格子直显状态/积分 + 一屏适配 + 紧凑详情
// V1.3.1: 修复有数据但不在暑假范围的日期不显示状态

const HistoryPage = (() => {

  // ─── 状态 ───
  let currentTab = 'calendar';
  let calendarYear, calendarMonth;
  let selectedDate = null;

  // ─── 渲染入口 ───
  async function render() {
    const child = App.getCurrentChild();
    if (!child) return;

    // 同步余额
    const { currentBalance, lifetimeEarnedPoints } = await DB.syncChildBalance(child.id);

    // 更新余额显示（紧凑横条）
    document.getElementById('history-balance').innerHTML = `⭐ 当前积分 <strong>${currentBalance}</strong>`;
    document.getElementById('history-lifetime').textContent = `累计 ${lifetimeEarnedPoints}`;

    // 初始化日历到当前月份
    if (!calendarYear || !calendarMonth) {
      const today = new Date();
      calendarYear = today.getFullYear();
      calendarMonth = today.getMonth() + 1;
    }

    // 绑定 Tab 点击
    bindTabs();

    // 渲染当前 tab
    await renderCurrentTab(child);
  }

  // ─── Tab 绑定 ───
  function bindTabs() {
    document.querySelectorAll('[data-growth-tab]').forEach(btn => {
      const clone = btn.cloneNode(true);
      btn.parentNode.replaceChild(clone, btn);
      clone.addEventListener('click', async () => {
        currentTab = clone.dataset.growthTab;
        document.querySelectorAll('[data-growth-tab]').forEach(b => b.classList.remove('active'));
        clone.classList.add('active');
        document.getElementById('growth-calendar-tab').style.display = currentTab === 'calendar' ? '' : 'none';
        document.getElementById('growth-english-tab').style.display = currentTab === 'english' ? '' : 'none';
        document.getElementById('growth-points-tab').style.display = currentTab === 'points' ? '' : 'none';
        const child = App.getCurrentChild();
        if (child) await renderCurrentTab(child);
      });
    });
  }

  async function renderCurrentTab(child) {
    switch (currentTab) {
      case 'calendar':
        await renderCalendar(child);
        break;
      case 'english':
        await renderEnglish(child);
        break;
      case 'points':
        await renderPoints(child);
        break;
    }
  }

  // ═══════════════════════════════════════════
  // 成长日历 V1.3.1 — 格子直显 + 一屏适配
  // ═══════════════════════════════════════════

  async function renderCalendar(child) {
    const container = document.getElementById('growth-calendar-tab');
    if (!container) return;

    const today = Utils.getToday();
    const SUMMER = DB.SUMMER_PLAN || { startDate: '2026-07-06', endDate: '2026-08-31', totalDays: 57 };

    // ── 暑假成长统计卡 ──
    const growth = await DB.getSummerGrowthStats(child.id);

    // ── 当月日期范围 ──
    const monthStart = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(calendarYear, calendarMonth, 0).getDate();
    const monthEnd = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 查询本月 summaries（供日历格子和日期详情使用）
    const summaries = await DB.getSummariesInRange(child.id, monthStart, monthEnd);
    const summaryMap = {};
    for (const s of summaries) {
      summaryMap[s.date] = s;
    }

    const progressPercent = Math.max(0, Math.min(100, Math.round((growth.elapsedDays / SUMMER.totalDays) * 100)));

    let html = '';

    // ═══ 暑假进度主卡（紧凑）═══
    html += `
      <div class="summer-progress-hero">
        <div class="summer-progress-header">
          <span class="summer-progress-icon">☀️</span>
          <span class="summer-progress-title">暑假成长计划</span>
          <span class="summer-progress-days">${growth.elapsedDays} / ${SUMMER.totalDays} 天</span>
        </div>
        <div class="summer-progress-bar">
          <div class="summer-progress-fill" style="width:${progressPercent}%;"></div>
        </div>
        <div class="summer-progress-subtext">${formatDisplayDate(SUMMER.startDate)} – ${formatDisplayDate(SUMMER.endDate)} · 已过${growth.elapsedDays}天 还剩${growth.remainingDays}天</div>
      </div>`;

    // ═══ 月份导航 ═══
    html += `
      <div class="calendar-nav">
        <button id="cal-prev-month">◀</button>
        <span class="calendar-month-label">${calendarYear}年${calendarMonth}月</span>
        <button id="cal-next-month">▶</button>
      </div>`;

    // ═══ 星期头 ═══
    html += `
      <div class="calendar-grid">
        <div class="calendar-weekday">一</div>
        <div class="calendar-weekday">二</div>
        <div class="calendar-weekday">三</div>
        <div class="calendar-weekday">四</div>
        <div class="calendar-weekday">五</div>
        <div class="calendar-weekday">六</div>
        <div class="calendar-weekday">日</div>`;

    // 第一天是周几
    const firstDay = new Date(calendarYear, calendarMonth - 1, 1);
    let firstDow = firstDay.getDay();
    firstDow = firstDow === 0 ? 7 : firstDow;

    // 填充前置空白
    for (let i = 1; i < firstDow; i++) {
      html += '<div class="calendar-day empty"></div>';
    }

    // ═══ 日期格（状态直显 + 积分） V1.3.1 ═══
    // 修复：有数据的日期即使不在暑假范围也显示状态
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const summary = summaryMap[dateStr];

      const inSummer = dateStr >= SUMMER.startDate && dateStr <= SUMMER.endDate;
      const hasData = !!summary;
      const isEffective = summary && summary.isEffectiveDay === true;
      const isToday = dateStr === today;
      const isFuture = dateStr > today;
      const isPast = dateStr < today;
      const isSelected = dateStr === selectedDate;
      const points = summary ? (summary.totalEarnedPoints || 0) : 0;

      let classes = 'calendar-day';
      if (isToday) classes += ' today';
      if (isSelected) classes += ' selected';

      // 状态 class：有数据的日期优先显示完成态，不论是否在暑假范围
      if (hasData) {
        classes += ' completed';
      } else if (isFuture) {
        classes += ' future';
      } else if (isPast && inSummer) {
        classes += ' missed';
      } else if (!inSummer) {
        classes += ' out-of-summer';
      }

      // 状态图标：有数据就显示
      let statusIcon = '';
      if (hasData) {
        statusIcon = isEffective ? '🔥' : '✅';
      } else if (isPast && inSummer) {
        statusIcon = '·';
      }

      // 积分显示：有数据且有积分就显示
      let pointsHtml = '';
      if (hasData && points > 0) {
        pointsHtml = `<span class="day-points">⭐${points}</span>`;
      }

      html += `
        <div class="${classes}" data-date="${dateStr}">
          <span class="day-num">${d}</span>
          <span class="day-status">${statusIcon}</span>
          ${pointsHtml}
        </div>`;
    }

    html += '</div>'; // close calendar-grid

    // ═══ 紧凑日期详情（单行条） ═══
    if (selectedDate && summaryMap[selectedDate]) {
      const s = summaryMap[selectedDate];
      html += renderDayDetailCompact(selectedDate, s);
    } else if (selectedDate) {
      html += `
        <div class="calendar-day-detail compact">
          <span class="detail-date">${formatDisplayDate(selectedDate)}</span>
          <span class="detail-hint">这一天还没有确认记录</span>
        </div>`;
    }

    // ═══ 图例说明（紧凑） ═══
    html += `
      <div class="calendar-legend">
        <span class="legend-item"><span class="legend-icon">✅</span>已打卡</span>
        <span class="legend-item"><span class="legend-icon">🔥</span>有效日</span>
        <span class="legend-item"><span class="legend-icon">⭐</span>积分</span>
        <span class="legend-item"><span class="legend-icon legend-dot-missed"></span>未打卡</span>
      </div>`;

    container.innerHTML = html;

    // ── 绑定月份导航 ──
    document.getElementById('cal-prev-month')?.addEventListener('click', () => {
      if (calendarMonth === 1) {
        calendarMonth = 12;
        calendarYear--;
      } else {
        calendarMonth--;
      }
      selectedDate = null;
      renderCalendar(child);
    });

    document.getElementById('cal-next-month')?.addEventListener('click', () => {
      if (calendarMonth === 12) {
        calendarMonth = 1;
        calendarYear++;
      } else {
        calendarMonth++;
      }
      selectedDate = null;
      renderCalendar(child);
    });

    // ── 绑定日期点击 ──
    container.querySelectorAll('.calendar-day[data-date]').forEach(el => {
      el.addEventListener('click', () => {
        selectedDate = el.dataset.date;
        renderCalendar(child);
      });
    });
  }

  /** V1.3: 紧凑单行详情条 */
  function renderDayDetailCompact(dateStr, summary) {
    const completedCount = summary.completedTaskCount || 0;
    const totalCount = summary.totalTaskCount || 0;
    const isEffective = summary.isEffectiveDay === true;
    const points = summary.totalEarnedPoints || 0;

    let parts = [
      `<span class="detail-date">${formatDisplayDate(dateStr)}</span>`,
      `<span class="detail-sep">|</span>`,
      `<span class="detail-item">⭐${points}</span>`
    ];

    if (completedCount > 0 || totalCount > 0) {
      parts.push(`<span class="detail-sep">|</span>`);
      parts.push(`<span class="detail-item">✅${completedCount}/${totalCount}</span>`);
    }

    if (isEffective) {
      parts.push(`<span class="detail-sep">|</span>`);
      parts.push(`<span class="detail-item">🔥有效学习日</span>`);
    }

    return `<div class="calendar-day-detail compact">${parts.join('')}</div>`;
  }

  function formatDisplayDate(dateStr) {
    const parts = dateStr.split('-');
    return `${parseInt(parts[1])}月${parseInt(parts[2])}日`;
  }

  // ═══════════════════════════════════════════
  // 英语能量 V1.2 — 80小时循环晋级 + 长期累计
  // ═══════════════════════════════════════════

  async function renderEnglish(child) {
    const container = document.getElementById('growth-english-tab');
    if (!container) return;

    const stats = await DB.getEnglishEnergyStats(child.id);

    const stageHours = stats.levelTargetHours; // 80
    const progressPct = stats.currentLevelProgressPercent;
    const displayHours = stats.currentLevelProgressHours.toFixed(1);

    // 饼图数据
    const pieReading = stats.readingMinutes;
    const pieCartoon = stats.cartoonMinutes;
    const pieListening = stats.listeningEffectiveMinutes;
    const pieTotal = pieReading + pieCartoon + pieListening;

    const readingPct = pieTotal > 0 ? Math.round((pieReading / pieTotal) * 100) : 0;
    const cartoonPct = pieTotal > 0 ? Math.round((pieCartoon / pieTotal) * 100) : 0;
    const listeningPct = 100 - readingPct - cartoonPct;

    let pieGradient = 'conic-gradient(var(--color-info) 0deg 360deg)';
    if (pieTotal > 0) {
      const readingDeg = (pieReading / pieTotal) * 360;
      const cartoonDeg = (pieCartoon / pieTotal) * 360;
      pieGradient = `conic-gradient(
        var(--color-info) 0deg ${readingDeg}deg,
        #f97316 ${readingDeg}deg ${readingDeg + cartoonDeg}deg,
        #a855f7 ${readingDeg + cartoonDeg}deg 360deg
      )`;
    }

    let html = '';

    // ═══ 1. 大号晋级卡 ═══
    html += renderUpgradeHero(stats);

    // ═══ 2. 可视化区域：三张时间卡片 ═══
    html += `
      <div class="english-visual-section">
        <div class="english-metric-cards">
          <div class="english-metric-card">
            <div class="metric-icon">📚</div>
            <div class="metric-value">${stats.readingHours.toFixed(1)} 小时</div>
            <div class="metric-label">阅读</div>
            <div class="metric-sub">精读 + 泛读</div>
          </div>
          <div class="english-metric-card">
            <div class="metric-icon">📺</div>
            <div class="metric-value">${stats.cartoonHours.toFixed(1)} 小时</div>
            <div class="metric-label">动画</div>
          </div>
          <div class="english-metric-card">
            <div class="metric-icon">🎧</div>
            <div class="metric-value">${stats.listeningEffectiveHours.toFixed(1)} 小时</div>
            <div class="metric-label">熏听</div>
            <div class="metric-sub">原始 ${stats.listeningRawHours.toFixed(1)} 小时</div>
          </div>
        </div>`;

    // ═══ 3. 饼图 + 图例 ═══
    html += `
        <div class="english-pie-section">
          <div class="english-pie" style="background:${pieGradient};"></div>
          <div class="english-pie-legend">
            <div class="legend-item">
              <span class="legend-dot" style="background:var(--color-info);"></span>
              <span class="legend-label">阅读</span>
              <span class="legend-percent">${readingPct}%</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot" style="background:#f97316;"></span>
              <span class="legend-label">动画</span>
              <span class="legend-percent">${cartoonPct}%</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot" style="background:#a855f7;"></span>
              <span class="legend-label">熏听</span>
              <span class="legend-percent">${listeningPct}%</span>
            </div>
          </div>
        </div>
      </div>`;

    // ═══ 4. 简洁进度条 ═══
    html += `
      <div class="english-progress-section">
        <div class="english-progress-label">
          <span class="progress-text">本阶段 <strong>${displayHours}</strong> / ${stageHours} 小时</span>
          <span class="progress-percent">${progressPct}%</span>
        </div>
        <div class="english-progress">
          <div class="english-progress-fill" style="width:${progressPct}%;"></div>
        </div>
      </div>`;

    // ═══ 0 分钟时的空状态提示 ═══
    if (stats.totalEffectiveMinutes === 0) {
      html += `
        <div class="english-empty">
          <span style="font-size:48px;">📚</span>
          <p>还没有英语能量，今天开始积累吧。</p>
        </div>`;
    }

    // ═══ 最近 7 天趋势 ═══
    html += renderRecent7Days(stats.byDate);

    container.innerHTML = html;
  }

  /** 渲染晋级卡 — 紧凑横向布局 */
  function renderUpgradeHero(stats) {
    // 刚晋级 / 已完成一轮
    if (stats.justLeveledUp || stats.estimatedDaysToNextLevel === 0) {
      return `
        <div class="english-upgrade-hero hero-celebrate">
          <div class="hero-emoji">🎉</div>
          <div class="hero-content">
            <div class="hero-title">已晋级到第 ${stats.currentLevel} 阶段</div>
            <div class="hero-subtitle">新一轮 80 小时开始啦</div>
          </div>
        </div>`;
    }

    // 数据不足，无法预测
    if (stats.estimatedDaysToNextLevel === null || stats.estimatedDaysToNextLevel === undefined) {
      return `
        <div class="english-upgrade-hero hero-waiting">
          <div class="hero-emoji">📊</div>
          <div class="hero-content">
            <div class="hero-title">开始积累几天后</div>
            <div class="hero-subtitle">就能预测下一次晋级时间</div>
          </div>
        </div>`;
    }

    // 正常：预计天数 + 阶段信息 + 速度说明
    const avgMins = stats.recent7DaysAverageMinutes || 0;
    return `
      <div class="english-upgrade-hero">
        <div class="english-upgrade-number">${stats.estimatedDaysToNextLevel} 天</div>
        <div class="hero-content">
          <div class="english-upgrade-label">预计还需 ${stats.estimatedDaysToNextLevel} 天</div>
          <div class="english-upgrade-subtitle">可晋级第 ${stats.nextLevel} 阶段</div>
          <div class="english-upgrade-speed">按最近7天速度估算（日均 ${avgMins.toFixed(1)} 分钟）</div>
        </div>
      </div>`;
  }

  function renderRecent7Days(byDate) {
    if (!byDate || byDate.length === 0) {
      return '<div class="english-empty" style="padding:var(--space-md);"><p>暂无每日数据</p></div>';
    }

    const last7 = byDate.slice(-7);
    const maxMins = Math.max(1, ...last7.map(d => d.effectiveTotalMinutes || 0));

    let html = '<div class="english-recent"><h3>📊 最近 7 天</h3><div class="english-recent-list">';

    for (const entry of last7) {
      const pct = Math.round(((entry.effectiveTotalMinutes || 0) / maxMins) * 100);
      const displayDate = formatDisplayDate(entry.date);
      html += `
        <div class="english-recent-item">
          <span class="recent-date">${displayDate}</span>
          <div class="recent-bar-wrap">
            <div class="recent-bar-fill" style="width:${pct}%;"></div>
          </div>
          <span class="recent-value">${entry.effectiveTotalMinutes || 0} 分钟</span>
        </div>`;
    }

    html += '</div></div>';
    return html;
  }

  // ═══════════════════════════════════════════
  // 积分流水
  // ═══════════════════════════════════════════

  async function renderPoints(child) {
    const container = document.getElementById('growth-points-tab');
    if (!container) return;

    await renderHistoryList(child, container);
  }

  async function renderHistoryList(child, container) {
    const records = await DB.getPointRecords(child.id);

    if (records.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📊</span>
          <span class="empty-text">还没有积分记录<br>开始打卡吧！</span>
        </div>`;
      return;
    }

    const typeConfig = {
      taskEarn:        { icon: '✅', label: '任务得分', cssClass: 'chip-success' },
      basicStudyBonus: { icon: '🌟', label: '全完成奖励', cssClass: 'chip-bonus' },
      streakBonus:     { icon: '🔥', label: '连续奖励', cssClass: 'chip-bonus' },
      redeem:          { icon: '🎁', label: '兑换', cssClass: 'chip-danger' },
      refund:          { icon: '↩️', label: '退款', cssClass: 'chip-success' },
      adjust:          { icon: '✏️', label: '调整', cssClass: 'chip-warning' },
      lotteryPrize:    { icon: '🎰', label: '抽奖', cssClass: 'chip-bonus' }
    };

    container.innerHTML = records.map(r => {
      const cfg = typeConfig[r.type] || { icon: '•', label: r.type, cssClass: '' };
      const isPositive = r.points >= 0;
      const timeStr = formatRecordTime(r.time);

      return `
        <div class="history-item">
          <div class="history-icon">${cfg.icon}</div>
          <div class="history-info">
            <div class="history-desc">${r.source}</div>
            <div class="history-time">
              ${timeStr}
              <span class="chip ${cfg.cssClass}">${cfg.label}</span>
            </div>
          </div>
          <div class="history-points ${isPositive ? 'positive' : 'negative'}">
            ${Utils.formatPoints(r.points)}
          </div>
          <div class="history-balance">${r.balance}</div>
        </div>`;
    }).join('');
  }

  function formatRecordTime(isoStr) {
    if (!isoStr) return '';
    const match = isoStr.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (match) {
      return `${match[1]} ${match[2]}`;
    }
    return isoStr.substring(0, 16);
  }

  // ─── 公开 API ───
  return {
    render
  };

})();
