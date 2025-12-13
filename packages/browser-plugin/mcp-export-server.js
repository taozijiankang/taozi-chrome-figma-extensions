#!/usr/bin/env node

/**
 * MCP 导出数据服务器
 * 用于在 Cursor 中读取导出的 Figma MCP 数据
 * 
 * 使用方法：
 * 1. 将导出的 JSON 文件放在 exports/ 目录下
 * 2. 运行: node mcp-export-server.js
 * 3. 在 Cursor 中配置 MCP 服务器
 * 
 * Cursor 配置示例（~/.cursor/mcp.json）：
 * {
 *   "mcpServers": {
 *     "figma-export": {
 *       "command": "node",
 *       "args": ["/path/to/mcp-export-server.js"],
 *       "env": {
 *         "EXPORT_DIR": "/path/to/exports"
 *       }
 *     }
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');

// 从环境变量或默认路径读取导出文件目录
const EXPORT_DIR = process.env.EXPORT_DIR || path.join(__dirname, 'exports');
const PORT = process.env.PORT || 0; // 0 表示使用 stdio（Cursor MCP 模式）

// 确保导出目录存在
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

/**
 * 读取所有导出的 JSON 文件
 */
function loadExports() {
  const exports = {};
  
  if (!fs.existsSync(EXPORT_DIR)) {
    return exports;
  }
  
  const files = fs.readdirSync(EXPORT_DIR).filter(file => 
    file.endsWith('.json') && file.startsWith('mcp-export-')
  );
  
  for (const file of files) {
    try {
      const filePath = path.join(EXPORT_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      // 使用文件名（不含扩展名）作为 key
      const key = path.basename(file, '.json');
      exports[key] = {
        file: file,
        path: filePath,
        data: data,
        generatedAt: data.generatedAt || null,
        figmaUrl: data.design?.figmaUrl || null,
        fileKey: data.design?.fileKey || null,
        nodeId: data.design?.nodeId || null
      };
    } catch (error) {
      console.error(`Error loading ${file}:`, error.message);
    }
  }
  
  return exports;
}

/**
 * 根据 fileKey 和 nodeId 查找匹配的导出数据
 */
function findExportByFigmaInfo(fileKey, nodeId = null) {
  const exports = loadExports();
  
  for (const [key, exportData] of Object.entries(exports)) {
    if (exportData.fileKey === fileKey) {
      if (nodeId === null || exportData.nodeId === nodeId) {
        return exportData;
      }
    }
  }
  
  return null;
}

/**
 * 根据导出文件名查找数据
 */
function findExportByName(name) {
  const exports = loadExports();
  return exports[name] || null;
}

/**
 * 处理 MCP 请求（stdio 模式，用于 Cursor）
 */
function handleMCPRequest(request) {
  const { jsonrpc, id, method, params } = request;
  
  if (jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32600, message: 'Invalid Request' }
    };
  }
  
  try {
    let result = null;
    
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'figma-export-server',
            version: '1.0.0'
          }
        };
        break;
        
      case 'tools/list':
        result = {
          tools: [
            {
              name: 'get_figma_export_data',
              description: '根据 Figma fileKey 和 nodeId 获取导出的 MCP 数据',
              inputSchema: {
                type: 'object',
                properties: {
                  fileKey: {
                    type: 'string',
                    description: 'Figma 文件 Key'
                  },
                  nodeId: {
                    type: 'string',
                    description: 'Figma 节点 ID（可选）'
                  }
                },
                required: ['fileKey']
              }
            },
            {
              name: 'list_figma_exports',
              description: '列出所有可用的导出数据',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'get_export_by_name',
              description: '根据导出文件名获取数据',
              inputSchema: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: '导出文件名（不含 .json 扩展名）'
                  }
                },
                required: ['name']
              }
            }
          ]
        };
        break;
        
      case 'tools/call':
        const { name, arguments: args } = params;
        
        switch (name) {
          case 'get_figma_export_data':
            const exportData = findExportByFigmaInfo(args.fileKey, args.nodeId);
            if (exportData) {
              result = {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(exportData.data, null, 2)
                  }
                ]
              };
            } else {
              throw new Error(`未找到匹配的导出数据: fileKey=${args.fileKey}, nodeId=${args.nodeId || 'null'}`);
            }
            break;
            
          case 'list_figma_exports':
            const exports = loadExports();
            result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    Object.entries(exports).map(([key, data]) => ({
                      name: key,
                      file: data.file,
                      generatedAt: data.generatedAt,
                      figmaUrl: data.figmaUrl,
                      fileKey: data.fileKey,
                      nodeId: data.nodeId
                    })),
                    null,
                    2
                  )
                }
              ]
            };
            break;
            
          case 'get_export_by_name':
            const namedExport = findExportByName(args.name);
            if (namedExport) {
              result = {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(namedExport.data, null, 2)
                  }
                ]
              };
            } else {
              throw new Error(`未找到导出数据: ${args.name}`);
            }
            break;
            
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
        break;
        
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        };
    }
    
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error.message
      }
    };
  }
}

/**
 * 主函数 - stdio 模式（用于 Cursor）
 */
function main() {
  // 检查是否在 stdio 模式下运行（Cursor MCP 模式）
  if (process.stdin.isTTY) {
    // 如果不是 stdio 模式，启动 HTTP 服务器（用于测试）
    startHTTPServer();
  } else {
    // stdio 模式 - 用于 Cursor
    let buffer = '';
    
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
      
      // 尝试解析完整的 JSON 对象
      let lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留最后不完整的行
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const request = JSON.parse(line);
            const response = handleMCPRequest(request);
            process.stdout.write(JSON.stringify(response) + '\n');
          } catch (error) {
            console.error('Error processing request:', error);
          }
        }
      }
    });
    
    process.stdin.on('end', () => {
      process.exit(0);
    });
  }
}

/**
 * HTTP 服务器模式（用于测试）
 */
function startHTTPServer() {
  const http = require('http');
  
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/mcp') {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        try {
          const request = JSON.parse(body);
          const response = handleMCPRequest(request);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' }
          }));
        }
      });
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
  
  server.listen(PORT, () => {
    console.log(`MCP Export Server running on http://localhost:${server.address().port}`);
    console.log(`Export directory: ${EXPORT_DIR}`);
    console.log(`\nAvailable exports:`);
    const exports = loadExports();
    for (const [key, data] of Object.entries(exports)) {
      console.log(`  - ${key}: ${data.figmaUrl || 'N/A'}`);
    }
  });
}

// 运行主函数
main();

