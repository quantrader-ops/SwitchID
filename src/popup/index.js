// popup/index.js - 多账号管理助手弹窗（专业版）

let currentDomain = '';
let mainDomain = '';
let profiles = [];
let groups = [];
let recentUsage = [];
let selectedColor = '#4285F4';
let pendingAction = null;
let editingProfile = null;
let editSelectedColor = '#4285F4';
let editSelectedGroup = null;
let searchQuery = '';
let sortBy = 'recent'; // recent, name, created, useCount
let activeProfile = null; // 当前激活的账号

// 多语言支持
function t(key) {
  return chrome.i18n.getMessage(key) || key;
}

// 应用多语言
function applyI18n() {
  // 处理 data-i18n 属性
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const msg = t(key);
    if (msg && msg !== key) {
      el.textContent = msg;
    }
  });
  
  // 处理 data-i18n-placeholder 属性
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    const msg = t(key);
    if (msg && msg !== key) {
      el.placeholder = msg;
    }
  });
  
  // 处理 data-i18n-title 属性
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    const msg = t(key);
    if (msg && msg !== key) {
      el.title = msg;
    }
  });
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
  applyI18n(); // 应用多语言
  await init();
});

async function init() {
  // 获取当前标签页
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab || !tab.url) {
    showUnsupported();
    return;
  }
  
  try {
    const url = new URL(tab.url);
    
    // 检查是否是特殊页面
    if (isSpecialPage(url.protocol)) {
      showUnsupported();
      return;
    }
    
    currentDomain = url.hostname;
    document.getElementById('current-domain').textContent = currentDomain;
    
    // 设置网站 favicon
    setSiteFavicon(tab, url.origin);
    
  } catch (e) {
    showUnsupported();
    return;
  }
  
  await loadTheme();
  await loadProfiles();
  setupEventListeners();
}

function isSpecialPage(protocol) {
  const specialProtocols = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'moz-extension:', 'file:'];
  return specialProtocols.includes(protocol);
}

// 设置网站 favicon
function setSiteFavicon(tab, origin) {
  const faviconImg = document.getElementById('site-favicon');
  const fallbackIcon = document.getElementById('site-icon-fallback');
  
  if (!faviconImg) return;
  
  // 图片加载失败时的处理
  faviconImg.onerror = () => {
    // 尝试备用方案
    if (!faviconImg.dataset.triedFallback) {
      faviconImg.dataset.triedFallback = 'true';
      // 使用 DuckDuckGo 的 favicon 服务（更可靠）
      const domain = new URL(origin).hostname;
      faviconImg.src = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
    } else {
      // 所有方案都失败，显示默认图标
      faviconImg.style.display = 'none';
      fallbackIcon.style.display = 'inline';
    }
  };
  
  // 优先使用 tab.favIconUrl（浏览器已缓存的图标）
  if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://') && !tab.favIconUrl.startsWith('edge://')) {
    faviconImg.src = tab.favIconUrl;
    faviconImg.style.display = 'inline';
    fallbackIcon.style.display = 'none';
  } else {
    // 备用方案：使用 DuckDuckGo 的 favicon 服务
    const domain = new URL(origin).hostname;
    faviconImg.src = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
    faviconImg.style.display = 'inline';
    fallbackIcon.style.display = 'none';
  }
}

async function loadTheme() {
  const data = await chrome.storage.local.get(['settings']);
  const theme = data.settings?.theme || 'light';
  applyTheme(theme);
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  // 更新主题切换按钮图标
  updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;
  
  if (theme === 'dark') {
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    `;
    btn.title = '切换到浅色模式';
  } else {
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
      </svg>
    `;
    btn.title = '切换到深色模式';
  }
}

async function toggleTheme() {
  const data = await chrome.storage.local.get(['settings']);
  const currentSettings = data.settings || {};
  const currentTheme = currentSettings.theme || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  
  // 保存设置
  currentSettings.theme = newTheme;
  await chrome.storage.local.set({ settings: currentSettings });
  
  // 应用主题
  applyTheme(newTheme);
}

// ==================== 加载配置 ====================
async function loadProfiles() {
  showLoading(true);
  
  try {
    // 并行加载 profiles、最近使用和当前激活账号
    const [profilesResponse, recentResponse, activeResponse] = await Promise.all([
      chrome.runtime.sendMessage({
        action: 'getProfiles',
        domain: currentDomain
      }),
      chrome.runtime.sendMessage({
        action: 'getRecentUsage'
      }),
      chrome.runtime.sendMessage({
        action: 'getActiveProfile',
        domain: currentDomain
      })
    ]);
    
    if (profilesResponse.success) {
      profiles = profilesResponse.profiles || [];
      groups = profilesResponse.groups || [];
      mainDomain = profilesResponse.mainDomain || currentDomain;
      
      // 更新显示的域名（显示主域名）
      document.getElementById('current-domain').textContent = mainDomain;
    }
    
    if (recentResponse.success) {
      // 只显示当前主域名的最近使用
      recentUsage = (recentResponse.recentUsage || []).filter(r => r.domain === mainDomain);
    }
    
    if (activeResponse.success) {
      activeProfile = activeResponse.activeProfile;
      updateActiveProfileBadge();
    }
    
    renderRecentUsage();
    renderProfiles();
    
    // 加载自动轮换状态
    await loadAutoRotateStatus();
  } catch (error) {
    console.error('加载配置失败:', error);
    showToast('加载失败', 'error');
  }
  
  showLoading(false);
}

// ==================== 渲染最近使用 ====================
function renderRecentUsage() {
  const section = document.getElementById('recent-section');
  const list = document.getElementById('recent-list');
  
  // 只显示最近使用的前3个（且不在搜索模式下）
  if (recentUsage.length === 0 || searchQuery) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  const recentToShow = recentUsage.slice(0, 3);
  
  list.innerHTML = recentToShow.map((item) => {
    const color = item.color || '#4285F4';
    const initial = item.profileName.charAt(0).toUpperCase();
    
    return `
      <div class="recent-item" data-domain="${escapeHtml(item.domain)}" data-name="${escapeHtml(item.profileName)}">
        <div class="recent-avatar" style="background: ${color}">${escapeHtml(initial)}</div>
        <span class="recent-name">${escapeHtml(item.profileName)}</span>
      </div>
    `;
  }).join('');
  
  // 绑定点击事件
  list.querySelectorAll('.recent-item').forEach(item => {
    item.onclick = () => {
      const name = item.dataset.name;
      switchProfile(name, null);
    };
  });
}

