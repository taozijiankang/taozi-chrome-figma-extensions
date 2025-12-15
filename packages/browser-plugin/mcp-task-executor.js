/**
 * mcp 任务执行器
 * 用于执行 mcp 派发的 任务，并返回结果
 */

class MCPTaskExecutor {
  constructor() {
    this.ws = null;
    this.wsUrl = "ws://localhost:3101/ws";
    this.reconnectDelay = 1000; // 初始重连延迟（毫秒）
    this.maxReconnectDelay = 30000; // 最大重连延迟（毫秒）
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = Infinity; // 最大重连次数，Infinity 表示无限重连
    this.reconnectTimer = null;
    this.isManualClose = false; // 是否手动关闭连接
    this.heartbeatInterval = null; // 客户端主动发送心跳的定时器
    this.heartbeatCheckInterval = null; // 检测服务器心跳的定时器
    this.lastServerHeartbeat = null; // 最后一次收到服务器心跳的时间
    this.serverHeartbeatTimeout = 5000; // 服务器心跳超时时间（毫秒），服务器每1秒发送一次，5秒未收到则认为超时
    this.statusIndicator = null; // 状态指示器元素
    this.previousStatus = null; // 执行任务前的状态，用于任务完成后恢复
    this.previousStatusText = null; // 执行任务前的状态文本
    // 不立即初始化，等待 DOM 准备好
  }

