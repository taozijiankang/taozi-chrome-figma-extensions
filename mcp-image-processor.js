/**
 * Figma MCP 图片处理器
 * 从 figma-mcp-image-processor 包转换而来，用于浏览器环境
 */

/**
 * 从 MCP 数据中提取所有图片节点
 * @param {Object} mcpData - MCP 数据
 * @param {Object} options - 选项
 * @param {boolean} options.deduplicateByImageRef - 是否按 imageRef 去重（默认 true）
 * @param {Array<string>} options.excludeTypes - 要排除的节点类型
 * @param {Array<string>} options.includeTypes - 只包含的节点类型（如果提供，则只提取这些类型）
 */
function extractImageNodes(mcpData, options = {}) {
  const {
    deduplicateByImageRef = true,
    excludeTypes = [],
    includeTypes = [],
  } = options;

  const imageNodes = [];
  const imageRefSet = new Set(); // 用于去重
  const vectorGroups = []; // 存储按 Group 分组的 VECTOR 节点
  const groupHashMap = new Map(); // 记录内容哈希，便于去重

  function normalizeNumber(value, precision = 4) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return 'null';
    }
    return Number(value).toFixed(precision);
  }

  function serializeColor(color) {
    if (!color) return null;
    return {
      r: normalizeNumber(color.r),
      g: normalizeNumber(color.g),
      b: normalizeNumber(color.b),
      a: normalizeNumber(color.a),
    };
  }

  function serializeFill(fill) {
    if (!fill) return null;
    const result = {
      type: fill.type,
      blendMode: fill.blendMode,
      opacity: normalizeNumber(fill.opacity),
    };

    if (fill.color) {
      result.color = serializeColor(fill.color);
    }

    if (fill.gradientStops) {
      result.gradientStops = fill.gradientStops.map((stop) => ({
        position: normalizeNumber(stop.position),
        color: serializeColor(stop.color),
      }));
    }

    if (fill.gradientHandlePositions) {
      result.gradientHandlePositions = fill.gradientHandlePositions.map(
        (pos) => ({
          x: normalizeNumber(pos.x),
          y: normalizeNumber(pos.y),
        })
      );
    }

    if (fill.imageRef) {
      result.imageRef = fill.imageRef;
    }

    return result;
  }

  function serializeVectorForHash(vector) {
    const bbox = vector.absoluteBoundingBox || {};
    return JSON.stringify({
      width: normalizeNumber(bbox.width),
      height: normalizeNumber(bbox.height),
      strokeWeight: normalizeNumber(vector.strokeWeight),
      effects: vector.effects || [],
      fills: (vector.fills || []).map(serializeFill),
    });
  }

  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // 转换为 32 位整数
    }
    return Math.abs(hash).toString(16);
  }

  function generateGroupContentHash(vectors) {
    if (!vectors || vectors.length === 0) return null;
    const signatures = vectors
      .map((vector) => serializeVectorForHash(vector))
      .sort()
      .join('|');
    return simpleHash(signatures);
  }

  // 检查节点是否可见（包括 opacity）
  function isNodeVisible(n) {
    if (n.visible === false) return false;
    if (n.opacity !== undefined && n.opacity <= 0) return false;
    return true;
  }

  // 辅助函数：向上查找 FRAME 父节点
  function findFrameParent(node, parentNode, grandParentNode, mcpData) {
    // 先检查直接父节点
    if (parentNode && parentNode.type === 'FRAME') {
      return parentNode;
    }
    // 再检查祖父节点
    if (grandParentNode && grandParentNode.type === 'FRAME') {
      return grandParentNode;
    }
    // 如果节点有 parentId，尝试从 MCP 数据中查找
    if (node.parentId && mcpData) {
      // 递归查找父节点
      function findNodeById(id, data) {
        if (!data) return null;
        // 检查当前节点
        if (data.id === id) return data;
        // 递归检查子节点
        if (data.children && Array.isArray(data.children)) {
          for (const child of data.children) {
            const found = findNodeById(id, child);
            if (found) return found;
          }
        }
        // 检查 MCP 数据格式：{ nodes: { "id": { document: {...} } } }
        if (data.nodes && typeof data.nodes === 'object') {
          for (const nodeValue of Object.values(data.nodes)) {
            if (nodeValue.document) {
              const found = findNodeById(id, nodeValue.document);
              if (found) return found;
            } else {
              const found = findNodeById(id, nodeValue);
              if (found) return found;
            }
          }
        }
        return null;
      }
      const parent = findNodeById(node.parentId, mcpData);
      if (parent && parent.type === 'FRAME') {
        return parent;
      }
      // 如果父节点不是 FRAME，继续向上查找
      if (parent && parent.parentId) {
        return findFrameParent(parent, null, null, mcpData);
      }
    }
    return null;
  }

  function findImageNodes(node, parentNode = null, grandParentNode = null, depth = 0) {
    // 调试日志：输出处理的节点信息（仅对有 exportSettings 的节点）
    if (node.exportSettings && node.exportSettings.length > 0) {
      const hasPng = node.exportSettings.some(s => s.format === 'PNG' || s.format === 'png');
      if (hasPng) {
        console.log(`[findImageNodes] 处理有 PNG exportSettings 的节点 (depth=${depth}):`, {
          id: node.id,
          name: node.name,
          type: node.type,
          exportSettings: node.exportSettings
        });
      }
    }
    
    // 找到 Group 节点，按 Group 分组 VECTOR
    if (node.type === 'GROUP') {
      const vectors = [];
      const excludedNameKeywords = ["union", "rectangle", "path", "line", "路径"];
      
      // 收集 Group 下的所有 VECTOR
      function collectVectors(n) {
        if (!n) return;
        if (n.type === 'VECTOR' && isNodeVisible(n)) {
          const shouldExclude = n.name && excludedNameKeywords.some(
            keyword => n.name.toLowerCase().includes(keyword.toLowerCase())
          );
          if (!shouldExclude && (!n.children || n.children.length === 0)) {
            vectors.push(n);
          }
        }
        if (n.children && Array.isArray(n.children)) {
          n.children.forEach(child => collectVectors(child));
        }
      }
      
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => collectVectors(child));
      }
      
      // 检查 Group 是否可见（只检查 Group 本身，不检查父节点）
      // 因为即使父节点不可见，Group 本身可能仍然需要被导出
      const groupVisible = isNodeVisible(node);
      
      if (vectors.length > 0 && groupVisible) {
        const contentHash = generateGroupContentHash(vectors);

        // 找到包含这个 Group 的 Frame（用于导出）
        // 使用辅助函数向上查找 FRAME 父节点
        const frameNode = findFrameParent(node, parentNode, grandParentNode, rootMCPData);
        
        // 如果找到了 Frame，使用它（即使 Frame 不可见也使用，因为 Group 本身可见）
        if (frameNode && frameNode.type === 'FRAME') {
          vectorGroups.push({
            groupId: node.id,
            groupName: node.name || `Group-${node.id}`,
            frameId: frameNode.id,
            frameName: frameNode.name || `Frame-${frameNode.id}`,
            vectors: vectors,
            groupNode: node,
            frameNode: frameNode,
            contentHash,
          });
        } else {
          // 如果找不到 FRAME，使用 Group 本身作为导出节点（使用 Group 的 ID）
          // 这样可以确保所有包含 VECTOR 的 GROUP 都能被提取
          vectorGroups.push({
            groupId: node.id,
            groupName: node.name || `Group-${node.id}`,
            frameId: node.id, // 使用 Group 自己的 ID
            frameName: node.name || `Group-${node.id}`,
            vectors: vectors,
            groupNode: node,
            frameNode: node, // 使用 Group 自己作为 frameNode
            contentHash,
          });
        }
      }
      
      // 继续处理子节点
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach((child) => findImageNodes(child, node, parentNode, depth + 1));
      }
      return;
    }

    // 过滤掉不可见的节点（visible === false）
    if (node.visible === false) {
      // 不可见，跳过（但继续处理子节点）
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach((child) => findImageNodes(child, node, parentNode, depth + 1));
      }
      return;
    }

    // 检查是否为图片类型，或者是否有图片填充（必须在排除检查之前）
    // 因为 RECTANGLE 类型如果有图片填充，应该被提取为 PNG 图片
    const hasImageFill = node.fills?.some(
      (fill) => fill.type === "IMAGE" && fill.imageRef
    );
    
    // 检查是否有 exportSettings 且格式为 PNG（表示需要导出为图片）
    const hasPngExportSettings = node.exportSettings?.some(
      (setting) => setting.format === "PNG" || setting.format === "png"
    );
    
    // 调试日志：输出有 exportSettings 的节点
    if (hasPngExportSettings) {
      console.log(`[extractImageNodes] 发现有 PNG exportSettings 的节点:`, {
        id: node.id,
        name: node.name,
        type: node.type,
        exportSettings: node.exportSettings
      });
    }
    
    const isImageType =
      node.type === "IMAGE" ||
      node.type === "IMAGE-SVG" ||
      (node.type === "RECTANGLE" && hasImageFill) || // RECTANGLE 类型如果有图片填充，也是 PNG 图片
      hasPngExportSettings; // 如果有 PNG 导出设置，也是图片资源
    
    // 如果是有图片填充的节点，先处理图片提取，然后再决定是否继续处理
    // 排除不应该作为 SVG Icon 的基础图形类型
    // UNION, PATH, LINE, BOOLEAN_OPERATION 等不应该被提取为 SVG Icon
    // 注意：RECTANGLE 如果有图片填充，应该被提取，所以从排除列表中移除
    // 注意：如果有 exportSettings 设置为 PNG，不应该被排除
    const excludedSvgTypes = ["UNION", "PATH", "LINE", "BOOLEAN_OPERATION"];
    // 如果是有图片填充的 RECTANGLE 或是有 PNG 导出设置的节点，不应该被排除
    const shouldExclude = excludedSvgTypes.includes(node.type) && !isImageType;
    
    if (shouldExclude) {
      // 这些类型不应该作为 SVG Icon，跳过（但继续处理子节点）
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach((child) => findImageNodes(child, node, parentNode, depth + 1));
      }
      return;
    }

    // 检查节点类型是否应该被排除（用户自定义排除）
    // 但如果是有图片填充的节点，不应该被排除
    if (excludeTypes.length > 0 && excludeTypes.includes(node.type) && !isImageType) {
      // 即使被排除，也要递归处理子节点
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach((child) => findImageNodes(child, node, parentNode, depth + 1));
      }
      return;
    }
    
    // 处理 PNG 图片（有 imageRef 或 exportSettings）
    if (isImageType || hasImageFill || hasPngExportSettings) {
      // 查找 imageRef（PNG 图片）
      let imageRef = null;
      if (node.fills && node.fills.length > 0) {
        const imageFill = node.fills.find(
          (fill) => fill.type === "IMAGE" && fill.imageRef
        );
        if (imageFill) {
          imageRef = imageFill.imageRef || null;
        }
      }

      // PNG 图片：有 imageRef 或 exportSettings 都可以
      // 如果有 exportSettings 但没有 imageRef，说明需要通过 nodeId 导出
      if (imageRef || hasPngExportSettings) {
        // 如果启用去重，检查是否已经存在相同的 imageRef 或 nodeId
        if (deduplicateByImageRef) {
          // 使用 imageRef 或 nodeId 作为去重键
          const dedupeKey = imageRef || node.id;
          if (imageRefSet.has(dedupeKey)) {
            // 已存在，跳过（但继续处理子节点）
            if (node.children && Array.isArray(node.children)) {
              node.children.forEach((child) => findImageNodes(child, node, parentNode, depth + 1));
            }
            return;
          }
          imageRefSet.add(dedupeKey);
        }

        // 提取完整的 imageFill 信息
        const imageFill = node.fills?.find(
          (fill) => fill.type === "IMAGE" && fill.imageRef
        );

        // PNG 图片直接添加到 imageNodes
        const imageNode = {
          id: node.id,
          name: node.name || `image-${node.id}`,
          type: node.type,
          resourceType: 'PNG',
          imageRef: imageRef, // 可能为 null（如果有 exportSettings 但没有 imageRef）
          hasExportSettings: hasPngExportSettings, // 标记是否有 exportSettings
          exportSettings: node.exportSettings, // 保存 exportSettings 信息
          // 尺寸信息（优先使用 absoluteBoundingBox，如果没有则使用 layout）
          width: node.absoluteBoundingBox?.width || node.layout?.dimensions?.width,
          height: node.absoluteBoundingBox?.height || node.layout?.dimensions?.height,
          // 位置信息
          x: node.absoluteBoundingBox?.x || node.layout?.locationRelativeToParent?.x,
          y: node.absoluteBoundingBox?.y || node.layout?.locationRelativeToParent?.y,
          // 绝对边界框
          absoluteBoundingBox: node.absoluteBoundingBox,
          // 布局信息
          layout: {
            dimensions: node.layout?.dimensions,
            locationRelativeToParent: node.layout?.locationRelativeToParent,
            sizing: node.layout?.sizing,
            constraints: node.layout?.constraints,
          },
          // 填充信息（完整）
          fills: node.fills,
          imageFill: imageFill ? {
            type: imageFill.type,
            imageRef: imageFill.imageRef,
            url: imageFill.url,
            scaleMode: imageFill.scaleMode,
            objectFit: imageFill.objectFit,
            opacity: imageFill.opacity,
            blendMode: imageFill.blendMode,
            ...imageFill, // 包含所有其他属性
          } : null,
          // 其他节点属性
          opacity: node.opacity,
          visible: node.visible !== false,
          locked: node.locked,
          rotation: node.rotation,
          borderRadius: node.borderRadius,
          // 样式信息
          effects: node.effects,
          strokes: node.strokes,
          strokeWeight: node.strokeWeight,
          // 父节点信息（如果有）
          parentId: node.parentId,
          // 原始节点数据（保留完整信息）
          raw: node,
        };

        imageNodes.push(imageNode);
        
        // 调试日志：输出成功添加的图片节点
        console.log(`[extractImageNodes] 成功添加图片节点:`, {
          id: imageNode.id,
          name: imageNode.name,
          type: imageNode.type,
          hasImageRef: !!imageNode.imageRef,
          hasExportSettings: imageNode.hasExportSettings
        });
      }
    }

    // 递归处理子节点
    // 注意：如果当前节点已经被识别为图片资源（有 exportSettings），
    // 仍然需要递归处理子节点，因为子节点可能也需要被提取
    // 但是，如果当前节点有 exportSettings，子节点通常不需要单独提取
    // 这里我们仍然递归处理，让子节点自己判断是否需要提取
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((child) => findImageNodes(child, node, parentNode, depth + 1));
    }
  }

  // 从根节点开始查找
  // 保存 mcpData 引用，供 findFrameParent 使用
  const rootMCPData = mcpData;
  
  // 调试日志：输出数据格式
  console.log('[extractImageNodes] 开始提取图片节点，数据格式:', {
    hasNodesArray: !!(mcpData.nodes && Array.isArray(mcpData.nodes)),
    isArray: Array.isArray(mcpData),
    hasId: !!mcpData.id,
    hasNodesObject: !!(mcpData.nodes && typeof mcpData.nodes === 'object'),
    rootId: mcpData.id,
    rootType: mcpData.type
  });
  
  if (mcpData.nodes && Array.isArray(mcpData.nodes)) {
    console.log('[extractImageNodes] 使用 nodes 数组格式，节点数量:', mcpData.nodes.length);
    mcpData.nodes.forEach((node) => findImageNodes(node, null, null, 0));
  } else if (Array.isArray(mcpData)) {
    console.log('[extractImageNodes] 使用数组格式，节点数量:', mcpData.length);
    mcpData.forEach((node) => findImageNodes(node, null, null, 0));
  } else if (mcpData.id) {
    // 单个节点对象
    console.log('[extractImageNodes] 使用单个节点对象格式，节点ID:', mcpData.id);
    findImageNodes(mcpData, null, null, 0);
  } else if (mcpData.nodes && typeof mcpData.nodes === 'object') {
    // MCP 数据格式：{ nodes: { "id": { document: {...} } } }
    console.log('[extractImageNodes] 使用 nodes 对象格式');
    Object.values(mcpData.nodes).forEach((node) => {
      if (node.document) {
        findImageNodes(node.document, null, null, 0);
      } else {
        findImageNodes(node, null, null, 0);
      }
    });
  } else {
    console.warn('[extractImageNodes] 未知的数据格式，无法提取图片节点');
  }
  
  console.log('[extractImageNodes] 提取完成，找到图片节点数量:', imageNodes.length);

  // 将按 Group 分组的 VECTOR 节点转换为 imageNode
  // 每组作为一个整体，使用 Frame 的 nodeId 来导出为 PNG
  vectorGroups.forEach((group) => {
    const frameNode = group.frameNode;
    const groupNode = group.groupNode;
    
    // 使用 Frame 的边界框作为图标的尺寸
    const boundingBox = frameNode.absoluteBoundingBox || groupNode.absoluteBoundingBox;
    
    const imageNode = {
      id: group.frameId, // 使用 Frame 的 ID 作为 nodeId（用于下载）
      name: group.frameName || group.groupName || `Icon-${group.frameId}`,
      type: 'GROUP', // 标记为 GROUP 类型
      resourceType: 'PNG', // 每组导出为 PNG（不是 SVG）
      imageRef: null, // VECTOR Group 没有 imageRef
      // 使用 Frame 的尺寸
      width: boundingBox?.width,
      height: boundingBox?.height,
      x: boundingBox?.x,
      y: boundingBox?.y,
      absoluteBoundingBox: boundingBox,
      // 包含该组的所有 VECTOR 节点信息
      vectors: group.vectors.map(v => ({
        id: v.id,
        name: v.name,
        width: v.absoluteBoundingBox?.width,
        height: v.absoluteBoundingBox?.height,
        x: v.absoluteBoundingBox?.x,
        y: v.absoluteBoundingBox?.y,
        fills: v.fills,
        opacity: v.opacity,
        raw: v
      })),
      // Group 和 Frame 信息
      groupId: group.groupId,
      groupName: group.groupName,
      frameId: group.frameId,
      frameName: group.frameName,
      // 原始节点数据
      raw: frameNode, // 保存 Frame 节点数据用于下载
      groupRaw: groupNode, // 保存 Group 节点数据
      contentHash: group.contentHash,
    };
    
    // 移除去重逻辑，所有图片都会上传
    imageNode.isDuplicate = false;
    imageNode.primaryNodeId = null;

    imageNodes.push(imageNode);
  });

  return imageNodes;
}

