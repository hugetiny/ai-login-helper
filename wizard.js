/**
 * AI 登录检测调试器 - 向导模式 (Wizard)
 *
 * 这是一个注入到页面的引导式 UI，负责：
 * 1. 引导用户完成 登出 -> 登录 -> 发送消息 -> 确认响应 的全流程
 * 2. 自动捕获 Cookie 变化（增强版：支持 JWT, 时间戳, 值长度变化检测）
 * 3. 自动识别输入框和发送按钮（生成鲁棒的选择器）
 * 4. 自动捕获 XHR/Fetch 流式响应（优先 text/event-stream，降级方案支持）
 */

(function() {
  if (window.__ai_wizard_active) return;
  window.__ai_wizard_active = true;

  // --- 多语言支持 ---
  const LANG = (navigator.language || navigator.userLanguage || 'zh-CN').toLowerCase().startsWith('zh') ? 'zh' : 'en';

  const I18N = {
    zh: {
      // 通用
      close: '✕',
      confirm: '确定',
      cancel: '取消',
      skip: '跳过',
      next: '下一步',
      save: '保存',
      copy: '复制',
      copied: '已复制!',

      // Toast 消息
      extReloaded: '扩展已重新加载，请刷新页面后重试。',
      extDisconnected: '扩展连接断开，请刷新页面后重试。',
      extConnectFailed: '扩展连接失败，请刷新页面后重试。',
      configUpdated: '配置已更新！',
      configSaved: '配置已保存！',
      saveFailed: '保存失败: ',
      configFormatError: '配置格式错误: ',

      // 进度步骤
      steps: ['登出检测', '登录检测', '交互捕获', '响应捕获', '生成配置'],

      // Step 0: Welcome
      welcomeTitle: '🔧 AI 登录检测向导',
      welcomeDesc: '本向导将引导您完成以下步骤：',
      welcomeSteps: [
        '捕获登出状态的 Cookie/Storage',
        '捕获登录后的 Cookie/Storage 变化',
        '识别输入框和发送按钮',
        '捕获 AI 响应请求'
      ],
      startBtn: '开始配置',
      currentDomain: '当前域名: ',

      // Step 1: Login detection
      step1Title: '🔓 第一步：登出状态检测',
      step1Desc: '请确保您当前处于<b>未登录</b>状态，然后点击下方按钮捕获当前状态。',
      step1Hint: '如果已登录，请先登出。',
      captureLogoutBtn: '📸 捕获登出状态',
      loginStatus: '✅ 登出状态已捕获',
      cookiesCount: '已捕获 Cookie/Storage: ',
      step1Next: '现在请登录，登录成功后点击下一步',
      loginDoneBtn: '✅ 已登录，继续下一步',
      skipLoginBtn: '⏭️ 跳过登录检测',

      // Step 2: Interaction
      step2Title: '🖊️ 第二步：捕获交互动作',
      step2Desc: '请在页面上执行以下操作：',
      step2Steps: [
        '点击输入框（将自动识别）',
        '输入一条测试消息',
        '用 Enter 发送或点击发送按钮'
      ],
      waitingInput: '等待输入框点击...',
      inputCaptured: '✅ 输入框已捕获',
      sendCaptured: '✅ 发送方式已捕获',
      enterKey: '⌨️ Enter 键',
      clickButton: '🖱️ 点击按钮',
      interactionDoneBtn: '✅ 交互完成，继续',
      inputSelector: '输入框:',
      sendMethod: '发送:',

      // Step 3: Response
      step3Title: '📡 第四步：捕获 AI 响应',
      step3Captured: '✅ 交互动作已捕获',
      step3Steps: [
        '等待 AI 回复完成',
        '选中一段较长的句子（30字以上）',
        '点击下方按钮自动定位请求'
      ],
      step3Why: '💡 为什么要选长句？',
      step3WhyDesc: '选中长句可以帮助判断该网站是否有返回完整回复的接口（如 kimi），还是只有流式响应。这决定了监听策略。',
      waitingResponse: '等待 AI 响应...',
      capturedRequests: '📋 捕获的请求:',
      findBySelectionBtn: '🔍 根据选中文本定位请求',

      // Step 4: Result
      resultTitle: '🎉 配置生成完毕！',
      authCredentials: '登录凭证',
      responseCapture: '响应捕获',
      streaming: '流式',
      normal: '普通',
      completeApi: '完整接口',
      completeApiDetected: '✅ 检测到完整响应接口',
      completeApiDesc: '流式响应结束后会返回完整内容，已配置双重监听。',
      saveAndEnableBtn: '💾 保存并启用',

      // Response selection
      shortTextWarning: '⚠️ 您选中的文本较短（{0}字）\n\n建议选中一段较长的句子（{1}字以上），这样可以：\n• 更准确地匹配请求\n• 判断网站是否有返回完整回复的接口\n\n继续使用当前选中的短文本？',
      selectTextFirst: '请先用鼠标选中页面上 AI 回复的一段文字！',
      noMatchFound: '未找到包含 "{0}..." 的请求。\n请确保 AI 已回复完成，且选中的是网络请求返回的内容。',
      useLongestRequest: '未找到包含选中文本的请求。\n\n是否使用耗时最长的请求作为候选？\n{0}\n({1}s)',
      foundMatch: '找到匹配请求：\n{0}\n\n是否使用此请求？',
      foundMatches: '🔍 找到 {0} 个匹配请求',
      completeApiFound: '✅ 检测到完整响应接口',
      completeApiFoundDesc: '该网站在流式响应结束后会返回包含完整回复的响应。',
      noCompleteApi: '⚠️ 未检测到完整响应接口',
      noCompleteApiDesc: '该网站可能只有流式响应，需要累积流式数据获取完整内容。',
      selectResponseType: '选择要使用的响应类型：',
      streamingResponse: '📡 流式响应 (推荐用于实时显示)',
      completeResponse: '📦 完整响应 (推荐用于获取完整内容)',
      useBoth: '🎯 两者都监听 (最佳方案)',
      useBothDesc: '同时监听流式响应（实时显示）和完整响应（获取最终结果）',

      // Best candidate
      bestCandidate: '💡 推荐候选:',
      noBestCandidate: '暂无推荐',
      streamingType: '流式',
      grpcType: 'gRPC',
      longestDuration: '耗时最长',

      // Interaction capture
      credentialsAnalyzed: '✅ 登录凭证已分析。',
      detectedCredentials: '🔍 检测到的关键凭证:',
      moreCredentials: '...还有 {0} 条',
      noCredentialsDetected: '⚠️ 未检测到明显凭证变化（已跳过或无变化）',
      step2InstructTitle: '⌨️ 第三步：捕获交互动作',
      step2Instr1: '在输入框输入测试消息',
      step2Instr2: '按 <b>Enter</b> 或点击 <b>发送按钮</b>',
      listeningOperations: '插件正在监听你的操作...',

      // Response capture labels
      inputBox: '输入框:',
      sendMethodLabel: '发送:',
      charCount: '{0}字',
      minCharHint: '{0}字以上',

      // Best candidate display
      recommendedResponse: '🎯 推荐响应:',
      useThisRequest: '使用此请求',

      // Header
      wizardTitle: '🤖 AI 适配向导'
    },
    en: {
      // General
      close: '✕',
      confirm: 'OK',
      cancel: 'Cancel',
      skip: 'Skip',
      next: 'Next',
      save: 'Save',
      copy: 'Copy',
      copied: 'Copied!',

      // Toast messages
      extReloaded: 'Extension reloaded, please refresh the page.',
      extDisconnected: 'Extension disconnected, please refresh the page.',
      extConnectFailed: 'Extension connection failed, please refresh the page.',
      configUpdated: 'Config updated!',
      configSaved: 'Config saved!',
      saveFailed: 'Save failed: ',
      configFormatError: 'Config format error: ',

      // Progress steps
      steps: ['Logout Detection', 'Login Detection', 'Interaction Capture', 'Response Capture', 'Generate Config'],

      // Step 0: Welcome
      welcomeTitle: '🔧 AI Login Detection Wizard',
      welcomeDesc: 'This wizard will guide you through:',
      welcomeSteps: [
        'Capture logged-out Cookie/Storage state',
        'Capture Cookie/Storage changes after login',
        'Identify input box and send button',
        'Capture AI response requests'
      ],
      startBtn: 'Start Configuration',
      currentDomain: 'Current domain: ',

      // Step 1: Login detection
      step1Title: '🔓 Step 1: Logout State Detection',
      step1Desc: 'Please ensure you are currently <b>logged out</b>, then click the button below to capture the current state.',
      step1Hint: 'If logged in, please log out first.',
      captureLogoutBtn: '📸 Capture Logout State',
      loginStatus: '✅ Logout state captured',
      cookiesCount: 'Captured Cookie/Storage: ',
      step1Next: 'Now please log in, then click next',
      loginDoneBtn: '✅ Logged in, continue',
      skipLoginBtn: '⏭️ Skip login detection',

      // Step 2: Interaction
      step2Title: '🖊️ Step 2: Capture Interaction',
      step2Desc: 'Please perform the following on the page:',
      step2Steps: [
        'Click the input box (auto-detected)',
        'Type a test message',
        'Press Enter or click send button'
      ],
      waitingInput: 'Waiting for input click...',
      inputCaptured: '✅ Input captured',
      sendCaptured: '✅ Send method captured',
      enterKey: '⌨️ Enter key',
      clickButton: '🖱️ Click button',
      interactionDoneBtn: '✅ Interaction done, continue',
      inputSelector: 'Input:',
      sendMethod: 'Send:',

      // Step 3: Response
      step3Title: '📡 Step 4: Capture AI Response',
      step3Captured: '✅ Interaction captured',
      step3Steps: [
        'Wait for AI response to complete',
        'Select a long sentence (30+ chars)',
        'Click the button below to locate request'
      ],
      step3Why: '💡 Why select long text?',
      step3WhyDesc: 'Selecting long text helps determine if the site has a complete response API (like kimi) or only streaming. This affects the listening strategy.',
      waitingResponse: 'Waiting for AI response...',
      capturedRequests: '📋 Captured requests:',
      findBySelectionBtn: '🔍 Locate request by selection',

      // Step 4: Result
      resultTitle: '🎉 Config generated!',
      authCredentials: 'Auth Credentials',
      responseCapture: 'Response Capture',
      streaming: 'Streaming',
      normal: 'Normal',
      completeApi: 'Complete API',
      completeApiDetected: '✅ Complete response API detected',
      completeApiDesc: 'Returns full content after streaming ends, dual monitoring configured.',
      saveAndEnableBtn: '💾 Save & Enable',

      // Response selection
      shortTextWarning: '⚠️ Selected text is short ({0} chars)\n\nRecommend selecting longer text ({1}+ chars) to:\n• Match requests more accurately\n• Detect if site has complete response API\n\nContinue with short text?',
      selectTextFirst: 'Please select some text from the AI response first!',
      noMatchFound: 'No request found containing "{0}...".\nMake sure AI has responded and you selected text from the response.',
      useLongestRequest: 'No request found with selected text.\n\nUse the longest-running request?\n{0}\n({1}s)',
      foundMatch: 'Found matching request:\n{0}\n\nUse this request?',
      foundMatches: '🔍 Found {0} matching requests',
      completeApiFound: '✅ Complete response API detected',
      completeApiFoundDesc: 'This site returns complete response after streaming ends.',
      noCompleteApi: '⚠️ No complete response API detected',
      noCompleteApiDesc: 'This site may only have streaming response, need to accumulate stream data.',
      selectResponseType: 'Select response type to use:',
      streamingResponse: '📡 Streaming (for real-time display)',
      completeResponse: '📦 Complete (for full content)',
      useBoth: '🎯 Monitor both (best option)',
      useBothDesc: 'Monitor both streaming (real-time) and complete response (final result)',

      // Best candidate
      bestCandidate: '💡 Recommended:',
      noBestCandidate: 'No recommendation yet',
      streamingType: 'Streaming',
      grpcType: 'gRPC',
      longestDuration: 'Longest duration',

      // Interaction capture
      credentialsAnalyzed: '✅ Login credentials analyzed.',
      detectedCredentials: '🔍 Detected key credentials:',
      moreCredentials: '...and {0} more',
      noCredentialsDetected: '⚠️ No credential changes detected (skipped or no changes)',
      step2InstructTitle: '⌨️ Step 3: Capture Interaction',
      step2Instr1: 'Type a test message in the input box',
      step2Instr2: 'Press <b>Enter</b> or click <b>send button</b>',
      listeningOperations: 'Extension is listening to your actions...',

      // Response capture labels
      inputBox: 'Input:',
      sendMethodLabel: 'Send:',
      charCount: '{0} chars',
      minCharHint: '{0}+ chars',

      // Best candidate display
      recommendedResponse: '🎯 Recommended:',
      useThisRequest: 'Use this request',

      // Header
      wizardTitle: '🤖 AI Adapter Wizard'
    }
  };

  // 获取翻译文本
  function t(key, ...args) {
    let text = I18N[LANG][key] || I18N['en'][key] || key;
    // 替换占位符 {0}, {1}, ...
    args.forEach((arg, i) => {
      text = text.replace(new RegExp('\\{' + i + '\\}', 'g'), arg);
    });
    return text;
  }

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
    responseContentType: null,       // 记录流式响应的 Content-Type
    responseIsStreaming: false,      // 是否为流式响应
    hasCompleteResponseApi: false,   // 是否有返回完整响应的接口
    completeResponseUrl: null,       // 完整响应的 URL
    completeResponseUrlPattern: null,// 完整响应的 URL pattern
    capturedRequests: [],
    capturedBodies: [],              // 存储响应体
    requestStats: []                 // 请求统计（用于降级方案）
  };

  // --- 扩展上下文检查 ---
  function isExtensionContextValid() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // 安全发送消息到 background
  function safeSendMessage(message, callback) {
    if (!isExtensionContextValid()) {
      console.warn('[AI Wizard] Extension context invalidated, cannot send message.');
      showToast(t('extReloaded'), 'error');
      if (callback) callback(null);
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        // 检查是否有 lastError（扩展断开连接）
        if (chrome.runtime.lastError) {
          console.warn('[AI Wizard] Message error:', chrome.runtime.lastError.message);
          showToast(t('extDisconnected'), 'error');
          if (callback) callback(null);
          return;
        }
        if (callback) callback(response);
      });
    } catch (e) {
      console.warn('[AI Wizard] Exception sending message:', e);
      showToast(t('extConnectFailed'), 'error');
      if (callback) callback(null);
    }
  }

  // --- 工具函数 ---

  // 检测是否为 JWT Token
  function isJWT(value) {
    if (!value || typeof value !== 'string') return false;
    const parts = value.split('.');
    if (parts.length !== 3) return false;
    try {
      // JWT 的 header 和 payload 是 base64url 编码
      const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
      return header.alg && (header.typ === 'JWT' || header.typ === undefined);
    } catch (e) {
      return false;
    }
  }

  // 检测是否为时间戳（秒或毫秒）
  function isTimestamp(value) {
    if (!value) return false;
    const num = Number(value);
    if (isNaN(num)) return false;
    // 秒级时间戳 (2000-2100年范围)
    if (num > 946684800 && num < 4102444800) return 'seconds';
    // 毫秒级时间戳
    if (num > 946684800000 && num < 4102444800000) return 'milliseconds';
    return false;
  }

  // 检测是否为 UUID
  function isUUID(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  // 检测值长度是否有意义变化
  function hasSignificantLengthChange(oldVal, newVal) {
    if (!oldVal && !newVal) return false;
    const oldLen = oldVal ? String(oldVal).length : 0;
    const newLen = newVal ? String(newVal).length : 0;
    // 从无到有，或长度变化超过 50%
    if (oldLen === 0 && newLen > 10) return true;
    if (newLen === 0 && oldLen > 10) return true;
    if (oldLen > 0 && Math.abs(newLen - oldLen) / oldLen > 0.5) return true;
    return false;
  }

  // 认证相关关键词模式
  const AUTH_KEYWORDS = [
    'token', 'session', 'auth', 'user', 'login', 'credential',
    'access', 'refresh', 'id_token', 'jwt', 'bearer', 'cookie',
    'passport', 'ticket', 'sid', 'csrf', 'xsrf'
  ];

  // 检测名称是否包含认证相关关键词
  function hasAuthKeyword(name) {
    const lowerName = name.toLowerCase();
    return AUTH_KEYWORDS.some(kw => lowerName.includes(kw));
  }

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
    header.innerHTML = `<h3 style="margin:0 0 10px 0; font-size:16px; color:#fff;">${t('wizardTitle')}</h3>`;

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
    safeSendMessage({ type: 'STOP_WIZARD' });
  }

  // 进度指示器
  function renderProgressBar() {
    const steps = t('steps');
    const progressHtml = steps.map((step, i) => {
      const status = i < state.step ? 'done' : (i === state.step ? 'active' : 'pending');
      const color = status === 'done' ? '#4caf50' : (status === 'active' ? '#2196f3' : '#555');
      const icon = status === 'done' ? '✓' : (i + 1);
      return `<div style="flex:1; text-align:center;">
        <div style="width:24px; height:24px; margin:0 auto 4px; border-radius:50%; background:${color}; color:#fff; line-height:24px; font-size:12px;">${icon}</div>
        <div style="font-size:10px; color:${color};">${step}</div>
      </div>`;
    }).join('<div style="flex:0.3; border-top:2px solid #333; margin-top:12px;"></div>');

    return `<div style="display:flex; align-items:flex-start; margin-bottom:15px; padding-bottom:10px; border-bottom:1px solid #333;">${progressHtml}</div>`;
  }

  function renderStep() {
    saveState(); // 每次渲染都保存状态
    actions.innerHTML = '';
    content.innerHTML = '';

    // 添加进度条
    const progressBar = renderProgressBar();

    switch (state.step) {
      case 0: // Welcome
        const welcomeStepsList = t('welcomeSteps').map(s => `<li>${s}</li>`).join('');
        content.innerHTML = `
          ${progressBar}
          <p>${t('welcomeDesc')}</p>
          <ol style="padding-left:20px; margin:8px 0; font-size:12px; color:#aaa;">${welcomeStepsList}</ol>
          <div style="background:#1e3a5f; padding:10px; border-radius:6px; margin:10px 0;">
            <p style="color:#4fc3f7; margin:0;">${t('step1Title')}</p>
            <p style="font-size:11px; color:#888; margin:5px 0 0 0;">${t('step1Hint')}</p>
          </div>
        `;
        addBtn(t('startBtn'), () => {
          captureState('before').then(() => {
            state.step = 1;
            renderStep();
          });
        }, 'primary');
        addBtn(t('skipLoginBtn'), () => {
          state.step = 2;
          state.authConfig = [];
          renderStep();
        });
        break;

      case 1: // Login
        content.innerHTML = `
          ${progressBar}
          <p>${t('loginStatus')} (${t('cookiesCount')}${state.beforeCookies.length})</p>
          <div style="background:#1e3a5f; padding:10px; border-radius:6px; margin:10px 0;">
            <p style="color:#4fc3f7; margin:0;">${t('step1Next')}</p>
          </div>
        `;
        addBtn(t('loginDoneBtn'), () => {
          captureState('after').then(() => {
            analyzeAuth();
            state.step = 2;
            renderStep();
          });
        }, 'primary');
        break;

      case 2: // Interaction
        // 生成凭证列表 HTML（增强版）
        const authListHtml = state.authConfig && state.authConfig.length > 0
          ? state.authConfig.slice(0, 8).map(c => {
              const typeIcon = c.isJWT ? '🔑' : (c.type === 'binary_flip' ? '🔄' : '📌');
              const confidenceColor = c.confidence >= 80 ? '#4caf50' : (c.confidence >= 60 ? '#ff9800' : '#888');
              return `<div style="font-size:11px; color:#aaa; margin-bottom:2px; display:flex; align-items:center;">
                <span>${typeIcon}</span>
                <span style="flex:1; margin-left:4px;">${c.name}</span>
                <span style="color:${confidenceColor}; font-size:10px;">${c.confidence}%</span>
              </div>`;
            }).join('') + (state.authConfig.length > 8 ? `<div style="font-size:10px; color:#666;">${t('moreCredentials', state.authConfig.length - 8)}</div>` : '')
          : `<div style="font-size:11px; color:#f44336;">${t('noCredentialsDetected')}</div>`;

        content.innerHTML = `
          ${progressBar}
          <p>${t('credentialsAnalyzed')}</p>
          <div style="background:#222; padding:8px; border-radius:4px; margin-bottom:10px; max-height:100px; overflow-y:auto;">
            <div style="font-size:12px; color:#4fc3f7; margin-bottom:4px;">${t('detectedCredentials')}</div>
            ${authListHtml}
          </div>
          <div style="background:#1e3a5f; padding:10px; border-radius:6px; margin:10px 0;">
            <p style="color:#4fc3f7; margin:0;">${t('step2InstructTitle')}</p>
            <ol style="padding-left:20px; margin:8px 0 0 0; font-size:12px;">
              <li>${t('step2Instr1')}</li>
              <li>${t('step2Instr2')}</li>
            </ol>
          </div>
          <p style="font-size:12px; color:#ffb74d; text-align:center;">
            <span style="display:inline-block; animation:pulse 1s infinite;">⚡</span>
            ${t('listeningOperations')}
          </p>
          <style>@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }</style>
        `;
        startInteractionCapture();
        break;

      case 3: // Response
        const step3Steps = t('step3Steps');
        content.innerHTML = `
          ${progressBar}
          <div style="background:#1a3520; padding:8px; border-radius:4px; margin-bottom:10px;">
            <p style="margin:0; color:#4caf50;">${t('step3Captured')}</p>
            <p style="font-size:11px; margin:4px 0 0 0; color:#aaa;">
              <b>${t('inputBox')}</b> <code style="background:#222; padding:2px 4px; border-radius:2px;">${state.inputSelector?.substring(0, 30) || 'N/A'}${state.inputSelector?.length > 30 ? '...' : ''}</code>
            </p>
            <p style="font-size:11px; margin:2px 0 0 0; color:#aaa;">
              <b>${t('sendMethodLabel')}</b> ${state.sendAction === 'enter' ? t('enterKey') : t('clickButton')}
            </p>
          </div>
          <div style="background:#1e3a5f; padding:10px; border-radius:6px; margin:10px 0;">
            <p style="color:#4fc3f7; margin:0;">${t('step3Title')}</p>
            <ol style="padding-left:18px; margin:8px 0 0 0; font-size:12px;">
              <li>${step3Steps[0]}</li>
              <li><b style="color:#ffeb3b;">${step3Steps[1]}</b></li>
              <li>${step3Steps[2]}</li>
            </ol>
            <div style="margin-top:8px; padding:6px; background:#2a3a4a; border-radius:4px; font-size:11px;">
              ${t('step3Why')}<br/>
              ${t('step3WhyDesc')}
            </div>
          </div>
          <div id="ai-wizard-best-candidate" style="background:#222; padding:8px; border-radius:4px; margin-bottom:8px;">
            <span style="color:#888">${t('waitingResponse')}</span>
          </div>
          <div style="font-size:11px; color:#888; margin-bottom:4px;">${t('capturedRequests')}</div>
          <div id="ai-wizard-req-list" style="max-height:80px; overflow-y:auto; font-size:11px; border:1px solid #333; padding:5px; background:#111;"></div>
        `;
        addBtn(t('findBySelectionBtn'), findRequestBySelection, 'primary');
        startNetworkCapture();
        break;

      case 4: // Result
        const config = generateFinalConfig();
        let configObj;
        try {
          configObj = JSON.parse(config);
        } catch (e) {
          configObj = null;
        }

        const authCount = configObj?.cookieRules?.authIndicators?.length || 0;
        const hasResponse = !!configObj?.response?.urlPattern;
        const hasCompleteApi = state.hasCompleteResponseApi;

        content.innerHTML = `
          ${progressBar}
          <div style="background:#1a3520; padding:12px; border-radius:6px; margin-bottom:12px; text-align:center;">
            <p style="color:#66bb6a; margin:0; font-size:16px;">${t('resultTitle')}</p>
          </div>
          <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
            <div style="flex:1; min-width:60px; background:#222; padding:8px; border-radius:4px; text-align:center;">
              <div style="font-size:18px;">${authCount}</div>
              <div style="font-size:9px; color:#888;">${t('authCredentials')}</div>
            </div>
            <div style="flex:1; min-width:60px; background:#222; padding:8px; border-radius:4px; text-align:center;">
              <div style="font-size:18px;">${hasResponse ? '✓' : '✗'}</div>
              <div style="font-size:9px; color:#888;">${t('responseCapture')}</div>
            </div>
            <div style="flex:1; min-width:60px; background:#222; padding:8px; border-radius:4px; text-align:center;">
              <div style="font-size:18px;">${state.responseIsStreaming ? '📡' : '📦'}</div>
              <div style="font-size:9px; color:#888;">${state.responseIsStreaming ? t('streaming') : t('normal')}</div>
            </div>
            <div style="flex:1; min-width:60px; background:${hasCompleteApi ? '#1a3520' : '#222'}; padding:8px; border-radius:4px; text-align:center; border:${hasCompleteApi ? '1px solid #4caf50' : 'none'};">
              <div style="font-size:18px;">${hasCompleteApi ? '✓' : '✗'}</div>
              <div style="font-size:9px; color:${hasCompleteApi ? '#4caf50' : '#888'};">${t('completeApi')}</div>
            </div>
          </div>
          ${hasCompleteApi ? `
            <div style="background:#1a3520; padding:8px; border-radius:4px; margin-bottom:10px; font-size:11px;">
              <span style="color:#4caf50;">${t('completeApiDetected')}</span><br/>
              <span style="color:#aaa;">${t('completeApiDesc')}</span>
            </div>
          ` : ''}
          <textarea id="ai-wizard-config" style="width:100%; height:100px; background:#111; color:#fff; border:1px solid #333; font-family:monospace; font-size:10px; padding:5px; resize:vertical;">${config}</textarea>
        `;

        addBtn(t('saveAndEnableBtn'), () => {
          try {
            const cfgObj = JSON.parse(document.getElementById('ai-wizard-config').value);
            safeSendMessage({ type: 'UPDATE_SITE', site: cfgObj }, (response) => {
              if (response && response.success) {
                showToast(t('configUpdated'));
                closeWizard();
              } else {
                safeSendMessage({ type: 'ADD_SITE', site: cfgObj }, (addResponse) => {
                  if (addResponse && addResponse.success) {
                    showToast(t('configSaved'));
                    closeWizard();
                  } else {
                    showToast(t('saveFailed') + (addResponse ? addResponse.error : 'Unknown error'), 'error');
                  }
                });
              }
            });
          } catch(e) {
            showToast(t('configFormatError') + e.message, 'error');
          }
        }, 'primary');

        addBtn('📋 ' + t('copy'), (e) => {
          const textarea = document.getElementById('ai-wizard-config');
          navigator.clipboard.writeText(textarea.value).then(() => {
            const btn = e.target;
            const originalText = btn.textContent;
            btn.textContent = '✓ ' + t('copied');
            setTimeout(() => btn.textContent = originalText, 2000);
          }).catch(() => {
            // 降级到旧方法
            textarea.select();
            document.execCommand('copy');
          });
        });

        addBtn(t('close'), closeWizard);
        break;
    }
  }

  // Toast 提示
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    Object.assign(toast.style, {
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      padding: '10px 20px', borderRadius: '6px', zIndex: '99999999',
      background: type === 'error' ? '#f44336' : '#4caf50',
      color: '#fff', fontSize: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    });
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
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
      safeSendMessage({ type: 'WIZARD_GET_COOKIES' }, resolve);
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
    // 增强版差异分析
    const beforeMap = new Map(state.beforeCookies.map(c => [c.name, c.value]));
    const candidates = [];

    state.afterCookies.forEach(c => {
      const name = c.name;
      const newVal = c.value;
      let confidence = 0; // 置信度评分

      // 1. 新 Key (登录后出现)
      if (!beforeMap.has(name)) {
        confidence = 50;
        // 如果是 JWT，置信度更高
        if (isJWT(newVal)) confidence = 90;
        // 如果包含认证关键词
        if (hasAuthKeyword(name)) confidence = Math.max(confidence, 80);
        // 如果是 UUID 格式
        if (isUUID(newVal)) confidence = Math.max(confidence, 60);

        candidates.push({
          name: name,
          type: 'new_key',
          confidence,
          loggedInValues: null,
          loggedOutValues: [],
          isJWT: isJWT(newVal),
          hasAuthKeyword: hasAuthKeyword(name)
        });
        return;
      }

      const oldVal = beforeMap.get(name);

      // 如果值没变，跳过
      if (oldVal === newVal) return;

      // 2. 存在 Key 的值由空变为有
      if ((!oldVal || oldVal === '') && (newVal && newVal !== '')) {
        confidence = 60;
        if (isJWT(newVal)) confidence = 95;
        if (hasAuthKeyword(name)) confidence = Math.max(confidence, 85);

        candidates.push({
          name: name,
          type: 'empty_to_value',
          confidence,
          loggedInValues: null,
          loggedOutValues: [''],
          isJWT: isJWT(newVal),
          hasAuthKeyword: hasAuthKeyword(name)
        });
        return;
      }

      // 3. 存在的 Key 值由 0/1, true/false 互变
      const isBinary = (v) => ['0', '1', 'true', 'false'].includes(String(v).toLowerCase());
      if (isBinary(oldVal) && isBinary(newVal)) {
        confidence = 70;
        if (hasAuthKeyword(name)) confidence = 90;

        candidates.push({
          name: name,
          type: 'binary_flip',
          confidence,
          loggedInValues: [newVal],
          loggedOutValues: [oldVal],
          hasAuthKeyword: hasAuthKeyword(name)
        });
        return;
      }

      // 4. 新增: JWT Token 变化（旧值不是 JWT，新值是 JWT）
      if (!isJWT(oldVal) && isJWT(newVal)) {
        candidates.push({
          name: name,
          type: 'jwt_appeared',
          confidence: 95,
          loggedInValues: null,
          loggedOutValues: [],
          isJWT: true,
          hasAuthKeyword: hasAuthKeyword(name)
        });
        return;
      }

      // 5. 新增: JWT 刷新（两个都是 JWT，但值变化了）
      if (isJWT(oldVal) && isJWT(newVal) && oldVal !== newVal) {
        candidates.push({
          name: name,
          type: 'jwt_refreshed',
          confidence: 85,
          loggedInValues: null,
          loggedOutValues: [],
          isJWT: true,
          hasAuthKeyword: hasAuthKeyword(name)
        });
        return;
      }

      // 6. 新增: 时间戳变化（可能是 session 过期时间更新）
      const oldTs = isTimestamp(oldVal);
      const newTs = isTimestamp(newVal);
      if (oldTs && newTs && hasAuthKeyword(name)) {
        candidates.push({
          name: name,
          type: 'timestamp_change',
          confidence: 65,
          loggedInValues: null,
          loggedOutValues: [],
          hasAuthKeyword: true
        });
        return;
      }

      // 7. 新增: 显著长度变化（可能是 session 数据填充）
      if (hasSignificantLengthChange(oldVal, newVal) && hasAuthKeyword(name)) {
        candidates.push({
          name: name,
          type: 'length_change',
          confidence: 55,
          loggedInValues: null,
          loggedOutValues: [''],
          hasAuthKeyword: true
        });
        return;
      }

      // 8. 新增: 包含认证关键词且值变化了
      if (hasAuthKeyword(name) && oldVal !== newVal) {
        candidates.push({
          name: name,
          type: 'auth_keyword_change',
          confidence: 50,
          loggedInValues: null,
          loggedOutValues: [],
          hasAuthKeyword: true
        });
      }
    });

    // 过滤掉无关的 (如 GA, 统计脚本等)
    const ignorePatterns = [
      '_ga', 'hm_', 'utm', 'history', 'viewport', 'size', 'screen',
      'LS:Hm_', 'LS:__tea', 'LS:APMPLUS', 'LS:_', 'analytics',
      'tracking', 'pixel', 'fbp', 'gclid', 'msclkid'
    ];
    const filtered = candidates.filter(c =>
      !ignorePatterns.some(i => c.name.toLowerCase().includes(i.toLowerCase()))
    );

    // 按置信度排序
    filtered.sort((a, b) => b.confidence - a.confidence);

    // 生成配置（按置信度排序，保留高置信度的）
    state.authConfig = filtered.map(c => ({
      name: c.name,
      loggedInValues: c.loggedInValues,
      loggedOutValues: c.loggedOutValues,
      confidence: c.confidence,
      type: c.type,
      isJWT: c.isJWT || false
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
      } catch (err) { return; }

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

        // 新增：标记流式响应类型
        const streamIcon = req.isStreaming ? '📡' : (req.isGrpc ? '⚡' : '');

        item.innerHTML = `<span style="color:#4caf50; font-weight:bold">${req.method}</span> ${authIcon}${streamIcon} ${req.url.substring(0, 28)}...`;
        item.onclick = () => confirmResponseUrl(req.url, req.contentType, req.isStreaming);
        list.insertBefore(item, list.firstChild);
      }
    } else if (e.data.type === 'AI_SNIFFER_RESPONSE_BODY') {
      // 存储响应体用于搜索
      const { url, body, contentType, isStreaming, isGrpc, partial, duration, requestId } = e.data.data;

      // 查找是否已存在该 URL 的记录
      const existingIndex = state.capturedBodies.findIndex(item => item.url === url);
      if (existingIndex !== -1) {
          // 更新现有记录
          state.capturedBodies[existingIndex].body = body;
          state.capturedBodies[existingIndex].contentType = contentType;
          state.capturedBodies[existingIndex].isStreaming = isStreaming;
          state.capturedBodies[existingIndex].isGrpc = isGrpc;
          if (!partial) {
            state.capturedBodies[existingIndex].duration = duration;
            state.capturedBodies[existingIndex].complete = true;
          }
      } else {
          state.capturedBodies.push({
            url, body, contentType, isStreaming, isGrpc, duration, requestId,
            complete: !partial
          });
          // 限制大小
          if (state.capturedBodies.length > 50) state.capturedBodies.shift();
      }

      // 更新 UI 显示最佳候选
      updateBestCandidateDisplay();
    } else if (e.data.type === 'AI_SNIFFER_STATS') {
      // 新增：接收请求统计信息（用于降级方案）
      state.requestStats = e.data.data.requests || [];
    }
  }

  // 新增：显示最佳候选请求
  function updateBestCandidateDisplay() {
    const bestCandidateEl = document.getElementById('ai-wizard-best-candidate');
    if (!bestCandidateEl) return;

    // 找出最可能是 AI 响应的请求
    const candidates = state.capturedBodies.filter(item => item.complete && item.body && item.body.length > 100);

    if (candidates.length === 0) {
      bestCandidateEl.innerHTML = `<span style="color:#888">${t('waitingResponse')}</span>`;
      return;
    }

    // 优先级：1. 流式响应 2. gRPC 3. 耗时最长
    let best = candidates.find(c => c.isStreaming);
    if (!best) best = candidates.find(c => c.isGrpc);
    if (!best) {
      // 按持续时间排序，取最长的
      best = candidates.sort((a, b) => (b.duration || 0) - (a.duration || 0))[0];
    }

    if (best) {
      const typeLabel = best.isStreaming ? `📡 ${t('streamingType')}` : (best.isGrpc ? `⚡ ${t('grpcType')}` : `📦 ${t('normal')}`);
      const durationLabel = best.duration ? `${(best.duration/1000).toFixed(1)}s` : '';
      bestCandidateEl.innerHTML = `
        <div style="color:#4fc3f7; margin-bottom:4px;">${t('recommendedResponse')}</div>
        <div style="font-size:11px; word-break:break-all;">
          ${typeLabel} ${durationLabel}<br/>
          ${best.url.substring(0, 50)}...
        </div>
        <button id="use-best-candidate" style="margin-top:8px; padding:4px 8px; background:#4caf50; color:#fff; border:none; border-radius:4px; cursor:pointer;">
          ${t('useThisRequest')}
        </button>
      `;
      document.getElementById('use-best-candidate')?.addEventListener('click', () => {
        confirmResponseUrl(best.url, best.contentType, best.isStreaming);
      });
    }
  }

  // 最小长句长度（用于判断是否有完整响应接口）
  const MIN_LONG_SENTENCE_LENGTH = 30;

  function findRequestBySelection() {
    const selection = window.getSelection().toString().trim();
    if (!selection) {
      alert(t('selectTextFirst'));
      return;
    }

    // 检查选中文本长度，提示用户选中长句以更准确判断
    const isLongSentence = selection.length >= MIN_LONG_SENTENCE_LENGTH;
    if (!isLongSentence) {
      const confirmShort = confirm(t('shortTextWarning', selection.length, MIN_LONG_SENTENCE_LENGTH));
      if (!confirmShort) return;
    }

    // 在捕获的响应体中搜索
    const matches = state.capturedBodies.filter(item => item.body && item.body.includes(selection));

    if (matches.length === 0) {
      // 降级方案：尝试使用耗时最长的请求
      const longestRequest = state.capturedBodies
        .filter(item => item.complete && item.body && item.body.length > 100)
        .sort((a, b) => (b.duration || 0) - (a.duration || 0))[0];

      if (longestRequest) {
        if (confirm(t('useLongestRequest', longestRequest.url, (longestRequest.duration/1000).toFixed(1)))) {
          confirmResponseUrl(longestRequest.url, longestRequest.contentType, longestRequest.isStreaming, false);
        }
      } else {
        alert(t('noMatchFound', selection.substring(0, 20)));
      }
      return;
    }

    // 分析匹配结果：区分流式响应和完整响应
    const streamingMatches = matches.filter(m => m.isStreaming || m.isGrpc);
    const completeMatches = matches.filter(m => !m.isStreaming && !m.isGrpc);

    // 判断是否有返回完整长句的接口
    const hasCompleteResponseApi = isLongSentence && completeMatches.length > 0;

    // 记录到 state
    state.hasCompleteResponseApi = hasCompleteResponseApi;
    state.completeResponseUrl = hasCompleteResponseApi ? completeMatches[0].url : null;

    if (matches.length === 1) {
      const match = matches[0];
      const typeInfo = match.isStreaming ? t('streamingResponse') : (match.isGrpc ? t('grpcType') : t('completeResponse'));
      if (confirm(t('foundMatch', match.url) + ` (${typeInfo})`)) {
        confirmResponseUrl(match.url, match.contentType, match.isStreaming, !match.isStreaming && isLongSentence);
      }
    } else {
      // 多个匹配时，展示选择对话框
      showResponseSelectionDialog(matches, streamingMatches, completeMatches, isLongSentence);
    }
  }

  // 新增：响应选择对话框
  function showResponseSelectionDialog(matches, streamingMatches, completeMatches, isLongSentence) {
    // 创建选择对话框
    const dialogOverlay = document.createElement('div');
    Object.assign(dialogOverlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.7)', zIndex: '99999998', display: 'flex',
      alignItems: 'center', justifyContent: 'center'
    });

    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
      background: '#1e1e1e', borderRadius: '8px', padding: '20px',
      maxWidth: '500px', width: '90%', maxHeight: '80vh', overflow: 'auto',
      color: '#fff', fontFamily: 'system-ui, sans-serif'
    });

    const hasComplete = completeMatches.length > 0 && isLongSentence;

    dialog.innerHTML = `
      <h3 style="margin:0 0 15px 0; color:#4fc3f7;">${t('foundMatches', matches.length)}</h3>
      ${hasComplete ? `
        <div style="background:#1a3520; padding:10px; border-radius:6px; margin-bottom:15px;">
          <p style="margin:0; color:#4caf50;">${t('completeApiFound')}</p>
          <p style="font-size:11px; margin:4px 0 0 0; color:#aaa;">
            ${t('completeApiFoundDesc')}
          </p>
        </div>
      ` : `
        <div style="background:#3a2a1a; padding:10px; border-radius:6px; margin-bottom:15px;">
          <p style="margin:0; color:#ff9800;">${t('noCompleteApi')}</p>
          <p style="font-size:11px; margin:4px 0 0 0; color:#aaa;">
            ${t('noCompleteApiDesc')}
          </p>
        </div>
      `}
      <div style="font-size:12px; color:#888; margin-bottom:8px;">${t('selectResponseType')}</div>
      <div id="response-options" style="display:flex; flex-direction:column; gap:8px;"></div>
      <div style="margin-top:15px; text-align:right;">
        <button id="cancel-selection" style="padding:8px 16px; background:#333; color:#fff; border:none; border-radius:4px; cursor:pointer;">${t('cancel')}</button>
      </div>
    `;

    dialogOverlay.appendChild(dialog);
    document.body.appendChild(dialogOverlay);

    const optionsContainer = dialog.querySelector('#response-options');

    // 添加流式响应选项
    if (streamingMatches.length > 0) {
      const best = streamingMatches.sort((a, b) => (b.duration || 0) - (a.duration || 0))[0];
      const option = createResponseOption(best, t('streamingResponse'), true);
      option.onclick = () => {
        dialogOverlay.remove();
        confirmResponseUrl(best.url, best.contentType, true, false);
      };
      optionsContainer.appendChild(option);
    }

    // 添加完整响应选项
    if (completeMatches.length > 0) {
      const best = completeMatches.sort((a, b) => (b.body?.length || 0) - (a.body?.length || 0))[0];
      const option = createResponseOption(best, t('completeResponse'), hasComplete);
      option.onclick = () => {
        dialogOverlay.remove();
        confirmResponseUrl(best.url, best.contentType, false, true);
      };
      optionsContainer.appendChild(option);
    }

    // 如果两种都有，添加"两者都用"选项
    if (streamingMatches.length > 0 && completeMatches.length > 0 && hasComplete) {
      const bothOption = document.createElement('div');
      Object.assign(bothOption.style, {
        background: '#2a3a4a', padding: '10px', borderRadius: '6px', cursor: 'pointer',
        border: '2px solid #4caf50'
      });
      bothOption.innerHTML = `
        <div style="color:#4caf50; font-weight:bold;">${t('useBoth')}</div>
        <div style="font-size:11px; color:#aaa; margin-top:4px;">
          ${t('useBothDesc')}
        </div>
      `;
      bothOption.onclick = () => {
        dialogOverlay.remove();
        const streaming = streamingMatches.sort((a, b) => (b.duration || 0) - (a.duration || 0))[0];
        const complete = completeMatches.sort((a, b) => (b.body?.length || 0) - (a.body?.length || 0))[0];
        confirmResponseUrlBoth(streaming, complete);
      };
      optionsContainer.insertBefore(bothOption, optionsContainer.firstChild);
    }

    dialog.querySelector('#cancel-selection').onclick = () => dialogOverlay.remove();
    dialogOverlay.onclick = (e) => { if (e.target === dialogOverlay) dialogOverlay.remove(); };
  }

  function createResponseOption(item, label, highlight) {
    const option = document.createElement('div');
    Object.assign(option.style, {
      background: '#222', padding: '10px', borderRadius: '6px', cursor: 'pointer',
      border: highlight ? '1px solid #4fc3f7' : '1px solid #333'
    });
    const durationLabel = item.duration ? `${(item.duration/1000).toFixed(1)}s` : '';
    option.innerHTML = `
      <div style="color:${highlight ? '#4fc3f7' : '#aaa'}; font-weight:bold;">${label}</div>
      <div style="font-size:10px; color:#666; margin-top:4px; word-break:break-all;">
        ${item.url.substring(0, 60)}... ${durationLabel}
      </div>
    `;
    option.onmouseover = () => option.style.background = '#333';
    option.onmouseout = () => option.style.background = '#222';
    return option;
  }

  // 新增：同时使用流式和完整响应
  function confirmResponseUrlBoth(streaming, complete) {
    try {
      const streamingPath = new URL(streaming.url).pathname;
      const completePath = new URL(complete.url).pathname;
      state.responseUrlPattern = streamingPath;
      state.completeResponseUrlPattern = completePath;
    } catch (err) {
      state.responseUrlPattern = streaming.url;
      state.completeResponseUrlPattern = complete.url;
    }

    state.responseContentType = streaming.contentType || null;
    state.responseIsStreaming = true;
    state.hasCompleteResponseApi = true;

    window.removeEventListener('message', handleNetworkMessage);
    state.step = 4;
    renderStep();
  }

  function confirmResponseUrl(url, contentType, isStreaming, isCompleteResponse) {
    try {
      const urlObj = new URL(url);
      state.responseUrlPattern = urlObj.pathname;
    } catch (err) {
      state.responseUrlPattern = url;
    }

    // 记录响应类型信息
    state.responseContentType = contentType || null;
    state.responseIsStreaming = isStreaming || false;

    // 如果是完整响应接口，单独记录
    if (isCompleteResponse && !isStreaming) {
      state.hasCompleteResponseApi = true;
      state.completeResponseUrlPattern = state.responseUrlPattern;
    }

    window.removeEventListener('message', handleNetworkMessage);
    state.step = 4;
    renderStep();
  }

  function generateFinalConfig() {
    const domain = window.location.hostname;
    const name = document.title.split(' ')[0] || domain;
    const siteId = domain.split('.')[0] === 'www' ? domain.split('.')[1] : domain.split('.')[0];

    // 安全转义选择器中的双引号
    const safeInputSelector = state.inputSelector ? state.inputSelector.replace(/"/g, '\\"') : '';
    const safeSendSelector = state.sendSelector ? state.sendSelector.replace(/"/g, '\\"') : '';

    // 简化 authIndicators，只保留必要字段
    const cleanAuthIndicators = (state.authConfig || []).map(c => ({
      name: c.name,
      loggedInValues: c.loggedInValues,
      loggedOutValues: c.loggedOutValues
    }));

    const config = {
      id: siteId,
      name: name,
      url: window.location.origin + '/',
      icon: '🤖',
      domains: [domain],
      cookieRules: {
        authIndicators: cleanAuthIndicators,
        anyOf: true
      },
      response: {
        // 响应配置
        urlPattern: state.responseUrlPattern,
        contentType: state.responseContentType,
        isStreaming: state.responseIsStreaming,
        // 完整响应接口（如果有）
        hasCompleteResponseApi: state.hasCompleteResponseApi,
        completeResponseUrlPattern: state.completeResponseUrlPattern || null
      },
      scripts: {
        sendMessage: state.sendAction === 'enter'
          ? `(function(t){var i=document.querySelector("${safeInputSelector}");if(!i)return{success:false,error:"Input not found"};i.value=t;i.dispatchEvent(new Event("input",{bubbles:true}));i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,bubbles:true}));return{success:true};})`
          : `(function(t){var i=document.querySelector("${safeInputSelector}");if(!i)return{success:false,error:"Input not found"};i.value=t;i.dispatchEvent(new Event("input",{bubbles:true}));setTimeout(function(){var b=document.querySelector("${safeSendSelector}");if(b)b.click();},300);return{success:true};})`,

        watchResponse: generateWatchResponseScript(siteId, state.responseUrlPattern, state.responseIsStreaming, state.completeResponseUrlPattern)
      },
      enabled: true
    };

    return JSON.stringify(config, null, 2);
  }

  // 根据响应类型生成更智能的监听脚本
  function generateWatchResponseScript(siteId, urlPattern, isStreaming, completePattern) {
    const escapedPattern = urlPattern ? urlPattern.replace(/"/g, '\\"') : '';
    const escapedCompletePattern = completePattern ? completePattern.replace(/"/g, '\\"') : '';

    // 如果同时有流式和完整响应接口
    if (isStreaming && completePattern) {
      return `(function(){const streamPattern="${escapedPattern}";const completePattern="${escapedCompletePattern}";const originalFetch=window.fetch;window.fetch=async function(input,init){const response=await originalFetch(input,init);const url=typeof input==="string"?input:input.url;if(url.includes(streamPattern)){const clone=response.clone();if(response.body){const reader=clone.body.getReader();const decoder=new TextDecoder();let content="";let lastEmit=0;(async()=>{while(true){const{done,value}=await reader.read();if(done)break;const chunk=decoder.decode(value,{stream:true});content+=chunk;const now=Date.now();if(now-lastEmit>100){lastEmit=now;if(window.__TAURI__)window.__TAURI__.event.emit("ai-response",{siteId:"${siteId}",content,partial:true,source:"stream"});}}})();}}if(url.includes(completePattern)){const clone=response.clone();clone.text().then(text=>{if(window.__TAURI__)window.__TAURI__.event.emit("ai-response",{siteId:"${siteId}",content:text,partial:false,source:"complete"});});}return response;};return{success:true};})()`;
    }

    if (isStreaming) {
      // 仅流式响应
      return `(function(){const pattern="${escapedPattern}";const originalFetch=window.fetch;window.fetch=async function(input,init){const response=await originalFetch(input,init);const url=typeof input==="string"?input:input.url;if(url.includes(pattern)){const clone=response.clone();if(response.body){const reader=clone.body.getReader();const decoder=new TextDecoder();let content="";let lastEmit=0;(async()=>{while(true){const{done,value}=await reader.read();if(done)break;const chunk=decoder.decode(value,{stream:true});content+=chunk;const now=Date.now();if(now-lastEmit>100||done){lastEmit=now;if(window.__TAURI__)window.__TAURI__.event.emit("ai-response",{siteId:"${siteId}",content,partial:true});}}if(window.__TAURI__)window.__TAURI__.event.emit("ai-response",{siteId:"${siteId}",content,partial:false});})();}}return response;};const XHR=window.XMLHttpRequest;window.XMLHttpRequest=function(){const xhr=new XHR();const open=xhr.open;xhr.open=function(method,url){this._url=url;open.apply(this,arguments);};xhr.addEventListener("progress",function(){if(this._url&&this._url.includes(pattern)&&this.responseText){if(window.__TAURI__)window.__TAURI__.event.emit("ai-response",{siteId:"${siteId}",content:this.responseText,partial:true});}});xhr.addEventListener("load",function(){if(this._url&&this._url.includes(pattern)){if(window.__TAURI__)window.__TAURI__.event.emit("ai-response",{siteId:"${siteId}",content:this.responseText,partial:false});}});return xhr;};return{success:true};})()`;
    } else {
      // 仅普通响应
      return `(function(){const pattern="${escapedPattern}";const originalFetch=window.fetch;window.fetch=async function(input,init){const response=await originalFetch(input,init);const url=typeof input==="string"?input:input.url;if(url.includes(pattern)){const clone=response.clone();clone.text().then(text=>{if(window.__TAURI__)window.__TAURI__.event.emit("ai-response",{siteId:"${siteId}",content:text,partial:false});});}return response;};const XHR=window.XMLHttpRequest;window.XMLHttpRequest=function(){const xhr=new XHR();const open=xhr.open;xhr.open=function(method,url){this._url=url;open.apply(this,arguments);};xhr.addEventListener("load",function(){if(this._url&&this._url.includes(pattern)){if(window.__TAURI__)window.__TAURI__.event.emit("ai-response",{siteId:"${siteId}",content:this.responseText,partial:false});}});return xhr;};return{success:true};})()`;
    }
  }

  // 启动
  // createUI(); // 移到 storage 回调中启动

})();
