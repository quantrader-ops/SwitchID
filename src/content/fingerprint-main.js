// fingerprint-main.js - 专业级指纹伪装模块
// 在页面主世界 (MAIN world) 执行，绕过 CSP 限制
// 参考 my-fingerprint 项目的专业实现

(function() {
  'use strict';
  
  // 防止在不支持的页面执行
  try {
    if (!window || !document) return;
  } catch (e) {
    return;
  }
  
  // 防止重复注入
  if (window.__fp_applied__) return;
  window.__fp_applied__ = true;
  
  let config = null;
  
  // ==================== 工具函数 ====================
  
  /**
   * Mulberry32 伪随机数生成器
   * 基于种子生成可重复的随机数序列
   */
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
  
  /**
   * 字符串哈希函数
   */
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash % Number.MAX_SAFE_INTEGER);
  }
  
  /**
   * 生成 Canvas 噪声数组
   */
  function generateCanvasNoise(seed) {
    const rand = makeSeededRandom(seed, 255, 0);
    const noise = [];
    for (let i = 0; i < 10; i++) {
      noise.push(Math.floor(rand()));
    }
    return noise;
  }
  
  /**
   * 生成 WebGL 噪声位置数组 [-1, 1]
   */
  function generateWebglNoise(seed) {
    const rand = makeSeededRandom(seed, 1, -1);
    const positions = [];
    for (let i = 0; i < 20; i++) {
      positions.push(rand());
    }
    return positions;
  }
  
  /**
   * 生成字体噪声
   */
  function generateFontNoise(seed, mark) {
    const random = seededRandom((seed + hashString(mark)) % Number.MAX_SAFE_INTEGER, 3, 0);
    if ((random * 10) % 1 < 0.9) return 0;
    return Math.floor(random) - 1;
  }
  
  // ==================== 核心 Hook 函数 ====================
  
  /**
   * 安全地定义属性
   */
  function safeDefineProperty(obj, prop, descriptor) {
    try {
      Object.defineProperty(obj, prop, descriptor);
      return true;
    } catch (e) {
      return false;
    }
  }
  
  // ==================== Canvas 2D 指纹 ====================
  
  function hookCanvas2D(seed) {
    if (seed == null) return;
    
    const noise = generateCanvasNoise(seed);
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    
    /**
     * 智能噪声注入 - 只在边缘像素添加噪声
     * 检测周围像素是否相同，只在不同的地方加噪声，避免破坏图像
     */
    function addSmartNoise(imageData, noiseArr) {
      const data = imageData.data;
      const width = imageData.width;
      const height = imageData.height;
      
      let noiseIndex = 0;
      
      // 检测两个像素是否相同
      function pixelsEqual(idx1, idx2) {
        return data[idx1] === data[idx2] &&
               data[idx1 + 1] === data[idx2 + 1] &&
               data[idx1 + 2] === data[idx2 + 2] &&
               data[idx1 + 3] === data[idx2 + 3];
      }
      
      // 遍历内部像素（跳过边缘）
      for (let row = 1; row < height - 2 && noiseIndex < noiseArr.length; row += 2) {
        for (let col = 1; col < width - 2 && noiseIndex < noiseArr.length; col += 2) {
          const centerIdx = (row * width + col) * 4;
          const upIdx = ((row - 1) * width + col) * 4;
          const downIdx = ((row + 1) * width + col) * 4;
          const leftIdx = (row * width + (col - 1)) * 4;
          const rightIdx = (row * width + (col + 1)) * 4;
          
          // 只在周围像素都不同的位置添加噪声（边缘检测）
          if (!pixelsEqual(centerIdx, upIdx) &&
              !pixelsEqual(centerIdx, downIdx) &&
              !pixelsEqual(centerIdx, leftIdx) &&
              !pixelsEqual(centerIdx, rightIdx)) {
            // 只修改 alpha 通道，最小化视觉影响
            data[centerIdx + 3] = noiseArr[noiseIndex++] % 256;
          }
        }
      }
      
      return imageData;
    }
    
    // Hook getImageData
    CanvasRenderingContext2D.prototype.getImageData = function(...args) {
      const imageData = originalGetImageData.apply(this, args);
      return addSmartNoise(imageData, noise);
    };
    
    // Hook toDataURL - 不修改原始 canvas
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      const ctx = this.getContext('2d');
      if (ctx && this.width > 0 && this.height > 0) {
        try {
          // 创建临时 canvas 来添加噪声
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = this.width;
          tempCanvas.height = this.height;
          const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
          
          // 复制原始内容
          tempCtx.drawImage(this, 0, 0);
          
          // 获取并添加噪声
          const imageData = originalGetImageData.call(tempCtx, 0, 0, this.width, this.height);
          addSmartNoise(imageData, noise);
          tempCtx.putImageData(imageData, 0, 0);
          
          // 从临时 canvas 导出
          return originalToDataURL.apply(tempCanvas, args);
        } catch (e) {
          // 跨域 canvas 等情况，回退到原始方法
        }
      }
      return originalToDataURL.apply(this, args);
    };
    
    // Hook toBlob
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      const ctx = this.getContext('2d');
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
    
    const noisePositions = seed != null ? generateWebglNoise(seed) : null;
    
    // Hook getParameter - GPU 信息伪装
    if (gpuInfo) {
      const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
      const originalGetParameter2 = WebGL2RenderingContext?.prototype?.getParameter;
      
      function spoofGetParameter(original) {
        return function(parameter) {
          // UNMASKED_VENDOR_WEBGL = 37445
          // UNMASKED_RENDERER_WEBGL = 37446
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
    
    // Hook readPixels - 渲染噪声
    if (noisePositions) {
      const originalReadPixels = WebGLRenderingContext.prototype.readPixels;
      const originalReadPixels2 = WebGL2RenderingContext?.prototype?.readPixels;
      
      /**
       * 在 WebGL 上下文绘制噪声点
       */
      function drawNoiseToWebgl(gl) {
        try {
          const vertexShaderSource = 'attribute vec4 noise;void main(){gl_Position=noise;gl_PointSize=0.001;}';
          const fragmentShaderSource = 'void main(){gl_FragColor=vec4(0.0,0.0,0.0,0.01);}';
          
          const createShader = (type, source) => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            return shader;
          };
          
          const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
          const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
          if (!vertexShader || !fragmentShader) return;
          
          const program = gl.createProgram();
          if (!program) return;
          
          gl.attachShader(program, vertexShader);
          gl.attachShader(program, fragmentShader);
          gl.linkProgram(program);
          gl.useProgram(program);
          
          const positions = new Float32Array(noisePositions);
          const positionBuffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
          
          const noiseAttr = gl.getAttribLocation(program, 'noise');
          gl.enableVertexAttribArray(noiseAttr);
          gl.vertexAttribPointer(noiseAttr, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.POINTS, 0, 1);
          
          // 清理
          gl.deleteShader(vertexShader);
          gl.deleteShader(fragmentShader);
          gl.deleteProgram(program);
          gl.deleteBuffer(positionBuffer);
        } catch (e) {}
      }
      
      function spoofReadPixels(original) {
        return function(...args) {
          drawNoiseToWebgl(this);
          return original.apply(this, args);
        };
      }
      
      WebGLRenderingContext.prototype.readPixels = spoofReadPixels(originalReadPixels);
      if (WebGL2RenderingContext) {
        WebGL2RenderingContext.prototype.readPixels = spoofReadPixels(originalReadPixels2);
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
      
      // 避免重复处理
      if (processedBuffers.has(data)) return data;
      
      // 添加微小噪声
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
    
    // Hook copyFromChannel/copyToChannel - 确保通过这些方法获取的数据也被处理
    const originalCopyFromChannel = AudioBuffer.prototype.copyFromChannel;
    const originalCopyToChannel = AudioBuffer.prototype.copyToChannel;
    
    AudioBuffer.prototype.copyFromChannel = function(destination, channelNumber, startInChannel) {
      // 先触发 getChannelData 来添加噪声
      this.getChannelData(channelNumber);
      return originalCopyFromChannel.call(this, destination, channelNumber, startInChannel);
    };
    
    AudioBuffer.prototype.copyToChannel = function(source, channelNumber, startInChannel) {
      // 先触发 getChannelData 来添加噪声
      this.getChannelData(channelNumber);
      return originalCopyToChannel.call(this, source, channelNumber, startInChannel);
    };
    
    // Hook DynamicsCompressorNode.reduction
    if (typeof DynamicsCompressorNode !== 'undefined') {
      const dcNoise = seededRandom(seed) * 1e-7;
      const reductionDesc = Object.getOwnPropertyDescriptor(DynamicsCompressorNode.prototype, 'reduction');
      
      if (reductionDesc && reductionDesc.get) {
        const originalGetter = reductionDesc.get;
        Object.defineProperty(DynamicsCompressorNode.prototype, 'reduction', {
          get: function() {
            const res = originalGetter.call(this);
            return (typeof res === 'number' && res !== 0) ? res + dcNoise : res;
          },
          configurable: true
        });
      }
    }
  }

  
  // ==================== Font 指纹 ====================
  
  function hookFont(seed) {
    if (seed == null) return;
    
    // Hook offsetWidth/offsetHeight
    const offsetProps = ['offsetWidth', 'offsetHeight'];
    
    offsetProps.forEach(prop => {
      const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
      if (desc && desc.get) {
        const originalGetter = desc.get;
        Object.defineProperty(HTMLElement.prototype, prop, {
          get: function() {
            const result = originalGetter.call(this);
            const fontFamily = this.style?.fontFamily || '';
            const mark = fontFamily + prop + result;
            return result + generateFontNoise(seed, mark);
          },
          configurable: true
        });
      }
    });
    
    // Hook FontFace 构造函数
    if (typeof FontFace !== 'undefined') {
      const OriginalFontFace = FontFace;
      window.FontFace = function(family, source, descriptors) {
        if (typeof source === 'string' && source.startsWith('local(')) {
          const name = source.substring(source.indexOf('(') + 1, source.indexOf(')'));
          const rand = seededRandom(name + seed, 1, 0);
          // 小概率返回不存在的字体，干扰字体检测
          if (rand < 0.02) {
            source = `local("${rand}")`;
          } else if (rand < 0.04) {
            source = 'local("Arial")';
          }
        }
        return new OriginalFontFace(family, source, descriptors);
      };
      window.FontFace.prototype = OriginalFontFace.prototype;
    }
  }
  
  // ==================== DOMRect/ClientRects 指纹 ====================
  
  function hookDOMRect(seed) {
    if (seed == null) return;
    
    const noise = seededRandom(seed, 1e-6, -1e-6);
    
    // Hook getBoundingClientRect
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function() {
      const rect = originalGetBoundingClientRect.call(this);
      if (rect) {
        // 直接修改 DOMRect 对象（它是可写的）
        if (rect.x !== 0) rect.x += noise;
        if (rect.width !== 0) rect.width += noise;
      }
      return rect;
    };
    
    // Hook getClientRects
    const originalGetClientRects = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function() {
      const rects = originalGetClientRects.call(this);
      // 遍历 DOMRectList 中的每个 rect 并添加噪声
      if (rects && rects.length > 0) {
        for (let i = 0; i < rects.length; i++) {
          const rect = rects[i];
          if (rect.x !== 0) rect.x += noise;
          if (rect.width !== 0) rect.width += noise;
        }
      }
      return rects;
    };
    
    // Range 的相同方法
    if (typeof Range !== 'undefined') {
      const originalRangeGetBoundingClientRect = Range.prototype.getBoundingClientRect;
      Range.prototype.getBoundingClientRect = function() {
        const rect = originalRangeGetBoundingClientRect.call(this);
        if (rect) {
          if (rect.x !== 0) rect.x += noise;
          if (rect.width !== 0) rect.width += noise;
        }
        return rect;
      };
      
      const originalRangeGetClientRects = Range.prototype.getClientRects;
      Range.prototype.getClientRects = function() {
        const rects = originalRangeGetClientRects.call(this);
        if (rects && rects.length > 0) {
          for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            if (rect.x !== 0) rect.x += noise;
            if (rect.width !== 0) rect.width += noise;
          }
        }
        return rects;
      };
    }
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
        safeDefineProperty(navigator, key, {
          get: () => value,
          configurable: true
        });
      }
    });
    
    // Hook userAgentData (Client Hints API)
    if (cfg.userAgentData && typeof navigator.userAgentData !== 'undefined') {
      const uaData = cfg.userAgentData;
      
      // 创建伪装的 brands 数组
      const fakeBrands = uaData.brands || [
        { brand: 'Chromium', version: '120' },
        { brand: 'Google Chrome', version: '120' },
        { brand: 'Not_A Brand', version: '8' }
      ];
      
      const fakeFullVersionList = uaData.fullVersionList || fakeBrands.map(b => ({
        brand: b.brand,
        version: b.version + '.0.0.0'
      }));
      
      // 创建代理对象
      const userAgentDataProxy = {
        brands: fakeBrands,
        mobile: uaData.mobile ?? false,
        platform: uaData.platform || cfg.platform || 'Windows',
        
        // getHighEntropyValues 返回更详细的信息
        getHighEntropyValues: function(hints) {
          return Promise.resolve({
            architecture: uaData.architecture || 'x86',
            bitness: uaData.bitness || '64',
            brands: fakeBrands,
            fullVersionList: fakeFullVersionList,
            mobile: uaData.mobile ?? false,
            model: uaData.model || '',
            platform: uaData.platform || cfg.platform || 'Windows',
            platformVersion: uaData.platformVersion || '10.0.0',
            uaFullVersion: uaData.uaFullVersion || '120.0.0.0',
            formFactors: uaData.formFactors || ['Desktop']
          });
        },
        
        toJSON: function() {
          return {
            brands: fakeBrands,
            mobile: uaData.mobile ?? false,
            platform: uaData.platform || cfg.platform || 'Windows'
          };
        }
      };
      
      safeDefineProperty(navigator, 'userAgentData', {
        get: () => userAgentDataProxy,
        configurable: true
      });
    }
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
      props.availHeight = cfg.height - 40; // 减去任务栏高度
    }
    if (cfg.colorDepth != null) {
      props.colorDepth = cfg.colorDepth;
      props.pixelDepth = cfg.colorDepth;
    }
    
    Object.entries(props).forEach(([key, value]) => {
      if (value != null) {
        safeDefineProperty(screen, key, {
          get: () => value,
          configurable: true
        });
      }
    });
  }
  
  // ==================== Timezone 时区 ====================
  
  function hookTimezone(cfg) {
    if (!cfg || !cfg.zone) return;
    
    const timezone = cfg.zone;
    const offset = cfg.offset || 0; // 分钟
    const locale = cfg.locale || 'en-US';
    
    // 保存原始的 DateTimeFormat
    const OriginalDateTimeFormat = Intl.DateTimeFormat;
    
    /**
     * 获取标准化的日期时间部分
     */
    function getStandardDateTimeParts(date) {
      try {
        const formatter = new OriginalDateTimeFormat('en-US', {
          timeZone: timezone,
          weekday: 'short',
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZoneName: 'longOffset'
        });
        const parts = formatter.formatToParts(date);
        return parts.reduce((acc, cur) => {
          acc[cur.type] = cur.value;
          return acc;
        }, {});
      } catch (e) {
        return null;
      }
    }
    
    // Hook Intl.DateTimeFormat
    Intl.DateTimeFormat = function(locales, options) {
      locales = locales || locale;
      options = Object.assign({ timeZone: timezone }, options);
      return new OriginalDateTimeFormat(locales, options);
    };
    Intl.DateTimeFormat.prototype = OriginalDateTimeFormat.prototype;
    Intl.DateTimeFormat.supportedLocalesOf = OriginalDateTimeFormat.supportedLocalesOf;
    
    // Hook Date.prototype.getTimezoneOffset
    const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
    Date.prototype.getTimezoneOffset = function() {
      return offset * -1;
    };
    
    // Hook Date.prototype.toString
    const originalToString = Date.prototype.toString;
    Date.prototype.toString = function() {
      const ps = getStandardDateTimeParts(this);
      if (ps) {
        const tzName = ps.timeZoneName ? ps.timeZoneName.replace(':', '') : '';
        return `${ps.weekday} ${ps.month} ${ps.day} ${ps.year} ${ps.hour}:${ps.minute}:${ps.second} ${tzName}`;
      }
      return originalToString.call(this);
    };
    
    // Hook Date.prototype.toDateString
    const originalToDateString = Date.prototype.toDateString;
    Date.prototype.toDateString = function() {
      const ps = getStandardDateTimeParts(this);
      if (ps) {
        return `${ps.weekday} ${ps.month} ${ps.day} ${ps.year}`;
      }
      return originalToDateString.call(this);
    };
    
    // Hook Date.prototype.toTimeString
    const originalToTimeString = Date.prototype.toTimeString;
    Date.prototype.toTimeString = function() {
      const ps = getStandardDateTimeParts(this);
      if (ps) {
        const tzName = ps.timeZoneName ? ps.timeZoneName.replace(':', '') : '';
        return `${ps.hour}:${ps.minute}:${ps.second} ${tzName}`;
      }
      return originalToTimeString.call(this);
    };
    
    // Hook toLocaleString 系列
    const originalToLocaleString = Date.prototype.toLocaleString;
    const originalToLocaleDateString = Date.prototype.toLocaleDateString;
    const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
    
    Date.prototype.toLocaleString = function(locales, options) {
      locales = locales || locale;
      options = Object.assign({ timeZone: timezone }, options);
      return originalToLocaleString.call(this, locales, options);
    };
    
    Date.prototype.toLocaleDateString = function(locales, options) {
      locales = locales || locale;
      options = Object.assign({ timeZone: timezone }, options);
      return originalToLocaleDateString.call(this, locales, options);
    };
    
    Date.prototype.toLocaleTimeString = function(locales, options) {
      locales = locales || locale;
      options = Object.assign({ timeZone: timezone }, options);
      return originalToLocaleTimeString.call(this, locales, options);
    };
  }
  
  // ==================== WebRTC 禁用 ====================
  
  function hookWebRTC(disable) {
    if (!disable) return;
    
    // 禁用 RTCPeerConnection
    const rtcClasses = [
      'RTCPeerConnection',
      'webkitRTCPeerConnection',
      'mozRTCPeerConnection'
    ];
    
    rtcClasses.forEach(name => {
      if (window[name]) {
        window[name] = undefined;
      }
    });
    
    // 禁用 mediaDevices
    if (navigator.mediaDevices) {
      safeDefineProperty(navigator, 'mediaDevices', {
        get: () => undefined,
        configurable: true
      });
    }
    
    // 禁用 getUserMedia
    const mediaProps = ['getUserMedia', 'webkitGetUserMedia', 'mozGetUserMedia'];
    mediaProps.forEach(prop => {
      if (navigator[prop]) {
        safeDefineProperty(navigator, prop, {
          get: () => undefined,
          configurable: true
        });
      }
    });
  }
  
  // ==================== WebGPU 指纹 ====================
  
  function hookWebGPU(seed) {
    if (seed == null) return;
    
    // 检查 WebGPU 是否可用
    if (typeof window.GPUAdapter === 'undefined') return;
    
    /**
     * 生成噪声值
     */
    function makeNoise(raw, offset) {
      const rn = seededRandom(seed + (offset * 7), 64, 1);
      return raw ? raw - Math.floor(rn) : raw;
    }
    
    // Hook GPUAdapter.limits
    if (window.GPUAdapter && window.GPUAdapter.prototype) {
      const limitsDesc = Object.getOwnPropertyDescriptor(window.GPUAdapter.prototype, 'limits');
      if (limitsDesc && limitsDesc.get) {
        const originalGetter = limitsDesc.get;
        Object.defineProperty(window.GPUAdapter.prototype, 'limits', {
          get: function() {
            const limits = originalGetter.call(this);
            // 返回代理对象
            return new Proxy(limits, {
              get(target, prop) {
                const value = target[prop];
                switch (prop) {
                  case 'maxBufferSize': return makeNoise(value, 0);
                  case 'maxStorageBufferBindingSize': return makeNoise(value, 1);
                }
                return typeof value === 'function' ? value.bind(target) : value;
              }
            });
          },
          configurable: true
        });
      }
    }
    
    // Hook GPUDevice.limits
    if (window.GPUDevice && window.GPUDevice.prototype) {
      const limitsDesc = Object.getOwnPropertyDescriptor(window.GPUDevice.prototype, 'limits');
      if (limitsDesc && limitsDesc.get) {
        const originalGetter = limitsDesc.get;
        Object.defineProperty(window.GPUDevice.prototype, 'limits', {
          get: function() {
            const limits = originalGetter.call(this);
            return new Proxy(limits, {
              get(target, prop) {
                const value = target[prop];
                switch (prop) {
                  case 'maxBufferSize': return makeNoise(value, 0);
                  case 'maxStorageBufferBindingSize': return makeNoise(value, 1);
                }
                return typeof value === 'function' ? value.bind(target) : value;
              }
            });
          },
          configurable: true
        });
      }
    }
    
    // Hook GPUCommandEncoder.beginRenderPass
    if (window.GPUCommandEncoder && window.GPUCommandEncoder.prototype.beginRenderPass) {
      const originalBeginRenderPass = window.GPUCommandEncoder.prototype.beginRenderPass;
      window.GPUCommandEncoder.prototype.beginRenderPass = function(descriptor) {
        if (descriptor?.colorAttachments?.[0]?.clearValue) {
          try {
            const clearValue = descriptor.colorAttachments[0].clearValue;
            let offset = 0;
            for (let key in clearValue) {
              let value = clearValue[key];
              const noise = seededRandom(seed + (offset++ * 7), 0.01, 0.001);
              value += value * noise * -1;
              clearValue[key] = Math.abs(value);
            }
          } catch (e) {}
        }
        return originalBeginRenderPass.call(this, descriptor);
      };
    }
    
    // Hook GPUQueue.writeBuffer
    if (window.GPUQueue && window.GPUQueue.prototype.writeBuffer) {
      const originalWriteBuffer = window.GPUQueue.prototype.writeBuffer;
      window.GPUQueue.prototype.writeBuffer = function(buffer, bufferOffset, data, dataOffset, size) {
        if (data && data instanceof Float32Array) {
          try {
            const count = Math.ceil(data.length * 0.05);
            let offset = 0;
            // 随机选择一些索引
            const indices = [];
            for (let i = 0; i < data.length; i++) {
              indices.push(i);
            }
            // 简单的随机排序
            indices.sort(() => seededRandom(seed + (offset++ * 7), 1, -1));
            const selected = indices.slice(0, count);
            
            offset = 0;
            for (let i = 0; i < selected.length; i++) {
              const index = selected[i];
              const value = data[index];
              const noise = seededRandom(seed + (offset++ * 7), 0.0001, -0.0001);
              data[index] += noise * value;
            }
          } catch (e) {}
        }
        return originalWriteBuffer.call(this, buffer, bufferOffset, data, dataOffset, size);
      };
    }
  }
  
  // ==================== 应用配置 ====================
  
  function applyFingerprint(cfg) {
    if (!cfg) return;
    config = cfg;
    
    const seed = cfg.seed || Math.floor(Math.random() * 1e9);
    
    // Canvas 2D
    if (cfg.canvas !== false) {
      hookCanvas2D(cfg.canvasSeed || seed);
    }
    
    // WebGL
    if (cfg.webgl !== false || cfg.gpuInfo) {
      hookWebGL(
        cfg.webgl !== false ? (cfg.webglSeed || seed + 1) : null,
        cfg.gpuInfo
      );
    }
    
    // Audio
    if (cfg.audio !== false) {
      hookAudio(cfg.audioSeed || seed + 2);
    }
    
    // Font
    if (cfg.font !== false) {
      hookFont(cfg.fontSeed || seed + 3);
    }
    
    // DOMRect
    if (cfg.domRect !== false) {
      hookDOMRect(cfg.domRectSeed || seed + 4);
    }
    
    // WebGPU
    if (cfg.webgpu !== false) {
      hookWebGPU(cfg.webgpuSeed || seed + 5);
    }
    
    // Navigator
    if (cfg.navigator) {
      hookNavigator(cfg.navigator);
    }
    
    // Screen
    if (cfg.screen) {
      hookScreen(cfg.screen);
    }
    
    // Timezone
    if (cfg.timezone) {
      hookTimezone(cfg.timezone);
    }
    
    // WebRTC
    if (cfg.disableWebRTC) {
      hookWebRTC(true);
    }
  }
  
  // ==================== 初始化 ====================
  
  // 尝试从 sessionStorage 读取配置
  try {
    const configStr = sessionStorage.getItem('__fp_config__');
    if (configStr) {
      const cfg = JSON.parse(configStr);
      sessionStorage.removeItem('__fp_config__');
      applyFingerprint(cfg);
    }
  } catch (e) {}
  
  // 监听来自隔离世界的配置事件
  window.addEventListener('__fp_config_ready__', function(e) {
    if (e.detail && !config) {
      applyFingerprint(e.detail);
    }
  });
  
  // 定时检查 sessionStorage（备用方案）
  let checkCount = 0;
  const checkInterval = setInterval(function() {
    checkCount++;
    if (checkCount > 10 || config) {
      clearInterval(checkInterval);
      return;
    }
    try {
      const configStr = sessionStorage.getItem('__fp_config__');
      if (configStr) {
        const cfg = JSON.parse(configStr);
        sessionStorage.removeItem('__fp_config__');
        applyFingerprint(cfg);
        clearInterval(checkInterval);
      }
    } catch (e) {}
  }, 50);
  
})();