// ==================== 渲染配置列表 ====================
function renderProfiles() {
  const list = document.getElementById('profile-list');
  const emptyState = document.getElementById('empty-state');
  const profilesSection = document.getElementById('profiles-section');
  const countEl = document.getElementById('profile-count');
  const searchBox = document.querySelector('.search-box');
  
  // 过滤后的列表
  const filteredProfiles = filterProfiles();
  
  if (profiles.length === 0) {
    profilesSection.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }
  
  emptyState.style.display = 'none';
  profilesSection.style.display = 'block';
  countEl.textContent = `${profiles.length} 个`;
  
  // 只有多于3个账号时显示搜索框
  searchBox.style.display = profiles.length > 3 ? 'flex' : 'none';
  
  if (filteredProfiles.length === 0) {
    list.innerHTML = `
      <div class="no-results">
        <span>🔍</span>
        <p>没有找到匹配的账号</p>
      </div>
    `;
    return;
  }
  
  // 按分组组织账号
  const groupedProfiles = organizeByGroup(filteredProfiles);
  
  let html = '';
  
  // 先渲染有分组的
  for (const group of groups) {
    const groupProfiles = groupedProfiles[group.id] || [];
    if (groupProfiles.length === 0) continue;
    
    html += `
      <div class="group-section">
        <div class="group-header">
          <span class="group-color-dot" style="background: ${group.color}"></span>
          <span class="group-name">${escapeHtml(group.name)}</span>
          <span class="group-count">${groupProfiles.length}</span>
        </div>
        ${renderProfileItems(groupProfiles)}
      </div>
    `;
  }
  
  // 再渲染无分组的
  const ungrouped = groupedProfiles['ungrouped'] || [];
  if (ungrouped.length > 0) {
    if (html) {
      html += `
        <div class="group-section">
          <div class="group-header">
            <span class="group-name" style="color: var(--text-tertiary)">未分组</span>
            <span class="group-count">${ungrouped.length}</span>
          </div>
          ${renderProfileItems(ungrouped)}
        </div>
      `;
    } else {
      // 如果没有任何分组，直接渲染列表
      html = renderProfileItems(ungrouped);
    }
  }
  
  list.innerHTML = html;
  
  // 绑定事件
  bindProfileEvents(list);
}

function organizeByGroup(profileList) {
  const result = { ungrouped: [] };
  
  for (const profile of profileList) {
    if (profile.groupId) {
      if (!result[profile.groupId]) {
        result[profile.groupId] = [];
      }
      result[profile.groupId].push(profile);
    } else {
      result.ungrouped.push(profile);
    }
  }
  
  return result;
}

