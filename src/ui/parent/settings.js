// src/ui/parent/settings.js – 家长设置页 V3
// 暑假任务打卡积分系统 V3
// 孩子资料（含头像选择）+ 任务模板CRUD + rulesConfig + 备份 + PIN
// 注意：积分上限UI已删除（每日积分不封顶）

const SettingsPage = (() => {

  // ─── 头像映射 ───
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

  const SECTION_OPTIONS = [
    { value:'today_required',   label:'📋 今日必做' },
    { value:'english_energy',   label:'📚 英语能量' },
    { value:'sports_challenge', label:'🏃 运动挑战' },
    { value:'extra_bonus',      label:'⭐ 额外加分' }
  ];

  /** 获取某个 section 的下一个 sortOrder（按 10 的间隔） */
  async function getNextSortOrder(section) {
    const templates = await DB.getAllTemplates();
    const sectionTasks = templates.filter(t => (t.section || 'today_required') === section);
    if (sectionTasks.length === 0) return 10;
    const maxSort = Math.max(...sectionTasks.map(t => t.sortOrder || 0));
    return Math.ceil((maxSort + 10) / 10) * 10; // 取整到下一个 10 的倍数
  }

  /** 同步当天未结算 dailyTasks 并刷新状态
   *  使用系统 appDate（考虑 dayCutoffHour）*/
  async function syncAndRefresh() {
    try {
      const cfg = await DB.getAppConfig();
      const today = Utils.getAppDate(new Date(), cfg.dayCutoffHour || 4);
      const child = App.getCurrentChild();
      if (!child) return;
      await DB.syncTodayUnsettledDailyTasksFromTemplates(child.id, today);
      await App.refreshState();
      // 如果当前页面是今日挑战，重新渲染
      const challengePage = document.getElementById('page-challenge');
      if (challengePage && challengePage.classList.contains('active')) {
        if (typeof ChallengePage !== 'undefined') await ChallengePage.render();
      }
    } catch (err) {
      console.error('[Settings] syncAndRefresh failed:', err);
    }
  }

  // ─── 拖拽排序状态 ───
  let dragState = {
    active: false,
    startY: 0,
    currentY: 0,
    dragElement: null,
    cloneElement: null,
    sourceSection: null,
    sourceIndex: -1
  };

  // 分类展开/折叠状态：默认只展开「今日必做」
  let expandedSettingSections = new Set(['today_required']);

  // ─── 渲染入口 ───
  async function render() {
    const child = App.getCurrentChild();
    const config = App.getCurrentConfig();
    if (!child || !config) return;

    bindEvents(child, config);

    // 孩子信息（含头像）
    renderChildInfo(child);

    // 上次备份
    try {
      document.getElementById('settings-last-backup').textContent =
        await Backup.getLastBackupDesc();
      // 检查是否超过 7 天未备份，显示提醒
      const overdueEl = document.getElementById('settings-backup-overdue');
      if (overdueEl) {
        const overdue = await Backup.isBackupOverdue();
        overdueEl.style.display = overdue ? '' : 'none';
      }
    } catch (err) {
      console.warn('[Settings] backup info:', err);
    }

    // 任务模板
    try { await renderTemplates(); } catch (err) { console.error('[Settings] templates:', err); }

    // 规则
    try { await renderRules(); } catch (err) { console.error('[Settings] rules:', err); }
  }

  // ─── 孩子信息 ───
  function renderChildInfo(child) {
    const avatarId = child.avatarId || 'football';
    const avatarFile = AVATAR_LIST.find(a => a.id === avatarId)?.file || AVATAR_LIST[0].file;
    const el = document.getElementById('settings-child-name');
    if (el) {
      el.innerHTML = `<img src="./assets/avatars/${avatarFile}" alt="avatar" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:6px;"> ${child.name || '小朋友'}`;
    }
    // 提示：孩子可点击首页头像修改资料
    const hintEl = document.getElementById('settings-child-hint');
    if (hintEl) {
      hintEl.textContent = '💡 孩子也可点击首页头像修改昵称和头像';
    }
  }

  // ─── 渲染任务模板（CRUD）- 分类折叠 + 轻概览 + 任务行压缩 ───
  async function renderTemplates() {
    const container = document.getElementById('settings-templates-list');
    const templates = await DB.getAllTemplates();

    // 按 section 分组
    const sections = { today_required:[], english_energy:[], sports_challenge:[], extra_bonus:[] };
    for (const t of templates) {
      const sec = t.section || 'today_required';
      if (sections[sec]) sections[sec].push(t);
      else sections['today_required'].push(t);
    }

    // ── 顶部轻概览 ──
    const activeCount = templates.filter(t => t.active).length;
    let html = `<div class="settings-overview-bar">
      <span class="overview-item">📋 启用 <strong>${activeCount}</strong></span>
      <span class="overview-sep">·</span>
      <span class="overview-item">必做 <strong>${sections.today_required.length}</strong></span>
      <span class="overview-sep">·</span>
      <span class="overview-item">英语 <strong>${sections.english_energy.length}</strong></span>
      <span class="overview-sep">·</span>
      <span class="overview-item">运动 <strong>${sections.sports_challenge.length}</strong></span>
      <span class="overview-sep">·</span>
      <span class="overview-item">额外 <strong>${sections.extra_bonus.length}</strong></span>
    </div>`;

    // ── 分类区块 ──
    for (const sec of SECTION_OPTIONS) {
      const tasks = sections[sec.value];
      const isExpanded = expandedSettingSections.has(sec.value);
      const foldArrow = isExpanded ? '▼' : '▶';
      const activeInSection = tasks.filter(t => t.active).length;

      html += `<div class="settings-section-fold">
        <div class="settings-section-fold-header" data-settings-section="${sec.value}">
          <span class="settings-section-fold-arrow">${foldArrow}</span>
          <span class="settings-section-fold-label">${sec.label}</span>
          <span class="settings-section-fold-count">${activeInSection}/${tasks.length}</span>
        </div>`;

      if (isExpanded) {
        if (tasks.length === 0) {
          html += `<p class="text-muted" style="font-size:var(--font-size-xs);padding:var(--space-xs) var(--space-sm);">暂无任务</p>`;
        } else {
          for (const t of tasks) {
            html += `
              <div class="template-settings-item-v3 ${!t.active ? 'template-disabled' : ''}" data-template-id="${t.id}" data-section="${t.section || 'today_required'}" data-sort="${t.sortOrder || 99}">
                <span class="template-drag-handle" data-drag-handle="${t.id}" title="拖拽排序">⋮⋮</span>
                <span class="template-icon">${t.icon}</span>
                <div class="template-info">
                  <span class="template-name">${t.name}</span>
                  <span class="template-meta">
                    <span>+${t.defaultPoints}分</span>
                    ${t.taskType === 'duration' ? '<span>⏱ 计时</span>' : ''}
                    ${!t.active ? '<span class="text-danger">已停用</span>' : ''}
                  </span>
                </div>
                <div class="template-actions">
                  <button class="btn btn-secondary btn-sm" data-edit-template="${t.id}">✏️</button>
                  <label class="toggle-switch" style="display:inline-block;vertical-align:middle;">
                    <input type="checkbox" ${t.active ? 'checked' : ''} data-toggle-template="${t.id}">
                    <span class="slider"></span>
                  </label>
                </div>
              </div>`;
          }
        }
        // 分类底部新增按钮（预填该分类）
        html += `<button class="btn btn-secondary btn-sm btn-block section-add-task-btn" data-settings-add-section="${sec.value}">+ 新增任务</button>`;
      }

      html += `</div>`;
    }

    container.innerHTML = html;

    // 事件绑定
    bindTemplateEvents();
  }

  function bindTemplateEvents() {
    // 分类折叠/展开
    document.querySelectorAll('.settings-section-fold-header').forEach(header => {
      header.addEventListener('click', () => {
        const sectionKey = header.dataset.settingsSection;
        if (!sectionKey) return;
        if (expandedSettingSections.has(sectionKey)) {
          expandedSettingSections.delete(sectionKey);
        } else {
          expandedSettingSections.add(sectionKey);
        }
        renderTemplates();
      });
    });

    // 分类底部新增按钮（预填该分类 section）
    document.querySelectorAll('[data-settings-add-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.settingsAddSection || 'today_required';
        showTaskEditor(null, section);
      });
    });

    // 编辑
    document.querySelectorAll('[data-edit-template]').forEach(btn => {
      btn.onclick = async () => {
        const templates = await DB.getAllTemplates();
        const t = templates.find(tm => tm.id === btn.dataset.editTemplate);
        if (t) showTaskEditor(t);
      };
    });

    // 启用/停用
    document.querySelectorAll('[data-toggle-template]').forEach(input => {
      input.addEventListener('change', async () => {
        const id = input.dataset.toggleTemplate;
        await DB.db.taskTemplates.update(id, {
          active: input.checked ? 1 : 0
        });
        await syncAndRefresh();
      });
    });

    // 拖拽排序
    bindDragSort();
  }

  // ─── 拖拽排序（Pointer Events，兼容 iPad Safari）───
  function bindDragSort() {
    const container = document.getElementById('settings-templates-list');
    if (!container) return;

    // 清除旧的事件（防止重复绑定）
    const handles = container.querySelectorAll('[data-drag-handle]');
    handles.forEach(handle => {
      const clone = handle.cloneNode(true);
      handle.parentNode.replaceChild(clone, handle);
    });

    container.querySelectorAll('[data-drag-handle]').forEach(handle => {
      handle.addEventListener('pointerdown', onDragStart);
    });

    // 全局 move/up 事件（使用 document 确保在元素外也能追踪）
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);

    // 阻止触摸滚动
    container.querySelectorAll('[data-drag-handle]').forEach(handle => {
      handle.addEventListener('touchstart', (e) => {
        e.preventDefault(); // 阻止滚动
      }, { passive: false });
    });
  }

  function onDragStart(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const handle = e.currentTarget;
    const row = handle.closest('.template-settings-item-v3');
    if (!row) return;

    const sectionKey = row.dataset.section;
    const container = document.getElementById('settings-templates-list');
    const allRows = Array.from(container.querySelectorAll(`.template-settings-item-v3[data-section="${sectionKey}"]`));
    const sourceIndex = allRows.indexOf(row);

    dragState.active = true;
    dragState.startY = e.clientY;
    dragState.currentY = e.clientY;
    dragState.dragElement = row;
    dragState.sourceSection = sectionKey;
    dragState.sourceIndex = sourceIndex;
    dragState.allRows = allRows;

    // 视觉反馈
    row.classList.add('template-dragging');
    row.style.opacity = '0.5';
    row.style.cursor = 'grabbing';
  }

  function onDragMove(e) {
    if (!dragState.active) return;
    e.preventDefault();

    dragState.currentY = e.clientY;
    const dy = dragState.currentY - dragState.startY;

    // 查找当前位置下方的目标行
    const container = document.getElementById('settings-templates-list');
    const rows = Array.from(container.querySelectorAll(
      `.template-settings-item-v3[data-section="${dragState.sourceSection}"]`
    ));

    const dragRow = dragState.dragElement;

    // 计算目标位置
    let targetRow = null;
    let insertBefore = false;

    for (const row of rows) {
      if (row === dragRow) continue;
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (dy < 0 && e.clientY < midY && row.compareDocumentPosition(dragRow) & Node.DOCUMENT_POSITION_FOLLOWING) {
        targetRow = row;
        insertBefore = true;
        break;
      }
      if (dy > 0 && e.clientY > midY && row.compareDocumentPosition(dragRow) & Node.DOCUMENT_POSITION_PRECEDING) {
        targetRow = row;
        insertBefore = false;
        break;
      }
    }

    // 移动 DOM
    if (targetRow) {
      const parent = dragRow.parentNode;
      if (insertBefore) {
        parent.insertBefore(dragRow, targetRow);
      } else {
        parent.insertBefore(dragRow, targetRow.nextSibling);
      }
      dragState.startY = e.clientY; // 重置基准，避免跳跃
    }

    // 如果拖到 section 外，显示提示（不移动）
    const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
    if (elemBelow) {
      const targetSection = elemBelow.closest('[data-section]');
      if (targetSection && targetSection.dataset.section !== dragState.sourceSection) {
        dragState.dragElement.style.outline = '2px dashed var(--color-danger)';
      } else {
        dragState.dragElement.style.outline = '';
      }
    }
  }

  async function onDragEnd(e) {
    if (!dragState.active) return;
    dragState.active = false;

    const dragRow = dragState.dragElement;
    if (!dragRow) return;

    dragRow.classList.remove('template-dragging');
    dragRow.style.opacity = '';
    dragRow.style.cursor = '';
    dragRow.style.outline = '';

    // 计算新的 sortOrder：按 DOM 顺序分配 10, 20, 30...
    const container = document.getElementById('settings-templates-list');
    const rows = Array.from(container.querySelectorAll(
      `.template-settings-item-v3[data-section="${dragState.sourceSection}"]`
    ));

    const now = Utils.nowISO();
    for (let i = 0; i < rows.length; i++) {
      const templateId = rows[i].dataset.templateId;
      const newSortOrder = (i + 1) * 10; // 10, 20, 30...
      const currentSort = parseInt(rows[i].dataset.sort) || 99;
      if (currentSort !== newSortOrder) {
        await DB.db.taskTemplates.update(templateId, {
          sortOrder: newSortOrder,
          updatedAt: now
        });
        rows[i].dataset.sort = newSortOrder;
      }
    }

    // 重置拖拽状态
    dragState.dragElement = null;
    dragState.allRows = null;

    // 同步到今日挑战
    await syncAndRefresh();

    // 不重新渲染整个列表（DOM 已就位），但需要更新标签
    console.log(`[DragSort] ${dragState.sourceSection} 排序已保存`);
  }

  // ─── 任务编辑器 ───
  function showTaskEditor(template, preSelectedSection) {
    const modal = document.getElementById('global-modal');
    const content = document.getElementById('global-modal-content');
    const isNew = !template;

    // 新任务默认 section：优先使用传入的分类，其次用 'today_required'
    const defaultSection = preSelectedSection || 'today_required';

    const t = template || {
      id: Utils.genId('task'),
      name: '',
      section: defaultSection,
      defaultPoints: 1,
      requiresDuration: false,
      suggestedMinutes: 15,
      englishEnergyRate: null,
      active: 1,
      sortOrder: 99,
      taskType: 'checkbox',
      icon: '📌',
      weekdays: [1,2,3,4,5,6,7],
      groupKey: 'custom',
      category: 'study',
      subCategory: 'custom',
      maxCountPerDay: 1,
      required: false,
      description: ''
    };

    const selectedSection = t.section || 'today_required';
    const showEnglishRate = selectedSection === 'english_energy';

    content.innerHTML = `
      <h2>${isNew ? '新增任务' : '编辑任务'}</h2>
      <div style="text-align:left;max-height:70vh;overflow-y:auto;">

        <div class="settings-item">
          <label>任务名称</label>
          <input type="text" id="edit-task-name" value="${Utils.escapeHtml(t.name)}" style="width:200px;" placeholder="例如：跳绳">
        </div>

        <div class="settings-item">
          <label>图标 Emoji</label>
          <input type="text" id="edit-task-icon" value="${t.icon || '📌'}" style="width:64px;" maxlength="2" placeholder="📌">
        </div>

        <div class="settings-item">
          <label>所属板块</label>
          <select id="edit-task-section" style="width:180px;padding:6px;border-radius:6px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-text-muted);">
            ${SECTION_OPTIONS.map(s => `<option value="${s.value}" ${selectedSection === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </div>

        <div class="settings-item">
          <label>积分</label>
          <input type="number" id="edit-task-points" value="${t.defaultPoints}" min="0" max="50" style="width:80px;">
        </div>

        <div class="settings-item">
          <label>是否需要填写时长</label>
          <select id="edit-task-requires-duration" style="width:120px;padding:6px;border-radius:6px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-text-muted);">
            <option value="0" ${!t.requiresDuration ? 'selected' : ''}>不需要</option>
            <option value="1" ${t.requiresDuration ? 'selected' : ''}>需要（熏听模式）</option>
          </select>
        </div>

        <div class="settings-item">
          <label>默认时长（分钟）</label>
          <input type="number" id="edit-task-minutes" value="${t.suggestedMinutes || 15}" min="1" max="240" style="width:80px;">
        </div>

        <div class="settings-item" id="row-english-rate" style="${showEnglishRate ? '' : 'display:none;'}">
          <label>英语能量折算系数</label>
          <select id="edit-task-english-rate" style="width:120px;padding:6px;border-radius:6px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-text-muted);">
            <option value="1" ${t.englishEnergyRate === 1 ? 'selected' : ''}>1.0（正常）</option>
            <option value="0.5" ${t.englishEnergyRate === 0.5 ? 'selected' : ''}>0.5（熏听）</option>
          </select>
        </div>

        <div class="settings-item">
          <label>是否启用</label>
          <label class="toggle-switch" style="display:inline-block;">
            <input type="checkbox" id="edit-task-active" ${t.active ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>

      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" id="task-editor-cancel">取消</button>
        ${!isNew ? '<button class="btn btn-danger" id="task-editor-delete">停用</button>' : ''}
        <button class="btn btn-primary" id="task-editor-save">保存</button>
      </div>
    `;

    modal.classList.add('active');

    // 板块切换时显示/隐藏英语折算系数
    document.getElementById('edit-task-section').addEventListener('change', (e) => {
      const row = document.getElementById('row-english-rate');
      row.style.display = e.target.value === 'english_energy' ? '' : 'none';
    });

    // 取消
    document.getElementById('task-editor-cancel').onclick = () => modal.classList.remove('active');

    // 停用（改为禁用而非删除，保留历史记录）
    const deleteBtn = document.getElementById('task-editor-delete');
    if (deleteBtn) {
      deleteBtn.onclick = async () => {
        if (!confirm(`确定停用任务「${t.name}」吗？\n\n停用后：\n- 孩子端不再显示\n- 历史打卡记录保留\n- 可随时重新启用`)) return;
        await DB.db.taskTemplates.update(t.id, { active: 0, updatedAt: Utils.nowISO() });
        modal.classList.remove('active');
        await renderTemplates();
        await syncAndRefresh();
      };
    }

    // 保存
    document.getElementById('task-editor-save').onclick = async () => {
      const name = document.getElementById('edit-task-name').value.trim();
      if (!name) { alert('请输入任务名称'); return; }

      const section = document.getElementById('edit-task-section').value;
      const requiresDuration = document.getElementById('edit-task-requires-duration').value === '1';
      const englishEnergyRate = section === 'english_energy'
        ? parseFloat(document.getElementById('edit-task-english-rate').value)
        : null;

      // 换板块 → 排到新板块末尾；新任务 → 排到板块末尾；老任务不换板块 → 保留原 sortOrder
      const oldSection = t.section || 'today_required';
      const newSection = section;
      const sortOrder = isNew || oldSection !== newSection
        ? await getNextSortOrder(newSection)
        : (t.sortOrder || 99);

      const data = {
        name,
        icon: document.getElementById('edit-task-icon').value.trim() || '📌',
        section,
        defaultPoints: parseInt(document.getElementById('edit-task-points').value) || 1,
        sortOrder,
        requiresDuration,
        taskType: requiresDuration ? 'duration' : 'checkbox',
        suggestedMinutes: parseInt(document.getElementById('edit-task-minutes').value) || 15,
        englishEnergyRate,
        active: document.getElementById('edit-task-active').checked ? 1 : 0,
        updatedAt: Utils.nowISO()
      };

      if (isNew) {
        // 新增
        const newTemplate = {
          id: Utils.genId('task'),
          ...data,
          category: 'study',
          subCategory: 'custom',
          groupKey: 'custom',
          weekdays: [1,2,3,4,5,6,7],
          maxCountPerDay: 1,
          required: false,
          description: '',
          updatedAt: Utils.nowISO()
        };
        await DB.db.taskTemplates.add(newTemplate);
      } else {
        await DB.db.taskTemplates.update(t.id, data);
      }

      modal.classList.remove('active');
      await renderTemplates();
      await syncAndRefresh();
    };

    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('active');
    };
  }

  // ─── 渲染规则（积分封顶已移除）───
  async function renderRules() {
    const container = document.getElementById('settings-rules');
    const rules = await DB.getRulesConfig();

    if (!rules) {
      container.innerHTML = '<p class="text-muted">rulesConfig 未初始化</p>';
      return;
    }

    container.innerHTML = `
      <div class="rules-editor">
        <div class="section-title" style="margin-top:0;">熏听积分上限</div>
        <div class="rule-row">
          <label>熏听单任务积分上限</label>
          <input type="number" id="rule-listeningCap" value="${rules.caps.listeningCap}" min="0" max="20">
        </div>
      </div>

      <div class="rules-editor">
        <div class="section-title" style="margin-top:0;">基础全完成奖励</div>
        <div class="rule-row">
          <label>奖励积分</label>
          <input type="number" id="rule-basicBonus" value="${rules.basicStudyBonus.bonusPoints}" min="0" max="20">
        </div>
        <div class="rule-row">
          <label>基础任务</label>
          <span style="font-size:11px;color:var(--color-text-muted);">${rules.basicStudyTasks.join(', ')}</span>
        </div>
      </div>

      <div class="rules-editor">
        <div class="section-title" style="margin-top:0;">连续奖励</div>
        ${rules.streakMilestones.map((m, i) => `
          <div class="rule-row">
            <label>连续${m.days}天</label>
            <span>+${m.points}分 ${m.protectionCards > 0 ? `+${m.protectionCards}保护卡` : ''}</span>
          </div>
        `).join('')}
      </div>

      <p class="text-muted" style="font-size:11px;margin-top:var(--space-sm);">
        ℹ️ 每日学习/运动/总积分上限已取消，积分不再封顶。
        后端兼容字段保留，但不影响计算。
      </p>

      <button class="btn btn-primary btn-block mt-md" id="settings-save-rules">💾 保存规则</button>
    `;

    document.getElementById('settings-save-rules').onclick = async () => {
      const updates = {
        caps: {
          dailyStudyCap: rules.caps.dailyStudyCap,
          dailySportCap: rules.caps.dailySportCap,
          dailyTotalCap: rules.caps.dailyTotalCap,
          listeningCap: parseInt(document.getElementById('rule-listeningCap').value) || 5
        },
        basicStudyBonus: {
          bonusPoints: parseInt(document.getElementById('rule-basicBonus').value) || 3
        }
      };
      await DB.updateRulesConfig(updates);
      await App.refreshState();
      alert('规则已保存！');
    };
  }

  // ─── 绑定事件 ───
  function bindEvents(child, config) {
    // 返回按钮：直接进入家长模式并切换页面，绕过 PIN 校验
    document.getElementById('settings-back-btn').onclick = async () => {
      App.enterParentMode();
      App.switchPage(App.PAGES.CONFIRM);
    };

    // 编辑孩子（含头像选择）
    document.getElementById('settings-edit-child').onclick = () => {
      showChildEditor(child);
    };

    // 导出完整备份
    document.getElementById('settings-export-full').onclick = async () => {
      try {
        const filename = await Backup.downloadFullBackup();
        document.getElementById('settings-last-backup').textContent = await Backup.getLastBackupDesc();
        // 导出成功后隐藏超期提醒
        const overdueEl = document.getElementById('settings-backup-overdue');
        if (overdueEl) overdueEl.style.display = 'none';
        alert(`完整备份已导出：${filename}`);
      } catch (err) {
        alert('导出失败：' + err.message);
      }
    };

    // 导入完整备份
    document.getElementById('settings-import-full').onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        try {
          const file = e.target.files[0];
          if (!file) return;
          const json = await Backup.readFile(file);
          const result = await Backup.importFull(json);
          if (!result.success) { alert('导入失败：' + result.error); return; }
          if (!confirm('⚠️ 导入完整备份会覆盖当前本机数据。\n\n建议先导出当前完整备份。\n\n是否继续导入？')) return;
          if (!confirm('再次确认：所有现有数据将被覆盖。确定继续？')) return;
          await Backup.executeFullImport(result.data);
          alert('导入成功！页面将刷新。');
          location.reload();
        } catch (err) { alert('导入失败：' + err.message); }
      };
      input.click();
    };

    // 导出配置模板
    document.getElementById('settings-export-template').onclick = async () => {
      try {
        const filename = await Backup.downloadTemplate();
        alert(`配置模板已导出：${filename}`);
      } catch (err) { alert('导出失败：' + err.message); }
    };

    // 导入配置模板
    document.getElementById('settings-import-template').onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        try {
          const file = e.target.files[0];
          if (!file) return;
          const json = await Backup.readFile(file);
          const result = await Backup.importTemplate(json);
          if (!result.success) { alert('导入失败：' + result.error); return; }
          if (!confirm('将覆盖当前任务模板和规则配置。个人数据不受影响。确定继续？')) return;
          await Backup.executeTemplateImport(result.data);
          alert('配置模板导入成功！');
          await render();
        } catch (err) { alert('导入失败：' + err.message); }
      };
      input.click();
    };

    // 修改 PIN
    document.getElementById('settings-change-pin').onclick = () => {
      showPinEditor(config);
    };

    // 跳转奖励管理
    document.getElementById('settings-goto-manage').onclick = () => {
      App.navigate(App.PAGES.MANAGE);
    };

    // 视频名单
    document.getElementById('settings-videolist').onclick = () => {
      if (typeof VideoListPage !== 'undefined') {
        VideoListPage.render();
      }
    };

    // 一键重置
    document.getElementById('settings-reset-all').onclick = async () => {
      if (!confirm('⚠️ 确认重置？\n\n这将清除所有打卡记录、积分、兑换历史、连续天数等数据。\n任务模板和积分规则将恢复为默认配置。\n\n此操作不可撤销！')) return;
      if (!confirm('再次确认：真的要清除所有数据吗？')) return;
      try {
        const dexieDb = new Dexie('CheckinPWA');
        dexieDb.version(2).stores({
          appConfig: 'id', rulesConfig: 'id', lotteryConfig: 'id',
          child: 'id, name', taskTemplates: 'id, category, subCategory, active, groupKey, sortOrder',
          dailyTasks: 'id, childId, date, settled, taskType',
          dailySummaries: 'id, childId, date', pointRecords: 'id, childId, time, type',
          rewards: 'id, active, tier, sortOrder', redeemRecords: 'id, childId, time, status, tier',
          lotteryRecords: 'id, childId, time', chanceRecords: 'id, childId, time, type',
          streak: 'id, childId', streakAwardRecords: 'id, childId, date, milestone',
          protectionCardRecords: 'id, childId, time, type', manualOverrideRecords: 'id, childId, date'
        });
        dexieDb.version(3).stores({
          appConfig: 'id', rulesConfig: 'id', lotteryConfig: 'id',
          child: 'id, name', taskTemplates: 'id, category, subCategory, active, groupKey, sortOrder',
          dailyTasks: 'id, childId, date, settled, taskType',
          dailySummaries: 'id, childId, date', pointRecords: 'id, childId, time, type',
          rewards: 'id, active, tier, sortOrder, category, displaySection, visibleToChild',
          redeemRecords: 'id, childId, time, status, tier, categorySnapshot, redeemedAt',
          lotteryRecords: 'id, childId, time', chanceRecords: 'id, childId, time, type',
          streak: 'id, childId', streakAwardRecords: 'id, childId, date, milestone',
          protectionCardRecords: 'id, childId, time, type', manualOverrideRecords: 'id, childId, date'
        });
        dexieDb.version(4).stores({
          appConfig: 'id', rulesConfig: 'id', lotteryConfig: 'id',
          child: 'id, name', taskTemplates: 'id, category, subCategory, active, groupKey, sortOrder',
          dailyTasks: 'id, childId, date, settled, taskType, [childId+date], taskTemplateId',
          dailySummaries: 'id, childId, date, [childId+date]',
          pointRecords: 'id, childId, time, type, date, [childId+date]',
          rewards: 'id, active, tier, sortOrder, category, displaySection, visibleToChild',
          redeemRecords: 'id, childId, time, status, tier, categorySnapshot, redeemedAt, [childId+status]',
          lotteryRecords: 'id, childId, time', chanceRecords: 'id, childId, time, type',
          streak: 'id, childId', streakAwardRecords: 'id, childId, date, milestone',
          protectionCardRecords: 'id, childId, time, type', manualOverrideRecords: 'id, childId, date'
        });
        dexieDb.version(5).stores({
          appConfig: 'id', rulesConfig: 'id', lotteryConfig: 'id',
          child: 'id, name', taskTemplates: 'id, category, subCategory, active, groupKey, sortOrder',
          dailyTasks: 'id, childId, date, settled, taskType, [childId+date], taskTemplateId',
          dailySummaries: 'id, childId, date, [childId+date]',
          pointRecords: 'id, childId, time, type, date, [childId+date]',
          rewards: 'id, active, tier, sortOrder, category, displaySection, visibleToChild',
          redeemRecords: 'id, childId, time, status, tier, categorySnapshot, redeemedAt, [childId+status]',
          lotteryRecords: 'id, childId, time', chanceRecords: 'id, childId, time, type',
          streak: 'id, childId', streakAwardRecords: 'id, childId, date, milestone',
          protectionCardRecords: 'id, childId, time, type', manualOverrideRecords: 'id, childId, date',
          videoListItems: 'id, listType, active, sortOrder'
        });
        dexieDb.version(6).stores({
          appConfig: 'id', rulesConfig: 'id', lotteryConfig: 'id',
          child: 'id, name', taskTemplates: 'id, category, subCategory, active, groupKey, sortOrder',
          dailyTasks: 'id, childId, date, settled, taskType, [childId+date], taskTemplateId',
          dailySummaries: 'id, childId, date, [childId+date]',
          pointRecords: 'id, childId, time, type, date, [childId+date]',
          rewards: 'id, active, tier, sortOrder, category, displaySection, visibleToChild',
          redeemRecords: 'id, childId, time, status, tier, categorySnapshot, redeemedAt, [childId+status]',
          lotteryRecords: 'id, childId, time', chanceRecords: 'id, childId, time, type',
          streak: 'id, childId', streakAwardRecords: 'id, childId, date, milestone',
          protectionCardRecords: 'id, childId, time, type', manualOverrideRecords: 'id, childId, date',
          videoListItems: 'id, listType, active, sortOrder',
          parentScores: 'id, childId, date, [childId+date]'
        });
        dexieDb.version(7).stores({
          appConfig: 'id', rulesConfig: 'id', lotteryConfig: 'id',
          child: 'id, name', taskTemplates: 'id, category, subCategory, active, groupKey, sortOrder',
          dailyTasks: 'id, childId, date, settled, taskType, [childId+date], taskTemplateId',
          dailySummaries: 'id, childId, date, [childId+date]',
          pointRecords: 'id, childId, time, type, date, [childId+date]',
          rewards: 'id, active, tier, sortOrder, category, displaySection, visibleToChild',
          redeemRecords: 'id, childId, time, status, tier, categorySnapshot, redeemedAt, [childId+status]',
          lotteryRecords: 'id, childId, time', chanceRecords: 'id, childId, time, type',
          streak: 'id, childId', streakAwardRecords: 'id, childId, date, milestone',
          protectionCardRecords: 'id, childId, time, type', manualOverrideRecords: 'id, childId, date',
          videoListItems: 'id, listType, active, sortOrder',
          parentScores: 'id, childId, date, [childId+date]',
          parentLetters: 'id, childId, date, readStatus, [childId+date]'
        });
        await dexieDb.open();
        for (const t of dexieDb.tables) await dexieDb.table(t.name).clear();
        dexieDb.close();
        console.log('[Reset] IndexedDB 已清空');
      } catch (err) { alert('数据库清除失败：' + err.message); return; }
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.unregister();
        }
        if ('caches' in self) {
          for (const k of await caches.keys()) await caches.delete(k);
        }
      } catch (err) { console.warn('[Reset] SW/缓存跳过:', err.message); }
      const baseUrl = location.href.split('?')[0].split('#')[0];
      location.href = baseUrl + '?reset=' + Date.now();
    };
  }

  // ─── 孩子信息编辑器（含头像选择）───
  function showChildEditor(child) {
    const modal = document.getElementById('global-modal');
    const content = document.getElementById('global-modal-content');
    const currentAvatarId = child.avatarId || 'football';

    const avatarGrid = AVATAR_LIST.map(a => `
      <button class="avatar-option ${a.id === currentAvatarId ? 'selected' : ''}"
              data-avatar-id="${a.id}" title="${a.name}">
        <img src="./assets/avatars/${a.file}" alt="${a.name}">
      </button>
    `).join('');

    content.innerHTML = `
      <h2>编辑孩子信息</h2>
      <div style="text-align:left;">
        <div class="settings-item">
          <label>名字</label>
          <input type="text" id="edit-child-name" value="${Utils.escapeHtml(child.name)}" style="width:200px;">
        </div>
        <div class="section-title" style="margin-top:var(--space-md);">选择头像</div>
        <div class="avatar-picker" id="avatar-picker">
          ${avatarGrid}
        </div>
        <input type="hidden" id="edit-child-avatar-id" value="${currentAvatarId}">
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" id="child-editor-cancel">取消</button>
        <button class="btn btn-primary" id="child-editor-save">保存</button>
      </div>
    `;

    modal.classList.add('active');

    // 头像选择事件
    document.querySelectorAll('.avatar-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('edit-child-avatar-id').value = btn.dataset.avatarId;
      });
    });

    document.getElementById('child-editor-cancel').onclick = () => modal.classList.remove('active');

    document.getElementById('child-editor-save').onclick = async () => {
      const name = document.getElementById('edit-child-name').value.trim();
      const avatarId = document.getElementById('edit-child-avatar-id').value || 'football';

      if (!name) { alert('请输入名字'); return; }

      await DB.updateChild(child.id, { name, avatarId });
      await App.refreshState();
      modal.classList.remove('active');
      await render();
    };

    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('active');
    };
  }

  // ─── PIN 编辑器 ───
  function showPinEditor(config) {
    const modal = document.getElementById('global-modal');
    const content = document.getElementById('global-modal-content');
    const hasExistingPin = config && config.parentPinHash;

    content.innerHTML = `
      <h2>🔐 ${hasExistingPin ? '修改 PIN 码' : '设置 PIN 码'}</h2>
      ${hasExistingPin ? '<p>请输入旧 PIN 和新 PIN</p>' : '<p>请设置 4 位数字 PIN 码</p>'}
      <div style="text-align:left;">
        ${hasExistingPin ? `
        <div class="settings-item">
          <label>旧 PIN</label>
          <input type="password" id="pin-old" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" style="width:120px;">
        </div>` : ''}
        <div class="settings-item">
          <label>新 PIN</label>
          <input type="password" id="pin-new" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" style="width:120px;">
        </div>
        <div class="settings-item">
          <label>确认 PIN</label>
          <input type="password" id="pin-confirm" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" style="width:120px;">
        </div>
        <p id="pin-edit-error" class="text-danger" style="display:none;"></p>
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" id="pin-editor-cancel">取消</button>
        <button class="btn btn-primary" id="pin-editor-save">保存</button>
      </div>
    `;

    modal.classList.add('active');

    document.getElementById('pin-editor-cancel').onclick = () => modal.classList.remove('active');

    document.getElementById('pin-editor-save').onclick = async () => {
      const errorEl = document.getElementById('pin-edit-error');
      if (hasExistingPin) {
        const oldPin = document.getElementById('pin-old').value;
        if (!oldPin || oldPin.length !== 4) {
          errorEl.textContent = '请输入 4 位旧 PIN'; errorEl.style.display = 'block'; return;
        }
        const oldHash = await Utils.sha256(oldPin);
        if (oldHash !== config.parentPinHash) {
          errorEl.textContent = '旧 PIN 不正确'; errorEl.style.display = 'block'; return;
        }
      }
      const newPin = document.getElementById('pin-new').value;
      const confirmPin = document.getElementById('pin-confirm').value;
      if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
        errorEl.textContent = '新 PIN 必须是 4 位数字'; errorEl.style.display = 'block'; return;
      }
      if (newPin !== confirmPin) {
        errorEl.textContent = '两次输入的 PIN 不一致'; errorEl.style.display = 'block'; return;
      }
      const newHash = await Utils.sha256(newPin);
      await DB.updateAppConfig({ parentPinHash: newHash });
      await App.refreshState();
      modal.classList.remove('active');
      alert('PIN 码已更新！');
    };

    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('active');
    };
  }

  // ─── 公开 API ───
  return {
    render
  };

})();

// HTML 转义辅助
Utils.escapeHtml = function(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
};
