// Popup Script - 处理 UI 交互和数据展示

let currentData = null;
let lastProcessResult = null;

// 后端 API 调用函数
async function requestBackendUpload(imgUrl, isCompressed, size) {
  const config = await chrome.storage.sync.get(["backendApiUrl"]);
  const apiUrl = config.backendApiUrl;

  if (!apiUrl) {
    throw new Error("未配置后端 API 地址");
  }

  const response = await fetch(`${apiUrl}/oss/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imgUrl,
      isCompressed,
      size,
    }),
  });

  if (!response.ok) {
    throw new Error(`后端服务错误: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  if (result.code !== 1) {
    throw new Error(result.message || "上传失败");
  }

  return result.data;
}

async function requestBackendRecords() {
  const config = await chrome.storage.sync.get(["backendApiUrl"]);
  const apiUrl = config.backendApiUrl;

  if (!apiUrl) {
    throw new Error("未配置后端 API 地址");
  }

  const response = await fetch(`${apiUrl}/oss/records`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`后端服务错误: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  if (result.code !== 1) {
    throw new Error(result.message || "获取记录失败");
  }

  return result.data || [];
}

// 操作状态管理
const OperationState = {
  IDLE: "idle",
  LOADING: "loading",
  SUCCESS: "success",
  ERROR: "error",
};

let currentOperationState = OperationState.IDLE;
let currentOperation = null; // 'fetch' | 'refresh' | 'process' | 'export'

// 解析 Figma URL 提取 fileKey 和 nodeId
function parseFigmaUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(/\/design\/([^\/]+)/);
    const fileKey = pathMatch ? pathMatch[1] : null;

    const nodeId = urlObj.searchParams.get("node-id");

    return { fileKey, nodeId };
  } catch (error) {
    throw new Error("无效的 Figma URL");
  }
}

// 从 Figma URL 提取 fileKey 和 nodeId（兼容函数）
function extractFigmaInfoFromURL(url) {
  return parseFigmaUrl(url);
}

// 显示错误信息
function showError(message) {
  const errorContainer = document.getElementById("errorContainer");
  if (errorContainer) {
    errorContainer.style.display = "block";
    errorContainer.innerHTML = `<div class="error">${escapeHtml(
      message
    )}</div>`;
  }
}

// 隐藏错误信息
function hideError() {
  const errorContainer = document.getElementById("errorContainer");
  if (errorContainer) {
    errorContainer.style.display = "none";
    errorContainer.innerHTML = "";
  }
}

// 显示加载状态
function showLoading(message = "正在加载...", step = null) {
  hideError();
  document.getElementById("result-section")?.classList.add("hidden");
  document.getElementById("node-info-section")?.classList.add("hidden");

  // 设置 section 内容为加载状态
  const sections = ["mcpContainer", "codeContainer", "imagesContainer"];
  sections.forEach((id) => {
    const container = document.getElementById(id);
    if (container) {
      const stepText = step
        ? `<div style="font-size: 11px; color: #999; margin-top: 4px;">${step}</div>`
        : "";
      container.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          <div style="margin-top: 8px;">${message}</div>
          ${stepText}
        </div>
      `;
    }
  });
}

// 隐藏加载状态
function hideLoading() {
  // loading 元素已移除，不需要隐藏
}

// 更新操作状态
function updateOperationState(state, operation = null) {
  currentOperationState = state;
  currentOperation = operation;
  updateButtonStates();
}

// 更新按钮状态
function updateButtonStates() {
  const refreshBtn = document.getElementById("refresh-btn");
  const processBtn = document.getElementById("process-mcp-images-btn");
  const exportBtn = document.getElementById("export-json-btn");

  const isOperationInProgress =
    currentOperationState === OperationState.LOADING;

  if (refreshBtn) {
    refreshBtn.disabled =
      isOperationInProgress && currentOperation === "refresh";
    if (isOperationInProgress && currentOperation === "refresh") {
      refreshBtn.textContent = "加载中...";
    } else {
      refreshBtn.textContent = "从当前页面读取";
    }
  }

  // 更新处理按钮
  if (processBtn) {
    processBtn.disabled =
      isOperationInProgress && currentOperation === "process";
    if (isOperationInProgress && currentOperation === "process") {
      processBtn.textContent = "处理中...";
    } else {
      processBtn.textContent = "批量处理 MCP 图片（下载并上传到 OSS）";
    }
  }

  // 更新导出按钮
  if (exportBtn) {
    // 只要有数据就可以导出（无论是否有图片或处理结果）
    const hasData = currentData !== null;
    // 只要有数据就可以导出，不需要等待批量处理完成
    const canExport = hasData;

    exportBtn.disabled =
      (isOperationInProgress && currentOperation === "export") || !canExport;
  }
}

// 显示操作成功提示
function showSuccessMessage(message, duration = 2000) {
  const errorContainer = document.getElementById("errorContainer");
  if (errorContainer) {
    errorContainer.className = "success-message";
    errorContainer.innerHTML = `<div style="display: flex; align-items: center; gap: 8px;"><span>✓</span> ${message}</div>`;
    errorContainer.style.display = "block";

    if (duration > 0) {
      setTimeout(() => {
        errorContainer.style.display = "none";
      }, duration);
    }
  }
}

// 显示空状态
function showEmptyState() {
  const mcpContainer = document.getElementById("mcpContainer");
  const codeContainer = document.getElementById("codeContainer");
  const imagesContainer = document.getElementById("imagesContainer");

  if (mcpContainer)
    mcpContainer.innerHTML = '<div class="empty-state">暂无数据</div>';
  if (codeContainer)
    codeContainer.innerHTML = '<div class="empty-state">暂无数据</div>';
  if (imagesContainer)
    imagesContainer.innerHTML = '<div class="empty-state">暂无数据</div>';
}

// 重置所有数据（除了配置）
function resetAllData() {
  // 重置全局变量
  currentData = null;
  lastProcessResult = null;
  window.currentMCPImageNodes = [];
  window.currentImageResources = [];
  window.imageSelectionState = {}; // 重置图片选择状态

  // 清空所有显示区域
  const mcpContainer = document.getElementById("mcpContainer");
  const codeContainer = document.getElementById("codeContainer");
  const imagesContainer = document.getElementById("imagesContainer");
  const processResultContainer = document.getElementById(
    "processResultContainer"
  );
  const resultSection = document.getElementById("result-section");
  const nodeInfoSection = document.getElementById("node-info-section");

  if (mcpContainer) {
    mcpContainer.innerHTML = '<div class="loading">正在加载...</div>';
  }
  if (codeContainer) {
    codeContainer.innerHTML = '<div class="loading">正在加载...</div>';
  }
  if (imagesContainer) {
    imagesContainer.innerHTML = '<div class="loading">正在加载...</div>';
  }
  if (processResultContainer) {
    processResultContainer.style.display = "none";
    const resultContent = document.getElementById("processResultContent");
    if (resultContent) {
      resultContent.innerHTML = "";
    }
  }
  if (resultSection) {
    resultSection.classList.add("hidden");
    const resultContent = document.getElementById("result-content");
    if (resultContent) {
      resultContent.innerHTML = "";
    }
  }
  if (nodeInfoSection) {
    nodeInfoSection.classList.add("hidden");
    const nodeContent = document.getElementById("node-content");
    if (nodeContent) {
      nodeContent.innerHTML = "";
    }
  }

  // 重置图片选择状态（确保切换图层时清除旧的选择状态）
  window.imageSelectionState = {};

  // 隐藏错误信息
  hideError();
}

// 格式化 JSON 数据用于显示
function formatData(data) {
  return JSON.stringify(data, null, 2);
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// 从 URL 获取文件名
function getFileName(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const fileName = pathname.split("/").pop();
    return fileName || "image";
  } catch (e) {
    return "image";
  }
}

// 截断 URL 显示
function truncateUrl(url, maxLength) {
  if (url.length <= maxLength) {
    return url;
  }
  return url.substring(0, maxLength) + "...";
}

// 复制到剪贴板
function copyToClipboard(text, event) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      // 显示复制成功提示
      if (event && event.target) {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = "已复制!";
        btn.style.background = "#4caf50";

        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = "";
        }, 2000);
      } else {
        alert("已复制到剪贴板");
      }
    })
    .catch((err) => {
      console.error("复制失败:", err);
      alert("复制失败，请手动复制");
    });
}

// 显示设计图名称
function displayDesignName(data) {
  const designNameEl = document.getElementById("designName");

  // 尝试从 URL 或页面标题获取设计图名称
  let designName = "Figma 设计图";

  if (data.figmaUrl) {
    try {
      const url = new URL(data.figmaUrl);
      // 从 URL 路径中提取名称
      const pathParts = url.pathname.split("/");
      const fileName = pathParts[pathParts.length - 1];
      if (fileName && fileName !== "design") {
        designName = decodeURIComponent(fileName);
      }
    } catch (e) {
      // 如果解析失败，使用默认名称
    }
  }

  // 也可以从页面标题获取
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].title) {
      const title = tabs[0].title;
      if (title && title !== "Figma") {
        designName = title.split(" – ")[0] || title;
      }
    }
    designNameEl.textContent = designName;
  });

  designNameEl.textContent = designName;
}

