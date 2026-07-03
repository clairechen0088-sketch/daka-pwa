// src/backup.js – 数据导出/导入逻辑
// 暑假任务打卡积分系统 V2
// 支持完整备份 + 配置模板导出/导入

const Backup = (() => {

  // ─── 导出完整备份 ───
  async function exportFull() {
    const cfg = await DB.getAppConfig();
    const childId = cfg ? cfg.boundChildId : null;

    const data = {
      appConfig:         cfg ? await DB.db.appConfig.get('singleton') : null,
      rulesConfig:       await DB.db.rulesConfig.get('singleton'),
      child:             childId ? await DB.db.child.get(childId) : null,
      taskTemplates:     await DB.db.taskTemplates.toArray(),
      dailyTasks:        childId ? await DB.db.dailyTasks.where('childId').equals(childId).toArray() : [],
      dailySummaries:    childId ? await DB.db.dailySummaries.where('childId').equals(childId).toArray() : [],
      pointRecords:      childId ? await DB.db.pointRecords.where('childId').equals(childId).toArray() : [],
      rewards:           await DB.db.rewards.toArray(),
      redeemRecords:     childId ? await DB.db.redeemRecords.where('childId').equals(childId).toArray() : [],
      lotteryConfig:     await DB.db.lotteryConfig.get('singleton'),
      lotteryRecords:    childId ? await DB.db.lotteryRecords.where('childId').equals(childId).toArray() : [],
      chanceRecords:     childId ? await DB.db.chanceRecords.where('childId').equals(childId).toArray() : [],
      streak:            childId ? await DB.db.streak.get(childId) : null,
      streakAwardRecords: childId ? await DB.db.streakAwardRecords.where('childId').equals(childId).toArray() : [],
      protectionCardRecords: childId ? await DB.db.protectionCardRecords.where('childId').equals(childId).toArray() : [],
      manualOverrideRecords: childId ? await DB.db.manualOverrideRecords.where('childId').equals(childId).toArray() : [],
      videoListItems:     await DB.db.videoListItems.toArray(),
      parentScores:       childId ? await DB.db.parentScores.where('childId').equals(childId).toArray() : [],
      parentLetters:      childId ? await DB.db.parentLetters.where('childId').equals(childId).toArray() : []
    };

    // 过滤 null 值
    for (const key of Object.keys(data)) {
      if (data[key] === null || data[key] === undefined) {
        if (Array.isArray(data[key])) {
          // keep empty array
        } else {
          delete data[key];
        }
      }
    }
    // 将 singleton 记录包装为对象（非数组）
    // （appConfig/rulesConfig/lotteryConfig 已经是对象）

    const backup = {
      exportType: 'full',
      exportVersion: 2,
      exportedAt: Utils.nowISO(),
      deviceId: cfg ? cfg.deviceId : 'unknown',
      boundChildId: childId || 'unknown',
      data: data
    };

    return backup;
  }

  // ─── 导出配置模板 ───
  async function exportTemplate() {
    const cfg = await DB.getAppConfig();

    const data = {
      rulesConfig:   await DB.db.rulesConfig.get('singleton'),
      taskTemplates: await DB.db.taskTemplates.toArray(),
      rewards:       await DB.db.rewards.toArray(),
      lotteryConfig: await DB.db.lotteryConfig.get('singleton')
    };

    const template = {
      exportType: 'template',
      exportVersion: 2,
      exportedAt: Utils.nowISO(),
      sourceDeviceId: cfg ? cfg.deviceId : 'unknown',
      data: data
    };

    return template;
  }

  // ─── 下载 JSON 文件 ───
  function downloadJSON(jsonObj, filename) {
    const jsonStr = JSON.stringify(jsonObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** 导出并下载完整备份 */
  async function downloadFullBackup() {
    const backup = await exportFull();
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const filename = `checkin_full_backup_${backup.boundChildId}_${ts}.json`;
    downloadJSON(backup, filename);

    // 更新上次备份时间
    await DB.updateAppConfig({ lastBackupAt: Utils.nowISO() });

    return filename;
  }

  /** 导出并下载配置模板 */
  async function downloadTemplate() {
    const template = await exportTemplate();
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const filename = `checkin_config_template_${ts}.json`;
    downloadJSON(template, filename);
    return filename;
  }

  // ─── 读取文件 ───
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target.result);
          resolve(json);
        } catch (err) {
          reject(new Error('文件解析失败：不是有效的 JSON 格式'));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }

  // ─── 导入完整备份 ───
  async function importFull(json) {
    // 校验格式
    const validation = Utils.validateBackup(json, false);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const data = json.data;

    // 要求 data 中至少有关键数据
    if (!data.appConfig && !data.child) {
      return { success: false, error: '备份数据不完整：缺少 appConfig 和 child' };
    }

    // 保存 PIN 哈希（外部调用方决定是否保留）
    const pinHash = data.appConfig ? data.appConfig.parentPinHash : null;

    return {
      success: true,
      data: data,
      boundChildId: json.boundChildId,
      pinHash: pinHash
    };
  }

  /** 执行完整备份导入（写入数据库） */
  async function executeFullImport(data) {
    // 清空所有数据
    await DB.resetAll();

    // ── 标准化 rewards（补齐 V3 字段）──
    if (data.rewards && Array.isArray(data.rewards)) {
      data.rewards = data.rewards.map(r => DB.normalizeRewardForImport(r));
    }

    // ── 标准化 redeemRecords（补齐 V3 字段）──
    if (data.redeemRecords && Array.isArray(data.redeemRecords)) {
      data.redeemRecords = data.redeemRecords.map(r => DB.normalizeRedeemRecordForImport(r));
    }

    // 按顺序写入各表
    const tables = [
      'appConfig', 'rulesConfig', 'lotteryConfig',
      'child',
      'taskTemplates', 'rewards',
      'dailyTasks', 'dailySummaries',
      'pointRecords', 'redeemRecords',
      'lotteryRecords', 'chanceRecords',
      'streak', 'streakAwardRecords',
      'protectionCardRecords', 'manualOverrideRecords',
      'videoListItems', 'parentScores', 'parentLetters'
    ];

    for (const table of tables) {
      if (data[table]) {
        if (Array.isArray(data[table])) {
          if (data[table].length > 0) {
            await DB.db.table(table).bulkAdd(data[table]);
          }
        } else {
          // 单条记录
          await DB.db.table(table).add(data[table]);
        }
      }
    }

    // ── V3.1 修复：导入完整备份后，确保 appConfig 存在且标记货架已初始化 ──
    // 避免 reload 后 initDefaults() 因 storefrontInitializedV31 缺失而覆盖导入的 rewards 配置
    const cfg = await DB.db.appConfig.get('singleton');
    if (cfg) {
      await DB.db.appConfig.update('singleton', { storefrontInitializedV31: true });
    } else {
      // 兜底：旧备份可能没有 appConfig，创建最小 singleton
      await DB.db.appConfig.add({
        id: 'singleton',
        storefrontInitializedV31: true,
        schemaVersion: 2,
        deviceId: data.appConfig?.deviceId || (data.child ? `imported-${data.child.id || 'unknown'}` : 'imported'),
        boundChildId: data.appConfig?.boundChildId || data.child?.id || 'imported',
        timezone: 'Asia/Shanghai',
        dayCutoffHour: 4,
        parentPinHash: data.appConfig?.parentPinHash || null,
        createdAt: Utils.nowISO(),
        lastBackupAt: null
      });
    }
    console.log('[Backup] executeFullImport: storefrontInitializedV31 → true');

    return { success: true };
  }

  // ─── 导入配置模板 ───
  async function importTemplate(json) {
    const validation = Utils.validateBackup(json, true);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const data = json.data;

    if (!data.rulesConfig && !data.taskTemplates && !data.rewards) {
      return { success: false, error: '配置模板为空' };
    }

    return {
      success: true,
      data: data
    };
  }

  /** 执行配置模板导入（仅覆盖配置，不影响个人数据） */
  async function executeTemplateImport(data) {
    // 覆盖 rulesConfig
    if (data.rulesConfig) {
      await DB.db.rulesConfig.put(data.rulesConfig);
    }

    // 覆盖 taskTemplates（先清空再写入）
    if (data.taskTemplates) {
      await DB.db.taskTemplates.clear();
      await DB.db.taskTemplates.bulkAdd(data.taskTemplates);
    }

    // ── 标准化 rewards（补齐 V3 字段）──
    if (data.rewards) {
      const normalizedRewards = data.rewards.map(r => DB.normalizeRewardForImport(r));
      await DB.db.rewards.clear();
      await DB.db.rewards.bulkAdd(normalizedRewards);
    }

    // ── V3.1 修复：配置模板导入后补齐缺失字段（不覆盖 visibleToChild/displaySection）──
    await DB.ensureRewardsV31Complete();
    // ★ 不再调用 enforceDefaultStorefrontV31() — 配置模板导入应保留导入的货架配置

    // ── V3.1 修复：标记货架已初始化，避免后续 initDefaults() 覆盖导入的 rewards 配置 ──
    await DB.db.appConfig.update('singleton', { storefrontInitializedV31: true });
    console.log('[Backup] executeTemplateImport: storefrontInitializedV31 → true');

    // 覆盖 lotteryConfig
    if (data.lotteryConfig) {
      await DB.db.lotteryConfig.put(data.lotteryConfig);
    }

    return { success: true };
  }

  /** 检查上次备份时间，超过 7 天返回 true */
  async function isBackupOverdue() {
    const cfg = await DB.getAppConfig();
    if (!cfg || !cfg.lastBackupAt) return true;

    const lastDate = new Date(cfg.lastBackupAt);
    const now = new Date();
    const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    return diffDays >= 7;
  }

  /** 获取上次备份时间描述 */
  async function getLastBackupDesc() {
    const cfg = await DB.getAppConfig();
    if (!cfg || !cfg.lastBackupAt) return '从未备份';

    const last = new Date(cfg.lastBackupAt);
    const now = new Date();
    const diffMs = now - last;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffDays === 0) {
      if (diffHours === 0) return '刚刚';
      return `${diffHours}小时前`;
    }
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    return `${diffDays}天前（建议备份）`;
  }

  // ─── 公开 API ───
  return {
    exportFull,
    exportTemplate,
    downloadFullBackup,
    downloadTemplate,
    readFile,
    importFull,
    executeFullImport,
    importTemplate,
    executeTemplateImport,
    isBackupOverdue,
    getLastBackupDesc
  };

})();
