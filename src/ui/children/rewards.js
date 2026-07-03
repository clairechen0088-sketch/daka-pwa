// src/ui/children/rewards.js – 奖励页（积分兑换）V3
// 暑假任务打卡积分系统 V2 → V3
// V3: 三大展示区 + 我的券包 + 新兑换限制 + 视频指南标签

const RewardsPage = (() => {

  // ─── 当前活跃标签 ───
  let activeRewardsTab = 'shop';

  // ─── 渲染入口 ───
  async function render() {
    const child = App.getCurrentChild();
    if (!child) {
      console.warn('[Rewards] render: getCurrentChild() 返回空');
      return;
    }

    // 重新同步余额
    let currentBalance, lifetimeEarnedPoints;
    try {
      const synced = await DB.syncChildBalance(child.id);
      currentBalance = synced.currentBalance;
      lifetimeEarnedPoints = synced.lifetimeEarnedPoints;
    } catch (e) {
      console.error('[Rewards] syncChildBalance 失败:', e);
      return;
    }

    // 更新余额显示
    const balanceEl = document.getElementById('rewards-balance');
    const lifetimeEl = document.getElementById('rewards-lifetime');
    if (balanceEl) balanceEl.textContent = `⭐ ${currentBalance}`;
    if (lifetimeEl) lifetimeEl.textContent = `累计获得: ${lifetimeEarnedPoints}`;

    // 绑定标签切换
    bindTabEvents(child, currentBalance);

    // 渲染当前活跃标签
    if (activeRewardsTab === 'shop') {
      await renderShopTab(child, currentBalance);
    } else {
      await renderVideoGuideTab();
    }
  }

  // ─── 标签切换 ───
  function bindTabEvents(child, balance) {
    const tabs = document.querySelectorAll('[data-rewards-tab]');
    tabs.forEach(tab => {
      const newTab = tab.cloneNode(true);
      tab.parentNode.replaceChild(newTab, tab);
      newTab.addEventListener('click', async () => {
        const tabName = newTab.dataset.rewardsTab;
        if (tabName === activeRewardsTab) return;

        activeRewardsTab = tabName;

        // 更新 tab 高亮
        document.querySelectorAll('[data-rewards-tab]').forEach(t =>
          t.classList.toggle('active', t.dataset.rewardsTab === tabName)
        );

        // 切换显示
        const shopTab = document.getElementById('rewards-tab-shop');
        const videoTab = document.getElementById('rewards-tab-videoguide');
        if (shopTab) shopTab.style.display = tabName === 'shop' ? '' : 'none';
        if (videoTab) videoTab.style.display = tabName === 'videoguide' ? '' : 'none';

        // 渲染内容
        if (tabName === 'shop') {
          await renderShopTab(child, balance);
        } else {
          await renderVideoGuideTab();
        }
      });
    });
  }

  // ─── 渲染奖励兑换标签 ───
  async function renderShopTab(child, currentBalance) {
    // 确保正确的 tab 可见
    const shopTab = document.getElementById('rewards-tab-shop');
    const videoTab = document.getElementById('rewards-tab-videoguide');
    if (shopTab) shopTab.style.display = '';
    if (videoTab) videoTab.style.display = 'none';

    // 更新 tab 高亮
    document.querySelectorAll('[data-rewards-tab]').forEach(t =>
      t.classList.toggle('active', t.dataset.rewardsTab === 'shop')
    );

    // 兑换规则提示
    const hintEl = document.getElementById('rewards-rules-hint');
    if (hintEl) {
      hintEl.innerHTML = `
        <div class="rewards-rules-text">
          💡 <strong>今日小奖励</strong>每天可换，<strong>本周推荐</strong>要攒几天积分，<strong>大目标</strong>要努力打卡攒很久。<br>换完等爸爸妈妈确认，有的马上就好，有的要安排时间哦。
        </div>`;
    }

    // 渲染各区域
    const sections = [
      { name: 'renderTodaySection', fn: () => renderTodaySection(child, currentBalance) },
      { name: 'renderWeeklySection', fn: () => renderWeeklySection(child, currentBalance) },
      { name: 'renderGoalSection', fn: () => renderGoalSection(child, currentBalance) },
      { name: 'renderVoucherWallet', fn: () => renderVoucherWallet(child) }
    ];

    for (const section of sections) {
      try {
        await section.fn();
      } catch (e) {
        console.error(`[Rewards] ${section.name} 渲染失败:`, e);
      }
    }
  }

  // ─── 渲染视频指南标签（孩子只读）───
  async function renderVideoGuideTab() {
    // 确保正确的 tab 可见
    const shopTab = document.getElementById('rewards-tab-shop');
    const videoTab = document.getElementById('rewards-tab-videoguide');
    if (shopTab) shopTab.style.display = 'none';
    if (videoTab) videoTab.style.display = '';

    // 更新 tab 高亮
    document.querySelectorAll('[data-rewards-tab]').forEach(t =>
      t.classList.toggle('active', t.dataset.rewardsTab === 'videoguide')
    );

    const container = document.getElementById('rewards-tab-videoguide');
    if (!container) return;

    const items = await DB.getVideoListItems();
    const whitelist = items.filter(i => i.listType === 'whitelist' && i.active);
    const blacklist = items.filter(i => i.listType === 'blacklist' && i.active);

    if (whitelist.length === 0 && blacklist.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:var(--space-xl) 0;">
          <span class="empty-icon">📺</span>
          <span class="empty-text">暂无视频指南</span>
          <span style="font-size:11px;color:var(--color-text-muted);">爸爸妈妈还没设置视频清单</span>
        </div>`;
      return;
    }

    let html = '';
    html += '<p class="videoguide-hint" style="text-align:center;font-size:11px;color:var(--color-text-muted);padding:var(--space-sm) var(--space-md);">爸爸妈妈整理的可看和不可看视频清单，供你参考 👇</p>';

    // 白名单
    if (whitelist.length > 0) {
      html += '<div class="videoguide-block videoguide-whitelist">';
      html += '<div class="videoguide-block-title">✅ 可以看的视频</div>';
      html += '<div class="videoguide-list">';
      for (const item of whitelist) {
        html += `
          <div class="videoguide-item">
            <span class="videoguide-item-icon">✅</span>
            <span class="videoguide-item-title">${Utils.escapeHtml(item.title)}</span>
            ${item.platform ? `<span class="chip chip-study" style="font-size:9px;">${Utils.escapeHtml(item.platform)}</span>` : ''}
            ${item.note ? `<span class="videoguide-item-note">${Utils.escapeHtml(item.note)}</span>` : ''}
          </div>`;
      }
      html += '</div></div>';
    }

    // 黑名单
    if (blacklist.length > 0) {
      html += '<div class="videoguide-block videoguide-blacklist">';
      html += '<div class="videoguide-block-title">🚫 不能看的视频</div>';
      html += '<div class="videoguide-list">';
      for (const item of blacklist) {
        html += `
          <div class="videoguide-item">
            <span class="videoguide-item-icon">🚫</span>
            <span class="videoguide-item-title">${Utils.escapeHtml(item.title)}</span>
            ${item.platform ? `<span class="chip chip-study" style="font-size:9px;">${Utils.escapeHtml(item.platform)}</span>` : ''}
            ${item.note ? `<span class="videoguide-item-note">${Utils.escapeHtml(item.note)}</span>` : ''}
          </div>`;
      }
      html += '</div></div>';
    }

    html += '<p class="videoguide-footer">💡 清单由爸爸妈妈在设置中管理</p>';
    container.innerHTML = html;
  }

  // ─── 通用：渲染奖励卡片 ───
  function renderRewardCard(reward, balance, btnState) {
    // 可用 / 锁定状态类
    const cardStateClass = btnState.className === 'available' ? 'available-card' : 'locked-card';
    // 积分差额
    const missing = Math.max(0, reward.cost - balance);
    const diffText = missing > 0 ? `<div class="reward-diff">还差 ${missing} 分</div>` : '';

    return `
      <div class="reward-card ${cardStateClass}" data-reward-id="${reward.id}">
        <div class="reward-icon">${reward.icon || '🎁'}</div>
        <div class="reward-name">${reward.name}</div>
        ${reward.childDescription ? `<div class="reward-desc">${reward.childDescription}</div>` : ''}
        <div class="reward-meta">
          <span class="chip chip-tier-${reward.tier}">${reward.tier}</span>
          <span class="chip chip-cat">${categoryLabel(reward.category)}</span>
        </div>
        <div class="reward-cost">⭐ ${reward.cost}</div>
        ${diffText}
        <button class="reward-btn ${btnState.className}"
                data-reward-id="${reward.id}"
                ${btnState.disabled ? 'disabled' : ''}>
          ${btnState.label}
        </button>
      </div>`;
  }

  function categoryLabel(cat) {
    const map = {
      screen: '屏幕', parentTime: '陪伴', choice: '选择',
      privilege: '特权', physical: '实物', outing: '外出', growth: '成长'
    };
    return map[cat] || cat;
  }

  // ─── 获取按钮状态 ───
  async function getRewardButtonState(childId, reward, balance, rulesConfig, date, weekStart, monthStart) {
    // 检查是否有待处理的兑换申请（该 reward）
    const records = await DB.getRedeemRecords(childId);

    // 已有 requested 申请
    const hasRequestedThis = records.some(r =>
      r.rewardId === reward.id && r.status === 'requested'
    );
    if (hasRequestedThis) {
      return { className: 'pending', label: '🟡 待家长确认', disabled: true };
    }

    // 已有 pending 券
    const hasPendingThis = records.some(r =>
      r.rewardId === reward.id && r.status === 'pending'
    );
    if (hasPendingThis) {
      return { className: 'pending', label: '✅ 已兑换，待使用', disabled: true };
    }

    // 积分不足
    if (balance < reward.cost) {
      const diff = reward.cost - balance;
      return { className: 'locked', label: `🔒 还差${diff}分`, disabled: true };
    }

    // Tier 限制
    const limits = rulesConfig.redemption.limits;
    const tierLimit = limits[reward.tier];
    if (tierLimit && tierLimit.period !== 'none' && tierLimit.count > 0) {
      let periodStart, periodEnd;
      if (tierLimit.period === 'day') { periodStart = date; periodEnd = date; }
      else if (tierLimit.period === 'week') { periodStart = weekStart; periodEnd = date; }
      else if (tierLimit.period === 'month') { periodStart = monthStart; periodEnd = date; }

      const tierCount = await DB.countRedeemsInPeriod(childId, reward.tier, periodStart, periodEnd);
      if (tierCount >= tierLimit.count) {
        return { className: 'limit-reached', label: '🔒 已达上限', disabled: true };
      }
    }

    // Reward 自身限制
    if (reward.dailyLimit !== null && reward.dailyLimit !== undefined) {
      const dayCount = await DB.countRewardRedeemsInPeriod(childId, reward.id, date, date);
      if (dayCount >= reward.dailyLimit) {
        return { className: 'limit-reached', label: '🔒 已达上限', disabled: true };
      }
    }
    if (reward.weeklyLimit !== null && reward.weeklyLimit !== undefined) {
      const weekCount = await DB.countRewardRedeemsInPeriod(childId, reward.id, weekStart, date);
      if (weekCount >= reward.weeklyLimit) {
        return { className: 'limit-reached', label: '🔒 已达上限', disabled: true };
      }
    }
    if (reward.monthlyLimit !== null && reward.monthlyLimit !== undefined) {
      const monthCount = await DB.countRewardRedeemsInPeriod(childId, reward.id, monthStart, date);
      if (monthCount >= reward.monthlyLimit) {
        return { className: 'limit-reached', label: '🔒 已达上限', disabled: true };
      }
    }

    // Screen 全局限制（使用 appDate 匹配 DB.requestRedeem / DB.confirmRedeem 事务内校验）
    if (reward.category === 'screen') {
      const appConfig = await DB.getAppConfig();
      const dayCutoffHour = appConfig?.dayCutoffHour ?? 4;
      const appDate = Utils.getAppDate(new Date(), dayCutoffHour);
      const screenCount = await DB.countScreenRedeemsToday(childId, appDate);
      if (screenCount >= 1) {
        return { className: 'limit-reached', label: '🔒 已达上限', disabled: true };
      }
    }

    return { className: 'available', label: '🟢 兑换', disabled: false };
  }

  // ─── 渲染「今日小奖励」───
  async function renderTodaySection(child, balance) {
    const container = document.getElementById('rewards-section-today');
    const rewards = await DB.getChildSectionRewards('today', 5);
    const rulesConfig = await DB.getRulesConfig();
    const date = Utils.getToday();
    const weekStart = Utils.getWeekStart(date);
    const monthStart = Utils.getMonthStart(date);

    if (rewards.length === 0) {
      container.innerHTML = '';
      return;
    }

    let html = '<div class="store-section"><div class="store-section-header">🌟 今日小奖励</div><div class="rewards-grid">';
    for (const reward of rewards) {
      const btnState = await getRewardButtonState(child.id, reward, balance, rulesConfig, date, weekStart, monthStart);
      html += renderRewardCard(reward, balance, btnState);
    }
    html += '</div></div>';
    container.innerHTML = html;

    bindRewardEvents(child, balance);
  }

  // ─── 渲染「本周推荐」───
  async function renderWeeklySection(child, balance) {
    const container = document.getElementById('rewards-section-weekly');
    const rewards = await DB.getChildSectionRewards('weekly', 5);
    const rulesConfig = await DB.getRulesConfig();
    const date = Utils.getToday();
    const weekStart = Utils.getWeekStart(date);
    const monthStart = Utils.getMonthStart(date);

    if (rewards.length === 0) {
      container.innerHTML = '';
      return;
    }

    let html = '<div class="store-section"><div class="store-section-header">📅 本周推荐</div><div class="rewards-grid">';
    for (const reward of rewards) {
      const btnState = await getRewardButtonState(child.id, reward, balance, rulesConfig, date, weekStart, monthStart);
      html += renderRewardCard(reward, balance, btnState);
    }
    html += '</div></div>';
    container.innerHTML = html;

    bindRewardEvents(child, balance);
  }

  // ─── 渲染「大目标」───
  async function renderGoalSection(child, balance) {
    const container = document.getElementById('rewards-section-goal');
    const rewards = await DB.getChildSectionRewards('goal', 5);
    const rulesConfig = await DB.getRulesConfig();
    const date = Utils.getToday();
    const weekStart = Utils.getWeekStart(date);
    const monthStart = Utils.getMonthStart(date);

    if (rewards.length === 0) {
      container.innerHTML = '';
      return;
    }

    let html = '<div class="store-section"><div class="store-section-header">🎯 大目标</div><div class="rewards-grid">';
    for (const reward of rewards) {
      const btnState = await getRewardButtonState(child.id, reward, balance, rulesConfig, date, weekStart, monthStart);
      html += renderRewardCard(reward, balance, btnState);
    }
    html += '</div></div>';
    container.innerHTML = html;

    bindRewardEvents(child, balance);
  }

  // ─── 渲染「我的券包」───
  //  券包显示的是历史兑换记录（redeemRecord），不是当前货架商品。
  //  即使 reward 后来被下架/隐藏/停用，已兑换的 pending 券仍然显示。
  async function renderVoucherWallet(child) {
    const container = document.getElementById('rewards-section-vouchers');
    // 兜底：容器不存在或 child 无效 → 静默退出
    if (!container) {
      console.warn('[VoucherWallet] 容器 #rewards-section-vouchers 不存在');
      return;
    }
    if (!child || !child.id) {
      container.innerHTML = '';
      return;
    }

    let records;
    try {
      records = await DB.getOpenRedeemRecords(child.id);
    } catch (e) {
      console.error('[VoucherWallet] 获取券包失败:', e);
      container.innerHTML = '';
      return;
    }

    if (!records || records.length === 0) {
      container.innerHTML = '';
      console.log('[VoucherWallet] 无 open 券包记录');
      return;
    }

    console.log('[VoucherWallet] 渲染券包, open 数量:', records.length,
      records.map(r => ({ id: r.id, status: r.status, ft: r.fulfillmentTypeSnapshot })));

    let html = '<div class="store-section"><div class="store-section-header">🎫 我的券包</div><div class="voucher-list">';

    for (const r of records) {
      // 全部使用 redeemRecord 快照字段，不依赖当前 reward 表
      const rname = r.rewardNameSnapshot || r.rewardName || '奖励';
      const desc = r.childDescriptionSnapshot || '';
      const cost = r.costSnapshot ?? r.cost ?? 0;
      const ft = r.fulfillmentTypeSnapshot || 'voucher';
      const isRequested = r.status === 'requested';

      // 根据 status 显示不同文案
      let statusChip;
      if (isRequested) {
        statusChip = '<span class="chip chip-warning">待家长确认</span>';
      } else {
        // status === 'pending'
        const ftLabel = fulfillmentTypeLabel(ft);
        statusChip = `<span class="chip chip-warning">待${ftLabel}</span>`;
      }

      const requestDate = (r.requestedAt || r.redeemedAt || r.time || '').substring(0, 10);

      // scheduled 类型：显示预约时间
      const scheduledInfo = (ft === 'scheduled' && r.scheduledFor)
        ? `<div class="voucher-scheduled">📅 预约时间：${r.scheduledFor.substring(0, 16)}</div>`
        : '';

      // application 类型：额外提示
      const isApplication = ft === 'application';

      // requested 状态：额外提示
      const requestedNote = isRequested
        ? '<div class="voucher-app-note">⏳ 家长确认后才会扣分</div>'
        : '';

      html += `
        <div class="voucher-card" data-redeem-id="${r.id}">
          <div class="voucher-icon">🎫</div>
          <div class="voucher-info">
            <div class="voucher-name">${Utils.escapeHtml ? Utils.escapeHtml(rname) : rname}</div>
            ${desc ? `<div class="voucher-desc">${Utils.escapeHtml ? Utils.escapeHtml(desc) : desc}</div>` : ''}
            <div class="voucher-meta">
              ${statusChip}
              <span class="chip">-${cost}⭐</span>
              <span class="chip chip-date">${requestDate}</span>
            </div>
            ${scheduledInfo}
            ${isApplication ? '<div class="voucher-app-note">📝 这是申请卡，家长最终决定是否同意。</div>' : ''}
            ${requestedNote}
          </div>
        </div>`;
    }

    html += '</div></div>';
    container.innerHTML = html;
  }

  /** 券包中不同 fulfillmentType 的中文状态文案 */
  function fulfillmentTypeLabel(ft) {
    const map = {
      instant:     '家长确认',
      voucher:     '使用',
      scheduled:   '安排时间',
      physical:    '兑现',
      application: '家长决定'
    };
    return map[ft] || '处理';
  }

  // ─── 绑定事件 ───
  function bindRewardEvents(child, balance) {
    document.querySelectorAll('.reward-btn').forEach(btn => {
      // 移除旧事件（通过克隆节点）
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);

      newBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const rewardId = newBtn.dataset.rewardId;
        const reward = await DB.getReward(rewardId);
        if (!reward) return;

        if (newBtn.classList.contains('pending') || newBtn.classList.contains('locked') || newBtn.classList.contains('limit-reached')) return;

        if (newBtn.classList.contains('available')) {
          showRedeemConfirm(child, reward, balance);
        }
      });
    });
  }

  // ─── 兑换确认弹窗 ───
  function showRedeemConfirm(child, reward, balance) {
    const modal = document.getElementById('global-modal');
    const content = document.getElementById('global-modal-content');

    const afterBalance = balance - reward.cost;

    content.innerHTML = `
      <div class="redeem-confirm">
        <div class="redeem-confirm-icon">${reward.icon || '🎁'}</div>
        <div class="redeem-confirm-name">${reward.name}</div>
        ${reward.childDescription ? `<div class="redeem-confirm-desc">${reward.childDescription}</div>` : ''}
        <div class="redeem-confirm-cost">⭐ ${reward.cost}</div>
        <div class="redeem-confirm-balance">
          当前余额：<strong>${balance}</strong>
        </div>
        <div class="redeem-confirm-note">💡 提交后等待家长确认，家长确认后才会扣分。</div>
        ${reward.fulfillmentType === 'application' ? '<div class="redeem-confirm-note">📝 这是申请卡，家长最终决定是否同意。</div>' : ''}
        <div class="modal-buttons">
          <button class="btn btn-secondary" id="redeem-cancel">取消</button>
          <button class="btn btn-primary" id="redeem-confirm">申请兑换</button>
        </div>
      </div>
    `;

    modal.classList.add('active');

    document.getElementById('redeem-cancel').onclick = () => {
      modal.classList.remove('active');
    };

    document.getElementById('redeem-confirm').onclick = async () => {
      modal.classList.remove('active');
      await executeRedeem(child, reward);
    };

    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('active');
    };
  }

  // ─── 执行兑换申请（委托 DB 事务方法）───
  async function executeRedeem(child, reward) {
    try {
      const result = await DB.requestRedeem(child.id, reward.id);
      console.log('[RequestRedeem] 申请兑换成功:', result);

      // 刷新页面
      await render();

      // 二次验证券包
      const openRecords = await DB.getOpenRedeemRecords(child.id);
      console.log('[RequestRedeem] 券包 open 数量:', openRecords.length, openRecords.map(r => r.id));

      alert(`已提交兑换申请！\n"${reward.name}"\n请等待家长确认，家长确认后才会扣分。`);
    } catch (err) {
      console.error('[RequestRedeem] 申请兑换失败:', err);
      alert(err.message || '申请兑换失败，请重试');
      // 刷新以恢复 UI 状态
      await render();
    }
  }

  // ─── 公开 API ───
  return {
    render
  };

})();
