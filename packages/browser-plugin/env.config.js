/**
 * 环境变量配置
 * 此文件由 load-env.js 自动生成，请勿手动编辑
 * 要修改配置，请编辑 .env 文件并重新运行构建
 */

// 从 .env 文件加载的配置
const ENV_CONFIG = {
  "MCP_SERVER_URL": "https://mcp.figma.com/mcp",
  "FIGMA_ACCESS_TOKEN": "YOUR_FIGMA_TOKEN",
  "BACKEND_API_URL": "https://chrome-extension-service-test.100cbc.com",
  "TINYPNG_API_KEY": "YOUR_TINYPNG_API_KEY",
  "OSS_UPLOAD_URL": "https://file.jk.100cbc.com/api/sys/file",
  "OSS_SYSTEM_CODE": "PHARMACY",
  "OSS_BELONG_CODE": "RP",
  "OSS_BELONG_ID": "210304103256552626"
};

// 导出配置
if (typeof module !== "undefined" && module.exports) {
  module.exports = ENV_CONFIG;
} else if (typeof window !== "undefined") {
  window.ENV_CONFIG = ENV_CONFIG;
}
