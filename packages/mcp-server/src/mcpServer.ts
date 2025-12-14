import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import packageJson from '../package.json' with { type: "json" };
import { WebsocketServer } from './WebsocketServer.js';

// Create an MCP server with implementation details
export function getMcpServer(wsServer: WebsocketServer) {
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
        'get-user-selected-ui-info',
        {
            description: '获取用户当前选择的UI信息',
            inputSchema: {}
        },
        async (): Promise<CallToolResult> => {
            return {
                content: [
                    {
                        type: 'text',
                        text: ``
                    }
                ]
            };
        }
    );

    return server;
};