// 显示 MCP 信息
function displayMCPInfo(mcpInfo) {
  const container = document.getElementById("mcpContainer");

  if (!mcpInfo || !mcpInfo.figmaUrl) {
    container.innerHTML = '<div class="empty-state">未找到 MCP 信息</div>';
    return;
  }

  const mcpUrl = mcpInfo.figmaUrl || mcpInfo.fullUrl || "";

  container.innerHTML = `
    <div class="mcp-link">
      <a href="${mcpUrl}" target="_blank" class="mcp-link-text" title="${mcpUrl}">
        ${mcpUrl}
      </a>
      <button class="copy-btn" data-action="copy-mcp-url" data-url="${escapeHtml(
    mcpUrl
  )}">复制</button>
    </div>
    ${mcpInfo.promptText
      ? `<div style="margin-top: 8px; font-size: 12px; color: #666;">提示: ${mcpInfo.promptText}</div>`
      : ""
    }
    ${mcpInfo.nodeId
      ? `<div style="margin-top: 4px; font-size: 11px; color: #999;">Node ID: ${mcpInfo.nodeId}</div>`
      : ""
    }
  `;

  // 绑定复制按钮事件
  const copyBtn = container.querySelector('button[data-action="copy-mcp-url"]');
  if (copyBtn) {
    copyBtn.addEventListener("click", (e) => {
      const url = copyBtn.getAttribute("data-url");
      if (url) {
        copyToClipboard(url, e);
      }
    });
  }
}

// 显示代码信息
function displayCodeInfo(codeInfo) {
  const container = document.getElementById("codeContainer");

  if (!codeInfo) {
    container.innerHTML = '<div class="empty-state">未找到代码</div>';
    return;
  }

  // 检查是否有 fullCode 或 code 字段
  const code = codeInfo.fullCode || codeInfo.code || "";
  if (!code || (typeof code === "string" && code.trim() === "")) {
    container.innerHTML = '<div class="empty-state">未找到代码</div>';
    return;
  }

  const language = codeInfo.language || "unknown";
  const lineCount = codeInfo.lines
    ? codeInfo.lines.length
    : code.split("\n").length;

  container.innerHTML = `
    <div class="code-info">
      <div class="code-info-item">
        <span>语言:</span>
        <strong>${language}</strong>
      </div>
      <div class="code-info-item">
        <span>行数:</span>
        <strong>${lineCount}</strong>
      </div>
    </div>
    <div class="code-preview">${escapeHtml(code)}</div>
  `;
}

// 显示图片资源（显示统计信息和可选择的卡片列表）
async function displayImages(resources, mcpData = null) {
  const container = document.getElementById("imagesContainer");

  // 1. 从 content script 读取的资源（不再显示）
  let images = [];
  if (resources && resources.length > 0) {
    images = resources.filter((r) => r.type === "image" || r.type === "icon");
  }

  // 2. 从 MCP 数据中提取图片节点
  let mcpImageNodes = [];
  if (mcpData && window.MCPImageProcessor) {
    try {
      // 提取图片节点（PNG 图片和按 Group 分组的图标），不过滤不可见节点
      mcpImageNodes = window.MCPImageProcessor.extractImageNodes(mcpData, {
        deduplicateByImageRef: false, // 不去重，显示所有图片
        excludeTypes: [], // 可以排除某些类型，如 ['FRAME', 'GROUP']
        includeTypes: [], // 可以只包含某些类型，如 ['IMAGE', 'VECTOR']
      });
      console.log(
        "从 MCP 数据中提取到图片节点（PNG + Group 图标，已过滤不可见）:",
        mcpImageNodes
      );
      // 存储所有 MCP 图片节点供后续使用（包括 PNG 和 Group 图标）
      window.currentMCPImageNodes = mcpImageNodes;
    } catch (error) {
      console.error("提取 MCP 图片节点失败:", error);
    }
  }

  // 存储图片数据供后续使用
  window.currentImageResources = images.filter(
    (img) => img.source === "assets-panel"
  );
  // 存储所有 MCP 图片节点（包括 PNG 和 SVG Icon）
  window.currentMCPImageNodes = mcpImageNodes;

  // 统计 MCP 提取的资源
  // PNG 节点：有 imageRef 的，或者有 exportSettings 的（即使没有 imageRef）
  const pngNodes = mcpImageNodes.filter(
    (n) => n.resourceType === "PNG" && (n.imageRef || n.hasExportSettings)
  );
  // GROUP 类型的节点（通常是 SVG 图标）
  const groupNodes = mcpImageNodes.filter((n) => n.type === "GROUP");
  const pngCount = pngNodes.length;
  const groupCount = groupNodes.length;
  const totalCount = pngCount + groupCount;

  // 调试日志：输出统计信息
  console.log('[displayImages] 资源统计:', {
    totalNodes: mcpImageNodes.length,
    pngNodes: pngNodes.length,
    groupNodes: groupNodes.length,
    totalCount: totalCount,
    nodesDetail: mcpImageNodes.map(n => ({
      id: n.id,
      name: n.name,
      type: n.type,
      resourceType: n.resourceType,
      hasImageRef: !!n.imageRef,
      hasExportSettings: n.hasExportSettings
    }))
  });

  // 如果没有找到资源，显示空状态并提供导出 JSON 选项
  if (totalCount === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div style="margin-bottom: 12px;">未找到静态资源（PNG/SVG）</div>
        <div style="font-size: 12px; color: #666; margin-bottom: 16px;">
          当前图层不包含图片资源，但可以导出代码和设计数据
        </div>
        <button id="export-json-no-images-btn" class="primary-btn" style="width: 100%;">
          直接导出处理结果 JSON
        </button>
      </div>
    `;

    // 绑定导出按钮事件
    const exportBtn = document.getElementById("export-json-no-images-btn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        handleExportJsonNoImages();
      });
    }

    // 重置选择状态
    window.imageSelectionState = {};
    return;
  }

  // 重置并初始化选择状态（默认全选）
  // 每次显示新数据时都重置选择状态，避免切换图层时保留旧状态
  window.imageSelectionState = {};
  mcpImageNodes.forEach((node, index) => {
    window.imageSelectionState[index] = true; // 默认全选
  });

  // 显示统计信息和可选择的卡片列表
  let html = `
    <div class="resource-stats-container">
      <div class="resource-stats-header">
        <div class="resource-stats-title">资源统计</div>
        <div class="resource-stats-numbers">
          <span class="stat-item stat-png">PNG: <strong>${pngCount}</strong></span>
          <span class="stat-item stat-svg">SVG: <strong>${groupCount}</strong></span>
          <span class="stat-item stat-total">总计: <strong>${totalCount}</strong></span>
        </div>
      </div>
      <div class="resource-stats-actions">
        <button id="select-all-images-btn" class="action-btn action-btn-primary">全选</button>
        <button id="deselect-all-images-btn" class="action-btn action-btn-secondary">全不选</button>
        <span class="selected-count-text">
          已选择: <strong id="selected-count" class="selected-count-value">${totalCount}</strong> / ${totalCount}
        </span>
      </div>
    </div>
    <div class="images-grid" style="max-height: 400px; overflow-y: auto; padding-right: 2px;">
      ${mcpImageNodes
      .map((node, index) => {
        const displayName = node.name || `resource_${index + 1}`;
        const resourceTypeLabel = node.type === "GROUP" ? "SVG" : "PNG";
        const resourceTypeColor =
          node.type === "GROUP" ? "#667eea" : "#4caf50";
        const isSelected = window.imageSelectionState[index] !== false; // 默认选中
        const nodeId = node.id.replace(/:/g, "-");

        return `
        <div class="image-item-selectable ${isSelected ? "selected" : ""
          }" data-node-index="${index}" data-node-id="${nodeId}" style="border-color: ${isSelected ? resourceTypeColor : "#e0e0e0"
          };">
          <div style="display: flex; align-items: start; gap: 4px;">
            <input 
              type="checkbox" 
              class="image-checkbox" 
              data-node-index="${index}"
              ${isSelected ? "checked" : ""}
              style="margin-top: 1px; cursor: pointer; width: 12px; height: 12px; flex-shrink: 0; accent-color: ${resourceTypeColor};"
            >
            <div style="flex: 1; min-width: 0; overflow: hidden;">
              <div style="display: flex; align-items: center; gap: 3px; margin-bottom: 3px;">
                <span style="font-size: 8px; padding: 1px 4px; background: ${resourceTypeColor}; color: white; border-radius: 2px; font-weight: 600; white-space: nowrap; line-height: 1.2;">${resourceTypeLabel}</span>
              </div>
              <div style="font-weight: 600; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #1e293b; margin-bottom: 2px; line-height: 1.2;" title="${displayName}">${escapeHtml(
            displayName
          )}</div>
              <div style="font-size: 8px; color: #64748b; margin-bottom: 1px; line-height: 1.1;">
                ${node.width || "?"} × ${node.height || "?"}
              </div>
              ${node.imageRef
            ? `<div style="font-size: 7px; color: #667eea; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'Courier New', monospace; line-height: 1.1;" title="${node.imageRef
            }">${node.imageRef.substring(0, 10)}...</div>`
            : ""
          }
            </div>
          </div>
        </div>
      `;
      })
      .join("")}
    </div>
  `;

  container.innerHTML = html;

  // 绑定全选/全不选按钮
  const selectAllBtn = document.getElementById("select-all-images-btn");
  const deselectAllBtn = document.getElementById("deselect-all-images-btn");

  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      mcpImageNodes.forEach((_, index) => {
        window.imageSelectionState[index] = true;
      });
      updateImageSelectionUI();
    });
  }

  if (deselectAllBtn) {
    deselectAllBtn.addEventListener("click", () => {
      mcpImageNodes.forEach((_, index) => {
        window.imageSelectionState[index] = false;
      });
      updateImageSelectionUI();
    });
  }

  // 使用事件委托处理卡片点击和复选框点击（避免 CSP 问题）
  container.addEventListener("click", (e) => {
    const card = e.target.closest(".image-item-selectable");
    if (card) {
      const index = parseInt(card.getAttribute("data-node-index"));
      if (!isNaN(index)) {
        toggleImageSelection(index);
      }
    }

    const checkbox = e.target.closest(".image-checkbox");
    if (checkbox) {
      e.stopPropagation();
      const index = parseInt(checkbox.getAttribute("data-node-index"));
      if (!isNaN(index)) {
        toggleImageSelection(index);
      }
    }
  });
}

