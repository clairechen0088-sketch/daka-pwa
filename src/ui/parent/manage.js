// src/ui/parent/manage.js – 家长奖励管理页 V3 → V3.1
// 暑假任务打卡积分系统 V2 → V3 → V3.1
// V3.1: 3区货架统计 + 智能分组 + 自动建议展示区 + 快捷筛选

const ManagePage = (() => {

  let currentTab = 'redeems';
  let currentFilter = 'all';

  // ─── 安全调用 Rules 函数（兼容 SW 缓存旧版 rules.js）───
  function safeIsTruthyFlag(value) {
    if (typeof Rules !== 'undefined' && Rules.isTruthyFlag) {
      return Rules.isTruthyFlag(value);
    }
    // 回退：手动判断 truthy flag（兼容 boolean / number / string）
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function safeIsChildStorefrontReward(reward) {
    if (typeof Rules !== 'undefined' && Rules.isChildStorefrontReward) {
      return Rules.isChildStorefrontReward(reward);
    }
    // 回退：手动判定货架可见性
    return safeIsTruthyFlag(reward.active)
      && safeIsTruthyFlag(reward.visibleToChild)
      && reward.displaySection !== 'hidden';
  }

  function safeSuggestDisplaySection(reward) {
    if (typeof Rules !== 'undefined' && Rules.suggestDisplaySectionForReward) {
      return Rules.suggestDisplaySectionForReward(reward);
    }
    // 回退：按 tier 建议
    if (reward.tier === 'small') return 'today';
    if (reward.tier === 'medium') return 'weekly';
    if (reward.tier === 'high' || reward.tier === 'super') return 'goal';
    return 'weekly';
  }

  function safeValidateStorefront(candidate, allRewards) {
    if (typeof Rules !== 'undefined' && Rules.validateRewardStorefront) {
      return Rules.validateRewardStorefront(candidate, allRewards);
    }
    // 回退：不做货架校验，允许操作
    return { allowed: true, reason: '', stats: {} };
  }

  function safeCalculateStorefrontStats(rewards) {
    if (typeof Rules !== 'undefined' && Rules.calculateStorefrontStats) {
      return Rules.calculateStorefrontStats(rewards);
    }
    // 回退：简易统计
    const visible = rewards.filter(r => safeIsChildStorefrontReward(r));
    return {
      totalVisible: visible.length,
      sectionCounts: { today: 0, weekly: 0, goal: 0 },
      screenVisible: 0, highRiskVisible: 0, privilegeVisible: 0, applicationVisible: 0
    };
  }

  function safeStorefrontLimits() {
    if (typeof Rules !== 'undefined' && Rules.STOREFRONT_LIMITS) {
      return Rules.STOREFRONT_LIMITS;
    }
    return { totalVisible: 15, sectionMax: { today: 5, weekly: 5, goal: 5 },
      highRiskTotal: 2, highRiskPerSection: 1, screenTotal: 2, screenPerSection: 1,
      privilegeTotal: 2, privilegePerSection: 1, applicationTotal: 1 };
  }

  // ─── 中文标签辅助函数 ───
  function categoryLabel(cat) {
    const map = { screen:'屏幕类', parentTime:'亲子陪伴', choice:'选择权', privilege:'特权', physical:'实物', outing:'外出', growth:'成长' };
    return map[cat] || cat || '-';
  }

  function riskLabel(rl) {
    const map = { low:'低风险', medium:'中风险', high:'高风险' };
    return map[rl] || rl || '-';
  }

  function fulfillmentLabel(ft) {
    const map = { instant:'即时', voucher:'券', scheduled:'需安排', physical:'实物', application:'申请卡' };
    return map[ft] || ft || 'voucher';
  }

  function sectionLabel(ds) {
    const map = { today:'今日小奖励', weekly:'本周推荐', goal:'大目标', hidden:'家长库隐藏' };
    return map[ds] || ds || 'hidden';
  }

  function tierLabel(t) {
    const map = { small:'小', medium:'中', high:'高', super:'超级' };
    return map[t] || t;
  }

  // ─── 渲染入口 ───
  async function render() {
    const child = App.getCurrentChild();
    if (!child) return;

    bindTabs();

    if (currentTab === 'redeems') {
      await renderRedeems(child);
    } else {
      await renderRewardsEdit();
    }
  }

  // ─── Tab 切换 ───
  function bindTabs() {
    document.querySelectorAll('#manage-tabs .tab').forEach(tab => {
      tab.onclick = async () => {
        document.querySelectorAll('#manage-tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;

        document.querySelectorAll('#page-manage .tab-content').forEach(c => c.style.display = 'none');

        if (currentTab === 'redeems') {
          document.getElementById('manage-redeems').style.display = 'block';
          await renderRedeems(App.getCurrentChild());
        } else {
          document.getElementById('manage-rewards-edit').style.display = 'block';
          await renderRewardsEdit();
        }
      };
    });

    document.getElementById('manage-back-btn').onclick = () => {
      App.navigate(App.PAGES.CONFIRM);
    };
  }

  // ─── 渲染兑换记录 ───
  async function renderRedeems(child) {
    const container = document.getElementById('manage-redeems');
    const records = await DB.getRedeemRecords(child.id);

    if (records.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📭</span>
          <span class="empty-text">还没有兑换记录</span>
        </div>`;
      return;
    }

    const statusLabels = {
      requested: { text: '待确认兑换', css: 'chip-warning' },
      pending:   { text: '待使用',     css: 'chip-warning' },
      fulfilled: { text: '已兑现',     css: 'chip-success' },
      cancelled: { text: '已取消',     css: 'chip-danger' }
    };

    container.innerHTML = records.map(r => {
      const status = statusLabels[r.status] || { text: r.status, css: '' };
      const rname = r.rewardNameSnapshot || r.rewardName || '奖励';
      const ft = r.fulfillmentTypeSnapshot || 'voucher';
      const cat = r.categorySnapshot || 'physical';
      const displayTime = (r.requestedAt || r.redeemedAt || r.time || '').substring(0, 16);

      // 根据状态显示不同按钮
      let actionButtons = '';
      if (r.status === 'requested') {
        actionButtons = `
          <div style="display:flex;gap:4px;margin-top:4px;">
            <button class="btn btn-success btn-sm" data-redeem-id="${r.id}" data-action="confirm">确认兑换并扣分</button>
            <button class="btn btn-danger btn-sm" data-redeem-id="${r.id}" data-action="deny">拒绝</button>
          </div>`;
      } else if (r.status === 'pending') {
        actionButtons = `
          <div style="display:flex;gap:4px;margin-top:4px;">
            <button class="btn btn-success btn-sm" data-redeem-id="${r.id}" data-action="fulfill">已使用 / 已兑现</button>
            <button class="btn btn-danger btn-sm" data-redeem-id="${r.id}" data-action="cancel">取消并退分</button>
          </div>`;
      }

      return `
        <div class="redeem-record-card" data-redeem-id="${r.id}">
          <div class="redeem-record-icon">${r.rewardIcon || '🎁'}</div>
          <div class="redeem-record-info">
            <div class="redeem-record-name">${rname}</div>
            <div class="redeem-record-time">
              ${displayTime}
              <span class="chip ${status.css}">${status.text}</span>
              <span class="chip chip-tier-${r.tier}">${r.tier}</span>
              <span class="chip">${cat}</span>
              <span class="chip">${ft}</span>
            </div>
            ${r.childDescriptionSnapshot ? `<div class="redeem-record-desc">${r.childDescriptionSnapshot}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="color:var(--color-danger);font-weight:700;">-${r.costSnapshot || r.cost || 0}</div>
            ${actionButtons}
            ${r.status === 'fulfilled' && r.fulfilledAt ? `<div style="font-size:10px;color:var(--color-text-muted);">${r.fulfilledAt.substring(0,10)}</div>` : ''}
            ${r.status === 'cancelled' && r.cancelledAt ? `<div style="font-size:10px;color:var(--color-text-muted);">${r.cancelledAt.substring(0,10)}</div>` : ''}
          </div>
        </div>`;
    }).join('');

    // 绑定「确认兑换并扣分」按钮
    container.querySelectorAll('[data-action="confirm"]').forEach(btn => {
      btn.onclick = async () => {
        await confirmRedeem(btn.dataset.redeemId);
        await renderRedeems(App.getCurrentChild());
      };
    });

    // 绑定「拒绝」按钮
    container.querySelectorAll('[data-action="deny"]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('确定拒绝这笔兑换申请吗？（未扣分，不会退款）')) return;
        await cancelRedeem(btn.dataset.redeemId);
        await renderRedeems(App.getCurrentChild());
      };
    });

    // 绑定「已使用 / 已兑现」按钮
    container.querySelectorAll('[data-action="fulfill"]').forEach(btn => {
      btn.onclick = async () => {
        await fulfillRedeem(btn.dataset.redeemId);
        await renderRedeems(App.getCurrentChild());
      };
    });

    // 绑定「取消并退分」按钮
    container.querySelectorAll('[data-action="cancel"]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('确定取消这笔兑换吗？积分将会返还。')) return;
        await cancelRedeem(btn.dataset.redeemId);
        await renderRedeems(App.getCurrentChild());
      };
    });
  }

  // ─── 确认兑换（委托 DB 事务方法）───
  async function confirmRedeem(redeemId) {
    try {
      const result = await DB.confirmRedeem(redeemId);
      console.log('[Manage] 确认兑换成功:', result);
    } catch (err) {
      console.error('[Manage] 确认兑换失败:', err);
      alert(err.message || '确认兑换失败');
    }
  }

  // ─── 兑现兑换（委托 DB 事务方法）───
  async function fulfillRedeem(redeemId) {
    try {
      const result = await DB.fulfillRedeem(redeemId);
      console.log('[Manage] 兑现成功:', result);
    } catch (err) {
      console.error('[Manage] 兑现失败:', err);
      alert(err.message || '兑现失败');
    }
  }

  // ─── 取消兑换（委托 DB 事务方法）───
  async function cancelRedeem(redeemId) {
    try {
      const result = await DB.cancelRedeem(redeemId);
      console.log('[Manage] 取消兑换成功:', result);
    } catch (err) {
      console.error('[Manage] 取消兑换失败:', err);
      alert(err.message || '取消兑换失败');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  V3.1: 商品库管理页
  // ═══════════════════════════════════════════════════════════════

  // ─── 渲染商品管理 ───
  async function renderRewardsEdit() {
    try {
      await _renderRewardsEditImpl();
    } catch (err) {
      console.error('[Manage] renderRewardsEdit 崩溃:', err);
      const container = document.getElementById('manage-rewards-list');
      if (container) {
        container.innerHTML = `<div class="empty-state">
          <span class="empty-icon">⚠️</span>
          <span class="empty-text">渲染失败: ${err.message || '未知错误'}</span>
          <span class="empty-text" style="font-size:10px;">请刷新页面重试</span>
        </div>`;
      }
    }
  }

  async function _renderRewardsEditImpl() {
    const container = document.getElementById('manage-rewards-list');
    const rewards = await DB.getAllRewards();

    // 诊断日志：输出所有 reward 的 id + category
    console.log('[Manage] getAllRewards 总数:', rewards.length,
      rewards.map(r => ({ id: r.id, cat: r.category, active: r.active, vis: r.visibleToChild, ds: r.displaySection })));

    // ── 三区货架统计 ──
    updateStorefrontStatsPanel(rewards);

    // ── 快捷筛选 ──
    renderFilterBar();

    if (rewards.length === 0) {
      container.innerHTML = '<p class="text-muted">暂无奖励商品</p>';
      document.getElementById('manage-add-reward').onclick = () => showRewardEditor(null);
      return;
    }

    // ── 应用筛选 ──
    let filteredRewards = applyFilter(rewards, currentFilter);
    console.log('[Manage] 当前筛选:', currentFilter, '→ 结果数:', filteredRewards.length,
      filteredRewards.map(r => ({ id: r.id, cat: r.category })));

    // ── 分组 ──
    const groups = assignRewardGroups(filteredRewards);
    console.log('[Manage] 分组结果:', groups.map(g => ({ key: g.key, label: g.label, count: g.rewards.length })));

    // ── 渲染 ──
    let html = '';
    for (const group of groups) {
      if (group.rewards.length === 0) continue;
      html += `<div class="reward-group-section">`;
      html += `<div class="reward-group-header">${group.label} <span class="reward-group-count">${group.rewards.length}</span></div>`;

      // 如果是"已上架"组，渲染子分组
      if (group.key === 'shelf' && group.subGroups) {
        for (const sub of Object.values(group.subGroups)) {
          if (sub.rewards.length === 0) continue;
          html += `<div class="reward-subgroup-header">${sub.label} <span class="reward-subgroup-count">${sub.rewards.length}</span></div>`;
          for (const r of sub.rewards) {
            html += renderRewardRow(r);
          }
        }
      } else {
        for (const r of group.rewards) {
          html += renderRewardRow(r);
        }
      }
      html += `</div>`;
    }

    container.innerHTML = html;

    // 添加按钮
    document.getElementById('manage-add-reward').onclick = () => {
      showRewardEditor(null);
    };

    // 绑定编辑按钮
    container.querySelectorAll('[data-action="edit-reward"]').forEach(btn => {
      btn.onclick = async () => {
        const reward = await DB.getReward(btn.dataset.rewardId);
        if (reward) showRewardEditor(reward);
      };
    });

    // 绑定「上架到孩子端」开关
    container.querySelectorAll('[data-action="toggle-shelf"]').forEach(input => {
      input.addEventListener('change', async () => {
        const rewardId = input.dataset.rewardId;
        const reward = await DB.getReward(rewardId);
        if (!reward) { input.checked = !input.checked; return; }

        const turningOn = input.checked;

        if (turningOn) {
          await toggleShelfOn(reward, input);
        } else {
          await toggleShelfOff(rewardId, input);
        }

        await refreshAfterToggle();
      });
    });
  }

  /** 上架：自动建议分区 + 校验 */
  async function toggleShelfOn(reward, input) {
    // 如果已停用，提示先启用
    if (!safeIsTruthyFlag(reward.active)) {
      alert('该商品已停用，请先进入编辑器启用后再上架。');
      input.checked = false;
      return;
    }

    // 自动建议展示区
    const suggestedSection = safeSuggestDisplaySection(reward);

    const candidate = {
      ...reward,
      active: 1,
      visibleToChild: 1,
      displaySection: suggestedSection
    };

    const allRewards = await DB.getAllRewards();
    const result = safeValidateStorefront(candidate, allRewards);

    if (!result.allowed) {
      alert(`无法上架：${result.reason}`);
      input.checked = false;
      return;
    }

    await DB.db.rewards.update(reward.id, {
      active: 1,
      visibleToChild: 1,
      displaySection: suggestedSection,
      updatedAt: Utils.nowISO()
    });
  }

  /** 下架：visibleToChild=0, displaySection='hidden'，不强制 active=0 */
  async function toggleShelfOff(rewardId, input) {
    await DB.db.rewards.update(rewardId, {
      visibleToChild: 0,
      displaySection: 'hidden',
      updatedAt: Utils.nowISO()
    });
  }

  /** 切换后刷新 */
  async function refreshAfterToggle() {
    await renderRewardsEdit();
  }

  // ─── 三区货架统计面板 ───
  function updateStorefrontStatsPanel(rewards) {
    const stats = safeCalculateStorefrontStats(rewards);
    const L = safeStorefrontLimits();

    const totalActive = rewards.filter(r => safeIsTruthyFlag(r.active)).length;
    const totalInactive = rewards.filter(r => !safeIsTruthyFlag(r.active)).length;
    const totalListed = stats.totalVisible;
    const totalUnlisted = totalActive - totalListed;
    const remaining = Math.max(0, L.totalVisible - totalListed);

    const html = `
      <div class="storefront-stats-v31">

        <!-- 区块1：孩子端当前货架 -->
        <div class="stats-block stats-block-primary">
          <div class="stats-block-title">📊 孩子端当前货架</div>
          <div class="stats-block-body">
            <div class="stats-row stats-row-main">
              <span class="stats-label">孩子端当前货架</span>
              <span class="stats-value ${totalListed >= L.totalVisible ? 'stats-full' : ''}">${totalListed} / ${L.totalVisible}</span>
            </div>
            <div class="stats-row">
              <span class="stats-label">　今日小奖励</span>
              <span class="stats-value ${stats.sectionCounts.today >= L.sectionMax.today ? 'stats-full' : ''}">${stats.sectionCounts.today} / ${L.sectionMax.today}</span>
            </div>
            <div class="stats-row">
              <span class="stats-label">　本周推荐</span>
              <span class="stats-value ${stats.sectionCounts.weekly >= L.sectionMax.weekly ? 'stats-full' : ''}">${stats.sectionCounts.weekly} / ${L.sectionMax.weekly}</span>
            </div>
            <div class="stats-row">
              <span class="stats-label">　大目标</span>
              <span class="stats-value ${stats.sectionCounts.goal >= L.sectionMax.goal ? 'stats-full' : ''}">${stats.sectionCounts.goal} / ${L.sectionMax.goal}</span>
            </div>
            <div class="stats-row stats-row-remain">
              <span class="stats-label">剩余可上架</span>
              <span class="stats-value">${remaining}</span>
            </div>
          </div>
        </div>

        <!-- 区块2：风险边界 -->
        <div class="stats-block stats-block-warning">
          <div class="stats-block-title">⚠️ 风险边界</div>
          <div class="stats-block-body">
            <div class="stats-row ${stats.screenVisible >= L.screenTotal ? 'stats-over' : ''}">
              <span class="stats-label">屏幕类</span>
              <span class="stats-value">${stats.screenVisible} / ${L.screenTotal}</span>
            </div>
            <div class="stats-row ${stats.highRiskVisible >= L.highRiskTotal ? 'stats-over' : ''}">
              <span class="stats-label">高风险</span>
              <span class="stats-value">${stats.highRiskVisible} / ${L.highRiskTotal}</span>
            </div>
            <div class="stats-row ${stats.privilegeVisible >= L.privilegeTotal ? 'stats-over' : ''}">
              <span class="stats-label">特权类</span>
              <span class="stats-value">${stats.privilegeVisible} / ${L.privilegeTotal}</span>
            </div>
            <div class="stats-row ${stats.applicationVisible >= L.applicationTotal ? 'stats-over' : ''}">
              <span class="stats-label">申请卡</span>
              <span class="stats-value">${stats.applicationVisible} / ${L.applicationTotal}</span>
            </div>
          </div>
          <div class="stats-block-hint">超过限制时将无法上架到孩子端。</div>
        </div>

        <!-- 区块3：商品库概览 -->
        <div class="stats-block stats-block-info">
          <div class="stats-block-title">📦 商品库概览</div>
          <div class="stats-block-body">
            <div class="stats-row">
              <span class="stats-label">全部商品</span>
              <span class="stats-value">${rewards.length}</span>
            </div>
            <div class="stats-row">
              <span class="stats-label">已上架孩子端</span>
              <span class="stats-value stats-good">${totalListed}</span>
            </div>
            <div class="stats-row">
              <span class="stats-label">未上架 / 家长库隐藏</span>
              <span class="stats-value">${Math.max(0, totalUnlisted)}</span>
            </div>
            <div class="stats-row">
              <span class="stats-label">停用商品</span>
              <span class="stats-value stats-muted">${totalInactive}</span>
            </div>
          </div>
        </div>

      </div>
    `;

    const statsPanel = document.getElementById('manage-storefront-stats');
    if (statsPanel) {
      statsPanel.innerHTML = html;
    }
  }

  // ─── 筛选按钮栏 ───
  function renderFilterBar() {
    const filterBar = document.getElementById('manage-filter-bar');
    if (!filterBar) return;

    const filters = [
      { key: 'all',           label: '全部' },
      { key: 'listed',        label: '已上架' },
      { key: 'unlisted',      label: '未上架' },
      { key: 'inactive',      label: '停用' },
      { key: 'screen',        label: '屏幕类' },
      { key: 'parentTime',    label: '亲子陪伴' },
      { key: 'choice',        label: '选择权' },
      { key: 'physical',      label: '实物' },
      { key: 'outing',        label: '外出' },
      { key: 'privilege_app', label: '特权/申请卡' }
    ];

    filterBar.innerHTML = filters.map(f => {
      const activeClass = currentFilter === f.key ? 'filter-btn-active' : '';
      return `<button class="filter-btn ${activeClass}" data-filter="${f.key}">${f.label}</button>`;
    }).join('');

    filterBar.querySelectorAll('.filter-btn').forEach(btn => {
      btn.onclick = async () => {
        currentFilter = btn.dataset.filter;
        await renderRewardsEdit();
      };
    });
  }

  /** 应用筛选 */
  function applyFilter(rewards, filter) {
    if (filter === 'all') return rewards;

    return rewards.filter(r => {
      switch (filter) {
        case 'listed':
          return safeIsChildStorefrontReward(r);
        case 'unlisted':
          return safeIsTruthyFlag(r.active) && !safeIsChildStorefrontReward(r);
        case 'inactive':
          return !safeIsTruthyFlag(r.active);
        case 'screen':
          return r.category === 'screen';
        case 'parentTime':
          return r.category === 'parentTime';
        case 'choice':
          return r.category === 'choice';
        case 'physical':
          return r.category === 'physical';
        case 'outing':
          return r.category === 'outing';
        case 'privilege_app':
          return r.category === 'privilege' || r.fulfillmentType === 'application';
        default:
          return true;
      }
    });
  }

  /** 按管理状态/决策场景分组（无重复，优先级递减） */
  function assignRewardGroups(rewards) {
    // 初始化所有组
    const groups = {
      shelf:      { key:'shelf',      label:'✅ 已上架到孩子端', rewards:[], subGroups:{
        today:  { label:'📗 今日小奖励', rewards:[] },
        weekly: { label:'📘 本周推荐',   rewards:[] },
        goal:   { label:'📙 大目标',     rewards:[] }
      }},
      inactive:   { key:'inactive',   label:'🚫 停用商品',            rewards:[] },
      risky:      { key:'risky',      label:'⚠️ 屏幕 / 特权 / 申请卡', rewards:[] },
      recommended:{ key:'recommended',label:'🌟 推荐可上架',          rewards:[] },
      parentChoice:{ key:'parentChoice',label:'👨‍👩‍👧 亲子陪伴 / 选择权', rewards:[] },
      physicalOuting:{ key:'physicalOuting',label:'🎁 实物 / 外出体验', rewards:[] },
      other:      { key:'other',      label:'📁 其他未上架商品',       rewards:[] }
    };

    for (const r of rewards) {
      // P1: 已上架到孩子端
      if (safeIsChildStorefrontReward(r)) {
        groups.shelf.rewards.push(r);
        const ds = r.displaySection;
        if (groups.shelf.subGroups[ds]) {
          groups.shelf.subGroups[ds].rewards.push(r);
        }
        continue;
      }

      // P2: 停用商品
      if (!safeIsTruthyFlag(r.active)) {
        groups.inactive.rewards.push(r);
        continue;
      }

      // P3: 屏幕 / 特权 / 申请卡（含高风险）- active 但未上架
      if (r.category === 'screen' || r.category === 'privilege' ||
          r.fulfillmentType === 'application' || r.riskLevel === 'high') {
        groups.risky.rewards.push(r);
        continue;
      }

      // P4: 推荐可上架（低风险、非申请卡的实物/陪伴/选择/外出）
      if (r.riskLevel === 'low' &&
          ['parentTime','choice','physical','outing'].includes(r.category) &&
          r.fulfillmentType !== 'application') {
        groups.recommended.rewards.push(r);
        continue;
      }

      // P5: 亲子陪伴 / 选择权
      if (['parentTime','choice'].includes(r.category)) {
        groups.parentChoice.rewards.push(r);
        continue;
      }

      // P6: 实物 / 外出体验
      if (['physical','outing'].includes(r.category)) {
        groups.physicalOuting.rewards.push(r);
        continue;
      }

      // P7: 其他
      groups.other.rewards.push(r);
    }

    // 按顺序返回非空组
    const orderedKeys = ['shelf','inactive','risky','recommended','parentChoice','physicalOuting','other'];
    return orderedKeys.map(k => groups[k]).filter(g => g.rewards.length > 0);
  }

  // ─── 商品行渲染 ───
  function renderRewardRow(r) {
    const isOnShelf = safeIsChildStorefrontReward(r);
    const isActive = safeIsTruthyFlag(r.active);
    const suggestedSection = safeSuggestDisplaySection(r);
    const statusLabel = getRewardStatusLabel(r);
    const tagLabels = getRewardTagLabels(r);

    // 按钮状态
    let btnHtml = '';
    if (isOnShelf) {
      btnHtml = `<label class="toggle-switch" style="margin:0;" title="下架">
        <input type="checkbox" checked data-action="toggle-shelf" data-reward-id="${r.id}">
        <span class="slider"></span>
      </label>`;
    } else if (!isActive) {
      btnHtml = `<span style="font-size:10px;color:var(--color-text-muted);white-space:nowrap;">已停用</span>`;
    } else {
      btnHtml = `<label class="toggle-switch" style="margin:0;" title="上架到孩子端">
        <input type="checkbox" data-action="toggle-shelf" data-reward-id="${r.id}">
        <span class="slider"></span>
      </label>`;
    }

    // 醒目标签：screen / privilege / application / high risk
    const alertChips = [];
    if (r.category === 'screen') {
      alertChips.push('<span class="reward-alert-chip alert-screen">屏幕</span>');
    }
    if (r.category === 'privilege') {
      alertChips.push('<span class="reward-alert-chip alert-privilege">特权</span>');
    }
    if (r.fulfillmentType === 'application') {
      alertChips.push('<span class="reward-alert-chip alert-application">申请卡</span>');
    }
    if (r.riskLevel === 'high') {
      alertChips.push('<span class="reward-alert-chip alert-high-risk">高风险</span>');
    }

    return `
      <div class="reward-manage-row">
        <div class="reward-manage-main">
          <div class="reward-manage-top">
            <span class="reward-manage-icon">${r.icon || '🎁'}</span>
            <span class="reward-manage-name">${r.name}</span>
            ${statusLabel.html}
            ${alertChips.join('')}
          </div>
          <div class="reward-manage-meta">
            <span class="reward-meta-item">⭐${r.cost}分</span>
            <span class="reward-meta-sep">｜</span>
            <span class="reward-meta-item">建议：${sectionLabel(suggestedSection)}</span>
            <span class="reward-meta-sep">｜</span>
            <span class="reward-meta-item">${categoryLabel(r.category)}</span>
            <span class="reward-meta-sep">｜</span>
            <span class="reward-meta-item">${riskLabel(r.riskLevel)}</span>
            <span class="reward-meta-sep">｜</span>
            <span>${fulfillmentLabel(r.fulfillmentType)}</span>
          </div>
        </div>
        <div class="reward-manage-actions">
          ${btnHtml}
          <button class="btn btn-secondary btn-sm" data-action="edit-reward" data-reward-id="${r.id}">编辑</button>
        </div>
      </div>`;
  }

  // ─── 商品状态标签 ───
  function getRewardStatusLabel(r) {
    if (!safeIsTruthyFlag(r.active)) {
      return { html: '<span class="reward-status-chip chip-inactive">停用</span>' };
    }
    if (safeIsChildStorefrontReward(r)) {
      return { html: `<span class="reward-status-chip chip-listed">已上架：${sectionLabel(r.displaySection)}</span>` };
    }
    return { html: '<span class="reward-status-chip chip-not-listed">未上架</span>' };
  }

  // ─── 风险/分类/履约标签 ───
  function getRewardTagLabels(r) {
    const tags = [];
    if (r.category) {
      tags.push({ html: `<span class="reward-status-chip chip-tag-category">${categoryLabel(r.category)}</span>` });
    }
    if (r.riskLevel === 'high') {
      tags.push({ html: '<span class="reward-status-chip chip-high-risk">高风险</span>' });
    } else if (r.riskLevel === 'medium') {
      tags.push({ html: '<span class="reward-status-chip chip-risk-medium">中风险</span>' });
    }
    if (r.category === 'screen') {
      tags.push({ html: '<span class="reward-status-chip chip-tag-screen">屏幕类</span>' });
    }
    if (r.category === 'privilege') {
      tags.push({ html: '<span class="reward-status-chip chip-tag-privilege">特权类</span>' });
    }
    if (r.fulfillmentType && r.fulfillmentType !== 'voucher') {
      tags.push({ html: `<span class="reward-status-chip chip-tag-ft">${fulfillmentLabel(r.fulfillmentType)}</span>` });
    }
    if (r.fulfillmentType === 'application') {
      tags.push({ html: '<span class="reward-status-chip chip-tag-application">申请卡</span>' });
    }
    return tags;
  }

  // ─── 奖励编辑器（V3.1 更新标签）───
  function showRewardEditor(reward) {
    const modal = document.getElementById('global-modal');
    const content = document.getElementById('global-modal-content');
    const isNew = !reward;

    const val = (field, def) => reward ? (reward[field] !== undefined ? reward[field] : def) : def;
    const sel = (field, opt, def) => val(field, def) === opt ? 'selected' : '';
    const chk = (field, def) => val(field, def) ? 'checked' : '';

    content.innerHTML = `
      <h2>${isNew ? '添加奖励' : '编辑奖励'}</h2>
      <div style="text-align:left;max-height:70vh;overflow-y:auto;">

        <div class="settings-item"><label>名称 *</label>
          <input type="text" id="edit-r-name" value="${val('name', '')}" style="width:200px;"></div>

        <div class="settings-item"><label>图标</label>
          <input type="text" id="edit-r-icon" value="${val('icon', '🎁')}" style="width:100px;" placeholder="🎁"></div>

        <div class="settings-item"><label>积分 *</label>
          <input type="number" id="edit-r-cost" value="${val('cost', 100)}" style="width:100px;" min="0"></div>

        <div class="settings-item"><label>Tier</label>
          <select id="edit-r-tier" style="padding:4px 8px;border-radius:4px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-text-muted);">
            ${['small','medium','high','super'].map(t => `<option value="${t}" ${sel('tier', t, 'small')}>${t}</option>`).join('')}
          </select></div>

        <div class="settings-item"><label>商品分类</label>
          <select id="edit-r-category" style="padding:4px 8px;border-radius:4px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-text-muted);">
            ${['screen','parentTime','choice','privilege','physical','outing','growth'].map(c => `<option value="${c}" ${sel('category', c, 'physical')}>${categoryLabel(c)}</option>`).join('')}
          </select></div>

        <div class="settings-item"><label>商品库启用</label>
          <input type="checkbox" id="edit-r-active" ${chk('active', 1)}>
          <span style="font-size:10px;color:var(--color-text-muted);">关闭后商品从所有视图隐藏</span></div>

        <div class="settings-item"><label>上架到孩子端</label>
          <input type="checkbox" id="edit-r-visible" ${chk('visibleToChild', 0)}>
          <span style="font-size:10px;color:var(--color-text-muted);">控制列表主开关</span></div>

        <div class="settings-item"><label>孩子端展示区</label>
          <select id="edit-r-displaySection" style="padding:4px 8px;border-radius:4px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-text-muted);">
            <option value="today" ${sel('displaySection','today','hidden')}>今日小奖励</option>
            <option value="weekly" ${sel('displaySection','weekly','hidden')}>本周推荐</option>
            <option value="goal" ${sel('displaySection','goal','hidden')}>大目标</option>
            <option value="hidden" ${sel('displaySection','hidden','hidden')}>家长库隐藏</option>
          </select></div>

        <div class="settings-item"><label>风险等级</label>
          <select id="edit-r-riskLevel" style="padding:4px 8px;border-radius:4px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-text-muted);">
            ${['low','medium','high'].map(rl => `<option value="${rl}" ${sel('riskLevel', rl, 'low')}>${riskLabel(rl)}</option>`).join('')}
          </select></div>

        <div class="settings-item"><label>需家长审批</label>
          <input type="checkbox" id="edit-r-requiresApproval" ${chk('requiresParentApproval', true)}></div>

        <div class="settings-item"><label>履约类型</label>
          <select id="edit-r-fulfillmentType" style="padding:4px 8px;border-radius:4px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-text-muted);">
            ${['instant','voucher','scheduled','physical','application'].map(f => `<option value="${f}" ${sel('fulfillmentType', f, 'voucher')}>${fulfillmentLabel(f)}</option>`).join('')}
          </select></div>

        <div class="settings-item"><label>每日上限</label>
          <input type="number" id="edit-r-dailyLimit" value="${val('dailyLimit', '')}" style="width:80px;" min="1" placeholder="不限"></div>

        <div class="settings-item"><label>每周上限</label>
          <input type="number" id="edit-r-weeklyLimit" value="${val('weeklyLimit', '')}" style="width:80px;" min="1" placeholder="不限"></div>

        <div class="settings-item"><label>每月上限</label>
          <input type="number" id="edit-r-monthlyLimit" value="${val('monthlyLimit', '')}" style="width:80px;" min="1" placeholder="不限"></div>

        <div class="settings-item"><label>家长备注</label>
          <textarea id="edit-r-parentNote" style="width:100%;height:50px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-text-muted);border-radius:4px;padding:4px;">${val('parentNote', '')}</textarea></div>

        <div class="settings-item"><label>孩子端说明</label>
          <textarea id="edit-r-childDescription" style="width:100%;height:50px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-text-muted);border-radius:4px;padding:4px;">${val('childDescription', '')}</textarea></div>

        <div class="settings-item"><label>排序</label>
          <input type="number" id="edit-r-sortOrder" value="${val('sortOrder', 99)}" style="width:80px;" min="0"></div>

      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" id="reward-editor-cancel">取消</button>
        <button class="btn btn-primary" id="reward-editor-save">保存</button>
      </div>
    `;

    modal.classList.add('active');

    document.getElementById('reward-editor-cancel').onclick = () => modal.classList.remove('active');

    document.getElementById('reward-editor-save').onclick = async () => {
      const name = document.getElementById('edit-r-name').value.trim();
      const icon = document.getElementById('edit-r-icon').value.trim() || '🎁';
      const cost = parseInt(document.getElementById('edit-r-cost').value);
      const tier = document.getElementById('edit-r-tier').value;
      const category = document.getElementById('edit-r-category').value;
      const active = document.getElementById('edit-r-active').checked ? 1 : 0;
      let visibleToChild = document.getElementById('edit-r-visible').checked ? 1 : 0;
      const displaySection = document.getElementById('edit-r-displaySection').value;
      const riskLevel = document.getElementById('edit-r-riskLevel').value;
      const requiresParentApproval = document.getElementById('edit-r-requiresApproval').checked;
      const fulfillmentType = document.getElementById('edit-r-fulfillmentType').value;
      const sortOrder = parseInt(document.getElementById('edit-r-sortOrder').value) || 99;

      const dailyLimitRaw = document.getElementById('edit-r-dailyLimit').value;
      const weeklyLimitRaw = document.getElementById('edit-r-weeklyLimit').value;
      const monthlyLimitRaw = document.getElementById('edit-r-monthlyLimit').value;
      const dailyLimit = dailyLimitRaw ? parseInt(dailyLimitRaw) : null;
      const weeklyLimit = weeklyLimitRaw ? parseInt(weeklyLimitRaw) : null;
      const monthlyLimit = monthlyLimitRaw ? parseInt(monthlyLimitRaw) : null;

      const parentNote = document.getElementById('edit-r-parentNote').value.trim();
      const childDescription = document.getElementById('edit-r-childDescription').value.trim();

      // ── 校验 ──
      if (!name) { alert('请输入名称'); return; }
      if (isNaN(cost) || cost < 0) { alert('积分必须是非负整数'); return; }
      if (!['small','medium','high','super'].includes(tier)) { alert('tier 必须是 small/medium/high/super'); return; }
      if (!['screen','parentTime','choice','privilege','physical','outing','growth'].includes(category)) { alert('category 无效'); return; }
      if (!['today','weekly','goal','hidden'].includes(displaySection)) { alert('孩子端展示区无效'); return; }
      if (!['low','medium','high'].includes(riskLevel)) { alert('riskLevel 无效'); return; }
      if (!['instant','voucher','scheduled','physical','application'].includes(fulfillmentType)) { alert('fulfillmentType 无效'); return; }
      if (dailyLimit !== null && (dailyLimit <= 0 || !Number.isInteger(dailyLimit))) { alert('每日上限必须是大于 0 的整数'); return; }
      if (weeklyLimit !== null && (weeklyLimit <= 0 || !Number.isInteger(weeklyLimit))) { alert('每周上限必须是大于 0 的整数'); return; }
      if (monthlyLimit !== null && (monthlyLimit <= 0 || !Number.isInteger(monthlyLimit))) { alert('每月上限必须是大于 0 的整数'); return; }

      // displaySection=hidden 强制 visibleToChild=false
      if (displaySection === 'hidden') {
        visibleToChild = 0;
      }

      // category=screen 强制校验
      if (category === 'screen') {
        if (dailyLimit !== null && dailyLimit > 1) { alert('屏幕类奖励每日上限不能超过 1'); return; }
      }

      const data = {
        name, icon, cost, tier, category, active, visibleToChild,
        displaySection, riskLevel, requiresParentApproval, fulfillmentType,
        dailyLimit, weeklyLimit, monthlyLimit,
        parentNote, childDescription, sortOrder,
        updatedAt: Utils.nowISO()
      };

      const candidateReward = {
        ...(isNew ? {} : { id: reward.id }),
        ...data
      };

      const allRewards = await DB.getAllRewards();
      const result = safeValidateStorefront(candidateReward, allRewards);

      if (!result.allowed) {
        alert(result.reason);
        return;
      }

      if (isNew) {
        await DB.db.rewards.add({
          id: Utils.genId('reward'),
          ...data
        });
      } else {
        await DB.db.rewards.update(reward.id, data);
      }

      modal.classList.remove('active');
      await renderRewardsEdit();
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
