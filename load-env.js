#!/usr/bin/env node

/**
 * 从 .env 文件加载环境变量并生成 env.config.js
 * 在构建时运行此脚本来注入环境变量
 */

const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, ".env");
const ENV_CONFIG_FILE = path.join(__dirname, "env.config.js");
const ENV_EXAMPLE_FILE = path.join(__dirname, ".env.example");

// 默认配置
const DEFAULT_CONFIG = {
  MCP_SERVER_URL: "https://mcp.figma.com/mcp",
  FIGMA_ACCESS_TOKEN: "",
  BACKEND_API_URL: "",
  TINYPNG_API_KEY: "",
  OSS_UPLOAD_URL: "https://file.jk.100cbc.com/api/sys/file",
  OSS_SYSTEM_CODE: "PHARMACY",
  OSS_BELONG_CODE: "RP",
  OSS_BELONG_ID: "210304103256552626",
};

// 解析 .env 文件
function parseEnvFile(filePath) {
  const config = { ...DEFAULT_CONFIG };

  if (!fs.existsSync(filePath)) {
    console.warn(`⚠ .env 文件不存在: ${filePath}`);
    console.warn(`  使用默认配置，如需自定义请复制 .env.example 为 .env`);
    return config;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (const line of lines) {
    // 跳过注释和空行
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // 解析 KEY=VALUE 格式
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // 移除引号
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // 如果 key 在默认配置中，则使用它
      if (key in DEFAULT_CONFIG) {
        config[key] = value;
      }
    }
  }

  return config;
}

// 生成 env.config.js 文件
function generateEnvConfig(config) {
  const configString = JSON.stringify(config, null, 2);

  const content = `/**
 * 环境变量配置
 * 此文件由 load-env.js 自动生成，请勿手动编辑
 * 要修改配置，请编辑 .env 文件并重新运行构建
 */

// 从 .env 文件加载的配置
const ENV_CONFIG = ${configString};

// 导出配置
if (typeof module !== "undefined" && module.exports) {
  module.exports = ENV_CONFIG;
} else if (typeof window !== "undefined") {
  window.ENV_CONFIG = ENV_CONFIG;
}
`;

  fs.writeFileSync(ENV_CONFIG_FILE, content, "utf-8");
  console.log(
    `✓ 生成环境变量配置文件: ${path.relative(__dirname, ENV_CONFIG_FILE)}`
  );
}

// 主函数
function main() {
  console.log("加载环境变量配置...\n");

  // 如果 .env 不存在，尝试从 .env.example 创建
  if (!fs.existsSync(ENV_FILE) && fs.existsSync(ENV_EXAMPLE_FILE)) {
    console.log("⚠ .env 文件不存在，从 .env.example 创建...");
    fs.copyFileSync(ENV_EXAMPLE_FILE, ENV_FILE);
    console.log(`✓ 已创建 .env 文件: ${path.relative(__dirname, ENV_FILE)}`);
    console.log("  请编辑 .env 文件以配置你的环境变量\n");
  }

  // 解析 .env 文件
  const config = parseEnvFile(ENV_FILE);

  // 生成 env.config.js
  generateEnvConfig(config);

  console.log("\n环境变量配置:");
  Object.entries(config).forEach(([key, value]) => {
    const displayValue =
      key.includes("TOKEN") || key.includes("KEY") || key.includes("SECRET")
        ? value
          ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
          : "(未设置)"
        : value || "(未设置)";
    console.log(`  ${key}: ${displayValue}`);
  });
}

// 运行
main();