// 切换图片选择状态
function toggleImageSelection(index) {
  if (window.imageSelectionState) {
    window.imageSelectionState[index] = !window.imageSelectionState[index];
    updateImageSelectionUI();
  }
}

// 更新图片选择 UI
function updateImageSelectionUI() {
  const mcpImageNodes = window.currentMCPImageNodes || [];
  const selectedCount = Object.values(window.imageSelectionState || {}).filter(
    Boolean
  ).length;

  // 更新选中数量
  const selectedCountEl = document.getElementById("selected-count");
  if (selectedCountEl) {
    selectedCountEl.textContent = selectedCount;
  }

  // 更新所有复选框和卡片样式
  mcpImageNodes.forEach((node, index) => {
    const isSelected = window.imageSelectionState[index] !== false;
    const checkbox = document.querySelector(
      `.image-checkbox[data-node-index="${index}"]`
    );
    const card = document.querySelector(
      `.image-item-selectable[data-node-index="${index}"]`
    );

    if (checkbox) {
      checkbox.checked = isSelected;
    }

    if (card) {
      const resourceTypeColor = node.type === "GROUP" ? "#667eea" : "#4caf50";
      card.style.borderColor = isSelected ? resourceTypeColor : "#e0e0e0";
      if (isSelected) {
        card.classList.add("selected");
      } else {
        card.classList.remove("selected");
      }
      card.style.boxShadow = isSelected
        ? "0 2px 4px rgba(0,0,0,0.1)"
        : "0 1px 2px rgba(0,0,0,0.05)";
    }
  });
}

// 处理图片操作事件（事件委托）
function handleImageAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.getAttribute("data-action");
  const index = button.getAttribute("data-index");
  const url = button.getAttribute("data-url");

  switch (action) {
    case "download":
      if (index !== null) {
        downloadImage(parseInt(index), event);
      }
      break;
    case "upload":
      if (index !== null) {
        uploadImage(parseInt(index), event);
      }
      break;
    case "copy":
      if (url) {
        copyToClipboard(url, event);
      }
      break;
  }
}

// 显示图层信息
function displayLayerInfo(data) {
  const container = document.getElementById("layer-info-container");
  const content = document.getElementById("layer-info-content");

  if (!container || !content) return;

  const mcpData = data.mcpInfo?.raw || data.raw || null;
  if (!mcpData) {
    container.style.display = "none";
    return;
  }

  let html = "";

  // 基本信息
  if (mcpData.name) {
    html += `<div><strong>名称:</strong> ${escapeHtml(mcpData.name)}</div>`;
  }

  if (mcpData.type) {
    html += `<div><strong>类型:</strong> ${escapeHtml(mcpData.type)}</div>`;
  }

  // 尺寸信息
  if (mcpData.absoluteBoundingBox) {
    const { width, height, x, y } = mcpData.absoluteBoundingBox;
    html += `<div><strong>尺寸:</strong> ${Math.round(width)} × ${Math.round(
      height
    )}</div>`;
    html += `<div><strong>位置:</strong> (${Math.round(x)}, ${Math.round(
      y
    )})</div>`;
  }

  // Node ID
  if (data.mcpInfo?.nodeId) {
    html += `<div><strong>Node ID:</strong> <code style="font-size: 10px; background: #e2e8f0; padding: 2px 4px; border-radius: 3px;">${escapeHtml(
      data.mcpInfo.nodeId
    )}</code></div>`;
  }

  // 子节点数量
  if (mcpData.children && Array.isArray(mcpData.children)) {
    html += `<div><strong>子节点:</strong> ${mcpData.children.length} 个</div>`;
  }

  if (html) {
    content.innerHTML = html;
    container.style.display = "block";
  } else {
    container.style.display = "none";
  }
}

// 显示数据到 UI
async function displayData(data) {
  console.log("Displaying data:", data);

  // 显示设计图名称
  displayDesignName(data);

  // 显示图层信息
  displayLayerInfo(data);

  // 显示 MCP 信息
  if (data.mcpInfo) {
    displayMCPInfo(data.mcpInfo);
  }

  // 显示代码信息
  if (data.generatedCode) {
    console.log("Generated code:", data.generatedCode);
    displayCodeInfo(data.generatedCode);
  } else {
    console.log("No generated code found");
    const codeContainer = document.getElementById("codeContainer");
    if (codeContainer) {
      codeContainer.innerHTML = '<div class="empty-state">未找到代码</div>';
    }
  }

  // 显示图片资源
  // 获取 MCP 数据（用于提取图片节点）
  const mcpData = data.mcpInfo?.raw || data.raw || null;

  if (data.staticResources && data.staticResources.length > 0) {
    console.log("Static resources:", data.staticResources);
    await displayImages(data.staticResources, mcpData);
  } else if (mcpData) {
    // 即使没有从 content script 读取到资源，也尝试从 MCP 数据中提取
    console.log("No static resources from content script, trying MCP data");
    await displayImages([], mcpData);
  } else {
    console.log("No static resources found");
    const imagesContainer = document.getElementById("imagesContainer");
    if (imagesContainer) {
      imagesContainer.innerHTML =
        '<div class="empty-state">未找到静态资源</div>';
    }
  }

  // 显示原始数据（如果有）- 只在操作展示tab中显示
  const operationTab = document.getElementById("operation-tab");
  if (operationTab && operationTab.classList.contains("active")) {
    if (data.raw || data.mcpInfo?.raw) {
      showResult(data.raw || data.mcpInfo.raw);
    }
  } else {
    // 如果不在操作展示tab，隐藏这些区域
    const resultSection = document.getElementById("result-section");
    const nodeInfoSection = document.getElementById("node-info-section");
    if (resultSection) resultSection.classList.add("hidden");
    if (nodeInfoSection) nodeInfoSection.classList.add("hidden");
  }

  // 更新一键执行按钮状态
  updateButtonStates();
}

// 显示结果（原始数据）
function showResult(data) {
  const resultSection = document.getElementById("result-section");
  const contentDiv = document.getElementById("result-content");

  if (!resultSection || !contentDiv) return;

  // 创建摘要信息
  let html = '<div class="summary">';

  if (data.name) {
    html += `<p><strong>名称:</strong> ${data.name}</p>`;
  }

  if (data.type) {
    html += `<p><strong>类型:</strong> ${data.type}</p>`;
  }

  if (data.children && data.children.length > 0) {
    html += `<p><strong>子节点数量:</strong> ${data.children.length}</p>`;
  }

  html += "</div>";

  // 添加完整 JSON 数据（可折叠）
  html += '<details class="json-viewer">';
  html += "<summary>查看完整 JSON 数据</summary>";
  html += `<pre><code>${formatData(data)}</code></pre>`;
  html += "</details>";

  contentDiv.innerHTML = html;
  resultSection.classList.remove("hidden");

  // 如果有节点信息，也显示
  if (data.id) {
    showNodeInfo(data);
  }
}

// 显示节点详情
function showNodeInfo(node) {
  const nodeInfoSection = document.getElementById("node-info-section");
  const nodeContentDiv = document.getElementById("node-content");

  if (!nodeInfoSection || !nodeContentDiv) return;

  let html = '<div class="node-details">';

  if (node.absoluteBoundingBox) {
    html += `<p><strong>位置:</strong> x: ${node.absoluteBoundingBox.x}, y: ${node.absoluteBoundingBox.y}</p>`;
    html += `<p><strong>尺寸:</strong> ${node.absoluteBoundingBox.width} × ${node.absoluteBoundingBox.height}</p>`;
  }

  if (node.fills) {
    html += `<p><strong>填充:</strong> ${node.fills.length} 个填充</p>`;
  }

  if (node.strokes) {
    html += `<p><strong>描边:</strong> ${node.strokes.length} 个描边</p>`;
  }

  html += "</div>";

  nodeContentDiv.innerHTML = html;
  nodeInfoSection.classList.remove("hidden");
}

// 确保 content script 已注入
async function ensureContentScriptInjected(tabId) {
  try {
    // 先尝试发送一个 ping 消息检查 content script 是否存在
    await chrome.tabs.sendMessage(tabId, { action: "ping" });
    return true;
  } catch (error) {
    // 如果 content script 不存在，尝试注入它
    console.log("Content script not found, attempting to inject...");
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"],
      });
      // 等待一小段时间让 content script 初始化
      await new Promise((resolve) => setTimeout(resolve, 100));
      return true;
    } catch (injectError) {
      console.error("Failed to inject content script:", injectError);
      throw new Error("无法注入 content script，请确保扩展有足够权限");
    }
  }
}

// 带重试机制的消息发送
async function sendMessageWithRetry(tabId, message, maxRetries = 3) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch (error) {
      lastError = error;
      console.log(`Message send attempt ${i + 1} failed:`, error);

      // 如果是连接错误，等待后重试
      if (
        error.message.includes("Could not establish connection") &&
        i < maxRetries - 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 200 * (i + 1)));
        // 尝试重新注入 content script
        try {
          await ensureContentScriptInjected(tabId);
        } catch (e) {
          console.error("Failed to re-inject content script:", e);
        }
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

