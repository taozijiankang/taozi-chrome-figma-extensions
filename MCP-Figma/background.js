// Background Service Worker for Chrome Extension
// 处理 MCP 连接和 Figma 数据获取

// MCP 客户端实现
class MCPClient {
  constructor(serverUrl = null) {
    this.serverUrl = serverUrl;
    this.connection = null;
  }

  // 使用 Figma MCP 工具获取数据
  async fetchFigmaData(fileKey, nodeId = null) {
    try {
      // 这里我们需要通过 Chrome Extension 的 messaging 系统
      // 或者使用 fetch API 调用 MCP 服务器
      // 由于 MCP 通常需要 WebSocket 或 HTTP 连接，我们需要适配

      // 如果配置了自定义 MCP 服务器，使用它
      if (this.serverUrl) {
        return await this.fetchFromCustomServer(fileKey, nodeId);
      }

      // 否则，使用内置的 Figma API（通过 content script 或直接调用）
      // 注意：实际的 MCP 调用需要通过 MCP 服务器
      // 这里我们提供一个模拟实现，实际使用时需要连接到真实的 MCP 服务器

      return await this.fetchFromFigmaAPI(fileKey, nodeId);
    } catch (error) {
      throw new Error(`获取 Figma 数据失败: ${error.message}`);
    }
  }

  // 从自定义 MCP 服务器获取数据
  async fetchFromCustomServer(fileKey, nodeId) {
    try {
      // 支持两种 MCP 协议格式
      // 1. HTTP JSON-RPC 格式
      // 2. 简化的 REST API 格式

      const isWebSocket =
        this.serverUrl.startsWith("ws://") ||
        this.serverUrl.startsWith("wss://");

      if (isWebSocket) {
        // WebSocket 连接（需要建立持久连接）
        return await this.fetchViaWebSocket(fileKey, nodeId);
      } else {
        // HTTP 请求
        return await this.fetchViaHTTP(fileKey, nodeId);
      }
    } catch (error) {
      throw new Error(`连接 MCP 服务器失败: ${error.message}`);
    }
  }

  // 通过 HTTP 获取数据
  async fetchViaHTTP(fileKey, nodeId) {
    try {
      // 确保 URL 正确（如果 serverUrl 已经包含 /mcp，就不再添加）
      let mcpUrl = this.serverUrl;
      if (!mcpUrl.endsWith("/mcp") && !mcpUrl.endsWith("/mcp/")) {
        mcpUrl = mcpUrl.endsWith("/") ? `${mcpUrl}mcp` : `${mcpUrl}/mcp`;
      }

      // 首先尝试列出可用的工具
      let availableTools = [];
      try {
        const listToolsRequest = {
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/list",
          params: {},
        };

        const listResponse = await fetch(mcpUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(listToolsRequest),
        });

        if (listResponse.ok) {
          const listResult = await listResponse.json();
          if (listResult.result && listResult.result.tools) {
            availableTools = listResult.result.tools;
            console.log(
              "可用工具列表:",
              availableTools.map((t) => t.name)
            );
          }
        }
      } catch (e) {
        console.warn("无法列出工具:", e);
      }

      // 查找 Figma 相关的工具
      let toolName = null;
      if (availableTools.length > 0) {
        const figmaTool = availableTools.find(
          (tool) =>
            tool.name.toLowerCase().includes("figma") ||
            tool.name.toLowerCase().includes("get_figma_data") ||
            tool.name.toLowerCase().includes("get_figma")
        );
        if (figmaTool) {
          toolName = figmaTool.name;
        }
      }

      // 如果没有找到工具名，尝试常见的工具名
      const possibleNames = toolName
        ? [toolName]
        : [
            "get_figma_data",
            "mcp_Framelink_MCP_for_Figma_get_figma_data",
            "figma/get_data",
            "getFigmaData",
          ];

      // 构建参数对象
      const args = { fileKey };
      if (nodeId) {
        args.nodeId = nodeId;
      }

      // 尝试每个可能的工具名
      let lastError = null;
      for (const name of possibleNames) {
        try {
          const jsonRpcRequest = {
            jsonrpc: "2.0",
            id: Date.now(),
            method: "tools/call",
            params: {
              name: name,
              arguments: args,
            },
          };

          const response = await fetch(mcpUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(jsonRpcRequest),
          });

          if (!response.ok) {
            throw new Error(`HTTP 错误: ${response.status}`);
          }

          const result = await response.json();

          if (result.error) {
            lastError = result.error;
            // 如果是方法未找到错误，继续尝试下一个工具名
            if (result.error.code === -32601) {
              console.log(`工具 "${name}" 未找到，尝试下一个...`);
              continue;
            }
            // 其他错误直接抛出
            throw new Error(
              result.error.message ||
                `MCP 服务器返回错误: ${JSON.stringify(result.error)}`
            );
          }

          // 成功返回结果
          return result.result || result.data;
        } catch (error) {
          lastError = error;
          // 如果不是方法未找到错误，直接抛出
          if (
            !error.message.includes("Method not found") &&
            !error.message.includes("-32601")
          ) {
            throw error;
          }
          // 继续尝试下一个工具名
          continue;
        }
      }