function renderProfileItems(profileList) {
  return profileList.map((profile, idx) => {
    const index = profiles.findIndex(p => p.name === profile.name);
    const color = profile.color || getDefaultColor(index);
    const initial = profile.name.charAt(0).toUpperCase();
    const timeStr = formatTime(profile.lastUsedAt || profile.savedAt);
    const useCountStr = profile.useCount > 0 ? `使用 ${profile.useCount} 次` : '';
    const noteStr = profile.note ? `📝 ${profile.note}` : '';
    
    // 用户信息（邮箱/用户名）
    const userInfoStr = profile.userInfo?.displayName || '';
    
    // 健康状态
    const health = profile.healthStatus || { status: 'ok' };
    const healthIcon = health.status === 'error' ? '🔴' : health.status === 'warning' ? '🟡' : '';
    const healthTitle = health.message || '';
    
    // 独立配置标识
    const hasCustomUA = profile.customUA ? '🎭' : '';
    const hasProxy = profile.proxyConfig ? '🌐' : '';
    const hasFingerprint = profile.fingerprint ? '🔐' : '🔓'; // 有指纹显示锁，没有显示开锁（将自动生成）
    const configBadges = `<span class="config-badges" title="独立配置: ${hasCustomUA ? 'UA ' : ''}${hasProxy ? '代理 ' : ''}${profile.fingerprint ? '指纹已配置' : '指纹将自动生成'}">${hasCustomUA}${hasProxy}${hasFingerprint}</span>`;
    
    // 当前激活标识
    const isActive = activeProfile === profile.name;
    const activeClass = isActive ? 'profile-active' : '';
    
    return `
      <div class="profile-item ${activeClass} ${health.status !== 'ok' ? 'health-' + health.status : ''}" data-index="${index}" style="animation-delay: ${idx * 0.05}s">
        ${isActive ? '<span class="active-badge-corner">当前</span>' : ''}
        <div class="profile-avatar" style="background: ${color}">${escapeHtml(initial)}</div>
        <div class="profile-info">
          <div class="profile-name">
            ${escapeHtml(profile.name)}
            ${healthIcon ? `<span class="health-icon" title="${escapeHtml(healthTitle)}">${healthIcon}</span>` : ''}
            ${configBadges}
          </div>
          ${userInfoStr ? `<div class="profile-user-info" title="${escapeHtml(userInfoStr)}">👤 ${escapeHtml(userInfoStr)}</div>` : ''}
          ${noteStr ? `<div class="profile-note">${escapeHtml(noteStr)}</div>` : ''}
          <div class="profile-meta">
            <span class="profile-meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              ${timeStr}
            </span>
            ${useCountStr ? `<span class="profile-meta-item use-count">${useCountStr}</span>` : ''}
          </div>
        </div>
        <div class="profile-actions">
          <button class="btn-switch" data-index="${index}">切换</button>
          <button class="btn-more" data-index="${index}" title="更多操作">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="1"/>
              <circle cx="12" cy="5" r="1"/>
              <circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
          <button class="btn-edit" data-index="${index}" title="编辑">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-delete" data-index="${index}" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function bindProfileEvents(list) {
  list.querySelectorAll('.btn-switch').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      switchProfile(profiles[index].name, btn);
    };
  });
  
  list.querySelectorAll('.btn-edit').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      showEditModal(profiles[index]);
    };
  });
  
  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      confirmDelete(profiles[index].name);
    };
  });
  
  // 更多操作按钮
  list.querySelectorAll('.btn-more').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      showMoreActions(profiles[index], btn);
    };
  });
  
  list.querySelectorAll('.profile-item').forEach(item => {
    item.onclick = () => {
      const index = parseInt(item.dataset.index);
      const switchBtn = item.querySelector('.btn-switch');
      switchProfile(profiles[index].name, switchBtn);
    };
  });
}

// 显示更多操作菜单
function showMoreActions(profile, btn) {
  // 移除已有的菜单
  const existingMenu = document.querySelector('.more-actions-menu');
  if (existingMenu) {
    existingMenu.remove();
  }
  
  const menu = document.createElement('div');
  menu.className = 'more-actions-menu';
  menu.innerHTML = `
    <button class="menu-item" data-action="refresh">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 4v6h-6M1 20v-6h6"/>
        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
      </svg>
      刷新账号
    </button>
    <button class="menu-item" data-action="duplicate">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
      </svg>
      复制账号
    </button>
    <button class="menu-item" data-action="clearSwitch">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
        <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
      </svg>
      清除并切换
    </button>
  `;
  
  // 定位菜单
  const rect = btn.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  
  document.body.appendChild(menu);
  
  // 绑定菜单事件
  menu.querySelectorAll('.menu-item').forEach(item => {
    item.onclick = async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      menu.remove();
      
      switch (action) {
        case 'refresh':
          await refreshProfile(profile.name);
          break;
        case 'duplicate':
          await duplicateProfile(profile.name);
          break;
        case 'clearSwitch':
          await clearAndSwitch(profile.name);
          break;
      }
    };
  });
  
  // 点击其他地方关闭菜单
  setTimeout(() => {
    document.addEventListener('click', function closeMenu() {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }, { once: true });
  }, 0);
}

// 刷新账号（重新保存当前 Cookie）
async function refreshProfile(name) {
  // 先确认用户知道这个操作的含义
  showConfirm(
    '刷新账号',
    `确定要刷新「${name}」吗？\n\n⚠️ 这会用当前浏览器的登录状态覆盖保存的数据。\n请确保你现在登录的就是「${name}」这个账号！`,
    '🔄',
    async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'refreshProfile',
          domain: currentDomain,
          profileName: name
        });
        
        if (response.success) {
          showToast(`已刷新「${name}」(${response.cookieCount} cookies)`, 'success');
          await loadProfiles();
        } else {
          showToast(response.error, 'error');
        }
      } catch (error) {
        showToast('刷新失败', 'error');
      }
    }
  );
}

// 复制账号
async function duplicateProfile(name) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'duplicateProfile',
      domain: currentDomain,
      profileName: name
    });
    
    if (response.success) {
      showToast(`已复制为「${response.newName}」`, 'success');
      await loadProfiles();
    } else {
      showToast('复制失败: ' + response.error, 'error');
    }
  } catch (error) {
    showToast('复制失败', 'error');
  }
}

// 清除并切换
async function clearAndSwitch(name) {
  try {
    // 先清除
    await chrome.runtime.sendMessage({
      action: 'clearCookies',
      domain: currentDomain
    });
    
    // 再切换
    const response = await chrome.runtime.sendMessage({
      action: 'loadProfile',
      domain: currentDomain,
      profileName: name
    });
    
    if (response.success) {
      showToast(`已清除并切换到「${name}」`, 'success');
      
      // 刷新所有相关子域名的标签页
      if (response.relatedTabIds && response.relatedTabIds.length > 0) {
        for (const tabId of response.relatedTabIds) {
          try {
            await chrome.tabs.reload(tabId);
          } catch (e) {}
        }
      } else {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          chrome.tabs.reload(tab.id);
        }
      }
      
      setTimeout(() => window.close(), 600);
    } else {
      showToast('切换失败: ' + response.error, 'error');
    }
  } catch (error) {
    showToast('操作失败', 'error');
  }
}

function getDefaultColor(index) {
  const colors = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#9333EA', '#EC4899', '#14B8A6', '#6B7280'];
  return colors[index % colors.length];
}

// ==================== 切换账号 ====================
async function switchProfile(name, btn) {
  console.log('[popup] ========== 开始切换账号 ==========');
  console.log('[popup] 步骤1: 账号名称:', name, '域名:', currentDomain, '主域名:', mainDomain);
  
  if (btn) {
    btn.disabled = true;
    btn.textContent = '切换中...';
  }
  
  let switchSuccess = false;
  
  try {
    console.log('[popup] 步骤2: 发送 loadProfile 请求...');
    const response = await chrome.runtime.sendMessage({
      action: 'loadProfile',
      domain: currentDomain,
      profileName: name
    });
    console.log('[popup] 步骤3: loadProfile 响应:', JSON.stringify({
      success: response.success,
      hasStorageData: response.hasStorageData,
      relatedTabIds: response.relatedTabIds,
      error: response.error
    }));
    
    if (response.success) {
      showToast(`已切换到「${name}」`, 'success');
      
      // 如果有存储数据需要恢复，先预设置再刷新
      // 这样可以确保页面刷新后 localStorage 已经有数据
      if (response.hasStorageData && response.relatedTabIds && response.relatedTabIds.length > 0) {
        console.log('[popup] 步骤4: 有存储数据，调用 preRestoreStorage...');
        console.log('[popup] tabIds:', response.relatedTabIds);
        
        try {
          // 添加超时控制，防止 preRestoreStorage 卡住
          const preRestorePromise = chrome.runtime.sendMessage({
            action: 'preRestoreStorage',
            tabIds: response.relatedTabIds,
            domain: mainDomain
          });
          
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('preRestoreStorage timeout')), 5000)
          );
          
          const preRestoreResult = await Promise.race([preRestorePromise, timeoutPromise]);
          console.log('[popup] 步骤5: preRestoreStorage 结果:', preRestoreResult);
          
          // 等待预设置完成
          console.log('[popup] 步骤6: 等待 200ms...');
          await new Promise(r => setTimeout(r, 200));
        } catch (preRestoreError) {
          console.warn('[popup] preRestoreStorage 失败或超时:', preRestoreError.message);
          showToast('⚠️ 数据预设置失败，但会继续切换', 'warning');
          // 继续执行，不中断切换流程
        }
      } else {
        console.log('[popup] 步骤4: 无存储数据或无相关标签页，跳过 preRestoreStorage');
      }
      
      // 刷新所有相关子域名的标签页
      console.log('[popup] 步骤7: 开始刷新标签页...');
      let refreshCount = 0;
      
      if (response.relatedTabIds && response.relatedTabIds.length > 0) {
        for (const tabId of response.relatedTabIds) {
          try {
            console.log('[popup] 刷新标签页:', tabId);
            await chrome.tabs.reload(tabId);
            refreshCount++;
          } catch (e) {
            if (e.message.includes('No tab with id')) {
              console.log('[popup] 标签页已关闭:', tabId);
            } else {
              console.log('[popup] 刷新标签页失败:', tabId, e.message);
            }
          }
        }
      }
      
      // 如果没有任何标签页被刷新，尝试刷新当前标签页
      if (refreshCount === 0) {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab) {
            console.log('[popup] 刷新当前标签页:', tab.id);
            await chrome.tabs.reload(tab.id);
            refreshCount++;
          }
        } catch (e) {
          console.warn('[popup] 刷新当前标签页失败:', e.message);
        }
      }
      
      // 检查刷新结果
      if (refreshCount === 0) {
        showToast('⚠️ 页面刷新失败，请手动刷新', 'warning');
      }
      
      // 更新当前激活账号（在所有操作完成后）
      activeProfile = name;
      updateActiveProfileBadge();
      
      console.log('[popup] 步骤8: 切换完成，600ms 后关闭弹窗');
      console.log('[popup] ========== 切换流程结束 ==========');
      
      switchSuccess = true;
      // 延迟关闭弹窗
      setTimeout(() => window.close(), 600);
    } else {
      console.log('[popup] 切换失败:', response.error);
      showToast('切换失败: ' + response.error, 'error');
    }
  } catch (error) {
    console.error('[popup] 切换异常:', error);
    showToast('切换失败: ' + error.message, 'error');
  } finally {
    // 确保按钮状态一定会被恢复（除非切换成功且即将关闭弹窗）
    if (!switchSuccess && btn) {
      btn.disabled = false;
      btn.textContent = '切换';
    }
  }
}

// ==================== 保存账号 ====================
async function saveProfile() {
  const nameInput = document.getElementById('profile-name-input');
  const name = nameInput.value.trim();
  
  if (!name) {
    showToast('请输入账号名称', 'error');
    nameInput.focus();
    return;
  }
  
  if (name.length > 20) {
    showToast('名称不能超过20个字符', 'error');
    return;
  }
  
  // 检查是否已存在
  const exists = profiles.find(p => p.name === name);
  if (exists) {
    showConfirm(
      '覆盖确认',
      `「${name}」已存在，是否覆盖？`,
      '⚠️',
      () => doSaveProfile(name)
    );
    return;
  }
  
  await doSaveProfile(name);
}

async function doSaveProfile(name) {
  const btn = document.getElementById('btn-save-confirm');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px"></span> 保存中...';
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'saveProfile',
      domain: currentDomain,
      profileName: name,
      color: selectedColor
    });
    
    if (response.success) {
      // 更新当前激活账号
      activeProfile = name;
      updateActiveProfileBadge();
      
      // 检查是否缺少子域名 Cookie
      const domainStats = response.domainStats || {};
      const domains = Object.keys(domainStats);
      const hasSubdomains = domains.some(d => {
        const clean = d.startsWith('.') ? d.slice(1) : d;
        return clean !== mainDomain && !clean.startsWith('www.');
      });
      
      if (hasSubdomains) {
        showToast(`「${name}」已保存 (${response.cookieCount} cookies)`, 'success');
      } else {
        showToast(`「${name}」已保存。提示：如需在子域名使用，请先访问子域名再重新保存`, 'warning');
      }
      
      document.getElementById('profile-name-input').value = '';
      hideSavePanel();
      await loadProfiles();
    } else if (response.error === 'duplicate') {
      // 检测到重复账号
      showConfirm(
        '账号已存在',
        `当前登录的账号已保存为「${response.duplicateName}」。\n\n是否要更新「${response.duplicateName}」的数据？`,
        '⚠️',
        async () => {
          // 用户确认更新已有账号（使用 forceRefresh 绕过激活检查）
          const updateResponse = await chrome.runtime.sendMessage({
            action: 'refreshProfile',
            domain: currentDomain,
            profileName: response.duplicateName,
            forceRefresh: true
          });
          
          if (updateResponse.success) {
            activeProfile = response.duplicateName;
            updateActiveProfileBadge();
            showToast(`「${response.duplicateName}」已更新`, 'success');
            hideSavePanel();
            await loadProfiles();
          } else {
            showToast('更新失败: ' + updateResponse.error, 'error');
          }
        }
      );
    } else {
      showToast('保存失败: ' + response.error, 'error');
    }
  } catch (error) {
    showToast('保存失败', 'error');
  }
  
  btn.disabled = false;
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
    确认保存
  `;
}

// ==================== 删除账号 ====================
function confirmDelete(name) {
  showConfirm(
    '删除确认',
    `确定要删除「${name}」吗？此操作无法撤销。`,
    '🗑️',
    () => deleteProfile(name)
  );
}

async function deleteProfile(name) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteProfile',
      domain: currentDomain,
      profileName: name
    });
    
    if (response.success) {
      showToast('已删除', 'success');
      await loadProfiles();
    } else {
      showToast('删除失败', 'error');
    }
  } catch (error) {
    showToast('删除失败', 'error');
  }
}

