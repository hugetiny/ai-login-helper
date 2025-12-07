/**
 * AI 登录检测调试器 - Background Service Worker
 *
 * 开发工具：用于验证 AI 网站登录检测逻辑
 *
 * 功能：
 * 1. 检测各 AI 网站的登录状态
 * 2. 提供调试信息帮助确定正确的 Cookie 配置
 * 3. 监听 Cookie 变化实时更新状态
 * 4. 支持用户自定义添加站点（通过 sites.json）
 */

// 站点配置（从 JSON 加载）
let AI_SITES = [];

// 登录状态存储
let loginStates = {};

// Wizard 状态
let wizardTabId = null;

// 注入 Wizard 脚本
async function injectWizardScripts(tabId) {
  if (!chrome.scripting) {
    console.error('[调试器] chrome.scripting API 未定义。请确保 manifest.json 中包含 "scripting" 权限，并重载扩展。');
    return;
  }
  try {
    // Inject Sniffer (MAIN world)
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      files: ['sniffer.js']
    });

    // Inject Wizard (ISOLATED world)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['wizard.js']
    });
    console.log('[调试器] Wizard 脚本已注入 Tab:', tabId);
  } catch (e) {
    console.error('[调试器] 注入 Wizard 脚本失败:', e);
  }
}

// 监听 Tab 更新 (用于 Wizard 自动重连)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === wizardTabId && changeInfo.status === 'complete') {
    console.log('[调试器] Wizard Tab 刷新，重新注入脚本...');
    injectWizardScripts(tabId);
  }
});

// 加载站点配置
async function loadSitesConfig() {
  try {
    // 首先尝试从 storage 加载用户自定义配置
    const stored = await chrome.storage.local.get('sitesConfig');
    if (stored.sitesConfig && stored.sitesConfig.sites) {
      AI_SITES = stored.sitesConfig.sites.filter(s => s.enabled !== false);
      console.log('[调试器] 从 storage 加载配置，共', AI_SITES.length, '个站点');
      return;
    }

    // 否则从 sites.json 加载默认配置
    const response = await fetch(chrome.runtime.getURL('sites.json'));
    const config = await response.json();
    AI_SITES = config.sites.filter(s => s.enabled !== false);

    // 保存到 storage
    await chrome.storage.local.set({ sitesConfig: config });
    console.log('[调试器] 从 sites.json 加载配置，共', AI_SITES.length, '个站点');

  } catch (error) {
    console.error('[调试器] 加载配置失败:', error);
    AI_SITES = [];
  }
}

// 初始化
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[调试器] 扩展已安装');
  await loadSitesConfig();
  await initializeLoginStates();
  await checkAllSitesLoginStatus();
});

// 启动时检查
chrome.runtime.onStartup.addListener(async () => {
  console.log('[调试器] 扩展已启动');
  await loadSitesConfig();
  await initializeLoginStates();
  await checkAllSitesLoginStatus();
});

// 初始化登录状态
async function initializeLoginStates() {
  // 初始化所有站点状态
  AI_SITES.forEach(site => {
    loginStates[site.id] = {
      siteId: site.id,
      name: site.name,
      icon: site.icon,
      url: site.url,
      isLoggedIn: false,
      lastChecked: null,
      matchedCookies: [],
      debug: {}
    };
  });
  console.log('[调试器] 初始化完成，共', AI_SITES.length, '个站点');
}

// 保存登录状态到 storage
async function saveLoginStates() {
  try {
    await chrome.storage.local.set({ loginStates });
    // 通知 popup 更新
    // 使用 try-catch 包裹 sendMessage，防止 "No SW" 或 "Receiving end does not exist" 错误
    try {
      await chrome.runtime.sendMessage({ type: 'LOGIN_STATES_UPDATED', data: loginStates });
    } catch (e) {
      // 忽略发送失败（通常是因为 popup 未打开）
    }
  } catch (e) {
    console.warn('[调试器] 保存状态失败:', e);
  }
}

/**
 * 检测单个站点的登录状态
 * 这是核心检测逻辑，需要根据实际情况调整
 */
