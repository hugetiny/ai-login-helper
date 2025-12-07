// 监听来自页面的消息 (MAIN world -> Content Script -> Background/Popup)
window.addEventListener('message', (event) => {
  // 只接受来自同一窗口的消息
  if (event.source !== window) return;

  const message = event.data;
  if (message && (message.type === 'AI_SNIFFER_REQUEST' || message.type === 'AI_SNIFFER_RESPONSE')) {
    // 转发给 Extension
    chrome.runtime.sendMessage({
      type: 'NETWORK_REQUEST_CAPTURED',
      data: message.data
    }).catch(() => {
      // Popup 可能未打开，忽略错误
    });
  }
});
