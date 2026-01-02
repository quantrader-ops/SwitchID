// background.js - 多账号管理助手 (Manifest V3)
// Cookie Profile 切换方案 - 可上架 Chrome Web Store

// 当前活动的设置
let activeSettings = {
  proxyEnabled: false,
  uaEnabled: false,
  customUA: null,
  autoRefresh: true,
  closeRelatedTabs: false,
  clearStorageOnSwitch: true  // 默认开启，防止账号关联
};

// 当前激活的账号（按域名存储）
// 格式: { 'bing.com': 'account1', 'google.com': 'account2' }
let activeProfiles = {};

// 待恢复的存储数据（页面刷新后恢复）
// 格式: { tabId: { localStorage: {...}, sessionStorage: {...}, domain: 'xxx', profileName: 'xxx', timestamp: Date.now() } }
let pendingStorageRestore = {};

// ==================== 初始化 ====================

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      profiles: {},
      settings: {
        theme: 'light',
        language: 'zh-CN',
        autoSave: false,
        showNotification: true,
        proxyEnabled: false,
        uaEnabled: false,
        autoRefresh: true,
        closeRelatedTabs: false,
        clearStorageOnSwitch: true,  // 默认开启，防止账号关联
        healthCheckEnabled: true,
        autoRotateEnabled: false,
        autoRefreshExpiring: false  // 自动刷新快过期账号
      },
      autoRotateConfig: {}  // 自动轮换配置
    });
  }
  
  // 清除旧的动态规则
  await clearAllDynamicRules();
  
  // 加载设置
  await loadActiveSettings();
  
  // 初始化右键菜单
  await initContextMenu();
  
  // 设置健康检查定时任务（每天检查一次）
  chrome.alarms.create('healthCheck', { periodInMinutes: 60 * 24 });
  
  // 立即执行一次健康检查
  setTimeout(() => checkAllProfilesHealth(), 5000);
});

// 启动时加载设置
chrome.runtime.onStartup.addListener(async () => {
  await clearAllDynamicRules();
  await loadActiveSettings();
  
  // 启动时检查健康状态
  setTimeout(() => checkAllProfilesHealth(), 5000);
  
  // 恢复自动轮换任务
  await restoreAutoRotateAlarms();
});

async function loadActiveSettings() {
  try {
    const data = await chrome.storage.local.get(['settings', 'activeProfiles']);
    if (data.settings) {
      activeSettings = { ...activeSettings, ...data.settings };
    }
    if (data.activeProfiles) {
      activeProfiles = data.activeProfiles;
    }
    
    // 如果启用了 UA 伪装，设置请求拦截
    if (activeSettings.uaEnabled && activeSettings.customUA) {
      await applyUserAgent(activeSettings.customUA);
    }
  } catch (e) {
    console.error('加载设置失败:', e);
  }
}

// ==================== 指纹防关联 ====================
// 指纹配置预设
const fingerprintPresets = {
  'windows-chrome': {
    platform: 'Win32',
    vendor: 'Google Inc.',
    renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)',
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    languages: ['zh-CN', 'zh', 'en'],
    screenWidth: 1920,
    screenHeight: 1080,
    colorDepth: 24
  },
  'mac-chrome': {
    platform: 'MacIntel',
    vendor: 'Google Inc.',
    renderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)',
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    languages: ['zh-CN', 'zh', 'en'],
    screenWidth: 2560,
    screenHeight: 1440,
    colorDepth: 30
  },
  'windows-edge': {
    platform: 'Win32',
    vendor: 'Google Inc.',
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060, OpenGL 4.5)',
    timezone: 'America/New_York',
    language: 'en-US',
    languages: ['en-US', 'en'],
    screenWidth: 1920,
    screenHeight: 1080,
    colorDepth: 24
  }
};

// 生成随机指纹配置
// 参考 my-fingerprint 项目的专业实现
function generateRandomFingerprint() {
  // 生成主种子
  const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  
  // 平台配置
  const platformConfigs = [
    {
      platform: 'Win32',
      vendors: ['Google Inc.', 'Google Inc. (Intel)', 'Google Inc. (NVIDIA)', 'Google Inc. (AMD)'],
      renderers: [
        'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)',
        'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        'ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)',
        'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)'
      ]
    },
    {
      platform: 'MacIntel',
      vendors: ['Google Inc. (Apple)', 'Apple Inc.'],
      renderers: [
        'ANGLE (Apple, Apple M1, OpenGL 4.1)',
        'ANGLE (Apple, Apple M2, OpenGL 4.1)',
        'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)',
        'ANGLE (Intel Inc., Intel(R) Iris(TM) Plus Graphics 655, OpenGL 4.1)'
      ]
    },
    {
      platform: 'Linux x86_64',
      vendors: ['Google Inc.', 'Mesa'],
      renderers: [
        'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)',
        'ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1080/PCIe/SSE2, OpenGL 4.6)',
        'Mesa Intel(R) UHD Graphics 630 (CFL GT2)'
      ]
    }
  ];
  
  // 时区配置（包含偏移量）
  const timezoneConfigs = [
    { zone: 'Asia/Shanghai', offset: 480, locale: 'zh-CN' },
    { zone: 'Asia/Tokyo', offset: 540, locale: 'ja-JP' },
    { zone: 'America/New_York', offset: -300, locale: 'en-US' },
    { zone: 'America/Los_Angeles', offset: -480, locale: 'en-US' },
    { zone: 'Europe/London', offset: 0, locale: 'en-GB' },
    { zone: 'Europe/Paris', offset: 60, locale: 'fr-FR' },
    { zone: 'Australia/Sydney', offset: 660, locale: 'en-AU' }
  ];
  
  // 语言配置
  const languageConfigs = [
    { language: 'zh-CN', languages: ['zh-CN', 'zh', 'en-US', 'en'] },
    { language: 'en-US', languages: ['en-US', 'en'] },
    { language: 'ja-JP', languages: ['ja-JP', 'ja', 'en-US', 'en'] },
    { language: 'ko-KR', languages: ['ko-KR', 'ko', 'en-US', 'en'] },
    { language: 'de-DE', languages: ['de-DE', 'de', 'en-US', 'en'] },
    { language: 'fr-FR', languages: ['fr-FR', 'fr', 'en-US', 'en'] }
  ];
  
  // 屏幕分辨率
  const resolutions = [
    { width: 1920, height: 1080, colorDepth: 24 },
    { width: 2560, height: 1440, colorDepth: 24 },
    { width: 1366, height: 768, colorDepth: 24 },
    { width: 1536, height: 864, colorDepth: 24 },
    { width: 1440, height: 900, colorDepth: 24 },
    { width: 1680, height: 1050, colorDepth: 24 },
    { width: 2560, height: 1600, colorDepth: 30 },
    { width: 3840, height: 2160, colorDepth: 30 }
  ];
  
  // 硬件配置
  const hardwareConcurrencies = [4, 6, 8, 10, 12, 16];
  const deviceMemories = [4, 8, 16, 32];
  
  // Chrome 版本配置
  const chromeVersions = ['118', '119', '120', '121', '122', '123'];
  
  // 随机选择
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  
  const platformConfig = pick(platformConfigs);
  const timezoneConfig = pick(timezoneConfigs);
  const languageConfig = pick(languageConfigs);
  const resolution = pick(resolutions);
  const chromeVersion = pick(chromeVersions);
  
  // 根据平台生成 userAgentData
  const platformToUAData = {
    'Win32': { platform: 'Windows', platformVersion: '10.0.0' },
    'MacIntel': { platform: 'macOS', platformVersion: '14.0.0' },
    'Linux x86_64': { platform: 'Linux', platformVersion: '6.0.0' }
  };
  const uaPlatform = platformToUAData[platformConfig.platform] || { platform: 'Windows', platformVersion: '10.0.0' };
  
  return {
    // 主种子（用于生成各类噪声）
    seed: seed,
    
    // 各指纹类型的独立种子
    canvasSeed: seed,
    webglSeed: seed + 1,
    audioSeed: seed + 2,
    fontSeed: seed + 3,
    domRectSeed: seed + 4,
    webgpuSeed: seed + 5,
    
    // 是否启用各类指纹保护
    canvas: true,
    webgl: true,
    audio: true,
    font: true,
    domRect: true,
    webgpu: true,
    disableWebRTC: false,  // 默认不禁用 WebRTC
    
    // GPU 信息
    gpuInfo: {
      vendor: pick(platformConfig.vendors),
      renderer: pick(platformConfig.renderers)
    },
    
    // Navigator 属性
    navigator: {
      platform: platformConfig.platform,
      language: languageConfig.language,
      languages: languageConfig.languages,
      hardwareConcurrency: pick(hardwareConcurrencies),
      deviceMemory: pick(deviceMemories),
      // UserAgentData (Client Hints)
      userAgentData: {
        brands: [
          { brand: 'Chromium', version: chromeVersion },
          { brand: 'Google Chrome', version: chromeVersion },
          { brand: 'Not_A Brand', version: '8' }
        ],
        fullVersionList: [
          { brand: 'Chromium', version: chromeVersion + '.0.6099.130' },
          { brand: 'Google Chrome', version: chromeVersion + '.0.6099.130' },
          { brand: 'Not_A Brand', version: '8.0.0.0' }
        ],
        mobile: false,
        platform: uaPlatform.platform,
        platformVersion: uaPlatform.platformVersion,
        architecture: 'x86',
        bitness: '64',
        model: '',
        uaFullVersion: chromeVersion + '.0.6099.130',
        formFactors: ['Desktop']
      }
    },
    
    // Screen 属性
    screen: {
      width: resolution.width,
      height: resolution.height,
      colorDepth: resolution.colorDepth
    },
    
    // 时区
    timezone: {
      zone: timezoneConfig.zone,
      offset: timezoneConfig.offset,
      locale: timezoneConfig.locale
    }
  };
}

// ==================== 指纹管理 ====================

// 保存当前活动的指纹配置（按账号存储）
async function saveActiveFingerprint(domain, fingerprint, profileName = null) {
  try {
    const mainDomain = getMainDomain(domain);
    const data = await chrome.storage.local.get(['activeFingerprints']);
    const fingerprints = data.activeFingerprints || {};
    
    // 存储格式：{ domain: { profileName: fingerprint, _current: profileName } }
    if (!fingerprints[mainDomain]) {
      fingerprints[mainDomain] = {};
    }
    
    if (profileName) {
      fingerprints[mainDomain][profileName] = fingerprint;
      fingerprints[mainDomain]._current = profileName;
    } else {
      // 兼容旧格式
      fingerprints[mainDomain]._default = fingerprint;
    }
    
    await chrome.storage.local.set({ activeFingerprints: fingerprints });
  } catch (e) {
    console.error('保存指纹配置失败:', e);
  }
}

// 清除指纹配置
async function clearActiveFingerprint(domain, profileName = null) {
  try {
    const mainDomain = getMainDomain(domain);
    const data = await chrome.storage.local.get(['activeFingerprints']);
    const fingerprints = data.activeFingerprints || {};
    
    if (profileName && fingerprints[mainDomain]) {
      delete fingerprints[mainDomain][profileName];
      if (fingerprints[mainDomain]._current === profileName) {
        delete fingerprints[mainDomain]._current;
      }
    } else {
      delete fingerprints[mainDomain];
    }
    
    await chrome.storage.local.set({ activeFingerprints: fingerprints });
  } catch (e) {
    console.error('清除指纹配置失败:', e);
  }
}

// 获取域名的指纹配置（优先使用当前激活账号的指纹）
async function getActiveFingerprint(domain) {
  try {
    const mainDomain = getMainDomain(domain);
    
    // 检查设置是否启用指纹保护
    const settingsData = await chrome.storage.local.get(['settings', 'fingerprintWhitelist', 'profiles', 'activeProfiles']);
    const settings = settingsData.settings || {};
    
    // 如果指纹保护被禁用，返回 null
    if (settings.fingerprintEnabled === false) {
      return null;
    }
    
    // 检查白名单
    const whitelist = settingsData.fingerprintWhitelist || [];
    if (isInWhitelist(domain, whitelist)) {
      return null;
    }
    
    // 获取当前激活的账号
    const activeProfileName = activeProfiles[mainDomain] || settingsData.activeProfiles?.[mainDomain];
    const profiles = settingsData.profiles || {};
    const domainProfiles = profiles[mainDomain] || {};
    const activeProfile = activeProfileName ? domainProfiles[activeProfileName] : null;
    
    let fingerprint = null;
    
    // 优先使用账号专属指纹
    if (activeProfile && activeProfile.fingerprint) {
      fingerprint = { ...activeProfile.fingerprint };
    } else {
      // 没有账号专属指纹，从 activeFingerprints 获取或生成新的
      const data = await chrome.storage.local.get(['activeFingerprints']);
      const fingerprints = data.activeFingerprints || {};
      const domainFingerprints = fingerprints[mainDomain] || {};
      
      if (activeProfileName && domainFingerprints[activeProfileName]) {
        fingerprint = { ...domainFingerprints[activeProfileName] };
      } else if (domainFingerprints._default) {
        fingerprint = { ...domainFingerprints._default };
      } else {
        // 生成新指纹
        fingerprint = generateRandomFingerprint();
        // 如果有激活账号，保存到该账号
        if (activeProfileName) {
          await saveActiveFingerprint(mainDomain, fingerprint, activeProfileName);
        }
      }
    }
    
    // 根据设置调整指纹配置
    // 强指纹：默认开启，设置为 false 时关闭
    if (settings.fp_canvas === false) fingerprint.canvas = false;
    if (settings.fp_webgl === false) fingerprint.webgl = false;
    if (settings.fp_audio === false) fingerprint.audio = false;
    if (settings.fp_font === false) fingerprint.font = false;
    
    // 弱指纹：默认关闭，设置为 true 时开启
    if (settings.fp_domrect !== true) fingerprint.domRect = false;
    if (settings.fp_webgpu !== true) fingerprint.webgpu = false;
    if (settings.fp_timezone !== true) fingerprint.timezone = null;
    if (settings.fp_webrtc === true) fingerprint.disableWebRTC = true;
    
    return fingerprint;
  } catch (e) {
    console.error('获取指纹配置失败:', e);
    return null;
  }
}

/**
 * 检查域名是否在白名单中
 * 支持子域名匹配：example.com 匹配 www.example.com、api.example.com 等
 */
function isInWhitelist(domain, whitelist) {
  if (!domain || !whitelist || whitelist.length === 0) return false;
  
  domain = domain.toLowerCase();
  
  for (const pattern of whitelist) {
    const p = pattern.toLowerCase();
    
    // 精确匹配
    if (domain === p) return true;
    
    // 子域名匹配：如果白名单是 example.com，则匹配 *.example.com
    if (domain.endsWith('.' + p)) return true;
    
    // 通配符匹配
    if (p.startsWith('*.')) {
      const baseDomain = p.slice(2);
      if (domain === baseDomain || domain.endsWith('.' + baseDomain)) return true;
    }
  }
  
  return false;
}

// ==================== User-Agent 伪装 ====================

// 固定的规则 ID，用于 UA 伪装
const UA_RULE_ID = 1;