// 从当前页面加载 Figma 数据
async function loadFigmaDataFromPage() {
  // 重置所有数据（除了配置）
  resetAllData();

  // 隐藏执行进度
  const progressContainer = document.getElementById(
    "execute-progress-container"
  );
  if (progressContainer) {
    progressContainer.style.display = "none";
  }

  // 检查是否配置了 Figma Access Token
  const configResult = await chrome.storage.sync.get([
    "mcpToken",
    "figmaAccessToken",
    "mcpServer",
    "mcpServerUrl",
  ]);

  const hasToken = configResult.mcpToken || configResult.figmaAccessToken;
  const hasMcpServer = configResult.mcpServer || configResult.mcpServerUrl;

  // 如果没有配置 token 也没有配置 MCP 服务器，则拦截并提示
  if (!hasToken && !hasMcpServer) {
    updateOperationState(OperationState.ERROR, null);
    showError('请先配置 Figma Access Token 或 MCP 服务器地址。请切换到"配置"标签页进行设置。');
    showEmptyState();
    // 自动切换到配置标签页
    const configTabBtn = document.querySelector('.tab-btn[data-tab="config"]');
    const configTab = document.getElementById("config-tab");
    if (configTabBtn && configTab) {
      // 切换标签
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      configTabBtn.classList.add('active');
      configTab.classList.add('active');
    }
    return;
  }

  // 更新操作状态
  updateOperationState(OperationState.LOADING, "refresh");
  showLoading("正在加载...", "准备读取页面数据");

  try {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // 检查是否在 Figma 页面
    if (!tab.url || !tab.url.includes("figma.com")) {
      updateOperationState(OperationState.ERROR, null);
      showError("请先打开 Figma 设计页面");
      showEmptyState();
      return;
    }

    // === 尝试通过 MCP 获取数据（用于显示 MCP 信息）===
    showLoading("正在加载...", "步骤 1/3: 获取 MCP 数据");
    let mcpInfo = null;
    let fileKey, nodeId;

    if (window.MCPClient && window.MCPClient.extractFigmaInfoFromURL) {
      const info = window.MCPClient.extractFigmaInfoFromURL(tab.url);
      fileKey = info.fileKey;
      nodeId = info.nodeId;
    } else {
      const info = extractFigmaInfoFromURL(tab.url);
      fileKey = info.fileKey;
      nodeId = info.nodeId;
    }

    // 尝试获取 MCP 数据（可选，不影响后续流程）
    if (fileKey) {
      try {
        console.log("Attempting to fetch via MCP:", { fileKey, nodeId });
        const mcpResponse = await chrome.runtime.sendMessage({
          action: "fetchFigmaData",
          fileKey,
          nodeId,
        });

        if (mcpResponse.success && mcpResponse.data) {
          console.log("MCP Data fetched successfully:", mcpResponse.data);
          // 获取 MCP 服务器地址并保存到 mcpInfo 中，供后续下载使用
          const mcpConfigResult = await chrome.storage.sync.get([
            "mcpServer",
            "mcpServerUrl",
          ]);
          const mcpServerUrl =
            mcpConfigResult.mcpServerUrl || mcpConfigResult.mcpServer;

          mcpInfo = {
            figmaUrl: tab.url,
            fileKey,
            nodeId,
            raw: mcpResponse.data,
            serverUrl: mcpServerUrl, // 保存服务器地址，供后续下载使用
          };
        } else {
          console.warn("MCP response not successful:", mcpResponse.error);
        }
      } catch (mcpError) {
        console.warn("MCP fetch failed:", mcpError);
      }
    }

    // === 从 Content Script 获取代码和静态资源 ===
    showLoading("正在加载...", "步骤 2/3: 注入并连接 Content Script");
    console.log("Extracting data from content script...");

    // 确保 content script 已注入
    await ensureContentScriptInjected(tab.id);

    showLoading("正在加载...", "步骤 3/3: 提取代码和静态资源");

    // 向 content script 发送消息获取数据（带重试机制）
    const response = await sendMessageWithRetry(
      tab.id,
      {
        action: "extractFigmaData",
      },
      3
    );

    if (response && response.success && response.data) {
      console.log("Content script response:", response.data);

      // 合并 MCP 信息和 content script 数据
      const data = {
        ...response.data,
        figmaUrl: response.data.figmaUrl || tab.url,
        // 如果 MCP 数据存在，使用 MCP 的 mcpInfo，否则使用 content script 的
        mcpInfo: mcpInfo ||
          response.data.mcpInfo || {
          figmaUrl: tab.url,
          nodeId: nodeId,
        },
      };

      currentData = data;
      await displayData(data);

      // 操作成功
      updateOperationState(OperationState.SUCCESS, null);
      showSuccessMessage("数据加载成功！", 3000);
    } else {
      // 即使 content script 失败，如果有 MCP 数据，也显示 MCP 信息
      if (mcpInfo) {
        const data = {
          figmaUrl: tab.url,
          mcpInfo: mcpInfo,
          generatedCode: null,
          staticResources: [],
        };
        currentData = data;
        await displayData(data);
        updateOperationState(OperationState.SUCCESS, null);
        showSuccessMessage("MCP 数据加载成功（部分数据可能缺失）", 3000);
      } else {
        throw new Error(response?.error || "无法获取 Figma 数据");
      }
    }
  } catch (error) {
    console.error("Error loading Figma data:", error);
    let errorMessage = error.message;

    // 提供更友好的错误提示
    if (
      errorMessage.includes("Could not establish connection") ||
      errorMessage.includes("Receiving end does not exist")
    ) {
      errorMessage = "Content script 未加载，请刷新 Figma 页面后重试";
    }

    updateOperationState(OperationState.ERROR, null);
    showError(`加载失败: ${errorMessage}`);
    showEmptyState();
  } finally {
    // 确保按钮状态恢复
    updateOperationState(OperationState.IDLE, null);
  }
}

// 主函数：获取 Figma 数据（通过 URL）
async function fetchFigmaData() {
  const urlInput = document.getElementById("figma-url");
  const url = urlInput.value.trim();

  if (!url) {
    showError("请输入 Figma 链接");
    return;
  }

  // 重置所有数据（除了配置）
  resetAllData();

  // 更新操作状态
  updateOperationState(OperationState.LOADING, "fetch");
  showLoading("正在加载...", "通过 MCP 获取设计文件数据");

  try {
    // 解析 URL
    const { fileKey, nodeId } = parseFigmaUrl(url);

    if (!fileKey) {
      throw new Error("无法从 URL 中提取文件密钥");
    }

    // 发送消息到 background script
    const response = await chrome.runtime.sendMessage({
      action: "fetchFigmaData",
      fileKey,
      nodeId,
    });

    if (response.error) {
      updateOperationState(OperationState.ERROR, null);
      showError(response.error);
      showEmptyState();
    } else if (response.data) {
      // MCP 数据只用于显示原始数据，不生成代码
      // 代码需要从 content script 读取
      const mcpData = response.data;

      // 获取 MCP 服务器地址并保存到 mcpInfo 中，供后续下载使用
      const mcpConfigResult = await chrome.storage.sync.get([
        "mcpServer",
        "mcpServerUrl",
      ]);
      const mcpServerUrl =
        mcpConfigResult.mcpServerUrl || mcpConfigResult.mcpServer;

      // 构造用于显示的数据对象（不包含生成的代码）
      const displayObj = {
        figmaUrl: url,
        mcpInfo: {
          figmaUrl: url,
          fileKey,
          nodeId,
          raw: mcpData,
          serverUrl: mcpServerUrl, // 保存服务器地址，供后续下载使用
        },
        generatedCode: null, // 不从 MCP 生成代码
        staticResources: [],
        isFromMCP: true,
      };

      currentData = displayObj;
      await displayData(displayObj);

      // 操作成功
      updateOperationState(OperationState.SUCCESS, null);
      showSuccessMessage("MCP 数据加载成功！", 3000);
    } else {
      updateOperationState(OperationState.ERROR, null);
      showError("未收到有效数据");
      showEmptyState();
    }
  } catch (error) {
    updateOperationState(OperationState.ERROR, null);
    showError(`错误: ${error.message}`);
    showEmptyState();
  } finally {
    // 确保按钮状态恢复
    updateOperationState(OperationState.IDLE, null);
  }
}

// Tab 切换功能
function initTabs() {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");

      // 移除所有 active 类
      tabButtons.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      // 添加 active 类到当前 tab
      btn.classList.add("active");
      const targetContent = document.getElementById(`${targetTab}-tab`);
      if (targetContent) {
        targetContent.classList.add("active");
      }

      // 如果切换到已上传图片 tab，加载图片列表
      if (targetTab === "uploaded") {
        loadUploadedImages();
      }

      // 隐藏设计文件信息和节点详情（这些只在操作展示tab中显示）
      if (targetTab !== "operation") {
        const resultSection = document.getElementById("result-section");
        const nodeInfoSection = document.getElementById("node-info-section");
        if (resultSection) resultSection.classList.add("hidden");
        if (nodeInfoSection) nodeInfoSection.classList.add("hidden");
      }
    });
  });
}