      // 所有工具名都失败了
      if (lastError) {
        throw new Error(
          `无法找到可用的 Figma 工具。已尝试: ${possibleNames.join(
            ", "
          )}。错误: ${lastError.message || JSON.stringify(lastError)}`
        );
      }

      throw new Error("无法连接到 MCP 服务器");
    } catch (error) {
      // 如果 JSON-RPC 失败，尝试简化的 REST API
      if (
        error.message.includes("无法找到可用的") ||
        error.message.includes("Method not found")
      ) {
        throw error; // 不尝试 REST API，直接抛出错误
      }
      return await this.fetchViaSimpleREST(fileKey, nodeId);
    }
  }

  // 通过简化的 REST API 获取数据
  async fetchViaSimpleREST(fileKey, nodeId) {
    // 确保 URL 正确
    let restUrl = this.serverUrl;
    if (!restUrl.endsWith("/figma") && !restUrl.endsWith("/figma/")) {
      restUrl = restUrl.endsWith("/")
        ? `${restUrl}figma`
        : restUrl.endsWith("/mcp")
        ? `${restUrl}/figma`
        : `${restUrl}/mcp/figma`;
    }

    const response = await fetch(restUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileKey,
        nodeId,
      }),
    });

    if (!response.ok) {
      throw new Error(`服务器错误: ${response.status}`);
    }

    const data = await response.json();
    return data.data || data;
  }

  // 通过 WebSocket 获取数据（需要持久连接）
  async fetchViaWebSocket(fileKey, nodeId) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.serverUrl);

      ws.onopen = () => {
        // 构建参数对象
        const args = { fileKey };
        if (nodeId) {
          args.nodeId = nodeId;
        }

        const request = {
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: "get_figma_data",
            arguments: args,
          },
        };
        ws.send(JSON.stringify(request));
      };

      ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          ws.close();

          if (response.error) {
            reject(new Error(response.error.message || "MCP 服务器返回错误"));
          } else {
            resolve(response.result || response.data);
          }
        } catch (error) {
          ws.close();
          reject(error);
        }
      };

      ws.onerror = (error) => {
        ws.close();
        reject(new Error("WebSocket 连接错误"));
      };

      // 设置超时
      setTimeout(() => {
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
          reject(new Error("请求超时"));
        }
      }, 30000);
    });
  }

  // 从 Figma API 获取数据（备用方案）
  // 注意：这需要 Figma Access Token
  async fetchFromFigmaAPI(fileKey, nodeId) {
    // 获取存储的 access token
    const result = await chrome.storage.sync.get(["figmaAccessToken"]);
    const accessToken = result.figmaAccessToken;

    if (!accessToken) {
      throw new Error(
        "请先配置 Figma Access Token。您可以在 Figma 设置中生成 Personal Access Token。"
      );
    }

    try {
      let url = `https://api.figma.com/v1/files/${fileKey}`;
      if (nodeId) {
        url += `/nodes?ids=${encodeURIComponent(nodeId)}`;
      }

      const response = await fetch(url, {
        headers: {
          "X-Figma-Token": accessToken,
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Figma Access Token 无效或已过期");
        }
        throw new Error(`Figma API 错误: ${response.status}`);
      }

      const data = await response.json();

      if (nodeId && data.nodes) {
        // 返回节点数据
        const nodeData = Object.values(data.nodes)[0];
        return nodeData ? nodeData.document : null;
      } else if (data.document) {
        // 返回文件数据
        return data.document;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }
}

// 创建全局 MCP 客户端实例
let mcpClient = new MCPClient();

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchFigmaData") {
    handleFetchFigmaData(request, sendResponse);
    return true; // 保持消息通道开放以支持异步响应
  }

  if (request.action === "updateMCPServer") {
    const serverUrl = request.serverUrl;
    mcpClient = new MCPClient(serverUrl || null);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "downloadFigmaImages") {
    handleDownloadFigmaImages(request, sendResponse);
    return true;
  }

  if (request.action === "uploadImageToOSS") {
    handleUploadImageToOSS(request, sendResponse);
    return true;
  }

  if (request.action === "batchUploadImagesToOSS") {
    handleBatchUploadImagesToOSS(request, sendResponse);
    return true;
  }

  if (request.action === "downloadFigmaImagesViaMCP") {
    handleDownloadFigmaImagesViaMCP(request, sendResponse);
    return true;
  }
});

