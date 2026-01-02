// options/index.js - 设置页面逻辑（专业版）

let currentSettings = {};
let pendingAction = null;
let groups = [];
let rules = [];
let editingGroupId = null;
let editingRuleId = null;
let groupSelectedColor = '#4285F4';
let batchMode = false;
let selectedProfiles = new Set();
let currentLanguage = 'zh-CN';

// 多语言支持
const i18n = {
  'zh-CN': {
    settings: '偏好设置',
    settings_desc: '自定义扩展的外观和行为',
    appearance: '外观',
    theme: '主题模式',
    theme_desc: '选择界面的颜色主题',
    light: '浅色',
    dark: '深色',
    language: '语言',
    language_desc: '选择界面显示语言',
    shortcuts: '快捷键',
    open_popup: '打开扩展弹窗',
    quick_switch: '快速切换账号 1~9',
    press_1_9: '弹窗中按 1~9',
    shortcut_hint: '可在浏览器的扩展快捷键设置中自定义',
    saved: '设置已保存',
    deleted: '已删除',
    export_success: '数据已导出',
    import_success: '数据已导入',
    clear_success: '所有数据已清除',
    confirm_delete: '删除确认',
    confirm_clear: '清除所有数据',
    confirm_clear_msg: '确定要删除所有保存的账号配置吗？此操作无法撤销。',
    cancel: '取消',
    confirm: '确定',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    add: '添加',
    batch_delete: '批量删除',
    selected: '已选',
    items: '个',
  },
  'zh-TW': {
    settings: '偏好設定',
    settings_desc: '自訂擴充功能的外觀和行為',
    appearance: '外觀',
    theme: '主題模式',
    theme_desc: '選擇介面的顏色主題',
    light: '淺色',
    dark: '深色',
    language: '語言',
    language_desc: '選擇介面顯示語言',
    shortcuts: '快捷鍵',
    open_popup: '開啟擴充功能彈窗',
    quick_switch: '快速切換帳號 1~9',
    press_1_9: '彈窗中按 1~9',
    shortcut_hint: '可在瀏覽器的擴充功能快捷鍵設定中自訂',
    saved: '設定已儲存',
    deleted: '已刪除',
    export_success: '資料已匯出',
    import_success: '資料已匯入',
    clear_success: '所有資料已清除',
    confirm_delete: '刪除確認',
    confirm_clear: '清除所有資料',
    confirm_clear_msg: '確定要刪除所有儲存的帳號配置嗎？此操作無法撤銷。',
    cancel: '取消',
    confirm: '確定',
    save: '儲存',
    delete: '刪除',
    edit: '編輯',
    add: '新增',
    batch_delete: '批量刪除',
    selected: '已選',
    items: '個',
  },
  'en': {
    settings: 'Settings',
    settings_desc: 'Customize the appearance and behavior',
    appearance: 'Appearance',
    theme: 'Theme',
    theme_desc: 'Choose the color theme',
    light: 'Light',
    dark: 'Dark',
    language: 'Language',
    language_desc: 'Choose display language',
    shortcuts: 'Shortcuts',
    open_popup: 'Open extension popup',
    quick_switch: 'Quick switch 1~9',
    press_1_9: 'Press 1~9 in popup',
    shortcut_hint: 'Can be customized in browser extension settings',
    saved: 'Settings saved',
    deleted: 'Deleted',
    export_success: 'Data exported',
    import_success: 'Data imported',
    clear_success: 'All data cleared',
    confirm_delete: 'Confirm Delete',
    confirm_clear: 'Clear All Data',
    confirm_clear_msg: 'Are you sure you want to delete all saved profiles? This cannot be undone.',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    batch_delete: 'Batch Delete',
    selected: 'Selected',
    items: '',
  },
  'ja': {
    settings: '設定',
    settings_desc: '外観と動作をカスタマイズ',
    appearance: '外観',
    theme: 'テーマ',
    theme_desc: 'カラーテーマを選択',
    light: 'ライト',
    dark: 'ダーク',
    language: '言語',
    language_desc: '表示言語を選択',
    shortcuts: 'ショートカット',
    open_popup: 'ポップアップを開く',
    quick_switch: 'クイック切替 1~9',
    press_1_9: 'ポップアップで 1~9 を押す',
    shortcut_hint: 'ブラウザの拡張機能設定でカスタマイズ可能',
    saved: '設定を保存しました',
    deleted: '削除しました',
    export_success: 'データをエクスポートしました',
    import_success: 'データをインポートしました',
    clear_success: 'すべてのデータを削除しました',
    confirm_delete: '削除の確認',
    confirm_clear: 'すべてのデータを削除',
    confirm_clear_msg: 'すべてのプロファイルを削除しますか？この操作は元に戻せません。',
    cancel: 'キャンセル',
    confirm: '確認',
    save: '保存',
    delete: '削除',
    edit: '編集',
    add: '追加',
    batch_delete: '一括削除',
    selected: '選択中',
    items: '件',
  },
  'ko': {
    settings: '설정',
    settings_desc: '외관과 동작을 사용자 정의',
    appearance: '외관',
    theme: '테마',
    theme_desc: '색상 테마 선택',
    light: '라이트',
    dark: '다크',
    language: '언어',
    language_desc: '표시 언어 선택',
    shortcuts: '단축키',
    open_popup: '팝업 열기',
    quick_switch: '빠른 전환 1~9',
    press_1_9: '팝업에서 1~9 누르기',
    shortcut_hint: '브라우저 확장 프로그램 설정에서 사용자 정의 가능',
    saved: '설정이 저장되었습니다',
    deleted: '삭제되었습니다',
    export_success: '데이터를 내보냈습니다',
    import_success: '데이터를 가져왔습니다',
    clear_success: '모든 데이터가 삭제되었습니다',
    confirm_delete: '삭제 확인',
    confirm_clear: '모든 데이터 삭제',
    confirm_clear_msg: '저장된 모든 프로필을 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.',
    cancel: '취소',
    confirm: '확인',
    save: '저장',
    delete: '삭제',
    edit: '편집',
    add: '추가',
    batch_delete: '일괄 삭제',
    selected: '선택됨',
    items: '개',
  }
};

