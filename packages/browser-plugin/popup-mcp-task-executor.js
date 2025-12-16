/**
 * MCP Task Executor - WebSocket 连接管理器
 * 负责与 mcp-server 的 WebSocket 服务器建立连接并处理任务
 */

class MCPTaskExecutor {
    constructor() {
        this.ws = null;
        this.wsUrl = null;
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000; // 3秒
        this.isManualClose = false;
        this.connectionState = 'disconnected'; // disconnected, connecting, connected, error

        // 绑定方法
        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.handleError = this.handleError.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleOpen = this.handleOpen.bind(this);
        this.updateConnectionStatus = this.updateConnectionStatus.bind(this);

        // 初始化
        this.init();
    }

    /**
     * 初始化 - 加载配置并尝试连接
     */
    async init() {
        // 获取 WebSocket 服务器地址（默认 localhost:3101）
        const config = await chrome.storage.sync.get(['mcpWsUrl', 'mcpServerUrl']);

        // 优先使用配置的 WebSocket URL，否则从 HTTP URL 推导，最后使用默认值
        if (config.mcpWsUrl) {
            this.wsUrl = config.mcpWsUrl;
        } else if (config.mcpServerUrl) {
            // 从 HTTP URL 推导 WebSocket URL
            try {
                const url = new URL(config.mcpServerUrl);
                const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
                // 默认 WebSocket 端口是 3101
                this.wsUrl = `${wsProtocol}//${url.hostname}:3101/ws`;
            } catch (e) {
                // 如果解析失败，使用默认值
                this.wsUrl = 'ws://localhost:3101/ws';
            }
        } else {
            // 默认使用 localhost:3101
            this.wsUrl = 'ws://localhost:3101/ws';
        }

        // 创建连接状态显示元素
        this.createStatusElement();

        // 创建全局 loading mask
        this.createLoadingMask();

        // 自动连接
        this.connect();
    }

    /**
     * 创建连接状态显示元素
     */
    createStatusElement() {
        const header = document.querySelector('.header');
        if (!header) {
            // 如果 header 还没加载，等待一下
            setTimeout(() => this.createStatusElement(), 100);
            return;
        }

        // 检查是否已存在状态元素
        let statusElement = document.getElementById('mcp-ws-status');
        if (!statusElement) {
            statusElement = document.createElement('div');
            statusElement.id = 'mcp-ws-status';
            statusElement.style.cssText = `
        margin-top: 8px;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.3s ease;
        font-weight: 500;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      `;
            header.appendChild(statusElement);
        }

        this.statusElement = statusElement;
        this.updateConnectionStatus('disconnected');
    }

