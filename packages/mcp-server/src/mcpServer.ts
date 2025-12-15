import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import packageJson from '../package.json' with { type: "json" };
import { WebsocketServer } from './WebsocketServer.js';
import { TaskType } from './constants/enum.js';

// Create an MCP server with implementation details
export function getMcpServer(wsServer: WebsocketServer) {
    const server = new McpServer(
        {
            name: 'figma-mcp-server',
            version: packageJson.version
        },
        {
            capabilities: {
                logging: {}
            }
        }
    );

    // Register a simple tool that returns a greeting
    server.registerTool(
        'get-selected-figma-ui-info',
        {
            description: '获取我当前在浏览器的figma页面中选择的UI节点信息',
            inputSchema: {}
        },
        async (): Promise<CallToolResult> => {
            // 通过派发任务向已连接的浏览器插件请求数据
            const taskResults = await wsServer.distributionTask(TaskType.GET_USER_SELECTED_FIGMA_UI_INFO);

            // 提取每个成功结果中的代码内容列表
            const codeList = taskResults
                .filter(item => item.status === 'success')
                .map(item => {
                    const code = item.result?.code;
                    if (!code) return null;
                    // 兼容 content 字段或直接字符串
                    return typeof code === 'string' ? code : (code.content || code.fullCode || '');
                })
                .filter((code): code is string => !!code);

            const response = {
                success: true,
                total: taskResults.length,
                successCount: taskResults.filter(r => r.status === 'success').length,
                failedCount: taskResults.filter(r => r.status !== 'success').length,
                codes: codeList,
                raw: taskResults
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(response, null, 2)
                    }
                ]
            };
        }
    );

    return server;
};