// User-Agent 预设
const uaPresets = {
  'chrome-win': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'chrome-mac': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'firefox-win': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'safari-mac': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'edge-win': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'mobile-android': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'mobile-ios': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadAllProfiles();
  await loadGroups();
  await loadRules();
  await updateStats();
  await loadTabs();
  setupEventListeners();
  setupNavigation();
  applyTheme(currentSettings.theme || 'light');
  applyLanguage(currentSettings.language || 'zh-CN');
});

// ==================== 导航 ====================
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.section');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionId = item.dataset.section;
      
      // 更新导航状态
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // 显示对应区块
      sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === sectionId) {
          section.classList.add('active');
        }
      });
    });
  });
}

// ==================== 多语言 ====================
function applyLanguage(lang) {
  currentLanguage = lang;
  const texts = i18n[lang] || i18n['zh-CN'];
  
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (texts[key]) {
      el.textContent = texts[key];
    }
  });
  
  // 更新语言选择器
  const langSelect = document.getElementById('language-select');
  if (langSelect) {
    langSelect.value = lang;
  }
}

function t(key) {
  const texts = i18n[currentLanguage] || i18n['zh-CN'];
  return texts[key] || key;
}

// ==================== 加载设置 ====================
async function loadSettings() {
  try {
    const data = await chrome.storage.local.get(['settings', 'fingerprintWhitelist']);
    currentSettings = data.settings || { theme: 'light', language: 'zh-CN' };
    
    // 更新主题按钮状态
    const themeSwitcher = document.getElementById('theme-switcher');
    if (themeSwitcher) {
      themeSwitcher.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === currentSettings.theme);
      });
    }
    
    // 更新语言选择器
    const langSelect = document.getElementById('language-select');
    if (langSelect) {
      langSelect.value = currentSettings.language || 'zh-CN';
    }
    
    // 更新高级设置
    const proxyEnabled = document.getElementById('proxy-enabled');
    const uaEnabled = document.getElementById('ua-enabled');
    const autoRefresh = document.getElementById('auto-refresh');
    const closeRelatedTabs = document.getElementById('close-related-tabs');
    const autoRefreshExpiring = document.getElementById('auto-refresh-expiring');
    const clearStorageOnSwitch = document.getElementById('clear-storage-on-switch');
    
    if (proxyEnabled) proxyEnabled.checked = currentSettings.proxyEnabled || false;
    if (uaEnabled) uaEnabled.checked = currentSettings.uaEnabled || false;
    if (autoRefresh) autoRefresh.checked = currentSettings.autoRefresh !== false;
    if (closeRelatedTabs) closeRelatedTabs.checked = currentSettings.closeRelatedTabs || false;
    if (autoRefreshExpiring) autoRefreshExpiring.checked = currentSettings.autoRefreshExpiring || false;
    if (clearStorageOnSwitch) clearStorageOnSwitch.checked = currentSettings.clearStorageOnSwitch !== false; // 默认开启
    
    // 加载指纹保护设置
    const fpEnabled = document.getElementById('fingerprint-enabled');
    if (fpEnabled) fpEnabled.checked = currentSettings.fingerprintEnabled !== false;
    
    // 加载各指纹项设置
    // 强指纹默认开启，弱指纹默认关闭
    const strongFpItems = ['canvas', 'webgl', 'audio', 'font'];
    const weakFpItems = ['domrect', 'webgpu', 'timezone', 'webrtc'];
    
    strongFpItems.forEach(item => {
      const checkbox = document.getElementById(`fp-${item}`);
      if (checkbox) {
        checkbox.checked = currentSettings[`fp_${item}`] !== false; // 默认开启
      }
    });
    
    weakFpItems.forEach(item => {
      const checkbox = document.getElementById(`fp-${item}`);
      if (checkbox) {
        checkbox.checked = currentSettings[`fp_${item}`] === true; // 默认关闭
      }
    });
    
    // 显示/隐藏指纹选项
    toggleFingerprintOptions();
    
    // 加载白名单
    const whitelist = data.fingerprintWhitelist || [];
    renderWhitelist(whitelist);
    
    // 加载代理配置
    if (currentSettings.proxyConfig) {
      const pc = currentSettings.proxyConfig;
      const proxyScheme = document.getElementById('proxy-scheme');
      const proxyHost = document.getElementById('proxy-host');
      const proxyPort = document.getElementById('proxy-port');
      const proxyBypass = document.getElementById('proxy-bypass');
      
      if (proxyScheme) proxyScheme.value = pc.scheme || 'http';
      if (proxyHost) proxyHost.value = pc.host || '';
      if (proxyPort) proxyPort.value = pc.port || '';
      if (proxyBypass) proxyBypass.value = (pc.bypassList || []).join('\n');
    }
    
    // 加载自定义 UA
    if (currentSettings.customUA) {
      const customUA = document.getElementById('custom-ua');
      if (customUA) customUA.value = currentSettings.customUA;
    }
    
    // 显示/隐藏代理和UA设置
    toggleProxySettings();
    toggleUASettings();
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

