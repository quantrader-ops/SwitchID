// storage-restore.js - 在 document_start 时机恢复 localStorage/sessionStorage
// 这个脚本必须在页面任何 JavaScript 执行之前运行
// 策略：使用同步的 script 标签注入来确保在页面 JS 之前执行

console.log('[storage-restore] ========== 脚本开始 (document_start) ==========');
console.log('[storage-restore] 时间戳:', Date.now());
console.log('[storage-restore] URL:', window.location.href);

(function() {
  'use strict';
  
  // 只在主框架执行
  if (window !== window.top) {
    console.log('[storage-restore] 非主框架，跳过');
    return;
  }
  
  // 获取当前域名的主域名
  function getMainDomain(hostname) {
    const parts = hostname.split('.');
    const specialTLDs = ['co.uk', 'com.cn', 'com.hk', 'co.jp', 'com.tw', 'co.kr', 'com.au'];
    
    for (const tld of specialTLDs) {
      if (hostname.endsWith('.' + tld)) {
        const tldParts = tld.split('.').length;
        return parts.slice(-(tldParts + 1)).join('.');
      }
    }
    
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return hostname;
  }
  
  const mainDomain = getMainDomain(window.location.hostname);
  const storageKey = `pending_restore_${mainDomain}`;
  
  console.log('[storage-restore] 主域名:', mainDomain);
  console.log('[storage-restore] 当前 localStorage 项数:', Object.keys(localStorage).length);
  
  // 方法1：检查 localStorage 中是否有预设置的恢复标记
  // 这是最快的方式，因为 localStorage 是同步的
  // preRestoreStorage 在刷新前设置了数据和标记
  const restoreMarker = localStorage.getItem('__pending_restore_marker__');
  console.log('[storage-restore] 检查预设置标记:', restoreMarker ? '存在' : '不存在');
  
  if (restoreMarker) {
    try {
      const markerData = JSON.parse(restoreMarker);
      console.log('[storage-restore] 标记数据:', markerData);
      
      if (markerData.domain === mainDomain && Date.now() - markerData.timestamp < 10000) {
        console.log('[storage-restore] ✓ 标记有效，数据已由 preRestoreStorage 恢复，共', markerData.count, '项');
        
        // 验证 userToken
        const userToken = localStorage.getItem('userToken');
        if (userToken) {
          console.log('[storage-restore] ✓ userToken 存在，长度:', userToken.length);
        } else {
          console.log('[storage-restore] ✗ userToken 不存在！');
        }
        
        // 打印所有 localStorage keys
        console.log('[storage-restore] 当前 localStorage keys:', Object.keys(localStorage));
        
        localStorage.removeItem('__pending_restore_marker__');
        console.log('[storage-restore] ========== 验证完成 ==========');
        // 数据已经在 preRestoreStorage 中设置好了，不需要再做任何事
        return;
      } else {
        console.log('[storage-restore] 标记无效（域名不匹配或已超时）');
      }
    } catch (e) {
      console.log('[storage-restore] 解析标记失败:', e);
    }
    localStorage.removeItem('__pending_restore_marker__');
  }
  
  // 方法2：从 chrome.storage.session 异步获取数据
  // 这是备用方案，用于 preRestoreStorage 没有执行的情况（比如直接刷新页面）
  console.log('[storage-restore] 尝试从 chrome.storage.session 获取数据...');
  
  chrome.storage.session.get([storageKey], function(data) {
    console.log('[storage-restore] chrome.storage.session 回调执行');
    const pendingData = data[storageKey];
    
    if (!pendingData) {
      console.log('[storage-restore] session storage 中无待恢复数据');
      console.log('[storage-restore] ========== 结束（无数据）==========');
      return;
    }
    
    console.log('[storage-restore] 找到待恢复数据:', {
      domain: pendingData.domain,
      clearOnly: pendingData.clearOnly,
      hasLocalStorage: !!pendingData.localStorage,
      localStorageCount: pendingData.localStorage ? Object.keys(pendingData.localStorage).length : 0,
      timestamp: pendingData.timestamp,
      age: Date.now() - pendingData.timestamp
    });
    
    // 检查是否超时（30秒内有效，增加超时时间）
    if (Date.now() - pendingData.timestamp >= 30000) {
      console.log('[storage-restore] 数据已超时，跳过');
      chrome.storage.session.remove([storageKey]);
      return;
    }
    
    console.log('[storage-restore] ========== 开始恢复 ==========');
    
    if (pendingData.clearOnly) {
      try {
        localStorage.clear();
        sessionStorage.clear();
        console.log('[storage-restore] ✓ 已清除存储');
      } catch (e) {
        console.error('[storage-restore] 清除存储失败:', e);
      }
    } else {
      let localRestored = 0;
      let sessionRestored = 0;
      
      // 恢复 localStorage
      if (pendingData.localStorage && typeof pendingData.localStorage === 'object') {
        try {
          const oldKeys = Object.keys(localStorage);
          localStorage.clear();
          console.log('[storage-restore] 已清除旧 localStorage，原有', oldKeys.length, '项');
          
          for (const [key, value] of Object.entries(pendingData.localStorage)) {
            if (value !== null && value !== undefined) {
              localStorage.setItem(key, value);
              localRestored++;
            }
          }
          console.log('[storage-restore] localStorage 恢复完成，共', localRestored, '项');
          
          // 验证 userToken
          const userToken = localStorage.getItem('userToken');
          if (userToken) {
            console.log('[storage-restore] ✓ userToken 已恢复，长度:', userToken.length);
          } else {
            console.log('[storage-restore] ✗ userToken 恢复失败！');
          }
        } catch (e) {
          console.error('[storage-restore] 恢复 localStorage 失败:', e);
        }
      }
      
      // 恢复 sessionStorage
      if (pendingData.sessionStorage && typeof pendingData.sessionStorage === 'object') {
        try {
          const fpConfig = sessionStorage.getItem('__fp_config__');
          sessionStorage.clear();
          if (fpConfig) {
            sessionStorage.setItem('__fp_config__', fpConfig);
          }
          for (const [key, value] of Object.entries(pendingData.sessionStorage)) {
            if (key !== '__fp_config__' && value !== null && value !== undefined) {
              sessionStorage.setItem(key, value);
              sessionRestored++;
            }
          }
          console.log('[storage-restore] sessionStorage 恢复完成，共', sessionRestored, '项');
        } catch (e) {
          console.error('[storage-restore] 恢复 sessionStorage 失败:', e);
        }
      }
      
      console.log('[storage-restore] ✓ 恢复完成 - localStorage:', localRestored, 'sessionStorage:', sessionRestored);
      console.log('[storage-restore] 当前 localStorage keys:', Object.keys(localStorage));
    }
    
    chrome.storage.session.remove([storageKey]);
    console.log('[storage-restore] ========== 恢复结束 ==========');
  });
})();
