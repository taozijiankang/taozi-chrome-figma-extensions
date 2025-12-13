// MCP 服务器示例实现
// 这是一个 Node.js Express 服务器示例，展示如何实现 MCP 服务器端点

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// MCP JSON-RPC 端点
app.post('/mcp', async (req, res) => {
  try {
    const { jsonrpc, id, method, params } = req.body;
    
    if (jsonrpc !== '2.0') {
      return res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid Request' }
      });
    }
    
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      
      if (name === 'mcp_Framelink_MCP_for_Figma_get_figma_data') {
        // 调用 Figma MCP 工具
        const result = await getFigmaData(args.fileKey, args.nodeId);
        
        return res.json({
          jsonrpc: '2.0',
          id,
          result: result
        });
      }
    }
    
    res.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found' }
    });
  } catch (error) {
    res.json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: { code: -32603, message: error.message }
    });
  }
});

// 简化的 REST API 端点
app.post('/mcp/figma', async (req, res) => {
  try {
    const { fileKey, nodeId } = req.body;
    
    if (!fileKey) {
      return res.status(400).json({ error: 'fileKey is required' });
    }
    
    const data = await getFigmaData(fileKey, nodeId);
    
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取 Figma 数据的函数
async function getFigmaData(fileKey, nodeId) {
  // 这里需要实现实际的 Figma API 调用
  // 或者调用 MCP Figma 服务器
  
  // 示例：使用 Figma REST API
  const FIGMA_ACCESS_TOKEN = process.env.FIGMA_ACCESS_TOKEN;
  
  if (!FIGMA_ACCESS_TOKEN) {
    throw new Error('FIGMA_ACCESS_TOKEN not configured');
  }
  
  let url = `https://api.figma.com/v1/files/${fileKey}`;
  if (nodeId) {
    url += `/nodes?ids=${encodeURIComponent(nodeId)}`;
  }
  
  const response = await fetch(url, {
    headers: {
      'X-Figma-Token': FIGMA_ACCESS_TOKEN
    }
  });
  
  if (!response.ok) {
    throw new Error(`Figma API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (nodeId && data.nodes) {
    const nodeData = Object.values(data.nodes)[0];
    return nodeData ? nodeData.document : null;
  } else if (data.document) {
    return data.document;
  }
  
  return data;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP 服务器运行在 http://localhost:${PORT}`);
});

// 使用说明：
// 1. 安装依赖: npm install express cors
// 2. 设置环境变量: export FIGMA_ACCESS_TOKEN=your_token
// 3. 运行: node mcp-server-example.js
// 4. 在 Chrome 扩展中配置: http://localhost:3000

