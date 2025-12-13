# Chrome 扩展 Key 信息

## 重要提示

⚠️ **请妥善保管 key.pem 文件，不要提交到 Git 仓库！**

- `key.pem` 是私钥文件，用于签名扩展
- 如果丢失私钥，将无法更新已发布的扩展
- 建议将 `key.pem` 添加到 `.gitignore` 中

## 使用方法

### 1. 将公钥添加到 manifest.json

在 `manifest.json` 中添加 `key` 字段：

```json
{
  "manifest_version": 3,
  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvXXn/2uvzaSnLMBaBg5RyEQYeSw50VN6x8r74e8IbJ6OTvLFY8qB5qVL79NFzwpu14NOfhK/j2VHcmVlNbv/FsX+Ye8LtIs3Eu2kSPA0kJ9ajeSupqIT2XkaXw55QYfLMfrnv9DFVdFdLlCNr5HOlSit8y2Qbu6mRO9k3z7jjwcpIlj/L2QmlFETLQA0PDGVGoHK+Ao/IQnkjtD90cxQPfCGBalEpfXbtTlPzmo/V5OjLa+POLLzmsyAN4hI3b9I9Pqbzt2EjnXSCjFEl/y8HkCGFPcijlPd3/y8UXLjkg7ml8l8W+SQu0USFrOxjBvcFUQNVmGrzKK73B6YEE5kaQIDAQAB",
  "name": "MCP Figma 链接读取工具",
  ...
}
```

### 2. 验证扩展 ID

1. 打包扩展：`npm run build`
2. 在 Chrome 中加载扩展（chrome://extensions/）
3. 查看扩展详情，ID 应该是固定的

### 3. 计算扩展 ID（可选）

扩展 ID 是基于公钥生成的，可以使用以下命令计算：

```bash
# macOS/Linux
echo -n "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvXXn/2uvzaSnLMBaBg5RyEQYeSw50VN6x8r74e8IbJ6OTvLFY8qB5qVL79NFzwpu14NOfhK/j2VHcmVlNbv/FsX+Ye8LtIs3Eu2kSPA0kJ9ajeSupqIT2XkaXw55QYfLMfrnv9DFVdFdLlCNr5HOlSit8y2Qbu6mRO9k3z7jjwcpIlj/L2QmlFETLQA0PDGVGoHK+Ao/IQnkjtD90cxQPfCGBalEpfXbtTlPzmo/V5OjLa+POLLzmsyAN4hI3b9I9Pqbzt2EjnXSCjFEl/y8HkCGFPcijlPd3/y8UXLjkg7ml8l8W+SQu0USFrOxjBvcFUQNVmGrzKK73B6YEE5kaQIDAQAB" | openssl base64 -d -A | openssl dgst -sha256 -binary | head -c 16 | od -An -tx1 | tr -d ' \n' | cut -c1-32 | sed 's/\(.\)/\1/g' | head -c 32

# 或者使用 Node.js
node -e "const crypto = require('crypto'); const key = Buffer.from('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvXXn/2uvzaSnLMBaBg5RyEQYeSw50VN6x8r74e8IbJ6OTvLFY8qB5qVL79NFzwpu14NOfhK/j2VHcmVlNbv/FsX+Ye8LtIs3Eu2kSPA0kJ9ajeSupqIT2XkaXw55QYfLMfrnv9DFVdFdLlCNr5HOlSit8y2Qbu6mRO9k3z7jjwcpIlj/L2QmlFETLQA0PDGVGoHK+Ao/IQnkjtD90cxQPfCGBalEpfXbtTlPzmo/V5OjLa+POLLzmsyAN4hI3b9I9Pqbzt2EjnXSCjFEl/y8HkCGFPcijlPd3/y8UXLjkg7ml8l8W+SQu0USFrOxjBvcFUQNVmGrzKK73B6YEE5kaQIDAQAB', 'base64'); const hash = crypto.createHash('sha256').update(key).digest('hex'); console.log(hash.substring(0, 32).match(/.{1,2}/g).join('').toUpperCase());"
```

## 当前公钥

```
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvXXn/2uvzaSnLMBaBg5RyEQYeSw50VN6x8r74e8IbJ6OTvLFY8qB5qVL79NFzwpu14NOfhK/j2VHcmVlNbv/FsX+Ye8LtIs3Eu2kSPA0kJ9ajeSupqIT2XkaXw55QYfLMfrnv9DFVdFdLlCNr5HOlSit8y2Qbu6mRO9k3z7jjwcpIlj/L2QmlFETLQA0PDGVGoHK+Ao/IQnkjtD90cxQPfCGBalEpfXbtTlPzmo/V5OjLa+POLLzmsyAN4hI3b9I9Pqbzt2EjnXSCjFEl/y8HkCGFPcijlPd3/y8UXLjkg7ml8l8W+SQu0USFrOxjBvcFUQNVmGrzKK73B6YEE5kaQIDAQAB
```

## 注意事项

1. **不要分享私钥**：`key.pem` 文件包含私钥，绝对不能分享或提交到公共仓库
2. **备份私钥**：建议将 `key.pem` 备份到安全的地方
3. **固定 ID**：使用固定的 key 后，扩展在所有设备上的 ID 都会相同
4. **跨域配置**：固定 ID 后，可以在服务器端配置 CORS，允许该扩展访问

## 跨域配置示例

如果您的后端服务需要允许该扩展访问，可以使用以下配置：

### Express.js (CORS)

```javascript
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
```

### Nginx

```nginx
location /api {
    if ($http_origin ~* "^chrome-extension://cfdihdbbgdpfmbdbcjgildnnpopbimdb$") {
        add_header Access-Control-Allow-Origin $http_origin;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
        add_header Access-Control-Allow-Headers "Content-Type";
    }
}
```
