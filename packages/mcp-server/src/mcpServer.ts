import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import packageJson from '../package.json' with { type: "json" };
import { TaskType } from './constants/enum.js';

// Create an MCP server with implementation details
export function getMcpServer(taskApiUrl: string) {
    const server = new McpServer(
        {
            name: packageJson.name,
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
        'get-figma-ui-info-json',
        {
            description: '获取我选择的 Figma UI 节点信息 JSON 数据',
            inputSchema: {}
        },
        async (): Promise<CallToolResult> => {
            try {
                // 调用服务器暴露的任务接口获取结果（GET，返回纯文本）
                const url = new URL(taskApiUrl);
                url.searchParams.set('taskType', TaskType.GET_USER_SELECTED_FIGMA_UI_INFO);
                const response = await fetch(url.toString(), {
                    method: 'GET'
                });

                if (!response.ok) {
                    throw new Error(`任务接口请求失败: ${response.status} ${response.statusText}`);
                }

                const text = await response.text();

                return {
                    content: [
                        {
                            type: 'text',
                            text
                        }
                    ]
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `调用任务接口失败: ${message}`
                        }
                    ]
                };
            }
        }
    );

    return server;
};