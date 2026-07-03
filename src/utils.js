// src/utils.js – 日期、格式化等工具函数
// 暑假任务打卡积分系统 V2

const Utils = (() => {

  // ─── 常量 ───
  const MS_PER_DAY = 86400000;

  // ─── 日期工具 ───

  /** 获取今天的日期字符串 YYYY-MM-DD（考虑日界线偏移） */
  function getToday(dayCutoffHour = 4) {
    const now = new Date();
    const hour = now.getHours();
    // 凌晨 0:00 – 3:59 算前一天
    if (hour < dayCutoffHour) {
      now.setDate(now.getDate() - 1);
    }
    return formatDate(now);
  }

  /** 格式化日期为 YYYY-MM-DD */
  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** 解析日期字符串为 Date 对象 */
  function parseDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /** 日期加减天数 */
  function addDays(dateStr, days) {
    const d = parseDate(dateStr);
    d.setDate(d.getDate() + days);
    return formatDate(d);
  }

  /** 计算两个日期相差的天数 */
  function diffDays(dateStr1, dateStr2) {
    const d1 = parseDate(dateStr1);
    const d2 = parseDate(dateStr2);
    return Math.round((d2 - d1) / MS_PER_DAY);
  }

  /** 获取本周起始日期（周一） */
  function getWeekStart(dateStr, dayCutoffHour = 4) {
    const d = parseDate(dateStr);
    const dow = d.getDay(); // 0=周日
    const diff = dow === 0 ? 6 : dow - 1; // 调整为周一起始
    d.setDate(d.getDate() - diff);
    return formatDate(d);
  }

  /** 获取本月起始日期 */
  function getMonthStart(dateStr) {
    const [y, m] = dateStr.split('-').map(Number);
    return `${y}-${String(m).padStart(2, '0')}-01`;
  }

  /** 获取当前时间 ISO 字符串（+08:00 时区） */
  function nowISO() {
    const d = new Date();
    const offset = 8 * 60; // +08:00
    const local = new Date(d.getTime() + (offset - d.getTimezoneOffset()) * 60000);
    return local.toISOString().replace('Z', '+08:00');
  }

  /** 星期几的数字表示（1=周一 ~ 7=周日） */
  function getDayOfWeek(dateStr) {
    const d = parseDate(dateStr);
    return d.getDay() === 0 ? 7 : d.getDay();
  }

  /** 根据 dayCutoffHour 计算任意时刻的 appDate
   *  规则：小时 < dayCutoffHour → 归属前一天，否则归属当天 */
  function getAppDate(date = new Date(), dayCutoffHour = 4) {
    const d = new Date(date);
    if (d.getHours() < dayCutoffHour) {
      d.setDate(d.getDate() - 1);
    }
    return formatDate(d);
  }

  /** 判断是否是今天（考虑日界线） */
  function isToday(dateStr, dayCutoffHour = 4) {
    return dateStr === getToday(dayCutoffHour);
  }

  // ─── 格式化工具 ───

  /** 格式化积分显示 */
  function formatPoints(n) {
    if (n >= 0) return `+${n}`;
    return `${n}`;
  }

  /** 格式化分钟数为易读格式 */
  function formatMinutes(min) {
    if (!min || min <= 0) return '0分钟';
    if (min < 60) return `${min}分钟`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (m === 0) return `${h}小时`;
    return `${h}小时${m}分钟`;
  }

  /** 生成唯一 ID */
  function genId(prefix = 'id') {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${ts}-${rand}`;
  }

  // ─── SHA-256 工具 ───

  /** 计算 SHA-256 哈希（用于 PIN 验证） */
  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ─── 数据校验工具 ───

  /** 校验备份 JSON 结构 */
  function validateBackup(json, isTemplate = false) {
    if (!json || typeof json !== 'object') return { valid: false, error: '无效的 JSON 格式' };
    if (json.exportVersion !== 2) return { valid: false, error: `不支持的版本: ${json.exportVersion}` };
    if (json.exportType !== (isTemplate ? 'template' : 'full')) {
      return { valid: false, error: `类型不匹配: 期望 ${isTemplate ? 'template' : 'full'}, 实际 ${json.exportType}` };
    }
    if (!json.data || typeof json.data !== 'object') return { valid: false, error: '缺少 data 字段' };
    return { valid: true };
  }

  /** 深拷贝对象 */
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // ─── 公开 API ───
  return {
    // 日期
    getToday,
    getAppDate,
    formatDate,
    parseDate,
    addDays,
    diffDays,
    getWeekStart,
    getMonthStart,
    nowISO,
    getDayOfWeek,
    isToday,
    // 格式化
    formatPoints,
    formatMinutes,
    // 其他
    genId,
    sha256,
    validateBackup,
    deepClone,
    // 常量
    MS_PER_DAY
  };

})();