// 处理获取 Figma 数据的请求
async function handleFetchFigmaData(request, sendResponse) {
  try {
    const { fileKey, nodeId } = request;

    // 获取保存的 MCP 服务器地址
    const result = await chrome.storage.sync.get(["mcpServer", "mcpServerUrl"]);
    const serverUrl = result.mcpServerUrl || result.mcpServer;
    if (serverUrl) {
      mcpClient = new MCPClient(serverUrl);
      console.log("MCP 客户端已创建，服务器地址:", serverUrl);
    } else if (!mcpClient || !mcpClient.serverUrl) {
      // 如果没有配置，创建一个默认的客户端（可能会失败，但至少不会报错）
      mcpClient = new MCPClient(null);
      console.warn("MCP 服务器地址未配置，使用默认客户端");
    }

    const data = await mcpClient.fetchFigmaData(fileKey, nodeId);

    // 如果成功获取数据，确保 mcpClient 的 serverUrl 已设置，并保存到 storage
    if (data && serverUrl) {
      if (!mcpClient.serverUrl) {
        mcpClient.serverUrl = serverUrl;
      }
      // 确保 storage 中有服务器地址（用于后续下载）
      if (!result.mcpServerUrl && !result.mcpServer) {
        await chrome.storage.sync.set({ mcpServerUrl: serverUrl });
      }
      console.log("MCP 数据获取成功，服务器地址已保存:", serverUrl);
    }

    sendResponse({ success: true, data });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message,
    });
  }
}

/**
 * 处理下载 Figma 图片的请求
 */