    /**
     * 创建全局 loading mask
     */
    createLoadingMask() {
        // 检查是否已存在 mask
        let mask = document.getElementById('mcp-task-loading-mask');
        if (!mask) {
            mask = document.createElement('div');
            mask.id = 'mcp-task-loading-mask';
            mask.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                backdrop-filter: blur(2px);
            `;
            mask.innerHTML = `
                <div style="
                    background: white;
                    padding: 24px 32px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 16px;
                    min-width: 200px;
                ">
                    <div class="spinner"></div>
                    <div style="
                        color: #333;
                        font-size: 14px;
                        font-weight: 500;
                        text-align: center;
                    ">正在执行 MCP 任务...</div>
                </div>
            `;
            document.body.appendChild(mask);
        }
        this.loadingMask = mask;
    }

    /**
     * 显示全局 loading mask
     */
    showLoadingMask() {
        if (!this.loadingMask) {
            this.createLoadingMask();
        }
        if (this.loadingMask) {
            this.loadingMask.style.display = 'flex';
        }
    }

    /**
     * 隐藏全局 loading mask
     */
    hideLoadingMask() {
        if (this.loadingMask) {
            this.loadingMask.style.display = 'none';
        }
    }

    /**
     * 更新连接状态显示
     */
    updateConnectionStatus(state, message = '') {
        this.connectionState = state;

        if (!this.statusElement) {
            return;
        }

        let statusText = '';
        let statusColor = '';
        let statusBg = '';
        let statusIcon = '';

        switch (state) {
            case 'connecting':
                statusText = '正在连接 MCP 服务器...';
                statusColor = '#f59e0b';
                statusBg = '#fef3c7';
                statusIcon = '⏳';
                break;
            case 'connected':
                statusText = '✓ MCP 服务器已连接';
                statusColor = '#10b981';
                statusBg = '#d1fae5';
                statusIcon = '✓';
                break;
            case 'disconnected':
                statusText = '✗ MCP 服务器未连接';
                statusColor = '#6b7280';
                statusBg = '#f3f4f6';
                statusIcon = '✗';
                break;
            case 'error':
                statusText = message || '✗ 连接错误';
                statusColor = '#ef4444';
                statusBg = '#fee2e2';
                statusIcon = '✗';
                break;
            case 'reconnecting':
                statusText = `正在重连... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`;
                statusColor = '#f59e0b';
                statusBg = '#fef3c7';
                statusIcon = '🔄';
                break;
        }

        this.statusElement.innerHTML = `
      <span style="font-size: 14px; line-height: 1;">${statusIcon}</span>
      <span style="flex: 1;">${statusText}</span>
      ${this.wsUrl ? `<span style="opacity: 0.6; font-size: 10px; font-family: monospace; margin-left: 8px;">${this.wsUrl.replace(/^ws[s]?:\/\//, '')}</span>` : ''}
    `;
        this.statusElement.style.color = statusColor;
        this.statusElement.style.backgroundColor = statusBg;
        this.statusElement.style.border = `1px solid ${statusColor}40`;
    }

    /**
     * 连接到 WebSocket 服务器
     */
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            console.log('WebSocket 已连接或正在连接中');
            return;
        }

        if (!this.wsUrl) {
            console.error('WebSocket URL 未配置');
            this.updateConnectionStatus('error', 'WebSocket URL 未配置');
            return;
        }

        this.isManualClose = false;
        this.updateConnectionStatus('connecting');

        try {
            console.log('正在连接到 WebSocket 服务器:', this.wsUrl);
            this.ws = new WebSocket(this.wsUrl);

            this.ws.onopen = this.handleOpen;
            this.ws.onmessage = this.handleMessage;
            this.ws.onerror = this.handleError;
            this.ws.onclose = this.handleClose;
        } catch (error) {
            console.error('创建 WebSocket 连接失败:', error);
            this.updateConnectionStatus('error', `连接失败: ${error.message}`);
            this.scheduleReconnect();
        }
    }

    /**
     * 断开连接
     */
    disconnect() {
        this.isManualClose = true;
        this.reconnectAttempts = 0;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.updateConnectionStatus('disconnected');
    }

    /**
     * 处理 WebSocket 打开事件
     */
    handleOpen(event) {
        console.log('WebSocket 连接已建立');
        this.reconnectAttempts = 0;
        this.updateConnectionStatus('connected');

        // 启动心跳检测（服务器会每 1 秒发送心跳，我们需要响应）
        // 注意：根据服务器代码，客户端不需要主动发送心跳，只需要响应服务器的心跳
    }

    /**
     * 处理 WebSocket 消息
     */
    handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log('收到 WebSocket 消息:', message);

            switch (message.type) {
                case 'heartbeat':
                    // 响应服务器的心跳
                    this.sendHeartbeatResponse();
                    break;
                case 'task':
                    // 处理任务
                    this.handleTask(message.data);
                    break;
                default:
                    console.warn('未知的消息类型:', message.type);
            }
        } catch (error) {
            console.error('解析 WebSocket 消息失败:', error);
        }
    }

    /**
     * 发送心跳响应
     */
    sendHeartbeatResponse() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify({
                    type: 'heartbeat'
                }));
            } catch (error) {
                console.error('发送心跳响应失败:', error);
            }
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

        // 显示全局 loading mask
        this.showLoadingMask();

        try {
            let result = null;

            // 根据任务类型执行相应操作
            switch (taskType) {
                case "get-user-selected-figma-ui-info":
                    result = await new Promise((res) => {
                        window.handleExportJson(res);
                    })
                    break;

                default:
                    console.warn("未知的任务类型:", taskType);
                    result = { error: `未知的任务类型: ${taskType}` };
            }

            // 发送任务结果
            this.sendTaskResult({
                taskType,
                taskId,
                status: result ? 'success' : "failed",
                result: result
            });

        } catch (error) {
            console.error("执行任务失败:", error);
            this.sendTaskResult({
                taskType,
                taskId,
                status: "failed",
                result: JSON.stringify({ error: error.message || String(error) })
            });

        } finally {
            // 隐藏全局 loading mask
            this.hideLoadingMask();
        }
    }

    /**
     * 发送任务结果
     */
    sendTaskResult(data) {
        this.sendMessage({
            type: "task",
            data
        });
    }

    /**
  * 发送消息
  */
    sendMessage(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(data));
            } catch (error) {
                console.error("发送消息失败:", error);
            }
        } else {
            console.warn("WebSocket 未连接，无法发送消息:", message);
        }
    }

    /**
     * 处理 WebSocket 错误
     */
    handleError(error) {
        console.error('WebSocket 错误:', error);
        this.updateConnectionStatus('error', '连接错误');
    }

    /**
     * 处理 WebSocket 关闭事件
     */
    handleClose(event) {
        console.log('WebSocket 连接已关闭', event.code, event.reason);

        this.ws = null;

        // 如果不是手动关闭，尝试重连
        if (!this.isManualClose) {
            this.scheduleReconnect();
        } else {
            this.updateConnectionStatus('disconnected');
        }
    }

    /**
     * 安排重连
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('达到最大重连次数，停止重连');
            this.updateConnectionStatus('error', '连接失败，已达到最大重连次数');
            return;
        }

        this.reconnectAttempts++;
        this.updateConnectionStatus('reconnecting');

        this.reconnectTimer = setTimeout(() => {
            console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            this.connect();
        }, this.reconnectDelay);
    }

    /**
     * 更新 WebSocket URL 配置
     */
    async updateWsUrl(url) {
        this.wsUrl = url;
        await chrome.storage.sync.set({ mcpWsUrl: url });

        // 如果已连接，断开后重新连接
        if (this.ws) {
            this.disconnect();
            setTimeout(() => this.connect(), 1000);
        } else {
            this.connect();
        }
    }

    /**
     * 获取连接状态
     */
    getConnectionState() {
        return this.connectionState;
    }

    /**
     * 检查是否已连接
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}

// 创建全局实例
let mcpTaskExecutor = null;

// 当 DOM 加载完成后初始化
function initMCPTaskExecutor() {
    if (mcpTaskExecutor) {
        // 如果已存在实例，先清理
        mcpTaskExecutor.disconnect();
    }
    mcpTaskExecutor = new MCPTaskExecutor();
    window.mcpTaskExecutor = mcpTaskExecutor; // 暴露到全局，方便调试
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMCPTaskExecutor);
} else {
    initMCPTaskExecutor();
}

// 页面卸载时清理资源
window.addEventListener('beforeunload', () => {
    if (mcpTaskExecutor) {
        mcpTaskExecutor.disconnect();
    }
});

// 监听配置变化，自动更新连接
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync') {
        if (changes.mcpWsUrl || changes.mcpServerUrl) {
            // 配置变化，重新初始化连接
            if (mcpTaskExecutor) {
                mcpTaskExecutor.init();
            }
        }
    }
});
