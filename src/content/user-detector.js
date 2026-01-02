// user-detector.js - 从页面提取当前登录用户信息
// 在 ISOLATED world 执行，可以访问 DOM 和 chrome API

(function() {
  'use strict';
  
  if (typeof chrome === 'undefined' || !chrome.runtime) return;
  
  // 监听来自 popup/background 的请求
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'detectUser') {
      const userInfo = detectUserInfo();
      sendResponse({ success: true, userInfo });
    }
    return true;
  });
  
  // 主流网站的特定选择器
  const siteSelectors = {
    // ==================== AI 平台 ====================
    // DeepSeek
    'deepseek.com': [
      '.user-info .username',
      '.user-name',
      '[class*="UserInfo"] span',
      '[class*="user-info"] span',
      '.avatar-wrapper + span',
      '[data-testid="user-menu"] span'
    ],
    // ChatGPT/OpenAI
    'chat.openai.com': [
      '[data-testid="profile-button"] span',
      '.text-token-text-primary'
    ],
    'openai.com': [
      '.user-menu span',
      '[data-testid="user-menu"]'
    ],
    // Claude
    'claude.ai': [
      '[data-testid="user-menu"] span',
      '.user-info span'
    ],
    
    // ==================== 跨境电商平台 ====================
    // Amazon（全球）
    'amazon.com': [
      '#nav-link-accountList-nav-line-1',
      '.nav-line-1-container .nav-line-1',
      '#nav-link-accountList span.nav-line-1'
    ],
    'amazon.co.uk': [
      '#nav-link-accountList-nav-line-1',
      '.nav-line-1-container .nav-line-1'
    ],
    'amazon.de': [
      '#nav-link-accountList-nav-line-1',
      '.nav-line-1-container .nav-line-1'
    ],
    'amazon.co.jp': [
      '#nav-link-accountList-nav-line-1',
      '.nav-line-1-container .nav-line-1'
    ],
    // eBay
    'ebay.com': [
      '#gh-ug > a > span',
      '#gh-eb-u > a',
      '.gh-identity__greeting'
    ],
    // Shopee（东南亚）
    'shopee.sg': [
      '.navbar__username',
      '.stardust-dropdown__item-header'
    ],
    'shopee.com.my': [
      '.navbar__username',
      '.stardust-dropdown__item-header'
    ],
    'shopee.co.th': [
      '.navbar__username',
      '.stardust-dropdown__item-header'
    ],
    'shopee.vn': [
      '.navbar__username',
      '.stardust-dropdown__item-header'
    ],
    'shopee.ph': [
      '.navbar__username',
      '.stardust-dropdown__item-header'
    ],
    'shopee.co.id': [
      '.navbar__username',
      '.stardust-dropdown__item-header'
    ],
    'shopee.tw': [
      '.navbar__username',
      '.stardust-dropdown__item-header'
    ],
    // Lazada（东南亚）
    'lazada.sg': [
      '.my-account-name',
      '.lzd-header-account-name'
    ],
    'lazada.com.my': [
      '.my-account-name',
      '.lzd-header-account-name'
    ],
    'lazada.co.th': [
      '.my-account-name',
      '.lzd-header-account-name'
    ],
    'lazada.vn': [
      '.my-account-name',
      '.lzd-header-account-name'
    ],
    'lazada.com.ph': [
      '.my-account-name',
      '.lzd-header-account-name'
    ],
    'lazada.co.id': [
      '.my-account-name',
      '.lzd-header-account-name'
    ],
    // AliExpress（速卖通）
    'aliexpress.com': [
      '.user-account-info .user-name',
      '.my-account-trigger .user-name',
      '[data-role="user-name"]'
    ],
    // Etsy
    'etsy.com': [
      '.wt-menu__trigger span',
      '[data-menu-id="signed-in-user-menu"] span'
    ],
    // Wish
    'wish.com': [
      '.NavAccountButton__name',
      '.AccountDropdown__userName'
    ],
    // Mercado Libre（拉美）
    'mercadolibre.com': [
      '.nav-header-user-name',
      '.nav-menu-user-info__name'
    ],
    'mercadolivre.com.br': [
      '.nav-header-user-name',
      '.nav-menu-user-info__name'
    ],
    
    // ==================== 社交媒体平台 ====================
    // TikTok
    'tiktok.com': [
      '[data-e2e="profile-username"]',
      '.user-username',
      '[data-e2e="user-title"]'
    ],
    // Instagram
    'instagram.com': [
      'header section > div > div > span',
      '._aacl._aaco._aacw._aacx._aad7._aade',
      '[data-testid="user-avatar"]'
    ],
    // LinkedIn
    'linkedin.com': [
      '.global-nav__me-photo',
      '.feed-identity-module__actor-meta',
      '.t-16.t-black.t-bold'
    ],
    // Pinterest
    'pinterest.com': [
      '[data-test-id="header-profile"] div',
      '.headerUserProfileButton span'
    ],
    // Reddit
    'reddit.com': [
      '#USER_DROPDOWN_ID span',
      '[id^="email-collection-tooltip-id"] span',
      'header button[aria-label] span'
    ],
    // Snapchat
    'snapchat.com': [
      '.AccountHeader_displayName',
      '.username-text'
    ],
    // Discord
    'discord.com': [
      '.nameTag-H6kSJ0',
      '[class*="usernameInnerRow"]'
    ],
    // Telegram Web
    'web.telegram.org': [
      '.peer-title',
      '.user-title'
    ],
    // WhatsApp Web
    'web.whatsapp.com': [
      '[data-testid="conversation-info-header"] span',
      '._21nHd span'
    ],
    
    // ==================== SEO/营销工具 ====================
    // Google Search Console
    'search.google.com': [
      '.gb_lb',
      '[data-email]'
    ],
    // Google Analytics
    'analytics.google.com': [
      '.gb_lb',
      '[data-email]'
    ],
    // Semrush
    'semrush.com': [
      '.srf-header__user-name',
      '.user-menu__name'
    ],
    // Ahrefs
    'ahrefs.com': [
      '.user-menu__name',
      '.header-user-name'
    ],
    // Moz
    'moz.com': [
      '.user-menu-name',
      '.account-name'
    ],
    
    // ==================== 原有网站 ====================
    // Microsoft / Bing / Outlook
    'bing.com': [
      '#id_n', // Bing 用户名
      '#id_l', // Bing 邮箱
      '.b_profile .b_text',
      '[data-m*="DisplayName"]'
    ],
    'microsoft.com': [
      '#mectrl_currentAccount_primary',
      '#mectrl_currentAccount_secondary',
      '.mectrl_truncate',
      '#O365_MainLink_Me_container .mectrl_truncate'
    ],
    'live.com': [
      '#mectrl_currentAccount_primary',
      '#mectrl_currentAccount_secondary',
      '#meControl .name',
      '.mectrl_truncate'
    ],
    'outlook.com': [
      '#mectrl_currentAccount_primary', // 主账号名
      '#mectrl_currentAccount_secondary', // 邮箱地址
      '#O365_MainLink_Me_container .mectrl_truncate',
      '.mectrl_currentAccount_name',
      '[data-automationid="mectrl_currentAccount_primary"]',
      '.o365cs-me-tile-name',
      '.ms-Persona-primaryText',
      '#meInitialsButton'
    ],
    'outlook.live.com': [
      '#mectrl_currentAccount_primary',
      '#mectrl_currentAccount_secondary',
      '.mectrl_truncate',
      '.o365cs-me-tile-name',
      '.ms-Persona-primaryText'
    ],
    'office.com': [
      '#mectrl_currentAccount_primary',
      '#mectrl_currentAccount_secondary',
      '.mectrl_truncate',
      '.o365cs-me-tile-name'
    ],
    'office365.com': [
      '#mectrl_currentAccount_primary',
      '#mectrl_currentAccount_secondary',
      '.mectrl_truncate'
    ],
    // Google
    'google.com': [
      '[data-email]',
      '.gb_lb', // Google 账号名
      '.gb_mb', // Google 邮箱
      '[aria-label*="Google 账号"]',
      '.gbii' // 头像 alt
    ],
    'youtube.com': [
      '#account-name',
      'yt-formatted-string#account-name',
      '#channel-title'
    ],
    // 淘宝/天猫/阿里
    'taobao.com': [
      '.site-nav-login-info-nick',
      '.site-nav-user a',
      '#J_SiteNavLogin .s-name'
    ],
    'tmall.com': [
      '.sn-login .sn-user-name',
      '.member-nick'
    ],
    'alipay.com': [
      '.user-name',
      '.realname'
    ],
    // 京东
    'jd.com': [
      '.nickname',
      '.user-name',
      '#ttbar-login .link-user'
    ],
    // 拼多多
    'pinduoduo.com': [
      '.user-name',
      '.nickname'
    ],
    // 微博
    'weibo.com': [
      '.gn_name',
      '[node-type="username"]',
      '.username'
    ],
    // 小红书
    'xiaohongshu.com': [
      '.user-name',
      '.nickname'
    ],
    // GitHub
    'github.com': [
      '.AppHeader-user button img[alt]',
      '[data-login]',
      '.Header-link .avatar'
    ],
    // Twitter/X
    'twitter.com': [
      '[data-testid="UserName"]',
      '[data-testid="UserCell"] span'
    ],
    'x.com': [
      '[data-testid="UserName"]',
      '[data-testid="UserCell"] span'
    ],
    // Facebook
    'facebook.com': [
      '[data-pagelet="ProfileTilesFeed"] h1',
      'span[dir="auto"]',
      '[aria-label="Your profile"] span'
    ],
    // 抖音
    'douyin.com': [
      '.account-name',
      '[data-e2e="user-info-nickname"]'
    ],
    // B站
    'bilibili.com': [
      '.nickname-text',
      '.header-entry-mini .nickname',
      '#i_cec498 .nickname'
    ],
    // 知乎
    'zhihu.com': [
      '.AppHeader-profile .Popover div',
      '.ProfileHeader-name'
    ],
    // 豆瓣
    'douban.com': [
      '.nav-user-account span',
      '#db-global-nav .bn-more span'
    ]
  };
  
  // 通用选择器（按优先级排序）
  const genericSelectors = [
    // 明确的用户名/邮箱属性
    '[data-username]',
    '[data-user-name]',
    '[data-email]',
    '[data-user-email]',
    '[data-nick]',
    '[data-nickname]',
    '[data-account]',
    
    // 常见 class/id
    '.user-name',
    '.username',
    '.user_name',
    '.userName',
    '.nickname',
    '.nick-name',
    '.nick_name',
    '.nickName',
    '.account-name',
    '.accountName',
    '.display-name',
    '.displayName',
    '.profile-name',
    '.login-name',
    '.logged-user',
    '.current-user',
    
    '#username',
    '#user-name',
    '#userName',
    '#nickname',
    '#nick-name',
    '#nickName',
    '#account-name',
    '#accountName',
    '#displayName',
    '#user-info-name',
    
    // 头像旁边的文字
    '.avatar + span',
    '.avatar ~ span',
    '.user-avatar + *',
    '.profile-avatar + *',
    
    // 导航栏用户区域
    '.nav-user .name',
    '.header-user .name',
    '.top-nav .user',
    '.site-nav .user',
    
    // aria 标签
    '[aria-label*="用户"]',
    '[aria-label*="账号"]',
    '[aria-label*="account"]',
    '[aria-label*="user"]',
    '[aria-label*="profile"]'
  ];

  // 邮箱正则
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  // 检测用户信息
  function detectUserInfo() {
    const result = {
      username: null,
      email: null,
      displayName: null,
      avatar: null,
      source: null
    };
    
    const hostname = window.location.hostname;
    
    // 特殊处理：Microsoft/Outlook 系列
    if (hostname.includes('outlook') || hostname.includes('live.com') || hostname.includes('office')) {
      const msUser = detectMicrosoftUser();
      if (msUser && (msUser.email || msUser.username)) {
        Object.assign(result, msUser);
        result.source = 'microsoft-special';
        return result;
      }
    }
    
    // 1. 先尝试网站特定选择器
    for (const [domain, selectors] of Object.entries(siteSelectors)) {
      if (hostname.includes(domain)) {
        for (const selector of selectors) {
          const found = trySelector(selector);
          if (found) {
            Object.assign(result, found);
            result.source = 'site-specific';
            if (result.email || result.username) return result;
          }
        }
      }
    }
    
    // 2. 尝试通用选择器
    for (const selector of genericSelectors) {
      const found = trySelector(selector);
      if (found && (found.email || found.username || found.displayName)) {
        Object.assign(result, found);
        result.source = 'generic';
        if (result.email || result.username) return result;
      }
    }
    
    // 3. 尝试从 meta 标签获取
    const metaUser = getMetaUserInfo();
    if (metaUser) {
      Object.assign(result, metaUser);
      result.source = 'meta';
    }
    
    // 4. 尝试从页面 JSON-LD 获取
    const jsonLdUser = getJsonLdUserInfo();
    if (jsonLdUser) {
      Object.assign(result, jsonLdUser);
      result.source = 'json-ld';
    }
    
    return result;
  }
  
  // 特殊处理 Microsoft 系列网站
  function detectMicrosoftUser() {
    let displayName = null;
    let email = null;
    
    // 方式1：直接获取账号详情（即使元素可能隐藏）
    const primaryEl = document.querySelector('#mectrl_currentAccount_primary');
    const secondaryEl = document.querySelector('#mectrl_currentAccount_secondary');
    
    if (primaryEl) {
      const text = primaryEl.textContent.trim();
      if (text && text.length > 1 && text.length < 50) {
        displayName = text;
      }
    }
    
    if (secondaryEl) {
      const text = secondaryEl.textContent.trim();
      if (emailRegex.test(text)) {
        email = text;
      }
    }
    
    // 如果已经找到，直接返回
    if (displayName || email) {
      return {
        displayName: displayName,
        email: email,
        username: email ? email.split('@')[0] : displayName
      };
    }
    
    // 方式2：从其他选择器获取
    const primarySelectors = [
      '.mectrl_currentAccount_name',
      '.o365cs-me-tile-name',
      '.ms-Persona-primaryText',
      '#O365_MainLink_Me_container .mectrl_truncate'
    ];
    
    const secondarySelectors = [
      '.mectrl_currentAccount_secondary'
    ];
    
    // 获取显示名称
    for (const sel of primarySelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent) {
        const text = el.textContent.trim();
        if (text && text.length > 1 && text.length < 50) {
          displayName = text;
          break;
        }
      }
    }
    
    // 获取邮箱
    for (const sel of secondarySelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent) {
        const text = el.textContent.trim();
        if (emailRegex.test(text)) {
          email = text;
          break;
        }
      }
    }
    
    // 方式3：从 aria-label 获取
    if (!displayName) {
      const meButton = document.querySelector('#O365_MainLink_Me, #mectrl_main_trigger, [aria-label*="账户"], [aria-label*="Account"]');
      if (meButton) {
        const label = meButton.getAttribute('aria-label') || '';
        const match = label.match(/[-–]\s*(.+)$/) || label.match(/^(.+?)\s*[-–]/);
        if (match && match[1]) {
          displayName = match[1].trim();
        }
      }
    }
    
    // 方式4：从头像 title/alt 获取
    if (!displayName) {
      const avatar = document.querySelector('.mectrl_profilepic, .ms-Persona-image, #mectrl_headerPicture');
      if (avatar) {
        displayName = avatar.getAttribute('title') || avatar.getAttribute('alt');
      }
    }
    
    // 方式5：从 URL 参数获取
    if (!email) {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const loginHint = urlParams.get('login_hint') || urlParams.get('username');
        if (loginHint && emailRegex.test(loginHint)) {
          email = loginHint;
        }
      } catch (e) {}
    }
    
    if (displayName || email) {
      return {
        displayName: displayName,
        email: email,
        username: email ? email.split('@')[0] : displayName
      };
    }
    
    return null;
  }
  
  // 尝试选择器
  function trySelector(selector) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        // 检查元素是否可见
        if (!isVisible(el)) continue;
        
        // 获取文本内容
        let text = '';
        
        // 检查 data 属性
        const dataAttrs = ['data-username', 'data-email', 'data-nick', 'data-nickname', 'data-login', 'data-account'];
        for (const attr of dataAttrs) {
          if (el.hasAttribute(attr)) {
            text = el.getAttribute(attr);
            break;
          }
        }
        
        // 检查 aria-label
        if (!text && el.hasAttribute('aria-label')) {
          text = el.getAttribute('aria-label');
        }
        
        // 检查 alt（图片）
        if (!text && el.tagName === 'IMG' && el.alt) {
          text = el.alt;
        }
        
        // 获取文本内容
        if (!text) {
          text = el.textContent || el.innerText || '';
        }
        
        text = text.trim();
        
        // 过滤无效文本
        if (!text || text.length < 2 || text.length > 50) continue;
        if (/^(登录|注册|login|sign|log in|sign up|退出|logout)$/i.test(text)) continue;
        
        // 判断是邮箱还是用户名
        if (emailRegex.test(text)) {
          return { email: text, displayName: text.split('@')[0] };
        } else {
          return { username: text, displayName: text };
        }
      }
    } catch (e) {}
    return null;
  }
  
  // 检查元素是否可见
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           el.offsetParent !== null;
  }
  
  // 从 meta 标签获取
  function getMetaUserInfo() {
    const metas = [
      { name: 'user-name', key: 'username' },
      { name: 'username', key: 'username' },
      { name: 'user-email', key: 'email' },
      { name: 'author', key: 'displayName' },
      { property: 'profile:username', key: 'username' }
    ];
    
    for (const meta of metas) {
      let el;
      if (meta.name) {
        el = document.querySelector(`meta[name="${meta.name}"]`);
      } else if (meta.property) {
        el = document.querySelector(`meta[property="${meta.property}"]`);
      }
      if (el && el.content) {
        return { [meta.key]: el.content };
      }
    }
    return null;
  }
  
  // 从 JSON-LD 获取
  function getJsonLdUserInfo() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const data = JSON.parse(script.textContent);
        if (data['@type'] === 'Person' || data['@type'] === 'ProfilePage') {
          return {
            displayName: data.name || data.alternateName,
            email: data.email
          };
        }
      }
    } catch (e) {}
    return null;
  }
})();