/**
 * 准备图片下载配置
 */
function prepareImageDownloadNodes(imageNodes, useImageRefAsFileName = true) {
  // 移除去重过滤，所有图片节点都会被下载和上传
  // 过滤掉 undefined 或 null 的节点
  return imageNodes
    .filter((node) => node != null)
    .map((node) => {
    // 确定文件扩展名和格式
    // PNG 图片：有 imageRef，导出为 PNG
    // Group 图标：按 Group 分组的 VECTOR，导出为 PNG（使用 Frame 的 nodeId）
    let extension = "png";
    let format = "png";
    
    // Group 类型的节点（按 Group 分组的 VECTOR）始终导出为 PNG
    if (node.type === "GROUP" || node.resourceType === "PNG") {
      extension = "png";
      format = "png";
    } else if (node.resourceType === "SVG" || node.type === "VECTOR" || node.type === "IMAGE-SVG") {
      extension = "svg";
      format = "svg";
    }

    // 生成文件名
    let fileName;
    if (useImageRefAsFileName && node.imageRef) {
      // PNG 图片：使用 imageRef 作为文件名
      fileName = `${node.imageRef.replace(/[^a-zA-Z0-9]/g, "-")}.${extension}`;
    } else {
      // Group 图标或其他：使用节点名称
      const name = node.frameName || node.groupName || node.name || `icon-${node.id}`;
      fileName = `${name
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]/g, "-")}.${extension}`;
    }

    return {
      nodeId: node.id.replace(/:/g, "-"), // 将 : 替换为 -（对于 Group，这是 Frame 的 ID）
      fileName: fileName,
      imageRef: node.imageRef || "",
      format: format, // png 或 svg（Group 类型始终是 png）
      resourceType: node.resourceType || (node.imageRef ? "PNG" : "PNG"), // Group 类型默认为 PNG
      needsCropping: false,
      cropTransform: null,
      requiresImageDimensions: !!(node.width && node.height),
      // 如果是 Group 类型，添加额外信息
      isGroup: node.type === "GROUP",
      groupId: node.groupId,
      frameId: node.frameId,
      contentHash: node.contentHash || null,
      // 添加 exportSettings 相关字段（用于有 exportSettings 但没有 imageRef 的节点）
      hasExportSettings: node.hasExportSettings || false,
      exportSettings: node.exportSettings || null,
    };
  });
}

