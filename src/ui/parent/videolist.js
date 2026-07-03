// src/ui/parent/videolist.js – 视频名单管理（白名单/黑名单备忘录）
// 暑假任务打卡积分系统 V2
// 此模块不参与打卡、积分、英语能量、兑换等任何核心逻辑
// 仅作为家长端备忘录使用

const VideoListPage = (() => {

  // ─── 平台选项 ───
  const PLATFORM_OPTIONS = [
    { value: '', label: '不限平台' },
    { value: 'YouTube', label: 'YouTube' },
    { value: 'B站', label: 'B站' },
    { value: 'Netflix', label: 'Netflix' },
    { value: '抖音', label: '抖音' },
    { value: '快手', label: '快手' },
    { value: 'Shorts', label: 'Shorts' },
    { value: '各平台', label: '各平台' },
    { value: '其他', label: '其他' }
  ];

  // ─── 渲染入口 ───
  async function render() {
    const modal = document.getElementById('global-modal');
    const content = document.getElementById('global-modal-content');

    const [whitelist, blacklist] = await Promise.all([
      DB.getVideoListItemsByType('whitelist'),
      DB.getVideoListItemsByType('blacklist')
    ]);

    content.innerHTML = `
      <h2>📺 视频名单管理</h2>
      <p style="font-size:11px;color:var(--color-text-muted);margin-bottom:var(--space-md);">
        💡 此页面仅作为家长备忘录，记录白名单/黑名单视频供参考。<br>
        不参与打卡、积分、英语能量、兑换、处罚等任何自动化功能。
      </p>
      <div class="videolist-container" style="text-align:left;max-height:65vh;overflow-y:auto;">

        <!-- ═══ 白名单 ═══ -->
        <div class="videolist-section">
          <div class="section-title" style="margin-top:0;">✅ 白名单</div>
          <p class="text-muted" style="font-size:10px;margin-bottom:var(--space-xs);">
            推荐观看的视频 / 频道 / 关键词
          </p>
          ${renderAddForm('whitelist')}
          ${renderItemList('whitelist', whitelist)}
        </div>

        <!-- ═══ 黑名单 ═══ -->
        <div class="videolist-section" style="margin-top:var(--space-lg);">
          <div class="section-title" style="margin-top:0;">🚫 黑名单</div>
          <p class="text-muted" style="font-size:10px;margin-bottom:var(--space-xs);">
            不建议观看的视频 / 频道 / 关键词
          </p>
          ${renderAddForm('blacklist')}
          ${renderItemList('blacklist', blacklist)}
        </div>

      </div>
      <div class="modal-buttons" style="margin-top:var(--space-md);">
        <button class="btn btn-secondary" id="videolist-close-btn">返回设置</button>
      </div>
    `;

    modal.classList.add('active');

    // 绑定事件
    bindEvents();

    // 点击背景关闭
    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('active');
    };
  }

  // ─── 新增表单 HTML ───
  function renderAddForm(listType) {
    const placeholder = listType === 'whitelist'
      ? '例如：Peppa Pig English / Numberblocks / BBC Earth Kids'
      : '例如：短视频刷屏 / 游戏解说 / 搞笑整蛊视频';
    const prefix = listType === 'whitelist' ? 'wl' : 'bl';

    return `
      <div class="videolist-add-form" id="videolist-add-${listType}">
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;">
          <div style="flex:1;min-width:140px;">
            <input type="text" id="videolist-${prefix}-title"
              placeholder="${placeholder}"
              style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--color-text-muted);background:var(--color-bg-input);color:var(--color-text);font-size:var(--font-size-sm);">
          </div>
          <div style="width:100px;">
            <input type="text" id="videolist-${prefix}-platform" list="platform-datalist"
              placeholder="平台（可输入）"
              style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--color-text-muted);background:var(--color-bg-input);color:var(--color-text);font-size:11px;">
            <datalist id="platform-datalist">
              ${PLATFORM_OPTIONS.filter(o => o.value).map(o => `<option value="${o.value}">`).join('')}
            </datalist>
          </div>
          <div style="flex:1;min-width:100px;">
            <input type="text" id="videolist-${prefix}-note"
              placeholder="备注（可选）"
              style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--color-text-muted);background:var(--color-bg-input);color:var(--color-text);font-size:var(--font-size-sm);">
          </div>
          <button class="btn btn-primary btn-sm" data-add-videolist="${listType}">➕ 添加</button>
        </div>
      </div>
    `;
  }

  // ─── 条目列表 HTML ───
  function renderItemList(listType, items) {
    if (!items || items.length === 0) {
      const emptyText = listType === 'whitelist' ? '暂无白名单视频' : '暂无黑名单视频';
      return `<p class="text-muted" style="font-size:var(--font-size-xs);padding:var(--space-sm) 0;text-align:center;">${emptyText}</p>`;
    }

    return items.map(item => `
      <div class="videolist-item" data-videolist-id="${item.id}" data-list-type="${listType}">
        <div class="videolist-item-info">
          <span class="videolist-item-title">${Utils.escapeHtml(item.title)}</span>
          ${item.platform ? `<span class="chip chip-study" style="font-size:9px;">${Utils.escapeHtml(item.platform)}</span>` : ''}
          ${item.note ? `<span class="videolist-item-note">${Utils.escapeHtml(item.note)}</span>` : ''}
        </div>
        <div class="videolist-item-actions">
          <button class="btn btn-secondary btn-sm" data-edit-videolist="${item.id}">✏️</button>
          <button class="btn btn-danger btn-sm" data-delete-videolist="${item.id}">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  // ─── 事件绑定 ───
  function bindEvents() {
    // 关闭按钮
    const closeBtn = document.getElementById('videolist-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        document.getElementById('global-modal').classList.remove('active');
      };
    }

    // 添加按钮
    document.querySelectorAll('[data-add-videolist]').forEach(btn => {
      btn.onclick = async () => {
        const listType = btn.dataset.addVideolist;
        const prefix = listType === 'whitelist' ? 'wl' : 'bl';

        const title = document.getElementById(`videolist-${prefix}-title`).value.trim();
        if (!title) {
          alert('请输入视频名 / 频道名 / 关键词');
          return;
        }

        const platform = document.getElementById(`videolist-${prefix}-platform`).value;
        const note = document.getElementById(`videolist-${prefix}-note`).value.trim();

        await DB.addVideoListItem({
          id: Utils.genId('vlist'),
          listType,
          title,
          platform,
          note,
          active: 1,
          sortOrder: null // 由 DB 层自动计算
        });

        // 清空输入
        document.getElementById(`videolist-${prefix}-title`).value = '';
        document.getElementById(`videolist-${prefix}-platform`).value = '';
        document.getElementById(`videolist-${prefix}-note`).value = '';

        // 重新渲染
        await render();
      };
    });

    // 编辑按钮
    document.querySelectorAll('[data-edit-videolist]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.editVideolist;
        const items = await DB.getVideoListItems();
        const item = items.find(i => i.id === id);
        if (!item) return;

        showEditForm(item);
      };
    });

    // 删除按钮
    document.querySelectorAll('[data-delete-videolist]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.deleteVideolist;
        if (!confirm('确定删除这条记录吗？')) return;

        await DB.deleteVideoListItem(id);
        await render();
      };
    });
  }

  // ─── 编辑弹窗 ───
  function showEditForm(item) {
    const modal = document.getElementById('global-modal');
    const content = document.getElementById('global-modal-content');

    const listTypeLabel = item.listType === 'whitelist' ? '白名单' : '黑名单';

    content.innerHTML = `
      <h2>编辑${listTypeLabel}条目</h2>
      <div style="text-align:left;">
        <div class="settings-item">
          <label>视频名 / 频道名</label>
          <input type="text" id="edit-vlist-title" value="${Utils.escapeHtml(item.title)}"
            style="width:200px;padding:6px 8px;border-radius:6px;border:1px solid var(--color-text-muted);background:var(--color-bg-input);color:var(--color-text);">
        </div>
        <div class="settings-item">
          <label>平台</label>
          <input type="text" id="edit-vlist-platform" list="platform-datalist-edit"
            value="${Utils.escapeHtml(item.platform || '')}"
            placeholder="可自由输入平台名"
            style="width:200px;padding:6px 8px;border-radius:6px;border:1px solid var(--color-text-muted);background:var(--color-bg-input);color:var(--color-text);">
          <datalist id="platform-datalist-edit">
            ${PLATFORM_OPTIONS.filter(o => o.value).map(o => `<option value="${o.value}">`).join('')}
          </datalist>
        </div>
        <div class="settings-item">
          <label>备注</label>
          <input type="text" id="edit-vlist-note" value="${Utils.escapeHtml(item.note || '')}"
            style="width:200px;padding:6px 8px;border-radius:6px;border:1px solid var(--color-text-muted);background:var(--color-bg-input);color:var(--color-text);"
            placeholder="可选备注">
        </div>
        <div class="settings-item">
          <label>类型</label>
          <select id="edit-vlist-type"
            style="width:180px;padding:6px;border-radius:6px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-text-muted);">
            <option value="whitelist" ${item.listType === 'whitelist' ? 'selected' : ''}>✅ 白名单</option>
            <option value="blacklist" ${item.listType === 'blacklist' ? 'selected' : ''}>🚫 黑名单</option>
          </select>
        </div>
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" id="edit-vlist-cancel">取消</button>
        <button class="btn btn-primary" id="edit-vlist-save">保存</button>
      </div>
    `;

    modal.classList.add('active');

    document.getElementById('edit-vlist-cancel').onclick = async () => {
      await render();
    };

    document.getElementById('edit-vlist-save').onclick = async () => {
      const title = document.getElementById('edit-vlist-title').value.trim();
      if (!title) { alert('请输入视频名'); return; }

      const newListType = document.getElementById('edit-vlist-type').value;
      const platform = document.getElementById('edit-vlist-platform').value;
      const note = document.getElementById('edit-vlist-note').value.trim();

      // 如果 listType 改变了，重新计算 sortOrder
      const patch = { title, platform, note };
      if (newListType !== item.listType) {
        patch.listType = newListType;
        // 放到新类型的末尾
        const items = await DB.getVideoListItemsByType(newListType);
        const maxSort = items.length > 0 ? Math.max(...items.map(i => i.sortOrder || 0)) : 0;
        patch.sortOrder = Math.ceil((maxSort + 10) / 10) * 10;
      }

      await DB.updateVideoListItem(item.id, patch);
      await render();
    };

    modal.onclick = (e) => {
      if (e.target === modal) {
        render();
      }
    };
  }

  // ─── 公开 API ───
  return {
    render
  };

})();