// 加载已上传的图片列表
async function loadUploadedImages() {
  const container = document.getElementById("uploadedImagesContainer");
  if (!container) return;

  container.innerHTML = '<div class="loading">正在加载...</div>';

  try {
    // 优先从后端获取历史记录
    const config = await chrome.storage.sync.get(["backendApiUrl"]);
    let uploadedImages = [];

    if (config.backendApiUrl) {
      try {
        const backendRecords = await requestBackendRecords();
        uploadedImages = backendRecords.map((record) => ({
          name: record.sourceUrl?.split("/").pop() || "未命名",
          fileName: record.sourceUrl?.split("/").pop() || "未命名",
          ossUrl: record.remoteUrl,
          width: record.size?.width,
          height: record.size?.height,
          isCompressed: record.isCompressed,
          uploadTime: record.uploadTime,
          sourceUrl: record.sourceUrl,
          sameRecord: record.sameRecord,
        }));
      } catch (error) {
        console.warn("从后端获取记录失败，使用本地记录:", error);
        // 如果后端获取失败，使用本地记录
        uploadedImages = lastProcessResult?.finalData || [];
      }
    } else {
      // 没有配置后端服务，使用本地记录
      uploadedImages = lastProcessResult?.finalData || [];
    }

    if (uploadedImages.length === 0) {
      container.innerHTML =
        '<div class="empty-state">暂无已上传的图片，请先完成批量处理</div>';
      return;
    }

    let html = `
    <div style="margin-bottom: 12px; font-size: 12px; color: #666;">
      共 ${uploadedImages.length} 个已上传的图片
    </div>
    <div class="images-grid">
      ${uploadedImages
        .map((item) => {
          return `
        <div class="image-item">
          <img 
            src="${item.ossUrl}" 
            alt="${item.name || item.fileName || "image"}"
            class="image-preview"
            crossorigin="anonymous"
            data-error-placeholder="加载失败"
          />
          <div class="image-info">
            <div style="font-weight: 500;" title="${item.name || item.fileName || "image"
            }">${escapeHtml(item.name || item.fileName || "未命名")}</div>
            ${item.width && item.height
              ? `<div style="color: #999; font-size: 10px;">${item.width} × ${item.height}</div>`
              : ""
            }
            ${item.imageRef
              ? `<div style="color: #667eea; font-size: 9px; margin-top: 2px;">ImageRef: ${item.imageRef.substring(
                0,
                12
              )}...</div>`
              : ""
            }
            <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">
              <span style="color: #4caf50; font-size: 9px;">✓ 已上传到 OSS</span>
              ${item.isCompressed !== undefined
              ? `<span style="color: ${item.isCompressed ? "#10b981" : "#ef4444"
              }; font-size: 9px; padding: 1px 4px; background: ${item.isCompressed ? "#d1fae5" : "#fee2e2"
              }; border-radius: 2px;">
                      ${item.isCompressed ? "已压缩" : "未压缩"}
                    </span>`
              : ""
            }
              ${item.sameRecord
              ? `<span style="color: #667eea; font-size: 9px; padding: 1px 4px; background: #e0e7ff; border-radius: 2px;">已存在</span>`
              : ""
            }
            </div>
            ${item.uploadTime
              ? `<div style="color: #999; font-size: 9px; margin-top: 2px;">${item.uploadTime}</div>`
              : ""
            }
            <div class="image-url" title="${item.ossUrl}">${truncateUrl(
              item.ossUrl,
              30
            )}</div>
            <div style="margin-top: 6px;">
              <button 
                class="copy-btn" 
                style="padding: 4px 8px; font-size: 10px; width: 100%;"
                data-action="copy-oss-url"
                data-url="${escapeHtml(item.ossUrl)}"
              >
                复制 OSS 链接
              </button>
            </div>
          </div>
        </div>
      `;
        })
        .join("")}
    </div>
  `;

    container.innerHTML = html;

    // 绑定图片加载错误处理
    container.querySelectorAll(".image-preview").forEach((img) => {
      if (img._errorHandler) {
        img.removeEventListener("error", img._errorHandler);
      }
      const errorHandler = function () {
        const placeholder =
          this.getAttribute("data-error-placeholder") || "加载失败";
        this.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23f0f0f0' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3E${placeholder}%3C/text%3E%3C/svg%3E`;
      };
      img._errorHandler = errorHandler;
      img.addEventListener("error", errorHandler);
    });

    // 绑定复制按钮事件
    container
      .querySelectorAll('button[data-action="copy-oss-url"]')
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const url = btn.getAttribute("data-url");
          if (url) {
            copyToClipboard(url, e);
            // 显示成功提示
            const originalText = btn.textContent;
            btn.textContent = "✓ 已复制";
            btn.style.background = "#10b981";
            setTimeout(() => {
              btn.textContent = originalText;
              btn.style.background = "";
            }, 2000);
          }
        });
      });
  } catch (error) {
    console.error("加载已上传图片失败:", error);
    container.innerHTML = `<div class="empty-state">加载失败: ${error.message}</div>`;
  }
}

// 事件监听
document.addEventListener("DOMContentLoaded", () => {
  // 初始化 Tab 切换
  initTabs();

  // 初始化按钮状态
  updateOperationState(OperationState.IDLE, null);

  const refreshBtn = document.getElementById("refresh-btn");
  const urlInput = document.getElementById("figma-url");

  refreshBtn.addEventListener("click", loadFigmaDataFromPage);

  // 加载保存的配置（优先使用存储的配置，否则使用环境变量默认值）
  chrome.storage.sync.get(["mcpServer", "figmaAccessToken"], (result) => {
    const mcpServerInput = document.getElementById("mcp-server");
    const figmaTokenInput = document.getElementById("figma-token");

    // MCP 服务器地址：存储的配置 > 环境变量 > HTML 默认值
    if (mcpServerInput) {
      mcpServerInput.value =
        result.mcpServer ||
        (window.ENV_CONFIG && window.ENV_CONFIG.MCP_SERVER_URL) ||
        mcpServerInput.value;
    }

    // Figma Token：存储的配置 > 环境变量
    if (figmaTokenInput) {
      figmaTokenInput.value =
        result.figmaAccessToken ||
        (window.ENV_CONFIG && window.ENV_CONFIG.FIGMA_ACCESS_TOKEN) ||
        "";
    }
  });

  // 保存 MCP 服务器地址
  const mcpServerInput = document.getElementById("mcp-server");
  mcpServerInput.addEventListener("change", () => {
    chrome.storage.sync.set({ mcpServer: mcpServerInput.value });
  });

  // 保存 Figma Access Token
  const figmaTokenInput = document.getElementById("figma-token");
  figmaTokenInput.addEventListener("change", () => {
    chrome.storage.sync.set({ figmaAccessToken: figmaTokenInput.value });
  });

  // 加载配置（优先使用存储的配置，否则使用环境变量默认值）
  chrome.storage.sync.get(
    [
      "ossUploadUrl",
      "ossSystemCode",
      "ossBelongCode",
      "ossBelongID",
      "backendApiUrl",
      "tinyPngKey",
    ],
    (result) => {
      const envConfig = window.ENV_CONFIG || {};

      // OSS 配置：存储的配置 > 环境变量 > HTML 默认值
      const ossUploadUrlEl = document.getElementById("oss-upload-url");
      if (ossUploadUrlEl) {
        ossUploadUrlEl.value =
          result.ossUploadUrl ||
          envConfig.OSS_UPLOAD_URL ||
          ossUploadUrlEl.value;
      }

      const ossSystemCodeEl = document.getElementById("oss-system-code");
      if (ossSystemCodeEl) {
        ossSystemCodeEl.value =
          result.ossSystemCode ||
          envConfig.OSS_SYSTEM_CODE ||
          ossSystemCodeEl.value;
      }

      const ossBelongCodeEl = document.getElementById("oss-belong-code");
      if (ossBelongCodeEl) {
        ossBelongCodeEl.value =
          result.ossBelongCode ||
          envConfig.OSS_BELONG_CODE ||
          ossBelongCodeEl.value;
      }

      const ossBelongIDEl = document.getElementById("oss-belong-id");
      if (ossBelongIDEl) {
        ossBelongIDEl.value =
          result.ossBelongID || envConfig.OSS_BELONG_ID || ossBelongIDEl.value;
      }

      // 后端服务配置：存储的配置 > 环境变量 > 默认值
      const backendApiUrlEl = document.getElementById("backend-api-url");
      if (backendApiUrlEl) {
        backendApiUrlEl.value =
          result.backendApiUrl || envConfig.BACKEND_API_URL || "";
      }

      const tinyPngKeyEl = document.getElementById("tiny-png-key");
      if (tinyPngKeyEl) {
        tinyPngKeyEl.value =
          result.tinyPngKey || envConfig.TINYPNG_API_KEY || "";
      }

      // 默认使用后端服务（已移除复选框，始终使用后端服务）
    }
  );

  // 保存配置的函数
  function saveOSSConfig() {
    const config = {};

    // OSS 配置
    const ossInputs = [
      "oss-upload-url",
      "oss-system-code",
      "oss-belong-code",
      "oss-belong-id",
    ];
    ossInputs.forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.value) {
        // 转换格式：oss-upload-url -> ossUploadUrl
        const key = id
          .replace("oss-", "")
          .split("-")
          .map((part, i) =>
            i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
          )
          .join("");
        config[`oss${key.charAt(0).toUpperCase() + key.slice(1)}`] = el.value;
      }
    });

    // 后端服务配置
    const backendApiUrlEl = document.getElementById("backend-api-url");
    if (backendApiUrlEl) {
      config.backendApiUrl = backendApiUrlEl.value.trim() || null;
    }

    const tinyPngKeyEl = document.getElementById("tiny-png-key");
    if (tinyPngKeyEl) {
      config.tinyPngKey = tinyPngKeyEl.value.trim() || null;
    }

    chrome.storage.sync.set(config, () => {
      const statusEl = document.getElementById("ossConfigStatus");
      if (statusEl) {
        statusEl.textContent = "配置已保存";
        statusEl.className = "config-status success";
        statusEl.style.display = "block";
        setTimeout(() => {
          statusEl.style.display = "none";
        }, 2000);
      }
    });
  }

  // 保存 OSS 配置（输入框 change 事件）
  const ossInputs = [
    "oss-upload-url",
    "oss-system-code",
    "oss-belong-code",
    "oss-belong-id",
  ];
  ossInputs.forEach((inputId) => {
    const input = document.getElementById(inputId);
    if (input) {
      input.addEventListener("change", saveOSSConfig);
    }
  });

  // 保存 OSS 配置按钮
  const saveOSSConfigBtn = document.getElementById("save-oss-config-btn");
  if (saveOSSConfigBtn) {
    saveOSSConfigBtn.addEventListener("click", saveOSSConfig);
  }

  // 绑定"上传转换列表"按钮
  const processBtn = document.getElementById("process-mcp-images-btn");
  if (processBtn) {
    processBtn.addEventListener("click", handleProcessMCPImages);
  }

  const exportBtn = document.getElementById("export-json-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", handleExportJson);
  }

  // 刷新已上传图片列表按钮
  const refreshUploadedBtn = document.getElementById("refresh-uploaded-btn");
  if (refreshUploadedBtn) {
    refreshUploadedBtn.addEventListener("click", () => {
      loadUploadedImages();
    });
  }
});

