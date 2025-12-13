#!/usr/bin/env node

/**
 * Chrome 扩展打包脚本
 * 将必要的文件复制到 dist 目录，并创建 .zip 文件
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DIST_DIR = path.join(__dirname, "dist");
const EXTENSION_NAME = "mcp-figma-reader";
const VERSION = require("./package.json").version || "1.0.0";

// 需要打包的文件和目录
const FILES_TO_COPY = [
  "manifest.json",
  "popup.html",
  "popup.js",
  "background.js",
  "content.js",
  "styles.css",
  "figma-mcp-utils.js",
  "mcp-image-processor.js",
  "env.config.js", // 环境变量配置文件
  "icons",
];

function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  console.log(`✓ 复制: ${path.relative(__dirname, src)}`);
}

function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // 跳过隐藏文件和系统文件
    if (entry.name.startsWith(".") && entry.name !== ".gitkeep") {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

function createZip() {
  const zipFileName = `${EXTENSION_NAME}-v${VERSION}.zip`;
  const zipPath = path.join(__dirname, zipFileName);

  // 删除已存在的 zip 文件
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  try {
    // 使用 zip 命令创建压缩包
    process.chdir(DIST_DIR);
    execSync(`zip -r "${zipPath}" .`, { stdio: "inherit" });
    process.chdir(__dirname);
    console.log(`\n✓ 创建压缩包: ${zipFileName}`);
    console.log(`  路径: ${zipPath}`);
  } catch (error) {
    console.warn("\n⚠ 无法创建 .zip 文件（可能需要安装 zip 工具）");
    console.warn("  你可以手动将 dist 目录压缩为 .zip 文件");
  }
}

function build() {
  console.log("开始打包 Chrome 扩展...\n");

  // 加载环境变量配置
  try {
    const { execSync } = require("child_process");
    console.log("加载环境变量配置...");
    execSync("node load-env.js", { stdio: "inherit", cwd: __dirname });
    console.log("");
  } catch (error) {
    console.warn("⚠ 加载环境变量配置失败，使用默认配置:", error.message);
    console.log("");
  }

  // 处理 manifest.json - 添加 key 字段（如果存在）
  const manifestPath = path.join(__dirname, "manifest.json");
  const publicKeyPath = path.join(__dirname, "public-key.txt");
  
  if (fs.existsSync(manifestPath) && fs.existsSync(publicKeyPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      const publicKey = fs.readFileSync(publicKeyPath, "utf-8").trim();
      
      if (publicKey && publicKey !== "YOUR_PUBLIC_KEY_HERE") {
        manifest.key = publicKey;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log("✓ 已自动添加 key 字段到 manifest.json");
      }
    } catch (error) {
      console.warn("⚠ 处理 manifest.json 的 key 字段失败:", error.message);
    }
  } else if (fs.existsSync(publicKeyPath)) {
    console.log("💡 提示: 检测到 public-key.txt，但未找到 manifest.json");
    console.log("   请手动将公钥添加到 manifest.json 的 'key' 字段\n");
  }

  // 清理 dist 目录
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
    console.log("✓ 清理旧的 dist 目录");
  }

  // 创建 dist 目录
  fs.mkdirSync(DIST_DIR, { recursive: true });
  console.log("✓ 创建 dist 目录\n");

  // 复制文件
  for (const item of FILES_TO_COPY) {
    const srcPath = path.join(__dirname, item);
    const destPath = path.join(DIST_DIR, item);

    if (!fs.existsSync(srcPath)) {
      console.warn(`⚠ 文件不存在: ${item}`);
      continue;
    }

    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }

  // 创建版本信息文件（可选）
  const versionInfo = {
    version: VERSION,
    buildTime: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(DIST_DIR, "version.json"),
    JSON.stringify(versionInfo, null, 2)
  );
  console.log(`✓ 创建版本信息文件`);

  console.log("\n✓ 打包完成！");
  console.log(`\n输出目录: ${DIST_DIR}`);
  console.log("\n下一步：");
  console.log("1. 打开 Chrome 浏览器");
  console.log("2. 访问 chrome://extensions/");
  console.log('3. 开启"开发者模式"');
  console.log('4. 点击"加载已解压的扩展程序"');
  console.log("5. 选择 dist 目录\n");

  // 创建 zip 文件
  createZip();
}

// 运行打包
build();