async function handleDownloadFigmaImages(request, sendResponse) {
  try {
    const { fileKey, nodes, pngScale = 2 } = request.data;

    if (!fileKey || !nodes || nodes.length === 0) {
      throw new Error("缺少必要参数：fileKey 和 nodes");
    }

    // 获取保存的 token
    const result = await chrome.storage.sync.get([
      "mcpToken",
      "figmaAccessToken",
    ]);
    const token = result.mcpToken || result.figmaAccessToken;

    if (!token) {
      throw new Error("请先配置 Figma Access Token");
    }

    const downloadResults = [];

    for (const node of nodes) {
      try {
        const imageRef = node.imageRef;
        if (!imageRef) {
          console.warn(`节点 ${node.nodeId} 没有 imageRef，跳过下载`);
          continue;
        }

        // 通过 Figma API 下载图片
        // Figma API: GET /v1/images/{file_key}?ids={node_ids}&format=png&scale={scale}
        // 但这里我们需要通过 imageRef 下载，需要使用不同的方法

        // 方法1: 通过 Figma 的图片 URL 下载（如果 imageRef 可以直接访问）
        // 方法2: 通过 Figma API 的 export 接口

        // 尝试通过 Figma 的图片导出 API
        // 注意：Figma API 需要通过 node ID 导出，而不是 imageRef
        // 但我们可以尝试直接访问 Figma 的图片 URL

        // 构建 Figma 图片 URL
        // Figma 图片 URL 格式: https://www.figma.com/file/{fileKey}/...?node-id={nodeId}
        // 或者通过 API: https://api.figma.com/v1/images/{fileKey}?ids={nodeId}&format=png&scale={pngScale}

        // 由于我们只有 imageRef，需要先通过 MCP 获取 node ID，或者直接使用 imageRef
        // 这里我们尝试通过 Figma 的图片服务直接下载

        // 尝试通过 Figma 的图片服务 URL
        // 注意：这可能需要特定的权限或 API
        const imageUrl = `https://www.figma.com/file/${fileKey}/image/${imageRef}?scale=${pngScale}`;

        // 或者使用 Figma API 的导出接口（需要 node ID）
        // 由于我们可能没有 node ID，先尝试直接下载 imageRef

        try {
          // 尝试通过 Figma API 下载图片
          // 注意：Figma API 需要通过 node ID 导出，但我们只有 imageRef
          // 尝试使用 nodeId（如果可用）或通过其他方式获取

          // 方法1: 尝试使用 nodeId 通过 Figma API 下载
          let nodeIdForDownload = node.nodeId;
          if (nodeIdForDownload) {
            // 将 nodeId 转换为 Figma API 需要的格式（将 - 替换回 :）
            nodeIdForDownload = nodeIdForDownload.replace(/-/g, ":");

            try {
              const apiUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(
                nodeIdForDownload
              )}&format=png&scale=${pngScale}`;
              
              // 调试日志：输出构建的 API URL 和参数
              console.log(`[Figma API] 下载图片 (handleDownloadFigmaImages):`, {
                fileKey,
                nodeId: nodeIdForDownload,
                format: "png",
                scale: pngScale,
                apiUrl: apiUrl
              });
              
              const response = await fetch(apiUrl, {
                headers: {
                  "X-Figma-Token": token,
                },
              });

              if (response.ok) {
                const data = await response.json();
                if (data.images && data.images[nodeIdForDownload]) {
                  const imageUrl = data.images[nodeIdForDownload];

                  // 下载实际的图片
                  const imageResponse = await fetch(imageUrl);
                  if (imageResponse.ok) {
                    const blob = await imageResponse.blob();

                    // 在 Service Worker 中，不能使用 URL.createObjectURL
                    // 将 blob 转换为 base64
                    const arrayBuffer = await blob.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);

                    // 使用更安全的方式转换 base64（避免大文件问题）
                    let binary = "";
                    const chunkSize = 8192;
                    for (let i = 0; i < uint8Array.length; i += chunkSize) {
                      const chunk = uint8Array.subarray(i, i + chunkSize);
                      binary += String.fromCharCode.apply(null, chunk);
                    }
                    const base64 = btoa(binary);
                    const dataUrl = `data:${
                      blob.type || "image/png"
                    };base64,${base64}`;

                    downloadResults.push({
                      fileName: node.fileName,
                      imageRef: imageRef,
                      nodeId: node.nodeId,
                      url: dataUrl,
                      blobType: blob.type || "image/png",
                    });
                    continue; // 成功下载，继续下一个
                  }
                }
              }
            } catch (apiError) {
              console.warn(`通过 Figma API 下载失败:`, apiError);
            }
          }

          // 方法2: 如果 API 方法失败，尝试直接访问 Figma 图片 URL
          // 注意：这通常需要用户已登录 Figma
          const directUrl = `https://www.figma.com/file/${fileKey}/image/${imageRef}?scale=${pngScale}`;
          const response = await fetch(directUrl, {
            headers: {
              "X-Figma-Token": token,
            },
          });

          if (response.ok) {
            const blob = await response.blob();

            // 将 blob 转换为 base64
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // 使用更安全的方式转换 base64（避免大文件问题）
            let binary = "";
            const chunkSize = 8192;
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
              const chunk = uint8Array.subarray(i, i + chunkSize);
              binary += String.fromCharCode.apply(null, chunk);
            }
            const base64 = btoa(binary);
            const dataUrl = `data:${blob.type || "image/png"};base64,${base64}`;

            downloadResults.push({
              fileName: node.fileName,
              imageRef: imageRef,
              nodeId: node.nodeId,
              url: dataUrl,
              blobType: blob.type || "image/png",
            });
          } else {
            throw new Error(
              `无法下载图片: ${response.status} ${response.statusText}`
            );
          }
        } catch (fetchError) {
          console.warn(`下载图片失败:`, fetchError);

          // 下载失败，返回错误信息
          downloadResults.push({
            fileName: node.fileName,
            imageRef: imageRef,
            nodeId: node.nodeId,
            url: null,
            error: fetchError.message || "下载失败",
          });
        }
      } catch (error) {
        console.error(`下载图片 ${node.fileName} 失败:`, error);
        downloadResults.push({
          fileName: node.fileName,
          imageRef: node.imageRef,
          nodeId: node.nodeId,
          url: null,
          error: error.message,
        });
      }
    }

    sendResponse({ success: true, data: downloadResults });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message,
    });
  }
}