// 批量处理 MCP 图片（下载并上传到 OSS）
async function handleProcessMCPImages() {
  const processBtn = document.getElementById("process-mcp-images-btn");
  const resultContainer = document.getElementById("processResultContainer");
  const resultContent = document.getElementById("processResultContent");

  if (!processBtn || !resultContainer || !resultContent) {
    showError("无法找到处理按钮或结果容器");
    return;
  }

  // 检查是否有 MCP 图片节点
  const mcpImageNodes = window.currentMCPImageNodes || [];
  if (mcpImageNodes.length === 0) {
    // 如果没有图片节点，检查是否有数据（可能只是没有图片，但有代码等其他数据）
    if (!currentData) {
      showError("请先读取 Figma 数据");
      return;
    }
    // 如果有数据但没有图片，提示用户可以直接导出 JSON
    showError(
      "当前图层不包含图片资源，无法进行批量上传。如需导出代码和设计数据，请使用导出 JSON 功能"
    );
    return;
  }

  // 获取选中的图片节点
  const selectedIndices = Object.keys(window.imageSelectionState || {})
    .map(Number)
    .filter((index) => window.imageSelectionState[index] !== false);

  if (selectedIndices.length === 0) {
    showError("请至少选择一个图片进行上传");
    return;
  }

  // 过滤掉 undefined 的节点
  const selectedImageNodes = selectedIndices
    .map((index) => mcpImageNodes[index])
    .filter((node) => node != null);

  if (selectedImageNodes.length === 0) {
    showError("选中的图片节点无效，请重新选择");
    return;
  }

  // 更新操作状态
  updateOperationState(OperationState.LOADING, "process");
  resultContainer.style.display = "none";
  hideError();

  try {
    // 获取 fileKey
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const { fileKey } = extractFigmaInfoFromURL(tab.url);

    if (!fileKey) {
      throw new Error("无法获取 fileKey");
    }

    // 获取 MCP 数据
    const mcpData = currentData?.mcpInfo?.raw || currentData?.raw || null;
    if (!mcpData) {
      throw new Error("无法获取 MCP 数据");
    }

    // 直接使用选中的图片节点，不重新从 MCP 数据中提取
    // 这样可以确保只处理用户勾选的图片
    console.log(
      `准备处理 ${selectedImageNodes.length} 个选中的图片节点（共 ${mcpImageNodes.length} 个）`
    );

    // 获取配置
    const configResult = await chrome.storage.sync.get([
      "ossUploadUrl",
      "ossSystemCode",
      "ossBelongCode",
      "ossBelongID",
      "backendApiUrl",
      "tinyPngKey",
    ]);

    // 默认使用后端服务
    const useBackendService = true; // 始终使用后端服务
    const enableCompression =
      document.getElementById("enable-compression")?.checked || false;

    // 获取图片下载倍率
    const pngScaleSelect = document.getElementById("png-scale");
    const pngScale = pngScaleSelect ? parseFloat(pngScaleSelect.value) : 2;

    // 调试日志：确认获取的 pngScale 值
    console.log(`[popup.js] 获取的 pngScale:`, {
      selectElement: pngScaleSelect ? "存在" : "不存在",
      selectValue: pngScaleSelect?.value,
      parsedValue: pngScale,
      type: typeof pngScale
    });

    if (!configResult.backendApiUrl) {
      throw new Error("请先配置后端 API 地址");
    }

    if (enableCompression && !configResult.tinyPngKey) {
      // 如果启用压缩但没有配置 TinyPNG Key，后端服务会处理压缩
      console.warn("未配置 TinyPNG API Key，压缩功能将由后端服务处理");
    }

    const ossConfig = {
      url: configResult.ossUploadUrl,
      systemCode: configResult.ossSystemCode || "PHARMACY",
      belongCode: configResult.ossBelongCode || "RP",
      belongID: configResult.ossBelongID || "210304103256552626",
      useBackendService: useBackendService,
      backendApiUrl: configResult.backendApiUrl,
      enableCompression: enableCompression,
      tinyPngKey: configResult.tinyPngKey,
    };

    // 始终使用后端服务，不需要检查 OSS 配置

    // MCP 下载函数（直接使用 imageRef 和 nodeId，不需要 MCP 服务器地址）
    const mcpDownloadFn = async (
      fileKey,
      downloadNodes,
      localPath,
      pngScale
    ) => {
      // 调试日志：确认传递给 background 的 pngScale 值
      console.log(`[popup.js] mcpDownloadFn 调用参数:`, {
        fileKey,
        downloadNodesCount: downloadNodes?.length || 0,
        localPath,
        pngScale: pngScale,
        pngScaleType: typeof pngScale
      });

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "downloadFigmaImagesViaMCP",
            data: {
              fileKey,
              nodes: downloadNodes, // 包含 imageRef 和 nodeId
              localPath,
              pngScale: pngScale, // 确保传递 pngScale
            },
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            if (response && response.success) {
              resolve(response.data || []);
            } else {
              reject(new Error(response?.error || "下载失败"));
            }
          }
        );
      });
    };

    // 使用 @figma-mcp-image-processor 处理图片
    if (
      !window.MCPImageProcessor ||
      !window.MCPImageProcessor.processMCPImages
    ) {
      throw new Error("MCP 图片处理器未加载");
    }

    console.log("开始批量处理 MCP 图片...", selectedImageNodes.length);

    // 显示处理进度提示
    const processResultContent = document.getElementById(
      "processResultContent"
    );
    if (processResultContent) {
      processResultContent.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <div class="spinner"></div>
          <div style="margin-top: 12px; color: #666;">准备处理 ${selectedImageNodes.length
        } 个图片...</div>
          <div style="margin-top: 8px; font-size: 12px; color: #999;">
            下载图片 (${pngScale}x) → 上传到后端服务 → 生成结果
            ${enableCompression ? "（启用压缩）" : ""}
          </div>
          <div id="upload-progress" style="margin-top: 16px; font-size: 12px; color: #667eea;">
            <div>下载进度: <span id="download-current">0</span> / <span id="download-total">${selectedImageNodes.length
        }</span></div>
            <div style="margin-top: 8px;">上传进度: <span id="upload-current">0</span> / <span id="upload-total">${selectedImageNodes.length
        }</span></div>
            <div style="margin-top: 8px; color: #999;">剩余: <span id="upload-remaining">${selectedImageNodes.length
        }</span> 个</div>
          </div>
        </div>
      `;
      resultContainer.style.display = "block";
    }

    // 创建进度回调函数
    let downloadProgress = 0;
    let uploadProgress = 0;
    const totalFiles = selectedImageNodes.length;

    const updateProgress = (current, total, phase = "upload") => {
      if (phase === "download") {
        downloadProgress = current;
        const downloadCurrentEl = document.getElementById("download-current");
        if (downloadCurrentEl) downloadCurrentEl.textContent = current;
      } else {
        uploadProgress = current;
        const uploadCurrentEl = document.getElementById("upload-current");
        const remainingEl = document.getElementById("upload-remaining");
        if (uploadCurrentEl) uploadCurrentEl.textContent = current;
        if (remainingEl) remainingEl.textContent = Math.max(0, total - current);
      }
    };

    // 直接使用选中的图片节点进行处理
    // selectedImageNodes 已经是提取好的图片节点（包含 resourceType、imageRef 等属性）
    // 直接传递给 processMCPImages，它会识别这些是已提取的节点并直接使用
    const selectedMCPData = {
      nodes: selectedImageNodes, // 直接使用已提取的图片节点，不传递 raw
    };

    // 使用选中的节点数据，传递进度回调
    // 注意：processMCPImages 会从 mcpData 中提取节点，所以我们需要确保 selectedMCPData 只包含选中的节点
    const result = await window.MCPImageProcessor.processMCPImages(
      selectedMCPData,
      {
        fileKey,
        pngScale: pngScale, // 使用用户选择的倍率
        ossConfig: ossConfig,
        useImageRefAsFileName: true,
        mcpDownloadFn: mcpDownloadFn,
        onProgress: updateProgress, // 传递进度回调
      }
    );

    console.log("处理完成:", result);

    // 组装最终数据（包含完整的图片节点信息）
    const finalData = result.uploadResults.map((uploadResult) => {
      // 找到对应的图片节点（优先使用 nodeId，其次 imageRef）
      const imageNode = result.imageNodes.find((node) => {
        const normalizedId = node.id?.replace(/:/g, "-");
        return (
          (normalizedId && normalizedId === uploadResult.nodeId) ||
          (node.imageRef && node.imageRef === uploadResult.imageRef)
        );
      });

      return {
        id: uploadResult.nodeId,
        nodeId: uploadResult.nodeId,
        imageRef: uploadResult.imageRef,
        fileName: uploadResult.originalFileName,
        ossUrl: uploadResult.ossUrl,
        // 尺寸信息
        width: uploadResult.width || imageNode?.width,
        height: uploadResult.height || imageNode?.height,
        // 基本信息
        name: imageNode?.name || uploadResult.originalFileName,
        type: imageNode?.type,
        // 位置信息
        x: imageNode?.x,
        y: imageNode?.y,
        // 布局信息
        layout: imageNode?.layout,
        // 图片填充信息
        imageFill: imageNode?.imageFill,
        // 其他属性
        opacity: imageNode?.opacity,
        visible: imageNode?.visible,
        locked: imageNode?.locked,
        rotation: imageNode?.rotation,
        borderRadius: imageNode?.borderRadius,
        // 上传相关信息
        isCompressed: uploadResult.isCompressed,
        sameRecord: uploadResult.sameRecord,
        // 完整节点信息（可选，用于调试）
        // raw: imageNode?.raw,
      };
    });

    lastProcessResult = {
      finalData,
      processResult: result,
      timestamp: Date.now(),
    };

    // 显示结果
    displayProcessResult(finalData, result);

    // 显示结果容器
    resultContainer.style.display = "block";

    // 操作成功
    updateOperationState(OperationState.SUCCESS, null);
    showSuccessMessage(`成功处理 ${finalData.length} 个图片！`, 3000);

    // 如果当前在已上传图片 tab，刷新列表
    const uploadedTab = document.getElementById("uploaded-tab");
    if (uploadedTab && uploadedTab.classList.contains("active")) {
      loadUploadedImages();
    }

    // 返回处理结果，供调用者使用
    return {
      success: true,
      finalData,
      result,
    };
  } catch (error) {
    console.error("批量处理 MCP 图片失败:", error);
    updateOperationState(OperationState.ERROR, null);
    showError(`处理失败: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    // 确保按钮状态恢复
    updateOperationState(OperationState.IDLE, null);
  }
}