  /**
   * 初始化状态指示器
   */
  initStatusIndicator() {
    // 确保 document.body 存在
    if (!document.body) {
      // 如果 body 不存在，等待 DOM 加载完成
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          this.initStatusIndicator();
        });
      } else {
        // 如果已经加载完成但 body 仍不存在，使用 MutationObserver 等待
        const observer = new MutationObserver(() => {
          if (document.body) {
            observer.disconnect();
            this.initStatusIndicator();
          }
        });
        observer.observe(document.documentElement, { childList: true });
      }
      return;
    }

    // 如果已经初始化过，直接返回
    if (this.statusIndicator) {
      return;
    }

    // 创建状态指示器元素
    const indicator = document.createElement("div");
    indicator.id = "mcp-ws-status-indicator";
    indicator.innerHTML = `
      <div class="mcp-status-content">
        <div class="mcp-status-icon"></div>
        <div class="mcp-status-text">MCP 连接中...</div>
      </div>
    `;

    // 添加样式
    const style = document.createElement("style");
    style.textContent = `
      #mcp-ws-status-indicator {
        position: fixed;
        bottom: 10px;
        left: 10px;
        z-index: 999999;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 6px 10px;
        border-radius: 6px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 12px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        transition: all 0.3s ease;
        min-width: 90px;
        line-height: 1.2;
      }
      #mcp-ws-status-indicator:hover {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.2);
        transform: translateY(-1px);
        background: rgba(0, 0, 0, 0.95);
      }
      .mcp-status-content {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .mcp-status-icon {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #fbbf24;
        animation: pulse 2s infinite;
        flex-shrink: 0;
      }
      .mcp-status-icon.connected {
        background: #10b981;
        animation: none;
      }
      .mcp-status-icon.disconnected {
        background: #ef4444;
        animation: none;
      }
      .mcp-status-icon.reconnecting {
        background: #f59e0b;
        animation: pulse 1s infinite;
      }
      .mcp-status-icon.executing {
        width: 10px;
        height: 10px;
        background: linear-gradient(45deg, #667eea, #764ba2, #f093fb, #4facfe, #667eea);
        background-size: 300% 300%;
        animation: gradientRotate 2s ease infinite, iconSpinPulse 1.5s ease-in-out infinite;
        box-shadow: 0 0 10px rgba(102, 126, 234, 0.8), 0 0 20px rgba(118, 75, 162, 0.6), 0 0 30px rgba(240, 147, 251, 0.4);
      }
      @keyframes pulse {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }
      @keyframes gradientRotate {
        0% {
          background-position: 0% 50%;
        }
        50% {
          background-position: 100% 50%;
        }
        100% {
          background-position: 0% 50%;
        }
      }
      @keyframes iconSpinPulse {
        0% {
          transform: rotate(0deg) scale(1);
        }
        25% {
          transform: rotate(90deg) scale(1.15);
        }
        50% {
          transform: rotate(180deg) scale(1.2);
        }
        75% {
          transform: rotate(270deg) scale(1.15);
        }
        100% {
          transform: rotate(360deg) scale(1);
        }
      }
      #mcp-ws-status-indicator.executing {
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.95), rgba(118, 75, 162, 0.95));
        box-shadow: 0 2px 20px rgba(102, 126, 234, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.2), 0 0 30px rgba(102, 126, 234, 0.4);
        animation: statusPulse 2s ease-in-out infinite;
      }
      @keyframes statusPulse {
        0%, 100% {
          box-shadow: 0 2px 20px rgba(102, 126, 234, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.2), 0 0 30px rgba(102, 126, 234, 0.4);
        }
        50% {
          box-shadow: 0 2px 25px rgba(102, 126, 234, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.3), 0 0 40px rgba(118, 75, 162, 0.6);
        }
      }
      .mcp-status-text {
        font-weight: 500;
        white-space: nowrap;
      }
    `;

    // 将样式添加到 head
    if (!document.getElementById("mcp-ws-status-style")) {
      style.id = "mcp-ws-status-style";
      if (document.head) {
        document.head.appendChild(style);
      } else {
        // 如果 head 也不存在，等待
        const headObserver = new MutationObserver(() => {
          if (document.head) {
            headObserver.disconnect();
            document.head.appendChild(style);
            this.tryAppendIndicator(indicator);
          }
        });
        headObserver.observe(document.documentElement, { childList: true });
        return;
      }
    }

    // 将元素添加到 body
    this.tryAppendIndicator(indicator);
  }

  /**
   * 尝试添加指示器到 body
   */
  tryAppendIndicator(indicator) {
    if (document.body) {
      document.body.appendChild(indicator);
      this.statusIndicator = indicator;
      this.updateStatus("connecting", "连接中...");
    } else {
      // 如果 body 仍然不存在，等待
      const bodyObserver = new MutationObserver(() => {
        if (document.body) {
          bodyObserver.disconnect();
          document.body.appendChild(indicator);
          this.statusIndicator = indicator;
          this.updateStatus("connecting", "连接中...");
        }
      });
      bodyObserver.observe(document.documentElement, { childList: true });
    }
  }

  /**
   * 更新状态指示器
   */
  updateStatus(status, text, taskInfo = null) {
    if (!this.statusIndicator) {
      return;
    }

    const icon = this.statusIndicator.querySelector(".mcp-status-icon");
    const textEl = this.statusIndicator.querySelector(".mcp-status-text");

    // 移除所有状态类
    icon.className = "mcp-status-icon";
    icon.classList.add(status);

    // 如果是执行任务状态，给整个指示器添加 executing 类
    if (status === "executing") {
      this.statusIndicator.classList.add("executing");
    } else {
      this.statusIndicator.classList.remove("executing");
    }

    // 更新文本，添加 MCP 前缀
    if (textEl) {
      let displayText = `MCP ${text}`;
      // 如果有任务信息，显示任务类型
      if (taskInfo && taskInfo.taskType) {
        const taskTypeMap = {
          "get-user-selected-figma-ui-info": "获取 Figma UI 信息"
        };
        const taskTypeName = taskTypeMap[taskInfo.taskType] || taskInfo.taskType;
        displayText = `MCP 执行中: ${taskTypeName}`;
      }
      textEl.textContent = displayText;
    }
  }

  /**
   * 启动连接
   */
  start() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("WebSocket 已经连接");
      return;
    }

    // 确保状态指示器已初始化
    if (!this.statusIndicator) {
      this.initStatusIndicator();
    }

    this.isManualClose = false;
    this.updateStatus("connecting", "连接中...");
    this.connect();
  }

  /**
   * 连接 WebSocket
   */
  connect() {
    try {
      console.log(`正在连接 WebSocket: ${this.wsUrl}`);
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log("WebSocket 连接成功");
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.lastServerHeartbeat = Date.now(); // 初始化服务器心跳时间
        this.updateStatus("connected", "已连接");
        this.startHeartbeat();
      };

      this.ws.onmessage = event => {
        this.handleMessage(event);
      };

      this.ws.onerror = error => {
        console.error("WebSocket 连接错误:", error);
        this.updateStatus("disconnected", "连接错误");
      };

      this.ws.onclose = event => {
        console.log("WebSocket 连接关闭", event.code, event.reason);
        this.stopHeartbeat();

        // 如果不是手动关闭，则尝试重连
        if (!this.isManualClose) {
          this.updateStatus("reconnecting", "重连中...");
          this.scheduleReconnect();
        } else {
          this.updateStatus("disconnected", "已断开");
        }
      };
    } catch (error) {
      console.error("创建 WebSocket 连接失败:", error);
      this.updateStatus("disconnected", "连接失败");
      this.scheduleReconnect();
    }
  }

  /**
   * 处理收到的消息
   */
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case "heartbeat":
          // 收到服务器心跳，更新最后收到心跳的时间，并回复心跳
          this.lastServerHeartbeat = Date.now();
          this.sendHeartbeat();
          break;

        case "task":
          // 处理任务
          this.handleTask(message.data);
          break;

        default:
          console.warn("未知的消息类型:", message.type);
      }
    } catch (error) {
      console.error("解析消息失败:", error, event.data);
    }
  }

  /**
   * 获取当前实际连接状态
   */
  getCurrentConnectionStatus() {
    if (!this.ws) {
      return { status: "disconnected", text: "已断开" };
    }

    const readyState = this.ws.readyState;
    if (readyState === WebSocket.OPEN) {
      return { status: "connected", text: "已连接" };
    } else if (readyState === WebSocket.CONNECTING) {
      return { status: "connecting", text: "连接中..." };
    } else if (readyState === WebSocket.CLOSING) {
      return { status: "reconnecting", text: "重连中..." };
    } else {
      return { status: "disconnected", text: "已断开" };
    }
  }

  /**
   * 处理任务
   */
  async handleTask(taskData) {
    if (!taskData) {
      console.error("任务数据为空");
      return;
    }

    const { taskType, taskId, status } = taskData;

    console.log("收到任务:", { taskType, taskId, status });

    // 保存当前实际连接状态，以便任务完成后恢复
    const currentConnectionStatus = this.getCurrentConnectionStatus();
    this.previousStatus = currentConnectionStatus.status;
    this.previousStatusText = currentConnectionStatus.text;

    // 显示执行任务状态
    this.updateStatus("executing", "执行中...", { taskType, taskId });

    try {
      let result = null;

      // 根据任务类型执行相应操作
      switch (taskType) {
        case "get-user-selected-figma-ui-info":
          result = await this.executeGetUserSelectedFigmaUIInfo();
          break;

        default:
          console.warn("未知的任务类型:", taskType);
          result = { error: `未知的任务类型: ${taskType}` };
      }

      // 发送任务结果
      this.sendTaskResult({
        taskType,
        taskId,
        status: result?.error ? "failed" : "success",
        result: result
      });

      // 任务完成后，短暂显示完成状态，然后恢复当前实际连接状态
      this.updateStatus("executing", "完成", { taskType, taskId });
      setTimeout(() => {
        // 恢复当前实际连接状态（而不是之前保存的状态，因为连接状态可能已经变化）
        const currentConnectionStatus = this.getCurrentConnectionStatus();
        this.updateStatus(currentConnectionStatus.status, currentConnectionStatus.text);
      }, 500);
    } catch (error) {
      console.error("执行任务失败:", error);
      this.sendTaskResult({
        taskType,
        taskId,
        status: "failed",
        result: { error: error.message || String(error) }
      });

      // 任务失败后，恢复当前实际连接状态
      const currentConnectionStatus = this.getCurrentConnectionStatus();
      this.updateStatus(currentConnectionStatus.status, currentConnectionStatus.text);
    }
  }

  /**
   * 执行获取用户选择的 Figma UI 信息任务
   */
  async executeGetUserSelectedFigmaUIInfo() {
    // 目标：返回与在插件中“从当前页面读取”+“导出 JSON”一致的结构
    // 1) 收集页面内的 Figma 数据（代码、静态资源等）
    // 2) 补充 MCP 原始数据（如果配置了服务）
    // 3) 组装导出 payload（与 popup 中 buildExportPayload 相同字段）
    const figmaUrl = (typeof window !== "undefined" && window.location?.href) || "";
    const { fileKey, nodeId } = this.parseFigmaUrl(figmaUrl);

    // 收集页面侧数据（依赖 content.js 提供的辅助函数，如 extractFigmaData / getGeneratedCode 等）
    const pageData = await this.collectPageData(figmaUrl);

    // 优先使用页面数据中的信息
    const finalFigmaUrl = pageData.figmaUrl || figmaUrl;
    const finalFileKey = pageData?.mcpInfo?.fileKey || fileKey;
    const finalNodeId = pageData?.mcpInfo?.nodeId || nodeId;

    // MCP 原始数据（用于补充 design.mcpData）
    let mcpData = pageData?.mcpInfo?.raw || null;
    if (!mcpData && finalFileKey) {
      try {
        const resp = await chrome.runtime.sendMessage({
          action: "fetchFigmaData",
          fileKey: finalFileKey,
          nodeId: finalNodeId
        });
        if (resp && resp.data) {
          mcpData = resp.data;
        }
      } catch (err) {
        console.warn("获取 MCP 数据失败，将继续使用页面数据:", err);
      }
    }

    // 代码内容与语言
    const codeInfo = pageData.generatedCode || pageData.codeInfo || {};
    const codeContent = this.buildCodeContent(codeInfo, pageData);

    // 依据 mcpData 提取图片节点（用于 assets.imageNodes）
    const imageNodes = this.extractImageNodesFromMcp(mcpData);

    // 构建与 popup 导出一致的 payload
    const payload = {
      generatedAt: new Date().toISOString(),
      design: {
        figmaUrl: finalFigmaUrl,
        fileKey: finalFileKey || null,
        nodeId: finalNodeId || null,
        mcpData
      },
      code: {
        language: codeInfo.language || "",
        content: codeContent || ""
      },
      assets: {
        // 此处不在任务执行端自动批量处理/上传图片，保持与未处理前导出的结构一致
        processedImages: [],
        imageNodes,
        uploadResults: []
      }
    };

    return payload;
  }

  /**
   * 收集页面侧的 Figma 数据（复用 content.js 中的能力）
   */
  async collectPageData(figmaUrl) {
    const data = {
      figmaUrl
    };

    // 优先使用 extractFigmaData（content.js 暴露）
    if (typeof extractFigmaData === "function") {
      try {
        const full = await extractFigmaData();
        return full || data;
      } catch (err) {
        console.warn("extractFigmaData 执行失败，回退到单独收集:", err);
      }
    }

    // 回退：分别调用已知的辅助函数（若存在）
    if (typeof getMCPInfo === "function") {
      try {
        data.mcpInfo = getMCPInfo();
      } catch (err) {
        console.warn("getMCPInfo 失败:", err);
      }
    }

    if (typeof getGeneratedCode === "function") {
      try {
        data.generatedCode = await getGeneratedCode();
      } catch (err) {
        console.warn("getGeneratedCode 失败:", err);
      }
    }

    if (typeof getStaticResources === "function") {
      try {
        data.staticResources = await getStaticResources();
      } catch (err) {
        console.warn("getStaticResources 失败:", err);
      }
    }

    if (!data.figmaUrl && typeof window !== "undefined") {
      data.figmaUrl = window.location?.href;
    }
    return data;
  }

  /**
   * 解析 Figma URL 获取 fileKey/nodeId
   */
  parseFigmaUrl(url) {
    try {
      const u = new URL(url);
      const pathMatch = u.pathname.match(/\/design\/([^/]+)/);
      const fileKey = pathMatch ? pathMatch[1] : null;
      const nodeId = u.searchParams.get("node-id");
      return { fileKey, nodeId };
    } catch (err) {
      return { fileKey: null, nodeId: null };
    }
  }

  /**
   * 构建代码内容（对齐 popup 中 buildExportPayload 的逻辑）
   */
  buildCodeContent(codeInfo = {}) {
    if (
      codeInfo.lines &&
      Array.isArray(codeInfo.lines) &&
      codeInfo.lines.length > 0
    ) {
      return codeInfo.lines
        .map((line) => line.content || line.text || line.code || "")
        .join("\n");
    }
    return (
      codeInfo.fullCode ||
      codeInfo.code ||
      codeInfo.content ||
      codeInfo.preview ||
      ""
    );
  }

  /**
   * 从 MCP 数据中提取图片节点（简化版，足以用于导出 JSON）
   */
  extractImageNodesFromMcp(mcpData) {
    if (!mcpData || !mcpData.nodes) return [];

    const imageNodes = [];

    const visit = (node) => {
      if (!node) return;
      const fills = node.fills || [];
      const imageFill = fills.find((f) => f.type === "IMAGE");
      const isImageType =
        node.type === "IMAGE" || node.type === "IMAGE-SVG" || node.type === "VECTOR";

      if (isImageType || imageFill) {
        imageNodes.push({
          id: node.id,
          name: node.name,
          type: node.type,
          width: node.layout?.dimensions?.width || null,
          height: node.layout?.dimensions?.height || null,
          x: node.layout?.locationRelativeToParent?.x || 0,
          y: node.layout?.locationRelativeToParent?.y || 0,
          layout: node.layout,
          imageFill,
          imageRef: imageFill?.imageRef || null,
          opacity: node.opacity,
          visible: node.visible,
          locked: node.locked,
          rotation: node.rotation,
          borderRadius: node.borderRadius
        });
      }

      if (Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    };

    if (Array.isArray(mcpData.nodes)) {
      mcpData.nodes.forEach(visit);
    } else if (mcpData.id) {
      visit(mcpData);
    }

    return imageNodes;
  }

  /**
   * 发送任务结果
   */
  sendTaskResult(taskData) {
    this.sendMessage({
      type: "task",
      data: taskData
    });
  }

  /**
   * 发送心跳
   */
  sendHeartbeat() {
    this.sendMessage({
      type: "heartbeat"
    });
  }

  /**
   * 启动心跳
   * 客户端主动定期发送心跳，确保服务器在 3 秒内收到心跳
   * 服务器每 1 秒发送一次心跳，客户端每 2 秒主动发送一次心跳
   * 同时检测服务器心跳，如果超时未收到则触发重连
   */
  startHeartbeat() {
    // 清除之前的定时器
    this.stopHeartbeat();

    // 客户端主动每 2 秒发送一次心跳
    // 服务器要求 3 秒内必须收到心跳，所以 2 秒发送一次是安全的
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 2000);

    // 每 1 秒检测一次服务器心跳是否超时
    this.heartbeatCheckInterval = setInterval(() => {
      this.checkServerHeartbeat();
    }, 1000);
  }

  /**
   * 停止心跳
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
    }
    this.lastServerHeartbeat = null;
  }

  /**
   * 检测服务器心跳
   * 如果超过指定时间未收到服务器心跳，则认为服务器已停止，触发重连
   */
  checkServerHeartbeat() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (this.lastServerHeartbeat === null) {
      // 如果还没有收到过服务器心跳，等待一段时间
      return;
    }

    const now = Date.now();
    const timeSinceLastHeartbeat = now - this.lastServerHeartbeat;

    if (timeSinceLastHeartbeat > this.serverHeartbeatTimeout) {
      console.warn(`服务器心跳超时: 已 ${timeSinceLastHeartbeat}ms 未收到服务器心跳，触发重连`);
      this.updateStatus("reconnecting", "心跳超时，重连中...");
      // 关闭当前连接，触发重连
      this.ws.close();
    }
  }

  /**
   * 发送消息
   */
  sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error("发送消息失败:", error);
      }
    } else {
      console.warn("WebSocket 未连接，无法发送消息:", message);
    }
  }

  /**
   * 安排重连
   * 固定5秒后重连
   */
  scheduleReconnect() {
    if (this.isManualClose) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("达到最大重连次数，停止重连");
      return;
    }

    // 清除之前的重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;

    // 固定5秒后重连
    const delay = 5000;

    console.log(`将在 ${delay}ms 后尝试第 ${this.reconnectAttempts} 次重连...`);
    this.updateStatus("reconnecting", `重连中 (${this.reconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.updateStatus("connecting", "正在连接...");
      this.connect();
    }, delay);
  }

  /**
   * 关闭连接
   */
  close() {
    this.isManualClose = true;
    this.stopHeartbeat();
    this.updateStatus("disconnected", "已断开");

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// 创建全局实例
const mcpTaskExecutor = new MCPTaskExecutor();

// 页面加载时启动
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    mcpTaskExecutor.start();
  });
} else {
  // DOM 已经加载完成
  mcpTaskExecutor.start();
}

// 页面卸载时关闭连接
window.addEventListener("beforeunload", () => {
  mcpTaskExecutor.close();
});

// 导出到全局，方便调试
window.mcpTaskExecutor = mcpTaskExecutor;
