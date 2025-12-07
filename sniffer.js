// 注入到页面的嗅探脚本 (MAIN world)
(function() {
  if (window.__ai_sniffer_injected) return;
  window.__ai_sniffer_injected = true;

  const originalFetch = window.fetch;
  const originalXHR = window.XMLHttpRequest;
  let lastInteractionTime = 0;

  // 监听用户交互
  function updateInteractionTime() {
    lastInteractionTime = Date.now();
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') updateInteractionTime();
  }, true);
  window.addEventListener('click', updateInteractionTime, true);

  // Hook fetch
  window.fetch = async function(input, init) {
    let url, method, headers = {};

    try {
      // 处理 input 为 Request 对象的情况
      if (input instanceof Request) {
          url = input.url;
          method = input.method;
          try {
            input.headers.forEach((v, k) => headers[k] = v);
          } catch(e) {}
      } else {
          // 兼容 URL 对象或字符串
          url = String(input);
          method = 'GET';
      }

      // 处理 init 参数覆盖
      if (init) {
          if (init.method) method = init.method;
          if (init.headers) {
              if (init.headers instanceof Headers) {
                  init.headers.forEach((v, k) => headers[k] = v);
              } else {
                  Object.assign(headers, init.headers);
              }
          }
      }
    } catch (e) {
      console.error('[AI Sniffer] Error parsing fetch args:', e);
      url = 'unknown';
      method = 'GET';
    }

    const timeSinceInteraction = Date.now() - lastInteractionTime;

    // 发送请求开始事件
    window.postMessage({
      type: 'AI_SNIFFER_REQUEST',
      data: { url, method, type: 'fetch', timeSinceInteraction, headers }
    }, '*');

    try {
      const response = await originalFetch(input, init);

      // 尝试读取响应体 (Clone 以免影响原流程)
      const clone = response.clone();

      // 如果是流式响应，尝试增量读取
      if (response.body) {
          const reader = clone.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';

          (async () => {
              try {
                  while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      const chunk = decoder.decode(value, { stream: true });
                      fullText += chunk;
                      // 每收到一些数据就发送更新，方便用户在生成过程中就能搜索到
                      if (fullText.length > 0) {
                          window.postMessage({
                              type: 'AI_SNIFFER_RESPONSE_BODY',
                              data: { url, method, body: fullText, type: 'fetch', timeSinceInteraction, partial: true }
                          }, '*');
                      }
                  }
                  // 最终完整发送
                  window.postMessage({
                      type: 'AI_SNIFFER_RESPONSE_BODY',
                      data: { url, method, body: fullText, type: 'fetch', timeSinceInteraction, partial: false }
                  }, '*');
              } catch (e) {}
          })();
      } else {
          clone.text().then(text => {
            window.postMessage({
              type: 'AI_SNIFFER_RESPONSE_BODY',
              data: { url, method, body: text, type: 'fetch', timeSinceInteraction }
            }, '*');
          }).catch(() => {});
      }

      // 发送响应事件
      window.postMessage({
        type: 'AI_SNIFFER_RESPONSE',
        data: { url, method, status: response.status, type: 'fetch' }
      }, '*');
      return response;
    } catch (error) {
      throw error;
    }
  };

  // Hook XHR
  const XHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new XHR();
    const open = xhr.open;

    xhr._headers = {};

    xhr.open = function(method, url) {
      this._method = method;
      this._url = url;
      this._startTime = Date.now();
      open.apply(this, arguments);
    };

    const setRequestHeader = xhr.setRequestHeader;
    xhr.setRequestHeader = function(header, value) {
        this._headers[header] = value;
        setRequestHeader.apply(this, arguments);
    };

    const send = xhr.send;
    xhr.send = function() {
      const timeSinceInteraction = Date.now() - lastInteractionTime;
      // 在 send 时记录交互时间差
      window.postMessage({
        type: 'AI_SNIFFER_REQUEST',
        data: { url: this._url, method: this._method, type: 'xhr', timeSinceInteraction, headers: this._headers }
      }, '*');
      send.apply(this, arguments);
    };

    xhr.addEventListener('load', function() {
      // 发送响应体
      window.postMessage({
        type: 'AI_SNIFFER_RESPONSE_BODY',
        data: { url: this._url, method: this._method, body: this.responseText, type: 'xhr', timeSinceInteraction }
      }, '*');

      window.postMessage({
        type: 'AI_SNIFFER_RESPONSE',
        data: { url: this._url, method: this._method, status: this.status, type: 'xhr' }
      }, '*');
    });

    return xhr;
  };

  // Hook EventSource (SSE)
  const OriginalEventSource = window.EventSource;
  window.EventSource = function(url, options) {
    const es = new OriginalEventSource(url, options);
    const timeSinceInteraction = Date.now() - lastInteractionTime;

    window.postMessage({
      type: 'AI_SNIFFER_REQUEST',
      data: { url, method: 'GET', type: 'eventsource', timeSinceInteraction }
    }, '*');

    es.addEventListener('message', (event) => {
       window.postMessage({
          type: 'AI_SNIFFER_RESPONSE_BODY',
          data: { url, method: 'GET', body: event.data, type: 'eventsource' }
       }, '*');
    });

    return es;
  };

  console.log('AI Network Sniffer Injected');
})();