// ==================== 清除登录 ====================
async function clearCookies() {
  showConfirm(
    '退出登录',
    '确定要清除当前网站的登录状态吗？',
    '🚪',
    async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'clearCookies',
          domain: currentDomain
        });
        
        if (response.success) {
          showToast(`已清除 ${response.count} 个 Cookie`, 'success');
          
          // 刷新页面
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab) {
            chrome.tabs.reload(tab.id);
          }
        } else {
          showToast('清除失败', 'error');
        }
      } catch (error) {
        showToast('清除失败', 'error');
      }
    }
  );
}

// ==================== 事件监听 ====================
function setupEventListeners() {
  // 主题切换按钮
  document.getElementById('btn-theme-toggle').onclick = toggleTheme;
  
  // 保存按钮（快速操作栏）
  document.getElementById('btn-save-quick').onclick = showSavePanel;
  
  // 清除按钮
  document.getElementById('btn-clear-quick').onclick = clearCookies;
  
  // 帮助按钮
  document.getElementById('btn-help-quick').onclick = showHelpPanel;
  
  // 设置按钮
  document.getElementById('btn-settings').onclick = () => {
    chrome.runtime.openOptionsPage();
  };
  
  // 保存面板
  document.getElementById('btn-close-save').onclick = hideSavePanel;
  document.getElementById('btn-save-confirm').onclick = saveProfile;
  
  // 帮助面板
  document.getElementById('btn-close-help').onclick = hideHelpPanel;
  document.getElementById('btn-view-guide').onclick = () => {
    chrome.tabs.create({ url: 'https://github.com/quantrader-ops/SwitchID/blob/main/USER_GUIDE.md' });
  };
  document.getElementById('btn-view-terms').onclick = () => {
    chrome.tabs.create({ url: 'https://github.com/quantrader-ops/SwitchID/blob/main/TERMS_OF_USE.md' });
  };
  
  // 颜色选择
  document.getElementById('color-picker').onclick = (e) => {
    const btn = e.target.closest('.color-btn');
    if (btn) {
      document.querySelectorAll('#color-picker .color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedColor = btn.dataset.color;
    }
  };
  
  // 回车保存
  document.getElementById('profile-name-input').onkeydown = (e) => {
    if (e.key === 'Enter') {
      saveProfile();
    } else if (e.key === 'Escape') {
      hideSavePanel();
    }
  };
  
  // 模态框
  document.getElementById('modal-cancel').onclick = hideModal;
  document.querySelector('#confirm-modal .modal-backdrop').onclick = hideModal;
  document.getElementById('modal-confirm').onclick = () => {
    if (pendingAction) {
      pendingAction();
      pendingAction = null;
    }
    hideModal();
  };
  
  // 搜索框
  document.getElementById('search-input').oninput = handleSearch;
  
  // 排序选择
  document.getElementById('sort-select').onchange = (e) => {
    sortBy = e.target.value;
    renderProfiles();
  };
  
  // 编辑模态框
  document.getElementById('edit-cancel').onclick = hideEditModal;
  document.querySelector('#edit-modal .modal-backdrop').onclick = hideEditModal;
  document.getElementById('edit-save').onclick = saveEdit;
  
  // 编辑颜色选择
  document.getElementById('edit-color-picker').onclick = (e) => {
    const btn = e.target.closest('.color-btn');
    if (btn) {
      document.querySelectorAll('#edit-color-picker .color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      editSelectedColor = btn.dataset.color;
    }
  };
  
  // 编辑框回车保存
  document.getElementById('edit-name-input').onkeydown = (e) => {
    if (e.key === 'Enter') {
      saveEdit();
    } else if (e.key === 'Escape') {
      hideEditModal();
    }
  };
  
  // UA 预设选择变化
  document.getElementById('edit-ua-preset').onchange = (e) => {
    const customUaInput = document.getElementById('edit-custom-ua');
    if (e.target.value === 'custom') {
      customUaInput.style.display = 'block';
      customUaInput.focus();
    } else {
      customUaInput.style.display = 'none';
      customUaInput.value = '';
    }
  };
  
  // 代理类型选择变化
  document.getElementById('edit-proxy-type').onchange = (e) => {
    const proxyDetails = document.getElementById('proxy-details');
    const proxyTestResult = document.getElementById('proxy-test-result');
    if (e.target.value) {
      proxyDetails.style.display = 'flex';
    } else {
      proxyDetails.style.display = 'none';
      // 清空代理配置
      document.getElementById('edit-proxy-host').value = '';
      document.getElementById('edit-proxy-port').value = '';
      document.getElementById('edit-proxy-user').value = '';
      document.getElementById('edit-proxy-pass').value = '';
    }
    proxyTestResult.style.display = 'none';
    proxyTestResult.className = 'proxy-test-result';
  };
  
  // 测试代理按钮
  document.getElementById('btn-test-proxy').onclick = async () => {
    const proxyType = document.getElementById('edit-proxy-type').value;
    const proxyHost = document.getElementById('edit-proxy-host').value.trim();
    const proxyPort = document.getElementById('edit-proxy-port').value;
    const proxyUser = document.getElementById('edit-proxy-user').value.trim();
    const proxyPass = document.getElementById('edit-proxy-pass').value;
    const resultEl = document.getElementById('proxy-test-result');
    
    if (!proxyType || !proxyHost) {
      resultEl.textContent = '❌ 请填写代理地址';
      resultEl.className = 'proxy-test-result error';
      return;
    }
    
    resultEl.textContent = '⏳ 测试中...';
    resultEl.className = 'proxy-test-result testing';
    
    try {
      const proxyConfig = {
        scheme: proxyType,
        host: proxyHost,
        port: parseInt(proxyPort) || 8080
      };
      if (proxyUser) {
        proxyConfig.username = proxyUser;
        proxyConfig.password = proxyPass || '';
      }
      
      const response = await chrome.runtime.sendMessage({
        action: 'testProxy',
        proxyConfig: proxyConfig
      });
      
      if (response.success) {
        resultEl.textContent = `✅ 代理可用，IP: ${response.ip}`;
        resultEl.className = 'proxy-test-result success';
      } else {
        resultEl.textContent = `❌ ${response.error || '连接失败'}`;
        resultEl.className = 'proxy-test-result error';
      }
    } catch (error) {
      resultEl.textContent = `❌ ${error.message || '测试失败'}`;
      resultEl.className = 'proxy-test-result error';
    }
  };
  
  // 随机生成指纹按钮
  document.getElementById('btn-random-fingerprint').onclick = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'generateFingerprint' });
      if (response.success) {
        editAdvancedConfig.fingerprint = response.fingerprint;
        updateFingerprintStatus();
        showToast('已生成随机指纹', 'success');
      }
    } catch (error) {
      showToast('生成失败', 'error');
    }
  };
  
  // 清除指纹按钮
  document.getElementById('btn-clear-fingerprint').onclick = () => {
    editAdvancedConfig.fingerprint = null;
    updateFingerprintStatus();
    showToast('指纹配置已清除', 'success');
  };
  
  // 全局键盘快捷键：数字 1-9 快速切换账号
  document.addEventListener('keydown', (e) => {
    // 如果正在输入框中，不处理
    if (e.target.tagName === 'INPUT') return;
    // 如果有模态框打开，不处理
    if (document.getElementById('confirm-modal').style.display === 'flex') return;
    if (document.getElementById('edit-modal').style.display === 'flex') return;
    if (document.getElementById('save-panel').style.display === 'block') return;
    
    // 数字键 1-9
    const num = parseInt(e.key);
    if (num >= 1 && num <= 9) {
      const index = num - 1;
      if (index < profiles.length) {
        const item = document.querySelector(`.profile-item[data-index="${index}"]`);
        const btn = item?.querySelector('.btn-switch');
        if (btn) {
          switchProfile(profiles[index].name, btn);
        }
      }
    }
  });
  
  // 自动轮换按钮
  document.getElementById('btn-auto-rotate').onclick = showRotateModal;
  document.getElementById('btn-stop-rotate').onclick = stopAutoRotate;
  document.getElementById('rotate-cancel').onclick = hideRotateModal;
  document.querySelector('#rotate-modal .modal-backdrop').onclick = hideRotateModal;
  document.getElementById('rotate-start').onclick = startAutoRotate;
  
  // 全局操作菜单
  document.getElementById('btn-more-menu').onclick = toggleGlobalMenu;
  
  // 底部导入导出按钮
  document.getElementById('btn-export-quick').onclick = exportCurrentDomain;
  document.getElementById('btn-import-quick').onclick = () => {
    document.getElementById('import-file-input').click();
  };
  document.getElementById('import-file-input').onchange = handleImportFile;
  
  // 标签输入
  setupTagsInput();
  
  // 凭证备忘字段（编辑弹窗）
  // 这些字段在 showEditModal 中动态填充
}