async function checkSiteLoginStatus(site) {
  const startTime = Date.now();

  try {
    // 支持多域名配置
    const domains = site.domains || [site.domain];
    let allCookies = [];

    // 获取所有配置域名的 Cookie
    for (const domain of domains) {
      try {
        const cookies = await chrome.cookies.getAll({ domain: domain });
        allCookies = allCookies.concat(cookies);
      } catch (e) {
        console.warn(`[${site.name}] 获取域名 ${domain} 的 Cookie 失败:`, e);
      }
    }

    // 去重（同名 Cookie 可能在不同域名下都有）
    const uniqueCookies = [...new Map(allCookies.map(c => [c.name + c.domain, c])).values()];
    const cookieNames = uniqueCookies.map(c => c.name);

    // 获取检测规则
    const cookieRules = site.cookieRules || {};
    const { authIndicators = [], anyOf = false, excludeCookies = [] } = cookieRules;

    let isLoggedIn = false;
    const matchedCookies = [];
    const missingCookies = [];

    // 分离 Cookie 和 LocalStorage 指标
    const cookieIndicators = [];
    const lsIndicators = [];

    if (Array.isArray(authIndicators)) {
      authIndicators.forEach(ind => {
        const config = typeof ind === 'string'
          ? { name: ind, loggedInValues: null, loggedOutValues: null }
          : ind;

        if (config.name.startsWith('LS:')) {
          lsIndicators.push(config);
        } else {
          cookieIndicators.push(config);
        }
      });
    }

    // 1. 检测 Cookies
    for (const config of cookieIndicators) {
        // 跳过排除列表中的
        if (excludeCookies.some(ex => config.name.toLowerCase().includes(ex.toLowerCase()))) {
          continue;
        }

        // 使用包含匹配：允许部分匹配
        const foundCookie = uniqueCookies.find(cookie => {
          const name = cookie.name.toLowerCase();
          const req = config.name.toLowerCase();
          return name.includes(req) || req.includes(name);
        });

        if (foundCookie) {
          // 额外检查：Cookie 值不能为空或明显无效
          if (foundCookie.value && foundCookie.value.length > 0) {
            // 如果配置了 loggedInValues，检查值是否匹配
            if (config.loggedInValues && config.loggedInValues.length > 0) {
              // 支持通配符 "*"：只要存在且非空即匹配
              if (config.loggedInValues.includes('*') || config.loggedInValues.includes(foundCookie.value)) {
                matchedCookies.push({
                  required: config.name,
                  found: foundCookie.name,
                  type: 'cookie',
                  valueLength: foundCookie.value.length
                });
              }
            } else {
              // 没有配置值检查 (null/empty)，只要存在且非空即可
              matchedCookies.push({
                required: config.name,
                found: foundCookie.name,
                type: 'cookie',
                valueLength: foundCookie.value.length
              });
            }
          }
        } else {
          missingCookies.push(config.name);
        }
    }

    // 2. 检测 LocalStorage (如果有 LS 指标且有对应 Tab 打开)
    if (lsIndicators.length > 0) {
      try {
        // 查找该站点的 Tab
        const tabs = await chrome.tabs.query({});
        const siteTab = tabs.find(t => t.url && domains.some(d => t.url.includes(d.replace(/^\./, ''))));

        if (siteTab && siteTab.id) {
          // 注入脚本读取 LS
          const results = await chrome.scripting.executeScript({
            target: { tabId: siteTab.id },
            func: (keys) => {
              return keys.map(k => {
                const realKey = k.replace(/^LS:/, '');
                return { key: k, value: localStorage.getItem(realKey) };
              });
            },
            args: [lsIndicators.map(i => i.name)]
          });

          if (results && results[0] && results[0].result) {
            const lsValues = results[0].result;

            lsIndicators.forEach(config => {
              const item = lsValues.find(i => i.key === config.name);
              if (item && item.value) {
                 // 检查值
                 if (config.loggedInValues && config.loggedInValues.length > 0) {
                    if (config.loggedInValues.includes('*') || config.loggedInValues.includes(item.value)) {
                      matchedCookies.push({ required: config.name, found: config.name, type: 'ls', valueLength: item.value.length });
                    }
                 } else {
                    matchedCookies.push({ required: config.name, found: config.name, type: 'ls', valueLength: item.value.length });
                 }
              } else {
                missingCookies.push(config.name);
              }
            });
          }
        } else {
          // 没有打开 Tab，无法检测 LS，视为缺失
          // console.log(`[${site.name}] 无法检测 LocalStorage: 未找到活动 Tab`);
          lsIndicators.forEach(i => missingCookies.push(i.name + ' (Tab Closed)'));
        }
      } catch (e) {
        console.warn(`[${site.name}] LocalStorage 检测出错:`, e);
        lsIndicators.forEach(i => missingCookies.push(i.name + ' (Error)'));
      }
    }

    // 判断登录状态
    if (anyOf) {
      // anyOf: true - 任意一个匹配即可
      isLoggedIn = matchedCookies.length > 0;
    } else {
      // anyOf: false - 必须全部匹配
      isLoggedIn = missingCookies.length === 0 && matchedCookies.length === authIndicators.length;
    }

    // 更新状态
    loginStates[site.id] = {
      siteId: site.id,
      name: site.name,
      icon: site.icon,
      url: site.url,
      isLoggedIn,
      lastChecked: new Date().toISOString(),
      matchedCookies: matchedCookies.map(m => m.found),
      debug: {
        domains,
        totalCookies: uniqueCookies.length,
        allCookieNames: cookieNames,
        authIndicators,
        anyOf,
        matchedCookies,
        missingCookies,
        checkDuration: Date.now() - startTime
      }
    };

    // 输出调试信息
    const status = isLoggedIn ? '✅ 已登录' : '❌ 未登录';
    const matched = matchedCookies.map(m => m.found).join(', ') || '(无)';
    console.log(`[${site.name}] ${status} | 匹配: [${matched}] | Cookie总数: ${uniqueCookies.length}`);

    return isLoggedIn;

  } catch (error) {
    console.error(`[${site.name}] 检测失败:`, error);

    loginStates[site.id] = {
      ...loginStates[site.id],
      isLoggedIn: false,
      lastChecked: new Date().toISOString(),
      debug: { error: error.message }
    };

    return false;
  }
}

