// src/app.js – 路由 + 全局状态管理
// 暑假任务打卡积分系统 V2

const App = (() => {

  // ─── 页面路由枚举 ───
  const PAGES = {
    CHALLENGE:  'page-challenge',   // 孩子端：今日挑战
    REWARDS:    'page-rewards',     // 孩子端：奖励兑换
    HISTORY:    'page-history',     // 孩子端：积分流水
    CONFIRM:    'page-confirm',     // 家长端：今日确认
    MANAGE:     'page-manage',      // 家长端：奖励管理
    SETTINGS:   'page-settings',    // 家长端：设置
    PIN:        'page-pin'          // PIN 码验证
  };

  // ─── 全局状态 ───
  let currentPage = null;
  let isParentMode = false;
  let currentChild = null;
  let currentConfig = null;
  let currentRules = null;

  // ─── 初始化 ───
  async function init() {
    // 注册 Service Worker
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('./sw.js');
        console.log('[App] Service Worker registered, scope:', registration.scope);

        // 情况 1: 首次安装（新用户或新版本 SW 正在安装中）
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          console.log('[App] 发现新 Service Worker 正在安装...');
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // 有旧版 SW 正在控制页面 → 新版已就绪，等待激活
              console.log('[App] 新版本已下载就绪，准备刷新页面...');
              // 通知 SW 立即激活
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        // 情况 2: SW 已经在等待状态（页面加载时发现已有 waiting worker）
        if (registration.waiting) {
          console.log('[App] 已有等待中的新版本，立即激活...');
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // 情况 3: 监听 controllerchange — 新 SW 接管页面后刷新
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          console.log('[App] 新版本 Service Worker 已接管，刷新页面...');
          window.location.reload();
        });
      } catch (err) {
        console.warn('[App] Service Worker registration failed:', err);
      }
    }

    // 初始化数据库和默认数据
    const cfg = await DB.getAppConfig();
    let childId, childName, childAvatar;

    if (cfg && cfg.boundChildId) {
      childId = cfg.boundChildId;
      const child = await DB.getChild(childId);
      if (child) {
        childName = child.name;
        childAvatar = child.avatar || '🦊';
      } else {
        childName = '小朋友';
        childAvatar = '🦊';
      }
    } else {
      // 首次启动 - 从 URL 参数或默认值确定孩子
      const params = new URLSearchParams(window.location.search);
      childId = params.get('child') || 'child-default';
      childName = params.get('name') || '小朋友';
      childAvatar = 'football'; // avatarId, not emoji
    }

    await DB.initDefaults(childId, childName, childAvatar);

    // 加载当前孩子和配置
    await refreshState();

    // 默认进入今日挑战页（无论是否已设置 PIN）
    // 家长设置只能通过点击家长入口进入，不能作为默认首页
    navigate(PAGES.CHALLENGE);

    // 绑定底部导航
    bindNavigation();
  }

  /** 刷新全局状态 */
  async function refreshState() {
    currentChild = await DB.getActiveChild();
    currentConfig = await DB.getAppConfig();
    currentRules = await DB.getRulesConfig();
  }

  // ─── 页面导航 ───
  function navigate(pageId, params = {}) {
    console.log('[navigate] called with:', pageId, 'isParentMode:', isParentMode, 'currentConfig:', currentConfig);

    // 如果不是家长模式，限制只能访问孩子端页面
    if (!isParentMode && [PAGES.CONFIRM, PAGES.MANAGE, PAGES.SETTINGS].includes(pageId)) {
      console.log('[navigate] parent page detected, checking bypass...');
      // 没有设置 PIN 时，任何家长入口都直接进入设置页（允许创建 PIN）
      if (currentConfig && !currentConfig.parentPinHash) {
        console.log('[navigate] no PIN set → switchPage(SETTINGS)');
        switchPage(PAGES.SETTINGS, params);
        return;
      }
      // 需要 PIN 验证
      console.log('[navigate] showing PIN gate');
      showPinGate(pageId, params);
      return;
    }

    console.log('[navigate] switchPage:', pageId);
    switchPage(pageId, params);
  }

  function switchPage(pageId, params = {}) {
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    // 显示目标页面
    const target = document.getElementById(pageId);
    if (target) {
      target.classList.add('active');
      currentPage = pageId;

      // 触发页面渲染
      renderPage(pageId, params);
    }

    // 更新底部导航高亮
    updateNavHighlight(pageId);
  }

  /** 渲染当前页面 */
  async function renderPage(pageId, params = {}) {
    switch (pageId) {
      case PAGES.CHALLENGE:
        if (typeof ChallengePage !== 'undefined') await ChallengePage.render();
        break;
      case PAGES.REWARDS:
        if (typeof RewardsPage !== 'undefined') await RewardsPage.render();
        break;
      case PAGES.HISTORY:
        if (typeof HistoryPage !== 'undefined') await HistoryPage.render();
        break;
      case PAGES.CONFIRM:
        if (typeof ConfirmPage !== 'undefined') await ConfirmPage.render(params.date);
        break;
      case PAGES.MANAGE:
        if (typeof ManagePage !== 'undefined') await ManagePage.render();
        break;
      case PAGES.SETTINGS:
        if (typeof SettingsPage !== 'undefined') await SettingsPage.render();
        break;
      case PAGES.PIN:
        // PIN 页是特殊的 overlay
        break;
    }
  }

  // ─── 底部导航绑定 ───
  function bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        if (page) navigate(page);
      });
    });
  }

  function updateNavHighlight(pageId) {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === pageId);
    });

    // 家长端页面特殊处理
    const isParentPage = [PAGES.CONFIRM, PAGES.MANAGE, PAGES.SETTINGS].includes(pageId);
    document.querySelectorAll('.nav-item.parent-only').forEach(item => {
      if (isParentPage) {
        item.classList.add('active');
      }
    });
  }

  // ─── PIN 门控 ───
  function showPinGate(targetPage, params = {}) {
    const pinPage = document.getElementById(PAGES.PIN);
    if (!pinPage) return;

    pinPage.style.display = 'flex';

    // 绑定 PIN 页回调
    if (typeof PinGate !== 'undefined') {
      PinGate.show({
        onSuccess: async () => {
          isParentMode = true;
          pinPage.style.display = 'none';
          switchPage(targetPage, params);
        },
        onCancel: () => {
          pinPage.style.display = 'none';
        }
      });
    }
  }

  /** 退出家长模式 */
  function exitParentMode() {
    isParentMode = false;
    navigate(PAGES.CHALLENGE);
  }

  /** 进入家长模式（从 PIN 页直接调用） */
  function enterParentMode() {
    isParentMode = true;
  }

  // ─── 状态获取器 ───
  function getCurrentChild() { return currentChild; }
  function getCurrentConfig() { return currentConfig; }
  function getCurrentRules() { return currentRules; }
  function getIsParentMode() { return isParentMode; }

  // ─── 公开 API ───
  return {
    PAGES,
    init,
    navigate,
    switchPage,
    refreshState,
    exitParentMode,
    enterParentMode,
    getCurrentChild,
    getCurrentConfig,
    getCurrentRules,
    getIsParentMode
  };

})();

// ─── 应用启动 ───
document.addEventListener('DOMContentLoaded', () => {
  App.init().catch(err => {
    console.error('[App] Initialization failed:', err);
    document.body.innerHTML = `<div style="color:#e94560;padding:2rem;text-align:center;">
      <h1>⚠️ 初始化失败</h1>
      <p>${err.message}</p>
      <p style="margin-top:1rem;font-size:0.85rem;color:#888;">请检查浏览器是否支持 IndexedDB</p>
    </div>`;
  });
});
