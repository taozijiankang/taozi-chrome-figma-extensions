#!/usr/bin/env node

/**
 * 生成 Chrome 扩展的固定 Key
 * 用于确保扩展在不同设备上安装时具有相同的 ID
 * 
 * 使用方法：
 * node generate-key.js
 * 
 * 这会生成：
 * - key.pem (私钥，请妥善保管，不要提交到 Git)
 * - public-key.txt (公钥，用于 manifest.json 的 key 字段)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PRIVATE_KEY_PATH = path.join(__dirname, 'key.pem');
const PUBLIC_KEY_PATH = path.join(__dirname, 'public-key.txt');
const KEY_INFO_PATH = path.join(__dirname, 'KEY-INFO.md');

console.log('🔑 生成 Chrome 扩展固定 Key...\n');

// 检查是否已存在私钥
if (fs.existsSync(PRIVATE_KEY_PATH)) {
  console.log('⚠️  检测到已存在的 key.pem 文件');
  console.log('   如果要重新生成，请先删除 key.pem 文件\n');
  
  // 从现有私钥生成公钥
  try {
    const publicKey = execSync(`openssl rsa -in "${PRIVATE_KEY_PATH}" -pubout -outform DER 2>/dev/null | openssl base64 -A`, {
      encoding: 'utf-8'
    }).trim();
    
    fs.writeFileSync(PUBLIC_KEY_PATH, publicKey);
    console.log('✓ 已从现有私钥生成公钥\n');
  } catch (error) {
    console.error('❌ 生成公钥失败:', error.message);
    process.exit(1);
  }
} else {
  // 生成新的私钥
  try {
    console.log('1. 生成私钥...');
    execSync(`openssl genrsa -out "${PRIVATE_KEY_PATH}" 2048`, { stdio: 'inherit' });
    console.log('   ✓ 私钥已生成: key.pem\n');
    
    // 从私钥生成公钥（Base64 编码）
    console.log('2. 生成公钥...');
    const publicKey = execSync(`openssl rsa -in "${PRIVATE_KEY_PATH}" -pubout -outform DER 2>/dev/null | openssl base64 -A`, {
      encoding: 'utf-8'
    }).trim();
    
    fs.writeFileSync(PUBLIC_KEY_PATH, publicKey);
    console.log('   ✓ 公钥已生成: public-key.txt\n');
  } catch (error) {
    console.error('❌ 生成密钥失败:', error.message);
    console.error('\n请确保已安装 OpenSSL:');
    console.error('  macOS: brew install openssl');
    console.error('  Linux: sudo apt-get install openssl');
    console.error('  Windows: 下载并安装 OpenSSL');
    process.exit(1);
  }
}

// 读取公钥
const publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8').trim();

// 生成说明文档
const keyInfo = `# Chrome 扩展 Key 信息

## 重要提示

⚠️ **请妥善保管 key.pem 文件，不要提交到 Git 仓库！**

- \`key.pem\` 是私钥文件，用于签名扩展
- 如果丢失私钥，将无法更新已发布的扩展
- 建议将 \`key.pem\` 添加到 \`.gitignore\` 中

## 使用方法

### 1. 将公钥添加到 manifest.json

在 \`manifest.json\` 中添加 \`key\` 字段：

\`\`\`json
{
  "manifest_version": 3,
  "key": "${publicKey}",
  "name": "MCP Figma 链接读取工具",
  ...
}
\`\`\`

### 2. 验证扩展 ID

1. 打包扩展：\`npm run build\`
2. 在 Chrome 中加载扩展（chrome://extensions/）
3. 查看扩展详情，ID 应该是固定的

### 3. 计算扩展 ID（可选）

扩展 ID 是基于公钥生成的，可以使用以下命令计算：

\`\`\`bash
# macOS/Linux
echo -n "${publicKey}" | openssl base64 -d -A | openssl dgst -sha256 -binary | head -c 16 | od -An -tx1 | tr -d ' \\n' | cut -c1-32 | sed 's/\\(.\\)/\\1/g' | head -c 32

# 或者使用 Node.js
node -e "const crypto = require('crypto'); const key = Buffer.from('${publicKey}', 'base64'); const hash = crypto.createHash('sha256').update(key).digest('hex'); console.log(hash.substring(0, 32).match(/.{1,2}/g).join('').toUpperCase());"
\`\`\`

## 当前公钥

\`\`\`
${publicKey}
\`\`\`

## 注意事项

1. **不要分享私钥**：\`key.pem\` 文件包含私钥，绝对不能分享或提交到公共仓库
2. **备份私钥**：建议将 \`key.pem\` 备份到安全的地方
3. **固定 ID**：使用固定的 key 后，扩展在所有设备上的 ID 都会相同
4. **跨域配置**：固定 ID 后，可以在服务器端配置 CORS，允许该扩展访问

## 跨域配置示例

如果您的后端服务需要允许该扩展访问，可以使用以下配置：

### Express.js (CORS)

\`\`\`javascript
const cors = require('cors');

app.use(cors({
  origin: function (origin, callback) {
    // 允许扩展的 origin（格式：chrome-extension://EXTENSION_ID）
    const allowedOrigins = [
      'chrome-extension://cfdihdbbgdpfmbdbcjgildnnpopbimdb' // 替换为您的扩展 ID
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
\`\`\`

### Nginx

\`\`\`nginx
location /api {
    if (\$http_origin ~* "^chrome-extension://cfdihdbbgdpfmbdbcjgildnnpopbimdb\$") {
        add_header Access-Control-Allow-Origin \$http_origin;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
        add_header Access-Control-Allow-Headers "Content-Type";
    }
}
\`\`\`
`;

fs.writeFileSync(KEY_INFO_PATH, keyInfo);

console.log('📝 使用说明：');
console.log('   1. 将 public-key.txt 中的内容复制到 manifest.json 的 "key" 字段');
console.log('   2. 查看 KEY-INFO.md 了解详细使用方法\n');
console.log('📋 公钥内容：');
console.log(publicKey);
console.log('\n✅ 完成！');