/**
 * 处理上传单个图片到 OSS 的请求
 */
async function handleUploadImageToOSS(request, sendResponse) {
  try {
    const { file, fileName, imageRef, nodeId } = request.data;

    if (!file || !fileName) {
      throw new Error("缺少必要参数：file 和 fileName");
    }

    // 获取 OSS 配置
    const result = await chrome.storage.sync.get([
      "ossUploadUrl",
      "ossSystemCode",
      "ossBelongCode",
      "ossBelongID",
    ]);

    const ossConfig = {
      url: result.ossUploadUrl || "https://file.jk.100cbc.com/api/sys/file",
      systemCode: result.ossSystemCode || "PHARMACY",
      belongCode: result.ossBelongCode || "RP",
      belongID: result.ossBelongID || "210304103256552626",
    };

    if (!ossConfig.url) {
      throw new Error("请先配置 OSS 上传接口地址");
    }

    // 将 base64 或 ArrayBuffer 转换为 Blob
    let blob;
    if (typeof file === "string") {
      // base64 字符串
      const response = await fetch(file);
      blob = await response.blob();
    } else if (file instanceof ArrayBuffer) {
      blob = new Blob([file], { type: "image/png" });
    } else if (file instanceof Blob) {
      blob = file;
    } else {
      throw new Error("不支持的文件格式");
    }

    // 上传到 OSS
    const formData = new FormData();
    formData.append("systemCode", ossConfig.systemCode);
    formData.append("belongCode", ossConfig.belongCode);
    formData.append("belongID", ossConfig.belongID);
    formData.append("file", new File([blob], fileName));

    const response = await fetch(ossConfig.url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`上传失败: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const ossUrl =
      data.data?.remoteAddress ||
      data.data?.remoteUrl ||
      data.remoteUrl ||
      data.url;

    if (!ossUrl) {
      throw new Error("无法从响应中获取 OSS URL");
    }

    sendResponse({
      success: true,
      data: {
        imageRef,
        nodeId,
        fileName,
        ossUrl,
      },
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message,
    });
  }
}

/**
 * 处理批量上传图片到 OSS 的请求
 */
async function handleBatchUploadImagesToOSS(request, sendResponse) {
  try {
    const { files } = request.data;

    if (!files || files.length === 0) {
      throw new Error("缺少必要参数：files");
    }

    const results = [];

    for (const fileData of files) {
      try {
        const response = await chrome.runtime.sendMessage({
          action: "uploadImageToOSS",
          data: fileData,
        });

        if (response && response.success) {
          results.push(response.data);
        } else {
          results.push({
            ...fileData,
            error: response?.error || "上传失败",
          });
        }
      } catch (error) {
        results.push({
          ...fileData,
          error: error.message,
        });
      }
    }

    sendResponse({ success: true, data: results });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message,
    });
  }
}

/**
 * 通过 imageRef 和 nodeId 下载 Figma 图片
 * 直接使用 Figma API，不需要 MCP 服务器地址
 */
async function handleDownloadFigmaImagesViaMCP(request, sendResponse) {
  try {
    const { fileKey, nodes, localPath, pngScale = 2 } = request.data;
    
    // 调试日志：确认接收到的 pngScale 值
    console.log(`[handleDownloadFigmaImagesViaMCP] 接收到的参数:`, {
      fileKey,
      nodesCount: nodes?.length || 0,
      pngScale: pngScale,
      pngScaleType: typeof pngScale,
      rawPngScale: request.data.pngScale
    });

    if (!fileKey || !nodes || nodes.length === 0) {
      throw new Error("缺少必要参数：fileKey 和 nodes");
    }

    // 获取 Figma Access Token
    const result = await chrome.storage.sync.get([
      "mcpToken",
      "figmaAccessToken",
    ]);
    const token = result.mcpToken || result.figmaAccessToken;

    if (!token) {
      throw new Error("请先配置 Figma Access Token");
    }

    const downloadResults = [];

    // 直接使用 imageRef 和 nodeId 通过 Figma API 下载图片
    for (const node of nodes) {
      try {
        const imageRef = node.imageRef;
        const nodeId = node.nodeId;
        const hasExportSettings = node.hasExportSettings || false; // 是否有 exportSettings
        const resourceType =
          node.resourceType || (node.imageRef ? "PNG" : "SVG");
        const format = node.format || (resourceType === "SVG" ? "svg" : "png");
        const isGroup = node.isGroup || false; // Group 类型的节点（按 Group 分组的 VECTOR）

        // 调试日志：输出节点信息
        console.log(`[handleDownloadFigmaImagesViaMCP] 处理节点:`, {
          nodeId,
          imageRef: imageRef || 'null',
          hasExportSettings,
          resourceType,
          format,
          isGroup,
          nodeKeys: Object.keys(node)
        });

        // PNG 图片必须有 imageRef 或 exportSettings，但 Group 类型的节点（SVG 组合图标）不需要 imageRef
        // Group 类型的节点会导出为 PNG
        // 如果有 exportSettings，即使没有 imageRef 也可以通过 nodeId 导出
        if (resourceType === "PNG" && !imageRef && !isGroup && !hasExportSettings) {
          console.warn(`PNG 节点 ${nodeId} 没有 imageRef 也没有 exportSettings，跳过下载`);
          continue;
        }

        if (!nodeId) {
          console.warn(`节点没有 nodeId，跳过下载`);
          continue;
        }

        // 将 nodeId 转换为 Figma API 需要的格式
        // 注意：nodeId 可能包含分号（复合 nodeId），需要正确处理
        // 例如：I4257-6691;27250-19506 -> I4257:6691;27250:19506
        // 只替换冒号位置，保留分号
        let nodeIdForAPI = nodeId;
        if (nodeId.includes(";")) {
          // 复合 nodeId：分别处理每个部分
          nodeIdForAPI = nodeId
            .split(";")
            .map((part) => part.replace(/-/g, ":"))
            .join(";");
        } else {
          // 简单 nodeId：直接替换
          nodeIdForAPI = nodeId.replace(/-/g, ":");
        }

        // 确定导出格式：PNG 或 SVG
        // Group 类型的节点（SVG 组合图标）始终导出为 PNG
        // 如果节点有 format 属性，使用它；否则根据是否有 imageRef 或是否为 Group 判断
        const exportFormat =
          node.format || (node.imageRef || isGroup ? "png" : "svg");

        // 通过 Figma API 下载图片或 SVG
        // Figma API: GET /v1/images/{file_key}?ids={node_ids}&format={format}&scale={scale}
        // format 可以是 png, jpg, svg, pdf
        // 注意：scale 参数只对 PNG 格式有效
        const scaleParam = exportFormat === "png" ? `&scale=${pngScale}` : "";
        const apiUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(
          nodeIdForAPI
        )}&format=${exportFormat}${scaleParam}`;

        // 调试日志：输出构建的 API URL 和参数
        console.log(`[Figma API] 下载图片:`, {
          fileKey,
          nodeId: nodeIdForAPI,
          format: exportFormat,
          scale: exportFormat === "png" ? pngScale : "N/A (仅 PNG 支持)",
          apiUrl: apiUrl
        });

        const response = await fetch(apiUrl, {
          headers: {
            "X-Figma-Token": token,
          },
        });

        if (!response.ok) {
          throw new Error(
            `Figma API 请求失败: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();

        if (data.err) {
          throw new Error(`Figma API 错误: ${data.err}`);
        }

        // 检查返回的 images 对象，尝试匹配 nodeId
        let imageUrl = null;
        if (data.images) {
          // 直接查找
          if (data.images[nodeIdForAPI]) {
            imageUrl = data.images[nodeIdForAPI];
          } else {
            // 如果直接查找失败，尝试查找所有可能的 key
            const keys = Object.keys(data.images);
            console.log(`Figma API 返回的 nodeId keys:`, keys);
            console.log(`查找的 nodeId:`, nodeIdForAPI);

            // 尝试模糊匹配（可能是编码问题）
            const matchingKey = keys.find(
              (key) =>
                key === nodeIdForAPI ||
                key.replace(/:/g, "-") === nodeId.replace(/:/g, "-") ||
                decodeURIComponent(key) === nodeIdForAPI
            );

            if (matchingKey) {
              imageUrl = data.images[matchingKey];
            }
          }
        }

        if (imageUrl) {
          // 下载实际的图片
          const imageResponse = await fetch(imageUrl);
          if (!imageResponse.ok) {
            throw new Error(
              `下载图片失败: ${imageResponse.status} ${imageResponse.statusText}`
            );
          }

          const blob = await imageResponse.blob();

          // 在 Service Worker 中，不能使用 URL.createObjectURL
          // 将 blob 转换为 base64
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);

          // 使用更安全的方式转换 base64（避免大文件问题）
          let binary = "";
          const chunkSize = 8192;
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
          }
          const base64 = btoa(binary);
          // 根据格式确定 MIME 类型
          const mimeType =
            exportFormat === "svg" ? "image/svg+xml" : blob.type || "image/png";
          const dataUrl = `data:${mimeType};base64,${base64}`;

          // 生成文件名
          let fileName = node.fileName;
          if (!fileName) {
            if (isGroup) {
              // Group 类型的节点：使用 nodeId 作为文件名
              fileName = `${nodeId}.png`;
            } else if (resourceType === "SVG") {
              fileName = `${nodeId}.svg`;
            } else if (imageRef) {
              fileName = `${imageRef}.png`;
            } else {
              fileName = `${nodeId}.${exportFormat}`;
            }
          }

          downloadResults.push({
            fileName: fileName,
            localPath: imageUrl, // 保存原始 URL 作为 localPath
            url: dataUrl, // 返回 base64 data URL
            imageRef: imageRef || null, // Group 类型节点可能没有 imageRef
            nodeId: nodeId,
            format: exportFormat,
            resourceType: resourceType,
            isGroup: isGroup, // 标记是否为 Group 类型
          });
        } else {
          throw new Error(`Figma API 未返回图片 URL`);
        }
      } catch (error) {
        console.error(`下载图片 ${node.fileName || node.nodeId} 失败:`, error);
        // 生成错误时的文件名
        let errorFileName = node.fileName;
        if (!errorFileName) {
          const isGroup = node.isGroup || false;
          if (isGroup) {
            errorFileName = `${node.nodeId}.png`;
          } else if (node.imageRef) {
            errorFileName = `${node.imageRef}.png`;
          } else {
            errorFileName = `${node.nodeId}.png`;
          }
        }
        downloadResults.push({
          fileName: errorFileName,
          imageRef: node.imageRef || null,
          nodeId: node.nodeId,
          url: null,
          error: error.message,
          isGroup: node.isGroup || false,
        });
      }
    }

    sendResponse({ success: true, data: downloadResults });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message,
    });
  }
}

// 监听扩展安装
chrome.runtime.onInstalled.addListener(() => {
  console.log("MCP Figma 读取工具已安装");
});