/**
 * 计算文件的哈希值（用于去重）
 */
async function calculateFileHash(file) {
  const arrayBuffer = await file.arrayBuffer();
  
  if (typeof window !== 'undefined' && typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } else {
    // 简单哈希
    const uint8Array = new Uint8Array(arrayBuffer);
    let hash = 0;
    for (let i = 0; i < uint8Array.length; i++) {
      hash = ((hash << 5) - hash) + uint8Array[i];
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * 默认的 OSS 上传函数
 * 遵循 @figma-mcp-image-processor 的逻辑
 */
async function defaultUploadFn(file, config) {
  const formData = new FormData();
  
  if (config.systemCode) {
    formData.append('systemCode', config.systemCode);
  }
  if (config.belongCode) {
    formData.append('belongCode', config.belongCode);
  }
  if (config.belongID) {
    formData.append('belongID', config.belongID);
  }
  
  formData.append('file', file);

  const headers = {
    ...config.headers,
  };

  const response = await fetch(config.url, {
    method: 'POST',
    body: formData,
    headers: headers,
  });

  if (!response.ok) {
    throw new Error(`上传失败: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  // 根据不同的 OSS 服务返回格式，可能需要调整这里的解析逻辑
  // 优先使用 data.data.remoteAddress（与 tz 插件一致）
  if (data.data?.remoteAddress) {
    return data.data.remoteAddress;
  } else if (data.data?.remoteUrl) {
    return data.data.remoteUrl;
  } else if (data.remoteUrl) {
    return data.remoteUrl;
  } else if (data.url) {
    return data.url;
  } else {
    throw new Error('无法从响应中获取 OSS URL');
  }
}

/**
 * 上传文件到 OSS
 */
async function uploadToOSS(file, fileName, config) {
  // 确保是 File 对象
  let fileObj;
  if (file instanceof File) {
    fileObj = file;
  } else {
    fileObj = new File([file], fileName, { type: file.type || 'image/png' });
  }

  // 使用自定义上传函数或默认函数
  const uploadFn = config.uploadFn || defaultUploadFn;
  return await uploadFn(fileObj, config);
}

/**
 * 批量上传图片到 OSS（支持进度回调）
 */
async function batchUploadToOSSWithProgress(files, config, onProgress) {
  const results = [];
  const total = files.length;
  
  for (let i = 0; i < files.length; i++) {
    const item = files[i];
    
    // 调用进度回调
    if (onProgress) {
      onProgress(i + 1, total, 'upload');
    }
    
    try {
      let ossUrl;
      let isCompressed = false;
      let sameRecord = false;
      const useBackendService = config.useBackendService !== false;
      const enableCompression = config.enableCompression || false;
      const backendApiUrl = config.backendApiUrl;

      if (useBackendService && backendApiUrl) {
        const arrayBuffer = await item.file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = "";
        const chunkSize = 8192;
        for (let j = 0; j < uint8Array.length; j += chunkSize) {
          const chunk = uint8Array.subarray(j, j + chunkSize);
          binary += String.fromCharCode.apply(null, chunk);
        }
        const base64 = btoa(binary);
        const mimeType = item.file.type || "image/png";
        const dataUrl = `data:${mimeType};base64,${base64}`;
        
        try {
          const backendResult = await fetch(`${backendApiUrl}/oss/upload`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              imgUrl: dataUrl,
              isCompressed: enableCompression,
              size: {
                width: item.width || 0,
                height: item.height || 0,
              },
            }),
          });

          if (!backendResult.ok) {
            throw new Error(`后端服务错误: ${backendResult.status}`);
          }

          const backendData = await backendResult.json();
          if (backendData.code !== 1) {
            throw new Error(backendData.message || "上传失败");
          }

          ossUrl = backendData.data.remoteUrl;
          isCompressed = backendData.data.isCompressed || false;
          sameRecord = backendData.data.sameRecord || false;
        } catch (error) {
          console.error(`通过后端上传 ${item.fileName} 失败:`, error);
          ossUrl = await uploadToOSS(item.file, item.fileName, config);
          isCompressed = false;
          sameRecord = false;
        }
      } else {
        ossUrl = await uploadToOSS(item.file, item.fileName, config);
      }
      
      results.push({
        imageRef: item.imageRef,
        nodeId: item.nodeId,
        originalFileName: item.fileName,
        ossUrl: ossUrl,
        width: item.width,
        height: item.height,
        contentHash: item.contentHash || null,
        isCompressed: isCompressed,
        sameRecord: sameRecord,
      });
    } catch (error) {
      console.error(`上传文件 ${item.fileName} 失败:`, error);
    }
  }

  return results;
}

/**
 * 批量上传图片到 OSS（支持后端服务和压缩）
 */
async function batchUploadToOSS(files, config) {
  const results = [];
  const useBackendService = config.useBackendService !== false; // 默认 true，除非明确设置为 false
  const enableCompression = config.enableCompression || false;
  const backendApiUrl = config.backendApiUrl;

  for (const item of files) {
    try {
      let ossUrl;
      let isCompressed = false;
      let sameRecord = false;

      // 默认使用后端服务，如果配置了后端地址
      if (useBackendService && backendApiUrl) {
        // 使用后端服务上传（支持去重和压缩）
        // 将文件转换为 base64 data URL，以便后端可以访问
        const arrayBuffer = await item.file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, chunk);
        }
        const base64 = btoa(binary);
        const mimeType = item.file.type || "image/png";
        const dataUrl = `data:${mimeType};base64,${base64}`;
        
        try {
          const backendResult = await fetch(`${backendApiUrl}/oss/upload`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              imgUrl: dataUrl,
              isCompressed: enableCompression,
              size: {
                width: item.width || 0,
                height: item.height || 0,
              },
            }),
          });

          if (!backendResult.ok) {
            throw new Error(`后端服务错误: ${backendResult.status}`);
          }

          const backendData = await backendResult.json();
          if (backendData.code !== 1) {
            throw new Error(backendData.message || "上传失败");
          }

          ossUrl = backendData.data.remoteUrl;
          isCompressed = backendData.data.isCompressed || false;
          sameRecord = backendData.data.sameRecord || false;
        } catch (error) {
          console.error(`通过后端上传 ${item.fileName} 失败:`, error);
          // 如果后端服务失败，回退到直接上传
          console.warn(`后端服务上传失败，回退到直接上传: ${error.message}`);
          ossUrl = await uploadToOSS(item.file, item.fileName, config);
          isCompressed = false;
          sameRecord = false;
        }
      } else {
        // 直接上传到 OSS
        ossUrl = await uploadToOSS(item.file, item.fileName, config);
      }
      
      results.push({
        imageRef: item.imageRef,
        nodeId: item.nodeId,
        originalFileName: item.fileName,
        ossUrl: ossUrl,
        width: item.width,
        height: item.height,
        contentHash: item.contentHash || null,
        isCompressed: isCompressed,
        sameRecord: sameRecord,
      });
    } catch (error) {
      console.error(`上传文件 ${item.fileName} 失败:`, error);
      // 继续处理其他文件，不中断整个流程
    }
  }

  return results;
}

/**
 * 从 URL 或 Blob 读取文件
 */
async function readFileFromSource(source) {
  if (source instanceof File || source instanceof Blob) {
    return source instanceof File ? source : new File([source], 'image.png', { type: source.type || 'image/png' });
  }
  
  if (typeof source === 'string') {
    // URL 或 blob URL
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`无法读取文件: ${source}`);
    }
    const blob = await response.blob();
    const fileName = source.split('/').pop() || 'image.png';
    return new File([blob], fileName, { type: blob.type || 'image/png' });
  }
  
  throw new Error('不支持的文件源类型');
}

/**
 * 通过 MCP 下载图片（在 Chrome 扩展中通过消息传递调用）
 */
async function downloadImagesViaMCP(fileKey, downloadNodes, pngScale = 2) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: 'downloadFigmaImages',
      data: {
        fileKey,
        nodes: downloadNodes,
        pngScale
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      if (response && response.success) {
        resolve(response.data || []);
      } else {
        reject(new Error(response?.error || '下载失败'));
      }
    });
  });
}

/**
 * 处理 MCP 图片：提取、下载、上传
 */
async function processMCPImages(mcpData, options = {}) {
  const {
    fileKey,
    pngScale = 2,
    ossConfig,
    useImageRefAsFileName = true,
    mcpDownloadFn,
    onProgress, // 进度回调函数
  } = options;

  // 1. 提取图片节点（不去重，上传所有图片）
  // 如果 mcpData.nodes 已经是图片节点数组（包含 resourceType 等属性），直接使用
  let imageNodes;
  if (Array.isArray(mcpData.nodes) && mcpData.nodes.length > 0) {
    const firstNode = mcpData.nodes[0];
    // 检查是否是已经提取好的图片节点
    // 已提取的图片节点会有 resourceType 属性（'PNG' 或 'SVG'）
    // 或者 type === 'GROUP' 且有 frameId（这是 extractImageNodes 添加的属性）
    // 注意：原始 RECTANGLE 节点也可能有 imageRef，所以需要检查 resourceType 是否存在
    const isExtractedImageNode = firstNode.resourceType === 'PNG' || 
                                  firstNode.resourceType === 'SVG' ||
                                  (firstNode.type === 'GROUP' && firstNode.frameId);
    
    if (isExtractedImageNode) {
      // 直接使用，这些已经是提取好的图片节点
      imageNodes = mcpData.nodes;
      console.log(`直接使用 ${imageNodes.length} 个已提取的图片节点（用户选中的）`);
    } else {
      // 需要从原始节点数据中提取
      imageNodes = extractImageNodes(mcpData, {
        deduplicateByImageRef: false,
        excludeTypes: [],
        includeTypes: [],
      });
    }
  } else {
    // 正常提取流程
    imageNodes = extractImageNodes(mcpData, {
      deduplicateByImageRef: false, // 不去重，上传所有图片
      excludeTypes: [], // 可以排除某些类型
      includeTypes: [], // 可以只包含某些类型
    });
  }
  console.log(`找到 ${imageNodes.length} 个图片节点`);

  if (imageNodes.length === 0) {
    return {
      imageNodes: [],
      downloadedImages: [],
      uploadResults: [],
      imageRefToOSSMap: {},
    };
  }

  // 2. 准备下载配置
  const downloadNodes = prepareImageDownloadNodes(imageNodes, useImageRefAsFileName);

  // 3. 通过 MCP 下载图片（如果提供了下载函数或 fileKey）
  let downloadedImages = [];

  if (fileKey && (mcpDownloadFn || typeof chrome !== 'undefined')) {
    try {
      let downloadedFiles;
      if (mcpDownloadFn) {
        downloadedFiles = await mcpDownloadFn(fileKey, downloadNodes, pngScale);
      } else {
        // 使用 Chrome 扩展的消息传递
        downloadedFiles = await downloadImagesViaMCP(fileKey, downloadNodes, pngScale);
      }
      
      downloadedImages = downloadedFiles.map((file, index) => ({
        fileName: file.fileName,
        imageRef: downloadNodes[index]?.imageRef || '',
        nodeId: downloadNodes[index]?.nodeId || '',
        url: file.url || file.localPath || file.blobUrl,
      }));
    } catch (error) {
      console.error('下载图片失败:', error);
      // 即使下载失败，也继续后续流程
    }
  }

  // 4. 读取下载的图片文件
  let filesToUpload = [];

  if (downloadedImages.length > 0) {
    try {
      const totalDownloaded = downloadedImages.length;
      for (let i = 0; i < downloadedImages.length; i++) {
        const item = downloadedImages[i];
        
        // 更新下载进度（如果有回调）
        if (onProgress) {
          onProgress(i + 1, totalDownloaded, 'download');
        }
        try {
          // 优先使用 url，如果没有则使用 localPath
          const source = item.url || item.localPath;
          if (!source) {
            console.warn(`下载项 ${item.fileName} 没有 URL 或 localPath，跳过`);
            continue;
          }
          
          // 如果 source 是 data URL，直接使用
          if (typeof source === 'string' && source.startsWith('data:')) {
            // 将 data URL 转换为 File 对象
            const response = await fetch(source);
            const blob = await response.blob();
            const file = new File([blob], item.fileName, { type: blob.type || 'image/png' });
            const imageNode = imageNodes.find(node => node.id.replace(/:/g, '-') === item.nodeId);
            filesToUpload.push({
              file,
              fileName: item.fileName,
              imageRef: item.imageRef,
              nodeId: item.nodeId,
              width: imageNode?.width,
              height: imageNode?.height,
              contentHash: imageNode?.contentHash || null,
            });
          } else {
            // 使用 readFileFromSource 读取文件
            const file = await readFileFromSource(source);
            const imageNode = imageNodes.find(node => node.id.replace(/:/g, '-') === item.nodeId);
            filesToUpload.push({
              file,
              fileName: item.fileName,
              imageRef: item.imageRef,
              nodeId: item.nodeId,
              width: imageNode?.width,
              height: imageNode?.height,
              contentHash: imageNode?.contentHash || null,
            });
          }
        } catch (error) {
          console.error(`读取文件失败:`, error);
        }
      }
    } catch (error) {
      console.error('读取图片文件失败:', error);
    }
  }

  // 5. 上传到 OSS（如果提供了 OSS 配置）
  let uploadResults = [];

  if (ossConfig && filesToUpload.length > 0) {
    try {
      // 如果有进度回调，使用带进度的上传
      if (onProgress) {
        uploadResults = await batchUploadToOSSWithProgress(filesToUpload, ossConfig, onProgress);
      } else {
        uploadResults = await batchUploadToOSS(filesToUpload, ossConfig);
      }
      
      console.log(`成功上传 ${uploadResults.length} 个图片到 OSS`);
    } catch (error) {
      console.error('上传到 OSS 失败:', error);
    }
  }

  // 将 OSS URL 回填到 imageNodes
  const normalizedId = (id) => (id || '').replace(/:/g, '-');
  const nodeIdToOssMap = {};
  uploadResults.forEach((result) => {
    nodeIdToOssMap[result.nodeId] = result.ossUrl;
  });

  imageNodes.forEach((node) => {
    const nodeId = normalizedId(node.id);
    if (nodeIdToOssMap[nodeId]) {
      node.ossUrl = nodeIdToOssMap[nodeId];
    }
  });

  return {
    imageNodes,
    downloadedImages,
    uploadResults: uploadResults,
  };
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.MCPImageProcessor = {
    extractImageNodes,
    prepareImageDownloadNodes,
    processMCPImages,
    uploadToOSS,
    batchUploadToOSS,
    calculateFileHash,
  };
}