// 显示处理结果
function displayProcessResult(finalData, processResult) {
  const resultContent = document.getElementById("processResultContent");
  if (!resultContent) return;

  if (finalData.length === 0) {
    resultContent.innerHTML = '<div class="empty-state">未找到处理结果</div>';
    return;
  }

  let html = `
    <div style="margin-bottom: 12px; font-size: 12px; color: #666;">
      成功处理 ${finalData.length} 个图片
    </div>
    <div class="images-grid">
      ${finalData
      .map((item) => {
        return `
        <div class="image-item">
          <img 
            src="${item.ossUrl}" 
            alt="${item.name}"
            class="image-preview"
            crossorigin="anonymous"
            data-error-placeholder="加载失败"
          />
          <div class="image-info">
            <div style="font-weight: 500;" title="${item.name}">${escapeHtml(
          item.name
        )}</div>
            ${item.width && item.height
            ? `<div style="color: #999; font-size: 10px;">${item.width} × ${item.height}</div>`
            : ""
          }
            ${item.imageRef
            ? `<div style="color: #667eea; font-size: 9px; margin-top: 2px;">ImageRef: ${item.imageRef.substring(
              0,
              12
            )}...</div>`
            : ""
          }
            <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px; flex-wrap: wrap;">
              <span style="color: #4caf50; font-size: 9px;">✓ 已上传到 OSS</span>
              ${item.isCompressed !== undefined
            ? `<span style="color: ${item.isCompressed ? "#10b981" : "#ef4444"
            }; font-size: 9px; padding: 1px 4px; background: ${item.isCompressed ? "#d1fae5" : "#fee2e2"
            }; border-radius: 2px;">
                      ${item.isCompressed ? "已压缩" : "未压缩"}
                    </span>`
            : ""
          }
              ${item.sameRecord
            ? `<span style="color: #667eea; font-size: 9px; padding: 1px 4px; background: #e0e7ff; border-radius: 2px;">已存在</span>`
            : ""
          }
            </div>
            <div class="image-url" title="${item.ossUrl}">${truncateUrl(
            item.ossUrl,
            30
          )}</div>
            <div style="margin-top: 6px;">
              <button 
                class="copy-btn" 
                style="padding: 4px 8px; font-size: 10px;"
                data-action="copy"
                data-url="${escapeHtml(item.ossUrl)}"
              >
                复制 OSS 链接
              </button>
            </div>
          </div>
        </div>
      `;
      })
      .join("")}
    </div>
    <div style="margin-top: 16px; padding: 12px; background: #f5f5f5; border-radius: 6px; font-size: 12px;">
      <div style="font-weight: 500; margin-bottom: 8px;">处理结果数据（JSON）:</div>
      <pre style="background: white; padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 11px; max-height: 200px; overflow-y: auto;">${escapeHtml(
        JSON.stringify(finalData, null, 2)
      )}</pre>
      <button 
        class="copy-btn" 
        style="margin-top: 8px; padding: 4px 8px; font-size: 10px;"
        data-action="copy-json"
        data-json='${escapeHtml(JSON.stringify(finalData, null, 2))}'
      >
        复制 JSON 数据
      </button>
    </div>
  `;

  resultContent.innerHTML = html;

  // 绑定图片加载错误处理
  resultContent.querySelectorAll(".image-preview").forEach((img) => {
    if (img._errorHandler) {
      img.removeEventListener("error", img._errorHandler);
    }
    const errorHandler = function () {
      const placeholder =
        this.getAttribute("data-error-placeholder") || "加载失败";
      this.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23f0f0f0' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3E${placeholder}%3C/text%3E%3C/svg%3E`;
    };
    img._errorHandler = errorHandler;
    img.addEventListener("error", errorHandler);
  });

  // 绑定复制按钮事件
  resultContent
    .querySelectorAll('button[data-action="copy"]')
    .forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const url = btn.getAttribute("data-url");
        if (url) {
          copyToClipboard(url, e);
        }
      });
    });

  // 绑定复制 JSON 按钮事件
  resultContent
    .querySelectorAll('button[data-action="copy-json"]')
    .forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const json = btn.getAttribute("data-json");
        if (json) {
          copyToClipboard(json, e);
        }
      });
    });
}

function buildExportPayload() {
  const mcpData = currentData?.mcpInfo?.raw || currentData?.raw || null;
  const figmaUrl =
    currentData?.figmaUrl ||
    currentData?.mcpInfo?.figmaUrl ||
    currentData?.mcpInfo?.url ||
    "";

  const codeInfo = currentData?.codeInfo || currentData?.generatedCode || {};

  // 提取代码内容
  // 如果 codeInfo 有 lines 数组，从 lines 中提取 content 字段组合成完整代码
  let codeContent = "";
  if (
    codeInfo.lines &&
    Array.isArray(codeInfo.lines) &&
    codeInfo.lines.length > 0
  ) {
    // 从 lines 数组中提取 content 字段，组合成完整的代码
    codeContent = codeInfo.lines
      .map((line) => {
        // 优先使用 content 字段，如果没有则使用其他字段
        return line.content || line.text || line.code || "";
      })
      .join("\n");
  } else {
    // 如果没有 lines 数组，使用原有的字段
    codeContent =
      currentData?.codePreview ||
      codeInfo.fullCode ||
      codeInfo.code ||
      codeInfo.content ||
      codeInfo.preview ||
      "";
  }

  const processedImages = lastProcessResult?.finalData || [];
  const rawImageNodes =
    lastProcessResult?.processResult?.imageNodes ||
    window.currentMCPImageNodes ||
    [];

  return {
    generatedAt: new Date().toISOString(),
    design: {
      figmaUrl,
      fileKey: currentData?.mcpInfo?.fileKey || null,
      nodeId: currentData?.mcpInfo?.nodeId || null,
      mcpData,
    },
    code: {
      language: codeInfo.language || "",
      content: codeContent,
    },
    assets: {
      processedImages,
      imageNodes: rawImageNodes,
      uploadResults: lastProcessResult?.processResult?.uploadResults || [],
    },
  };
}