// 检查所有站点的登录状态
async function checkAllSitesLoginStatus() {
  console.log('[调试器] 开始检测所有站点...');
  const startTime = Date.now();

  for (const site of AI_SITES) {
    await checkSiteLoginStatus(site);
  }

  await saveLoginStates();

  const loggedInCount = Object.values(loginStates).filter(s => s.isLoggedIn).length;
  console.log(`[调试器] 检测完成，${loggedInCount}/${AI_SITES.length} 个已登录，耗时 ${Date.now() - startTime}ms`);
}

// 监听 Cookie 变化
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  try {
    const { cookie, removed } = changeInfo;

    // 查找匹配的站点
    const site = AI_SITES.find(s => {
      const domains = s.domains || [s.domain];
      return domains.some(d => cookie.domain.includes(d.replace(/^\./, '')));
    });

    if (site) {
      // 检查这个 Cookie 是否在我们的监测列表中
      const cookieRules = site.cookieRules || {};
      const authIndicators = cookieRules.authIndicators || [];

      const isRelevant = authIndicators.some(indicator => {
        const configName = typeof indicator === 'string' ? indicator : indicator.name;
        return cookie.name.toLowerCase().includes(configName.toLowerCase()) ||
               configName.toLowerCase().includes(cookie.name.toLowerCase());
      });

      if (isRelevant) {
        console.log(`[${site.name}] Cookie ${removed ? '移除' : '变化'}: ${cookie.name}`);
        // 重新检测该站点
        await checkSiteLoginStatus(site);
        await saveLoginStates();
      }
    }
  } catch (e) {
    console.error('[调试器] Cookie 监听处理错误:', e);
  }
});

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_LOGIN_STATES':
      // 确保配置已加载
      if (AI_SITES.length === 0) {
        loadSitesConfig().then(() => {
          initializeLoginStates().then(() => {
            checkAllSitesLoginStatus().then(() => {
              sendResponse({ data: loginStates });
            });
          });
        });
        return true;
      }
      sendResponse({ data: loginStates });
      break;

    case 'REFRESH_ALL':
      checkAllSitesLoginStatus().then(() => {
        sendResponse({ data: loginStates });
      });
      return true;

    case 'REFRESH_SITE':
      const site = AI_SITES.find(s => s.id === message.siteId);
      if (site) {
        checkSiteLoginStatus(site).then(() => {
          saveLoginStates().then(() => {
            sendResponse({ data: loginStates });
          });
        });
        return true;
      }
      break;

    case 'GET_SITE_DEBUG':
      const debugSite = loginStates[message.siteId];
      sendResponse({ data: debugSite });
      break;

    case 'START_WIZARD':
      wizardTabId = message.tabId;
      injectWizardScripts(wizardTabId).catch(e => console.error(e));
      sendResponse({ success: true });
      break;

    case 'STOP_WIZARD':
      wizardTabId = null;
      chrome.storage.local.remove('wizardState');
      sendResponse({ success: true });
      break;

    case 'WIZARD_GET_COOKIES':
      if (sender.tab && sender.tab.url) {
        chrome.cookies.getAll({ url: sender.tab.url }, (cookies) => {
          sendResponse(cookies);
        });
        return true; // Async response
      }
      break;

    case 'GET_SITES_CONFIG':
      sendResponse({ data: AI_SITES });
      break;

    case 'ADD_SITE':
      // 添加新站点
      addNewSite(message.site).then(result => {
        sendResponse(result);
      });
      return true;

    case 'UPDATE_SITE':
      // 更新站点配置
      updateSite(message.site).then(result => {
        sendResponse(result);
      });
      return true;

    case 'DELETE_SITE':
      // 删除站点
      deleteSite(message.siteId).then(result => {
        sendResponse(result);
      });
      return true;

    case 'RESET_CONFIG':
      // 重置为默认配置
      resetToDefaultConfig().then(result => {
        sendResponse(result);
      });
      return true;

    case 'EXPORT_CONFIG':
      // 导出配置
      exportConfig().then(result => {
        sendResponse(result);
      });
      return true;

    case 'IMPORT_CONFIG':
      // 导入配置
      importConfig(message.config).then(result => {
        sendResponse(result);
      });
      return true;
  }
});

