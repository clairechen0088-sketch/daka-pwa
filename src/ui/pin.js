// src/ui/pin.js – PIN 码验证门控
// 暑假任务打卡积分系统 V2
// 使用单隐藏输入框 + 视觉圆点模式，避免多输入框焦点切换的事件问题

const PinGate = (() => {

  let currentCallback = null;
  let bound = false;

  // ─── 绑定隐藏输入框事件（仅一次）───
  function ensureBound() {
    if (bound) return;
    bound = true;

    const hiddenInput = document.getElementById('pin-hidden-input');
    if (!hiddenInput) return;

    const dots = document.querySelectorAll('#pin-dots-container .pin-dot');
    const errorEl = document.getElementById('pin-error');

    // 输入事件：更新视觉圆点
    hiddenInput.addEventListener('input', () => {
      const digits = hiddenInput.value.replace(/\D/g, '').slice(0, 4);
      hiddenInput.value = digits;
      errorEl.style.display = 'none';

      // 更新每个圆点
      dots.forEach((dot, i) => {
        if (i < digits.length) {
          dot.classList.add('filled');
        } else {
          dot.classList.remove('filled');
        }
        // 高亮当前待输入位置
        dot.classList.toggle('active', i === digits.length && digits.length < 4);
      });

      // 输满 4 位自动验证
      if (digits.length === 4) {
        setTimeout(() => verifyPin(), 150);
      }
    });

    // 处理粘贴：只提取数字
    hiddenInput.addEventListener('paste', (e) => {
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      const digits = pasted.replace(/\D/g, '').slice(0, 4);
      if (digits.length > 0) {
        e.preventDefault();
        hiddenInput.value = digits;
        hiddenInput.dispatchEvent(new Event('input'));
      }
    });
  }

  // ─── 显示 PIN 验证 ───
  function show(opts) {
    currentCallback = opts;
    ensureBound();

    const hiddenInput = document.getElementById('pin-hidden-input');
    const dots = document.querySelectorAll('#pin-dots-container .pin-dot');
    const errorEl = document.getElementById('pin-error');

    // 重置
    if (hiddenInput) {
      hiddenInput.value = '';
      hiddenInput.focus();
    }
    dots.forEach(d => {
      d.classList.remove('filled', 'active');
    });
    // 第一个圆点高亮
    if (dots.length > 0) dots[0].classList.add('active');
    if (errorEl) errorEl.style.display = 'none';
  }

  // ─── 验证 PIN ───
  async function verifyPin() {
    const hiddenInput = document.getElementById('pin-hidden-input');
    const dots = document.querySelectorAll('#pin-dots-container .pin-dot');
    const errorEl = document.getElementById('pin-error');
    const pin = hiddenInput ? hiddenInput.value.replace(/\D/g, '').slice(0, 4) : '';

    if (pin.length !== 4) return;

    const config = await DB.getAppConfig();
    if (!config || !config.parentPinHash) {
      // 没有设置 PIN，直接通过
      if (currentCallback && currentCallback.onSuccess) {
        currentCallback.onSuccess();
      }
      return;
    }

    const hash = await Utils.sha256(pin);

    if (hash === config.parentPinHash) {
      // 验证成功
      if (errorEl) errorEl.style.display = 'none';
      if (currentCallback && currentCallback.onSuccess) {
        currentCallback.onSuccess();
      }
    } else {
      // 验证失败
      if (errorEl) {
        errorEl.textContent = 'PIN 码不正确';
        errorEl.style.display = 'block';
      }

      // 清空输入
      if (hiddenInput) {
        hiddenInput.value = '';
        hiddenInput.focus();
      }
      dots.forEach(d => {
        d.classList.remove('filled', 'active');
      });
      if (dots.length > 0) dots[0].classList.add('active');
    }
  }

  // ─── 取消 ───
  function hide() {
    const pinPage = document.getElementById('page-pin');
    if (pinPage) pinPage.style.display = 'none';
  }

  // 绑定取消按钮
  document.addEventListener('DOMContentLoaded', () => {
    const cancelBtn = document.getElementById('pin-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        hide();
        if (currentCallback && currentCallback.onCancel) {
          currentCallback.onCancel();
        }
      });
    }
  });

  // ─── 公开 API ───
  return {
    show,
    hide
  };

})();