function toggleFingerprintOptions() {
  const enabled = document.getElementById('fingerprint-enabled')?.checked;
  const options = document.getElementById('fingerprint-options');
  if (options) {
    options.style.opacity = enabled ? '1' : '0.5';
    options.style.pointerEvents = enabled ? 'auto' : 'none';
  }
}

function renderWhitelist(whitelist) {
  const listContainer = document.getElementById('whitelist-list');
  const emptyState = document.getElementById('empty-whitelist');
  
  if (!listContainer) return;
  
  if (whitelist.length === 0) {
    listContainer.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }
  
  listContainer.style.display = 'flex';
  if (emptyState) emptyState.style.display = 'none';
  
  listContainer.innerHTML = whitelist.map(domain => `
    <div class="whitelist-item" data-domain="${domain}">
      <span class="domain">${domain}</span>
      <button class="btn-remove" data-domain="${domain}">移除</button>
    </div>
  `).join('');
  
  // 绑定移除事件
  listContainer.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      await removeFromWhitelist(domain);
    });
  });
}

async function addToWhitelist(domain) {
  if (!domain) return;
  
  // 清理域名
  domain = domain.trim().toLowerCase();
  if (!domain) return;
  
  try {
    const data = await chrome.storage.local.get(['fingerprintWhitelist']);
    const whitelist = data.fingerprintWhitelist || [];
    
    if (!whitelist.includes(domain)) {
      whitelist.push(domain);
      await chrome.storage.local.set({ fingerprintWhitelist: whitelist });
      renderWhitelist(whitelist);
      showToast('已添加到白名单');
    } else {
      showToast('该域名已在白名单中');
    }
  } catch (error) {
    console.error('添加白名单失败:', error);
    showToast('添加失败');
  }
}

async function removeFromWhitelist(domain) {
  try {
    const data = await chrome.storage.local.get(['fingerprintWhitelist']);
    let whitelist = data.fingerprintWhitelist || [];
    
    whitelist = whitelist.filter(d => d !== domain);
    await chrome.storage.local.set({ fingerprintWhitelist: whitelist });
    renderWhitelist(whitelist);
    showToast('已从白名单移除');
  } catch (error) {
    console.error('移除白名单失败:', error);
  }
}

function toggleProxySettings() {
  const enabled = document.getElementById('proxy-enabled')?.checked;
  const settings = document.getElementById('proxy-settings');
  if (settings) {
    settings.style.display = enabled ? 'block' : 'none';
  }
}

function toggleUASettings() {
  const enabled = document.getElementById('ua-enabled')?.checked;
  const settings = document.getElementById('ua-settings');
  if (settings) {
    settings.style.display = enabled ? 'block' : 'none';
  }
}

// ==================== 加载所有配置 ====================
async function loadAllProfiles() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getAllProfileStats' });
    
    if (response.success) {
      renderProfiles(response.stats);
    }
  } catch (error) {
    console.error('加载配置失败:', error);
  }
}