// ==================== UI 辅助函数 ====================
async function showSavePanel() {
  document.getElementById('save-panel').style.display = 'block';
  const nameInput = document.getElementById('profile-name-input');
  
  // 尝试自动检测用户名
  try {
    const response = await chrome.runtime.sendMessage({ action: 'detectUser' });
    if (response && response.success && response.userInfo) {
      const detected = response.userInfo;
      // 优先使用邮箱的用户名部分，其次是 displayName 或 username
      let suggestedName = '';
      if (detected.email) {
        suggestedName = detected.email.split('@')[0];
      } else if (detected.displayName) {
        suggestedName = detected.displayName;
      } else if (detected.username) {
        suggestedName = detected.username;
      }
      
      // 如果检测到了名称，且输入框为空，则自动填充
      if (suggestedName && !nameInput.value) {
        // 截断过长的名称
        suggestedName = suggestedName.substring(0, 20);
        nameInput.value = suggestedName;
        nameInput.select(); // 选中文字，方便用户修改
        
        // 显示提示
        const hint = document.querySelector('.input-hint');
        if (hint) {
          hint.innerHTML = `✨ 已自动识别: <strong>${suggestedName}</strong>`;
          hint.style.color = 'var(--success)';
        }
      }
    }
  } catch (e) {
    // 检测失败，静默处理
  }
  
  nameInput.focus();
}

function hideSavePanel() {
  document.getElementById('save-panel').style.display = 'none';
  document.getElementById('profile-name-input').value = '';
  // 重置提示
  const hint = document.querySelector('.input-hint');
  if (hint) {
    hint.innerHTML = '💡 请确保已登录后再保存';
    hint.style.color = '';
  }
}

// 帮助面板相关函数
function showHelpPanel() {
  document.getElementById('help-panel').style.display = 'flex';
}

function hideHelpPanel() {
  document.getElementById('help-panel').style.display = 'none';
}

// 更新右上角当前账号徽章
function updateActiveProfileBadge() {
  const badge = document.getElementById('active-profile-badge');
  const nameEl = document.getElementById('active-profile-name');
  
  if (activeProfile) {
    nameEl.textContent = activeProfile;
    badge.style.display = 'flex';
    badge.title = `当前账号: ${activeProfile}`;
  } else {
    badge.style.display = 'none';
  }
}