function downloadJsonFile(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const filename = `mcp-export-${Date.now()}.json`;
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

// 导出 JSON（无图片情况）
/**
 * @param {(j: string)=>void} [mcpGetJson] 
 * @returns 
 */
function handleExportJsonNoImages(mcpGetJson) {
  if (!currentData) {
    showError("请先读取 Figma 数据");
    return;
  }

  // 更新操作状态
  updateOperationState(OperationState.LOADING, "export");

  try {
    const payload = buildExportPayload();

    if (mcpGetJson) {
      mcpGetJson(payload);
    }
    else {
      const fileName = downloadJsonFile(payload);

      console.log("JSON 导出成功（无图片）:", fileName);

      showSuccessMessage(`JSON 文件已导出: ${fileName}`, 3000);
    }
    // 操作成功
    updateOperationState(OperationState.SUCCESS, null);
  } catch (error) {
    console.error("导出 JSON 失败:", error);
    updateOperationState(OperationState.ERROR, null);
    showError(`导出失败: ${error.message}`);
  } finally {
    // 确保按钮状态恢复
    updateOperationState(OperationState.IDLE, null);
  }
}

/**
 * @param {(j: string)=>void} [mcpGetJson] 
 * @returns 
 */
function handleExportJson(mcpGetJson) {
  if (!currentData) {
    showError("请先读取 Figma 数据");
    return;
  }

  // 只要有数据就可以导出，不需要等待批量处理完成
  // 如果没有处理结果，直接使用无图片的导出逻辑
  if (!lastProcessResult) {
    handleExportJsonNoImages(mcpGetJson);
    return;
  }

  // 更新操作状态
  updateOperationState(OperationState.LOADING, "export");

  try {
    const payload = buildExportPayload();

    if (mcpGetJson) {
      mcpGetJson(JSON.stringify(payload, null, 2));
    } else {
      const fileName = downloadJsonFile(payload);

      console.log("JSON 导出成功:", fileName);
      // 操作成功
      showSuccessMessage(`JSON 文件已导出: ${fileName}`, 3000);
    }
    updateOperationState(OperationState.SUCCESS, null);
  } catch (error) {
    console.error("导出 JSON 失败:", error);
    updateOperationState(OperationState.ERROR, null);
    showError(`导出失败: ${error.message}`);
  } finally {
    // 确保按钮状态恢复
    updateOperationState(OperationState.IDLE, null);
  }
}

// 下载图片 - 使用 @figma-mcp-image-processor 的 MCP 方法
async function downloadImage(index, event) {
  const images = window.currentImageResources || [];
  const image = images[index];

  if (!image || !image.imageRef) {
    showError("图片没有 imageRef，无法下载");
    return;
  }

  const statusEl = document.querySelector(
    `.image-status[data-status-index="${index}"]`
  );
  if (statusEl) {
    statusEl.textContent = "状态: 下载中...";
  }

  try {
    // 获取 fileKey 和 MCP 数据
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const { fileKey } = extractFigmaInfoFromURL(tab.url);

    if (!fileKey) {
      throw new Error("无法获取 fileKey");
    }

    // 获取 MCP 数据
    const mcpData = currentData?.mcpInfo?.raw || currentData?.raw || null;
    if (!mcpData) {
      throw new Error("无法获取 MCP 数据");
    }

    // 使用 @figma-mcp-image-processor 处理图片下载
    if (
      !window.MCPImageProcessor ||
      !window.MCPImageProcessor.processMCPImages
    ) {
      throw new Error("MCP 图片处理器未加载");
    }

    // 创建只包含当前图片的 MCP 数据
    const singleImageMCPData = {
      nodes: [
        {
          id: image.nodeId || image.id,
          name: image.name,
          type: "IMAGE",
          fills: [
            {
              type: "IMAGE",
              imageRef: image.imageRef,
            },
          ],
          layout: {
            dimensions: {
              width: image.width,
              height: image.height,
            },
          },
        },
      ],
    };

    // 不需要传递 MCP 服务器地址，background 会直接使用已经成功获取 MCP 数据的客户端
    // 因为 MCP 数据已经获取成功，说明 background 中的 mcpClient 已经配置好了

    // MCP 下载函数（通过 background 调用 MCP）
    const mcpDownloadFn = async (
      fileKey,
      downloadNodes,
      localPath,
      pngScale
    ) => {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "downloadFigmaImagesViaMCP",
            data: {
              fileKey,
              nodes: downloadNodes,
              localPath,
              pngScale,
              mcpServerUrl: mcpServerUrl, // 传递 MCP 服务器地址
            },
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            if (response && response.success) {
              // 返回格式: [{ fileName: string, localPath: string, url?: string }]
              resolve(response.data || []);
            } else {
              reject(new Error(response?.error || "下载失败"));
            }
          }
        );
      });
    };

    // 处理图片下载
    const result = await window.MCPImageProcessor.processMCPImages(
      singleImageMCPData,
      {
        fileKey,
        pngScale: 2,
        useImageRefAsFileName: true,
        mcpDownloadFn: mcpDownloadFn,
      }
    );

    // 检查下载结果
    if (result.downloadedImages && result.downloadedImages.length > 0) {
      const downloaded = result.downloadedImages[0];

      // 更新图片 URL 和预览 URL
      if (downloaded.url) {
        // 如果返回的是 data URL，直接使用
        if (downloaded.url.startsWith("data:")) {
          image.url = downloaded.url;
          image.previewUrl = downloaded.url;
        } else if (downloaded.url.startsWith("blob:")) {
          // 如果返回的是 blob URL，直接使用
          image.url = downloaded.url;
          image.previewUrl = downloaded.url;
        } else if (downloaded.localPath) {
          // 如果返回的是 localPath（URL），尝试创建 blob URL
          try {
            const response = await fetch(downloaded.localPath);
            if (response.ok) {
              const blob = await response.blob();
              const blobUrl = URL.createObjectURL(blob);
              image.url = blobUrl;
              image.previewUrl = blobUrl;
            } else {
              // 如果 fetch 失败，使用原始 URL
              image.url = downloaded.url;
              image.previewUrl = downloaded.url;
            }
          } catch (error) {
            console.warn("创建预览 URL 失败:", error);
            // 使用原始 URL
            image.url = downloaded.url;
            image.previewUrl = downloaded.url;
          }
        } else {
          // 直接使用 URL
          image.url = downloaded.url;
          image.previewUrl = downloaded.url;
        }

        // 重新渲染图片项
        const mcpData = currentData?.mcpInfo?.raw || currentData?.raw || null;
        await displayImages(window.currentImageResources || [], mcpData);

        if (statusEl) {
          statusEl.textContent = "状态: 下载成功";
        }
      } else if (downloaded.localPath) {
        // 如果没有 url 但有 localPath，尝试使用 localPath
        try {
          const response = await fetch(downloaded.localPath);
          if (response.ok) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            image.url = blobUrl;
            image.previewUrl = blobUrl;

            // 重新渲染图片项
            const mcpData =
              currentData?.mcpInfo?.raw || currentData?.raw || null;
            await displayImages(window.currentImageResources || [], mcpData);

            if (statusEl) {
              statusEl.textContent = "状态: 下载成功";
            }
          } else {
            throw new Error(`无法读取文件: ${response.status}`);
          }
        } catch (error) {
          throw new Error(`下载失败：无法读取文件 - ${error.message}`);
        }
      } else {
        throw new Error("下载失败：未返回图片 URL 或 localPath");
      }
    } else {
      throw new Error("下载失败：未找到下载结果");
    }
  } catch (error) {
    console.error("下载图片失败:", error);
    if (statusEl) {
      statusEl.textContent = `状态: 下载失败 - ${error.message}`;
    }
    showError(`下载失败: ${error.message}`);
  }
}

// 上传图片到 OSS
async function uploadImage(index, event) {
  const images = window.currentImageResources || [];
  const image = images[index];

  if (!image || !image.imageRef) {
    showError("图片没有 imageRef，无法上传");
    return;
  }

  const statusEl = document.querySelector(
    `.image-status[data-status-index="${index}"]`
  );
  if (statusEl) {
    statusEl.textContent = "状态: 上传中...";
  }

  try {
    // 检查 OSS 配置
    const configResult = await chrome.storage.sync.get([
      "ossUploadUrl",
      "ossSystemCode",
      "ossBelongCode",
      "ossBelongID",
    ]);

    if (!configResult.ossUploadUrl) {
      throw new Error("请先配置 OSS 上传接口地址");
    }

    // 如果图片还没有下载，先下载
    if (!image.url || image.url.startsWith("imageRef:")) {
      if (statusEl) {
        statusEl.textContent = "状态: 正在下载图片...";
      }

      try {
        await downloadImage(index, event);
        // 等待一下让下载完成
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 重新获取图片数据
        const updatedImages = window.currentImageResources || [];
        const updatedImage = updatedImages[index];
        if (
          updatedImage &&
          updatedImage.url &&
          !updatedImage.url.startsWith("imageRef:")
        ) {
          image.url = updatedImage.url;
        } else {
          throw new Error("图片下载失败，无法上传");
        }
      } catch (downloadError) {
        throw new Error(`下载图片失败: ${downloadError.message}`);
      }
    }

    // 再次检查图片 URL
    if (!image.url || image.url.startsWith("imageRef:")) {
      throw new Error("图片尚未下载，无法上传");
    }

    // 上传到 OSS
    const uploadResponse = await chrome.runtime.sendMessage({
      action: "uploadImageToOSS",
      data: {
        file: image.url, // 传递 URL，background 会处理
        fileName: `${image.imageRef}.png`,
        imageRef: image.imageRef,
        nodeId: image.nodeId || image.id,
      },
    });

    if (uploadResponse && uploadResponse.success) {
      // 更新图片的 OSS URL
      image.ossUrl = uploadResponse.data.ossUrl;
      // 重新渲染
      const mcpData = currentData?.mcpInfo?.raw || currentData?.raw || null;
      await displayImages(window.currentImageResources || [], mcpData);

      if (statusEl) {
        statusEl.textContent = "状态: 上传成功";
      }
    } else {
      throw new Error(uploadResponse?.error || "上传失败");
    }
  } catch (error) {
    console.error("上传图片失败:", error);
    if (statusEl) {
      statusEl.textContent = `状态: 上传失败 - ${error.message}`;
    }
    showError(`上传失败: ${error.message}`);
  }
}

// 将函数暴露到全局作用域（保留以兼容旧代码，但主要使用事件委托）
window.copyToClipboard = copyToClipboard;
window.downloadImage = downloadImage;
window.uploadImage = uploadImage;
window.handleImageAction = handleImageAction;
window.toggleImageSelection = toggleImageSelection;
window.handleExportJson = handleExportJson;
window.buildExportPayload = buildExportPayload;
