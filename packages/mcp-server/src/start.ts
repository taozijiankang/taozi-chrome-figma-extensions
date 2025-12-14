import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import chalk from "chalk";
import { program } from "commander";
import packageJson from '../package.json' with { type: "json" };
import { Request, Response } from 'express';
import { WebsocketServer } from './WebsocketServer.js';
import { getMcpServer } from './mcpServer.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import dayjs from 'dayjs';
import { TaskType } from './constants/enum.js';

interface AppStartOptions {
  mcpPort: number;
  wsPort: number;
}

program
  .version(packageJson.version)
  .description("启动 MCP 服务器")
  .option("-m, --mcpPort <mcpPort>", "MCP 端口")
  .option("-w, --wsPort <wsPort>", "WS 端口")
  .action(() => {
    start(program.opts());
  })
  .parse(process.argv);

async function start(options: AppStartOptions) {
  const { mcpPort = 3100, wsPort = 3101 } = options;

  /** 
   * 创建 WS 服务器
   */

  const wsServer = new WebsocketServer(wsPort, '/ws');

  /** 
   * 创建 HTTP 服务器
   */

  const app = createMcpExpressApp();

  // Map to store transports by session ID
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  app.post('/mcp', async (req: Request, res: Response) => {
    console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} Received MCP request:`, req.body);
    try {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request - use JSON response mode
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true, // Enable JSON response mode
          onsessioninitialized: sessionId => {
            // Store the transport by session ID when session is initialized
            // This avoids race conditions where requests might come in before the session is stored
            console.log(`Session initialized with ID: ${sessionId}`);
            transports[sessionId] = transport;
          }
        });

        // Connect the transport to the MCP server BEFORE handling the request
        const server = getMcpServer(wsServer);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return; // Already handled
      } else {
        // Invalid request - no session ID or not initialization request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided'
          },
          id: null
        });
        return;
      }

      // Handle the request with existing transport - no need to reconnect
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error'
          },
          id: null
        });
      }
    }
  });

  // Handle GET requests for SSE streams according to spec
  app.get('/mcp', async (req: Request, res: Response) => {
    // Since this is a very simple example, we don't support GET requests for this server
    // The spec requires returning 405 Method Not Allowed in this case
    res.status(405).set('Allow', 'POST').send('Method Not Allowed');
  });

  // WebSocket 连接状态 API（返回 JSON 数据）
  app.get('/ws-status', (req: Request, res: Response) => {
    const connectionsInfo = wsServer.getConnectionsInfo();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(connectionsInfo);
  });

  // 测试任务派发 API
  app.post('/test-task', async (req: Request, res: Response) => {
    try {
      const taskType = req.body.taskType || TaskType.GET_USER_SELECTED_FIGMA_UI_INFO;
      const results = await wsServer.distributionTask(taskType);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json({
        success: true,
        taskType,
        results,
        total: results.length,
        successCount: results.filter(r => r.status === 'success').length,
        failedCount: results.filter(r => r.status === 'failed' || r.status === 'timeout').length
      });
    } catch (error) {
      console.error('派发任务失败:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 主页面 - 显示 MCP 服务器信息和 WebSocket 状态
  app.get('/', (req: Request, res: Response) => {
    const html = generateMainPage(mcpPort, wsPort);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // Start the server
  app.listen(mcpPort, (error: unknown) => {
    if (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });

  console.log(chalk.green(`MCP 版本: ${packageJson.version}`));
  console.log(chalk.green(`MCP 已启动 http://localhost:${mcpPort}`));
  console.log(chalk.green(`MCP 连接浏览器插件的WS 已启动 ws://localhost:${wsPort}`));
  console.log(chalk.blue(`MCP 服务器主页: http://localhost:${mcpPort}/`));
}

/**
 * 生成主页面 HTML
 */
function generateMainPage(mcpPort: number, wsPort: number): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP 服务器状态监控</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      font-size: 28px;
      margin-bottom: 10px;
    }
    .header .subtitle {
      opacity: 0.9;
      font-size: 14px;
    }
    .server-info {
      padding: 30px;
      background: #f8f9fa;
      border-bottom: 1px solid #e5e7eb;
    }
    .server-info h2 {
      font-size: 20px;
      margin-bottom: 20px;
      color: #333;
    }
    .info-item {
      background: white;
      padding: 15px 20px;
      border-radius: 8px;
      margin-bottom: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .info-item .label {
      font-size: 12px;
      color: #666;
      margin-bottom: 6px;
      font-weight: 500;
    }
    .info-item .value {
      font-size: 16px;
      color: #333;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      word-break: break-all;
    }
    .info-item .value code {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 14px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      padding: 30px;
      background: #f8f9fa;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      text-align: center;
    }
    .stat-card .label {
      font-size: 14px;
      color: #666;
      margin-bottom: 8px;
    }
    .stat-card .value {
      font-size: 32px;
      font-weight: bold;
      color: #333;
    }
    .stat-card.total .value {
      color: #667eea;
    }
    .stat-card.alive .value {
      color: #10b981;
    }
    .stat-card.dead .value {
      color: #ef4444;
    }
    .connections {
      padding: 30px;
    }
    .connections h2 {
      font-size: 20px;
      margin-bottom: 20px;
      color: #333;
    }
    .connection-list {
      display: grid;
      gap: 15px;
    }
    .connection-item {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      border-left: 4px solid #667eea;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .connection-item:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    .connection-item.dead {
      border-left-color: #ef4444;
      opacity: 0.7;
    }
    .connection-item.alive {
      border-left-color: #10b981;
    }
    .connection-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .connection-title {
      font-weight: bold;
      font-size: 16px;
      color: #333;
    }
    .status-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .status-badge.alive {
      background: #d1fae5;
      color: #065f46;
    }
    .status-badge.dead {
      background: #fee2e2;
      color: #991b1b;
    }
    .connection-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      font-size: 14px;
    }
    .detail-item {
      display: flex;
      flex-direction: column;
    }
    .detail-label {
      color: #666;
      font-size: 12px;
      margin-bottom: 4px;
    }
    .detail-value {
      color: #333;
      font-weight: 500;
    }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #666;
    }
    .empty-state-icon {
      font-size: 64px;
      margin-bottom: 20px;
      opacity: 0.3;
    }
    .refresh-btn {
      position: fixed;
      bottom: 30px;
      right: 30px;
      background: #667eea;
      color: white;
      border: none;
      padding: 15px 25px;
      border-radius: 50px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      transition: all 0.3s;
    }
    .refresh-btn:hover {
      background: #5568d3;
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
    }
    .refresh-btn:active {
      transform: translateY(0);
    }
    .last-update {
      text-align: center;
      padding: 15px;
      background: #f8f9fa;
      color: #666;
      font-size: 12px;
      border-top: 1px solid #e5e7eb;
    }
    .test-section {
      padding: 30px;
      background: #f8f9fa;
      border-bottom: 1px solid #e5e7eb;
    }
    .test-section h2 {
      font-size: 20px;
      margin-bottom: 20px;
      color: #333;
    }
    .test-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      transition: all 0.3s;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .test-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
    }
    .test-btn:active:not(:disabled) {
      transform: translateY(0);
    }
    .test-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .test-btn .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .test-results {
      margin-top: 20px;
      display: none;
    }
    .test-results.show {
      display: block;
    }
    .test-results-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e5e7eb;
    }
    .test-results-title {
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }
    .test-results-stats {
      display: flex;
      gap: 20px;
      font-size: 14px;
    }
    .test-stat {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .test-stat.success {
      color: #10b981;
    }
    .test-stat.failed {
      color: #ef4444;
    }
    .test-stat.total {
      color: #667eea;
    }
    .result-list {
      display: grid;
      gap: 12px;
    }
    .result-item {
      background: white;
      border-radius: 8px;
      padding: 15px;
      border-left: 4px solid #667eea;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .result-item.success {
      border-left-color: #10b981;
    }
    .result-item.failed {
      border-left-color: #ef4444;
    }
    .result-item.timeout {
      border-left-color: #f59e0b;
    }
    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .result-task-id {
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-size: 12px;
      color: #666;
    }
    .result-status {
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .result-status.success {
      background: #d1fae5;
      color: #065f46;
    }
    .result-status.failed {
      background: #fee2e2;
      color: #991b1b;
    }
    .result-status.timeout {
      background: #fef3c7;
      color: #92400e;
    }
    .result-content {
      margin-top: 10px;
      padding: 10px;
      background: #f8f9fa;
      border-radius: 6px;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-size: 12px;
      color: #333;
      max-height: 200px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 MCP 服务器状态监控</h1>
      <div class="subtitle">实时监控 MCP 服务器和 WebSocket 连接状态</div>
    </div>
    
    <div class="server-info">
      <h2>服务器信息</h2>
      <div class="info-item">
        <div class="label">MCP 调用地址</div>
        <div class="value"><code>http://localhost:${mcpPort}/mcp</code></div>
      </div>
      <div class="info-item">
        <div class="label">WebSocket 连接地址</div>
        <div class="value"><code>ws://localhost:${wsPort}/ws</code></div>
      </div>
    </div>

    <div class="test-section">
      <h2>任务测试</h2>
      <button class="test-btn" id="test-btn" onclick="testTask()">
        <span id="test-btn-text">获取用户当前选择的 Figma UI 信息</span>
        <span id="test-btn-spinner" class="spinner" style="display: none;"></span>
      </button>
      <div class="test-results" id="test-results">
        <div class="test-results-header">
          <div class="test-results-title">执行结果</div>
          <div class="test-results-stats">
            <div class="test-stat total">
              <span>总计:</span>
              <span id="result-total">0</span>
            </div>
            <div class="test-stat success">
              <span>成功:</span>
              <span id="result-success">0</span>
            </div>
            <div class="test-stat failed">
              <span>失败:</span>
              <span id="result-failed">0</span>
            </div>
          </div>
        </div>
        <div class="result-list" id="result-list"></div>
      </div>
    </div>

    <div class="stats" id="stats">
      <div class="stat-card total">
        <div class="label">总连接数</div>
        <div class="value" id="total">-</div>
      </div>
      <div class="stat-card alive">
        <div class="label">活跃连接</div>
        <div class="value" id="alive">-</div>
      </div>
      <div class="stat-card dead">
        <div class="label">异常连接</div>
        <div class="value" id="dead">-</div>
      </div>
    </div>

    <div class="connections">
      <h2>连接详情</h2>
      <div id="connection-list">
        <div class="empty-state">
          <div class="empty-state-icon">⏳</div>
          <div>加载中...</div>
        </div>
      </div>
    </div>

    <div class="last-update" id="last-update">
      最后更新: 加载中...
    </div>
  </div>

  <script>
    function formatTime(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    }

    function formatDuration(ms) {
      if (ms < 1000) {
        return ms + 'ms';
      } else if (ms < 60000) {
        return (ms / 1000).toFixed(1) + '秒';
      } else {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return minutes + '分' + seconds + '秒';
      }
    }

    function getReadyStateText(readyState) {
      const states = {
        0: 'CONNECTING',
        1: 'OPEN',
        2: 'CLOSING',
        3: 'CLOSED'
      };
      return states[readyState] || 'UNKNOWN';
    }

    function updateStatus() {
      fetch('/ws-status')
        .then(response => response.json())
        .then(data => {
          const { total, connections } = data;
          const aliveCount = connections.filter(c => c.isAlive).length;
          const deadCount = total - aliveCount;

          // 更新统计信息
          document.getElementById('total').textContent = total;
          document.getElementById('alive').textContent = aliveCount;
          document.getElementById('dead').textContent = deadCount;

          // 更新连接列表
          const connectionList = document.getElementById('connection-list');
          if (total === 0) {
            connectionList.innerHTML = \`
              <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <div>当前没有活跃的 WebSocket 连接</div>
              </div>
            \`;
          } else {
            connectionList.innerHTML = \`
              <div class="connection-list">
                \${connections.map(conn => \`
                  <div class="connection-item \${conn.isAlive ? 'alive' : 'dead'}">
                    <div class="connection-header">
                      <div class="connection-title">连接 #\${conn.index}</div>
                      <div class="status-badge \${conn.isAlive ? 'alive' : 'dead'}">
                        \${conn.isAlive ? '✓ 活跃' : '✗ 异常'}
                      </div>
                    </div>
                    <div class="connection-details">
                      <div class="detail-item">
                        <div class="detail-label">最后心跳时间</div>
                        <div class="detail-value">\${formatTime(conn.lastHeartbeat)}</div>
                      </div>
                      <div class="detail-item">
                        <div class="detail-label">距上次心跳</div>
                        <div class="detail-value">\${formatDuration(conn.timeSinceLastHeartbeat)}</div>
                      </div>
                      <div class="detail-item">
                        <div class="detail-label">连接状态</div>
                        <div class="detail-value">\${getReadyStateText(conn.readyState)}</div>
                      </div>
                      <div class="detail-item">
                        <div class="detail-label">待处理任务</div>
                        <div class="detail-value">\${conn.pendingTasks}</div>
                      </div>
                    </div>
                  </div>
                \`).join('')}
              </div>
            \`;
          }

          // 更新最后更新时间
          document.getElementById('last-update').textContent = 
            '最后更新: ' + new Date().toLocaleString('zh-CN');
        })
        .catch(error => {
          console.error('获取状态失败:', error);
          document.getElementById('connection-list').innerHTML = \`
            <div class="empty-state">
              <div class="empty-state-icon">❌</div>
              <div>获取状态失败，请刷新页面重试</div>
            </div>
          \`;
        });
    }

    // 立即更新一次
    updateStatus();

    // 每 1 秒更新一次
    setInterval(updateStatus, 1000);

    // 测试任务函数
    async function testTask() {
      const btn = document.getElementById('test-btn');
      const btnText = document.getElementById('test-btn-text');
      const btnSpinner = document.getElementById('test-btn-spinner');
      const resultsDiv = document.getElementById('test-results');
      const resultList = document.getElementById('result-list');
      
      // 禁用按钮并显示 loading
      btn.disabled = true;
      btnText.style.display = 'none';
      btnSpinner.style.display = 'block';
      resultsDiv.classList.remove('show');
      resultList.innerHTML = '';

      try {
        const response = await fetch('/test-task', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            taskType: 'get-user-selected-figma-ui-info'
          })
        });

        const data = await response.json();

        if (data.success) {
          // 更新统计信息
          document.getElementById('result-total').textContent = data.total;
          document.getElementById('result-success').textContent = data.successCount;
          document.getElementById('result-failed').textContent = data.failedCount;

          // 显示结果列表
          resultList.innerHTML = data.results.map((result, index) => {
            const statusClass = result.status === 'success' ? 'success' : 
                              result.status === 'timeout' ? 'timeout' : 'failed';
            const statusText = result.status === 'success' ? '成功' : 
                              result.status === 'timeout' ? '超时' : '失败';
            const resultContent = typeof result.result === 'object' 
              ? JSON.stringify(result.result, null, 2) 
              : String(result.result || '无结果');

            return \`
              <div class="result-item \${statusClass}">
                <div class="result-header">
                  <div class="result-task-id">连接 #\${index + 1} - \${result.taskId}</div>
                  <div class="result-status \${statusClass}">\${statusText}</div>
                </div>
                <div class="result-content">\${escapeHtml(resultContent)}</div>
              </div>
            \`;
          }).join('');

          resultsDiv.classList.add('show');
        } else {
          throw new Error(data.error || '任务派发失败');
        }
      } catch (error) {
        console.error('测试任务失败:', error);
        resultList.innerHTML = \`
          <div class="result-item failed">
            <div class="result-header">
              <div class="result-task-id">错误</div>
              <div class="result-status failed">失败</div>
            </div>
            <div class="result-content">\${escapeHtml(error.message || String(error))}</div>
          </div>
        \`;
        resultsDiv.classList.add('show');
        document.getElementById('result-total').textContent = '0';
        document.getElementById('result-success').textContent = '0';
        document.getElementById('result-failed').textContent = '1';
      } finally {
        // 恢复按钮状态
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
      }
    }

    // HTML 转义函数
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
}


