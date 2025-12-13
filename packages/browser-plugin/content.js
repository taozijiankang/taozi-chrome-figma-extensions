// Content Script for Figma pages
// 用于从 Figma 页面提取 MCP 信息、代码和静态资源

console.log("MCP Figma 读取工具 Content Script 已加载");

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Ping 检查，用于确认 content script 已加载
  if (request.action === "ping") {
    sendResponse({ success: true, message: "pong" });
    return true;
  }

  if (request.action === "getCurrentFigmaUrl") {
    sendResponse({ url: window.location.href });
    return true;
  }

  if (request.action === "extractFigmaData") {
    // 异步处理，需要等待代码展开
    extractFigmaData()
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放以支持异步响应
  }

  if (request.action === "getMCPInfo") {
    try {
      const mcpInfo = getMCPInfo();
      sendResponse({ success: true, data: mcpInfo });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  if (request.action === "getGeneratedCode") {
    // 异步处理，需要等待代码展开
    getGeneratedCode()
      .then((code) => {
        sendResponse({ success: true, data: code });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "getStaticResources") {
    // 异步处理，需要等待展开
    getStaticResources()
      .then((resources) => {
        sendResponse({ success: true, data: resources });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "getImageBlob") {
    // 从 URL 获取图片的 Blob 数据（用于 blob URL）
    getImageBlob(request.data.url)
      .then((blobData) => {
        sendResponse({ success: true, data: blobData });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

/**
 * 提取 Figma 数据（包括代码、MCP 信息和资源）
 */
async function extractFigmaData() {
  const mcpInfo = getMCPInfo();
  const generatedCode = await getGeneratedCode();
  const staticResources = await getStaticResources();

  return {
    mcpInfo: mcpInfo,
    generatedCode: generatedCode,
    staticResources: staticResources,
    figmaUrl: window.location.href,
  };
}

/**
 * 获取 Figma MCP 信息
 * 从 DOM 中查找 MCP 相关的节点
 */
function getMCPInfo() {
  // 查找 MCP 面板中的信息
  const mcpExamplePrompt = document.querySelector(
    '[data-testid="mcp_example_prompt_text"]'
  );
  const mcpExampleLink = document.querySelector(
    '[data-testid="mcp_example_prompt_link"]'
  );

  let mcpText = "";
  let mcpLink = "";

  if (mcpExamplePrompt) {
    mcpText = mcpExamplePrompt.textContent || "";
  }

  if (mcpExampleLink) {
    mcpLink = mcpExampleLink.textContent || "";
  }

  // 获取当前页面的 Figma URL 和 node-id
  const url = new URL(window.location.href);
  const nodeId = url.searchParams.get("node-id");

  return {
    promptText: mcpText,
    figmaUrl: mcpLink || window.location.href,
    nodeId: nodeId,
    fullUrl: window.location.href,
  };
}

/**
 * 获取 Figma 插件生成的代码
 * 从代码面板中提取代码内容
 * 需要先点击展开按钮来显示完整代码
 */
async function getGeneratedCode() {
  // 1. 查找并点击所有"展开更多代码"按钮
  const expandButtons = document.querySelectorAll(
    '[data-testid="show-more-button"]'
  );

  // 点击所有展开按钮
  for (const button of expandButtons) {
    if (button && button.offsetParent !== null) {
      // 检查按钮是否可见
      try {
        button.click();
        // 等待一小段时间让代码展开
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (e) {
        console.warn("Failed to click expand button:", e);
      }
    }
  }

  // 2. 等待代码完全展开（可能需要多次点击）
  // 使用更稳定的选择器：code 标签或包含 data-testid 的代码行
  let previousCodeLength = 0;
  let currentCodeLength = 0;
  let attempts = 0;
  const maxAttempts = 10;

  // 获取代码长度的辅助函数
  const getCodeLength = () => {
    // 优先使用 code 标签获取代码长度
    const codeElements = document.querySelectorAll(
      "code[data-lang], code.code_panel--generatedCode--XGoAV, code"
    );
    if (codeElements.length > 0) {
      return Array.from(codeElements).reduce(
        (sum, code) => sum + (code.textContent || "").length,
        0
      );
    }
    // 回退到使用包含 data-testid 的代码行
    const codeLines = document.querySelectorAll(
      '[data-testid^="Component"], [data-testid^="global"], code > div'
    );
    return codeLines.length;
  };

  do {
    previousCodeLength = currentCodeLength;
    currentCodeLength = getCodeLength();

    // 如果还有展开按钮，继续点击
    const remainingButtons = document.querySelectorAll(
      '[data-testid="show-more-button"]'
    );
    for (const button of remainingButtons) {
      if (button && button.offsetParent !== null) {
        try {
          button.click();
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (e) {
          console.warn("Failed to click expand button:", e);
        }
      }
    }

    attempts++;
    if (attempts >= maxAttempts) break;

    // 等待 DOM 更新
    await new Promise((resolve) => setTimeout(resolve, 200));
    currentCodeLength = getCodeLength();
  } while (currentCodeLength > previousCodeLength && attempts < maxAttempts);

  // 3. 提取代码内容 - 使用更稳定的选择器
  // 优先从 code 标签中提取完整代码
  const codeContainers = document.querySelectorAll(
    "code[data-lang], code.code_panel--generatedCode--XGoAV, code"
  );
  let fullCode = "";
  const codeBlocks = [];

  if (codeContainers.length > 0) {
    // 从 code 标签中提取代码
    codeContainers.forEach((codeElement, fileIndex) => {
      const codeText = codeElement.textContent || "";

      // 如果有多个代码文件，用分隔符分开
      if (fileIndex > 0) {
        fullCode += "\n\n";
      }
      fullCode += codeText;

      // 从 code 元素中提取代码行（用于构建 lines 数组）
      // 查找 code 元素下的所有包含 data-testid 的行
      const codeLines = codeElement.querySelectorAll("[data-testid]");
      codeLines.forEach((lineElement, lineIndex) => {
        const testId = lineElement.getAttribute("data-testid");
        const textContent = lineElement.textContent || "";

        codeBlocks.push({
          lineNumber: codeBlocks.length + 1,
          testId: testId,
          content: textContent,
          html: lineElement.innerHTML,
        });
      });
    });
  } else {
    // 回退方案：从包含 data-testid 的元素中提取代码行
    // 这些元素通常包含 Component1.vue0, Component1.vue1 等 testid
    const codeLineElements = document.querySelectorAll(
      '[data-testid^="Component"], [data-testid^="global"]'
    );

    codeLineElements.forEach((lineElement, index) => {
      const testId = lineElement.getAttribute("data-testid");
      const textContent = lineElement.textContent || "";

      codeBlocks.push({
        lineNumber: index + 1,
        testId: testId,
        content: textContent,
        html: lineElement.innerHTML,
      });
    });

    // 如果没有找到代码行，尝试从 code 标签的直接子元素中提取
    if (codeBlocks.length === 0) {
      const codeElements = document.querySelectorAll("code");
      codeElements.forEach((codeElement) => {
        const codeText = codeElement.textContent || "";
        if (codeText.trim()) {
          fullCode += (fullCode ? "\n\n" : "") + codeText;

          // 尝试从 code 元素中提取行
          const lines = codeText.split("\n");
          lines.forEach((line, index) => {
            if (line.trim()) {
              codeBlocks.push({
                lineNumber: codeBlocks.length + 1,
                testId: null,
                content: line,
                html: line,
              });
            }
          });
        }
      });
    } else {
      // 从代码块中组合完整代码
      fullCode = codeBlocks.map((b) => b.content).join("\n");
    }
  }

  return {
    fullCode: fullCode,
    lines: codeBlocks,
    language: detectCodeLanguage(fullCode),
    fileCount: codeContainers.length,
  };
}

/**
 * 检测代码语言
 */
function detectCodeLanguage(code) {
  if (!code) return "unknown";

  if (
    code.includes("function") ||
    code.includes("const") ||
    code.includes("let") ||
    code.includes("var")
  ) {
    return "javascript";
  }
  if (code.includes("{") && code.includes("}") && code.includes(":")) {
    return "css";
  }
  if (code.includes("<") && code.includes(">")) {
    return "html";
  }
  return "unknown";
}

/**
 * 获取静态资源（图片等）
 * 从 Assets 面板中提取图片资源，包括 blob URL
 * 同时从代码中提取图片引用
 */
async function getStaticResources() {
  const resources = [];

  // 1. 从 Assets 面板中提取图片（包括 blob URL）
  const imagesPanel = document.querySelector(
    '[data-testid="images-inspection-panel"]'
  );
  const iconsPanel = document.querySelector(
    '[data-testid="icons-inspection-panel"]'
  );

  // 从 Images 面板中提取图片
  if (imagesPanel) {
    // 先展开所有图片（如果有展开按钮）
    const expandButtons = imagesPanel.querySelectorAll(
      '[data-testid="show-more-button"]'
    );
    for (const button of expandButtons) {
      if (button && button.offsetParent !== null) {
        try {
          button.click();
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (e) {
          console.warn("Failed to expand images:", e);
        }
      }
    }

    const imageItems = imagesPanel.querySelectorAll(
      ".asset_panel--assetRow--0VUJr"
    );
    imageItems.forEach((item, index) => {
      // 查找图片元素
      const img = item.querySelector("img[src]");
      if (img && img.src) {
        const src = img.src;

        // 获取图片名称和尺寸信息
        const nameElement = item.querySelector(
          ".asset_panel--assetName--exM4m"
        );
        const typeElement = item.querySelector(
          ".asset_panel--assetType--hIg9Q"
        );

        const name = nameElement
          ? nameElement.textContent.trim()
          : `image_${index + 1}`;
        const typeText = typeElement ? typeElement.textContent.trim() : "";

        // 从类型文本中提取尺寸（格式如 "1,000 x 1,000"）
        let width = null;
        let height = null;
        const sizeMatch = typeText.match(/(\d+(?:,\d+)?)\s*x\s*(\d+(?:,\d+)?)/);
        if (sizeMatch) {
          width = parseInt(sizeMatch[1].replace(/,/g, ""));
          height = parseInt(sizeMatch[2].replace(/,/g, ""));
        }

        // 尝试从 img 元素获取实际尺寸
        if (!width && img.naturalWidth) {
          width = img.naturalWidth;
        }
        if (!height && img.naturalHeight) {
          height = img.naturalHeight;
        }

        // 处理 blob URL - 尝试转换为可用的 URL
        let imageUrl = src;
        let blobId = null;

        if (src.startsWith("blob:")) {
          // 提取 blob ID
          const blobMatch = src.match(
            /blob:https:\/\/www\.figma\.com\/([a-f0-9-]+)/
          );
          if (blobMatch) {
            blobId = blobMatch[1];
          }
          // blob URL 需要特殊处理，保留原始 blob URL 和 ID
          imageUrl = src;
        }

        // 检查是否已存在（通过名称或 URL）
        const existing = resources.find(
          (r) =>
            r.name === name || r.url === src || (blobId && r.blobId === blobId)
        );

        if (!existing) {
          const resource = {
            url: imageUrl,
            type: "image",
            source: "assets-panel",
            name: name,
            width: width,
            height: height,
            originalSrc: src,
          };

          if (blobId) {
            resource.blobId = blobId;
            resource.isBlob = true;
          }

          resources.push(resource);
        }
      }
    });
  }

  // 从 Icons 面板中提取图标
  if (iconsPanel) {
    // 先展开所有图标（如果有展开按钮）
    const expandButtons = iconsPanel.querySelectorAll(
      '[data-testid="show-more-button"]'
    );
    for (const button of expandButtons) {
      if (button && button.offsetParent !== null) {
        try {
          button.click();
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (e) {
          console.warn("Failed to expand icons:", e);
        }
      }
    }

    const iconItems = iconsPanel.querySelectorAll(
      ".asset_panel--assetRow--0VUJr"
    );
    iconItems.forEach((item, index) => {
      const img = item.querySelector("img[src]");
      if (img && img.src) {
        const src = img.src;

        const nameElement = item.querySelector(
          ".asset_panel--assetName--exM4m"
        );
        const typeElement = item.querySelector(
          ".asset_panel--assetType--hIg9Q"
        );

        const name = nameElement
          ? nameElement.textContent.trim()
          : `icon_${index + 1}`;
        const typeText = typeElement ? typeElement.textContent.trim() : "";

        let width = null;
        let height = null;
        const sizeMatch = typeText.match(/(\d+(?:,\d+)?)\s*x\s*(\d+(?:,\d+)?)/);
        if (sizeMatch) {
          width = parseInt(sizeMatch[1].replace(/,/g, ""));
          height = parseInt(sizeMatch[2].replace(/,/g, ""));
        }

        if (!width && img.naturalWidth) {
          width = img.naturalWidth;
        }
        if (!height && img.naturalHeight) {
          height = img.naturalHeight;
        }

        let imageUrl = src;
        let blobId = null;

        if (src.startsWith("blob:")) {
          const blobMatch = src.match(
            /blob:https:\/\/www\.figma\.com\/([a-f0-9-]+)/
          );
          if (blobMatch) {
            blobId = blobMatch[1];
          }
          imageUrl = src;
        }

        const existing = resources.find(
          (r) =>
            r.name === name || r.url === src || (blobId && r.blobId === blobId)
        );

        if (!existing) {
          const resource = {
            url: imageUrl,
            type: "icon",
            source: "assets-panel",
            name: name,
            width: width,
            height: height,
            originalSrc: src,
          };

          if (blobId) {
            resource.blobId = blobId;
            resource.isBlob = true;
          }

          resources.push(resource);
        }
      }
    });
  }

  // 2. 从代码中提取图片引用（如果有）
  try {
    const codeData = await getGeneratedCode();
    const code = codeData.fullCode || "";

    // 提取代码中的图片 URL
    const imageUrlRegex =
      /(https?:\/\/[^\s"'<>\)]+\.(?:png|jpg|jpeg|gif|svg|webp|webm))/gi;
    const codeImageUrls = code.match(imageUrlRegex) || [];

    // 提取代码中的图片引用（可能是相对路径或变量名）
    const imageRefRegex =
      /(?:src|url|image|img|backgroundImage)[\s:=]+['"]([^'"]+\.(?:png|jpg|jpeg|gif|svg|webp))['"]/gi;
    let match;
    const codeImageRefs = [];
    while ((match = imageRefRegex.exec(code)) !== null) {
      codeImageRefs.push(match[1]);
    }

    // 合并代码中的图片引用
    const allCodeImages = [...new Set([...codeImageUrls, ...codeImageRefs])];

    allCodeImages.forEach((url) => {
      // 检查是否已经在资源列表中
      const existing = resources.find(
        (r) =>
          r.url === url ||
          r.name === url.split("/").pop() ||
          r.codeReference === url
      );

      if (!existing) {
        resources.push({
          url: url,
          type: "image",
          source: "code",
          name: url.split("/").pop() || "code-image",
          codeReference: url,
        });
      } else if (existing && !existing.codeReference) {
        // 如果已存在但来自 Assets 面板，添加代码引用
        existing.codeReference = url;
      }
    });
  } catch (e) {
    console.warn("Failed to extract images from code:", e);
  }

  return resources;
}

/**
 * 从 URL 获取图片的 Blob 数据
 * 用于处理 blob URL 等需要从页面上下文获取的资源
 */
async function getImageBlob(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`获取图片失败: ${response.status}`);
    }

    const blob = await response.blob();

    // 将 Blob 转换为 ArrayBuffer 以便传输
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = Array.from(new Uint8Array(arrayBuffer));

    return {
      data: uint8Array,
      type: blob.type,
      size: blob.size,
    };
  } catch (error) {
    console.error("获取图片 Blob 失败:", error);
    throw error;
  }
}