async function clearAllDynamicRules() {
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleIds = existingRules.map(rule => rule.id);
    if (ruleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIds,
        addRules: []
      });
    }
  } catch (e) {
    console.error('清除动态规则失败:', e);
  }
}

async function applyUserAgent(userAgent) {
  if (!userAgent) {
    await clearAllDynamicRules();
    return;
  }
  
  try {
    // 获取现有规则
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existingRules.map(rule => rule.id);
    
    // 新的 UA 修改规则
    const rule = {
      id: UA_RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          {
            header: 'User-Agent',
            operation: 'set',
            value: userAgent
          }
        ]
      },
      condition: {
        urlFilter: '*',
        resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'image', 'stylesheet', 'font', 'media', 'other']
      }
    };
    
    // 一次性删除旧规则并添加新规则
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds.length > 0 ? existingIds : [UA_RULE_ID],
      addRules: [rule]
    });
  } catch (e) {
    console.error('应用 UA 伪装失败:', e);
  }
}

async function disableUserAgent() {
  await clearAllDynamicRules();
}

// User-Agent 拦截（使用 declarativeNetRequest）
async function setupUAInterception() {
  if (activeSettings.uaEnabled && activeSettings.customUA) {
    await applyUserAgent(activeSettings.customUA);
  } else {
    await disableUserAgent();
  }
}

// ==================== 代理设置 ====================
// 支持 HTTP/HTTPS/SOCKS4/SOCKS5 代理
// 支持代理认证（用户名/密码）

async function applyProxy(proxyConfig) {
  if (!proxyConfig || !proxyConfig.host) {
    await clearProxy();
    return { success: true, message: '代理已清除' };
  }
  
  try {
    const scheme = proxyConfig.scheme || 'http';
    const host = proxyConfig.host;
    const port = proxyConfig.port || 8080;
    const bypassList = proxyConfig.bypassList || ['localhost', '127.0.0.1', '<local>'];
    
    let config;
    
    // 根据代理类型构建配置
    if (scheme === 'socks4' || scheme === 'socks5') {
      // SOCKS 代理
      config = {
        mode: 'fixed_servers',
        rules: {
          singleProxy: {
            scheme: scheme,
            host: host,
            port: port
          },
          bypassList: bypassList
        }
      };
    } else {
      // HTTP/HTTPS 代理
      config = {
        mode: 'fixed_servers',
        rules: {
          singleProxy: {
            scheme: scheme,
            host: host,
            port: port
          },
          bypassList: bypassList
        }
      };
    }
    
    // 尝试设置代理（需要 proxy 权限）
    if (chrome.proxy && chrome.proxy.settings) {
      await chrome.proxy.settings.set({
        value: config,
        scope: 'regular'
      });
      
      // 如果有认证信息，设置认证处理
      if (proxyConfig.username && proxyConfig.password) {
        // 存储认证信息供 webRequest 使用
        await chrome.storage.local.set({
          proxyAuth: {
            host: host,
            port: port,
            username: proxyConfig.username,
            password: proxyConfig.password
          }
        });
      } else {
        await chrome.storage.local.remove('proxyAuth');
      }
      
      return { success: true, message: `代理已设置: ${scheme}://${host}:${port}` };
    } else {
      console.warn('代理 API 不可用，请检查权限');
      return { success: false, error: '代理 API 不可用' };
    }
  } catch (e) {
    console.error('应用代理失败:', e);
    return { success: false, error: e.message };
  }
}

async function clearProxy() {
  try {
    if (chrome.proxy && chrome.proxy.settings) {
      await chrome.proxy.settings.clear({ scope: 'regular' });
    }
    await chrome.storage.local.remove('proxyAuth');
    return { success: true };
  } catch (e) {
    console.error('清除代理失败:', e);
    return { success: false, error: e.message };
  }
}

// 代理认证处理（需要 webRequest 和 webRequestAuthProvider 权限）
// 注意：Manifest V3 中 webRequestBlocking 已被移除，认证需要其他方式处理
// 对于需要认证的代理，建议用户使用代理客户端软件