function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'flex' : 'none';
  // 加载时隐藏其他内容，加载完成后由 renderProfiles 决定显示什么
  if (show) {
    document.getElementById('profiles-section').style.display = 'none';
    document.getElementById('empty-state').style.display = 'none';
  }
}

function showUnsupported() {
  document.getElementById('unsupported').style.display = 'flex';
  document.getElementById('profiles-section').style.display = 'none';
  document.getElementById('empty-state').style.display = 'none';
  document.querySelector('.quick-actions').style.display = 'none';
  document.querySelector('.footer').style.display = 'none';
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');
  
  toastMsg.textContent = message;
  toastIcon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ';
  toast.className = 'toast show ' + type;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, type === 'warning' ? 4000 : 2500); // warning 显示更久
}

function showConfirm(title, message, icon, callback) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-message').textContent = message;
  document.getElementById('modal-icon').textContent = icon;
  pendingAction = callback;
  document.getElementById('confirm-modal').style.display = 'flex';
}

function hideModal() {
  document.getElementById('confirm-modal').style.display = 'none';
  pendingAction = null;
}

// ==================== 工具函数 ====================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(timestamp) {
  if (!timestamp) return '未知';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ==================== 搜索功能 ====================
function filterProfiles() {
  let result = [...profiles];
  
  // 搜索过滤
  const query = searchQuery.toLowerCase().trim();
  if (query) {
    result = result.filter(p => 
      p.name.toLowerCase().includes(query) || 
      (p.note && p.note.toLowerCase().includes(query))
    );
  }
  
  // 排序
  switch (sortBy) {
    case 'name':
      result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      break;
    case 'created':
      result.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      break;
    case 'useCount':
      result.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));
      break;
    case 'recent':
    default:
      result.sort((a, b) => (b.lastUsedAt || b.savedAt || 0) - (a.lastUsedAt || a.savedAt || 0));
      break;
  }
  
  return result;
}

function handleSearch(e) {
  searchQuery = e.target.value;
  renderRecentUsage();
  renderProfiles();
}

// ==================== 编辑功能 ====================

// UA 预设列表
const uaPresets = {
  'chrome-win': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'chrome-mac': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'firefox-win': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'safari-mac': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'mobile-android': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'mobile-ios': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
};

// 当前编辑的高级配置
let editAdvancedConfig = {
  customUA: null,
  proxyConfig: null,
  fingerprint: null
};

function showEditModal(profile) {
  editingProfile = profile;
  editSelectedColor = profile.color || '#4285F4';
  editSelectedGroup = profile.groupId || null;
  
  // 重置高级配置
  editAdvancedConfig = {
    customUA: profile.customUA || null,
    proxyConfig: profile.proxyConfig || null,
    fingerprint: profile.fingerprint || null
  };
  
  document.getElementById('edit-name-input').value = profile.name;
  document.getElementById('edit-note-input').value = profile.note || '';
  
  // 设置颜色选择
  document.querySelectorAll('#edit-color-picker .color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === editSelectedColor);
  });
  
  // 设置分组选择
  const groupSelect = document.getElementById('edit-group-select');
  groupSelect.innerHTML = '<option value="">无分组</option>';
  groups.forEach(g => {
    groupSelect.innerHTML += `<option value="${g.id}" ${g.id === editSelectedGroup ? 'selected' : ''}>${escapeHtml(g.name)}</option>`;
  });
  
  // 设置 UA 配置
  const uaPresetSelect = document.getElementById('edit-ua-preset');
  const customUaInput = document.getElementById('edit-custom-ua');
  
  if (profile.customUA) {
    // 检查是否匹配预设
    const matchedPreset = Object.entries(uaPresets).find(([_, ua]) => ua === profile.customUA);
    if (matchedPreset) {
      uaPresetSelect.value = matchedPreset[0];
      customUaInput.style.display = 'none';
    } else {
      uaPresetSelect.value = 'custom';
      customUaInput.value = profile.customUA;
      customUaInput.style.display = 'block';
    }
  } else {
    uaPresetSelect.value = '';
    customUaInput.value = '';
    customUaInput.style.display = 'none';
  }
  
  // 设置代理配置
  const proxyTypeSelect = document.getElementById('edit-proxy-type');
  const proxyHostInput = document.getElementById('edit-proxy-host');
  const proxyPortInput = document.getElementById('edit-proxy-port');
  const proxyUserInput = document.getElementById('edit-proxy-user');
  const proxyPassInput = document.getElementById('edit-proxy-pass');
  const proxyDetails = document.getElementById('proxy-details');
  
  if (profile.proxyConfig && profile.proxyConfig.host) {
    proxyTypeSelect.value = profile.proxyConfig.scheme || 'http';
    proxyHostInput.value = profile.proxyConfig.host;
    proxyPortInput.value = profile.proxyConfig.port || 8080;
    proxyUserInput.value = profile.proxyConfig.username || '';
    proxyPassInput.value = profile.proxyConfig.password || '';
    proxyDetails.style.display = 'flex';
  } else {
    proxyTypeSelect.value = '';
    proxyHostInput.value = '';
    proxyPortInput.value = '';
    proxyUserInput.value = '';
    proxyPassInput.value = '';
    proxyDetails.style.display = 'none';
  }
  
  // 设置指纹状态
  updateFingerprintStatus();
  
  document.getElementById('edit-modal').style.display = 'flex';
  document.getElementById('edit-name-input').focus();
}

function updateFingerprintStatus() {
  const statusEl = document.getElementById('fingerprint-status');
  if (editAdvancedConfig.fingerprint) {
    const fp = editAdvancedConfig.fingerprint;
    const platformShort = fp.platform === 'Win32' ? 'Win' : fp.platform === 'MacIntel' ? 'Mac' : 'Linux';
    const seedShort = fp.seed ? `#${(fp.seed % 10000).toString().padStart(4, '0')}` : '';
    statusEl.textContent = `✓ ${platformShort} / ${fp.screenWidth}x${fp.screenHeight} ${seedShort}`;
    statusEl.className = 'fingerprint-status configured';
    statusEl.title = `独立指纹已配置\n平台: ${fp.platform}\n分辨率: ${fp.screenWidth}x${fp.screenHeight}\n时区: ${fp.timezone || '默认'}\n种子: ${fp.seed || '随机'}`;
  } else {
    statusEl.textContent = '⚠️ 未配置（将自动生成）';
    statusEl.className = 'fingerprint-status';
    statusEl.title = '保存账号时将自动生成独立指纹';
  }
}

function hideEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
  editingProfile = null;
}

