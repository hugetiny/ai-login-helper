/**
 * AI 登录检测调试器 - 向导模式 (Wizard)
 *
 * 这是一个注入到页面的引导式 UI，负责：
 * 1. 引导用户完成 登出 -> 登录 -> 发送消息 -> 确认响应 的全流程
 * 2. 自动捕获 Cookie 变化
 * 3. 自动识别输入框和发送按钮（生成鲁棒的选择器）
 * 4. 自动捕获 XHR/Fetch 流式响应
 */

(function() {
  if (window.__ai_wizard_active) return;
  window.__ai_wizard_active = true;

  // --- 状态管理 ---
  let state = {
    step: 0, // 0: Welcome, 1: Login, 2: Interaction, 3: Response, 4: Result
    beforeCookies: [],
    afterCookies: [],
    authConfig: null,
    inputSelector: null,
    sendSelector: null,
    sendAction: null, // 'click' or 'enter'
    responseUrlPattern: null,
    capturedRequests: [],
    capturedBodies: [] // 新增：存储响应体
  };

  // 恢复状态
  chrome.storage.local.get('wizardState', (result) => {
    if (result.wizardState) {
      state = result.wizardState;
      console.log('Wizard state restored:', state);
    }
    createUI();
  });

  function saveState() {
    chrome.storage.local.set({ wizardState: state });
  }

  // --- UI 元素 ---
  let overlay, container, content, actions;

  function createUI() {
    if (document.getElementById('ai-wizard-overlay')) return; // 防止重复创建

    overlay = document.createElement('div');
    overlay.id = 'ai-wizard-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', top: '20px', right: '20px', width: '360px',
      backgroundColor: '#1a1a2e', color: '#e0e0e0', borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: '9999999',
      fontFamily: 'system-ui, sans-serif', fontSize: '14px',
      border: '1px solid #333', transition: 'all 0.3s ease'
    });

    container = document.createElement('div');
    Object.assign(container.style, { padding: '20px' });

    const header = document.createElement('div');
    header.innerHTML = '<h3 style="margin:0 0 10px 0; font-size:16px; color:#fff;">🤖 AI 适配向导</h3>';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    Object.assign(closeBtn.style, {
      position: 'absolute', top: '10px', right: '15px',
      background: 'none', border: 'none', color: '#888',
      fontSize: '20px', cursor: 'pointer'
    });
    closeBtn.onclick = closeWizard;

    content = document.createElement('div');
    Object.assign(content.style, { marginBottom: '15px', lineHeight: '1.5' });

    actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', gap: '10px', justifyContent: 'flex-end' });

    container.appendChild(header);
    container.appendChild(closeBtn);
    container.appendChild(content);
    container.appendChild(actions);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    renderStep();
  }

  function closeWizard() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    window.__ai_wizard_active = false;
    // 清理监听器
    document.removeEventListener('click', handleInteractionCapture, true);
    document.removeEventListener('keydown', handleInteractionCapture, true);
    // 通知 background 停止
    chrome.runtime.sendMessage({ type: 'STOP_WIZARD' });
  }

  function renderStep() {
    saveState(); // 每次渲染都保存状态
    actions.innerHTML = '';
    content.innerHTML = '';

    switch (state.step) {
      case 0: // Welcome
        content.innerHTML = `
          <p>此向导将帮助你自动生成精准的站点配置。</p>
          <p style="color:#4fc3f7">第一步：请确保你当前处于<b>未登录</b>状态。</p>
        `;
        addBtn('我已登出，开始', () => {
          captureState('before').then(() => {
            state.step = 1;
            renderStep();
          });
        }, 'primary');
        break;

      case 1: // Login
        content.innerHTML = `
          <p>✅ 未登录状态已记录。</p>
          <p style="color:#4fc3f7">第二步：请在页面上完成<b>登录</b>。</p>
          <p style="font-size:12px; color:#888">登录成功后，点击下一步。</p>
        `;
        addBtn('我已登录', () => {
          captureState('after').then(() => {
            analyzeAuth();
            state.step = 2;
            renderStep();
          });
        }, 'primary');
        break;

      case 2: // Interaction
        // 生成凭证列表 HTML
        const authListHtml = state.authConfig && state.authConfig.length > 0
          ? state.authConfig.map(c => `<div style="font-size:11px; color:#aaa; margin-bottom:2px;">• ${c.name}</div>`).join('')
          : '<div style="font-size:11px; color:#f44336;">⚠️ 未检测到明显凭证变化</div>';

        content.innerHTML = `
          <p>✅ 登录凭证已分析。</p>
          <div style="background:#222; padding:8px; border-radius:4px; margin-bottom:10px; max-height:80px; overflow-y:auto;">
            <div style="font-size:12px; color:#4fc3f7; margin-bottom:4px;">检测到的关键凭证:</div>
            ${authListHtml}
          </div>
          <p style="color:#4fc3f7">第三步：捕获交互。</p>
          <ol style="padding-left:20px; margin:10px 0;">
            <li>在输入框输入测试消息</li>
            <li>按 <b>Enter</b> 或点击 <b>发送按钮</b></li>
          </ol>
          <p style="font-size:12px; color:#ffb74d">⚡ 插件正在监听你的操作...</p>
        `;
        startInteractionCapture();
        break;

      case 3: // Response
        content.innerHTML = `
          <p>✅ 交互动作已捕获。</p>
          <p><b>输入框:</b> <code style="font-size:12px">${state.inputSelector}</code></p>
          <p><b>发送动作:</b> ${state.sendAction === 'enter' ? 'Enter 键' : '点击按钮'}</p>
          <hr style="border:0; border-top:1px solid #333; margin:10px 0;">
          <p style="color:#4fc3f7">第四步：等待 AI 回复...</p>
          <p style="font-size:12px">1. 等待 AI 回复完成</p>
          <p style="font-size:12px">2. <b>用鼠标选中</b> AI 回复中的一段独特文字</p>
          <p style="font-size:12px">3. 点击下方按钮自动定位请求</p>
          <div id="ai-wizard-req-list" style="max-height:100px; overflow-y:auto; font-size:11px; margin-top:5px; border:1px solid #333; padding:5px;"></div>
        `;
        addBtn('🔍 根据选中文本定位请求', findRequestBySelection, 'primary');
        startNetworkCapture();
        break;

      case 4: // Result
        const config = generateFinalConfig();
        content.innerHTML = `
          <p style="color:#66bb6a">🎉 配置生成完毕！</p>
          <textarea id="ai-wizard-config" style="width:100%; height:150px; background:#111; color:#fff; border:1px solid #333; font-family:monospace; font-size:11px; padding:5px;">${config}</textarea>
        `;

        addBtn('保存并启用', () => {
          try {
            const configObj = JSON.parse(config);
            // 尝试更新
            chrome.runtime.sendMessage({ type: 'UPDATE_SITE', site: configObj }, (response) => {
              if (response && response.success) {
                alert('配置已更新！');
                closeWizard();
              } else {
                // 如果更新失败（可能是不存在），尝试添加
                chrome.runtime.sendMessage({ type: 'ADD_SITE', site: configObj }, (addResponse) => {
                  if (addResponse && addResponse.success) {
                    alert('配置已保存！');
                    closeWizard();
                  } else {
                    alert('保存失败: ' + (addResponse ? addResponse.error : '未知错误'));
                  }
                });
              }
            });
          } catch(e) {
            alert('配置处理出错: ' + e.message);
          }
        }, 'primary');

        addBtn('复制', () => {
          const textarea = document.getElementById('ai-wizard-config');
          textarea.select();
          document.execCommand('copy');
          // 找到当前点击的按钮
          const btn = event.target;
          const originalText = btn.textContent;
          btn.textContent = '已复制!';
          setTimeout(() => btn.textContent = originalText, 2000);
        });

        addBtn('关闭', closeWizard);
        break;
    }
  }

  function addBtn(text, onClick, type = 'default') {
    const btn = document.createElement('button');
    btn.textContent = text;
    Object.assign(btn.style, {
      padding: '6px 12px', borderRadius: '4px', cursor: 'pointer',
      border: 'none', fontSize: '12px', fontWeight: '500',
      background: type === 'primary' ? '#2196f3' : '#333',
      color: '#fff'
    });
    btn.onclick = onClick;
    actions.appendChild(btn);
  }

  // --- 逻辑实现 ---

  async function captureState(phase) {
    // 1. 获取 Cookies (Background)
    const cookies = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'WIZARD_GET_COOKIES' }, resolve);
    });

    // 2. 获取 LocalStorage (Content Script)
    const localData = Object.keys(localStorage).map(key => ({
      name: `LS:${key}`, // 前缀区分
      value: localStorage.getItem(key)
    }));

    const allData = [...(cookies || []), ...localData];

    if (phase === 'before') state.beforeCookies = allData;
    else state.afterCookies = allData;
  }

  function analyzeAuth() {
    // 差异分析 (基于用户指定的逻辑)
    const beforeMap = new Map(state.beforeCookies.map(c => [c.name, c.value]));
    const candidates = [];

    state.afterCookies.forEach(c => {
      const name = c.name;
      const newVal = c.value;

      // 1. 新 Key (登录后出现)
      if (!beforeMap.has(name)) {
        candidates.push({
          name: name,
          type: 'new',
          loggedInValues: null, // 任意值 (只要存在)
          loggedOutValues: []   // 不应存在
        });
        return;
      }

      const oldVal = beforeMap.get(name);

      // 如果值没变，跳过
      if (oldVal === newVal) return;

      // 2. 存在 Key 的值由空变为有
      if ((!oldVal || oldVal === '') && (newVal && newVal !== '')) {
        candidates.push({
          name: name,
          type: 'empty_to_value',
          loggedInValues: null, // 任意非空值
          loggedOutValues: [''] // 登出时为空
        });
        return;
      }

      // 3. 存在的 Key 值由 0/1, true/false 互变
      const isBinary = (v) => ['0', '1', 'true', 'false'].includes(String(v).toLowerCase());
      if (isBinary(oldVal) && isBinary(newVal)) {
        candidates.push({
          name: name,
          type: 'binary_flip',
          loggedInValues: [newVal],
          loggedOutValues: [oldVal]
        });
        return;
      }
    });

    // 过滤掉无关的 (如 GA, 统计脚本等)
    const ignore = ['_ga', 'hm_', 'utm', 'history', 'viewport', 'size', 'screen', 'LS:Hm_', 'LS:__tea', 'LS:APMPLUS'];
    const filtered = candidates.filter(c => !ignore.some(i => c.name.toLowerCase().includes(i.toLowerCase())));

    // 生成配置 (不再限制数量，保留所有有效候选)
    state.authConfig = filtered.map(c => ({
      name: c.name,
      loggedInValues: c.loggedInValues,
      loggedOutValues: c.loggedOutValues
    }));
  }

  // 交互捕获
  function startInteractionCapture() {
    document.addEventListener('click', handleInteractionCapture, true);
    document.addEventListener('keydown', handleInteractionCapture, true);
  }

  function handleInteractionCapture(e) {
    // 忽略向导自己的点击
    if (overlay.contains(e.target)) return;

    if (e.type === 'keydown' && e.key === 'Enter') {
      // 捕获输入框
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        state.inputSelector = generateSelector(e.target);
        state.sendAction = 'enter';
        state.sendSelector = null; // Enter 模式不需要发送按钮
        nextToResponseStep();
      }
    } else if (e.type === 'click') {
      // 尝试寻找按钮
      let btn = e.target.closest('button, [role="button"], input[type="submit"]');
      if (btn) {
        // 寻找关联的输入框 (最近的有焦点的，或者 DOM 结构相近的)
        const input = document.querySelector('textarea:focus, input[type="text"]:focus') || document.querySelector('textarea');
        if (input) {
          state.inputSelector = generateSelector(input);
          state.sendSelector = generateSelector(btn);
          state.sendAction = 'click';
          nextToResponseStep();
        }
      }
    }
  }

  function nextToResponseStep() {
    document.removeEventListener('click', handleInteractionCapture, true);
    document.removeEventListener('keydown', handleInteractionCapture, true);
    state.step = 3;
    renderStep();
  }

  // 鲁棒的选择器生成
  function generateSelector(el) {
    if (!el) return null;

    // 1. ID (如果看起来不随机)
    if (el.id && !/\d{5,}/.test(el.id)) return '#' + el.id;

    // 2. 关键属性
    const attrs = ['data-testid', 'aria-label', 'name', 'placeholder', 'id'];
    for (const attr of attrs) {
      if (el.hasAttribute(attr)) {
        return `${el.tagName.toLowerCase()}[${attr}="${el.getAttribute(attr)}"]`;
      }
    }

    // 3. 避免随机 Class
    const classes = Array.from(el.classList).filter(c => {
      // 过滤掉包含长数字、随机哈希、常见工具类
      if (/\d{4,}/.test(c)) return false;
      if (/^[a-zA-Z0-9]{8,}$/.test(c)) return false; // 像 tailwind 或 hash
      if (/-\w{6,}$/.test(c)) return false; // 像 operateButton-x8s7d6
      if (c.includes('active') || c.includes('focus') || c.includes('hover')) return false;
      return true;
    });

    if (classes.length > 0) {
      return `${el.tagName.toLowerCase()}.${classes.join('.')}`;
    }

    // 4. 降级：层级结构
    // 尝试找父级 ID
    let parent = el.parentElement;
    while (parent) {
      if (parent.id && !/\d{5,}/.test(parent.id)) {
        return `#${parent.id} ${el.tagName.toLowerCase()}`;
      }
      parent = parent.parentElement;
    }

    return el.tagName.toLowerCase();
  }

  // 网络捕获
  function startNetworkCapture() {
    // 监听来自 sniffer 的消息
    window.addEventListener('message', handleNetworkMessage);
  }

  function handleNetworkMessage(e) {
    if (!e.data) return;

    if (e.data.type === 'AI_SNIFFER_REQUEST') {
      const req = e.data.data;
      if (!req || !req.url) return;

      // 过滤静态资源
      try {
        if (req.url.match(/\.(js|css|png|jpg|svg|woff|woff2|ttf|ico)$/)) return;
      } catch (e) { return; }

      // 显示在列表中
      const list = document.getElementById('ai-wizard-req-list');
      if (list) {
        const item = document.createElement('div');
        item.style.padding = '4px';
        item.style.borderBottom = '1px solid #333';
        item.style.cursor = 'pointer';
        item.title = req.url;

        // 检查是否有 Auth Header
        const hasAuth = req.headers && (req.headers['Authorization'] || req.headers['authorization']);
        const authIcon = hasAuth ? '🔒' : '';

        item.innerHTML = `<span style="color:#4caf50; font-weight:bold">${req.method}</span> ${authIcon} ${req.url.substring(0, 30)}...`;
        item.onclick = () => confirmResponseUrl(req.url);
        list.insertBefore(item, list.firstChild);
      }
    } else if (e.data.type === 'AI_SNIFFER_RESPONSE_BODY') {
      // 存储响应体用于搜索
      const { url, body } = e.data.data;

      // 查找是否已存在该 URL 的记录，如果存在则更新（处理流式增量更新）
      const existingIndex = state.capturedBodies.findIndex(item => item.url === url);
      if (existingIndex !== -1) {
          state.capturedBodies[existingIndex].body = body;
      } else {
          state.capturedBodies.push({ url, body });
          // 限制大小
          if (state.capturedBodies.length > 50) state.capturedBodies.shift();
      }
    }
  }

  function findRequestBySelection() {
    const selection = window.getSelection().toString().trim();
    if (!selection) {
      alert('请先用鼠标选中页面上 AI 回复的一段文字！');
      return;
    }

    // 在捕获的响应体中搜索
    const matches = state.capturedBodies.filter(item => item.body && item.body.includes(selection));

    if (matches.length === 0) {
      alert(`未找到包含 "${selection.substring(0, 20)}..." 的请求。\n请确保 AI 已回复完成，且选中的是网络请求返回的内容。`);
    } else if (matches.length === 1) {
      const url = matches[0].url;
      if (confirm(`找到匹配请求：\n${url}\n\n是否使用此请求？`)) {
        confirmResponseUrl(url);
      }
    } else {
      // 多个匹配，取最后一个（通常是最新的）
      const last = matches[matches.length - 1];
      if (confirm(`找到 ${matches.length} 个匹配请求。使用最新的一个？\n${last.url}`)) {
        confirmResponseUrl(last.url);
      }
    }
  }

  function confirmResponseUrl(url) {
    try {
      const urlObj = new URL(url);
      state.responseUrlPattern = urlObj.pathname;
    } catch (e) {
      state.responseUrlPattern = url;
    }

    window.removeEventListener('message', handleNetworkMessage);
    state.step = 4;
    renderStep();
  }

  function generateFinalConfig() {
    const domain = window.location.hostname;
    const name = document.title.split(' ')[0] || domain;

    // 安全转义选择器中的双引号
    const safeInputSelector = state.inputSelector ? state.inputSelector.replace(/"/g, '\\"') : '';
    const safeSendSelector = state.sendSelector ? state.sendSelector.replace(/"/g, '\\"') : '';

    const config = {
      id: domain.split('.')[0] === 'www' ? domain.split('.')[1] : domain.split('.')[0],
      name: name,
      url: window.location.origin + '/',
      domains: [domain],
      cookieRules: {
        authIndicators: state.authConfig || [],
        anyOf: true
      },
      scripts: {
        sendMessage: state.sendAction === 'enter'
          ? `(function(t){var i=document.querySelector("${safeInputSelector}");if(!i)return{success:false,error:"Input not found"};i.value=t;i.dispatchEvent(new Event("input",{bubbles:true}));i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,bubbles:true}));return{success:true};})`
          : `(function(t){var i=document.querySelector("${safeInputSelector}");if(!i)return{success:false,error:"Input not found"};i.value=t;i.dispatchEvent(new Event("input",{bubbles:true}));setTimeout(function(){var b=document.querySelector("${safeSendSelector}");if(b)b.click();},300);return{success:true};})`,


        watchResponse: `(function(){const originalFetch=window.fetch;const originalXHR=window.XMLHttpRequest;window.fetch=async function(input,init){const response=await originalFetch(input,init);const url=typeof input==="string"?input:input.url;if(url.includes("${state.responseUrlPattern}")){const clone=response.clone();const reader=clone.body.getReader();const decoder=new TextDecoder();let content="";while(true){const{done,value}=await reader.read();if(done)break;const chunk=decoder.decode(value,{stream:true});content+=chunk;if(window.__TAURI__)window.__TAURI__.event.emit("ai-response",{siteId:"${domain.split('.')[0]}",content:content});}}return response;};const XHR=window.XMLHttpRequest;window.XMLHttpRequest=function(){const xhr=new XHR();const open=xhr.open;xhr.open=function(method,url){this._url=url;open.apply(this,arguments);};xhr.addEventListener("load",function(){if(this._url.includes("${state.responseUrlPattern}")){if(window.__TAURI__)window.__TAURI__.event.emit("ai-response",{siteId:"${domain.split('.')[0]}",content:this.responseText});}});return xhr;};return{success:true};})`
      },
      enabled: true
    };

    return JSON.stringify(config, null, 2);
  }

  // 启动
  // createUI(); // 移到 storage 回调中启动

})();