// 测试代理连接
async function testProxy(proxyConfig) {
  if (!proxyConfig || !proxyConfig.host) {
    return { success: false, error: '代理配置无效' };
  }
  
  try {
    // 先应用代理
    await applyProxy(proxyConfig);
    
    // 尝试请求一个测试 URL
    const testUrl = 'https://httpbin.org/ip';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
    
    const response = await fetch(testUrl, {
      signal: controller.signal,
      cache: 'no-store'
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      return { 
        success: true, 
        ip: data.origin,
        message: `代理可用，当前 IP: ${data.origin}`
      };
    } else {
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      return { success: false, error: '连接超时' };
    }
    return { success: false, error: e.message };
  }
}

// 获取当前 IP（用于验证代理是否生效）
async function getCurrentIP() {
  try {
    const response = await fetch('https://api.ipify.org?format=json', {
      cache: 'no-store'
    });
    if (response.ok) {
      const data = await response.json();
      return { success: true, ip: data.ip };
    }
    return { success: false, error: 'Failed to get IP' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 初始化右键菜单
async function initContextMenu() {
  try {
    // 先清除所有菜单，等待完成
    await chrome.contextMenus.removeAll();
    
    // 使用 Promise 包装 create 调用
    await new Promise((resolve) => {
      chrome.contextMenus.create({
        id: 'multi-account-root',
        title: '多账号管理助手',
        contexts: ['page']
      }, () => {
        if (chrome.runtime.lastError) {
          // 忽略重复 ID 错误
        }
        resolve();
      });
    });
    
    await new Promise((resolve) => {
      chrome.contextMenus.create({
        id: 'save-profile',
        parentId: 'multi-account-root',
        title: '💾 保存当前账号',
        contexts: ['page']
      }, () => {
        if (chrome.runtime.lastError) {}
        resolve();
      });
    });
    
    await new Promise((resolve) => {
      chrome.contextMenus.create({
        id: 'clear-cookies',
        parentId: 'multi-account-root',
        title: '🚪 退出登录',
        contexts: ['page']
      }, () => {
        if (chrome.runtime.lastError) {}
        resolve();
      });
    });
  } catch (e) {
    console.error('初始化右键菜单失败:', e);
  }
}

// ==================== Cookie 操作核心 ====================

// 提取主域名（如 www.bing.com -> bing.com）
function getMainDomain(hostname) {
  const parts = hostname.split('.');
  // 处理特殊情况：co.uk, com.cn 等
  const specialTLDs = ['co.uk', 'com.cn', 'com.hk', 'co.jp', 'com.tw', 'co.kr', 'com.au'];
  
  for (const tld of specialTLDs) {
    if (hostname.endsWith('.' + tld)) {
      const tldParts = tld.split('.').length;
      return parts.slice(-(tldParts + 1)).join('.');
    }
  }
  
  // 普通情况：取最后两段
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}

async function getCookiesForDomain(domain) {
  try {
    const mainDomain = getMainDomain(domain);
    const allCookies = [];
    const seen = new Set();
    
    // 使用更广泛的方式获取所有相关 Cookie
    // 方法1: 按主域名获取（包括所有子域名的 Cookie）
    const domainPatterns = [
      domain,                    // 当前完整域名 (rewards.bing.com)
      mainDomain,                // 主域名 (bing.com)
      '.' + mainDomain,          // 通配符域名 (.bing.com)
      'www.' + mainDomain,       // www 子域名
    ];
    
    // 如果当前域名有 www，也添加去掉 www 的版本
    if (domain.startsWith('www.')) {
      domainPatterns.push(domain.replace('www.', ''));
    }
    
    for (const d of domainPatterns) {
      try {
        const cookies = await chrome.cookies.getAll({ domain: d });
        for (const cookie of cookies) {
          const key = `${cookie.domain}|${cookie.name}|${cookie.path}`;
          if (!seen.has(key)) {
            seen.add(key);
            allCookies.push(cookie);
          }
        }
      } catch (e) {}
    }
    
    // 方法2: 使用 URL 方式获取（可能获取到更多 Cookie）
    for (const protocol of ['https', 'http']) {
      try {
        const cookies = await chrome.cookies.getAll({ url: `${protocol}://${domain}/` });
        for (const cookie of cookies) {
          const key = `${cookie.domain}|${cookie.name}|${cookie.path}`;
          if (!seen.has(key)) {
            seen.add(key);
            allCookies.push(cookie);
          }
        }
      } catch (e) {}
    }
    
    return allCookies;
  } catch (error) {
    console.error('获取 Cookie 失败:', error);
    return [];
  }
}

async function clearCookiesForDomain(domain) {
  try {
    const mainDomain = getMainDomain(domain);
    let count = 0;
    const deleted = new Set();
    
    // 获取所有浏览器 Cookie，过滤出相关的
    const allBrowserCookies = await chrome.cookies.getAll({});
    const allCookies = [];
    
    for (const cookie of allBrowserCookies) {
      const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
      const cookieMainDomain = getMainDomain(cookieDomain);
      
      if (cookieMainDomain === mainDomain) {
        allCookies.push(cookie);
      }
    }
    
    // 删除所有找到的 Cookie
    for (const cookie of allCookies) {
      const key = `${cookie.name}|${cookie.domain}|${cookie.path}`;
      if (deleted.has(key)) continue;
      
      const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
      const protocol = cookie.secure ? 'https' : 'http';
      const url = `${protocol}://${cookieDomain}${cookie.path || '/'}`;
      
      try {
        await chrome.cookies.remove({ url, name: cookie.name });
        deleted.add(key);
        count++;
      } catch (e) {
        try {
          await chrome.cookies.remove({ 
            url: `https://${cookieDomain}/`, 
            name: cookie.name 
          });
          deleted.add(key);
          count++;
        } catch (e2) {}
      }
    }
    
    return { success: true, count };
  } catch (error) {
    console.error('清除 Cookie 失败:', error);
    return { success: false, error: error.message };
  }
}

async function setCookies(cookies, targetDomain = null) {
  let successCount = 0;
  let failCount = 0;
  const now = Date.now() / 1000;
  const errors = [];
  
  for (const cookie of cookies) {
    try {
      // 跳过已过期的 Cookie
      if (cookie.expirationDate && cookie.expirationDate < now) {
        continue;
      }
      
      const originalDomain = cookie.domain;
      const domainForUrl = originalDomain.startsWith('.') ? originalDomain.slice(1) : originalDomain;
      
      // 根据 secure 属性决定协议
      const protocol = cookie.secure ? 'https' : 'http';
      const url = `${protocol}://${domainForUrl}${cookie.path || '/'}`;
      
      const cookieData = {
        url,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path || '/',
        secure: cookie.secure,
        httpOnly: cookie.httpOnly
      };
      
      // SameSite 处理
      if (cookie.sameSite === 'no_restriction') {
        cookieData.sameSite = 'no_restriction';
        cookieData.secure = true; // SameSite=None 必须是 Secure
      } else if (cookie.sameSite === 'strict') {
        cookieData.sameSite = 'strict';
      } else if (cookie.sameSite === 'lax') {
        cookieData.sameSite = 'lax';
      } else if (cookie.sameSite === 'unspecified' || !cookie.sameSite) {
        // 对于 unspecified，显式设置为 lax（Chrome 80+ 默认行为）
        cookieData.sameSite = 'lax';
      }
      
      // 设置 domain - 只有通配符域名才设置
      // 非通配符域名不设置 domain，让浏览器自动处理
      if (originalDomain.startsWith('.')) {
        cookieData.domain = originalDomain;
      }
      // 不设置 domain 时，Cookie 会被设置到 url 对应的精确域名
      
      // 设置过期时间
      if (cookie.expirationDate) {
        // 如果原始过期时间还有效，使用原始时间；否则延长
        const oneYearLater = now + (365 * 24 * 60 * 60);
        cookieData.expirationDate = Math.max(cookie.expirationDate, oneYearLater);
      } else if (!cookie.session) {
        // 非 session cookie 但没有过期时间，设置 1 年
        cookieData.expirationDate = now + (365 * 24 * 60 * 60);
      }
      // session cookie 不设置 expirationDate
      
      // 尝试设置 Cookie
      const result = await chrome.cookies.set(cookieData);
      
      if (result) {
        successCount++;
      } else {
        // 如果失败，尝试不带 domain 设置
        delete cookieData.domain;
        const retryResult = await chrome.cookies.set(cookieData);
        if (retryResult) {
          successCount++;
        } else {
          failCount++;
          errors.push({ name: cookie.name, domain: cookie.domain, error: 'set returned null' });
        }
      }
      
    } catch (error) {
      failCount++;
      errors.push({ name: cookie.name, domain: cookie.domain, error: error.message });
      
      // 尝试简化设置
      try {
        const simpleCookie = {
          url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path || '/'}`,
          name: cookie.name,
          value: cookie.value
        };
        const retryResult = await chrome.cookies.set(simpleCookie);
        if (retryResult) {
          successCount++;
          failCount--;
          errors.pop();
        }
      } catch (e) {
        // 简化设置也失败，保持原错误
      }
    }
  }
  
  if (errors.length > 0) {
    console.log('[setCookies] 失败的 Cookie:', errors.slice(0, 10));
  }
  
  console.log(`[setCookies] 完成: 成功 ${successCount}, 失败 ${failCount}, 总计 ${cookies.length}`);
  
  return { success: true, successCount, failCount, total: cookies.length };
}

// 验证 Cookie 是否设置成功
async function verifySetCookies(originalCookies, mainDomain) {
  const currentCookies = await getAllCookiesForMainDomain(mainDomain, mainDomain);
  
  const originalMap = new Map(originalCookies.map(c => [`${c.name}|${c.domain}`, c]));
  const currentMap = new Map(currentCookies.map(c => [`${c.name}|${c.domain}`, c]));
  
  const missing = [];
  const matched = [];
  const valueMismatch = [];
  
  for (const [key, original] of originalMap) {
    const current = currentMap.get(key);
    if (!current) {
      missing.push({ name: original.name, domain: original.domain });
    } else if (current.value !== original.value) {
      valueMismatch.push({ 
        name: original.name, 
        domain: original.domain,
        originalValue: original.value?.substring(0, 20) + '...',
        currentValue: current.value?.substring(0, 20) + '...'
      });
      matched.push(key);
    } else {
      matched.push(key);
    }
  }
  
  if (missing.length > 0) {
    console.log('[验证] 缺失的 Cookie:', missing);
  }
  if (valueMismatch.length > 0) {
    console.log('[验证] 值不匹配的 Cookie:', valueMismatch);
  }
  
  return {
    originalCount: originalCookies.length,
    currentCount: currentCookies.length,
    matchedCount: matched.length,
    missingCount: missing.length,
    missingCookies: missing,
    valueMismatch
  };
}


// ==================== Profile 管理 ====================

async function saveProfile(domain, profileName, color = '#4285F4', extraConfig = {}) {
  try {
    const mainDomain = getMainDomain(domain);
    
    // 获取整个主域名下的所有 Cookie（包括所有子域名）
    const cookies = await getAllCookiesForMainDomain(mainDomain, domain);
    
    if (cookies.length === 0) {
      return { success: false, error: '当前网站没有登录信息，请先登录后再保存' };
    }
    
    // 统计 Cookie 域名分布
    const domainStats = {};
    for (const cookie of cookies) {
      const d = cookie.domain;
      domainStats[d] = (domainStats[d] || 0) + 1;
    }
    
    // 尝试从 Cookie 中提取用户信息
    const userInfo = extractUserInfoFromCookies(cookies);
    
    // 尝试获取当前页面的 localStorage 和 sessionStorage 数据
    let localStorageData = null;
    let sessionStorageData = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        // 方案1：通过 content script 获取（ISOLATED world）
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['src/content/fingerprint.js']
          });
          await new Promise(r => setTimeout(r, 50));
          
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getAllStorage' });
          if (response && response.success) {
            localStorageData = response.localStorage;
            sessionStorageData = response.sessionStorage;
            console.log('[saveProfile] 方案1获取到存储数据 - localStorage:', response.localStorageCount, 'sessionStorage:', response.sessionStorageCount);
          }
        } catch (e) {
          console.log('[saveProfile] 方案1失败:', e.message);
        }
        
        // 方案2：如果方案1失败或数据为空，直接在 MAIN world 获取
        if (!localStorageData || Object.keys(localStorageData).length === 0) {
          console.log('[saveProfile] 尝试方案2：直接在 MAIN world 获取');
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              world: 'MAIN',
              func: () => {
                const localData = {};
                const sessionData = {};
                
                // 获取 localStorage
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  if (key) {
                    localData[key] = localStorage.getItem(key);
                  }
                }
                
                // 获取 sessionStorage
                for (let i = 0; i < sessionStorage.length; i++) {
                  const key = sessionStorage.key(i);
                  if (key && key !== '__fp_config__') {
                    sessionData[key] = sessionStorage.getItem(key);
                  }
                }
                
                return {
                  localStorage: localData,
                  sessionStorage: sessionData,
                  localStorageCount: Object.keys(localData).length,
                  sessionStorageCount: Object.keys(sessionData).length
                };
              }
            });
            
            if (results && results[0] && results[0].result) {
              const result = results[0].result;
              localStorageData = result.localStorage;
              sessionStorageData = result.sessionStorage;
              console.log('[saveProfile] 方案2获取到存储数据 - localStorage:', result.localStorageCount, 'sessionStorage:', result.sessionStorageCount);
              
              // 打印关键数据（用于调试）
              if (localStorageData && localStorageData.userToken) {
                console.log('[saveProfile] 发现 userToken (DeepSeek)');
              }
            }
          } catch (e) {
            console.log('[saveProfile] 方案2失败:', e.message);
          }
        }
      }
    } catch (e) {
      console.log('[saveProfile] 获取存储数据失败:', e.message);
    }
    
    // 打印最终获取到的数据
    if (localStorageData) {
      console.log('[saveProfile] 最终 localStorage keys:', Object.keys(localStorageData));
    }
    
    const data = await chrome.storage.local.get(['profiles']);
    const profiles = data.profiles || {};
    if (!profiles[mainDomain]) profiles[mainDomain] = {};
    
    const isUpdate = !!profiles[mainDomain][profileName];
    
    // 检测是否与已保存的其他账号重复（排除同名覆盖的情况）
    const duplicateCheck = checkDuplicateAccount(cookies, profiles[mainDomain], profileName);
    if (duplicateCheck.isDuplicate) {
      return {
        success: false,
        error: 'duplicate',
        duplicateName: duplicateCheck.existingName,
        message: `当前登录的账号已保存为「${duplicateCheck.existingName}」，无需重复保存。如需更新，请使用刷新功能。`
      };
    }
    
    const existingProfile = profiles[mainDomain][profileName] || {};
    
    // 如果账号没有指纹配置，自动生成一个
    let profileFingerprint = extraConfig.fingerprint || existingProfile.fingerprint;
    if (!profileFingerprint) {
      profileFingerprint = generateRandomFingerprint();
    }
    
    profiles[mainDomain][profileName] = {
      ...existingProfile,
      cookies, 
      savedAt: Date.now(), 
      cookieCount: cookies.length, 
      color,
      originalDomain: domain,
      userInfo,
      domainStats,
      // 保存 localStorage 和 sessionStorage 数据
      localStorage: localStorageData,
      sessionStorage: sessionStorageData,
      // 账号独立配置
      customUA: extraConfig.customUA || existingProfile.customUA || null,
      proxyConfig: extraConfig.proxyConfig || existingProfile.proxyConfig || null,
      fingerprint: profileFingerprint, // 使用自动生成或已有的指纹
      // 账号备注和标签
      note: extraConfig.note !== undefined ? extraConfig.note : (existingProfile.note || ''),
      tags: extraConfig.tags || existingProfile.tags || [],
    };
    
    await chrome.storage.local.set({ profiles });
    
    // 更新当前激活账号
    activeProfiles[mainDomain] = profileName;
    await chrome.storage.local.set({ activeProfiles });
    
    await updateContextMenuForDomain(domain);
    
    return { 
      success: true, 
      cookieCount: cookies.length, 
      isUpdate, 
      userInfo,
      domainStats,
      hasLocalStorage: !!localStorageData,
      hasSessionStorage: !!sessionStorageData
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 检测是否与已保存的账号重复
function checkDuplicateAccount(currentCookies, domainProfiles, excludeName) {
  if (!domainProfiles || Object.keys(domainProfiles).length === 0) {
    return { isDuplicate: false };
  }
  
  // 提取当前 Cookie 的身份特征
  const currentIdentity = extractIdentityFromCookies(currentCookies);
  if (!currentIdentity) {
    return { isDuplicate: false }; // 无法识别身份，允许保存
  }
  
  // 遍历已保存的账号，检查是否有相同身份
  for (const [name, profile] of Object.entries(domainProfiles)) {
    // 跳过同名的（这是覆盖更新的情况）
    if (name === excludeName) continue;
    
    if (!profile.cookies || profile.cookies.length === 0) continue;
    
    const savedIdentity = extractIdentityFromCookies(profile.cookies);
    if (!savedIdentity) continue;
    
    // 比较身份特征
    if (isSameIdentity(currentIdentity, savedIdentity)) {
      return { isDuplicate: true, existingName: name };
    }
  }
  
  return { isDuplicate: false };
}

// 从 Cookie 中提取身份特征
function extractIdentityFromCookies(cookies) {
  // 关键身份 Cookie（按优先级排序）
  // 只有高权重(>=8)的 Cookie 才用于身份识别，避免误判
  const identityCookies = [
    // ==================== AI 平台 ====================
    // DeepSeek - 使用用户特定的 Cookie
    { names: ['ds_user_id', 'user_id', 'userToken'], weight: 10, domain: 'deepseek' },
    // ChatGPT/OpenAI
    { names: ['__Secure-next-auth.session-token'], weight: 10, domain: 'openai' },
    // Claude
    { names: ['sessionKey'], weight: 10, domain: 'claude' },
    
    // ==================== 跨境电商平台 ====================
    // Amazon - 用户身份 Cookie
    { names: ['at-main', 'sess-at-main', 'x-main'], weight: 10, domain: 'amazon' },
    { names: ['session-id'], weight: 6, domain: 'amazon' }, // session-id 权重降低，因为可能变化
    // eBay
    { names: ['ebay', 's', 'nonsession'], weight: 10, domain: 'ebay' },
    // Shopee
    { names: ['SPC_U', 'SPC_EC'], weight: 10, domain: 'shopee' },
    // Lazada
    { names: ['lzd_cid', 't_uid'], weight: 10, domain: 'lazada' },
    // AliExpress
    { names: ['xman_us_f', 'aep_usuc_f'], weight: 10, domain: 'aliexpress' },
    // Etsy
    { names: ['user_prefs', 'uaid'], weight: 10, domain: 'etsy' },
    
    // ==================== 社交媒体平台 ====================
    // TikTok - 用户 ID Cookie
    { names: ['uid_tt', 'sid_tt'], weight: 10, domain: 'tiktok' },
    { names: ['sessionid'], weight: 8, domain: 'tiktok' },
    // Instagram
    { names: ['ds_user_id'], weight: 10, domain: 'instagram' },
    { names: ['sessionid'], weight: 8, domain: 'instagram' },
    // Facebook
    { names: ['c_user'], weight: 10, domain: 'facebook' },
    { names: ['xs', 'fr'], weight: 8, domain: 'facebook' },
    // Twitter/X
    { names: ['twid', 'auth_token'], weight: 10, domain: 'twitter' },
    // LinkedIn
    { names: ['li_at', 'liap'], weight: 10, domain: 'linkedin' },
    // Pinterest
    { names: ['_pinterest_sess', '_auth'], weight: 10, domain: 'pinterest' },
    // Reddit
    { names: ['reddit_session', 'token_v2'], weight: 10, domain: 'reddit' },
    // Discord
    { names: ['__dcfduid', '__sdcfduid'], weight: 8, domain: 'discord' },
    
    // ==================== 微软/Google ====================
    // 微软 - 用户身份 Cookie
    { names: ['WLID', 'ANON'], weight: 10, domain: 'microsoft' },
    { names: ['_U'], weight: 8, domain: 'bing' },
    // Google - 用户身份 Cookie
    { names: ['SID', 'HSID', 'SSID'], weight: 10, domain: 'google' },
    { names: ['APISID', 'SAPISID'], weight: 9, domain: 'google' },
    
    // ==================== 中国电商/社交 ====================
    // 淘宝/天猫
    { names: ['unb', '_tb_token_'], weight: 10, domain: 'taobao' },
    // 京东
    { names: ['pt_pin', 'pt_key'], weight: 10, domain: 'jd' },
    // 拼多多
    { names: ['PDDAccessToken', 'pdd_user_id'], weight: 10, domain: 'pinduoduo' },
    // 微博
    { names: ['SUB', 'SUBP'], weight: 10, domain: 'weibo' },
    // 抖音
    { names: ['passport_csrf_token', 'ttwid'], weight: 10, domain: 'douyin' },
    // B站
    { names: ['DedeUserID', 'SESSDATA'], weight: 10, domain: 'bilibili' },
    // 小红书
    { names: ['customerClientId'], weight: 10, domain: 'xiaohongshu' },
    // 知乎
    { names: ['z_c0'], weight: 10, domain: 'zhihu' },
    
    // ==================== 通用（权重较低，仅作为辅助） ====================
    // 注意：通用 Cookie 权重必须低，避免误判不同账号
    { names: ['user_id', 'userid', 'uid'], weight: 6 },
    { names: ['auth_token', 'access_token'], weight: 5 },
    { names: ['login', 'logged_in'], weight: 3 }
    // 移除 session_id、session、token 等通用名称，因为这些经常变化且不代表用户身份
  ];
  
  const identity = {};
  const hostname = ''; // 这里无法获取 hostname，需要从 Cookie domain 推断
  
  for (const { names, weight, domain } of identityCookies) {
    for (const cookieName of names) {
      const cookie = cookies.find(c => {
        const nameMatch = c.name.toLowerCase() === cookieName.toLowerCase();
        // 如果指定了 domain，检查 Cookie 域名是否匹配
        if (domain && nameMatch) {
          const cookieDomain = c.domain.toLowerCase();
          return cookieDomain.includes(domain);
        }
        return nameMatch;
      });
      
      if (cookie && cookie.value && cookie.value.length > 5) {
        // 取值的前 32 个字符作为特征（避免过长）
        identity[cookieName] = {
          value: cookie.value.substring(0, 32),
          weight,
          domain: cookie.domain
        };
      }
    }
  }
  
  // 至少要有一个高权重(>=8)的身份特征才认为可以识别
  const hasHighWeightIdentity = Object.values(identity).some(i => i.weight >= 8);
  if (!hasHighWeightIdentity) {
    return null; // 没有可靠的身份标识，不进行重复检测
  }
  
  return identity;
}

// 比较两个身份是否相同
function isSameIdentity(identity1, identity2) {
  let matchScore = 0;
  let totalWeight = 0;
  let highWeightMatches = 0; // 高权重 Cookie 匹配数
  
  // 找出共同的 Cookie 名称
  const commonKeys = Object.keys(identity1).filter(k => identity2[k]);
  
  if (commonKeys.length === 0) {
    return false; // 没有共同的身份 Cookie，无法判断
  }
  
  for (const key of commonKeys) {
    const weight = identity1[key].weight;
    totalWeight += weight;
    
    if (identity1[key].value === identity2[key].value) {
      matchScore += weight;
      if (weight >= 8) {
        highWeightMatches++;
      }
    }
  }
  
  // 必须至少有一个高权重 Cookie 完全匹配，且匹配分数超过 80%
  // 这样可以避免仅靠低权重 Cookie 误判
  const matchRatio = totalWeight > 0 ? (matchScore / totalWeight) : 0;
  return highWeightMatches >= 1 && matchRatio >= 0.8;
}

// 获取主域名下所有子域名的 Cookie
async function getAllCookiesForMainDomain(mainDomain, currentDomain) {
  const allCookies = [];
  const seen = new Set();
  
  // 获取所有浏览器 Cookie，过滤出属于该主域名的
  // 这是最可靠的方式，能获取所有子域名的 Cookie
  try {
    const allBrowserCookies = await chrome.cookies.getAll({});
    for (const cookie of allBrowserCookies) {
      const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
      const cookieMainDomain = getMainDomain(cookieDomain);
      
      if (cookieMainDomain === mainDomain) {
        const key = `${cookie.domain}|${cookie.name}|${cookie.path}`;
        if (!seen.has(key)) {
          seen.add(key);
          allCookies.push(cookie);
        }
      }
    }
  } catch (e) {
    console.error('获取 Cookie 失败:', e);
  }
  
  return allCookies;
}

// 从 Cookie 中提取用户信息（邮箱、用户名等）
function extractUserInfoFromCookies(cookies) {
  const result = {
    email: null,
    username: null,
    userId: null,
    displayName: null
  };
  
  // 邮箱正则（更宽松，支持更多格式）
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  
  // URL 解码
  const tryDecodeURI = (str) => {
    try {
      return decodeURIComponent(str);
    } catch (e) {
      return str;
    }
  };
  
  // Base64 解码尝试
  const tryDecodeBase64 = (str) => {
    try {
      // 检查是否像 Base64
      if (!/^[A-Za-z0-9+/=]+$/.test(str) || str.length < 4) return null;
      const decoded = atob(str);
      // 检查解码结果是否是可读文本
      if (/^[\x20-\x7E]+$/.test(decoded)) {
        return decoded;
      }
      return null;
    } catch (e) {
      return null;
    }
  };
  
  // 尝试从字符串中提取邮箱
  const extractEmail = (str) => {
    const match = str.match(emailRegex);
    return match ? match[0] : null;
  };
  
  // 尝试解析 JSON
  const tryParseJSON = (str) => {
    try {
      if (str.startsWith('{') || str.startsWith('[') || str.startsWith('%7B') || str.startsWith('%5B')) {
        return JSON.parse(tryDecodeURI(str));
      }
      return null;
    } catch (e) {
      return null;
    }
  };
  
  // 递归从对象中提取用户信息
  const extractFromObject = (obj, depth = 0) => {
    if (depth > 3 || !obj || typeof obj !== 'object') return;
    
    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase();
      
      if (typeof value === 'string') {
        // 检查邮箱字段
        if (!result.email && (keyLower.includes('email') || keyLower.includes('mail'))) {
          const email = extractEmail(value);
          if (email) result.email = email;
        }
        // 检查用户名字段
        if (!result.username && (keyLower === 'username' || keyLower === 'user' || keyLower === 'name' || keyLower === 'nick' || keyLower === 'nickname' || keyLower === 'login' || keyLower === 'account')) {
          if (value.length >= 2 && value.length <= 50 && !/^[0-9a-f-]{20,}$/i.test(value)) {
            result.username = value;
          }
        }
        // 检查显示名称
        if (!result.displayName && (keyLower === 'displayname' || keyLower === 'display_name' || keyLower === 'fullname' || keyLower === 'full_name')) {
          result.displayName = value;
        }
      } else if (typeof value === 'object') {
        extractFromObject(value, depth + 1);
      }
    }
  };
  
  // 高优先级 Cookie 名称
  const highPriorityCookies = [
    // 通用
    'email', 'user_email', 'login_email', 'userEmail', 'user-email',
    'username', 'user_name', 'userName', 'user-name', 'login', 'account',
    'nickname', 'nick', 'displayName', 'display_name',
    // 微软相关
    'WLID', 'ANON', 'PPAuth', 'MSPAuth', 'MUID',
    // Google 相关
    'LSID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'NID',
    // Amazon
    'session-id', 'ubid-main', 'x-main', 'at-main',
    // eBay
    'ebay', 's', 'nonsession',
    // Shopee
    'SPC_U', 'SPC_EC',
    // Lazada
    'lzd_cid', 't_uid',
    // AliExpress
    'xman_us_f', 'aep_usuc_f',
    // TikTok
    'sessionid', 'sid_tt', 'uid_tt',
    // Instagram
    'ds_user_id',
    // Facebook
    'c_user', 'xs',
    // Twitter
    'auth_token', 'twid',
    // LinkedIn
    'li_at',
    // 淘宝
    '_tb_token_', 'unb',
    // 京东
    'pt_key', 'pt_pin',
    // 微博
    'SUB', 'SUBP',
    // B站
    'SESSDATA', 'DedeUserID',
    // 其他常见
    'user', 'member', 'profile', 'auth', 'session', 'token'
  ];
  
  // 第一轮：检查高优先级 Cookie
  for (const cookie of cookies) {
    const name = cookie.name;
    const nameLower = name.toLowerCase();
    let value = tryDecodeURI(cookie.value);
    
    if (!value || value.length < 2) continue;
    
    // 直接检查值是否包含邮箱
    if (!result.email) {
      const email = extractEmail(value);
      if (email) {
        result.email = email;
        continue;
      }
    }
    
    // 尝试 Base64 解码后检查
    const decoded = tryDecodeBase64(value);
    if (decoded && !result.email) {
      const email = extractEmail(decoded);
      if (email) {
        result.email = email;
        continue;
      }
    }
    
    // 尝试 JSON 解析
    const json = tryParseJSON(value);
    if (json) {
      extractFromObject(json);
      if (result.email) continue;
    }
    
    // 检查 Cookie 名称是否暗示用户信息
    if (nameLower.includes('email') || nameLower.includes('mail')) {
      const email = extractEmail(value);
      if (email) {
        result.email = email;
        continue;
      }
    }
    
    if (!result.username && (nameLower.includes('user') || nameLower.includes('name') || nameLower.includes('nick') || nameLower.includes('login') || nameLower.includes('account'))) {
      // 过滤掉明显不是用户名的值（太长、像 hash、像 token）
      if (value.length >= 2 && value.length <= 30 && 
          !/^[0-9a-f-]{20,}$/i.test(value) && 
          !/^[A-Za-z0-9+/=]{30,}$/.test(value) &&
          !/^ey[A-Za-z0-9]/.test(value)) { // 排除 JWT
        result.username = value;
      }
    }
  }
  
  // 第二轮：尝试从所有 Cookie 值中提取（更激进）
  if (!result.email && !result.username) {
    for (const cookie of cookies) {
      let value = tryDecodeURI(cookie.value);
      if (!value || value.length < 5 || value.length > 500) continue;
      
      // 尝试各种分隔符拆分
      const parts = value.split(/[|,;:&=]/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (!result.email) {
          const email = extractEmail(trimmed);
          if (email) {
            result.email = email;
            break;
          }
        }
      }
      if (result.email) break;
    }
  }
  
  // 生成显示名称
  if (result.email) {
    // 从邮箱提取用户名部分作为显示名
    result.displayName = result.email;
  } else if (result.displayName) {
    // 已有显示名
  } else if (result.username) {
    result.displayName = result.username;
  } else if (result.userId && result.userId.length <= 20) {
    result.displayName = `ID: ${result.userId}`;
  }
  
  return result;
}

async function loadProfile(domain, profileName) {
  try {
    const mainDomain = getMainDomain(domain);
    console.log('[loadProfile] ========== 开始加载账号 ==========');
    console.log('[loadProfile] 步骤1: 域名:', domain, '主域名:', mainDomain, '账号:', profileName);
    
    const data = await chrome.storage.local.get(['profiles']);
    const profiles = data.profiles || {};
    
    if (!profiles[mainDomain] || !profiles[mainDomain][profileName]) {
      console.log('[loadProfile] 错误: Profile 不存在');
      return { success: false, error: 'Profile 不存在' };
    }
    
    const profile = profiles[mainDomain][profileName];
    console.log('[loadProfile] 步骤2: 账号数据 - Cookie:', profile.cookies?.length, 'localStorage:', profile.localStorage ? Object.keys(profile.localStorage).length : 0);
    
    // 第一步：彻底清除所有相关 Cookie
    console.log('[loadProfile] 步骤3: 清除现有 Cookie...');
    const clearResult = await clearCookiesForDomain(mainDomain);
    console.log('[loadProfile] 清除结果:', clearResult);
    
    // 等待清除完成
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 第二步：设置新账号的 Cookie
    console.log('[loadProfile] 步骤4: 设置新 Cookie...');
    const result = await setCookies(profile.cookies, mainDomain);
    console.log('[loadProfile] 设置结果:', result);
    
    // 验证 Cookie 是否设置成功
    const verifyResult = await verifySetCookies(profile.cookies, mainDomain);
    console.log('[loadProfile] 步骤5: Cookie 验证:', verifyResult);
    
    // 等待设置完成
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await recordRecentUsage(mainDomain, profileName);
    
    // 应用账号独立的 UA 设置
    if (profile.customUA) {
      await applyUserAgent(profile.customUA);
    } else if (activeSettings.uaEnabled && activeSettings.customUA) {
      await applyUserAgent(activeSettings.customUA);
    }
    
    // 应用账号独立的代理设置
    if (profile.proxyConfig) {
      await applyProxy(profile.proxyConfig);
    } else if (activeSettings.proxyEnabled && activeSettings.proxyConfig) {
      await applyProxy(activeSettings.proxyConfig);
    }
    
    // 保存当前域名的指纹配置（按账号存储）
    if (profile.fingerprint) {
      await saveActiveFingerprint(mainDomain, profile.fingerprint, profileName);
    } else {
      // 如果账号没有指纹，生成一个并保存到账号
      const newFingerprint = generateRandomFingerprint();
      profile.fingerprint = newFingerprint;
      
      // 更新账号的指纹配置
      const profileData = await chrome.storage.local.get(['profiles']);
      const profiles = profileData.profiles || {};
      if (profiles[mainDomain] && profiles[mainDomain][profileName]) {
        profiles[mainDomain][profileName].fingerprint = newFingerprint;
        await chrome.storage.local.set({ profiles });
      }
      
      await saveActiveFingerprint(mainDomain, newFingerprint, profileName);
    }
    
    // 如果启用了关闭相关标签，关闭该域名的其他标签
    if (activeSettings.closeRelatedTabs) {
      await closeRelatedTabs(mainDomain);
    }
    
    // 收集需要刷新的相关标签页
    const relatedTabIds = await getRelatedTabIds(mainDomain);
    console.log('[loadProfile] 步骤6: 相关标签页:', relatedTabIds);
    
    // 恢复 localStorage 和 sessionStorage 数据（如果有保存的话）
    const hasStorageData = (profile.localStorage && Object.keys(profile.localStorage).length > 0) ||
                           (profile.sessionStorage && Object.keys(profile.sessionStorage).length > 0);
    
    if (hasStorageData) {
      const localCount = profile.localStorage ? Object.keys(profile.localStorage).length : 0;
      const sessionCount = profile.sessionStorage ? Object.keys(profile.sessionStorage).length : 0;
      console.log('[loadProfile] 步骤7: 准备存储数据 - localStorage:', localCount, 'sessionStorage:', sessionCount);
      
      // 打印 localStorage 的 key（用于调试）
      if (profile.localStorage) {
        console.log('[loadProfile] localStorage keys:', Object.keys(profile.localStorage));
        if (profile.localStorage.userToken) {
          console.log('[loadProfile] ✓ 包含 userToken，长度:', profile.localStorage.userToken.length);
        }
      }
      
      // 将存储数据保存到 storage.session，供 document_start 脚本读取
      await chrome.storage.session.set({
        [`pending_restore_${mainDomain}`]: {
          localStorage: profile.localStorage,
          sessionStorage: profile.sessionStorage,
          domain: mainDomain,
          profileName: profileName,
          timestamp: Date.now()
        }
      });
      console.log('[loadProfile] 步骤8: 已保存到 chrome.storage.session');
      
      // 同时保存到内存变量作为备用
      for (const tabId of relatedTabIds) {
        pendingStorageRestore[tabId] = {
          localStorage: profile.localStorage,
          sessionStorage: profile.sessionStorage,
          domain: mainDomain,
          profileName: profileName,
          timestamp: Date.now()
        };
      }
      console.log('[loadProfile] 步骤9: 已保存到内存变量 pendingStorageRestore');
    } else if (activeSettings.clearStorageOnSwitch !== false) {
      console.log('[loadProfile] 步骤7: 无存储数据，标记需要清除');
      // 如果没有保存的 localStorage，标记需要清除
      await chrome.storage.session.set({
        [`pending_restore_${mainDomain}`]: {
          clearOnly: true,
          domain: mainDomain,
          timestamp: Date.now()
        }
      });
      
      for (const tabId of relatedTabIds) {
        pendingStorageRestore[tabId] = {
          clearOnly: true,
          domain: mainDomain,
          timestamp: Date.now()
        };
      }
    }
    
    // 记录当前激活的账号
    activeProfiles[mainDomain] = profileName;
    await chrome.storage.local.set({ activeProfiles });
    
    console.log('[loadProfile] ========== 加载完成 ==========');
    
    return { 
      success: true, 
      ...result, 
      autoRefresh: activeSettings.autoRefresh,
      relatedTabIds,
      hasStorageData,
      profileConfig: {
        customUA: profile.customUA,
        proxyConfig: profile.proxyConfig,
        fingerprint: profile.fingerprint
      }
    };
  } catch (error) {
    console.error('[loadProfile] 错误:', error);
    return { success: false, error: error.message };
  }
}

// 获取所有相关域名的标签页 ID
async function getRelatedTabIds(mainDomain) {
  try {
    const tabs = await chrome.tabs.query({});
    const relatedIds = [];
    
    for (const tab of tabs) {
      if (!tab.url || tab.url.startsWith('chrome')) continue;
      
      try {
        const url = new URL(tab.url);
        const tabMainDomain = getMainDomain(url.hostname);
        
        if (tabMainDomain === mainDomain) {
          relatedIds.push(tab.id);
        }
      } catch (e) {}
    }
    
    return relatedIds;
  } catch (error) {
    console.error('获取相关标签失败:', error);
    return [];
  }
}

// 关闭相关标签页
async function closeRelatedTabs(mainDomain) {
  try {
    const tabs = await chrome.tabs.query({});
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    for (const tab of tabs) {
      if (tab.id === activeTab?.id) continue; // 不关闭当前标签
      
      try {
        if (!tab.url) continue;
        const url = new URL(tab.url);
        const tabMainDomain = getMainDomain(url.hostname);
        
        if (tabMainDomain === mainDomain) {
          await chrome.tabs.remove(tab.id);
        }
      } catch (e) {}
    }
  } catch (error) {
    console.error('关闭相关标签失败:', error);
  }
}

async function recordRecentUsage(mainDomain, profileName) {
  try {
    const data = await chrome.storage.local.get(['recentUsage', 'profiles']);
    let recentUsage = data.recentUsage || [];
    
    recentUsage = recentUsage.filter(r => !(r.domain === mainDomain && r.profileName === profileName));
    recentUsage.unshift({ domain: mainDomain, profileName, usedAt: Date.now() });
    recentUsage = recentUsage.slice(0, 10);
    
    const profiles = data.profiles || {};
    if (profiles[mainDomain] && profiles[mainDomain][profileName]) {
      profiles[mainDomain][profileName].lastUsedAt = Date.now();
      profiles[mainDomain][profileName].useCount = (profiles[mainDomain][profileName].useCount || 0) + 1;
    }
    
    await chrome.storage.local.set({ recentUsage, profiles });
  } catch (error) {
    console.error('记录最近使用失败:', error);
  }
}

async function getRecentUsage() {
  try {
    const data = await chrome.storage.local.get(['recentUsage', 'profiles']);
    const recentUsage = data.recentUsage || [];
    const profiles = data.profiles || {};
    
    const validRecent = recentUsage
      .filter(r => profiles[r.domain] && profiles[r.domain][r.profileName])
      .map(r => ({
        ...r,
        color: profiles[r.domain][r.profileName].color || '#4285F4',
        cookieCount: profiles[r.domain][r.profileName].cookieCount
      }));
    
    return { success: true, recentUsage: validRecent };
  } catch (error) {
    return { success: false, recentUsage: [], error: error.message };
  }
}

async function deleteProfile(domain, profileName) {
  try {
    const mainDomain = getMainDomain(domain);
    const data = await chrome.storage.local.get(['profiles']);
    const profiles = data.profiles || {};
    
    if (profiles[mainDomain] && profiles[mainDomain][profileName]) {
      delete profiles[mainDomain][profileName];
      if (Object.keys(profiles[mainDomain]).length === 0) delete profiles[mainDomain];
      await chrome.storage.local.set({ profiles });
    }
    
    await updateContextMenuForDomain(domain);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function deleteMultipleProfiles(domain, profileNames) {
  try {
    const mainDomain = getMainDomain(domain);
    const data = await chrome.storage.local.get(['profiles']);
    const profiles = data.profiles || {};
    if (!profiles[mainDomain]) return { success: false, error: '域名不存在' };
    
    let deletedCount = 0;
    for (const name of profileNames) {
      if (profiles[mainDomain][name]) {
        delete profiles[mainDomain][name];
        deletedCount++;
      }
    }
    
    if (Object.keys(profiles[mainDomain]).length === 0) delete profiles[mainDomain];
    await chrome.storage.local.set({ profiles });
    await updateContextMenuForDomain(domain);
    return { success: true, deletedCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getProfiles(domain) {
  try {
    const mainDomain = getMainDomain(domain);
    const data = await chrome.storage.local.get(['profiles', 'groups']);
    const profiles = data.profiles || {};
    const groups = data.groups || [];
    const domainProfiles = profiles[mainDomain] || {};
    
    return {
      success: true,
      mainDomain,
      profiles: Object.entries(domainProfiles).map(([name, d]) => ({
        name, 
        savedAt: d.savedAt, 
        cookieCount: d.cookieCount,
        color: d.color || '#4285F4', 
        groupId: d.groupId || null,
        lastUsedAt: d.lastUsedAt || null, 
        useCount: d.useCount || 0,
        note: d.note || '', 
        originalDomain: d.originalDomain || '',
        userInfo: d.userInfo || null,
        // 账号独立配置
        customUA: d.customUA || null,
        proxyConfig: d.proxyConfig || null,
        fingerprint: d.fingerprint || null,
        tags: d.tags || [],
        // 账号健康状态（Cookie 是否可能过期）
        healthStatus: checkProfileHealth(d)
      })),
      groups
    };
  } catch (error) {
    return { success: false, profiles: [], groups: [], error: error.message };
  }
}

// 检查账号健康状态
function checkProfileHealth(profile) {
  if (!profile.cookies || profile.cookies.length === 0) {
    return { status: 'warning', message: '无 Cookie 数据' };
  }
  
  const now = Date.now() / 1000;
  const expiredCount = profile.cookies.filter(c => c.expirationDate && c.expirationDate < now).length;
  const totalCount = profile.cookies.length;
  
  // 检查保存时间
  const daysSinceSaved = (Date.now() - profile.savedAt) / (1000 * 60 * 60 * 24);
  
  // 检查最后使用时间
  const daysSinceUsed = profile.lastUsedAt 
    ? (Date.now() - profile.lastUsedAt) / (1000 * 60 * 60 * 24)
    : daysSinceSaved;
  
  if (expiredCount > totalCount * 0.5) {
    return { status: 'error', message: '大部分 Cookie 已过期，建议重新登录并保存' };
  }
  
  // 超过 60 天未使用，可能需要重新登录
  if (daysSinceUsed > 60) {
    return { status: 'warning', message: `${Math.floor(daysSinceUsed)} 天未使用，可能需要重新登录` };
  }
  
  // 超过 90 天未保存
  if (daysSinceSaved > 90) {
    return { status: 'warning', message: '保存超过90天，建议重新保存' };
  }
  
  if (expiredCount > 0) {
    return { status: 'warning', message: `${expiredCount} 个 Cookie 已过期` };
  }
  
  return { status: 'ok', message: '状态正常' };
}

async function getAllProfileStats() {
  try {
    const data = await chrome.storage.local.get(['profiles']);
    const profiles = data.profiles || {};
    const stats = Object.entries(profiles).map(([domain, domainProfiles]) => ({
      domain, profileCount: Object.keys(domainProfiles).length,
      profiles: Object.keys(domainProfiles)
    }));
    return { success: true, stats };
  } catch (error) {
    return { success: false, stats: [], error: error.message };
  }
}

async function renameProfile(domain, oldName, newName) {
  try {
    const mainDomain = getMainDomain(domain);
    const data = await chrome.storage.local.get(['profiles']);
    const profiles = data.profiles || {};
    
    if (!profiles[mainDomain] || !profiles[mainDomain][oldName]) return { success: false, error: 'Profile 不存在' };
    if (profiles[mainDomain][newName]) return { success: false, error: '新名称已存在' };
    
    profiles[mainDomain][newName] = profiles[mainDomain][oldName];
    delete profiles[mainDomain][oldName];
    await chrome.storage.local.set({ profiles });
    await updateContextMenuForDomain(domain);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function updateProfileColor(domain, profileName, color) {
  try {
    const mainDomain = getMainDomain(domain);
    const data = await chrome.storage.local.get(['profiles']);
    const profiles = data.profiles || {};
    if (!profiles[mainDomain] || !profiles[mainDomain][profileName]) return { success: false, error: 'Profile 不存在' };
    profiles[mainDomain][profileName].color = color;
    await chrome.storage.local.set({ profiles });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function updateProfileGroup(domain, profileName, groupId) {
  try {
    const mainDomain = getMainDomain(domain);
    const data = await chrome.storage.local.get(['profiles']);
    const profiles = data.profiles || {};
    if (!profiles[mainDomain] || !profiles[mainDomain][profileName]) return { success: false, error: 'Profile 不存在' };
    profiles[mainDomain][profileName].groupId = groupId;
    await chrome.storage.local.set({ profiles });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function updateProfileNote(domain, profileName, note) {
  try {
    const mainDomain = getMainDomain(domain);
    const data = await chrome.storage.local.get(['profiles']);
    const profiles = data.profiles || {};
    if (!profiles[mainDomain] || !profiles[mainDomain][profileName]) return { success: false, error: 'Profile 不存在' };
    profiles[mainDomain][profileName].note = note;
    await chrome.storage.local.set({ profiles });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}


// ==================== 动态右键菜单 ====================

async function updateContextMenuForDomain(domain) {
  try {
    const mainDomain = getMainDomain(domain);
    await chrome.contextMenus.removeAll();
    
    // 等待一小段时间确保清除完成
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const createMenuItem = (options) => {
      return new Promise((resolve) => {
        chrome.contextMenus.create(options, () => {
          if (chrome.runtime.lastError) {
            // 忽略错误
          }
          resolve();
        });
      });
    };
    
    await createMenuItem({
      id: 'multi-account-root',
      title: '多账号管理助手',
      contexts: ['page']
    });
    
    await createMenuItem({
      id: 'save-profile',
      parentId: 'multi-account-root',
      title: '💾 保存当前账号',
      contexts: ['page']
    });
    
    await createMenuItem({
      id: 'clear-cookies',
      parentId: 'multi-account-root',
      title: '🚪 退出登录',
      contexts: ['page']
    });
    
    const result = await getProfiles(domain);
    if (result.success && result.profiles.length > 0) {
      await createMenuItem({
        id: 'separator',
        parentId: 'multi-account-root',
        type: 'separator',
        contexts: ['page']
      });
      
      const profilesToShow = result.profiles.slice(0, 9);
      for (let index = 0; index < profilesToShow.length; index++) {
        const profile = profilesToShow[index];
        await createMenuItem({
          id: `switch-${mainDomain}-${profile.name}`,
          parentId: 'multi-account-root',
          title: `${index + 1}. 切换到「${profile.name}」`,
          contexts: ['page']
        });
      }
    }
  } catch (error) {
    console.error('更新右键菜单失败:', error);
  }
}

// 监听标签页激活
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && !tab.url.startsWith('chrome')) {
      const url = new URL(tab.url);
      await updateContextMenuForDomain(url.hostname);
    }
  } catch (e) {}
});

// 监听标签页 URL 变化
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome')) {
    try {
      const url = new URL(tab.url);
      await updateContextMenuForDomain(url.hostname);
      
      // 自动规则检查
      await checkAutoRules(tabId, url);
      
      // 注意：存储恢复已移至 webNavigation.onDOMContentLoaded 中处理
      // 这里只做备用检查，如果 onDOMContentLoaded 没有清除 pendingStorageRestore，说明恢复失败
      const pendingData = pendingStorageRestore[tabId];
      if (pendingData) {
        const mainDomain = getMainDomain(url.hostname);
        if (mainDomain === pendingData.domain && Date.now() - pendingData.timestamp < 10000) {
          // onDOMContentLoaded 应该已经处理了，这里作为备用方案
          console.log('[恢复存储-备用] 页面加载完成，尝试备用恢复 (tab:', tabId, ')');
          
          try {
            if (pendingData.clearOnly) {
              await chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                func: () => { localStorage.clear(); sessionStorage.clear(); }
              });
            } else if (pendingData.localStorage || pendingData.sessionStorage) {
              await chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                args: [pendingData.localStorage, pendingData.sessionStorage],
                func: (localData, sessionData) => {
                  if (localData) {
                    localStorage.clear();
                    for (const [k, v] of Object.entries(localData)) {
                      if (v != null) localStorage.setItem(k, v);
                    }
                  }
                  if (sessionData) {
                    const fp = sessionStorage.getItem('__fp_config__');
                    sessionStorage.clear();
                    if (fp) sessionStorage.setItem('__fp_config__', fp);
                    for (const [k, v] of Object.entries(sessionData)) {
                      if (k !== '__fp_config__' && v != null) sessionStorage.setItem(k, v);
                    }
                  }
                }
              });
              console.log('[恢复存储-备用] ✓ 备用恢复完成');
            }
          } catch (e) {
            console.log('[恢复存储-备用] 备用恢复失败:', e.message);
          }
        }
        // 清除待恢复数据
        delete pendingStorageRestore[tabId];
      }
    } catch (e) {
      console.error('[tabs.onUpdated] 错误:', e);
    }
  }
});

// ==================== 指纹脚本动态注入 ====================

// 监听页面导航，在页面加载时注入指纹脚本和恢复存储数据
// onCommitted 是最早可以注入脚本的时机，在页面 JavaScript 执行之前
chrome.webNavigation.onCommitted.addListener(async (details) => {
  // 只处理主框架
  if (details.frameId !== 0) return;
  if (details.url.startsWith('chrome') || details.url.startsWith('about:') || details.url.startsWith('edge:')) {
    return;
  }
  
  const tabId = details.tabId;
  
  try {
    const url = new URL(details.url);
    const mainDomain = getMainDomain(url.hostname);
    
    // 1. 首先检查是否有待恢复的存储数据
    const pendingData = pendingStorageRestore[tabId];
    
    console.log('[onCommitted] ========== 页面导航 ==========');
    console.log('[onCommitted] tabId:', tabId, 'url:', details.url);
    console.log('[onCommitted] mainDomain:', mainDomain);
    console.log('[onCommitted] pendingData:', pendingData ? {
      domain: pendingData.domain,
      preRestored: pendingData.preRestored,
      processedAt: pendingData.processedAt,
      clearOnly: pendingData.clearOnly,
      hasLocalStorage: !!pendingData.localStorage,
      localStorageCount: pendingData.localStorage ? Object.keys(pendingData.localStorage).length : 0
    } : 'null');
    
    if (pendingData && mainDomain === pendingData.domain && Date.now() - pendingData.timestamp < 10000) {
      // 检查是否已经被 preRestoreStorage 处理过
      if (pendingData.preRestored || pendingData.processedAt) {
        console.log('[onCommitted] ✓ preRestoreStorage 已处理，只验证不恢复');
        
        // 验证 localStorage 是否正确设置
        try {
          const verifyResults = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            injectImmediately: true,
            func: () => {
              const userToken = localStorage.getItem('userToken');
              const marker = localStorage.getItem('__pending_restore_marker__');
              // 清除标记
              if (marker) localStorage.removeItem('__pending_restore_marker__');
              console.log('[onCommitted-inject] 验证 localStorage - userToken:', userToken ? '存在' : '不存在', 'marker:', marker ? '存在' : '不存在');
              return {
                hasUserToken: userToken !== null,
                userTokenLength: userToken ? userToken.length : 0,
                totalKeys: Object.keys(localStorage).length,
                hadMarker: marker !== null,
                allKeys: Object.keys(localStorage)
              };
            }
          });
          
          if (verifyResults && verifyResults[0] && verifyResults[0].result) {
            console.log('[onCommitted] localStorage 验证结果:', verifyResults[0].result);
          }
        } catch (e) {
          console.log('[onCommitted] 验证失败:', e.message);
        }
        
        // 清理内存变量
        delete pendingStorageRestore[tabId];
        console.log('[onCommitted] 已清理 pendingStorageRestore[', tabId, ']');
      } else {
        // preRestoreStorage 没有处理，检查 session storage
        const sessionData = await chrome.storage.session.get([`pending_restore_${mainDomain}`]);
        const sessionPending = sessionData[`pending_restore_${mainDomain}`];
        
        console.log('[onCommitted] session storage 数据:', sessionPending ? '存在' : '不存在');
        
        if (!sessionPending) {
          // session storage 已被清除，说明 preRestoreStorage 处理了但没有标记内存变量
          console.log('[onCommitted] session storage 已清除，跳过恢复');
          delete pendingStorageRestore[tabId];
        } else {
          // preRestoreStorage 没有处理，我们来处理
          console.log('[onCommitted] ========== 开始恢复存储 ==========');
          
          try {
            if (pendingData.clearOnly) {
              console.log('[onCommitted] clearOnly 模式，清除存储');
              await chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                injectImmediately: true,
                func: () => { 
                  try { 
                    localStorage.clear(); 
                    sessionStorage.clear(); 
                    console.log('[onCommitted-inject] 已清除存储');
                  } catch(e) {}
                }
              });
              console.log('[onCommitted] ✓ 已清除存储');
            } else if (pendingData.localStorage || pendingData.sessionStorage) {
              const localCount = pendingData.localStorage ? Object.keys(pendingData.localStorage).length : 0;
              const sessionCount = pendingData.sessionStorage ? Object.keys(pendingData.sessionStorage).length : 0;
              console.log('[onCommitted] 恢复数据量 - localStorage:', localCount, 'sessionStorage:', sessionCount);
              
              // 特别记录 userToken
              if (pendingData.localStorage && pendingData.localStorage.userToken) {
                console.log('[onCommitted] ✓ 将恢复 userToken, 长度:', pendingData.localStorage.userToken.length);
              }
              
              const results = await chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                injectImmediately: true,
                args: [pendingData.localStorage, pendingData.sessionStorage],
                func: (localData, sessionData) => {
                  try {
                    let localRestored = 0, sessionRestored = 0;
                    
                    console.log('[onCommitted-inject] 开始恢复存储数据');
                    
                    if (localData && typeof localData === 'object') {
                      localStorage.clear();
                      for (const [k, v] of Object.entries(localData)) {
                        if (v != null) { localStorage.setItem(k, v); localRestored++; }
                      }
                      console.log('[onCommitted-inject] localStorage 恢复完成:', localRestored, '项');
                    }
                    
                    if (sessionData && typeof sessionData === 'object') {
                      const fp = sessionStorage.getItem('__fp_config__');
                      sessionStorage.clear();
                      if (fp) sessionStorage.setItem('__fp_config__', fp);
                      for (const [k, v] of Object.entries(sessionData)) {
                        if (k !== '__fp_config__' && v != null) { sessionStorage.setItem(k, v); sessionRestored++; }
                      }
                      console.log('[onCommitted-inject] sessionStorage 恢复完成:', sessionRestored, '项');
                    }
                    
                    // 验证 userToken
                    const userToken = localStorage.getItem('userToken');
                    console.log('[onCommitted-inject] userToken 验证:', userToken ? '存在，长度 ' + userToken.length : '不存在');
                    
                    return { 
                      success: true, 
                      localRestored, 
                      sessionRestored,
                      hasUserToken: userToken !== null,
                      userTokenLength: userToken ? userToken.length : 0
                    };
                  } catch (e) {
                    console.log('[onCommitted-inject] 恢复失败:', e.message);
                    return { success: false, error: e.message };
                  }
                }
              });
              
              if (results && results[0] && results[0].result) {
                console.log('[onCommitted] ✓ 恢复结果:', results[0].result);
              }
            }
            
            // 清除 session storage 中的待恢复数据
            await chrome.storage.session.remove([`pending_restore_${mainDomain}`]);
            
            // 标记已处理并清理内存变量
            delete pendingStorageRestore[tabId];
            console.log('[onCommitted] ========== 恢复完成 ==========');
          } catch (e) {
            console.log('[onCommitted] 恢复失败:', e.message);
          }
        }
      }
    } else if (pendingData) {
      console.log('[onCommitted] 跳过恢复 - 域名不匹配或已超时');
    }
    
    // 2. 注入指纹脚本到 MAIN world
    const fingerprint = await getActiveFingerprint(url.hostname);
    await injectFingerprintScript(tabId, details.frameId, fingerprint);
  } catch (e) {
    // 忽略注入失败（某些页面不允许注入）
  }
});

// 监听 DOM 加载完成，验证存储恢复或作为备用恢复
// onCommitted 应该已经恢复了存储，这里做验证和清理
chrome.webNavigation.onDOMContentLoaded.addListener(async (details) => {
  // 只处理主框架
  if (details.frameId !== 0) return;
  if (details.url.startsWith('chrome') || details.url.startsWith('about:') || details.url.startsWith('edge:')) {
    return;
  }
  
  const tabId = details.tabId;
  const pendingData = pendingStorageRestore[tabId];
  
  if (!pendingData) return;
  
  try {
    const url = new URL(details.url);
    const mainDomain = getMainDomain(url.hostname);
    
    // 检查是否超时（10秒内有效）
    if (Date.now() - pendingData.timestamp >= 10000) {
      console.log('[恢复存储-onDOMContentLoaded] 待恢复数据已超时，跳过 (tab:', tabId, ')');
      delete pendingStorageRestore[tabId];
      return;
    }
    
    // 检查域名是否匹配
    if (mainDomain !== pendingData.domain) {
      console.log('[恢复存储-onDOMContentLoaded] 域名不匹配，跳过 (expected:', pendingData.domain, ', got:', mainDomain, ')');
      delete pendingStorageRestore[tabId];
      return;
    }
    
    // 检查 onCommitted 是否已经处理过
    if (pendingData.processedAt) {
      console.log('[恢复存储-onDOMContentLoaded] onCommitted 已处理，验证存储状态');
      
      // 验证存储是否正确恢复
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          func: () => ({
            localStorageKeys: Object.keys(localStorage).length,
            sessionStorageKeys: Object.keys(sessionStorage).length
          })
        });
        
        if (results && results[0] && results[0].result) {
          console.log('[恢复存储-onDOMContentLoaded] 当前存储状态:', results[0].result);
        }
      } catch (e) {}
      
      delete pendingStorageRestore[tabId];
      return;
    }
    
    // onCommitted 没有处理，这里作为备用恢复
    console.log('[恢复存储-onDOMContentLoaded] onCommitted 未处理，执行备用恢复 (tab:', tabId, ')');
    
    if (pendingData.clearOnly) {
      // 只清除存储 - 直接在 MAIN world 执行
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          func: () => {
            try {
              localStorage.clear();
              sessionStorage.clear();
              return { success: true };
            } catch (e) {
              return { success: false, error: e.message };
            }
          }
        });
        console.log('[恢复存储] 已清除存储数据 (tab:', tabId, ')');
      } catch (e) {
        console.log('[恢复存储] 清除存储失败:', e.message);
      }
    } else {
      // 恢复存储数据 - 直接在 MAIN world 执行
      try {
        const localCount = pendingData.localStorage ? Object.keys(pendingData.localStorage).length : 0;
        const sessionCount = pendingData.sessionStorage ? Object.keys(pendingData.sessionStorage).length : 0;
        console.log('[恢复存储] 恢复数据量 - localStorage:', localCount, 'sessionStorage:', sessionCount);
        
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          args: [pendingData.localStorage, pendingData.sessionStorage],
          func: (localData, sessionData) => {
            try {
              let localRestored = 0;
              let sessionRestored = 0;
              
              // 恢复 localStorage
              if (localData && typeof localData === 'object') {
                // 先清除现有数据
                localStorage.clear();
                for (const [key, value] of Object.entries(localData)) {
                  if (value !== null && value !== undefined) {
                    localStorage.setItem(key, value);
                    localRestored++;
                  }
                }
              }
              
              // 恢复 sessionStorage（保留指纹配置）
              if (sessionData && typeof sessionData === 'object') {
                const fpConfig = sessionStorage.getItem('__fp_config__');
                sessionStorage.clear();
                if (fpConfig) {
                  sessionStorage.setItem('__fp_config__', fpConfig);
                }
                for (const [key, value] of Object.entries(sessionData)) {
                  if (key !== '__fp_config__' && value !== null && value !== undefined) {
                    sessionStorage.setItem(key, value);
                    sessionRestored++;
                  }
                }
              }
              
              return { 
                success: true, 
                localRestored, 
                sessionRestored,
                localStorageKeys: Object.keys(localStorage).length,
                sessionStorageKeys: Object.keys(sessionStorage).length
              };
            } catch (e) {
              return { success: false, error: e.message };
            }
          }
        });
        
        if (results && results[0] && results[0].result) {
          const result = results[0].result;
          console.log('[恢复存储] ✓ 恢复结果:', result);
        }
      } catch (e) {
        console.log('[恢复存储] 恢复存储失败:', e.message);
      }
    }
    
    // 清除待恢复数据
    delete pendingStorageRestore[tabId];
  } catch (e) {
    console.error('[恢复存储] 错误:', e);
    delete pendingStorageRestore[tabId];
  }
});

// 注入指纹脚本
async function injectFingerprintScript(tabId, frameId, fingerprint) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      world: 'MAIN',
      injectImmediately: true,
      args: [fingerprint],
      func: applyFingerprintInPage
    });
  } catch (e) {
    // 某些页面（如 chrome:// 页面）不允许注入，忽略错误
  }
}

// 在页面中执行的指纹伪装函数（会被序列化后注入）
function applyFingerprintInPage(config) {
  // 防止重复注入
  if (window.__fp_applied__) return;
  window.__fp_applied__ = true;
  
  if (!config) return;
  
  // ==================== 工具函数 ====================
  
  function makeSeededRandom(seed, max = 1, min = 0) {
    let s = typeof seed === 'string' ? hashString(seed) : seed;
    return function() {
      s |= 0;
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      const rnd = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return min + rnd * (max - min);
    };
  }
  
  function seededRandom(seed, max = 1, min = 0) {
    return makeSeededRandom(seed, max, min)();
  }
  
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash % Number.MAX_SAFE_INTEGER);
  }
  
  function generateCanvasNoise(seed) {
    const rand = makeSeededRandom(seed, 255, 0);
    const noise = [];
    for (let i = 0; i < 10; i++) {
      noise.push(Math.floor(rand()));
    }
    return noise;
  }
  
  // ==================== Canvas 2D 指纹 ====================
  
  function hookCanvas2D(seed) {
    if (seed == null) return;
    
    const noise = generateCanvasNoise(seed);
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    
    function addSmartNoise(imageData, noiseArr) {
      const data = imageData.data;
      const width = imageData.width;
      const height = imageData.height;
      let noiseIndex = 0;
      
      function pixelsEqual(idx1, idx2) {
        return data[idx1] === data[idx2] &&
               data[idx1 + 1] === data[idx2 + 1] &&
               data[idx1 + 2] === data[idx2 + 2] &&
               data[idx1 + 3] === data[idx2 + 3];
      }
      
      for (let row = 1; row < height - 2 && noiseIndex < noiseArr.length; row += 2) {
        for (let col = 1; col < width - 2 && noiseIndex < noiseArr.length; col += 2) {
          const centerIdx = (row * width + col) * 4;
          const upIdx = ((row - 1) * width + col) * 4;
          const downIdx = ((row + 1) * width + col) * 4;
          const leftIdx = (row * width + (col - 1)) * 4;
          const rightIdx = (row * width + (col + 1)) * 4;
          
          if (!pixelsEqual(centerIdx, upIdx) &&
              !pixelsEqual(centerIdx, downIdx) &&
              !pixelsEqual(centerIdx, leftIdx) &&
              !pixelsEqual(centerIdx, rightIdx)) {
            data[centerIdx + 3] = noiseArr[noiseIndex++] % 256;
          }
        }
      }
      return imageData;
    }
    
    CanvasRenderingContext2D.prototype.getImageData = function(...args) {
      const imageData = originalGetImageData.apply(this, args);
      return addSmartNoise(imageData, noise);
    };
    
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      const ctx = this.getContext('2d', { willReadFrequently: true });
      if (ctx && this.width > 0 && this.height > 0) {
        try {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = this.width;
          tempCanvas.height = this.height;
          const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
          tempCtx.drawImage(this, 0, 0);
          const imageData = originalGetImageData.call(tempCtx, 0, 0, this.width, this.height);
          addSmartNoise(imageData, noise);
          tempCtx.putImageData(imageData, 0, 0);
          return originalToDataURL.apply(tempCanvas, args);
        } catch (e) {}
      }
      return originalToDataURL.apply(this, args);
    };
    
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      const ctx = this.getContext('2d', { willReadFrequently: true });
      if (ctx && this.width > 0 && this.height > 0) {
        try {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = this.width;
          tempCanvas.height = this.height;
          const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
          tempCtx.drawImage(this, 0, 0);
          const imageData = originalGetImageData.call(tempCtx, 0, 0, this.width, this.height);
          addSmartNoise(imageData, noise);
          tempCtx.putImageData(imageData, 0, 0);
          return originalToBlob.call(tempCanvas, callback, ...args);
        } catch (e) {}
      }
      return originalToBlob.call(this, callback, ...args);
    };
  }
  
  // ==================== WebGL 指纹 ====================
  
  function hookWebGL(seed, gpuInfo) {
    if (seed == null && !gpuInfo) return;
    
    if (gpuInfo) {
      const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
      const originalGetParameter2 = WebGL2RenderingContext?.prototype?.getParameter;
      
      function spoofGetParameter(original) {
        return function(parameter) {
          const ext = this.getExtension('WEBGL_debug_renderer_info');
          if (ext) {
            if (parameter === ext.UNMASKED_VENDOR_WEBGL && gpuInfo.vendor) {
              return gpuInfo.vendor;
            }
            if (parameter === ext.UNMASKED_RENDERER_WEBGL && gpuInfo.renderer) {
              return gpuInfo.renderer;
            }
          }
          return original.call(this, parameter);
        };
      }
      
      WebGLRenderingContext.prototype.getParameter = spoofGetParameter(originalGetParameter);
      if (WebGL2RenderingContext) {
        WebGL2RenderingContext.prototype.getParameter = spoofGetParameter(originalGetParameter2);
      }
    }
  }
  
  // ==================== Audio 指纹 ====================
  
  function hookAudio(seed) {
    if (seed == null || typeof AudioBuffer === 'undefined') return;
    
    const processedBuffers = new WeakSet();
    const originalGetChannelData = AudioBuffer.prototype.getChannelData;
    
    AudioBuffer.prototype.getChannelData = function(channel) {
      const data = originalGetChannelData.call(this, channel);
      if (processedBuffers.has(data)) return data;
      
      const step = data.length > 2000 ? 100 : 20;
      for (let i = 0; i < data.length; i += step) {
        const v = data[i];
        if (v !== 0 && Math.abs(v) > 1e-7) {
          data[i] += seededRandom(seed + i) * 1e-7;
        }
      }
      processedBuffers.add(data);
      return data;
    };
  }
  
  // ==================== Navigator 属性 ====================
  
  function hookNavigator(cfg) {
    if (!cfg) return;
    
    const props = {
      platform: cfg.platform,
      language: cfg.language,
      languages: cfg.languages ? Object.freeze([...cfg.languages]) : null,
      hardwareConcurrency: cfg.hardwareConcurrency,
      deviceMemory: cfg.deviceMemory
    };
    
    Object.entries(props).forEach(([key, value]) => {
      if (value != null) {
        try {
          Object.defineProperty(navigator, key, {
            get: () => value,
            configurable: true
          });
        } catch (e) {}
      }
    });
  }
  
  // ==================== Screen 属性 ====================
  
  function hookScreen(cfg) {
    if (!cfg) return;
    
    const props = {};
    if (cfg.width != null) {
      props.width = cfg.width;
      props.availWidth = cfg.width;
    }
    if (cfg.height != null) {
      props.height = cfg.height;
      props.availHeight = cfg.height - 40;
    }
    if (cfg.colorDepth != null) {
      props.colorDepth = cfg.colorDepth;
      props.pixelDepth = cfg.colorDepth;
    }
    
    Object.entries(props).forEach(([key, value]) => {
      if (value != null) {
        try {
          Object.defineProperty(screen, key, {
            get: () => value,
            configurable: true
          });
        } catch (e) {}
      }
    });
  }
  
  // ==================== 应用配置 ====================
  
  const seed = config.seed || Math.floor(Math.random() * 1e9);
  
  if (config.canvas !== false) {
    hookCanvas2D(config.canvasSeed || seed);
  }
  
  if (config.webgl !== false || config.gpuInfo) {
    hookWebGL(
      config.webgl !== false ? (config.webglSeed || seed + 1) : null,
      config.gpuInfo
    );
  }
  
  if (config.audio !== false) {
    hookAudio(config.audioSeed || seed + 2);
  }
  
  if (config.navigator) {
    hookNavigator(config.navigator);
  }
  
  if (config.screen) {
    hookScreen(config.screen);
  }
}

// 右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.url) return;
  
  try {
    const url = new URL(tab.url);
    const domain = url.hostname;
    
    if (info.menuItemId === 'save-profile') {
      try { await chrome.action.openPopup(); } catch (e) {}
    } else if (info.menuItemId === 'clear-cookies') {
      const result = await clearCookiesForDomain(domain);
      if (result.success) chrome.tabs.reload(tab.id);
    } else if (info.menuItemId.startsWith('switch-')) {
      // 格式: switch-{mainDomain}-{profileName}
      const parts = info.menuItemId.split('-');
      const profileName = parts.slice(2).join('-'); // 处理名称中可能有 - 的情况
      const result = await loadProfile(domain, profileName);
      if (result.success) chrome.tabs.reload(tab.id);
    }
  } catch (e) {}
});

// ==================== 自动规则 ====================

async function checkAutoRules(tabId, url) {
  try {
    const data = await chrome.storage.local.get(['autoRules', 'lastAutoSwitch']);
    const rules = data.autoRules || [];
    
    const switchKey = `${tabId}-${url.href}`;
    if (data.lastAutoSwitch?.key === switchKey && Date.now() - data.lastAutoSwitch.time < 5000) return;
    
    for (const rule of rules) {
      if (rule.enabled === false) continue;
      if (matchPattern(url.hostname, rule.pattern)) {
        await chrome.storage.local.set({ lastAutoSwitch: { key: switchKey, time: Date.now() } });
        const result = await loadProfile(url.hostname, rule.profileName);
        if (result.success) chrome.tabs.reload(tabId);
        break;
      }
    }
  } catch (e) {}
}

function matchPattern(hostname, pattern) {
  const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
  return new RegExp(`^${regexPattern}$`, 'i').test(hostname);
}

// ==================== 消息处理 ====================

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  (async () => {
    let response;
    switch (request.action) {
      case 'getCookies':
        const cookies = await getCookiesForDomain(request.domain);
        response = { success: true, cookies, count: cookies.length };
        break;
      case 'clearCookies':
        response = await clearCookiesForDomain(request.domain);
        break;
      case 'saveProfile':
        response = await saveProfile(request.domain, request.profileName, request.color);
        break;
      case 'loadProfile':
        response = await loadProfile(request.domain, request.profileName);
        break;
      case 'preRestoreStorage':
        // 预先恢复存储数据（在页面刷新之前）
        console.log('[preRestoreStorage] ========== 开始预设置 ==========');
        console.log('[preRestoreStorage] 步骤1: 域名:', request.domain, 'tabIds:', request.tabIds);
        try {
          const mainDomain = getMainDomain(request.domain);
          const sessionData = await chrome.storage.session.get([`pending_restore_${mainDomain}`]);
          const pendingData = sessionData[`pending_restore_${mainDomain}`];
          
          console.log('[preRestoreStorage] 步骤2: session storage 数据:', pendingData ? {
            hasLocalStorage: !!pendingData.localStorage,
            localStorageCount: pendingData.localStorage ? Object.keys(pendingData.localStorage).length : 0,
            clearOnly: pendingData.clearOnly,
            timestamp: pendingData.timestamp
          } : 'null');
          
          let successCount = 0;
          let failCount = 0;
          
          if (pendingData && !pendingData.clearOnly && pendingData.localStorage) {
            console.log('[preRestoreStorage] 步骤3: 开始在各标签页预设置 localStorage');
            console.log('[preRestoreStorage] localStorage keys:', Object.keys(pendingData.localStorage));
            
            // 特别检查 userToken
            if (pendingData.localStorage.userToken) {
              console.log('[preRestoreStorage] ✓ 发现 userToken，长度:', pendingData.localStorage.userToken.length);
            }
            
            for (const tabId of request.tabIds) {
              console.log('[preRestoreStorage] 步骤4: 处理标签页', tabId);
              try {
                const results = await chrome.scripting.executeScript({
                  target: { tabId },
                  world: 'MAIN',
                  args: [pendingData.localStorage, mainDomain],
                  func: (localData, domain) => {
                    try {
                      console.log('[preRestoreStorage-inject] 开始在页面中设置 localStorage');
                      // 预设置 localStorage（页面刷新后会保留）
                      if (localData && typeof localData === 'object') {
                        // 清除现有数据
                        const oldKeys = Object.keys(localStorage);
                        localStorage.clear();
                        console.log('[preRestoreStorage-inject] 已清除旧数据，原有', oldKeys.length, '项');
                        
                        // 设置新数据
                        let count = 0;
                        for (const [key, value] of Object.entries(localData)) {
                          if (value !== null && value !== undefined) {
                            localStorage.setItem(key, value);
                            count++;
                          }
                        }
                        console.log('[preRestoreStorage-inject] 已设置新数据', count, '项');
                        
                        // 添加恢复标记
                        localStorage.setItem('__pending_restore_marker__', JSON.stringify({
                          domain: domain,
                          timestamp: Date.now(),
                          count: count
                        }));
                        
                        // 验证 userToken
                        const userToken = localStorage.getItem('userToken');
                        console.log('[preRestoreStorage-inject] userToken 验证:', userToken ? '存在，长度 ' + userToken.length : '不存在');
                        
                        return { 
                          success: true, 
                          count,
                          hasUserToken: userToken !== null,
                          userTokenLength: userToken ? userToken.length : 0,
                          keys: Object.keys(localStorage)
                        };
                      }
                      return { success: false, error: 'no data' };
                    } catch (e) {
                      return { success: false, error: e.message };
                    }
                  }
                });
                
                if (!results || !results[0]) {
                  console.warn('[preRestoreStorage] 标签页', tabId, '无返回结果');
                  failCount++;
                  continue;
                }
                
                if (results[0].error) {
                  console.error('[preRestoreStorage] 标签页', tabId, '执行错误:', results[0].error);
                  failCount++;
                  continue;
                }
                
                if (results[0].result?.success) {
                  console.log('[preRestoreStorage] 步骤5: 标签页', tabId, '预设置成功:', results[0].result);
                  successCount++;
                  
                  // 标记内存变量为已处理
                  if (pendingStorageRestore[tabId]) {
                    pendingStorageRestore[tabId].preRestored = true;
                    pendingStorageRestore[tabId].processedAt = Date.now();
                    console.log('[preRestoreStorage] 已标记 pendingStorageRestore[', tabId, '].preRestored = true');
                  }
                } else {
                  console.warn('[preRestoreStorage] 标签页', tabId, '预设置失败:', results[0].result);
                  failCount++;
                }
              } catch (e) {
                console.error('[preRestoreStorage] 标签页', tabId, '异常:', e.message);
                failCount++;
              }
            }
            
            // 清除 session storage 中的待恢复数据
            console.log('[preRestoreStorage] 步骤6: 清除 chrome.storage.session 数据');
            await chrome.storage.session.remove([`pending_restore_${mainDomain}`]);
            
            console.log('[preRestoreStorage] ========== 预设置完成 - 成功:', successCount, '失败:', failCount, '==========');
            response = { 
              success: failCount === 0, 
              successCount, 
              failCount,
              message: failCount > 0 ? `${failCount} 个标签页预设置失败` : '全部成功'
            };
          } else if (pendingData && pendingData.clearOnly) {
            console.log('[preRestoreStorage] 步骤3: clearOnly 模式，清除存储');
            // 清除存储
            for (const tabId of request.tabIds) {
              try {
                const results = await chrome.scripting.executeScript({
                  target: { tabId },
                  world: 'MAIN',
                  func: () => {
                    try {
                      localStorage.clear();
                      console.log('[preRestoreStorage-inject] 已清除 localStorage');
                      return { success: true };
                    } catch (e) {
                      return { success: false, error: e.message };
                    }
                  }
                });
                
                if (results && results[0] && results[0].result?.success) {
                  console.log('[preRestoreStorage] 标签页', tabId, '已清除存储');
                  successCount++;
                } else {
                  console.warn('[preRestoreStorage] 标签页', tabId, '清除失败');
                  failCount++;
                }
                
                // 标记内存变量为已处理
                if (pendingStorageRestore[tabId]) {
                  pendingStorageRestore[tabId].preRestored = true;
                  pendingStorageRestore[tabId].processedAt = Date.now();
                }
              } catch (e) {
                console.error('[preRestoreStorage] 标签页', tabId, '清除异常:', e.message);
                failCount++;
              }
            }
            await chrome.storage.session.remove([`pending_restore_${mainDomain}`]);
            console.log('[preRestoreStorage] ========== 清除完成 - 成功:', successCount, '失败:', failCount, '==========');
            response = { 
              success: failCount === 0, 
              successCount, 
              failCount,
              message: failCount > 0 ? `${failCount} 个标签页清除失败` : '全部成功'
            };
          } else {
            console.log('[preRestoreStorage] 无需预设置（无数据或数据格式不对）');
            response = { success: true, message: '无需预设置' };
          }
        } catch (e) {
          console.error('[preRestoreStorage] 错误:', e);
          response = { success: false, error: e.message };
        }
        break;
      case 'deleteProfile':
        response = await deleteProfile(request.domain, request.profileName);
        break;
      case 'deleteMultipleProfiles':
        response = await deleteMultipleProfiles(request.domain, request.profileNames);
        break;
      case 'getProfiles':
        response = await getProfiles(request.domain);
        break;
      case 'getAllProfileStats':
        response = await getAllProfileStats();
        break;
      case 'renameProfile':
        response = await renameProfile(request.domain, request.oldName, request.newName);
        break;
      case 'updateProfileColor':
        response = await updateProfileColor(request.domain, request.profileName, request.color);
        break;
      case 'updateProfileGroup':
        response = await updateProfileGroup(request.domain, request.profileName, request.groupId);
        break;
      case 'updateProfileNote':
        response = await updateProfileNote(request.domain, request.profileName, request.note);
        break;
      case 'getRecentUsage':
        response = await getRecentUsage();
        break;
      case 'exportProfiles':
        const exportData = await chrome.storage.local.get(['profiles', 'groups', 'autoRules']);
        response = { success: true, data: { version: '1.0.0', exportedAt: Date.now(), ...exportData } };
        break;
      case 'importProfiles':
        if (request.data && request.data.profiles) {
          const currentData = await chrome.storage.local.get(['profiles']);
          const merged = { ...currentData.profiles, ...request.data.profiles };
          await chrome.storage.local.set({ profiles: merged });
          // 同时导入分组和规则（如果有）
          if (request.data.groups) {
            await chrome.storage.local.set({ groups: request.data.groups });
          }
          if (request.data.autoRules) {
            await chrome.storage.local.set({ autoRules: request.data.autoRules });
          }
          response = { success: true };
        } else {
          response = { success: false, error: '无效的导入数据' };
        }
        break;
      case 'updateSettings':
        try {
          const settingsData = await chrome.storage.local.get(['settings']);
          const newSettings = { ...settingsData.settings, ...request.settings };
          await chrome.storage.local.set({ settings: newSettings });
          activeSettings = { ...activeSettings, ...request.settings };
          
          // 如果 UA 设置变化，更新拦截
          if (request.settings.uaEnabled !== undefined || request.settings.customUA !== undefined) {
            await setupUAInterception();
          }
          
          // 如果代理设置变化
          if (request.settings.proxyEnabled !== undefined || request.settings.proxyConfig !== undefined) {
            if (activeSettings.proxyEnabled && activeSettings.proxyConfig) {
              await applyProxy(activeSettings.proxyConfig);
            } else {
              await clearProxy();
            }
          }
          
          response = { success: true };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'applyUserAgent':
        try {
          if (request.userAgent) {
            await applyUserAgent(request.userAgent);
            activeSettings.customUA = request.userAgent;
            activeSettings.uaEnabled = true;
          } else {
            await disableUserAgent();
            activeSettings.uaEnabled = false;
          }
          // 保存设置
          const uaSettingsData = await chrome.storage.local.get(['settings']);
          await chrome.storage.local.set({ 
            settings: { 
              ...uaSettingsData.settings, 
              uaEnabled: activeSettings.uaEnabled,
              customUA: activeSettings.customUA 
            } 
          });
          response = { success: true };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'applyProxy':
        try {
          if (request.proxyConfig) {
            const result = await applyProxy(request.proxyConfig);
            activeSettings.proxyConfig = request.proxyConfig;
            activeSettings.proxyEnabled = true;
            response = result;
          } else {
            await clearProxy();
            activeSettings.proxyEnabled = false;
            response = { success: true };
          }
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'testProxy':
        try {
          const testResult = await testProxy(request.proxyConfig);
          response = testResult;
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'getCurrentIP':
        try {
          const ipResult = await getCurrentIP();
          response = ipResult;
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'getSettings':
        try {
          const settingsData = await chrome.storage.local.get(['settings']);
          response = { success: true, settings: settingsData.settings || {} };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'getActiveProfile':
        // 获取当前域名激活的账号
        try {
          const mainDomain = getMainDomain(request.domain);
          response = { 
            success: true, 
            activeProfile: activeProfiles[mainDomain] || null,
            domain: mainDomain
          };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'getCurrentUA':
        try {
          const rules = await chrome.declarativeNetRequest.getDynamicRules();
          const uaRule = rules.find(r => r.action?.requestHeaders?.some(h => h.header === 'User-Agent'));
          const currentUA = uaRule?.action?.requestHeaders?.find(h => h.header === 'User-Agent')?.value;
          response = { success: true, userAgent: currentUA || null, enabled: !!currentUA };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'updateProfileConfig':
        // 更新账号独立配置（UA、代理、指纹等）
        try {
          const mainDomain = getMainDomain(request.domain);
          const profileData = await chrome.storage.local.get(['profiles']);
          const profiles = profileData.profiles || {};
          
          if (!profiles[mainDomain] || !profiles[mainDomain][request.profileName]) {
            response = { success: false, error: 'Profile 不存在' };
            break;
          }
          
          const profile = profiles[mainDomain][request.profileName];
          
          if (request.config.customUA !== undefined) {
            profile.customUA = request.config.customUA;
          }
          if (request.config.proxyConfig !== undefined) {
            profile.proxyConfig = request.config.proxyConfig;
          }
          if (request.config.fingerprint !== undefined) {
            profile.fingerprint = request.config.fingerprint;
          }
          if (request.config.tags !== undefined) {
            profile.tags = request.config.tags;
          }
          
          await chrome.storage.local.set({ profiles });
          response = { success: true };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'duplicateProfile':
        // 复制账号配置
        try {
          const mainDomain = getMainDomain(request.domain);
          const profileData = await chrome.storage.local.get(['profiles']);
          const profiles = profileData.profiles || {};
          
          if (!profiles[mainDomain] || !profiles[mainDomain][request.profileName]) {
            response = { success: false, error: 'Profile 不存在' };
            break;
          }
          
          const sourceProfile = profiles[mainDomain][request.profileName];
          const newName = request.newName || `${request.profileName} (副本)`;
          
          if (profiles[mainDomain][newName]) {
            response = { success: false, error: '目标名称已存在' };
            break;
          }
          
          profiles[mainDomain][newName] = {
            ...sourceProfile,
            savedAt: Date.now(),
            lastUsedAt: null,
            useCount: 0
          };
          
          await chrome.storage.local.set({ profiles });
          response = { success: true, newName };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'refreshProfile':
        // 刷新账号（重新保存当前 Cookie）
        // 安全检查：只有当前正在使用该账号时才能刷新（除非强制刷新）
        try {
          const mainDomain = getMainDomain(request.domain);
          
          // 检查是否是当前激活的账号（forceRefresh 可以绕过检查，用于重复账号更新）
          if (!request.forceRefresh && activeProfiles[mainDomain] !== request.profileName) {
            response = { 
              success: false, 
              error: `当前激活的是「${activeProfiles[mainDomain] || '无'}」，不是「${request.profileName}」。请先切换到该账号再刷新。`
            };
            break;
          }
          
          const profileData = await chrome.storage.local.get(['profiles']);
          const profiles = profileData.profiles || {};
          
          if (!profiles[mainDomain] || !profiles[mainDomain][request.profileName]) {
            response = { success: false, error: 'Profile 不存在' };
            break;
          }
          
          // 获取当前浏览器的 Cookie
          const currentCookies = await getAllCookiesForMainDomain(mainDomain, request.domain);
          if (currentCookies.length === 0) {
            response = { success: false, error: '当前没有登录信息' };
            break;
          }
          
          // 更新 Cookie
          const savedProfile = profiles[mainDomain][request.profileName];
          savedProfile.cookies = currentCookies;
          savedProfile.cookieCount = currentCookies.length;
          savedProfile.savedAt = Date.now();
          savedProfile.userInfo = extractUserInfoFromCookies(currentCookies);
          
          // 更新域名统计
          const domainStats = {};
          for (const cookie of currentCookies) {
            domainStats[cookie.domain] = (domainStats[cookie.domain] || 0) + 1;
          }
          savedProfile.domainStats = domainStats;
          
          await chrome.storage.local.set({ profiles });
          
          // 更新当前激活账号
          activeProfiles[mainDomain] = request.profileName;
          await chrome.storage.local.set({ activeProfiles });
          
          response = { success: true, cookieCount: currentCookies.length };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'generateFingerprint':
        // 生成随机指纹
        try {
          response = { success: true, fingerprint: generateRandomFingerprint() };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'regenerateProfileFingerprint':
        // 为指定账号重新生成指纹
        try {
          const mainDomain = getMainDomain(request.domain);
          const profileData = await chrome.storage.local.get(['profiles']);
          const profiles = profileData.profiles || {};
          
          if (profiles[mainDomain] && profiles[mainDomain][request.profileName]) {
            const newFingerprint = generateRandomFingerprint();
            profiles[mainDomain][request.profileName].fingerprint = newFingerprint;
            await chrome.storage.local.set({ profiles });
            
            // 如果是当前激活的账号，也更新 activeFingerprints
            if (activeProfiles[mainDomain] === request.profileName) {
              await saveActiveFingerprint(mainDomain, newFingerprint, request.profileName);
            }
            
            response = { success: true, fingerprint: newFingerprint };
          } else {
            response = { success: false, error: '账号不存在' };
          }
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'getFingerprintPresets':
        // 获取指纹预设
        response = { success: true, presets: fingerprintPresets };
        break;
      case 'getFingerprint':
        // 获取当前域名的指纹配置（供 content script 使用）
        try {
          const fingerprint = await getActiveFingerprint(request.domain);
          response = { success: true, fingerprint };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'batchUpdateGroup':
        // 批量更新分组
        try {
          const mainDomain = getMainDomain(request.domain);
          const profileData = await chrome.storage.local.get(['profiles']);
          const profiles = profileData.profiles || {};
          
          if (!profiles[mainDomain]) {
            response = { success: false, error: '域名不存在' };
            break;
          }
          
          let updatedCount = 0;
          for (const profileName of request.profileNames) {
            if (profiles[mainDomain][profileName]) {
              profiles[mainDomain][profileName].groupId = request.groupId;
              updatedCount++;
            }
          }
          
          await chrome.storage.local.set({ profiles });
          response = { success: true, updatedCount };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'batchImportProfiles':
        // 批量导入账号（从文本）
        try {
          const mainDomain = getMainDomain(request.domain);
          const profileData = await chrome.storage.local.get(['profiles']);
          const profiles = profileData.profiles || {};
          
          if (!profiles[mainDomain]) profiles[mainDomain] = {};
          
          let importedCount = 0;
          for (const item of request.items) {
            if (!item.name) continue;
            
            // 检查是否已存在
            if (profiles[mainDomain][item.name] && !request.overwrite) {
              continue;
            }
            
            profiles[mainDomain][item.name] = {
              cookies: [],
              savedAt: Date.now(),
              cookieCount: 0,
              color: item.color || '#4285F4',
              note: item.note || '',
              groupId: item.groupId || null,
              customUA: item.customUA || null,
              proxyConfig: item.proxyConfig || null,
              fingerprint: item.fingerprint || null,
              // 标记为待登录
              needLogin: true
            };
            importedCount++;
          }
          
          await chrome.storage.local.set({ profiles });
          response = { success: true, importedCount };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'detectUser':
        // 从当前标签页检测用户信息
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.id) {
            // 先尝试注入 content script（如果还没注入的话）
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['src/content/user-detector.js']
              });
            } catch (injectErr) {
              // 可能已存在，忽略
            }
            
            // 等待一小段时间让脚本初始化
            await new Promise(r => setTimeout(r, 100));
            
            const userInfo = await chrome.tabs.sendMessage(tab.id, { action: 'detectUser' });
            response = userInfo;
          } else {
            response = { success: false, error: '无法获取当前标签页' };
          }
        } catch (e) {
          response = { success: false, error: e.message, userInfo: null };
        }
        break;
      case 'setAutoRotate':
        // 设置自动轮换
        response = await setAutoRotate(request.domain, request.config);
        break;
      case 'getAutoRotateConfig':
        // 获取自动轮换配置
        try {
          const rotateConfig = await getAutoRotateConfig(request.domain);
          response = { success: true, config: rotateConfig };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'getHealthWarnings':
        // 获取健康警告
        try {
          const healthData = await chrome.storage.local.get(['healthWarnings']);
          response = { success: true, warnings: healthData.healthWarnings || [] };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'exportDomainProfiles':
        // 导出单个域名的账号
        try {
          const mainDomain = getMainDomain(request.domain);
          const profileData = await chrome.storage.local.get(['profiles']);
          const profiles = profileData.profiles || {};
          const domainProfiles = profiles[mainDomain] || {};
          
          response = { 
            success: true, 
            data: { 
              version: '1.0.0', 
              exportedAt: Date.now(),
              domain: mainDomain,
              profiles: { [mainDomain]: domainProfiles }
            } 
          };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'updateProfileMeta':
        // 更新账号元数据（标签、凭证备忘等）
        try {
          const mainDomain = getMainDomain(request.domain);
          const profileData = await chrome.storage.local.get(['profiles']);
          const profiles = profileData.profiles || {};
          
          if (!profiles[mainDomain] || !profiles[mainDomain][request.profileName]) {
            response = { success: false, error: 'Profile 不存在' };
            break;
          }
          
          const profile = profiles[mainDomain][request.profileName];
          
          if (request.meta.tags !== undefined) {
            profile.tags = request.meta.tags;
          }
          if (request.meta.loginHint !== undefined) {
            // 简单加密存储（Base64，不是真正的加密，只是混淆）
            profile.loginHint = request.meta.loginHint ? btoa(encodeURIComponent(request.meta.loginHint)) : '';
          }
          if (request.meta.passwordHint !== undefined) {
            profile.passwordHint = request.meta.passwordHint ? btoa(encodeURIComponent(request.meta.passwordHint)) : '';
          }
          
          await chrome.storage.local.set({ profiles });
          response = { success: true };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      case 'checkHealthNow':
        // 立即检查健康状态
        try {
          await checkAllProfilesHealth();
          const healthData = await chrome.storage.local.get(['healthWarnings']);
          response = { success: true, warnings: healthData.healthWarnings || [] };
        } catch (e) {
          response = { success: false, error: e.message };
        }
        break;
      default:
        response = { success: false, error: '未知操作' };
    }
    sendResponse(response);
  })();
  return true;
});

// ==================== 快捷键 ====================

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'quick-switch') {
    try { await chrome.action.openPopup(); } catch (e) {}
  }
});

// ==================== 健康检查与通知 ====================

// 检查所有账号的健康状态
async function checkAllProfilesHealth() {
  try {
    const data = await chrome.storage.local.get(['profiles', 'settings', 'activeProfiles']);
    const profiles = data.profiles || {};
    const settings = data.settings || {};
    const currentActiveProfiles = data.activeProfiles || {};
    
    if (!settings.healthCheckEnabled) return;
    
    const now = Date.now() / 1000;
    const warnings = [];
    const autoRefreshExpiring = settings.autoRefreshExpiring || false;
    const expiringThresholdDays = 7; // 7天内过期视为快过期
    const expiringThreshold = now + (expiringThresholdDays * 24 * 60 * 60);
    
    // 先处理当前激活账号的自动刷新
    if (autoRefreshExpiring) {
      for (const [domain, activeProfileName] of Object.entries(currentActiveProfiles)) {
        if (!profiles[domain] || !profiles[domain][activeProfileName]) continue;
        
        const profile = profiles[domain][activeProfileName];
        if (!profile.cookies || profile.cookies.length === 0) continue;
        
        // 检查当前激活账号是否有快过期的 Cookie
        const expiringCount = profile.cookies.filter(c =>
          c.expirationDate && c.expirationDate > now && c.expirationDate < expiringThreshold
        ).length;
        
        // 超过 30% 的 Cookie 快过期，自动刷新
        if (expiringCount > profile.cookies.length * 0.3) {
          await autoRefreshActiveProfile(domain, activeProfileName);
        }
      }
    }
    
    // 然后检查所有账号的健康状态（用于警告）
    for (const [domain, domainProfiles] of Object.entries(profiles)) {
      for (const [name, profile] of Object.entries(domainProfiles)) {
        if (!profile.cookies || profile.cookies.length === 0) continue;
        
        // 检查过期 Cookie 数量
        const expiredCount = profile.cookies.filter(c => 
          c.expirationDate && c.expirationDate < now
        ).length;
        const totalCount = profile.cookies.length;
        
        // 检查保存时间
        const daysSinceSaved = (Date.now() - profile.savedAt) / (1000 * 60 * 60 * 24);
        
        // 超过 50% Cookie 过期
        if (expiredCount > totalCount * 0.5) {
          warnings.push({
            domain,
            name,
            type: 'expired',
            message: `「${name}」(${domain}) 大部分 Cookie 已过期`
          });
        }
        // 超过 60 天未更新
        else if (daysSinceSaved > 60) {
          warnings.push({
            domain,
            name,
            type: 'stale',
            message: `「${name}」(${domain}) 已 ${Math.floor(daysSinceSaved)} 天未更新`
          });
        }
      }
    }
    
    // 发送通知
    if (warnings.length > 0 && settings.showNotification) {
      const message = warnings.length === 1 
        ? warnings[0].message
        : `${warnings.length} 个账号需要注意：${warnings.slice(0, 2).map(w => w.name).join('、')}${warnings.length > 2 ? '...' : ''}`;
      
      chrome.notifications.create('health-warning', {
        type: 'basic',
        iconUrl: 'icons/icon.svg',
        title: '账号健康提醒',
        message: message,
        priority: 1
      });
    }
    
    // 保存警告状态供 popup 使用
    await chrome.storage.local.set({ healthWarnings: warnings });
    
  } catch (e) {
    console.error('健康检查失败:', e);
  }
}

// 自动刷新当前激活的账号（只能刷新当前登录的账号）
async function autoRefreshActiveProfile(domain, profileName) {
  try {
    const mainDomain = getMainDomain(domain);
    
    // 从浏览器获取当前实际的 Cookie（这是当前登录账号的 Cookie）
    const currentCookies = await getAllCookiesForMainDomain(mainDomain, domain);
    if (currentCookies.length === 0) {
      return; // 浏览器里没有 Cookie，说明没登录，无法刷新
    }
    
    // 更新 Profile
    const profileData = await chrome.storage.local.get(['profiles']);
    const profiles = profileData.profiles || {};
    
    if (!profiles[mainDomain] || !profiles[mainDomain][profileName]) {
      return; // Profile 不存在
    }
    
    const savedProfile = profiles[mainDomain][profileName];
    savedProfile.cookies = currentCookies;
    savedProfile.cookieCount = currentCookies.length;
    savedProfile.savedAt = Date.now();
    savedProfile.userInfo = extractUserInfoFromCookies(currentCookies);
    
    // 更新域名统计
    const domainStats = {};
    for (const cookie of currentCookies) {
      domainStats[cookie.domain] = (domainStats[cookie.domain] || 0) + 1;
    }
    savedProfile.domainStats = domainStats;
    
    await chrome.storage.local.set({ profiles });
    
    // 发送通知
    chrome.notifications.create(`auto-refresh-${domain}`, {
      type: 'basic',
      iconUrl: 'icons/icon.svg',
      title: '自动刷新成功',
      message: `「${profileName}」(${domain}) 的 Cookie 已自动刷新`,
      priority: 0
    });
  } catch (e) {
    console.error('自动刷新失败:', e);
  }
}

// ==================== 自动轮换 ====================

// 恢复自动轮换定时任务
async function restoreAutoRotateAlarms() {
  try {
    const data = await chrome.storage.local.get(['autoRotateConfig']);
    const config = data.autoRotateConfig || {};
    
    for (const [domain, rotateConfig] of Object.entries(config)) {
      if (rotateConfig.enabled && rotateConfig.intervalMinutes > 0) {
        chrome.alarms.create(`rotate-${domain}`, {
          periodInMinutes: rotateConfig.intervalMinutes
        });
      }
    }
  } catch (e) {
    console.error('恢复自动轮换失败:', e);
  }
}

// 设置自动轮换
async function setAutoRotate(domain, config) {
  try {
    const mainDomain = getMainDomain(domain);
    const data = await chrome.storage.local.get(['autoRotateConfig']);
    const autoRotateConfig = data.autoRotateConfig || {};
    
    const alarmName = `rotate-${mainDomain}`;
    
    if (config.enabled && config.intervalMinutes > 0 && config.profiles && config.profiles.length > 1) {
      autoRotateConfig[mainDomain] = {
        enabled: true,
        intervalMinutes: config.intervalMinutes,
        profiles: config.profiles,
        currentIndex: 0,
        lastRotate: null
      };
      
      // 创建定时任务
      await chrome.alarms.clear(alarmName);
      chrome.alarms.create(alarmName, {
        periodInMinutes: config.intervalMinutes
      });
    } else {
      // 禁用
      delete autoRotateConfig[mainDomain];
      await chrome.alarms.clear(alarmName);
    }
    
    await chrome.storage.local.set({ autoRotateConfig });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 执行自动轮换
async function executeAutoRotate(domain) {
  try {
    const data = await chrome.storage.local.get(['autoRotateConfig', 'profiles']);
    const config = data.autoRotateConfig?.[domain];
    const profiles = data.profiles?.[domain];
    
    if (!config || !config.enabled || !config.profiles || config.profiles.length < 2) {
      return;
    }
    
    // 获取下一个账号
    const nextIndex = (config.currentIndex + 1) % config.profiles.length;
    const nextProfile = config.profiles[nextIndex];
    
    // 检查账号是否存在
    if (!profiles || !profiles[nextProfile]) {
      return;
    }
    
    // 执行切换
    const result = await loadProfile(domain, nextProfile);
    
    if (result.success) {
      // 更新索引
      config.currentIndex = nextIndex;
      config.lastRotate = Date.now();
      await chrome.storage.local.set({ autoRotateConfig: data.autoRotateConfig });
      
      // 发送通知
      const settings = (await chrome.storage.local.get(['settings'])).settings || {};
      if (settings.showNotification) {
        chrome.notifications.create(`rotate-${domain}-${Date.now()}`, {
          type: 'basic',
          iconUrl: 'icons/icon.svg',
          title: '自动切换账号',
          message: `已切换到「${nextProfile}」(${domain})`,
          priority: 0
        });
      }
      
      // 刷新相关标签页
      if (result.relatedTabIds) {
        for (const tabId of result.relatedTabIds) {
          try { await chrome.tabs.reload(tabId); } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.error('自动轮换失败:', e);
  }
}

// 获取自动轮换配置
async function getAutoRotateConfig(domain) {
  const mainDomain = getMainDomain(domain);
  const data = await chrome.storage.local.get(['autoRotateConfig']);
  return data.autoRotateConfig?.[mainDomain] || null;
}

// ==================== Alarms 监听 ====================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'healthCheck') {
    await checkAllProfilesHealth();
  } else if (alarm.name.startsWith('rotate-')) {
    const domain = alarm.name.replace('rotate-', '');
    await executeAutoRotate(domain);
  }
});

// ==================== 通知点击 ====================

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === 'health-warning') {
    // 打开 popup
    chrome.action.openPopup().catch(() => {});
  }
  chrome.notifications.clear(notificationId);
});
