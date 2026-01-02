// fingerprint.js - 隔离世界脚本，负责与 background 通信
// 此脚本在 ISOLATED world 执行，可以访问 chrome.runtime API

(function() {
  'use strict';
  
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
    return;
  }
  
  /**
   * 获取当前页面的 localStorage 数据
   * 注意：content script 在 ISOLATED world 中可以访问页面的 localStorage
   */
  function getLocalStorageData() {
    try {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          data[key] = localStorage.getItem(key);
        }
      }
      console.log('[fingerprint.js] 获取 localStorage 成功，共', Object.keys(data).length, '项');
      console.log('[fingerprint.js] localStorage keys:', Object.keys(data));
      // 特别检查 userToken（DeepSeek 关键数据）
      if (data.userToken) {
        console.log('[fingerprint.js] 发现 userToken，长度:', data.userToken.length);
      }
      return data;
    } catch (e) {
      console.error('[fingerprint.js] 获取 localStorage 失败:', e);
      return null;
    }
  }
  
  /**
   * 获取当前页面的 sessionStorage 数据（排除指纹配置）
   */
  function getSessionStorageData() {
    try {
      const data = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        // 排除指纹配置
        if (key && key !== '__fp_config__') {
          data[key] = sessionStorage.getItem(key);
        }
      }
      return data;
    } catch (e) {
      console.error('获取 sessionStorage 失败:', e);
      return null;
    }
  }
  
  /**
   * 恢复 localStorage 数据
   */
  function restoreLocalStorageData(data) {
    try {
      if (!data || typeof data !== 'object') return false;
      
      // 先清除现有数据
      localStorage.clear();
      
      // 恢复保存的数据
      for (const [key, value] of Object.entries(data)) {
        if (value !== null && value !== undefined) {
          localStorage.setItem(key, value);
        }
      }
      return true;
    } catch (e) {
      console.error('恢复 localStorage 失败:', e);
      return false;
    }
  }
  
  /**
   * 恢复 sessionStorage 数据（保留指纹配置）
   */
  function restoreSessionStorageData(data) {
    try {
      if (!data || typeof data !== 'object') return false;
      
      // 保存指纹配置
      const fpConfig = sessionStorage.getItem('__fp_config__');
      
      // 清除现有数据
      sessionStorage.clear();
      
      // 恢复指纹配置
      if (fpConfig) {
        sessionStorage.setItem('__fp_config__', fpConfig);
      }
      
      // 恢复保存的数据
      for (const [key, value] of Object.entries(data)) {
        if (key !== '__fp_config__' && value !== null && value !== undefined) {
          sessionStorage.setItem(key, value);
        }
      }
      return true;
    } catch (e) {
      console.error('恢复 sessionStorage 失败:', e);
      return false;
    }
  }
  
  /**
   * 清除所有 IndexedDB 数据库
   */
  async function clearAllIndexedDB() {
    try {
      // 获取所有数据库名称
      if (indexedDB.databases) {
        const databases = await indexedDB.databases();
        for (const db of databases) {
          if (db.name) {
            try {
              indexedDB.deleteDatabase(db.name);
            } catch (e) {}
          }
        }
      } else {
        // 旧版浏览器不支持 databases()，尝试删除常见的数据库名
        const commonDBNames = [
          'localforage', 'keyval-store', 'firebaseLocalStorageDb',
          '__dbnames', 'idb', 'level-js', 'localStorageWrapper'
        ];
        for (const name of commonDBNames) {
          try {
            indexedDB.deleteDatabase(name);
          } catch (e) {}
        }
      }
      return true;
    } catch (e) {
      console.error('清除 IndexedDB 失败:', e);
      return false;
    }
  }
  
  /**
   * 清除 Cache Storage
   */
  async function clearCacheStorage() {
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          await caches.delete(name);
        }
      }
      return true;
    } catch (e) {
      console.error('清除 Cache Storage 失败:', e);
      return false;
    }
  }
  
  // 监听来自 background 的消息
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'applyFingerprint') {
      // 将配置写入 sessionStorage，供主世界脚本读取
      if (request.fingerprint) {
        try {
          sessionStorage.setItem('__fp_config__', JSON.stringify(request.fingerprint));
        } catch (e) {}
      }
      sendResponse({ success: true });
    }
    
    // 获取 localStorage 数据（用于保存账号时）
    if (request.action === 'getLocalStorage') {
      const data = getLocalStorageData();
      sendResponse({ success: true, data });
      return true;
    }
    
    // 获取 sessionStorage 数据（用于保存账号时）
    if (request.action === 'getSessionStorage') {
      const data = getSessionStorageData();
      sendResponse({ success: true, data });
      return true;
    }
    
    // 获取所有存储数据（localStorage + sessionStorage）
    if (request.action === 'getAllStorage') {
      const localStorage = getLocalStorageData();
      const sessionStorage = getSessionStorageData();
      sendResponse({ 
        success: true, 
        localStorage, 
        sessionStorage,
        localStorageCount: localStorage ? Object.keys(localStorage).length : 0,
        sessionStorageCount: sessionStorage ? Object.keys(sessionStorage).length : 0
      });
      return true;
    }
    
    // 恢复 localStorage 数据（用于切换账号时）
    if (request.action === 'restoreLocalStorage') {
      const success = restoreLocalStorageData(request.data);
      sendResponse({ success });
      return true;
    }
    
    // 恢复 sessionStorage 数据（用于切换账号时）
    if (request.action === 'restoreSessionStorage') {
      const success = restoreSessionStorageData(request.data);
      sendResponse({ success });
      return true;
    }
    
    // 恢复所有存储数据
    if (request.action === 'restoreAllStorage') {
      const localResult = request.localStorage ? restoreLocalStorageData(request.localStorage) : true;
      const sessionResult = request.sessionStorage ? restoreSessionStorageData(request.sessionStorage) : true;
      sendResponse({ success: localResult && sessionResult });
      return true;
    }
    
    // 清除本地存储（用于账号切换时）- 增强版
    if (request.action === 'clearStorage') {
      (async () => {
        const results = {
          localStorage: false,
          sessionStorage: false,
          indexedDB: false,
          cacheStorage: false
        };
        
        try {
          // 1. 清除 localStorage
          localStorage.clear();
          results.localStorage = true;
        } catch (e) {
          console.error('清除 localStorage 失败:', e);
        }
        
        try {
          // 2. 清除 sessionStorage（保留指纹配置）
          const fpConfig = sessionStorage.getItem('__fp_config__');
          sessionStorage.clear();
          if (fpConfig) {
            sessionStorage.setItem('__fp_config__', fpConfig);
          }
          results.sessionStorage = true;
        } catch (e) {
          console.error('清除 sessionStorage 失败:', e);
        }
        
        // 3. 清除 IndexedDB
        results.indexedDB = await clearAllIndexedDB();
        
        // 4. 清除 Cache Storage（可选，根据请求参数）
        if (request.clearCache !== false) {
          results.cacheStorage = await clearCacheStorage();
        }
        
        sendResponse({ success: true, results });
      })();
      
      return true; // 保持消息通道开放（异步响应）
    }
    
    // 获取存储状态（用于调试）
    if (request.action === 'getStorageInfo') {
      (async () => {
        const info = {
          localStorageKeys: Object.keys(localStorage).length,
          sessionStorageKeys: Object.keys(sessionStorage).length,
          indexedDBCount: 0
        };
        
        try {
          if (indexedDB.databases) {
            const dbs = await indexedDB.databases();
            info.indexedDBCount = dbs.length;
            info.indexedDBNames = dbs.map(db => db.name);
          }
        } catch (e) {}
        
        sendResponse({ success: true, info });
      })();
      
      return true;
    }
    
    return true;
  });
  
  // 页面加载时请求指纹配置
  try {
    chrome.runtime.sendMessage({ 
      action: 'getFingerprint', 
      domain: window.location.hostname 
    }, (response) => {
      if (chrome.runtime.lastError) return;
      
      if (response && response.fingerprint) {
        // 将配置写入 sessionStorage，供主世界脚本读取
        // 注意：主世界脚本可能已经执行完毕，所以这里也尝试通过 window 传递
        try {
          sessionStorage.setItem('__fp_config__', JSON.stringify(response.fingerprint));
          
          // 备用方案：通过自定义事件通知主世界
          window.dispatchEvent(new CustomEvent('__fp_config_ready__', {
            detail: response.fingerprint
          }));
        } catch (e) {}
      }
    });
  } catch (e) {}
})();