function renderProfiles(stats) {
  const container = document.getElementById('all-profiles');
  const emptyState = document.getElementById('empty-profiles');
  
  if (!stats || stats.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }
  
  emptyState.style.display = 'none';
  
  // 存储数据用于事件处理
  window._profilesData = stats;
  
  container.innerHTML = stats.map(({ domain, profiles }, domainIndex) => `
    <div class="domain-card">
      <div class="domain-header">
        <span class="domain-name">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
          </svg>
          ${escapeHtml(domain)}
        </span>
        <span class="profile-count">${profiles.length} 个账号</span>
      </div>
      <div class="profile-tags">
        ${profiles.map((name, profileIndex) => `
          <div class="profile-tag ${batchMode ? 'selectable' : ''} ${selectedProfiles.has(`${domain}|${name}`) ? 'selected' : ''}" 
               data-domain="${escapeHtml(domain)}" data-name="${escapeHtml(name)}">
            ${batchMode ? `<input type="checkbox" class="profile-checkbox" ${selectedProfiles.has(`${domain}|${name}`) ? 'checked' : ''}>` : ''}
            <span class="profile-tag-color" style="background: #4285F4"></span>
            <span>${escapeHtml(name)}</span>
            ${!batchMode ? `<button class="profile-tag-delete" data-domain-index="${domainIndex}" data-profile-index="${profileIndex}" title="删除">×</button>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
  
  // 绑定事件
  if (batchMode) {
    container.querySelectorAll('.profile-tag').forEach(tag => {
      tag.onclick = (e) => {
        if (e.target.classList.contains('profile-checkbox')) return;
        const domain = tag.dataset.domain;
        const name = tag.dataset.name;
        const key = `${domain}|${name}`;
        const checkbox = tag.querySelector('.profile-checkbox');
        
        if (selectedProfiles.has(key)) {
          selectedProfiles.delete(key);
          tag.classList.remove('selected');
          if (checkbox) checkbox.checked = false;
        } else {
          selectedProfiles.add(key);
          tag.classList.add('selected');
          if (checkbox) checkbox.checked = true;
        }
        updateSelectedCount();
      };
      
      const checkbox = tag.querySelector('.profile-checkbox');
      if (checkbox) {
        checkbox.onchange = () => {
          const domain = tag.dataset.domain;
          const name = tag.dataset.name;
          const key = `${domain}|${name}`;
          
          if (checkbox.checked) {
            selectedProfiles.add(key);
            tag.classList.add('selected');
          } else {
            selectedProfiles.delete(key);
            tag.classList.remove('selected');
          }
          updateSelectedCount();
        };
      }
    });
  } else {
    container.querySelectorAll('.profile-tag-delete').forEach(btn => {
      btn.onclick = () => {
        const domainIndex = parseInt(btn.dataset.domainIndex);
        const profileIndex = parseInt(btn.dataset.profileIndex);
        const domain = window._profilesData[domainIndex].domain;
        const name = window._profilesData[domainIndex].profiles[profileIndex];
        confirmDelete(domain, name);
      };
    });
  }
}

function updateSelectedCount() {
  const countEl = document.getElementById('selected-count');
  if (countEl) {
    countEl.textContent = `${t('selected')} ${selectedProfiles.size} ${t('items')}`;
  }
}

function enterBatchMode() {
  batchMode = true;
  selectedProfiles.clear();
  document.getElementById('btn-batch-mode').style.display = 'none';
  document.getElementById('batch-actions').style.display = 'flex';
  loadAllProfiles();
}

function exitBatchMode() {
  batchMode = false;
  selectedProfiles.clear();
  document.getElementById('btn-batch-mode').style.display = 'inline-flex';
  document.getElementById('batch-actions').style.display = 'none';
  loadAllProfiles();
}

async function batchDelete() {
  if (selectedProfiles.size === 0) {
    showToast('请先选择要删除的账号', 'error');
    return;
  }
  
  showConfirm(t('batch_delete'), `确定要删除选中的 ${selectedProfiles.size} 个账号吗？`, async () => {
    try {
      for (const key of selectedProfiles) {
        const [domain, name] = key.split('|');
        await chrome.runtime.sendMessage({
          action: 'deleteProfile',
          domain,
          profileName: name
        });
      }
      
      showToast(`已删除 ${selectedProfiles.size} 个账号`, 'success');
      exitBatchMode();
      await updateStats();
    } catch (error) {
      showToast('删除失败', 'error');
    }
  });
}

// ==================== 更新统计 ====================
async function updateStats() {
  try {
    const data = await chrome.storage.local.get(['profiles']);
    const profiles = data.profiles || {};
    
    const domains = Object.keys(profiles);
    let totalProfiles = 0;
    
    domains.forEach(domain => {
      totalProfiles += Object.keys(profiles[domain]).length;
    });
    
    const size = new Blob([JSON.stringify(data)]).size;
    const sizeKB = (size / 1024).toFixed(1);
    
    document.getElementById('stat-domains').textContent = domains.length;
    document.getElementById('stat-profiles').textContent = totalProfiles;
    document.getElementById('stat-size').textContent = sizeKB + ' KB';
  } catch (error) {
    console.error('更新统计失败:', error);
  }
}

// ==================== 事件监听 ====================
function setupEventListeners() {
  // 主题切换
  document.getElementById('theme-switcher').addEventListener('click', (e) => {
    const btn = e.target.closest('.theme-option');
    if (btn) {
      const theme = btn.dataset.theme;
      document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyTheme(theme);
      saveSettings({ theme });
    }
  });
  
  // 语言切换
  document.getElementById('language-select')?.addEventListener('change', (e) => {
    const lang = e.target.value;
    applyLanguage(lang);
    saveSettings({ language: lang });
  });
  
  // 批量操作
  document.getElementById('btn-batch-mode')?.addEventListener('click', enterBatchMode);
  document.getElementById('btn-cancel-select')?.addEventListener('click', exitBatchMode);
  document.getElementById('btn-batch-delete')?.addEventListener('click', batchDelete);
  
  // 导出数据
  document.getElementById('btn-export').addEventListener('click', exportData);
  
  // 导入数据
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', importData);
  
  // 清除所有数据
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    showConfirm(t('confirm_clear'), t('confirm_clear_msg'), clearAllData);
  });
  
  // 确认模态框
  document.getElementById('confirm-cancel').addEventListener('click', hideModal);
  document.querySelector('#confirm-modal .modal-backdrop').addEventListener('click', hideModal);
  document.getElementById('confirm-ok').addEventListener('click', () => {
    if (pendingAction) {
      pendingAction();
      pendingAction = null;
    }
    hideModal();
  });
  
  // 分组模态框
  document.getElementById('btn-add-group').addEventListener('click', () => showGroupModal());
  document.getElementById('group-cancel').addEventListener('click', hideGroupModal);
  document.querySelector('#group-modal .modal-backdrop').addEventListener('click', hideGroupModal);
  document.getElementById('group-save').addEventListener('click', saveGroup);
  document.getElementById('group-color-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('.color-btn');
    if (btn) {
      document.querySelectorAll('#group-color-picker .color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      groupSelectedColor = btn.dataset.color;
    }
  });
  
  // 规则模态框
  document.getElementById('btn-add-rule').addEventListener('click', showRuleModal);
  document.getElementById('rule-cancel').addEventListener('click', hideRuleModal);
  document.querySelector('#rule-modal .modal-backdrop').addEventListener('click', hideRuleModal);
  document.getElementById('rule-save').addEventListener('click', saveRule);
  
  // 域名选择变化时更新账号列表
  document.getElementById('rule-domain-select').addEventListener('change', (e) => {
    const domain = e.target.value;
    const profileSelect = document.getElementById('rule-profile-select');
    
    if (!domain || !window._ruleProfilesData) {
      profileSelect.innerHTML = '<option value="">-- 先选择网站 --</option>';
      return;
    }
    
    const domainData = window._ruleProfilesData.find(d => d.domain === domain);
    if (domainData) {
      profileSelect.innerHTML = '<option value="">-- 选择账号 --</option>';
      domainData.profiles.forEach(name => {
        profileSelect.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
      });
    }
  });
  
  // 高级设置 - 代理
  document.getElementById('proxy-enabled')?.addEventListener('change', async (e) => {
    toggleProxySettings();
    
    if (!e.target.checked) {
      // 禁用代理
      try {
        await chrome.runtime.sendMessage({
          action: 'applyProxy',
          proxyConfig: null
        });
        showToast('代理已禁用', 'success');
      } catch (err) {}
    }
    
    saveSettings({ proxyEnabled: e.target.checked });
  });
  
  // 应用代理按钮
  document.getElementById('btn-apply-proxy')?.addEventListener('click', async () => {
    const scheme = document.getElementById('proxy-scheme')?.value || 'http';
    const host = document.getElementById('proxy-host')?.value.trim();
    const port = parseInt(document.getElementById('proxy-port')?.value) || 8080;
    const bypassText = document.getElementById('proxy-bypass')?.value || '';
    const bypassList = bypassText.split('\n').map(s => s.trim()).filter(s => s);
    
    if (!host) {
      showToast('请输入代理服务器地址', 'error');
      return;
    }
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'applyProxy',
        proxyConfig: { scheme, host, port, bypassList }
      });
      
      if (response.success) {
        showToast('代理设置已应用', 'success');
        saveSettings({ 
          proxyEnabled: true,
          proxyConfig: { scheme, host, port, bypassList }
        });
        document.getElementById('proxy-enabled').checked = true;
      } else {
        showToast('应用失败: ' + (response.error || '未知错误'), 'error');
      }
    } catch (err) {
      showToast('应用代理失败: ' + err.message, 'error');
    }
  });
  
  // 高级设置 - UA
  document.getElementById('ua-enabled')?.addEventListener('change', async (e) => {
    toggleUASettings();
    
    if (e.target.checked) {
      const customUA = document.getElementById('custom-ua')?.value.trim();
      if (customUA) {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'applyUserAgent',
            userAgent: customUA
          });
          if (response.success) {
            showToast('UA 伪装已启用', 'success');
          }
        } catch (err) {
          showToast('启用失败', 'error');
        }
      } else {
        showToast('请先选择或输入 User-Agent', 'warning');
      }
    } else {
      try {
        await chrome.runtime.sendMessage({
          action: 'applyUserAgent',
          userAgent: null
        });
        showToast('UA 伪装已禁用', 'success');
      } catch (err) {}
    }
    
    saveSettings({ uaEnabled: e.target.checked });
  });
  
  // UA 预设
  document.querySelectorAll('.ua-preset').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uaKey = btn.dataset.ua;
      const ua = uaPresets[uaKey];
      if (ua) {
        document.getElementById('custom-ua').value = ua;
        
        // 如果 UA 伪装已启用，立即应用
        if (document.getElementById('ua-enabled')?.checked) {
          try {
            const response = await chrome.runtime.sendMessage({
              action: 'applyUserAgent',
              userAgent: ua
            });
            if (response.success) {
              showToast('User-Agent 已应用', 'success');
            } else {
              showToast('应用失败: ' + response.error, 'error');
            }
          } catch (e) {
            showToast('应用失败', 'error');
          }
        } else {
          showToast('已选择 User-Agent，请启用 UA 伪装', 'info');
        }
        
        saveSettings({ customUA: ua });
      }
    });
  });
  
  // 自定义 UA 输入
  document.getElementById('custom-ua')?.addEventListener('blur', async (e) => {
    const ua = e.target.value.trim();
    if (ua && document.getElementById('ua-enabled')?.checked) {
      try {
        await chrome.runtime.sendMessage({
          action: 'applyUserAgent',
          userAgent: ua
        });
        saveSettings({ customUA: ua });
      } catch (e) {}
    }
  });
  
  // 标签页设置
  document.getElementById('auto-refresh')?.addEventListener('change', (e) => {
    saveSettings({ autoRefresh: e.target.checked });
  });
  
  document.getElementById('close-related-tabs')?.addEventListener('change', (e) => {
    saveSettings({ closeRelatedTabs: e.target.checked });
  });
  
  document.getElementById('clear-storage-on-switch')?.addEventListener('change', (e) => {
    saveSettings({ clearStorageOnSwitch: e.target.checked });
    if (e.target.checked) {
      showToast('切换账号时将清除本地存储，有效防止关联', 'success');
    }
  });
  
  // 自动刷新快过期账号
  document.getElementById('auto-refresh-expiring')?.addEventListener('change', (e) => {
    saveSettings({ autoRefreshExpiring: e.target.checked });
    if (e.target.checked) {
      showToast('已启用自动刷新快过期账号', 'success');
    }
  });
  
  document.getElementById('btn-refresh-tabs')?.addEventListener('click', loadTabs);
  
  // 指纹保护设置
  document.getElementById('fingerprint-enabled')?.addEventListener('change', (e) => {
    toggleFingerprintOptions();
    saveSettings({ fingerprintEnabled: e.target.checked });
    showToast(e.target.checked ? '指纹保护已启用' : '指纹保护已禁用', 'success');
  });
  
  // 各指纹项设置
  const fpItems = ['canvas', 'webgl', 'audio', 'font', 'domrect', 'webgpu', 'timezone', 'webrtc'];
  fpItems.forEach(item => {
    document.getElementById(`fp-${item}`)?.addEventListener('change', (e) => {
      saveSettings({ [`fp_${item}`]: e.target.checked });
    });
  });
  
  // 白名单添加按钮
  document.getElementById('btn-add-whitelist')?.addEventListener('click', () => {
    document.getElementById('whitelist-modal').style.display = 'flex';
    document.getElementById('whitelist-domain-input').value = '';
    document.getElementById('whitelist-domain-input').focus();
  });
  
  // 白名单模态框
  document.getElementById('whitelist-cancel')?.addEventListener('click', () => {
    document.getElementById('whitelist-modal').style.display = 'none';
  });
  document.querySelector('#whitelist-modal .modal-backdrop')?.addEventListener('click', () => {
    document.getElementById('whitelist-modal').style.display = 'none';
  });
  document.getElementById('whitelist-save')?.addEventListener('click', async () => {
    const domain = document.getElementById('whitelist-domain-input').value.trim();
    if (domain) {
      await addToWhitelist(domain);
      document.getElementById('whitelist-modal').style.display = 'none';
    } else {
      showToast('请输入域名', 'warning');
    }
  });
  
  // 白名单预设按钮
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      if (domain === 'bank') {
        // 添加常见银行网站
        const banks = ['icbc.com.cn', 'ccb.com', 'boc.cn', 'abchina.com', 'bankcomm.com', 'cmbchina.com'];
        for (const bank of banks) {
          await addToWhitelist(bank);
        }
      } else {
        await addToWhitelist(domain);
      }
    });
  });
}

// ==================== 主题 ====================
function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

async function saveSettings(newSettings) {
  try {
    currentSettings = { ...currentSettings, ...newSettings };
    await chrome.storage.local.set({ settings: currentSettings });
    showToast('设置已保存', 'success');
  } catch (error) {
    showToast('保存失败', 'error');
  }
}

// ==================== 删除配置 ====================
function confirmDelete(domain, name) {
  showConfirm('删除确认', `确定要删除「${name}」吗？`, async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'deleteProfile',
        domain,
        profileName: name
      });
      
      if (response.success) {
        showToast('已删除', 'success');
        await loadAllProfiles();
        await updateStats();
      } else {
        showToast('删除失败', 'error');
      }
    } catch (error) {
      showToast('删除失败', 'error');
    }
  });
}

// ==================== 清除所有数据 ====================
async function clearAllData() {
  try {
    await chrome.storage.local.set({ profiles: {} });
    await loadAllProfiles();
    await updateStats();
    showToast('所有数据已清除', 'success');
  } catch (error) {
    showToast('清除失败', 'error');
  }
}

// ==================== 导出数据 ====================
async function exportData() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'exportProfiles' });
    
    if (response.success) {
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `multi-account-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('数据已导出', 'success');
    }
  } catch (error) {
    showToast('导出失败', 'error');
  }
}

