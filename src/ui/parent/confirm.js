// src/ui/parent/confirm.js – 家长今日确认页
// 暑假任务打卡积分系统 V2
// V2.1: UI 信息层级优化 — 总览卡、状态分区、分类折叠、降噪按钮、视觉统一

const ConfirmPage = (() => {

  let currentDate = null;
  let currentTasks = [];
  let currentDecisions = {}; // { taskTemplateId: 'approved' | 'rejected' }
  let currentSummary = null;

  // ─── UI 折叠状态（模块级，不持久化）───
  let uiState = {
    expandedCategories: new Set(),  // 展开的分类 key
    showApprovedTasks: false,       // 是否展开已通过任务
    showIncompleteTasks: false,     // 是否展开未完成任务
    showParentGrowth: false,        // 是否展开家长评分
  };

  // ─── 分组配置（四大板块，与 challenge.js 保持一致）───
  const GROUP_CONFIG = [
    { key:'today_required',   label:'今日必做', icon:'📋', color:'var(--color-study)' },
    { key:'english_energy',   label:'英语能量', icon:'📚', color:'#3B82F6' },
    { key:'sports_challenge', label:'运动挑战', icon:'🏃', color:'var(--color-sport)' },
    { key:'extra_bonus',      label:'额外加分', icon:'⭐', color:'var(--color-bonus)' }
  ];

  /** 推断任务的 section（优先 section 字段，其次已知 ID 映射，最后模糊推断） */
  function getTaskSection(task) {
    if (task.section) return task.section;

    const tid = task.taskTemplateId || '';
    const KNOWN_MAP = {
      chineseMorningRead: 'today_required', englishMorningRead: 'today_required',
      chineseMain: 'today_required', mathMain: 'today_required', parentReading: 'today_required',
      mathThinking: 'today_required', mathTeacher: 'today_required', handwritingPractice: 'today_required',
      englishListening: 'english_energy', englishCartoon: 'english_energy',
      englishIntensive: 'english_energy', englishExtensive: 'english_energy', englishRetell: 'english_energy',
      bigSport: 'sports_challenge', smallSport1: 'sports_challenge',
      smallSport2: 'sports_challenge', smallSport3: 'sports_challenge', smallSport4: 'sports_challenge'
    };
    if (KNOWN_MAP[tid]) return KNOWN_MAP[tid];

    const gk = (task.groupKey || '').toLowerCase();
    const cat = (task.category || '').toLowerCase();
    const name = (task.taskName || '').toLowerCase();
    const combined = gk + cat + name;
    if (/sport|bigsport|smallsport|运动|跳绳|跑步|轮滑|户外/.test(combined)) return 'sports_challenge';
    if (/熏听|动画|cartoon|精读|泛读|复述/.test(gk + name)) return 'english_energy';
    if (/家务|阅读加分|额外训练|额外任务|加分项|bonus|extra|chore/.test(combined)) return 'extra_bonus';
    return 'today_required';
  }

  // ─── 获取分组颜色 ───
  function getGroupColor(key) {
    const cfg = GROUP_CONFIG.find(g => g.key === key);
    return cfg ? cfg.color : 'var(--color-text-muted)';
  }

  // ═══════════════════════════════════════════
  //  渲染入口
  // ═══════════════════════════════════════════
  async function render(date) {
    const child = App.getCurrentChild();
    const config = App.getCurrentConfig();
    if (!child || !config) return;

    currentDate = date || Utils.getToday(config.dayCutoffHour);
    currentDecisions = {};

    // ★ 先绑定事件（同步），确保导航按钮始终可用
    bindEvents(child, config);

    currentSummary = await DB.getDailySummary(child.id, currentDate);

    // 更新日期显示
    document.getElementById('confirm-date-display').textContent = currentDate;

    // 加载任务并初始化决策
    await loadTasks(child, currentDate);

    // ★ 渲染总览卡（在任务列表上方）
    try {
      await renderSummaryCard(child, currentDate);
    } catch (err) {
      console.error('[Confirm] Failed to render summary card:', err);
    }

    // 渲染任务列表（状态分区 + 分类折叠入口）
    try {
      await renderTaskList(child, currentDate);
    } catch (err) {
      console.error('[Confirm] Failed to render task list:', err);
    }

    // V1.5: 渲染家长成长反馈（折叠入口卡）
    try {
      await renderParentGrowthSection(child, currentDate);
    } catch (err) {
      console.error('[Confirm] Failed to render parent growth section:', err);
    }

    // V1.6: 渲染今日鼓励信区域
    try {
      await renderParentLetterSection(child, currentDate);
    } catch (err) {
      console.error('[Confirm] Failed to render parent letter section:', err);
    }

    // 渲染结算预览
    try {
      await renderSettlePreview();
    } catch (err) {
      console.error('[Confirm] Failed to render settle preview:', err);
    }
  }

  // ═══════════════════════════════════════════
  //  加载任务 & 初始化决策
  // ═══════════════════════════════════════════
  async function loadTasks(child, date) {
    const dayOfWeek = Utils.getDayOfWeek(date);

    if (currentSummary) {
      currentTasks = await DB.getDailyTasks(child.id, date);
    } else {
      currentTasks = await DB.generateDailyTasks(child.id, date, dayOfWeek);
      currentTasks = currentTasks.filter(t => !t.inactiveToday);
    }

    // 如果已结算，使用结算状态
    if (currentSummary) {
      currentTasks.forEach(t => {
        currentDecisions[t.taskTemplateId] = t.parentStatus;
      });
    } else {
      // V2.1: 所有任务初始为待确认，由家长通过「一键通过」或单项操作确认
      // 孩子打卡状态仅作为视觉参考，不影响初始决策
      currentTasks.forEach(t => {
        currentDecisions[t.taskTemplateId] = 'unreviewed';
      });
    }
  }

  // ═══════════════════════════════════════════
  //  今日结算总览卡
  // ═══════════════════════════════════════════
  async function renderSummaryCard(child, date) {
    const container = document.getElementById('confirm-summary-card');
    if (!container || currentTasks.length === 0) {
      if (container) container.style.display = 'none';
      return;
    }
    container.style.display = 'block';

    // ── 统计各状态任务数 ──
    const approved = currentTasks.filter(t => currentDecisions[t.taskTemplateId] === 'approved');
    const rejected = currentTasks.filter(t => currentDecisions[t.taskTemplateId] === 'rejected');
    const pending  = currentTasks.filter(t => {
      const d = currentDecisions[t.taskTemplateId];
      return !d || d === 'unreviewed' || (d !== 'approved' && d !== 'rejected');
    });
    const completed = currentTasks.filter(t => t.childChecked);

    // ── 计算预计积分 ──
    const rulesConfig = await DB.getRulesConfig();
    let estimatedPoints = 0;
    if (rulesConfig) {
      let rawStudy = 0, rawSport = 0;
      const approvedIds = [];
      for (const task of currentTasks) {
        if (currentDecisions[task.taskTemplateId] === 'approved') {
          approvedIds.push(task.taskTemplateId);
          let pts = 0;
          if (task.taskType === 'checkbox') {
            pts = task.plannedPoints;
          } else if (task.taskType === 'duration') {
            const result = Rules.calcListeningPoints(
              task.durationMinutes || 0,
              rulesConfig.listeningRules,
              rulesConfig.caps.listeningCap
            );
            pts = result.capped;
          }
          if (Rules.isStudyTask(task)) rawStudy += pts;
          else if (Rules.isSportTask(task)) rawSport += pts;
        }
      }
      const basicComplete = Rules.isBasicStudyComplete(approvedIds, rulesConfig.basicStudyTasks);
      if (basicComplete) rawStudy += rulesConfig.basicStudyBonus.bonusPoints;
      const capResult = Rules.applyCaps(rawStudy, rawSport, rulesConfig.caps);
      estimatedPoints = capResult.total;
    }

    // ── 家长成长分 ──
    const parentScore = await DB.getParentScore(child.id, date);
    const growthScore = parentScore ? parentScore.totalScore : 0;

    container.innerHTML = `
      <div class="summary-card">
        <div class="summary-card-grid">
          <div class="summary-stat">
            <div class="summary-stat-value text-accent">${growthScore} <span class="summary-stat-unit">/ 9</span></div>
            <div class="summary-stat-label">今日成长分</div>
          </div>
          <div class="summary-stat">
            <div class="summary-stat-value text-accent">+${estimatedPoints}</div>
            <div class="summary-stat-label">预计积分</div>
          </div>
          <div class="summary-stat">
            <div class="summary-stat-value">${completed.length}<span class="summary-stat-unit">/${currentTasks.length}</span></div>
            <div class="summary-stat-label">已完成</div>
          </div>
          <div class="summary-stat">
            <div class="summary-stat-value ${pending.length > 0 ? 'text-warning' : ''}">${pending.length}</div>
            <div class="summary-stat-label">待确认</div>
          </div>
          <div class="summary-stat">
            <div class="summary-stat-value text-success">${approved.length}</div>
            <div class="summary-stat-label">已通过</div>
          </div>
          <div class="summary-stat">
            <div class="summary-stat-value ${rejected.length > 0 ? 'text-danger' : ''}">${rejected.length}</div>
            <div class="summary-stat-label">已驳回</div>
          </div>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════
  //  渲染任务列表（状态分区 + 分类折叠入口）
  // ═══════════════════════════════════════════
  async function renderTaskList(child, date) {
    const container = document.getElementById('confirm-task-list');
    if (!container) return;

    if (currentTasks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <span class="empty-text">当日无任务</span>
        </div>`;
      return;
    }

    // ── 按状态分组 ──
    const approvedTasks  = currentTasks.filter(t => currentDecisions[t.taskTemplateId] === 'approved');
    const rejectedTasks  = currentTasks.filter(t => currentDecisions[t.taskTemplateId] === 'rejected');
    const pendingTasks   = currentTasks.filter(t => {
      const d = currentDecisions[t.taskTemplateId];
      return !d || d === 'unreviewed' || (d !== 'approved' && d !== 'rejected');
    });
    // 未完成 = 孩子未打卡的任务
    const incompleteTasks = currentTasks.filter(t => !t.childChecked);

    // ── 按分类分组 ──
    const categoryGroups = {};
    for (const task of currentTasks) {
      const gk = getTaskSection(task);
      if (!categoryGroups[gk]) categoryGroups[gk] = [];
      categoryGroups[gk].push(task);
    }

    // ── 渲染单个任务卡片（新样式：文字按钮） ──
    // P3: hideColorBar 用于分类折叠内部，避免子任务与分类标题使用同一套"色条"语言
    const renderTaskRow = (task, hideColorBar = false) => {
      const decision = currentDecisions[task.taskTemplateId] || 'unreviewed';
      const isApproved = decision === 'approved';
      const isRejected = decision === 'rejected';
      const isPending = !isApproved && !isRejected;
      const settled = !!currentSummary;

      let rowClass = 'confirm-task-row';
      if (isApproved) rowClass += ' status-approved';
      if (isRejected) rowClass += ' status-rejected';

      // 左侧色条：分类折叠内部隐藏（分类标题已有模块色条）
      const sectionKey = getTaskSection(task);
      const barColor = getGroupColor(sectionKey);
      const borderStyle = hideColorBar
        ? 'border-left: 2px solid transparent;'
        : `border-left: 2px solid ${barColor};`;

      let metaHtml = '';
      if (task.taskType === 'duration' && task.durationMinutes > 0) {
        metaHtml += `<span class="confirm-duration">🎧 ${Utils.formatMinutes(task.durationMinutes)}</span>`;
      }
      metaHtml += `<span class="confirm-meta-text">+${task.plannedPoints}分 · ${Utils.formatMinutes(task.suggestedMinutes)}</span>`;

      // 状态标签
      let statusBadge = '';
      if (isApproved) statusBadge = '<span class="task-status-badge badge-approved">已通过</span>';
      if (isRejected) statusBadge = '<span class="task-status-badge badge-rejected">已驳回</span>';

      // 操作按钮（未结算时显示）
      let actionsHtml = '';
      if (!settled) {
        if (isPending) {
          actionsHtml = `
            <div class="confirm-task-actions">
              <button class="confirm-btn-approve ${isApproved ? 'selected' : ''}"
                      data-template-id="${task.taskTemplateId}" data-action="approved">
                通过
              </button>
              <button class="confirm-btn-reject ${isRejected ? 'selected' : ''}"
                      data-template-id="${task.taskTemplateId}" data-action="rejected">
                驳回
              </button>
            </div>`;
        } else if (isApproved) {
          actionsHtml = `
            <div class="confirm-task-actions">
              <span class="confirm-btn-approve selected" style="cursor:default;">已通过</span>
              <button class="confirm-btn-undo"
                      data-template-id="${task.taskTemplateId}" data-action="unreviewed">
                撤销
              </button>
            </div>`;
        } else if (isRejected) {
          actionsHtml = `
            <div class="confirm-task-actions">
              <button class="confirm-btn-approve"
                      data-template-id="${task.taskTemplateId}" data-action="approved">
                通过
              </button>
              <span class="confirm-btn-reject selected" style="cursor:default;">已驳回</span>
            </div>`;
        }
      } else {
        // 已结算：只显示状态
        actionsHtml = `<div class="confirm-task-actions">${statusBadge}</div>`;
      }

      return `
        <div class="${rowClass}" data-template-id="${task.taskTemplateId}" style="${borderStyle}">
          <div class="confirm-task-icon">${task.taskIcon}</div>
          <div class="confirm-task-info">
            <div class="confirm-task-name">${task.taskName}</div>
            <div class="confirm-task-meta">${metaHtml}</div>
          </div>
          ${actionsHtml}
        </div>`;
    };

    // ── 构建 HTML ──
    let html = '';

    // ── 1. 待确认任务（始终展开）──
    html += `
      <div class="status-section" data-section="pending">
        <div class="status-section-header">
          <div class="status-section-header-left">
            <span class="status-section-icon">⏳</span>
            <span class="status-section-label">待确认任务</span>
            <span class="status-section-count">${pendingTasks.length}</span>
          </div>
          ${!currentSummary && pendingTasks.length > 0 ? `
            <button class="btn-approve-all" id="confirm-approve-all">一键通过</button>
          ` : ''}
        </div>
        <div class="status-section-body">
          ${pendingTasks.length === 0
            ? '<div class="status-section-empty">暂无待确认任务</div>'
            : pendingTasks.map(renderTaskRow).join('')}
        </div>
      </div>`;

    // ── 2. 已驳回任务（存在时展开）──
    if (rejectedTasks.length > 0) {
      html += `
        <div class="status-section" data-section="rejected">
          <div class="status-section-header">
            <div class="status-section-header-left">
              <span class="status-section-icon">↩️</span>
              <span class="status-section-label">已驳回任务</span>
              <span class="status-section-count chip-danger">${rejectedTasks.length}</span>
            </div>
          </div>
          <div class="status-section-body">
            ${rejectedTasks.map(renderTaskRow).join('')}
          </div>
        </div>`;
    }

    // ── 3. 已通过任务（默认折叠）──
    if (approvedTasks.length > 0) {
      html += `
        <div class="status-section folded-section" data-section="approved">
          <div class="status-section-header foldable" data-fold-key="approved">
            <div class="status-section-header-left">
              <span class="fold-arrow ${uiState.showApprovedTasks ? 'open' : ''}">▶</span>
              <span class="status-section-icon">✅</span>
              <span class="status-section-label">已通过 ${approvedTasks.length} 项</span>
            </div>
            <span class="fold-hint">点击查看</span>
          </div>
          <div class="status-section-body ${uiState.showApprovedTasks ? '' : 'collapsed'}">
            ${approvedTasks.map(renderTaskRow).join('')}
          </div>
        </div>`;
    }

    // ── 4. 未完成任务（默认折叠）──
    if (incompleteTasks.length > 0) {
      html += `
        <div class="status-section folded-section" data-section="incomplete">
          <div class="status-section-header foldable" data-fold-key="incomplete">
            <div class="status-section-header-left">
              <span class="fold-arrow ${uiState.showIncompleteTasks ? 'open' : ''}">▶</span>
              <span class="status-section-icon">⬜</span>
              <span class="status-section-label">未完成 ${incompleteTasks.length} 项</span>
            </div>
            <span class="fold-hint">点击查看</span>
          </div>
          <div class="status-section-body ${uiState.showIncompleteTasks ? '' : 'collapsed'}">
            ${incompleteTasks.map(renderTaskRow).join('')}
          </div>
        </div>`;
    }

    // ── 5. 分类折叠入口 ──
    html += '<div class="category-entries-section"><div class="category-entries-title">📂 按分类查看</div>';

    for (const config of GROUP_CONFIG) {
      const tasks = categoryGroups[config.key];
      if (!tasks || tasks.length === 0) continue;

      const approvedCount = tasks.filter(t => currentDecisions[t.taskTemplateId] === 'approved').length;
      const pendingCount = tasks.filter(t => {
        const d = currentDecisions[t.taskTemplateId];
        return d === 'unreviewed' || (!d || (d !== 'approved' && d !== 'rejected'));
      }).length;
      const totalCount = tasks.length;
      const isExpanded = uiState.expandedCategories.has(config.key);

      html += `
        <div class="category-entry" data-category="${config.key}">
          <div class="category-entry-header foldable" data-fold-key="cat-${config.key}"
               style="border-left: 3px solid ${config.color};">
            <span class="fold-arrow ${isExpanded ? 'open' : ''}">▶</span>
            <span class="category-entry-icon">${config.icon}</span>
            <span class="category-entry-label">${config.label}</span>
            <span class="category-entry-progress">${approvedCount}/${totalCount}</span>
            ${pendingCount > 0 ? `<span class="category-entry-pending">${pendingCount}待确认</span>` : ''}
          </div>
          <div class="category-entry-body ${isExpanded ? '' : 'collapsed'}">
            ${tasks.map(t => renderTaskRow(t, true)).join('')}
          </div>
        </div>`;
    }

    // 兜底：未分类任务
    if (categoryGroups['other']) {
      const tasks = categoryGroups['other'];
      html += `
        <div class="category-entry" data-category="other">
          <div class="category-entry-header foldable" data-fold-key="cat-other"
               style="border-left: 3px solid var(--color-text-muted);">
            <span class="fold-arrow">▶</span>
            <span class="category-entry-icon">📋</span>
            <span class="category-entry-label">其他</span>
            <span class="category-entry-progress">${tasks.length}项</span>
          </div>
          <div class="category-entry-body collapsed">
            ${tasks.map(t => renderTaskRow(t, true)).join('')}
          </div>
        </div>`;
    }

    html += '</div>'; // close category-entries-section

    container.innerHTML = html;

    // ── 绑定事件 ──
    bindTaskListEvents(container);
  }

  // ═══════════════════════════════════════════
  //  绑定任务列表事件
  // ═══════════════════════════════════════════
  function bindTaskListEvents(container) {
    // ── 折叠/展开 ──
    container.querySelectorAll('.foldable').forEach(header => {
      header.addEventListener('click', () => {
        const foldKey = header.dataset.foldKey;
        const body = header.nextElementSibling;
        const arrow = header.querySelector('.fold-arrow');

        if (!body || !arrow) return;

        const isNowOpen = body.classList.toggle('collapsed');
        arrow.classList.toggle('open', !isNowOpen);

        // 更新 UI 状态
        if (foldKey === 'approved') {
          uiState.showApprovedTasks = !isNowOpen;
        } else if (foldKey === 'incomplete') {
          uiState.showIncompleteTasks = !isNowOpen;
        } else if (foldKey && foldKey.startsWith('cat-')) {
          const catKey = foldKey.replace('cat-', '');
          if (!isNowOpen) {
            uiState.expandedCategories.add(catKey);
          } else {
            uiState.expandedCategories.delete(catKey);
          }
        }
      });
    });

    if (currentSummary) return; // 已结算，不绑定操作按钮

    // ── 单项通过/驳回 ──
    container.querySelectorAll('.confirm-btn-approve:not(.selected)').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const templateId = btn.dataset.templateId;
        currentDecisions[templateId] = 'approved';
        await refreshAfterDecision();
      });
    });

    container.querySelectorAll('.confirm-btn-reject:not(.selected)').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const templateId = btn.dataset.templateId;
        currentDecisions[templateId] = 'rejected';
        await refreshAfterDecision();
      });
    });

    // ── 撤销（返回待确认）──
    container.querySelectorAll('.confirm-btn-undo').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const templateId = btn.dataset.templateId;
        currentDecisions[templateId] = 'unreviewed';
        await refreshAfterDecision();
      });
    });

    // ── 一键全部通过 ──
    const approveAllBtn = container.querySelector('#confirm-approve-all');
    if (approveAllBtn) {
      approveAllBtn.addEventListener('click', async () => {
        for (const task of currentTasks) {
          const d = currentDecisions[task.taskTemplateId];
          if (!d || d === 'unreviewed' || (d !== 'approved' && d !== 'rejected')) {
            currentDecisions[task.taskTemplateId] = 'approved';
          }
        }
        await refreshAfterDecision();
      });
    }
  }

  // ═══════════════════════════════════════════
  //  决策变更后刷新 UI（uiState 由事件处理器维护，此处无需保存/恢复）
  // ═══════════════════════════════════════════
  async function refreshAfterDecision() {
    const child = App.getCurrentChild();
    if (!child) return;

    await renderSummaryCard(child, currentDate);
    await renderTaskList(child, currentDate);
    await renderSettlePreview();
  }

  // ═══════════════════════════════════════════
  //  渲染结算预览（精简版）
  // ═══════════════════════════════════════════
  async function renderSettlePreview() {
    const container = document.getElementById('confirm-summary');
    const rulesConfig = await DB.getRulesConfig();
    if (!rulesConfig) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    // 计算各项积分
    let rawStudy = 0;
    let rawSport = 0;
    const approvedIds = [];

    for (const task of currentTasks) {
      if (currentDecisions[task.taskTemplateId] === 'approved') {
        approvedIds.push(task.taskTemplateId);

        let pts = 0;
        if (task.taskType === 'checkbox') {
          pts = task.plannedPoints;
        } else if (task.taskType === 'duration') {
          const result = Rules.calcListeningPoints(
            task.durationMinutes || 0,
            rulesConfig.listeningRules,
            rulesConfig.caps.listeningCap
          );
          pts = result.capped;
        }

        if (Rules.isStudyTask(task)) rawStudy += pts;
        else if (Rules.isSportTask(task)) rawSport += pts;
      }
    }

    // 基础全完成
    const basicComplete = Rules.isBasicStudyComplete(approvedIds, rulesConfig.basicStudyTasks);
    const bonusPoints = basicComplete ? rulesConfig.basicStudyBonus.bonusPoints : 0;
    rawStudy += bonusPoints;

    // 封顶
    const capResult = Rules.applyCaps(rawStudy, rawSport, rulesConfig.caps);

    // 有效学习日
    const effectiveResult = Rules.isEffectiveDay(approvedIds, rulesConfig.effectiveDayRules);

    // 连续天数
    const streak = await DB.getStreak(App.getCurrentChild().id);
    let streakAfter = streak ? streak.current : 0;
    if (effectiveResult.effective) streakAfter++;

    // 更新 UI
    document.getElementById('confirm-raw-study').textContent = rawStudy;
    document.getElementById('confirm-capped-study').textContent =
      capResult.wasCapped ? `→ ${capResult.study}` : '';

    document.getElementById('confirm-raw-sport').textContent = rawSport;
    document.getElementById('confirm-capped-sport').textContent =
      capResult.wasCapped ? `→ ${capResult.sport}` : '';

    document.getElementById('confirm-basic-bonus').textContent =
      bonusPoints > 0 ? `+${bonusPoints}` : '0';

    document.getElementById('confirm-total-points').textContent =
      `⭐ ${capResult.total}`;

    document.getElementById('confirm-effective').textContent =
      effectiveResult.effective
        ? '✅ 有效学习日'
        : '❌ 非有效学习日';

    document.getElementById('confirm-streak').textContent =
      `${streakAfter}天（预计）`;

    // 结算预览标题
    const summaryTitle = document.querySelector('#confirm-summary h3');
    if (summaryTitle && !summaryTitle.textContent.includes('预计')) {
      summaryTitle.textContent = '结算预览（预计）';
    }

    // 连续奖励预览
    const streakBonusDiv = document.getElementById('confirm-streak-bonus');
    if (effectiveResult.effective && streakAfter > 0) {
      const milestones = Rules.checkStreakMilestones(streakAfter, rulesConfig.streakMilestones, streak?.grantedMilestones || []);
      if (milestones.length > 0) {
        streakBonusDiv.style.display = 'block';
        streakBonusDiv.innerHTML = milestones.map(m => {
          let text = `🎯 连续${m.days}天奖励: +${m.points}分`;
          if (m.protectionCards > 0) text += ` + ${m.protectionCards}张保护卡`;
          return `<div class="summary-row" style="color:var(--color-accent)"><span>${text}</span></div>`;
        }).join('');
      } else {
        streakBonusDiv.style.display = 'none';
      }
    } else {
      streakBonusDiv.style.display = 'none';
    }
  }

  // ═══════════════════════════════════════════
  //  绑定页面级事件
  // ═══════════════════════════════════════════
  function bindEvents(child, config) {
    // 返回按钮
    document.getElementById('confirm-back-btn').onclick = () => {
      App.exitParentMode();
    };

    // 子导航：跳转奖励管理
    document.getElementById('confirm-goto-manage').onclick = () => {
      App.navigate(App.PAGES.MANAGE);
    };
    // 子导航：跳转设置
    document.getElementById('confirm-goto-settings').onclick = () => {
      App.navigate(App.PAGES.SETTINGS);
    };

    // 日期切换
    document.getElementById('confirm-date-prev').onclick = async () => {
      // 保存当前 UI 折叠状态
      const savedExpanded = new Set(uiState.expandedCategories);
      const savedShowApproved = uiState.showApprovedTasks;
      const savedShowIncomplete = uiState.showIncompleteTasks;

      currentDate = Utils.addDays(currentDate, -1);
      document.getElementById('confirm-date-display').textContent = currentDate;
      currentSummary = await DB.getDailySummary(child.id, currentDate);
      await loadTasks(child, currentDate);
      await renderSummaryCard(child, currentDate);
      await renderTaskList(child, currentDate);
      await renderSettlePreview();
      await renderParentGrowthSection(child, currentDate);
      await renderParentLetterSection(child, currentDate);
      updateSettleButton();

      // 恢复折叠状态
      uiState.expandedCategories = savedExpanded;
      uiState.showApprovedTasks = savedShowApproved;
      uiState.showIncompleteTasks = savedShowIncomplete;
    };

    document.getElementById('confirm-date-next').onclick = async () => {
      const today = Utils.getToday(config.dayCutoffHour);
      const next = Utils.addDays(currentDate, 1);
      if (next > today) return; // 不能超过今天

      const savedExpanded = new Set(uiState.expandedCategories);
      const savedShowApproved = uiState.showApprovedTasks;
      const savedShowIncomplete = uiState.showIncompleteTasks;

      currentDate = next;
      document.getElementById('confirm-date-display').textContent = currentDate;
      currentSummary = await DB.getDailySummary(child.id, currentDate);
      await loadTasks(child, currentDate);
      await renderSummaryCard(child, currentDate);
      await renderTaskList(child, currentDate);
      await renderSettlePreview();
      await renderParentGrowthSection(child, currentDate);
      await renderParentLetterSection(child, currentDate);
      updateSettleButton();

      uiState.expandedCategories = savedExpanded;
      uiState.showApprovedTasks = savedShowApproved;
      uiState.showIncompleteTasks = savedShowIncomplete;
    };

    // 结算按钮
    updateSettleButton();
    document.getElementById('confirm-settle-btn').onclick = async () => {
      await executeSettle(child);
    };
  }

  function updateSettleButton() {
    const btn = document.getElementById('confirm-settle-btn');
    if (currentSummary) {
      btn.textContent = '✅ 已结算';
      btn.disabled = true;
      btn.style.opacity = '0.5';
    } else {
      btn.textContent = '✅ 确认结算';
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }

  // ═══════════════════════════════════════════
  //  执行结算
  // ═══════════════════════════════════════════
  async function executeSettle(child) {
    const btn = document.getElementById('confirm-settle-btn');
    btn.textContent = '结算中...';
    btn.disabled = true;

    try {
      // V2.1: 将未确认的任务默认视为驳回，确保所有任务有明确决策
      const settleDecisions = {};
      for (const task of currentTasks) {
        const d = currentDecisions[task.taskTemplateId];
        settleDecisions[task.taskTemplateId] = (d === 'approved') ? 'approved' : 'rejected';
      }

      const result = await Engine.settle(child.id, currentDate, settleDecisions);

      if (result.success) {
        currentSummary = result.data;
        updateSettleButton();

        // V2.1: 结算后刷新任务状态，确保 currentDecisions 与结算结果一致
        currentTasks = await DB.getDailyTasks(child.id, currentDate);
        currentDecisions = {};
        currentTasks.forEach(t => {
          currentDecisions[t.taskTemplateId] = t.parentStatus;
        });

        // 重新渲染
        await renderTaskList(child, currentDate);
        await renderSummaryCard(child, currentDate);

        // 显示结果
        alert(
          `结算成功！\n\n` +
          `📊 学习积分: ${result.data.cappedStudyPoints}\n` +
          `🏃 运动积分: ${result.data.cappedSportPoints}\n` +
          `🌟 基础全完成: ${result.data.basicStudyCompleted ? '是 +3分' : '否'}\n` +
          `🔥 连续奖励: +${result.data.streakBonusPoints}\n` +
          `📅 有效学习日: ${result.data.isEffectiveDay ? '是' : '否'}\n` +
          `🔥 连续天数: ${result.data.streakCurrent}天\n` +
          `⭐ 总入账: ${result.data.totalEarnedPoints}分`
        );

        // 刷新状态
        await App.refreshState();

        // 如果有连续奖励或保护卡，额外提示
        const milestones = Array.isArray(result.data.triggeredMilestones)
          ? result.data.triggeredMilestones
          : [];
        if (milestones.length > 0) {
          const msgs = milestones.map(m => `连续${m}天奖励已发放！`);
          if (result.data.protectionCardsEarned > 0) {
            msgs.push(`获得 ${result.data.protectionCardsEarned} 张保护卡！`);
          }
          alert(msgs.join('\n'));
        }

        // V1.6: 结算成功后弹出今日鼓励信
        console.log('[Letter] settle success, about to show parent letter modal', child.id, currentDate);
        try {
          await renderParentLetterSection(child, currentDate);
          await showEncouragementLetterModal(child, currentDate, { auto: true });
        } catch (letterErr) {
          console.error('[Confirm] 鼓励信弹窗异常（不影响结算）:', letterErr);
        }
      } else {
        alert('结算失败：' + result.error);
        btn.textContent = '✅ 确认结算';
        btn.disabled = false;
      }
    } catch (err) {
      console.error('[Confirm] Settle error:', err);
      alert('结算失败：' + err.message);
      btn.textContent = '✅ 确认结算';
      btn.disabled = false;
    }
  }

  // ═══════════════════════════════════════════
  //  V1.6: 今日鼓励信
  // ═══════════════════════════════════════════

  /** 鼓励信快捷模板 */
  const PARENT_LETTER_TEMPLATES = [
    { id: 'effort_seen',       text: '今天你坚持完成了任务，我看到了你的努力。' },
    { id: 'not_give_up',       text: '今天有点不容易，但你没有放弃，这很重要。' },
    { id: 'good_start',        text: '我喜欢你今天认真开始的样子。' },
    { id: 'small_progress',    text: '今天你有一个小进步，我看见了。' },
    { id: 'team_together',     text: '谢谢你今天愿意配合，我们明天继续当队友。' },
    { id: 'tomorrow_continue', text: '今天我们一起完成了一些事，明天继续加油。' }
  ];

  /**
   * 弹出写鼓励信弹窗
   */
  async function showEncouragementLetterModal(child, date, options = {}) {
    const { auto = false, force = false } = options;
    console.log('[Letter] showEncouragementLetterModal called', child.id, date, { auto, force });

    const existingLetter = await DB.getParentLetter(child.id, date);

    // 自动弹窗：如果已有来信，跳过
    if (auto && existingLetter) {
      console.log('[Letter] existing letter found, skip auto prompt', existingLetter);
      return;
    }

    const modal = document.getElementById('global-modal');
    const content = document.getElementById('global-modal-content');

    // 预填已有内容
    const prefillContent = existingLetter ? existingLetter.content : '';
    const prefillAuthor = existingLetter ? (existingLetter.authorName || '') : '';
    const isEditing = !!existingLetter;

    content.innerHTML = `
      <div class="letter-editor-modal">
        <h2 class="letter-editor-title">${isEditing ? '💌 查看 / 修改今日鼓励信' : '💌 写一封今天的鼓励信'}</h2>
        <p class="letter-editor-hint">只写鼓励，不写批评。一句话也可以，孩子会很喜欢。</p>

        <div class="letter-templates-grid" id="letter-templates-grid">
          ${PARENT_LETTER_TEMPLATES.map(t => `
            <button class="letter-template-chip" data-template-text="${t.text.replace(/"/g, '&quot;')}">
              ${t.text}
            </button>
          `).join('')}
        </div>

        <textarea
          id="letter-content-input"
          class="letter-content-textarea"
          placeholder="例如：今天你坚持完成了任务，我看到了你的努力。"
          maxlength="120"
          rows="4"
        >${prefillContent.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}</textarea>

        <div class="letter-editor-meta">
          <span class="letter-char-count">
            <span id="letter-char-current">${prefillContent.length}</span> / 120 字
          </span>
          <input
            type="text"
            id="letter-author-input"
            class="letter-author-input"
            placeholder="署名（选填）"
            maxlength="10"
            value="${prefillAuthor.replace(/"/g, '&quot;')}"
          >
        </div>

        <div class="letter-editor-buttons">
          <button class="btn btn-secondary" id="letter-skip-btn">${auto ? '今天先不写' : '关闭'}</button>
          <button class="btn btn-primary" id="letter-save-btn">${isEditing ? '更新来信' : '保存来信'}</button>
        </div>
      </div>
    `;

    modal.classList.add('active');
    console.log('[Letter] parent letter modal opened');

    // ── 字数计数 ──
    const textarea = document.getElementById('letter-content-input');
    const charCount = document.getElementById('letter-char-current');

    textarea.addEventListener('input', () => {
      const len = textarea.value.length;
      charCount.textContent = len;
      charCount.style.color = len > 120 ? 'var(--color-danger)' : 'var(--color-text-muted)';
    });

    // ── 模板点击 ──
    document.querySelectorAll('.letter-template-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        textarea.value = chip.dataset.templateText;
        charCount.textContent = textarea.value.length;
        charCount.style.color = 'var(--color-text-muted)';
        document.querySelectorAll('.letter-template-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
      });
    });

    // ── 保存按钮 ──
    document.getElementById('letter-save-btn').onclick = async () => {
      const contentVal = textarea.value.trim();
      const authorName = document.getElementById('letter-author-input').value.trim();

      if (!contentVal) {
        alert('请至少写一句话哦');
        return;
      }
      if (contentVal.length > 120) {
        alert(`内容不能超过120字，当前${contentVal.length}字`);
        return;
      }

      try {
        await DB.upsertParentLetter({
          childId: child.id,
          date: date,
          content: contentVal,
          authorName: authorName || '爸爸妈妈'
        });
        console.log('[Letter] 鼓励信已保存');
        modal.classList.remove('active');
        await renderParentLetterSection(child, date);
      } catch (err) {
        console.error('[Letter] 鼓励信保存失败:', err);
        alert('保存失败：' + (err.message || '未知错误'));
      }
    };

    // ── 跳过/关闭按钮 ──
    document.getElementById('letter-skip-btn').onclick = () => {
      modal.classList.remove('active');
    };

    // ── 点击遮罩关闭 ──
    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('active');
    };
  }

  /**
   * V1.6: 渲染家长端「今日鼓励信」固定入口
   * V2.1: 未结算时也显示入口（提示写信），已结算显示完整状态
   */
  async function renderParentLetterSection(child, date) {
    const container = document.getElementById('confirm-parent-letter');
    if (!container) return;

    container.style.display = 'block';
    const letter = await DB.getParentLetter(child.id, date);

    if (!currentSummary && !letter) {
      // 未结算且未写信：显示轻提示入口
      container.innerHTML = `
        <div class="parent-letter-card">
          <div class="plc-header">
            <span class="plc-icon">💌</span>
            <span class="plc-title">今天还没有写鼓励信</span>
          </div>
          <button class="btn btn-secondary btn-sm" id="parent-letter-write-btn">写一封今日来信</button>
        </div>`;
      document.getElementById('parent-letter-write-btn').onclick = () => {
        showEncouragementLetterModal(child, date, { force: true });
      };
    } else if (!letter) {
      // 已结算但未写信
      container.innerHTML = `
        <div class="parent-letter-card">
          <div class="plc-header">
            <span class="plc-icon">💌</span>
            <span class="plc-title">今日鼓励信</span>
          </div>
          <p class="plc-hint">给孩子写一句今天的鼓励吧。</p>
          <button class="btn btn-primary btn-sm" id="parent-letter-write-btn">写今日鼓励信</button>
        </div>`;
      document.getElementById('parent-letter-write-btn').onclick = () => {
        showEncouragementLetterModal(child, date, { force: true });
      };
    } else if (letter.readStatus === 'unread') {
      container.innerHTML = `
        <div class="parent-letter-card saved unread">
          <div class="plc-header">
            <span class="plc-icon">💌</span>
            <span class="plc-title">今日来信已准备好</span>
          </div>
          <p class="plc-hint">孩子还没有读。</p>
          <button class="btn btn-secondary btn-sm" id="parent-letter-edit-btn">查看 / 修改</button>
        </div>`;
      document.getElementById('parent-letter-edit-btn').onclick = () => {
        showEncouragementLetterModal(child, date, { force: true });
      };
    } else {
      container.innerHTML = `
        <div class="parent-letter-card saved read">
          <div class="plc-header">
            <span class="plc-icon">📭</span>
            <span class="plc-title">今日鼓励信已读</span>
          </div>
          <p class="plc-hint">孩子已经读过啦。</p>
          <button class="btn btn-secondary btn-sm" id="parent-letter-edit-btn">查看 / 修改</button>
        </div>`;
      document.getElementById('parent-letter-edit-btn').onclick = () => {
        showEncouragementLetterModal(child, date, { force: true });
      };
    }
  }

  // ═══════════════════════════════════════════
  //  V1.5: 家长成长反馈渲染（V2.1: 折叠入口卡）
  // ═══════════════════════════════════════════

  function getScoreEmoji(score) {
    if (score === 3) return '🌟';
    if (score === 2) return '🙂';
    return '😐';
  }

  function getScoreLabel(score) {
    if (score === 3) return '做得很好';
    if (score === 2) return '还不错';
    return '今天一般';
  }

  async function getConsecutiveParentDays(childId, date) {
    const allScores = await DB.getAllParentScores(childId);
    const dateSet = new Set(allScores.map(s => s.date));
    const sorted = [...dateSet].sort((a, b) => b.localeCompare(a));

    let consecutive = 0;
    let expectedDate = date;
    for (const d of sorted) {
      if (d === expectedDate) {
        consecutive++;
        expectedDate = Utils.addDays(expectedDate, -1);
      } else if (d < expectedDate) {
        break;
      }
    }
    return consecutive;
  }

  function getBadgeInfo(consecutiveDays) {
    const BADGES = [
      { days: 3,  name: '小队友徽章',          icon: '🤝' },
      { days: 7,  name: '家庭能量徽章',        icon: '⚡' },
      { days: 14, name: '超级合作家庭徽章',    icon: '🏆' }
    ];

    let currentBadge = null;
    let nextBadge = null;
    let nextRemaining = 0;

    for (const badge of BADGES) {
      if (consecutiveDays >= badge.days) {
        currentBadge = badge;
      } else {
        nextBadge = badge;
        nextRemaining = badge.days - consecutiveDays;
        break;
      }
    }

    return { currentBadge, nextBadge, nextRemaining, allBadges: BADGES };
  }

  /** 渲染家长成长反馈区域（V2.1: 折叠入口卡） */
  async function renderParentGrowthSection(child, date) {
    const container = document.getElementById('confirm-parent-growth');
    if (!container) return;

    // 移除旧样式类，使用新的统一卡片样式
    container.className = '';
    container.style.display = 'block';

    const parentScore = await DB.getParentScore(child.id, date);

    if (!parentScore) {
      // 无评分数据
      container.innerHTML = `
        <div class="parent-growth-entry">
          <div class="growth-entry-header foldable" data-fold-key="parent-growth">
            <span class="fold-arrow">▶</span>
            <span class="growth-entry-icon">👨‍👩‍👧</span>
            <span class="growth-entry-label">今天爸爸妈妈表现怎么样？</span>
            <span class="growth-entry-hint">孩子还没打分</span>
          </div>
          <div class="growth-entry-body collapsed">
            <div class="growth-empty-hint">孩子完成所有任务后会给家长打分，届时这里会显示评分详情。</div>
          </div>
        </div>`;
      return;
    }

    // ── 连续天数 & 徽章 ──
    const consecutiveDays = await getConsecutiveParentDays(child.id, date);
    const badgeInfo = getBadgeInfo(consecutiveDays);

    // ── 7 天能量条 ──
    const sevenDaysAgo = Utils.addDays(date, -6);
    const recentScores = await DB.getParentScoresInRange(child.id, sevenDaysAgo, date);
    const recentTotal = recentScores.reduce((sum, s) => sum + s.totalScore, 0);
    const maxPossible = 63;
    const barPercent = Math.min(100, Math.round((recentTotal / maxPossible) * 100));

    // 构建评分项展示
    const ratingItems = [
      { key: 'speakGently',     label: '好好说话',  score: parentScore.speakGently },
      { key: 'listenCarefully', label: '认真倾听',  score: parentScore.listenCarefully },
      { key: 'playTogether',    label: '陪玩运动',  score: parentScore.playTogether }
    ];

    const ratingSummaryHtml = ratingItems.map(item => `
      <div class="parent-rating-item-display">
        <span class="pr-emoji">${getScoreEmoji(item.score)}</span>
        <span>${item.label}</span>
        <span class="pr-label">${item.score}分 · ${getScoreLabel(item.score)}</span>
      </div>
    `).join('');

    // 夸夸卡
    const complimentHtml = parentScore.feedbackCardText ? `
      <div class="compliment-card-display">
        <span class="cc-label">💌 孩子今天送给你的卡</span>
        ${parentScore.feedbackCardText}
      </div>
    ` : '';

    // 明日任务
    const tomorrowHtml = parentScore.selectedTomorrowTaskText ? `
      <div class="tomorrow-task-display">
        <span class="tt-label">📋 明天孩子希望你努力</span>
        ${parentScore.selectedTomorrowTaskText}
      </div>
    ` : '';

    // 徽章展示
    let badgesHtml = '';
    if (badgeInfo.allBadges) {
      badgesHtml = '<div class="parent-badges-section"><div class="pb-header">🏅 连续合作徽章</div>';
      badgesHtml += `<div class="pb-stats">连续合作 <strong>${consecutiveDays}</strong> 天</div>`;

      for (const badge of badgeInfo.allBadges) {
        const isEarned = consecutiveDays >= badge.days;
        badgesHtml += `
          <div class="badge-card ${isEarned ? 'earned' : 'locked'}">
            <span class="badge-icon">${badge.icon}</span>
            <div class="badge-info">
              <div class="badge-name">${badge.name}</div>
              <div class="badge-desc">${isEarned ? '已解锁 ✓' : `还差 ${badge.days - consecutiveDays} 天解锁`}</div>
            </div>
          </div>`;
      }
      badgesHtml += '</div>';
    }

    const isExpanded = uiState.showParentGrowth;
    container.innerHTML = `
      <div class="parent-growth-entry">
        <div class="growth-entry-header foldable" data-fold-key="parent-growth"
             style="border-left: 3px solid var(--color-bonus);">
          <span class="fold-arrow ${isExpanded ? 'open' : ''}">▶</span>
          <span class="growth-entry-icon">👨‍👩‍👧</span>
          <span class="growth-entry-label">今日成长分 ${parentScore.totalScore} / 9</span>
          <span class="growth-entry-action">${isExpanded ? '收起' : '查看详情'}</span>
        </div>
        <div class="growth-entry-body ${isExpanded ? '' : 'collapsed'}">
          <div class="parent-rating-total">
            今日成长分：${parentScore.totalScore} / 9
            <div class="pr-sub">${parentScore.familyEnergyText}</div>
          </div>

          <div class="parent-rating-summary">
            ${ratingSummaryHtml}
          </div>

          <div class="parent-family-energy">
            <div class="pfe-header">
              <span class="pfe-label">最近 7 天家庭能量</span>
              <span class="pfe-value">${recentTotal} / ${maxPossible}</span>
            </div>
            <div class="pfe-bar-wrap">
              <div class="pfe-bar-fill" style="width:${barPercent}%;"></div>
            </div>
            <div class="pfe-text">连续合作 ${consecutiveDays} 天${badgeInfo.currentBadge ? ' · 当前徽章：' + badgeInfo.currentBadge.name : ''}</div>
          </div>

          ${complimentHtml}
          ${tomorrowHtml}
          ${badgesHtml}
        </div>
      </div>
    `;

    // 绑定折叠事件
    const header = container.querySelector('.growth-entry-header');
    if (header) {
      header.addEventListener('click', () => {
        const body = header.querySelector('.growth-entry-body');
        const arrow = header.querySelector('.fold-arrow');
        const action = header.querySelector('.growth-entry-action');
        const isNowOpen = !body.classList.contains('collapsed');
        body.classList.toggle('collapsed', isNowOpen);
        arrow.classList.toggle('open', !isNowOpen);
        if (action) action.textContent = isNowOpen ? '查看详情' : '收起';
        uiState.showParentGrowth = !isNowOpen;
      });
    }
  }

  // ─── 公开 API ───
  return {
    render
  };

})();
