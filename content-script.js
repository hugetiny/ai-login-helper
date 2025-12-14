// 检查扩展上下文是否有效
function isExtensionContextValid() {
  try {
    // 尝试访问 chrome.runtime.id，如果上下文无效会抛出错误
    return !!chrome.runtime?.id;
  } catch (e) {
    return false;
  }
}

// 消息处理函数
function handleMessage(event) {
  // 只接受来自同一窗口的消息
  if (event.source !== window) return;

  const message = event.data;
  if (!message || !message.type) return;

  // 检查扩展上下文是否有效
  if (!isExtensionContextValid()) {
    // 扩展已被重新加载，移除监听器避免后续错误
    window.removeEventListener('message', handleMessage);
    console.log('[AI Sniffer] Extension context invalidated, listener removed.');
    return;
  }

  // 支持的消息类型
  const supportedTypes = [
    'AI_SNIFFER_REQUEST',
    'AI_SNIFFER_RESPONSE',
    'AI_SNIFFER_RESPONSE_BODY',
    'AI_SNIFFER_STATS'
  ];

  if (supportedTypes.includes(message.type)) {
    // 转发给 Extension
    try {
      chrome.runtime.sendMessage({
        type: 'NETWORK_REQUEST_CAPTURED',
        subType: message.type,
        data: message.data
      }).catch(() => {
        // Popup 可能未打开，或扩展已断开，忽略错误
      });
    } catch (e) {
      // 扩展上下文无效，移除监听器
      if (e.message?.includes('Extension context invalidated')) {
        window.removeEventListener('message', handleMessage);
        console.log('[AI Sniffer] Extension context invalidated, listener removed.');
      }
    }
  }
}

// 监听来自页面的消息 (MAIN world -> Content Script -> Background/Popup)
window.addEventListener('message', handleMessage);
