// 注入到页面的嗅探脚本 (MAIN world)
(function() {
  if (window.__ai_sniffer_injected) return;
  window.__ai_sniffer_injected = true;

  const originalFetch = window.fetch;
  const originalXHR = window.XMLHttpRequest;
  let lastInteractionTime = 0;

  // 流式响应的 Content-Type 优先级
  const STREAM_CONTENT_TYPES = [
    'text/event-stream',           // SSE 标准
    'application/x-ndjson',        // Newline Delimited JSON
    'application/stream+json',     // Streaming JSON
    'application/json+stream',     // Streaming JSON (备选)
    'text/plain',                  // 有些 AI 用纯文本流
    'application/octet-stream'     // 二进制流（某些场景）
  ];

  // grpc-web / connect 相关的 Content-Type
  const GRPC_CONTENT_TYPES = [
    'application/connect+json',    // Connect Protocol
    'application/grpc-web+proto',  // gRPC-Web
    'application/grpc-web+json',   // gRPC-Web JSON
    'application/grpc-web-text'    // gRPC-Web Text
  ];

  // 所有需要关注的流式类型
  const ALL_STREAM_TYPES = [...STREAM_CONTENT_TYPES, ...GRPC_CONTENT_TYPES];

  // 判断 Content-Type 是否为流式响应
  function isStreamingContentType(contentType) {
    if (!contentType) return false;
    const ct = contentType.toLowerCase();
    return ALL_STREAM_TYPES.some(t => ct.includes(t));
  }

  // 判断是否为 grpc/connect 类型
  function isGrpcConnectType(contentType) {
    if (!contentType) return false;
    const ct = contentType.toLowerCase();
    return GRPC_CONTENT_TYPES.some(t => ct.includes(t));
  }

  // 请求追踪：记录持续时间用于降级方案
  const requestTracker = new Map();

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
    const requestId = Math.random().toString(36).slice(2);
    const requestStartTime = Date.now();

    try {
      if (input instanceof Request) {
          url = input.url;
          method = input.method;
          try {
            input.headers.forEach((v, k) => headers[k] = v);
          } catch(e) {}
      } else {
          url = String(input);
          method = 'GET';
      }

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

    // 记录请求开始
    requestTracker.set(requestId, { url, method, startTime: requestStartTime, headers });

    // 发送请求开始事件
    window.postMessage({
      type: 'AI_SNIFFER_REQUEST',
      data: { url, method, type: 'fetch', timeSinceInteraction, headers, requestId }
    }, '*');

    try {
      const response = await originalFetch(input, init);
      const clone = response.clone();

      // 获取 Content-Type
      const contentType = response.headers.get('content-type') || '';
      const isStreaming = isStreamingContentType(contentType);
      const isGrpc = isGrpcConnectType(contentType);

      // 更新追踪信息
      requestTracker.set(requestId, {
        ...requestTracker.get(requestId),
        contentType,
        isStreaming,
        isGrpc,
        status: response.status
      });

      // 读取响应体
      if (response.body) {
          const reader = clone.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';
          let chunkCount = 0;

          (async () => {
              try {
                  while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      const chunk = decoder.decode(value, { stream: true });
                      fullText += chunk;
                      chunkCount++;

                      // 发送增量更新
                      if (fullText.length > 0) {
                          window.postMessage({
                              type: 'AI_SNIFFER_RESPONSE_BODY',
                              data: {
                                url, method, body: fullText,
                                type: 'fetch', timeSinceInteraction,
                                partial: true, chunkCount,
                                contentType, isStreaming, isGrpc, requestId
                              }
                          }, '*');
                      }
                  }
                  // 最终完整发送
                  const duration = Date.now() - requestStartTime;
                  window.postMessage({
                      type: 'AI_SNIFFER_RESPONSE_BODY',
                      data: {
                        url, method, body: fullText,
                        type: 'fetch', timeSinceInteraction,
                        partial: false, chunkCount, duration,
                        contentType, isStreaming, isGrpc, requestId
                      }
                  }, '*');
                  // 更新追踪器
                  requestTracker.set(requestId, {
                    ...requestTracker.get(requestId),
                    duration, bodyLength: fullText.length, chunkCount
                  });
              } catch (e) {}
          })();
      } else {
          clone.text().then(text => {
            const duration = Date.now() - requestStartTime;
            window.postMessage({
              type: 'AI_SNIFFER_RESPONSE_BODY',
              data: {
                url, method, body: text,
                type: 'fetch', timeSinceInteraction,
                contentType, isStreaming, duration, requestId
              }
            }, '*');
          }).catch(() => {});
      }

      // 发送响应事件
      window.postMessage({
        type: 'AI_SNIFFER_RESPONSE',
        data: { url, method, status: response.status, type: 'fetch', contentType, isStreaming, isGrpc, requestId }
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
    const requestId = Math.random().toString(36).slice(2);

    xhr._headers = {};
    xhr._requestId = requestId;

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
      this._timeSinceInteraction = timeSinceInteraction;

      window.postMessage({
        type: 'AI_SNIFFER_REQUEST',
        data: { url: this._url, method: this._method, type: 'xhr', timeSinceInteraction, headers: this._headers, requestId: this._requestId }
      }, '*');
      send.apply(this, arguments);
    };

    // 监听进度事件以捕获增量数据
    xhr.addEventListener('progress', function() {
      const contentType = this.getResponseHeader('content-type') || '';
      const isStreaming = isStreamingContentType(contentType);
      const isGrpc = isGrpcConnectType(contentType);

      if (this.responseText && this.responseText.length > 0) {
        window.postMessage({
          type: 'AI_SNIFFER_RESPONSE_BODY',
          data: {
            url: this._url, method: this._method, body: this.responseText,
            type: 'xhr', timeSinceInteraction: this._timeSinceInteraction,
            partial: true, contentType, isStreaming, isGrpc, requestId: this._requestId
          }
        }, '*');
      }
    });

    xhr.addEventListener('load', function() {
      const duration = Date.now() - this._startTime;
      const contentType = this.getResponseHeader('content-type') || '';
      const isStreaming = isStreamingContentType(contentType);
      const isGrpc = isGrpcConnectType(contentType);

      window.postMessage({
        type: 'AI_SNIFFER_RESPONSE_BODY',
        data: {
          url: this._url, method: this._method, body: this.responseText,
          type: 'xhr', timeSinceInteraction: this._timeSinceInteraction,
          partial: false, duration, contentType, isStreaming, isGrpc, requestId: this._requestId
        }
      }, '*');

      window.postMessage({
        type: 'AI_SNIFFER_RESPONSE',
        data: {
          url: this._url, method: this._method, status: this.status,
          type: 'xhr', contentType, isStreaming, isGrpc, duration, requestId: this._requestId
        }
      }, '*');
    });

    return xhr;
  };

  // Hook EventSource (SSE) - 原生 SSE 支持
  const OriginalEventSource = window.EventSource;
  window.EventSource = function(url, options) {
    const es = new OriginalEventSource(url, options);
    const timeSinceInteraction = Date.now() - lastInteractionTime;
    const requestId = Math.random().toString(36).slice(2);
    const startTime = Date.now();
    let accumulatedData = '';
    let messageCount = 0;

    window.postMessage({
      type: 'AI_SNIFFER_REQUEST',
      data: { url, method: 'GET', type: 'eventsource', timeSinceInteraction, requestId, contentType: 'text/event-stream', isStreaming: true }
    }, '*');

    es.addEventListener('message', (event) => {
       accumulatedData += event.data + '\n';
       messageCount++;

       window.postMessage({
          type: 'AI_SNIFFER_RESPONSE_BODY',
          data: {
            url, method: 'GET', body: accumulatedData,
            type: 'eventsource', partial: true,
            contentType: 'text/event-stream', isStreaming: true,
            messageCount, requestId
          }
       }, '*');
    });

    // 监听结束事件
    es.addEventListener('error', () => {
      const duration = Date.now() - startTime;
      if (accumulatedData.length > 0) {
        window.postMessage({
          type: 'AI_SNIFFER_RESPONSE_BODY',
          data: {
            url, method: 'GET', body: accumulatedData,
            type: 'eventsource', partial: false,
            contentType: 'text/event-stream', isStreaming: true,
            messageCount, duration, requestId
          }
        }, '*');
      }
    });

    return es;
  };

  // 定期发送追踪统计信息（用于降级方案识别最长请求）
  setInterval(() => {
    if (requestTracker.size > 0) {
      const stats = Array.from(requestTracker.entries()).map(([id, data]) => ({
        requestId: id,
        url: data.url,
        duration: data.duration || (Date.now() - data.startTime),
        contentType: data.contentType,
        isStreaming: data.isStreaming,
        isGrpc: data.isGrpc,
        bodyLength: data.bodyLength
      }));

      window.postMessage({
        type: 'AI_SNIFFER_STATS',
        data: { requests: stats }
      }, '*');

      // 清理超过 30 秒的旧记录
      const now = Date.now();
      for (const [id, data] of requestTracker.entries()) {
        if (now - data.startTime > 30000) {
          requestTracker.delete(id);
        }
      }
    }
  }, 2000);

  console.log('AI Network Sniffer Injected (Enhanced Streaming Support)');
})();
