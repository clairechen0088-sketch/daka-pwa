// src/ui/children/challenge.js – 今日挑战页 V3
// 暑假任务打卡积分系统 V3
// 三大板块大卡片布局 + 提交给家长确认按钮
// V1.5: 家长成长评分系统

const ChallengePage = (() => {

  let currentTasks = [];
  let currentSummary = null;
  let currentDate = null;

  // 已完成任务折叠状态（页面渲染期间保持）
  let expandedCompletedSections = new Set();

  // 分类模块折叠状态（页面渲染期间保持，默认全部折叠）
  let expandedSections = new Set();

  // 今日战报弹窗：每次页面会话最多弹出一次
  let _battleReportShownToday = false;

  // V1.6: 来信到达大弹窗：每次页面会话最多弹出一次
  let _letterArrivalShownToday = false;

  // ═══════════════════════════════════════════
  //  V1.5: 家长成长评分常量与状态
  // ═══════════════════════════════════════════

  /** 3 项评分定义 */
  const PARENT_RATING_ITEMS = [
    { key: 'speakGently',     label: '今天有没有好好说话？',       emojiLabels: ['😐','🙂','🌟'], scoreLabels: ['今天一般','还不错','做得很好'], scores: [1, 2, 3] },
    { key: 'listenCarefully', label: '今天有没有认真听我说？',     emojiLabels: ['😐','🙂','🌟'], scoreLabels: ['今天一般','还不错','做得很好'], scores: [1, 2, 3] },
    { key: 'playTogether',    label: '今天有没有陪我运动/玩耍？', emojiLabels: ['😐','🙂','🌟'], scoreLabels: ['今天一般','还不错','做得很好'], scores: [1, 2, 3] }
  ];

  /** 8 张夸夸卡 */
  const PARENT_FEEDBACK_CARDS = [
    { id: 'control_temper',   text: '今天你有努力控制脾气' },
    { id: 'listen_me',        text: '今天你有认真听我说话' },
    { id: 'play_happy',       text: '今天你陪我玩的时候我很开心' },
    { id: 'gentle_reminder',  text: '今天你提醒我的方式比较温柔' },
    { id: 'you_improved',     text: '今天我觉得你有进步' },
    { id: 'team_feeling',     text: '今天我们有一点像队友' },
    { id: 'thank_you',        text: '谢谢你今天陪着我' },
    { id: 'try_again',        text: '今天有点难，但我们明天再试试' }
  ];

  /** 18 个明日任务池 */
  const PARENT_TOMORROW_TASKS = [
    { id: 'speak_gently',           category: '情绪',     text: '明天提醒我时尽量好好说话' },
    { id: 'breathe_before_angry',   category: '情绪',     text: '明天生气前先深呼吸一次' },
    { id: 'no_immediate_criticism', category: '情绪',     text: '明天不要一上来就批评我' },
    { id: 'listen_full',            category: '沟通',     text: '明天听我把一件事讲完' },
    { id: 'ask_my_opinion',         category: '沟通',     text: '明天问问我的想法' },
    { id: 'let_me_explain',         category: '沟通',     text: '明天让我解释一次，不要马上否定' },
    { id: 'play_15min',             category: '陪伴',     text: '明天陪我玩 15 分钟' },
    { id: 'small_game',             category: '陪伴',     text: '明天和我一起做一个小游戏' },
    { id: 'bedtime_chat',           category: '陪伴',     text: '明天睡前陪我聊 5 分钟' },
    { id: 'exercise_together',      category: '运动',     text: '明天陪我运动一下' },
    { id: 'walk_jump_ball',         category: '运动',     text: '明天陪我散步 / 跳绳 / 打球' },
    { id: 'sport_challenge',        category: '运动',     text: '明天和我完成一个运动挑战' },
    { id: 'choose_order',           category: '学习支持', text: '明天让我自己选学习顺序' },
    { id: 'hint_first',             category: '学习支持', text: '明天我卡住时先提示，不直接批评' },
    { id: 'praise_once',            category: '学习支持', text: '明天完成后认真夸我一次' },
    { id: 'repair_after_conflict',  category: '修复',     text: '如果吵架了，晚上和我和好' },
    { id: 'say_sorry_if_angry',     category: '修复',     text: '如果你发脾气了，可以跟我说一句对不起' },
    { id: 'restart_together',       category: '修复',     text: '如果我做得不好，我们一起重新开始' }
  ];

  /** V1.5 状态 */
  let parentRatings = {};            // { speakGently:0, listenCarefully:0, playTogether:0 }
  let selectedComplimentCard = null; // { id, text } | null
  let selectedTomorrowTask = null;   // { id, text, category } | null
  let tomorrowTaskPoolShown = [];    // 当前展示的 6 个任务
  let tomorrowTaskRefreshCount = 0;  // 换一批次数
  let parentScoreToday = null;       // 今天是否已评分

  /** 根据 totalScore 返回家庭能量文本 */
  function getFamilyEnergyText(totalScore) {
    if (totalScore >= 8) return '今天是高能家庭日 🌟';
    if (totalScore >= 6) return '今天合作还不错 🙂';
    return '今天还有进步空间，明天继续加油 😐';
  }

  /** 评分 emoji 映射 */
  function getRatingEmoji(score) {
    if (score === 3) return '🌟';
    if (score === 2) return '🙂';
    return '😐';
  }

  /** 随机选取 N 个任务，可排除某些 ID */
  function pickRandomTomorrowTasks(count, excludeIds) {
    const available = PARENT_TOMORROW_TASKS.filter(t => !excludeIds.includes(t.id));
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  // ─── 四大模块配置 ───
  const SECTION_CONFIG = [
    { key:'today_required',    label:'📋 今日必做',   borderColor:'#60a5fa', icon:'📋' },
    { key:'english_energy',    label:'📚 英语能量',   borderColor:'#4ade80', icon:'📚' },
    { key:'sports_challenge',  label:'🏃 运动挑战',   borderColor:'#fb923c', icon:'🏃' },
    { key:'extra_bonus',       label:'⭐ 额外加分',   borderColor:'#c084fc', icon:'⭐' }
  ];

  /** 获取任务所属 section
   *  优先：task.section（从模板复制而来）
   *  其次：通过 taskTemplateId 精确映射
   *  最后：通过 groupKey/name 模糊推断 */
  function getTaskSection(task) {
    if (task.section) return task.section;

    const tid = task.taskTemplateId || '';
    // 精确映射：已知任务 ID
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

    // 模糊推断
    const gk = (task.groupKey || '').toLowerCase();
    const cat = (task.category || '').toLowerCase();
    const name = (task.taskName || '').toLowerCase();
    const combined = gk + cat + name;
    if (/sport|bigsport|smallsport|运动|跳绳|跑步|轮滑|户外/.test(combined)) return 'sports_challenge';
    if (/熏听|动画|cartoon|精读|泛读|复述|listening/.test(gk + name)) return 'english_energy';
    if (/家务|阅读加分|额外训练|额外任务|加分项|bonus|extra|chore/.test(combined)) return 'extra_bonus';
    return 'today_required';
  }

  // ─── 渲染入口 ───
  async function render() {
    const child = App.getCurrentChild();
    const config = App.getCurrentConfig();
    if (!child || !config) return;

    // 从 pointRecords 重算当前余额
    child.currentBalance = await DB.calcCurrentBalance(child.id);

    currentDate = Utils.getToday(config.dayCutoffHour);
    const dayOfWeek = Utils.getDayOfWeek(currentDate);

    // ── V1.5: 重置家长评分状态 ──
    parentRatings = { speakGently: 0, listenCarefully: 0, playTogether: 0 };
    selectedComplimentCard = null;
    selectedTomorrowTask = null;
    tomorrowTaskPoolShown = [];
    tomorrowTaskRefreshCount = 0;
    parentScoreToday = await DB.getParentScore(child.id, currentDate);

    // 更新状态栏
    updateStatusBar(child);

    // 更新日期显示
    document.getElementById('challenge-date').textContent =
      `${currentDate} 星期${['','一','二','三','四','五','六','日'][dayOfWeek]}`;

    // 生成每日任务（自动同步 + 过滤 inactiveToday）
    currentTasks = await DB.generateDailyTasks(child.id, currentDate, dayOfWeek);
    // 安全过滤：确保不显示已停用模板的任务
    currentTasks = currentTasks.filter(t => !t.inactiveToday);
    currentSummary = await DB.getDailySummary(child.id, currentDate);

    // 渲染页面状态
    renderPageState();

    // ★ 预加载熏听规则缓存
    await getListeningRules();

    // 渲染进度摘要
    renderProgressSummary();

    // 渲染推荐先做
    renderRecommendedTasks();

    // 渲染任务列表
    renderTaskList();

    // 渲染提交按钮
    renderSubmitButton();

    // 更新预计得分
    await updateEstimate();

    // ★ 一次性绑定折叠事件委托（容器不随 renderTaskList 重建）
    setupCollapseDelegate();
  }

  let _collapseDelegateInstalled = false;
  function setupCollapseDelegate() {
    if (_collapseDelegateInstalled) return;
    const container = document.getElementById('challenge-task-list');
    if (!container) return;
    container.addEventListener('click', bindCollapseToggle);
    _collapseDelegateInstalled = true;
  }

  // ─── 今日总进度主卡（首屏核心视觉中心）───
  function renderProgressSummary() {
    const el = document.getElementById('challenge-progress-summary');
    if (!el) return;

    const completedCount = currentTasks.filter(t => t.childChecked).length;
    const totalCount = currentTasks.length;
    if (totalCount === 0) { el.innerHTML = ''; return; }

    const pct = Math.round(completedCount / totalCount * 100);

    // 计算预计得分（同步自 updateEstimate 逻辑）
    let estimate = 0;
    for (const task of currentTasks) {
      if (task.childChecked) {
        if (task.taskType === 'checkbox') {
          estimate += task.plannedPoints || 0;
        } else if (task.taskType === 'duration' && task.durationMinutes > 0) {
          // 简化估算：duration 暂不在此处计算，updateEstimate 会补
        }
      }
    }

    // 引导语
    const remaining = totalCount - completedCount;
    let guideText = '';
    if (completedCount === 0) {
      guideText = '先从最简单的一项开始吧 💪';
    } else if (remaining > 0) {
      guideText = `再完成 ${remaining} 项就很棒啦 ✨`;
    } else {
      guideText = '全部完成，太棒了！🎉';
    }

    el.className = 'main-progress-card';
    el.innerHTML = `
      <div class="mpc-header">
        <span class="mpc-title">今日挑战</span>
        <span class="mpc-estimate" id="mpc-estimate">${estimate > 0 ? `预计 +${estimate} 分` : ''}</span>
      </div>
      <div class="mpc-stats">
        <span class="mpc-count">已完成 <strong>${completedCount}</strong> / ${totalCount}</span>
        <span class="mpc-pct">${pct}%</span>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="mpc-guide">${guideText}</div>
    `;
  }

  // ─── 推荐先做：取前 3 个未完成任务 ───
  function renderRecommendedTasks() {
    const el = document.getElementById('challenge-recommended');
    if (!el) return;

    if (currentSummary || currentTasks.length === 0) {
      el.style.display = 'none';
      return;
    }

    // 按分类优先级 + sortOrder 排序，取未完成的任务
    const sectionPriority = ['today_required', 'english_energy', 'sports_challenge', 'extra_bonus'];
    const getSectionOrder = (task) => {
      const idx = sectionPriority.indexOf(getTaskSection(task));
      return idx >= 0 ? idx : 99;
    };

    const uncheckedTasks = currentTasks
      .filter(t => !t.childChecked)
      .sort((a, b) => {
        const secDiff = getSectionOrder(a) - getSectionOrder(b);
        if (secDiff !== 0) return secDiff;
        const soA = a.sortOrder != null ? a.sortOrder : 99;
        const soB = b.sortOrder != null ? b.sortOrder : 99;
        if (soA !== soB) return soA - soB;
        return (a.taskName || '').localeCompare(b.taskName || '');
      });

    const top3 = uncheckedTasks.slice(0, 3);

    if (top3.length === 0) {
      el.style.display = 'none';
      return;
    }

    el.style.display = 'block';

    // ★ P1: duration/stepper 任务使用"快捷入口"卡片，不渲染假的分值卡
    const renderRecCard = (task) => {
      const sectionKey = getTaskSection(task);
      if (task.taskType === 'duration') {
        return `
          <div class="rec-card rec-duration-entry" data-task-id="${task.id}" data-task-type="duration" data-task-section="${sectionKey}">
            <span class="rec-icon">${task.taskIcon}</span>
            <div class="rec-info">
              <span class="rec-name">${task.taskName}</span>
              <span class="rec-meta">⏱ ${Utils.formatMinutes(task.suggestedMinutes)} · 点击跳转到计时卡</span>
            </div>
            <span class="rec-action">去记录 →</span>
          </div>`;
      }
      // 普通 checkbox 任务：保持原逻辑
      return `
        <div class="rec-card" data-task-id="${task.id}" data-task-type="checkbox">
          <span class="rec-icon">${task.taskIcon}</span>
          <div class="rec-info">
            <span class="rec-name">${task.taskName}</span>
            <span class="rec-meta">⏱ ${Utils.formatMinutes(task.suggestedMinutes)}</span>
          </div>
          <span class="rec-points">+${task.plannedPoints || 0}分</span>
        </div>`;
    };

    el.innerHTML = `
      <div class="rec-header">✨ 推荐先做</div>
      <div class="rec-list">
        ${top3.map(renderRecCard).join('')}
      </div>
    `;

    // 绑定点击事件
    bindRecommendedEvents();
  }

  function bindRecommendedEvents() {
    const container = document.getElementById('challenge-recommended');
    if (!container) return;

    // ★ P1: duration 快捷入口 — 点击后跳转到真实任务卡
    container.querySelectorAll('.rec-duration-entry').forEach(card => {
      card.addEventListener('click', async (e) => {
        e.stopPropagation();
        const taskId = card.dataset.taskId;
        const sectionKey = card.dataset.taskSection;
        if (!taskId || !sectionKey) return;
        await navigateToRealTask(taskId, sectionKey);
      });
    });

    // 普通 checkbox 推荐卡 — 保持原逻辑
    container.querySelectorAll('.rec-card:not(.rec-duration-entry)').forEach(card => {
      card.addEventListener('click', async () => {
        const taskId = card.dataset.taskId;
        const task = currentTasks.find(t => t.id === taskId);
        if (!task || task.taskType === 'duration') return;

        const newChecked = !task.childChecked;
        task.childChecked = newChecked;
        task.childCheckTime = newChecked ? Utils.nowISO() : null;

        // 捕获动画坐标
        let floatX, floatY;
        if (newChecked) {
          const r = card.getBoundingClientRect();
          floatX = r.left + r.width / 2;
          floatY = r.top;
        }

        // 重新渲染
        renderTaskList();
        renderRecommendedTasks();
        renderPageState();
        renderProgressSummary();
        renderSubmitButton();
        updateEstimate();

        if (newChecked && floatX != null) {
          showPointFloat(floatX, floatY, `+${task.plannedPoints || 0} ✨`);
        }

        // 异步持久化
        try {
          await DB.db.dailyTasks.update(taskId, {
            childChecked: newChecked,
            childCheckTime: newChecked ? Utils.nowISO() : null
          });
        } catch (err) {
          console.error('[Challenge] Recommended DB update failed, rolling back:', err);
          task.childChecked = !newChecked;
          task.childCheckTime = newChecked ? null : Utils.nowISO();
          renderTaskList();
          renderRecommendedTasks();
          renderPageState();
          renderProgressSummary();
          renderSubmitButton();
          updateEstimate();
        }
      });
    });
  }

  // ★ P1: duration 任务快捷入口 — 展开分类 → 定位 → 高亮真实任务卡
  function navigateToRealTask(taskId, sectionKey) {
    // 1. 展开该任务所属分类
    expandedSections.add(sectionKey);

    // 2. 重新渲染任务列表（展开 section 后真实任务卡才可见）
    renderTaskList();
    renderRecommendedTasks();
    renderPageState();
    renderProgressSummary();
    renderSubmitButton();
    updateEstimate();

    // 3. 等待 DOM 更新完成后定位 + 高亮
    //    requestAnimationFrame 确保布局完成，setTimeout 作为兜底
    requestAnimationFrame(() => {
      setTimeout(() => {
        // ★ 精确选择器：只选 #challenge-task-list 内的真实任务卡
        const escapedId = CSS.escape(taskId);
        const realCard = document.querySelector(
          `#challenge-task-list .big-task-card[data-task-id="${escapedId}"]`
        );
        if (!realCard) return;

        // 滚动到真实任务卡
        realCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 高亮 1.5 秒
        realCard.classList.add('highlight-flash');
        setTimeout(() => {
          realCard.classList.remove('highlight-flash');
        }, 1500);
      }, 50);
    });
  }
  const AVATAR_LIST = [
    { id:'football',   name:'足球男孩', file:'avatar-football.svg' },
    { id:'basketball', name:'篮球男孩', file:'avatar-basketball.svg' },
    { id:'robot',      name:'机器人',   file:'avatar-robot.svg' },
    { id:'dinosaur',   name:'恐龙',     file:'avatar-dinosaur.svg' },
    { id:'astronaut',  name:'宇航员',   file:'avatar-astronaut.svg' },
    { id:'racing',     name:'赛车',     file:'avatar-racing.svg' },
    { id:'skateboard', name:'滑板',     file:'avatar-skateboard.svg' },
    { id:'gamepad',    name:'游戏手柄', file:'avatar-gamepad.svg' }
  ];

  const AVATAR_MAP = {};
  for (const a of AVATAR_LIST) {
    AVATAR_MAP[a.id] = `./assets/avatars/${a.file}`;
  }

  // ─── 状态栏（精简：头像+昵称、积分、来信入口）───
  function updateStatusBar(child) {
    const avatarEl = document.getElementById('challenge-avatar');
    const avatarId = child.avatarId || 'football';
    const avatarUrl = AVATAR_MAP[avatarId] || AVATAR_MAP['football'];
    if (avatarEl) {
      avatarEl.innerHTML = `<img src="${avatarUrl}" alt="avatar" class="avatar-img" style="width:28px;height:28px;border-radius:50%;object-fit:cover;cursor:pointer;" title="点击修改资料">`;
      avatarEl.style.cursor = 'pointer';
      avatarEl.onclick = (e) => {
        e.stopPropagation();
        showChildProfileModal(child);
      };
    }
    document.getElementById('challenge-name').textContent = child.name || '小朋友';
    // 隐藏等级徽章（精简状态栏）
    const levelEl = document.getElementById('challenge-level');
    if (levelEl) levelEl.style.display = 'none';
    document.getElementById('challenge-points').textContent = child.currentBalance || 0;

    // 连续天数 → 移入状态栏但保留（轻量显示）
    DB.getStreak(child.id).then(streak => {
      const streakEl = document.getElementById('challenge-streak');
      if (streakEl) {
        streakEl.textContent = `${streak ? streak.current : 0}天`;
        if (streak && streak.current > 0) {
          streakEl.style.display = '';
        } else {
          streakEl.style.display = 'none';
        }
      }
    });

    // V1.6: 今日来信入口
    updateLetterBadge(child);
  }

  /** V1.6: 更新今日来信入口状态 */
  async function updateLetterBadge(child) {
    const badge = document.getElementById('challenge-letter-badge');
    const badgeText = document.getElementById('challenge-letter-badge-text');
    if (!badge || !badgeText) return;

    try {
      const letter = await DB.getParentLetter(child.id, currentDate);
      if (!letter) {
        badge.style.display = 'none';
        return;
      }

      badge.style.display = 'flex';
      if (letter.readStatus === 'unread') {
        badge.className = 'letter-badge unread';
        badgeText.textContent = '你收到一封今日来信';
        // ★ V1.6: 弹出大动画弹窗（每页面会话仅一次）
        if (!_letterArrivalShownToday) {
          _letterArrivalShownToday = true;
          showLetterArrivalPopup(child, letter);
        }
      } else {
        badge.className = 'letter-badge read';
        badgeText.textContent = '今日来信已读';
      }

      // 绑定点击事件
      badge.onclick = (e) => {
        e.stopPropagation();
        showLetterReadingModal(child, letter);
      };
    } catch (err) {
      console.error('[Challenge] 获取鼓励信失败:', err);
      badge.style.display = 'none';
    }
  }

  /** V1.6: 来信到达大弹窗 — 进入页面时弹出，抓眼球 */
  function showLetterArrivalPopup(child, letter) {
    // 使用独立 overlay，不占用 global-modal
    const overlay = document.createElement('div');
    overlay.className = 'letter-arrival-overlay';
    overlay.id = 'letter-arrival-overlay';

    overlay.innerHTML = `
      <div class="letter-arrival-card">
        <div class="letter-arrival-sparkles">
          <span class="arrival-sparkle">✨</span>
          <span class="arrival-sparkle">⭐</span>
          <span class="arrival-sparkle">💫</span>
          <span class="arrival-sparkle">✨</span>
          <span class="arrival-sparkle">🌟</span>
          <span class="arrival-sparkle">💫</span>
        </div>
        <span class="letter-arrival-envelope">💌</span>
        <div class="letter-arrival-title">爸爸妈妈给你写信啦！</div>
        <div class="letter-arrival-subtitle">快来看看吧~</div>
        <button class="letter-arrival-btn" id="letter-arrival-read-btn">查看来信 💌</button>
        <button class="letter-arrival-later" id="letter-arrival-later-btn">稍后再看</button>
      </div>
    `;

    document.body.appendChild(overlay);

    // 查看来信 → 关闭到达弹窗 → 打开读信弹窗
    document.getElementById('letter-arrival-read-btn').onclick = () => {
      overlay.remove();
      showLetterReadingModal(child, letter);
    };

    // 稍后再看 → 关闭弹窗（状态栏信封入口仍在）
    document.getElementById('letter-arrival-later-btn').onclick = () => {
      overlay.remove();
    };

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  /** V1.6: 读信弹窗 */
  function showLetterReadingModal(child, letter) {
    const modal = document.getElementById('global-modal');
    const content = document.getElementById('global-modal-content');
    const authorName = letter.authorName || '爸爸妈妈';

    // 安全的纯文本转义
    const escHtml = (s) => {
      if (!s) return '';
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    };

    content.innerHTML = `
      <div class="letter-reading-modal">
        <div class="letter-reading-icon">💌</div>
        <h2 class="letter-reading-title">爸爸妈妈给你的今日来信</h2>
        <div class="letter-reading-date">${escHtml(letter.date)}</div>
        <div class="letter-reading-content">
          ${escHtml(letter.content)}
        </div>
        <div class="letter-reading-author">
          —— ${escHtml(authorName)}
        </div>
        <button class="btn btn-primary btn-large letter-read-done-btn" id="letter-read-done-btn">
          我读完啦 ❤️
        </button>
      </div>
    `;

    modal.classList.add('active');

    document.getElementById('letter-read-done-btn').onclick = async () => {
      try {
        await DB.markParentLetterRead(child.id, letter.date);
      } catch (err) {
        console.error('[Challenge] 标记已读失败:', err);
      }
      modal.classList.remove('active');
      // 刷新来信入口
      await updateLetterBadge(child);
    };

    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('active');
    };
  }

  // ─── 孩子资料弹窗 ───
  function showChildProfileModal(child) {
    const modal = document.getElementById('global-modal');
    const content = document.getElementById('global-modal-content');
    const currentAvatarId = child.avatarId || 'football';

    // 安全的 HTML 转义
    const escHtml = (s) => {
      if (!s) return '';
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    };

    const avatarGrid = AVATAR_LIST.map(a => `
      <button class="avatar-option ${a.id === currentAvatarId ? 'selected' : ''}"
              data-avatar-id="${a.id}" title="${escHtml(a.name)}">
        <img src="./assets/avatars/${a.file}" alt="${escHtml(a.name)}">
      </button>
    `).join('');

    content.innerHTML = `
      <h2>我的资料</h2>
      <div style="text-align:left;">
        <div class="settings-item">
          <label>昵称</label>
          <input type="text" id="profile-child-name" value="${escHtml(child.name)}" style="width:200px;" maxlength="16" placeholder="输入昵称">
        </div>
        <p id="profile-name-hint" style="font-size:10px;color:var(--color-text-muted);margin-top:2px;">最多8个中文字或16个英文字</p>
        <div class="section-title" style="margin-top:var(--space-md);">选择头像</div>
        <div class="avatar-picker" id="profile-avatar-picker">
          ${avatarGrid}
        </div>
        <input type="hidden" id="profile-avatar-id" value="${currentAvatarId}">
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" id="profile-cancel">取消</button>
        <button class="btn btn-primary" id="profile-save">保存</button>
      </div>
    `;

    modal.classList.add('active');

    // 头像选择事件
    document.querySelectorAll('#profile-avatar-picker .avatar-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#profile-avatar-picker .avatar-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('profile-avatar-id').value = btn.dataset.avatarId;
      });
    });

    document.getElementById('profile-cancel').onclick = () => modal.classList.remove('active');

    document.getElementById('profile-save').onclick = async () => {
      const name = document.getElementById('profile-child-name').value.trim();
      const avatarId = document.getElementById('profile-avatar-id').value || 'football';
      const hint = document.getElementById('profile-name-hint');

      // 昵称校验
      if (!name) {
        hint.textContent = '昵称不能为空';
        hint.style.color = 'var(--color-danger)';
        return;
      }

      // 长度校验：中文算2字符，英文算1字符
      let charLen = 0;
      for (const ch of name) {
        charLen += /[一-鿿＀-￯]/.test(ch) ? 2 : 1;
      }
      if (charLen > 16) {
        hint.textContent = '昵称太长啦，换一个短一点的吧';
        hint.style.color = 'var(--color-danger)';
        return;
      }

      await DB.updateChild(child.id, { name, avatarId });
      await App.refreshState();
      modal.classList.remove('active');
      // 刷新页面状态栏
      const updated = await DB.getActiveChild();
      if (updated) {
        document.getElementById('challenge-name').textContent = updated.name || '小朋友';
        const avatarUrl = AVATAR_MAP[updated.avatarId || 'football'] || AVATAR_MAP['football'];
        const avatarEl = document.getElementById('challenge-avatar');
        if (avatarEl) {
          avatarEl.innerHTML = `<img src="${avatarUrl}" alt="avatar" class="avatar-img" style="width:32px;height:32px;border-radius:50%;object-fit:cover;cursor:pointer;" title="点击修改资料">`;
          avatarEl.onclick = (e) => {
            e.stopPropagation();
            showChildProfileModal(updated);
          };
        }
      }
    };

    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('active');
    };
  }

  // ─── 页面状态渲染 ───
  async function renderPageState() {
    const banner = document.getElementById('challenge-state-banner');
    const title = document.getElementById('challenge-title');
    const page = document.getElementById('page-challenge');

    page.classList.remove('confirmed', 'rest-day');
    banner.className = 'state-banner';

    if (currentTasks.length === 0) {
      const child = App.getCurrentChild();
      const config = App.getCurrentConfig();
      if (child && config) {
        const dayOfWeek = Utils.getDayOfWeek(currentDate);
        const matchingTemplates = (await DB.db.taskTemplates
          .where('active').equals(1)
          .toArray())
          .filter(t => t.weekdays && t.weekdays.includes(dayOfWeek));
        if (matchingTemplates.length > 0) {
          banner.className = 'state-banner error';
          banner.innerHTML = '⚠️ 任务生成失败，请刷新或进入家长设置检查任务模板';
          title.textContent = '今日挑战';
          return;
        }
      }
      banner.className = 'state-banner rest-day';
      banner.innerHTML = '🌴 今天休息日，没有安排任务';
      title.textContent = '休息日';
      page.classList.add('rest-day');
      return;
    }

    if (currentSummary) {
      banner.className = 'state-banner confirmed';
      banner.innerHTML = `✨ 今日已结算！获得 <strong>${currentSummary.totalEarnedPoints}</strong> 分`;
      title.textContent = '今日挑战 ✅';
      page.classList.add('confirmed');
      return;
    }

    // ★ 核心模块完成检查：今日必做 + 英语能量 → 弹出战报
    const requiredTasks = currentTasks.filter(t => getTaskSection(t) === 'today_required');
    const englishTasks = currentTasks.filter(t => getTaskSection(t) === 'english_energy');
    const requiredDone = requiredTasks.length === 0 || requiredTasks.every(t => t.childChecked);
    const englishDone  = englishTasks.length  === 0 || englishTasks.every(t  => t.childChecked);
    const coreDone = requiredTasks.length > 0 && requiredDone && englishDone;

    if (coreDone) {
      showBattleReport();
    }

    const allChecked = currentTasks.every(t => t.childChecked);
    if (allChecked && currentTasks.length > 0) {
      banner.className = 'state-banner all-done';
      banner.innerHTML = '🎉 全部任务已完成！<br>点击下方按钮提交给家长确认 ✨';
      title.textContent = '今日挑战 🎉';
      spawnConfetti();
      return;
    }

    const someChecked = currentTasks.some(t => t.childChecked);
    if (someChecked) {
      banner.className = 'state-banner in-progress';
      banner.innerHTML = '⏳ 加油！还有任务没完成哦';
      title.textContent = '今日挑战';
      return;
    }

    banner.className = 'state-banner in-progress';
    banner.innerHTML = '💪 开始今天的挑战吧！';
    title.textContent = '今日挑战';
  }

  // ─── 渲染提交按钮 ───
  function renderSubmitButton() {
    const container = document.getElementById('challenge-submit-area');
    if (!container) return;

    if (currentSummary) {
      container.innerHTML = `
        <div class="submit-done-bar">
          ✅ 今日已结算
        </div>`;
      document.getElementById('challenge-parent-rating').style.display = 'none';
      return;
    }

    if (currentTasks.length === 0) {
      container.innerHTML = '';
      document.getElementById('challenge-parent-rating').style.display = 'none';
      return;
    }

    const checkedCount = currentTasks.filter(t => t.childChecked).length;
    const remaining = currentTasks.length - checkedCount;
    const allChecked = remaining === 0 && currentTasks.length > 0;

    // ── V1.5: 核心任务完成检查（仅今日必做）──
    const requiredTasks = currentTasks.filter(t => getTaskSection(t) === 'today_required');
    const requiredDone = requiredTasks.length === 0 || requiredTasks.every(t => t.childChecked);
    const coreDone = requiredTasks.length > 0 && requiredDone;

    // ── V1.5: 晚上 9 点后自动开放评分入口 ──
    const now = new Date();
    const isAfter9PM = now.getHours() >= 21;

    // 家长评分区显示条件：核心任务完成 或 晚上 9 点后
    const showParentRating = coreDone || isAfter9PM;

    if (showParentRating) {
      // ── 如果今天已经评过分，显示只读状态（紧凑卡片）──
      if (parentScoreToday) {
        document.getElementById('challenge-parent-rating').style.display = 'none';
        renderParentRatingDoneCard();
        container.innerHTML = `
          <div class="submit-done-bar">
            ✅ 今日成长反馈已提交
          </div>`;
        return;
      }

      // ── 隐藏内联评分区，改为入口卡片 ──
      document.getElementById('challenge-parent-rating').style.display = 'none';

      // 检查是否可以提交
      const canSubmit = parentRatings.speakGently > 0
        && parentRatings.listenCarefully > 0
        && parentRatings.playTogether > 0
        && selectedTomorrowTask !== null;

      const filledCount = [parentRatings.speakGently, parentRatings.listenCarefully, parentRatings.playTogether]
        .filter(s => s > 0).length;

      if (canSubmit) {
        const btnLabel = allChecked
          ? '📨 提交给家长确认'
          : `📨 提交成长反馈（还有 ${remaining} 项任务未完成）`;
        const btnHint = allChecked
          ? '提交后需要家长确认才能获得积分'
          : `核心任务已完成，剩余 ${remaining} 项可选任务可稍后补上`;

        container.innerHTML = `
          <button class="btn btn-large btn-primary btn-submit-ready" id="challenge-submit-btn">
            ${btnLabel}
          </button>
          <p class="text-accent text-center" style="font-size:12px;margin-top:4px;">${btnHint}</p>`;
      } else {
        // ★ 收纳为入口卡片
        container.innerHTML = `
          <div class="parent-rating-entry-card" id="parent-rating-entry">
            <div class="prec-header">
              <span class="prec-icon">⭐</span>
              <span class="prec-title">今天爸爸妈妈表现怎么样？</span>
            </div>
            <div class="prec-status">已评 ${filledCount}/3 项${selectedTomorrowTask ? ' · 已选明日任务' : ''}</div>
            <button class="btn btn-primary btn-sm" id="prec-open-btn">去打星</button>
          </div>`;
        // 绑定入口点击 → 打开评分 modal
        setTimeout(() => {
          const entryBtn = document.getElementById('prec-open-btn');
          const entryCard = document.getElementById('parent-rating-entry');
          const openModal = () => showParentRatingModal();
          if (entryBtn) entryBtn.onclick = openModal;
          if (entryCard) entryCard.onclick = (e) => { if (e.target === entryCard) openModal(); };
        }, 0);
      }
    } else {
      // 还没到触发时机：核心任务未完成且不到晚上 9 点
      document.getElementById('challenge-parent-rating').style.display = 'none';
      container.innerHTML = `
        <div class="submit-hint-bar">
          🏆 还有 <strong>${remaining}</strong> 项未完成（完成核心任务或晚上9点后可提交成长反馈）
        </div>`;
    }

    // 绑定提交事件
    const btn = document.getElementById('challenge-submit-btn');
    if (btn && showParentRating && !parentScoreToday) {
      btn.addEventListener('click', async () => {
        const canSubmitNow = parentRatings.speakGently > 0
          && parentRatings.listenCarefully > 0
          && parentRatings.playTogether > 0
          && selectedTomorrowTask !== null;
        if (!canSubmitNow) return;
        await handleSubmitAll();
      });
    }
  }

  // ─── 任务列表渲染（四大模块分类折叠 + 已完成折叠）───
  function renderTaskList() {
    const container = document.getElementById('challenge-task-list');
    if (!container) return;

    if (currentTasks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🌴</span>
          <span class="empty-text">今天没有安排任务，好好休息吧！</span>
        </div>`;
      return;
    }

    const isConfirmed = !!currentSummary;

    // 按 section 分组
    const sections = {};
    for (const task of currentTasks) {
      const section = getTaskSection(task);
      if (!sections[section]) sections[section] = [];
      sections[section].push(task);
    }

    // 每个 section 内部按 sortOrder 排序（sortOrder 相同则按 taskName）
    for (const key of Object.keys(sections)) {
      sections[key].sort((a, b) => {
        const soA = a.sortOrder != null ? a.sortOrder : 99;
        const soB = b.sortOrder != null ? b.sortOrder : 99;
        if (soA !== soB) return soA - soB;
        return (a.taskName || '').localeCompare(b.taskName || '');
      });
    }

    let html = '';

    for (const config of SECTION_CONFIG) {
      const tasks = sections[config.key];
      const totalCount = tasks ? tasks.length : 0;
      const completedCount = tasks ? tasks.filter(t => t.childChecked).length : 0;
      const allDone = totalCount > 0 && completedCount === totalCount;
      const isExpanded = expandedSections.has(config.key);

      // 空模块：只显示极简折叠行（不可展开）
      if (!tasks || tasks.length === 0) {
        html += `
          <div class="section-block section-block-empty" data-section="${config.key}">
            <div class="section-header-bar section-header-fold" style="border-left-color:${config.borderColor};">
              <span class="section-header-icon">${config.icon}</span>
              <span class="section-header-label">${config.label.replace(/^[^\s]+\s*/, '')}</span>
              <span class="section-header-count">0/0</span>
              <span class="section-fold-arrow">-</span>
            </div>
          </div>`;
        continue;
      }

      // 折叠箭头
      const foldArrow = isExpanded ? '▼' : '▶';

      html += `
        <div class="section-block" data-section="${config.key}">
          <div class="section-header-bar section-header-fold" style="border-left-color:${config.borderColor};">
            <span class="section-header-icon">${config.icon}</span>
            <span class="section-header-label">${config.label.replace(/^[^\s]+\s*/, '')}</span>
            <span class="section-header-count ${allDone ? 'all-done' : ''}">${completedCount}/${totalCount}</span>
            <span class="section-fold-arrow">${foldArrow}</span>
          </div>`;

      if (isExpanded) {
        // 熏听(duration)任务即使已打卡也保留在原模块展示区，不折叠到"已完成"
        const pendingTasks = tasks.filter(t => !t.childChecked || t.taskType === 'duration');
        const completedTasks = tasks.filter(t => t.childChecked && t.taskType !== 'duration');
        const compExpanded = expandedCompletedSections.has(config.key);

        html += `
          <div class="section-body">
            ${pendingTasks.map(task => renderBigTaskCard(task, isConfirmed)).join('')}
          </div>
          ${completedTasks.length > 0 ? `
            <button class="section-completed-toggle" data-section="${config.key}">
              <span class="collapse-arrow">${compExpanded ? '▼' : '▶'}</span>
              ${allDone ? `本组已完成 <strong>${completedTasks.length}</strong> 项，点击${compExpanded ? '收起' : '查看'}` : `✓ 已完成 <strong>${completedTasks.length}</strong> 项，点击${compExpanded ? '收起' : '展开'}`}
            </button>
            ${compExpanded ? `<div class="section-body section-body-completed">${completedTasks.map(task => renderBigTaskCard(task, isConfirmed)).join('')}</div>` : ''}
          ` : ''}`;
      }

      html += `</div>`;
    }

    container.innerHTML = html;

    // 绑定任务事件（在折叠事件之前）
    bindTaskEvents(isConfirmed);
  }

  // ─── 折叠/展开事件委托（已完成任务 + 分类折叠）───
  function bindCollapseToggle(e) {
    // 处理分类标题折叠/展开
    const sectionHeader = e.target.closest('.section-header-fold');
    if (sectionHeader) {
      e.stopPropagation();
      const sectionBlock = sectionHeader.closest('.section-block');
      if (!sectionBlock) return;
      // 空模块不可展开
      if (sectionBlock.classList.contains('section-block-empty')) return;
      const sectionKey = sectionBlock.dataset.section;
      if (!sectionKey) return;

      if (expandedSections.has(sectionKey)) {
        expandedSections.delete(sectionKey);
      } else {
        expandedSections.add(sectionKey);
      }

      renderTaskList();
      renderRecommendedTasks();
      renderPageState();
      renderProgressSummary();
      renderSubmitButton();
      updateEstimate();
      return;
    }

    // 处理已完成任务折叠/展开
    const btn = e.target.closest('.section-completed-toggle');
    if (!btn) return;
    e.stopPropagation();

    const sectionKey = btn.dataset.section;
    if (expandedCompletedSections.has(sectionKey)) {
      expandedCompletedSections.delete(sectionKey);
    } else {
      expandedCompletedSections.add(sectionKey);
    }

    // 重新渲染任务列表（保持折叠状态在 Set 中）
    renderTaskList();
    renderRecommendedTasks();
    renderPageState();
    renderProgressSummary();
    renderSubmitButton();
    updateEstimate();
  }

  // ─── 大卡片任务渲染 ───
  function renderBigTaskCard(task, isConfirmed) {
    const isChecked = task.childChecked;
    const parentApproved = task.parentStatus === 'approved';

    let statusBadge = '';
    let cardClass = 'big-task-card';

    if (isConfirmed && parentApproved) {
      statusBadge = '<span class="big-task-badge badge-approved">✓ 已通过</span>';
      cardClass += ' approved';
    } else if (isConfirmed && !parentApproved) {
      statusBadge = '<span class="big-task-badge badge-rejected">✗ 未通过</span>';
      cardClass += ' rejected';
    } else if (isChecked) {
      statusBadge = '<span class="big-task-badge badge-checked">✓ 已完成</span>';
      cardClass += ' checked';
    }

    const ptsStr = task.taskType === 'checkbox' ? `+${task.plannedPoints}分` : '按时间';

    // Duration 任务（熏听）
    let extraContent = '';
    if (task.taskType === 'duration') {
      cardClass += ' duration-task';
      extraContent = renderListeningCounter(task, isConfirmed);
    }

    return `
      <div class="${cardClass}" data-task-id="${task.id}" data-template-id="${task.taskTemplateId}">
        <div class="big-card-top">
          <div class="big-task-icon">${task.taskIcon}</div>
          <div class="big-task-info">
            <div class="big-task-name">${task.taskName}</div>
            <div class="big-task-meta">
              <span>⏱ ${Utils.formatMinutes(task.suggestedMinutes)}</span>
            </div>
          </div>
          <div class="big-task-right">
            <div class="big-task-points">${ptsStr}</div>
            ${statusBadge}
          </div>
        </div>
        ${extraContent}
      </div>`;
  }

  // ─── 熏听计数器（复用 V2 逻辑）───
  let _cachedListeningRules = null;

  async function getListeningRules() {
    if (_cachedListeningRules) return _cachedListeningRules;
    const rulesConfig = await DB.getRulesConfig();
    _cachedListeningRules = rulesConfig ? rulesConfig.listeningRules : null;
    return _cachedListeningRules;
  }

  function renderListeningCounter(task, isConfirmed) {
    const minutes = task.durationMinutes || 0;
    const listeningRules = _cachedListeningRules;
    const tier = getListeningTier(minutes, listeningRules);

    return `
      <div class="listening-counter" onclick="event.stopPropagation()">
        <button class="counter-btn minus" data-task-id="${task.id}"
                ${isConfirmed || minutes <= 0 ? 'disabled' : ''}>−</button>
        <div class="counter-display">
          <span class="counter-minutes">${minutes}</span>
          <span class="counter-label">分钟</span>
        </div>
        <button class="counter-btn plus" data-task-id="${task.id}"
                ${isConfirmed ? 'disabled' : ''}>+</button>
        <div class="listening-tier">
          ${renderTierDots(tier, listeningRules)}
        </div>
      </div>`;
  }

  function getListeningTier(minutes, listeningRules) {
    if (!minutes || minutes <= 0) return { level: 0, points: 0 };
    if (!listeningRules || listeningRules.length === 0) return { level: 0, points: 0 };
    for (let i = 0; i < listeningRules.length; i++) {
      const rule = listeningRules[i];
      if (minutes >= rule.minMinutes && minutes <= rule.maxMinutes) {
        return { level: i + 1, points: rule.points };
      }
    }
    const lastRule = listeningRules[listeningRules.length - 1];
    if (minutes > lastRule.maxMinutes) {
      return { level: listeningRules.length, points: lastRule.points };
    }
    return { level: 0, points: 0 };
  }

  function renderTierDots(currentTier, listeningRules) {
    const maxLevel = listeningRules ? listeningRules.length : 6;
    const levels = [{ lv: 0, label: '0' }];
    for (let i = 0; i < maxLevel; i++) {
      levels.push({ lv: i + 1, label: String(i + 1) });
    }
    return levels.map(l => {
      const isActive = l.lv === currentTier.level;
      const isPast = l.lv < currentTier.level;
      let cls = 'tier-dot';
      if (isActive) cls += ' active';
      else if (isPast) cls += ' past';
      return `<span class="${cls}">${l.label}</span>`;
    }).join('');
  }

  // ─── 绑定任务事件（乐观更新）───
  function bindTaskEvents(isConfirmed) {
    if (isConfirmed) return;

    const container = document.getElementById('challenge-task-list');
    if (!container) return;

    // Checkbox 任务：点击卡片切换打卡状态
    container.querySelectorAll('.big-task-card').forEach(card => {
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.listening-counter')) return;

        const taskId = card.dataset.taskId;
        const task = currentTasks.find(t => t.id === taskId);
        if (!task || task.taskType === 'duration') return;

        const newChecked = !task.childChecked;
        task.childChecked = newChecked;
        task.childCheckTime = newChecked ? Utils.nowISO() : null;

        // ★ 在重绘前捕获卡片屏幕位置（重绘后卡片可能被折叠隐藏）
        let floatX, floatY;
        if (newChecked) {
          const origCard = container.querySelector(`[data-task-id="${taskId}"]`);
          if (origCard) {
            const r = origCard.getBoundingClientRect();
            floatX = r.left + r.width / 2;
            floatY = r.top;
          }
        }

        // 立即重新渲染
        renderTaskList();
        renderRecommendedTasks();
        renderPageState();
        renderProgressSummary();
        renderSubmitButton();
        await updateEstimate();

        // 积分飞出 — 使用预捕获坐标，全局可见
        if (newChecked && floatX != null) {
          const pts = task.plannedPoints || 0;
          showPointFloat(floatX, floatY, `+${pts} ✨`);

          // 补一个轻量卡片脉冲（如果卡片仍在可见区域）
          const newCard = container.querySelector(`[data-task-id="${taskId}"]`);
          if (newCard) {
            newCard.classList.add('check-anim');
            setTimeout(() => newCard.classList.remove('check-anim'), 500);
          }
        }

        // 异步持久化
        try {
          await DB.db.dailyTasks.update(taskId, {
            childChecked: newChecked,
            childCheckTime: newChecked ? Utils.nowISO() : null
          });
        } catch (err) {
          console.error('[Challenge] DB update failed, rolling back:', err);
          task.childChecked = !newChecked;
          task.childCheckTime = newChecked ? null : Utils.nowISO();
          renderTaskList();
          renderRecommendedTasks();
          renderPageState();
          renderProgressSummary();
          renderSubmitButton();
          updateEstimate();
        }
      });
    });

    // 熏听计数器 +/- 按钮
    container.querySelectorAll('.counter-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const taskId = btn.dataset.taskId;
        const task = currentTasks.find(t => t.id === taskId);
        if (!task || task.taskType !== 'duration') return;

        const delta = btn.classList.contains('plus') ? 30 : -30;
        const newMinutes = Math.max(0, (task.durationMinutes || 0) + delta);
        const maxMinutes = 180;
        const clamped = Math.min(newMinutes, maxMinutes);

        task.durationMinutes = clamped;
        task.childChecked = clamped > 0;
        task.childCheckTime = clamped > 0 ? Utils.nowISO() : null;

        // ★ 每次点 + 都在重绘前捕获卡片屏幕位置
        const isPlus = delta > 0;
        let durFloatX, durFloatY;
        if (isPlus) {
          const origCard = container.querySelector(`[data-task-id="${taskId}"]`);
          if (origCard) {
            const r = origCard.getBoundingClientRect();
            durFloatX = r.left + r.width / 2;
            durFloatY = r.top;
          }
        }

        renderTaskList();
        renderRecommendedTasks();
        renderPageState();
        renderProgressSummary();
        renderSubmitButton();
        await updateEstimate();

        // 每次点 + 都飞出提示
        if (isPlus && durFloatX != null) {
          showPointFloat(durFloatX, durFloatY, `+30 分钟 ⚡`, true);
        }

        try {
          await DB.db.dailyTasks.update(taskId, {
            durationMinutes: clamped,
            childChecked: clamped > 0,
            childCheckTime: clamped > 0 ? Utils.nowISO() : null
          });
        } catch (err) {
          console.error('[Challenge] Counter DB update failed, rolling back:', err);
          task.durationMinutes = (task.durationMinutes || 0) - delta;
          task.childChecked = task.durationMinutes > 0;
          task.childCheckTime = task.durationMinutes > 0 ? Utils.nowISO() : null;
          renderTaskList();
          renderRecommendedTasks();
          renderPageState();
          renderProgressSummary();
          renderSubmitButton();
          await updateEstimate();
        }
      });
    });
  }

  // ─── 预计积分估算 ───
  function estimateListening(minutes, listeningRules, cap) {
    if (!minutes || minutes <= 0) return 0;
    const result = Rules.calcListeningPoints(minutes, listeningRules, cap);
    return result.capped;
  }

  async function updateEstimate() {
    const bar = document.getElementById('challenge-estimate');

    if (currentSummary || currentTasks.length === 0) {
      if (bar) bar.style.display = 'none';
      return;
    }

    const rulesConfig = await DB.getRulesConfig();
    const listeningRules = rulesConfig ? rulesConfig.listeningRules : [];
    const listeningCap = rulesConfig ? rulesConfig.caps.listeningCap : 5;

    let estimate = 0;
    for (const task of currentTasks) {
      if (task.childChecked) {
        if (task.taskType === 'checkbox') {
          estimate += task.plannedPoints;
        } else if (task.taskType === 'duration' && task.durationMinutes > 0) {
          estimate += estimateListening(task.durationMinutes, listeningRules, listeningCap);
        }
      }
    }

    // 更新主进度卡中的预计得分
    const mpcEstimate = document.getElementById('mpc-estimate');
    if (mpcEstimate) {
      mpcEstimate.textContent = estimate > 0 ? `预计 +${estimate} 分` : '';
    }

    // 保留底部预计得分栏（兼容）
    if (estimate > 0) {
      if (bar) bar.style.display = 'flex';
      const ptsEl = document.getElementById('challenge-estimate-points');
      if (ptsEl) ptsEl.textContent = `+${estimate}`;
    } else {
      if (bar) bar.style.display = 'none';
    }
  }

  // ─── 积分飞出动效 ───
  //  使用预捕获的屏幕坐标，不依赖 DOM 元素（避免卡片被折叠后取不到位置）
  function showPointFloat(x, y, text, isDuration = false) {
    if (x == null || y == null) return;
    const span = document.createElement('span');
    span.className = 'point-float' + (isDuration ? ' duration-float' : '');
    span.textContent = text;
    // 以传入坐标为中心偏上定位
    span.style.left = x + 'px';
    span.style.top = y + 'px';
    document.body.appendChild(span);
    span.addEventListener('animationend', () => span.remove());
  }

  // ─── 今日战报弹窗 ───
  function showBattleReport() {
    if (_battleReportShownToday) return;
    _battleReportShownToday = true;

    const totalCount = currentTasks.length;
    const checkedTasks = currentTasks.filter(t => t.childChecked);
    const completedCount = checkedTasks.length;

    // 预计积分：checkbox 任务累加 plannedPoints，duration 任务不纳入（结算时才知道最终分）
    let estimatedPts = 0;
    for (const task of checkedTasks) {
      if (task.taskType === 'checkbox') {
        estimatedPts += task.plannedPoints || 0;
      }
    }

    // 统计各模块完成情况
    function sectionStats(sectionKey) {
      const tasks = currentTasks.filter(t => getTaskSection(t) === sectionKey);
      if (tasks.length === 0) return null;
      const done = tasks.filter(t => t.childChecked).length;
      return { total: tasks.length, done, allDone: done === tasks.length };
    }

    const requiredStats = sectionStats('today_required');
    const englishStats = sectionStats('english_energy');

    const modal = document.getElementById('global-modal');
    const content = document.getElementById('global-modal-content');

    let statsHtml = '';
    statsHtml += `<div class="report-stat"><span>完成任务</span><strong>${completedCount} / ${totalCount}</strong></div>`;
    if (estimatedPts > 0) {
      statsHtml += `<div class="report-stat"><span>今日预计获得</span><span style="color:var(--color-accent);font-weight:700;font-size:var(--font-size-lg);">+${estimatedPts} 分</span></div>`;
    }
    if (requiredStats) {
      statsHtml += `<div class="report-stat ${requiredStats.allDone ? 'done' : ''}"><span>📋 今日必做</span><span>${requiredStats.done}/${requiredStats.total}${requiredStats.allDone ? ' ✓' : ''}</span></div>`;
    }
    if (englishStats) {
      statsHtml += `<div class="report-stat ${englishStats.allDone ? 'done' : ''}"><span>📚 英语能量</span><span>${englishStats.done}/${englishStats.total}${englishStats.allDone ? ' ✓' : ''}</span></div>`;
    }

    content.innerHTML = `
      <div class="battle-report-modal">
        <div class="report-title">🎉 今日挑战完成！</div>
        ${statsHtml}
        <div class="report-tip">📨 去提交给家长确认吧！</div>
        <p style="font-size:10px;color:var(--color-text-muted);margin-top:4px;">以上为预计积分，实际积分需家长确认结算</p>
        <button class="report-close-btn" id="battle-report-close">知道了 👍</button>
      </div>
    `;

    modal.classList.add('active');

    const closeBtn = document.getElementById('battle-report-close');
    if (closeBtn) {
      closeBtn.onclick = () => modal.classList.remove('active');
    }
    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('active');
    };

    // 不阻止原撒花
    spawnConfetti();
  }

  // ─── 庆祝撒花 ───
  function spawnConfetti() {
    const emojis = ['🎉', '✨', '🌟', '💫', '🎊', '⭐', '💪', '🔥'];
    const container = document.getElementById('page-challenge');
    for (let i = 0; i < 12; i++) {
      setTimeout(() => {
        const el = document.createElement('span');
        el.className = 'confetti';
        el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        el.style.left = Math.random() * 80 + 10 + '%';
        el.style.top = Math.random() * 40 + 20 + '%';
        el.style.animationDuration = (1 + Math.random() * 1.5) + 's';
        container.appendChild(el);
        setTimeout(() => el.remove(), 2000);
      }, i * 80);
    }
  }

  // ═══════════════════════════════════════════
  //  V1.5: 家长成长评分渲染函数
  // ═══════════════════════════════════════════

  /** 渲染 3 个评分项（每项 3 个大 emoji 按钮） */
  function renderParentRatingItems() {
    const container = document.getElementById('parent-rating-items');
    if (!container) return;

    let html = '';
    for (const item of PARENT_RATING_ITEMS) {
      const currentScore = parentRatings[item.key] || 0;
      html += `<div class="rating-item" data-rating-key="${item.key}">`;
      html += `<div class="rating-item-label">${item.label}</div>`;
      html += `<div class="rating-emoji-row">`;
      for (let i = 0; i < 3; i++) {
        const score = item.scores[i];
        const isSelected = currentScore === score;
        html += `
          <button class="rating-emoji-btn${isSelected ? ' selected' : ''}"
                  data-rating-key="${item.key}"
                  data-score="${score}">
            <span class="emoji">${item.emojiLabels[i]}</span>
            <span class="score-label">${item.scoreLabels[i]} · ${score}分</span>
          </button>`;
      }
      html += `</div></div>`;
    }
    container.innerHTML = html;

    // 绑定评分按钮事件
    container.querySelectorAll('.rating-emoji-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.dataset.ratingKey;
        const score = parseInt(btn.dataset.score);

        // 更新状态
        parentRatings[key] = score;

        // 更新 UI：该评分项内所有按钮的选中状态
        const parentItem = btn.closest('.rating-item');
        parentItem.querySelectorAll('.rating-emoji-btn').forEach(b => {
          b.classList.toggle('selected', parseInt(b.dataset.score) === score);
        });

        // 刷新提交按钮区域
        renderSubmitButton();
      });
    });
  }

  /** 渲染 8 张夸夸卡（可选，单选，可取消） */
  function renderComplimentCards() {
    const container = document.getElementById('compliment-grid');
    if (!container) return;

    const selectedId = selectedComplimentCard ? selectedComplimentCard.id : null;

    container.innerHTML = PARENT_FEEDBACK_CARDS.map(card => `
      <div class="compliment-card${card.id === selectedId ? ' selected' : ''}"
           data-card-id="${card.id}">
        <span class="cc-icon">💌</span>
        <span class="cc-text">${card.text}</span>
      </div>
    `).join('');

    // 绑定点击事件
    container.querySelectorAll('.compliment-card').forEach(cardEl => {
      cardEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const cardId = cardEl.dataset.cardId;

        if (cardId === selectedId) {
          // 取消选择
          selectedComplimentCard = null;
        } else {
          // 选择新卡
          const card = PARENT_FEEDBACK_CARDS.find(c => c.id === cardId);
          selectedComplimentCard = card || null;
        }

        // 刷新 UI
        renderComplimentCards();
      });
    });
  }

  /** 渲染 6 个随机明日任务（必选，单选） */
  function renderTomorrowTaskPool() {
    const container = document.getElementById('tomorrow-task-grid');
    if (!container) return;

    // 初始化或刷新任务池
    if (tomorrowTaskPoolShown.length === 0) {
      tomorrowTaskPoolShown = pickRandomTomorrowTasks(6, []);
      tomorrowTaskRefreshCount = 0;
    }

    const selectedId = selectedTomorrowTask ? selectedTomorrowTask.id : null;

    container.innerHTML = tomorrowTaskPoolShown.map(task => `
      <div class="tomorrow-task-card${task.id === selectedId ? ' selected' : ''}"
           data-task-id="${task.id}"
           data-task-text="${task.text.replace(/"/g, '&quot;')}"
           data-task-category="${task.category}">
        <span class="tt-icon">📋</span>
        <span class="tt-text">${task.text}</span>
      </div>
    `).join('');

    // 更新换一批按钮
    const refreshBtn = document.getElementById('tomorrow-task-refresh');
    const refreshCountEl = document.getElementById('refresh-count');
    if (refreshBtn && refreshCountEl) {
      const remaining = 2 - tomorrowTaskRefreshCount;
      if (remaining <= 0) {
        refreshBtn.disabled = true;
        refreshCountEl.textContent = '(0)';
      } else {
        refreshBtn.disabled = false;
        refreshCountEl.textContent = `(${remaining})`;
      }
    }

    // 绑定点击任务事件
    container.querySelectorAll('.tomorrow-task-card').forEach(cardEl => {
      cardEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = cardEl.dataset.taskId;

        if (taskId === selectedId) {
          // 取消选择（不允许取消，因为必选）
          return;
        } else {
          const task = PARENT_TOMORROW_TASKS.find(t => t.id === taskId);
          selectedTomorrowTask = task ? {
            id: task.id,
            text: task.text,
            category: task.category
          } : null;
        }

        // 刷新 UI
        renderTomorrowTaskPool();
        renderSubmitButton();
      });
    });

    // 绑定换一批按钮
    if (refreshBtn) {
      const newBtn = refreshBtn.cloneNode(true);
      refreshBtn.parentNode.replaceChild(newBtn, refreshBtn);
      newBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (tomorrowTaskRefreshCount >= 2) return;

        const excludeIds = selectedTomorrowTask ? [selectedTomorrowTask.id] : [];
        tomorrowTaskPoolShown = pickRandomTomorrowTasks(6, excludeIds);
        tomorrowTaskRefreshCount++;

        renderTomorrowTaskPool();
      });
    }
  }

  /** 已评分只读态 — 紧凑卡片版（收纳到提交区域） */
  function renderParentRatingDoneCard() {
    if (!parentScoreToday) return;
    const container = document.getElementById('challenge-submit-area');
    if (!container) return;

    const score = parentScoreToday.totalScore;
    const avgScore = Math.round(score / 3);
    const emoji = avgScore >= 3 ? '🌟' : (avgScore >= 2 ? '🙂' : '😐');

    // 在 done-bar 上方显示紧凑摘要
    const doneBar = container.querySelector('.submit-done-bar');
    if (doneBar) {
      doneBar.insertAdjacentHTML('beforebegin', `
        <div class="parent-rating-done-card">
          <span class="prdc-emoji">${emoji}</span>
          <span class="prdc-text">成长反馈已送出 · ${score}/9 颗成长星</span>
        </div>`);
    }
  }

  /** 家长评分 Modal — 收纳原内联评分区域 */
  function showParentRatingModal() {
    // 初始化明日任务池（如果尚未初始化）
    if (tomorrowTaskPoolShown.length === 0) {
      tomorrowTaskPoolShown = pickRandomTomorrowTasks(6, []);
      tomorrowTaskRefreshCount = 0;
    }

    const modal = document.getElementById('global-modal');
    const content = document.getElementById('global-modal-content');

    renderRatingModalContent(content);

    modal.classList.add('active');

    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('active');
    };
  }

  /** 渲染评分 modal 内容（含事件绑定） */
  function renderRatingModalContent(content) {
    // 评分项 HTML
    let ratingItemsHtml = '';
    for (const item of PARENT_RATING_ITEMS) {
      const currentScore = parentRatings[item.key] || 0;
      ratingItemsHtml += `<div class="rating-item" data-rating-key="${item.key}">`;
      ratingItemsHtml += `<div class="rating-item-label">${item.label}</div>`;
      ratingItemsHtml += `<div class="rating-emoji-row">`;
      for (let i = 0; i < 3; i++) {
        const score = item.scores[i];
        const isSelected = currentScore === score;
        ratingItemsHtml += `
          <button class="rating-emoji-btn${isSelected ? ' selected' : ''}"
                  data-rating-key="${item.key}" data-score="${score}">
            <span class="emoji">${item.emojiLabels[i]}</span>
            <span class="score-label">${item.scoreLabels[i]} · ${score}分</span>
          </button>`;
      }
      ratingItemsHtml += `</div></div>`;
    }

    // 夸夸卡
    const selectedCardId = selectedComplimentCard ? selectedComplimentCard.id : null;
    let complimentHtml = PARENT_FEEDBACK_CARDS.map(card => `
      <div class="compliment-card${card.id === selectedCardId ? ' selected' : ''}"
           data-card-id="${card.id}">
        <span class="cc-icon">💌</span>
        <span class="cc-text">${card.text}</span>
      </div>
    `).join('');

    // 明日任务
    const selectedTaskId = selectedTomorrowTask ? selectedTomorrowTask.id : null;
    let tomorrowHtml = tomorrowTaskPoolShown.map(task => `
      <div class="tomorrow-task-card${task.id === selectedTaskId ? ' selected' : ''}"
           data-task-id="${task.id}" data-task-text="${task.text.replace(/"/g, '&quot;')}" data-task-category="${task.category}">
        <span class="tt-icon">📋</span>
        <span class="tt-text">${task.text}</span>
      </div>
    `).join('');

    const remaining = 2 - tomorrowTaskRefreshCount;
    const refreshDisabled = remaining <= 0;

    // 检查是否可以提交
    const canSubmit = parentRatings.speakGently > 0
      && parentRatings.listenCarefully > 0
      && parentRatings.playTogether > 0
      && selectedTomorrowTask !== null;

    const filledCount = [parentRatings.speakGently, parentRatings.listenCarefully, parentRatings.playTogether]
      .filter(s => s > 0).length;

    content.innerHTML = `
      <div class="parent-rating-modal">
        <h2>今天爸爸妈妈表现怎么样？</h2>
        <div class="parent-rating-modal-body">
          ${ratingItemsHtml}

          <div class="compliment-section">
            <div class="compliment-header">💌 今天想送给爸爸妈妈哪张卡？（可选）</div>
            <div class="compliment-grid" id="modal-compliment-grid">
              ${complimentHtml}
            </div>
          </div>

          <div class="tomorrow-task-section">
            <div class="tomorrow-task-header">
              <span>📋 选一件明天想让爸爸妈妈努力的事</span>
              <button class="btn btn-secondary btn-sm" id="modal-tomorrow-refresh" ${refreshDisabled ? 'disabled' : ''}>🔄 换一批 <span id="modal-refresh-count">(${remaining})</span></button>
            </div>
            <div class="tomorrow-task-grid" id="modal-tomorrow-grid">
              ${tomorrowHtml}
            </div>
          </div>
        </div>

        <div class="modal-buttons" style="flex-direction:column;gap:8px;">
          ${canSubmit ? `
            <button class="btn btn-large btn-primary btn-submit-ready" id="modal-submit-btn">
              📨 提交成长反馈
            </button>
          ` : `
            <div class="submit-hint-bar">
              🏆 请完成评分和明日任务选择后提交（已评 ${filledCount}/3 项${selectedTomorrowTask ? '' : '，还需选明日任务'}）
            </div>
          `}
          <button class="btn btn-secondary" id="modal-rating-cancel">关闭</button>
        </div>
      </div>
    `;

    // ── 事件绑定 ──
    // 评分按钮
    content.querySelectorAll('.rating-emoji-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.dataset.ratingKey;
        const score = parseInt(btn.dataset.score);
        parentRatings[key] = score;
        // 重绘 modal 内容
        renderRatingModalContent(content);
      });
    });

    // 夸夸卡
    content.querySelectorAll('.compliment-card').forEach(cardEl => {
      cardEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const cardId = cardEl.dataset.cardId;
        if (cardId === selectedCardId) {
          selectedComplimentCard = null;
        } else {
          const card = PARENT_FEEDBACK_CARDS.find(c => c.id === cardId);
          selectedComplimentCard = card || null;
        }
        renderRatingModalContent(content);
      });
    });

    // 明日任务
    content.querySelectorAll('.tomorrow-task-card').forEach(cardEl => {
      cardEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = cardEl.dataset.taskId;
        if (taskId === selectedTaskId) return; // 不允许取消
        const task = PARENT_TOMORROW_TASKS.find(t => t.id === taskId);
        selectedTomorrowTask = task ? { id: task.id, text: task.text, category: task.category } : null;
        renderRatingModalContent(content);
      });
    });

    // 换一批
    const refreshBtn = content.querySelector('#modal-tomorrow-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (tomorrowTaskRefreshCount >= 2) return;
        const excludeIds = selectedTomorrowTask ? [selectedTomorrowTask.id] : [];
        tomorrowTaskPoolShown = pickRandomTomorrowTasks(6, excludeIds);
        tomorrowTaskRefreshCount++;
        renderRatingModalContent(content);
      });
    }

    // 提交按钮
    const submitBtn = content.querySelector('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const canSubmitNow = parentRatings.speakGently > 0
          && parentRatings.listenCarefully > 0
          && parentRatings.playTogether > 0
          && selectedTomorrowTask !== null;
        if (!canSubmitNow) return;
        document.getElementById('global-modal').classList.remove('active');
        await handleSubmitAll();
      });
    }

    // 关闭按钮
    const cancelBtn = content.querySelector('#modal-rating-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        document.getElementById('global-modal').classList.remove('active');
        // 刷新页面状态（可能需要重新显示入口卡）
        renderSubmitButton();
      });
    }
  }

  /** 已评分只读态（保留兼容原有 DOM 容器） */
  function renderParentRatingDone() {
    const container = document.getElementById('parent-rating-items');
    if (!container || !parentScoreToday) return;

    const score = parentScoreToday.totalScore;
    const avgScore = Math.round(score / 3);
    const emoji = avgScore >= 3 ? '🌟' : (avgScore >= 2 ? '🙂' : '😐');

    const detailParts = [];
    if (parentScoreToday.speakGently > 0) detailParts.push(`好好说话 ${'⭐'.repeat(parentScoreToday.speakGently)}`);
    if (parentScoreToday.listenCarefully > 0) detailParts.push(`认真倾听 ${'⭐'.repeat(parentScoreToday.listenCarefully)}`);
    if (parentScoreToday.playTogether > 0) detailParts.push(`陪玩运动 ${'⭐'.repeat(parentScoreToday.playTogether)}`);

    container.innerHTML = `
      <div class="parent-rating-done">
        <div class="done-icon">${emoji}</div>
        <div class="done-title">今天的成长反馈已送出</div>
        <div class="done-score">${score} / 9 颗成长星</div>
        <div class="done-detail">${detailParts.join(' · ') || ''}</div>
      </div>`;

    // 隐藏夸奖卡和明日任务区域
    const complimentSection = document.getElementById('compliment-section');
    const tomorrowSection = document.getElementById('tomorrow-task-section');
    if (complimentSection) complimentSection.style.display = 'none';
    if (tomorrowSection) tomorrowSection.style.display = 'none';
  }

  /** 提交：保存评分 + 跳转确认页 */
  async function handleSubmitAll() {
    const child = App.getCurrentChild();
    if (!child) return;

    const totalScore = parentRatings.speakGently + parentRatings.listenCarefully + parentRatings.playTogether;
    const energyText = getFamilyEnergyText(totalScore);

    // 保存 parentScores
    try {
      await DB.upsertParentScore({
        childId: child.id,
        date: currentDate,
        speakGently: parentRatings.speakGently,
        listenCarefully: parentRatings.listenCarefully,
        playTogether: parentRatings.playTogether,
        totalScore: totalScore,
        feedbackCardId: selectedComplimentCard ? selectedComplimentCard.id : null,
        feedbackCardText: selectedComplimentCard ? selectedComplimentCard.text : null,
        familyEnergyText: energyText,
        selectedTomorrowTaskId: selectedTomorrowTask ? selectedTomorrowTask.id : null,
        selectedTomorrowTaskText: selectedTomorrowTask ? selectedTomorrowTask.text : null
      });
    } catch (err) {
      console.error('[Challenge] Failed to save parentScore:', err);
    }

    // 显示庆祝弹窗
    await showParentRatingCelebration(totalScore);

    // 跳转到家长确认页
    if (typeof ConfirmPage !== 'undefined') {
      App.navigate(App.PAGES.CONFIRM);
    }
  }

  /** 庆祝弹窗：家庭能量条 + 7天统计 */
  async function showParentRatingCelebration(totalScore) {
    const child = App.getCurrentChild();
    if (!child) return;

    const energyText = getFamilyEnergyText(totalScore);

    // 计算最近 7 天总分
    const sevenDaysAgo = Utils.addDays(currentDate, -6);
    const recentScores = await DB.getParentScoresInRange(child.id, sevenDaysAgo, currentDate);
    const recentTotal = recentScores.reduce((sum, s) => sum + s.totalScore, 0);
    const maxPossible = 63; // 9 * 7
    const barPercent = Math.min(100, Math.round((recentTotal / maxPossible) * 100));

    const modal = document.getElementById('global-modal');
    const content = document.getElementById('global-modal-content');

    content.innerHTML = `
      <div class="battle-report-modal">
        <div class="report-title">📨 收到啦！</div>
        <div style="font-size:var(--font-size-sm);color:var(--color-text-secondary);margin-bottom:var(--space-sm);">
          爸爸妈妈今天获得了 <strong style="color:var(--color-accent);font-size:var(--font-size-lg);">${totalScore}</strong> 颗成长星
        </div>

        <div class="family-energy-section">
          <div class="family-energy-headline">${energyText}</div>
          <div class="family-energy-bar-wrap">
            <div class="family-energy-bar-fill" style="width:${barPercent}%;"></div>
          </div>
          <div class="family-energy-text">家庭能量 +${totalScore}</div>
          <div class="family-energy-stats">最近 7 天：${recentTotal} / ${maxPossible}</div>
        </div>

        ${selectedComplimentCard ? `
        <div class="compliment-card-display" style="margin-top:var(--space-sm);">
          💌 你送出的卡片：<strong>${selectedComplimentCard.text}</strong>
        </div>` : ''}

        ${selectedTomorrowTask ? `
        <div class="tomorrow-task-display" style="margin-top:var(--space-xs);">
          📋 明天想爸爸妈妈努力：<strong>${selectedTomorrowTask.text}</strong>
        </div>` : ''}

        <p style="font-size:10px;color:var(--color-text-muted);margin-top:var(--space-sm);">
          反馈已保存，家长可在确认页查看
        </p>
        <button class="report-close-btn" id="parent-rating-celebration-close">知道了 👍</button>
      </div>
    `;

    modal.classList.add('active');

    return new Promise(resolve => {
      const closeBtn = document.getElementById('parent-rating-celebration-close');
      if (closeBtn) {
        closeBtn.onclick = () => {
          modal.classList.remove('active');
          resolve();
        };
      }
      modal.onclick = (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
          resolve();
        }
      };
    });
  }

  // ─── 公开 API ───
  return {
    render
  };

})();
