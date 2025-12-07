/**
 * AI 登录检测调试器 - 简化版 Popup 脚本
 */

// 站点配置
let AI_SITES = [];

// DOM 元素
const currentTabInfo = document.getElementById('current-tab-info');
const startWizardBtn = document.getElementById('start-wizard-btn');
const exportAllBtn = document.getElementById('export-all-btn');
const clearSavedBtn = document.getElementById('clear-saved-btn');
const configCountHint = document.getElementById('config-count-hint');

// 初始化
async function init() {
  // 加载配置
  await loadSitesConfig();

  // 分析当前 Tab
  await analyzeCurrentTab();

  // 绑定事件
  bindEvents();
}

async function loadSitesConfig() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SITES_CONFIG' });
    AI_SITES = response?.data || [];
    updateConfigCount();
  } catch (e) {
    console.error('加载配置失败:', e);
  }
}

function updateConfigCount() {
  if (configCountHint) {
    configCountHint.textContent = `当前已保存 ${AI_SITES.length} 个站点配置`;
  }
}

async function analyzeCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const url = new URL(tab.url);
  const domain = url.hostname;

  // 查找匹配的站点配置
  const matchedSite = AI_SITES.find(s => {
    const domains = s.domains || [s.domain];
    return domains.some(d => domain.includes(d.replace(/^\./, '')));
  });

  if (matchedSite) {
    // 获取登录状态
    const response = await chrome.runtime.sendMessage({ type: 'GET_LOGIN_STATES' });
    const loginStates = response?.data || {};
    const state = loginStates[matchedSite.id];

    const statusHtml = state && state.isLoggedIn
      ? `<span class="status-badge status-logged-in">✅ 已登录</span>`
      : `<span class="status-badge status-logged-out">❌ 未登录</span>`;

    currentTabInfo.innerHTML = `
      <div style="margin-bottom:5px;"><strong>${matchedSite.name}</strong></div>
      <div>状态: ${statusHtml}</div>
      <div style="font-size:11px; color:#888; margin-top:5px;">ID: ${matchedSite.id}</div>
    `;
  } else {
    currentTabInfo.innerHTML = `
      <div style="color:#666;">当前站点未配置</div>
      <div style="font-size:11px; color:#888; margin-top:5px;">${domain}</div>
    `;
  }
}

function bindEvents() {
  // 启动向导
  if (startWizardBtn) {
    startWizardBtn.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      // 通知 background 启动 wizard
      await chrome.runtime.sendMessage({
        type: 'START_WIZARD',
        tabId: tab.id
      });

      window.close();
    });
  }

  // 导出配置
  if (exportAllBtn) {
    exportAllBtn.addEventListener('click', async () => {
      const response = await chrome.runtime.sendMessage({ type: 'EXPORT_CONFIG' });
      if (response && response.success) {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sites.json';
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  }

  // 清空配置
  if (clearSavedBtn) {
    clearSavedBtn.addEventListener('click', async () => {
      if (confirm('确定要清空所有已保存的站点配置吗？此操作不可恢复。')) {
        await chrome.runtime.sendMessage({ type: 'RESET_CONFIG' });
        await loadSitesConfig();
        await analyzeCurrentTab();
      }
    });
  }
}

// 启动
init();
