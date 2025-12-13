# MCP Figma 链接读取工具

一个 Chrome 扩展程序，用于通过 MCP (Model Context Protocol) 协议读取 Figma 设计文件。

## 功能特性

- 🔗 解析 Figma 设计链接
- 📊 读取 Figma 文件数据
- 🎨 显示节点详细信息
- 🔌 支持自定义 MCP 服务器
- 💾 本地存储配置信息

## 安装步骤

1. **下载或克隆此项目**

2. **创建图标文件（必需）**

   - 在 `icons/` 目录下放置以下图标：
     - `icon16.png` (16x16 像素)
     - `icon48.png` (48x48 像素)
     - `icon128.png` (128x128 像素)
   - 可以使用任何图片编辑工具创建，或使用在线图标生成器

3. **在 Chrome 中加载扩展**

   - 打开 Chrome 浏览器
   - 访问 `chrome://extensions/`
   - 开启"开发者模式"（右上角）
   - 点击"加载已解压的扩展程序"
   - 选择项目文件夹

4. **配置访问方式（二选一）**

   **方式 A：使用 Figma API（推荐）**

   - 访问 [Figma Settings](https://www.figma.com/settings)
   - 生成 Personal Access Token
   - 在扩展 popup 中点击"高级配置"
   - 输入 Figma Access Token

   **方式 B：使用 MCP 服务器**

   - 运行 `mcp-server-example.js` 作为 MCP 服务器
   - 在扩展 popup 中配置 MCP 服务器地址（如：`http://localhost:3000`）

## 使用方法

1. 点击浏览器工具栏中的扩展图标
2. 输入或粘贴 Figma 设计链接
3. 点击"读取设计文件"按钮
4. 查看返回的设计文件数据

## 支持的 URL 格式

```
https://www.figma.com/design/{fileKey}/{文件名}?node-id={nodeId}
```

示例：

```
https://www.figma.com/design/EgyGT09qbHblagmaYQhGtg/2024-%E4%BA%91%E9%97%A8%E8%AF%8A%E5%B0%8F%E7%A8%8B%E5%BA%8F?node-id=4257-6505&m=dev
```

## MCP 服务器配置

### 使用自定义 MCP 服务器

1. 在扩展 popup 中点击"高级配置"
2. 输入 MCP 服务器地址
3. 支持格式：
   - `http://localhost:3000` (HTTP)
   - `ws://localhost:3000` (WebSocket)

### 运行示例 MCP 服务器

```bash
# 安装依赖
npm install express cors

# 设置 Figma Access Token
export FIGMA_ACCESS_TOKEN=your_token_here

# 运行服务器
node mcp-server-example.js
```

### MCP 服务器 API 格式

扩展支持两种 MCP 协议格式：

**1. JSON-RPC 格式（标准 MCP 协议）**

```
POST /mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 123456,
  "method": "tools/call",
  "params": {
    "name": "mcp_Framelink_MCP_for_Figma_get_figma_data",
    "arguments": {
      "fileKey": "EgyGT09qbHblagmaYQhGtg",
      "nodeId": "4257-6505"
    }
  }
}
```

**2. 简化的 REST API 格式**

```
POST /mcp/figma
Content-Type: application/json

{
  "fileKey": "EgyGT09qbHblagmaYQhGtg",
  "nodeId": "4257-6505"
}
```

## 项目结构

```
.
├── manifest.json       # Chrome 扩展配置文件
├── popup.html         # 扩展弹窗 HTML
├── popup.js           # 弹窗逻辑
├── background.js      # 后台服务脚本（MCP 客户端）
├── content.js         # 内容脚本
├── styles.css         # 样式文件
└── README.md          # 说明文档
```

## 开发说明

### 使用 Figma API

扩展支持直接使用 Figma REST API，需要配置 Personal Access Token：

1. 在 `background.js` 中，`fetchFromFigmaAPI` 方法会使用存储的 token
2. 可以通过 Chrome Storage API 存储 token

### 使用 MCP 服务器

扩展也支持通过 MCP 服务器获取数据，这样可以：

- 统一管理 API 密钥
- 添加缓存层
- 实现更复杂的业务逻辑

## 注意事项

- 使用 Figma API 需要有效的 Access Token
- 某些 Figma 文件可能需要特定的权限才能访问
- MCP 服务器需要实现相应的接口

## 许可证

MIT