async function saveEdit() {
  if (!editingProfile) return;
  
  const newName = document.getElementById('edit-name-input').value.trim();
  const newNote = document.getElementById('edit-note-input').value.trim();
  const newGroupId = document.getElementById('edit-group-select').value || null;
  
  if (!newName) {
    showToast('请输入账号名称', 'error');
    return;
  }
  
  if (newName.length > 20) {
    showToast('名称不能超过20个字符', 'error');
    return;
  }
  
  const oldName = editingProfile.name;
  const nameChanged = newName !== oldName;
  const colorChanged = editSelectedColor !== editingProfile.color;
  const groupChanged = newGroupId !== editingProfile.groupId;
  const noteChanged = newNote !== (editingProfile.note || '');
  
  // 获取高级配置
  const uaPresetSelect = document.getElementById('edit-ua-preset');
  const customUaInput = document.getElementById('edit-custom-ua');
  const proxyTypeSelect = document.getElementById('edit-proxy-type');
  const proxyHostInput = document.getElementById('edit-proxy-host');
  const proxyPortInput = document.getElementById('edit-proxy-port');
  const proxyUserInput = document.getElementById('edit-proxy-user');
  const proxyPassInput = document.getElementById('edit-proxy-pass');
  
  // 解析 UA 配置
  let newCustomUA = null;
  if (uaPresetSelect.value === 'custom') {
    newCustomUA = customUaInput.value.trim() || null;
  } else if (uaPresetSelect.value && uaPresets[uaPresetSelect.value]) {
    newCustomUA = uaPresets[uaPresetSelect.value];
  }
  
  // 解析代理配置
  let newProxyConfig = null;
  if (proxyTypeSelect.value && proxyHostInput.value.trim()) {
    newProxyConfig = {
      scheme: proxyTypeSelect.value,
      host: proxyHostInput.value.trim(),
      port: parseInt(proxyPortInput.value) || 8080
    };
    // 添加认证信息（如果有）
    if (proxyUserInput.value.trim()) {
      newProxyConfig.username = proxyUserInput.value.trim();
      newProxyConfig.password = proxyPassInput.value || '';
    }
  }
  
  const configChanged = 
    newCustomUA !== editingProfile.customUA ||
    JSON.stringify(newProxyConfig) !== JSON.stringify(editingProfile.proxyConfig) ||
    JSON.stringify(editAdvancedConfig.fingerprint) !== JSON.stringify(editingProfile.fingerprint);
  
  // 检查新名称是否已存在（排除自己）
  if (nameChanged && profiles.find(p => p.name === newName)) {
    showToast('该名称已存在', 'error');
    return;
  }
  
  try {
    // 如果名称改变，需要重命名
    if (nameChanged) {
      const response = await chrome.runtime.sendMessage({
        action: 'renameProfile',
        domain: currentDomain,
        oldName: oldName,
        newName: newName
      });
      
      if (!response.success) {
        showToast('重命名失败: ' + response.error, 'error');
        return;
      }
    }
    
    const profileName = nameChanged ? newName : oldName;
    
    // 更新颜色
    if (colorChanged) {
      await chrome.runtime.sendMessage({
        action: 'updateProfileColor',
        domain: currentDomain,
        profileName: profileName,
        color: editSelectedColor
      });
    }
    
    // 更新分组
    if (groupChanged) {
      await chrome.runtime.sendMessage({
        action: 'updateProfileGroup',
        domain: currentDomain,
        profileName: profileName,
        groupId: newGroupId
      });
    }
    
    // 更新备注
    if (noteChanged) {
      await chrome.runtime.sendMessage({
        action: 'updateProfileNote',
        domain: currentDomain,
        profileName: profileName,
        note: newNote
      });
    }
    
    // 更新高级配置（UA、代理、指纹）
    if (configChanged) {
      await chrome.runtime.sendMessage({
        action: 'updateProfileConfig',
        domain: currentDomain,
        profileName: profileName,
        config: {
          customUA: newCustomUA,
          proxyConfig: newProxyConfig,
          fingerprint: editAdvancedConfig.fingerprint
        }
      });
    }
    
    showToast('修改已保存', 'success');
    hideEditModal();
    await loadProfiles();
  } catch (error) {
    showToast('保存失败', 'error');
  }
}


// ==================== 自动轮换 ====================

let autoRotateConfig = null;

// 加载自动轮换状态
async function loadAutoRotateStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getAutoRotateConfig',
      domain: currentDomain
    });
    
    if (response.success && response.config && response.config.enabled) {
      autoRotateConfig = response.config;
      showAutoRotateBar();
    } else {
      autoRotateConfig = null;
      hideAutoRotateBar();
    }
  } catch (e) {
    autoRotateConfig = null;
  }
}

// 显示自动轮换状态条
function showAutoRotateBar() {
  if (!autoRotateConfig) return;
  
  const bar = document.getElementById('auto-rotate-bar');
  const info = document.getElementById('rotate-info');
  
  const minutes = autoRotateConfig.intervalMinutes;
  let intervalText = '';
  if (minutes < 60) {
    intervalText = `每 ${minutes} 分钟`;
  } else if (minutes < 1440) {
    intervalText = `每 ${minutes / 60} 小时`;
  } else {
    intervalText = `每 ${minutes / 1440} 天`;
  }
  
  info.textContent = `${intervalText} · ${autoRotateConfig.profiles.length} 个账号`;
  bar.style.display = 'flex';
}

// 隐藏自动轮换状态条
function hideAutoRotateBar() {
  document.getElementById('auto-rotate-bar').style.display = 'none';
}

// 显示自动轮换设置对话框
function showRotateModal() {
  const modal = document.getElementById('rotate-modal');
  const list = document.getElementById('rotate-profiles-list');
  
  // 生成账号列表
  list.innerHTML = profiles.map(p => `
    <label class="rotate-profile-item">
      <input type="checkbox" value="${escapeHtml(p.name)}" ${autoRotateConfig?.profiles?.includes(p.name) ? 'checked' : ''}>
      <span class="profile-color" style="background: ${p.color}"></span>
      <span class="profile-name">${escapeHtml(p.name)}</span>
    </label>
  `).join('');
  
  // 恢复之前的间隔设置
  if (autoRotateConfig?.intervalMinutes) {
    document.getElementById('rotate-interval').value = autoRotateConfig.intervalMinutes;
  }
  
  modal.style.display = 'flex';
}

// 隐藏自动轮换设置对话框
function hideRotateModal() {
  document.getElementById('rotate-modal').style.display = 'none';
}

// 开始自动轮换
async function startAutoRotate() {
  const interval = parseInt(document.getElementById('rotate-interval').value);
  const checkboxes = document.querySelectorAll('#rotate-profiles-list input[type="checkbox"]:checked');
  const selectedProfiles = Array.from(checkboxes).map(cb => cb.value);
  
  if (selectedProfiles.length < 2) {
    showToast('请至少选择 2 个账号', 'error');
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'setAutoRotate',
      domain: currentDomain,
      config: {
        enabled: true,
        intervalMinutes: interval,
        profiles: selectedProfiles
      }
    });
    
    if (response.success) {
      autoRotateConfig = {
        enabled: true,
        intervalMinutes: interval,
        profiles: selectedProfiles
      };
      showAutoRotateBar();
      hideRotateModal();
      showToast('自动轮换已启动', 'success');
    } else {
      showToast('启动失败: ' + response.error, 'error');
    }
  } catch (e) {
    showToast('启动失败', 'error');
  }
}

// 停止自动轮换
async function stopAutoRotate() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'setAutoRotate',
      domain: currentDomain,
      config: { enabled: false }
    });
    
    if (response.success) {
      autoRotateConfig = null;
      hideAutoRotateBar();
      showToast('自动轮换已停止', 'success');
    }
  } catch (e) {
    showToast('停止失败', 'error');
  }
}