// ==================== 导入数据 ====================
async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (!data.version || !data.profiles) {
      showToast('无效的备份文件', 'error');
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      action: 'importProfiles',
      data: data
    });
    
    if (response.success) {
      await loadAllProfiles();
      await updateStats();
      showToast('数据已导入', 'success');
    } else {
      showToast('导入失败: ' + response.error, 'error');
    }
  } catch (error) {
    showToast('导入失败: 文件格式错误', 'error');
  }
  
  event.target.value = '';
}

// ==================== UI 辅助函数 ====================
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  
  toastMsg.textContent = message;
  toast.className = 'toast show ' + type;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

function showConfirm(title, message, callback) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  pendingAction = callback;
  document.getElementById('confirm-modal').style.display = 'flex';
}

function hideModal() {
  document.getElementById('confirm-modal').style.display = 'none';
  pendingAction = null;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== 分组管理 ====================
async function loadGroups() {
  try {
    const data = await chrome.storage.local.get(['groups']);
    groups = data.groups || [];
    renderGroups();
  } catch (error) {
    console.error('加载分组失败:', error);
  }
}

function renderGroups() {
  const container = document.getElementById('groups-list');
  const emptyState = document.getElementById('empty-groups');
  
  if (groups.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }
  
  emptyState.style.display = 'none';
  
  container.innerHTML = groups.map((group, index) => `
    <div class="group-item" data-index="${index}">
      <div class="group-color" style="background: ${group.color || '#4285F4'}"></div>
      <div class="group-info">
        <span class="group-name">${escapeHtml(group.name)}</span>
        <span class="group-count">${(group.profiles || []).length} 个账号</span>
      </div>
      <div class="group-actions">
        <button class="btn-icon-sm btn-edit-group" data-index="${index}" title="编辑">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-icon-sm btn-delete-group" data-index="${index}" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
  
  // 绑定事件
  container.querySelectorAll('.btn-edit-group').forEach(btn => {
    btn.onclick = () => {
      const index = parseInt(btn.dataset.index);
      showGroupModal(groups[index], index);
    };
  });
  
  container.querySelectorAll('.btn-delete-group').forEach(btn => {
    btn.onclick = () => {
      const index = parseInt(btn.dataset.index);
      showConfirm('删除分组', `确定要删除「${groups[index].name}」吗？`, () => deleteGroup(index));
    };
  });
}

function showGroupModal(group = null, index = null) {
  editingGroupId = index;
  groupSelectedColor = group?.color || '#4285F4';
  
  document.getElementById('group-modal-title').textContent = group ? '编辑分组' : '新建分组';
  document.getElementById('group-name-input').value = group?.name || '';
  
  document.querySelectorAll('#group-color-picker .color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === groupSelectedColor);
  });
  
  document.getElementById('group-modal').style.display = 'flex';
  document.getElementById('group-name-input').focus();
}

function hideGroupModal() {
  document.getElementById('group-modal').style.display = 'none';
  editingGroupId = null;
}

async function saveGroup() {
  const name = document.getElementById('group-name-input').value.trim();
  
  if (!name) {
    showToast('请输入分组名称', 'error');
    return;
  }
  
  if (editingGroupId !== null) {
    groups[editingGroupId].name = name;
    groups[editingGroupId].color = groupSelectedColor;
  } else {
    groups.push({
      id: Date.now(),
      name,
      color: groupSelectedColor,
      profiles: []
    });
  }
  
  await chrome.storage.local.set({ groups });
  hideGroupModal();
  renderGroups();
  showToast('分组已保存', 'success');
}

async function deleteGroup(index) {
  groups.splice(index, 1);
  await chrome.storage.local.set({ groups });
  renderGroups();
  showToast('分组已删除', 'success');
}

// ==================== 自动规则管理 ====================
async function loadRules() {
  try {
    const data = await chrome.storage.local.get(['autoRules']);
    rules = data.autoRules || [];
    renderRules();
  } catch (error) {
    console.error('加载规则失败:', error);
  }
}

function renderRules() {
  const container = document.getElementById('rules-list');
  const emptyState = document.getElementById('empty-rules');
  
  if (rules.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }
  
  emptyState.style.display = 'none';
  
  container.innerHTML = rules.map((rule, index) => `
    <div class="rule-item" data-index="${index}">
      <div class="rule-info">
        <span class="rule-pattern">${escapeHtml(rule.pattern)}</span>
        <span class="rule-arrow">→</span>
        <span class="rule-profile">${escapeHtml(rule.profileName)} (${escapeHtml(rule.domain)})</span>
      </div>
      <div class="rule-actions">
        <label class="toggle">
          <input type="checkbox" ${rule.enabled !== false ? 'checked' : ''} data-index="${index}" class="rule-toggle">
          <span class="toggle-slider"></span>
        </label>
        <button class="btn-icon-sm btn-delete-rule" data-index="${index}" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
  
  // 绑定事件
  container.querySelectorAll('.rule-toggle').forEach(toggle => {
    toggle.onchange = async () => {
      const index = parseInt(toggle.dataset.index);
      rules[index].enabled = toggle.checked;
      await chrome.storage.local.set({ autoRules: rules });
    };
  });
  
  container.querySelectorAll('.btn-delete-rule').forEach(btn => {
    btn.onclick = () => {
      const index = parseInt(btn.dataset.index);
      showConfirm('删除规则', '确定要删除这条规则吗？', () => deleteRule(index));
    };
  });
}

async function showRuleModal() {
  editingRuleId = null;
  document.getElementById('rule-modal-title').textContent = '添加规则';
  document.getElementById('rule-pattern-input').value = '';
  
  // 加载域名列表
  const response = await chrome.runtime.sendMessage({ action: 'getAllProfileStats' });
  const domainSelect = document.getElementById('rule-domain-select');
  const profileSelect = document.getElementById('rule-profile-select');
  
  domainSelect.innerHTML = '<option value="">-- 选择网站 --</option>';
  profileSelect.innerHTML = '<option value="">-- 先选择网站 --</option>';
  
  if (response.success && response.stats) {
    response.stats.forEach(({ domain }) => {
      domainSelect.innerHTML += `<option value="${escapeHtml(domain)}">${escapeHtml(domain)}</option>`;
    });
    
    // 存储数据供后续使用
    window._ruleProfilesData = response.stats;
  }
  
  document.getElementById('rule-modal').style.display = 'flex';
  document.getElementById('rule-pattern-input').focus();
}

function hideRuleModal() {
  document.getElementById('rule-modal').style.display = 'none';
  editingRuleId = null;
}

async function saveRule() {
  const pattern = document.getElementById('rule-pattern-input').value.trim();
  const domain = document.getElementById('rule-domain-select').value;
  const profileName = document.getElementById('rule-profile-select').value;
  
  if (!pattern) {
    showToast('请输入 URL 匹配模式', 'error');
    return;
  }
  
  if (!domain || !profileName) {
    showToast('请选择网站和账号', 'error');
    return;
  }
  
  rules.push({
    id: Date.now(),
    pattern,
    domain,
    profileName,
    enabled: true
  });
  
  await chrome.storage.local.set({ autoRules: rules });
  hideRuleModal();
  renderRules();
  showToast('规则已添加', 'success');
}

async function deleteRule(index) {
  rules.splice(index, 1);
  await chrome.storage.local.set({ autoRules: rules });
  renderRules();
  showToast('规则已删除', 'success');
}


// ==================== 标签页管理 ====================
async function loadTabs() {
  const container = document.getElementById('tabs-list');
  if (!container) return;
  
  try {
    const tabs = await chrome.tabs.query({});
    
    // 按域名分组
    const tabsByDomain = {};
    tabs.forEach(tab => {
      try {
        if (!tab.url || tab.url.startsWith('chrome')) return;
        const url = new URL(tab.url);
        const domain = url.hostname;
        if (!tabsByDomain[domain]) {
          tabsByDomain[domain] = [];
        }
        tabsByDomain[domain].push(tab);
      } catch (e) {}
    });
    
    const domains = Object.keys(tabsByDomain).sort();
    
    if (domains.length === 0) {
      container.innerHTML = '<p class="empty-text">没有打开的标签页</p>';
      return;
    }
    
    container.innerHTML = domains.map(domain => `
      <div class="tab-domain-group">
        <div class="tab-domain-header">
          <span class="tab-domain-name">${escapeHtml(domain)}</span>
          <span class="tab-count">${tabsByDomain[domain].length} 个标签</span>
        </div>
        <div class="tab-items">
          ${tabsByDomain[domain].slice(0, 5).map(tab => `
            <div class="tab-item" data-tab-id="${tab.id}">
              <img class="tab-favicon" src="${tab.favIconUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22 fill=%22%23ddd%22/></svg>'}" onerror="this.style.display='none'">
              <span class="tab-title" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title?.substring(0, 40) || '无标题')}</span>
            </div>
          `).join('')}
          ${tabsByDomain[domain].length > 5 ? `<div class="tab-more">还有 ${tabsByDomain[domain].length - 5} 个标签...</div>` : ''}
        </div>
      </div>
    `).join('');
    
  } catch (error) {
    container.innerHTML = '<p class="error-text">加载标签页失败</p>';
  }
}