// 添加新站点
async function addNewSite(newSite) {
  try {
    // 检查 ID 是否已存在
    if (AI_SITES.some(s => s.id === newSite.id)) {
      return { success: false, error: '站点 ID 已存在' };
    }

    // 添加到配置
    AI_SITES.push(newSite);

    // 保存到 storage
    const stored = await chrome.storage.local.get('sitesConfig');
    const config = stored.sitesConfig || { version: '1.0.0', sites: [] };
    config.sites.push(newSite);
    await chrome.storage.local.set({ sitesConfig: config });

    // 初始化状态并检测
    await initializeLoginStates();
    await checkSiteLoginStatus(newSite);
    await saveLoginStates();

    console.log('[调试器] 添加新站点:', newSite.name);
    return { success: true, data: AI_SITES };

  } catch (error) {
    console.error('[调试器] 添加站点失败:', error);
    return { success: false, error: error.message };
  }
}

// 更新站点配置
async function updateSite(updatedSite) {
  try {
    const index = AI_SITES.findIndex(s => s.id === updatedSite.id);
    if (index === -1) {
      return { success: false, error: '站点不存在' };
    }

    AI_SITES[index] = updatedSite;

    // 保存到 storage
    const stored = await chrome.storage.local.get('sitesConfig');
    const config = stored.sitesConfig || { version: '1.0.0', sites: [] };
    const configIndex = config.sites.findIndex(s => s.id === updatedSite.id);
    if (configIndex !== -1) {
      config.sites[configIndex] = updatedSite;
    }
    await chrome.storage.local.set({ sitesConfig: config });

    // 重新检测
    await checkSiteLoginStatus(updatedSite);
    await saveLoginStates();

    console.log('[调试器] 更新站点:', updatedSite.name);
    return { success: true, data: AI_SITES };

  } catch (error) {
    console.error('[调试器] 更新站点失败:', error);
    return { success: false, error: error.message };
  }
}

// 删除站点
async function deleteSite(siteId) {
  try {
    const index = AI_SITES.findIndex(s => s.id === siteId);
    if (index === -1) {
      return { success: false, error: '站点不存在' };
    }

    const siteName = AI_SITES[index].name;
    AI_SITES.splice(index, 1);

    // 从 storage 删除
    const stored = await chrome.storage.local.get('sitesConfig');
    const config = stored.sitesConfig || { version: '1.0.0', sites: [] };
    config.sites = config.sites.filter(s => s.id !== siteId);
    await chrome.storage.local.set({ sitesConfig: config });

    // 删除状态
    delete loginStates[siteId];
    await saveLoginStates();

    console.log('[调试器] 删除站点:', siteName);
    return { success: true, data: AI_SITES };

  } catch (error) {
    console.error('[调试器] 删除站点失败:', error);
    return { success: false, error: error.message };
  }
}

// 重置为默认配置
async function resetToDefaultConfig() {
  try {
    // 清空配置，而不是重置为默认的 sites.json
    const emptyConfig = { version: '1.0.0', sites: [] };
    await chrome.storage.local.set({ sitesConfig: emptyConfig });

    // 更新内存中的配置
    AI_SITES = [];

    // 清除所有登录状态
    loginStates = {};

    console.log('[调试器] 已清空所有配置');
    return { success: true, data: AI_SITES };

  } catch (error) {
    console.error('[调试器] 重置配置失败:', error);
    return { success: false, error: error.message };
  }
}

// 导出配置
async function exportConfig() {
  try {
    const stored = await chrome.storage.local.get('sitesConfig');
    const config = stored.sitesConfig || { version: '1.0.0', sites: AI_SITES };
    return { success: true, data: config };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 导入配置
async function importConfig(config) {
  try {
    if (!config || !config.sites || !Array.isArray(config.sites)) {
      return { success: false, error: '无效的配置格式' };
    }

    await chrome.storage.local.set({ sitesConfig: config });
    AI_SITES = config.sites.filter(s => s.enabled !== false);

    await initializeLoginStates();
    await checkAllSitesLoginStatus();

    console.log('[调试器] 导入配置成功，共', AI_SITES.length, '个站点');
    return { success: true, data: AI_SITES };

  } catch (error) {
    console.error('[调试器] 导入配置失败:', error);
    return { success: false, error: error.message };
  }
}

// 定期刷新
setInterval(async () => {
  if (AI_SITES.length > 0) {
    await checkAllSitesLoginStatus();
  }
}, 60 * 1000);

// 启动时加载配置
loadSitesConfig().then(() => {
  initializeLoginStates().then(() => {
    checkAllSitesLoginStatus();
  });
});

console.log('[调试器] Background Service Worker 已启动');