// ==================== 全局操作菜单 ====================

function toggleGlobalMenu() {
  const menu = document.getElementById('global-menu');
  if (menu.style.display === 'none') {
    menu.style.display = 'block';
    
    // 绑定菜单项点击事件
    menu.querySelectorAll('.menu-item').forEach(item => {
      item.onclick = async () => {
        const action = item.dataset.action;
        menu.style.display = 'none';
        await handleGlobalMenuAction(action);
      };
    });
    
    // 点击其他地方关闭菜单
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target) && e.target.id !== 'btn-more-menu') {
          menu.style.display = 'none';
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 0);
  } else {
    menu.style.display = 'none';
  }
}

async function handleGlobalMenuAction(action) {
  switch (action) {
    case 'refresh-all':
      await refreshAllProfiles();
      break;
    case 'verify-all':
      await verifyAllProfiles();
      break;
    case 'export-domain':
      await exportCurrentDomain();
      break;
    case 'export-all':
      await exportAllData();
      break;
  }
}

// 刷新所有账号（只刷新当前激活的）
async function refreshAllProfiles() {
  if (!activeProfile) {
    showToast('当前没有激活的账号', 'warning');
    return;
  }
  
  showConfirm(
    '刷新当前账号',
    `将刷新当前激活的账号「${activeProfile}」的 Cookie。\n\n确保你现在登录的就是这个账号！`,
    '🔄',
    async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'refreshProfile',
          domain: currentDomain,
          profileName: activeProfile
        });
        
        if (response.success) {
          showToast(`已刷新「${activeProfile}」`, 'success');
          await loadProfiles();
        } else {
          showToast(response.error, 'error');
        }
      } catch (e) {
        showToast('刷新失败', 'error');
      }
    }
  );
}

// 检查所有账号状态
async function verifyAllProfiles() {
  showToast('正在检查账号状态...', 'info');
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'checkHealthNow'
    });
    
    if (response.success) {
      const warnings = response.warnings || [];
      if (warnings.length === 0) {
        showToast('所有账号状态正常 ✓', 'success');
      } else {
        const domainWarnings = warnings.filter(w => w.domain === mainDomain);
        if (domainWarnings.length > 0) {
          showToast(`${domainWarnings.length} 个账号需要注意`, 'warning');
        } else {
          showToast('当前网站账号状态正常 ✓', 'success');
        }
      }
      await loadProfiles();
    }
  } catch (e) {
    showToast('检查失败', 'error');
  }
}

// 导出当前网站账号
async function exportCurrentDomain() {
  if (profiles.length === 0) {
    showToast('当前网站没有保存的账号', 'warning');
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'exportDomainProfiles',
      domain: currentDomain
    });
    
    if (response.success) {
      downloadJSON(response.data, `accounts-${mainDomain}-${getDateStr()}.json`);
      showToast('导出成功', 'success');
    } else {
      showToast('导出失败', 'error');
    }
  } catch (e) {
    showToast('导出失败', 'error');
  }
}

// 导出全部数据
async function exportAllData() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'exportProfiles' });
    
    if (response.success) {
      downloadJSON(response.data, `multi-account-backup-${getDateStr()}.json`);
      showToast('导出成功', 'success');
    } else {
      showToast('导出失败', 'error');
    }
  } catch (e) {
    showToast('导出失败', 'error');
  }
}

// 处理导入文件
async function handleImportFile(e) {
  const file = e.target.files[0];
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
      showToast('导入成功', 'success');
      await loadProfiles();
    } else {
      showToast('导入失败: ' + response.error, 'error');
    }
  } catch (e) {
    showToast('导入失败: 文件格式错误', 'error');
  }
  
  e.target.value = '';
}

// 下载 JSON 文件
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 获取日期字符串
function getDateStr() {
  return new Date().toISOString().split('T')[0];
}

// ==================== 标签功能 ====================

let editTags = [];

function setupTagsInput() {
  const input = document.getElementById('edit-tags-input');
  const presetTags = document.querySelectorAll('.preset-tag');
  
  if (input) {
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addTag(input.value.trim());
        input.value = '';
      }
    };
  }
  
  presetTags.forEach(tag => {
    tag.onclick = () => {
      addTag(tag.dataset.tag);
    };
  });
}

function addTag(tagName) {
  if (!tagName || tagName.length > 10) return;
  if (editTags.includes(tagName)) return;
  if (editTags.length >= 5) {
    showToast('最多添加 5 个标签', 'warning');
    return;
  }
  
  editTags.push(tagName);
  renderEditTags();
}

function removeTag(tagName) {
  editTags = editTags.filter(t => t !== tagName);
  renderEditTags();
}

function renderEditTags() {
  const list = document.getElementById('edit-tags-list');
  if (!list) return;
  
  list.innerHTML = editTags.map(tag => `
    <span class="tag-item" data-tag="${escapeHtml(tag)}">
      ${escapeHtml(tag)}
      <span class="tag-remove" data-tag="${escapeHtml(tag)}">&times;</span>
    </span>
  `).join('');
  
  // 使用事件委托绑定删除事件
  list.querySelectorAll('.tag-remove').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const tagName = btn.dataset.tag;
      removeTag(tagName);
    };
  });
}

// 更新 showEditModal 以支持标签和凭证
const originalShowEditModal = showEditModal;
showEditModal = function(profile) {
  // 加载标签
  editTags = profile.tags || [];
  
  // 调用原始函数
  originalShowEditModal(profile);
  
  // 渲染标签
  renderEditTags();
  
  // 填充凭证备忘
  const loginHint = document.getElementById('edit-login-hint');
  const passwordHint = document.getElementById('edit-password-hint');
  
  if (loginHint) loginHint.value = profile.loginHint || '';
  if (passwordHint) passwordHint.value = profile.passwordHint || '';
};

// 更新 saveEdit 以保存标签和凭证
const originalSaveEdit = saveEdit;
saveEdit = async function() {
  if (!editingProfile) return;
  
  // 获取凭证备忘
  const loginHint = document.getElementById('edit-login-hint')?.value.trim() || '';
  const passwordHint = document.getElementById('edit-password-hint')?.value.trim() || '';
  
  // 检查标签和凭证是否有变化
  const tagsChanged = JSON.stringify(editTags) !== JSON.stringify(editingProfile.tags || []);
  const credentialsChanged = loginHint !== (editingProfile.loginHint || '') || 
                             passwordHint !== (editingProfile.passwordHint || '');
  
  // 先调用原始保存
  await originalSaveEdit();
  
  // 如果标签或凭证有变化，额外保存
  if (tagsChanged || credentialsChanged) {
    try {
      await chrome.runtime.sendMessage({
        action: 'updateProfileMeta',
        domain: currentDomain,
        profileName: editingProfile.name,
        meta: {
          tags: editTags,
          loginHint: loginHint,
          passwordHint: passwordHint
        }
      });
    } catch (e) {
      console.error('保存元数据失败:', e);
    }
  }
};
