/**
 * Figma MCP 数据处理工具函数
 * 用于从 Figma MCP 数据中提取图片资源、定位信息和 CSS 样式
 */

/**
 * 从 MCP 数据中提取所有图片资源节点
 * @param {Object} mcpData - Figma MCP 返回的数据
 * @returns {Array} 图片节点数组
 */
function extractImageNodes(mcpData) {
  const imageNodes = [];

  /**
   * 递归查找图片节点
   */
  function findImageNodes(node) {
    // 检查是否为图片类型
    if (node.type === 'IMAGE' || node.type === 'IMAGE-SVG' || node.type === 'VECTOR') {
      const imageNode = {
        id: node.id,
        name: node.name || `image-${node.id}`,
        type: node.type,
        layout: node.layout || {},
        fills: node.fills || [],
        // 提取尺寸信息
        width: node.layout?.dimensions?.width || null,
        height: node.layout?.dimensions?.height || null,
        // 提取位置信息
        x: node.layout?.locationRelativeToParent?.x || 0,
        y: node.layout?.locationRelativeToParent?.y || 0,
        // 检查是否有图片填充
        imageRef: null,
        imageUrl: null
      };

      // 检查 fills 中是否有图片
      if (node.fills && node.fills.length > 0) {
        const imageFill = node.fills.find(fill => fill.type === 'IMAGE');
        if (imageFill) {
          imageNode.imageRef = imageFill.imageRef || null;
          imageNode.imageUrl = imageFill.url || null;
        }
      }

      imageNodes.push(imageNode);
    }

    // 递归处理子节点
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(child => findImageNodes(child));
    }
  }

  // 从根节点开始查找
  if (mcpData.nodes && Array.isArray(mcpData.nodes)) {
    mcpData.nodes.forEach(node => findImageNodes(node));
  } else if (Array.isArray(mcpData)) {
    mcpData.forEach(node => findImageNodes(node));
  } else if (mcpData.id) {
    // 单个节点对象
    findImageNodes(mcpData);
  }

  return imageNodes;
}

/**
 * 准备图片下载节点数据
 * @param {Array} imageNodes - 图片节点数组
 * @returns {Array} 用于下载的节点配置
 */
function prepareImageDownloadNodes(imageNodes) {
  return imageNodes.map(node => {
    // 确定文件扩展名
    let extension = 'png';
    if (node.type === 'IMAGE-SVG' || node.type === 'VECTOR') {
      extension = 'svg';
    }

    // 生成文件名
    const fileName = `${node.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.${extension}`;

    return {
      nodeId: node.id.replace(/:/g, '-'),  // 将冒号替换为连字符
      fileName: fileName,
      imageRef: node.imageRef || '',
      needsCropping: false,
      cropTransform: null,
      requiresImageDimensions: node.width && node.height ? true : false
    };
  });
}

/**
 * 将布局信息转换为 CSS 对象
 * @param {Object} layout - 布局对象
 * @returns {Object} CSS 样式对象
 */
function convertLayoutToCSS(layout) {
  if (!layout) return {};

  const css = {};

  // 尺寸
  if (layout.dimensions) {
    if (layout.dimensions.width !== undefined) {
      css.width = `${layout.dimensions.width}px`;
    }
    if (layout.dimensions.height !== undefined) {
      css.height = `${layout.dimensions.height}px`;
    }
  }

  // 定位
  if (layout.locationRelativeToParent) {
    const { x, y } = layout.locationRelativeToParent;
    if (x !== undefined) {
      css.left = `${x}px`;
    }
    if (y !== undefined) {
      css.top = `${y}px`;
    }
    // 如果设置了位置，通常需要绝对定位
    if (x !== undefined || y !== undefined) {
      css.position = 'absolute';
    }
  }

  // 尺寸模式处理
  if (layout.sizing) {
    // 水平尺寸
    if (layout.sizing.horizontal === 'fill') {
      css.width = '100%';
      delete css.left;  // fill 模式通常不需要 left
    } else if (layout.sizing.horizontal === 'hug') {
      css.width = 'auto';
    }

    // 垂直尺寸
    if (layout.sizing.vertical === 'fill') {
      css.height = '100%';
      delete css.top;  // fill 模式通常不需要 top
    } else if (layout.sizing.vertical === 'hug') {
      css.height = 'auto';
    }
  }

  return css;
}

/**
 * 将填充样式转换为 CSS
 * @param {Array} fills - 填充数组
 * @returns {Object} CSS 样式对象
 */
function convertFillsToCSS(fills) {
  if (!fills || !Array.isArray(fills) || fills.length === 0) {
    return {};
  }

  const fill = fills[0];  // 通常使用第一个填充
  const css = {};

  switch (fill.type) {
    case 'SOLID':
      // 处理颜色
      if (fill.color) {
        // 如果颜色是十六进制字符串
        if (typeof fill.color === 'string' && fill.color.startsWith('#')) {
          css.backgroundColor = fill.color;
        } else if (fill.colorHex) {
          css.backgroundColor = `#${fill.colorHex}`;
        } else if (fill.color && typeof fill.color === 'object') {
          // RGB 或 RGBA 对象
          const { r, g, b, a } = fill.color;
          if (a !== undefined && a !== 1) {
            css.backgroundColor = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
          } else {
            css.backgroundColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
          }
        }
      }
      break;

    case 'GRADIENT_LINEAR':
      // 线性渐变
      if (fill.gradient) {
        css.background = fill.gradient;
      } else if (fill.gradientStops) {
        // 构建渐变字符串
        const stops = fill.gradientStops.map(stop => {
          const color = stop.color;
          const colorStr = color.r !== undefined
            ? `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a || 1})`
            : stop.color;
          return `${colorStr} ${(stop.position * 100)}%`;
        }).join(', ');
        css.background = `linear-gradient(${fill.angle || 0}deg, ${stops})`;
      }
      break;

    case 'IMAGE':
      // 图片填充
      if (fill.url) {
        css.backgroundImage = `url(${fill.url})`;
        css.backgroundSize = fill.scaleMode || 'cover';
        css.backgroundPosition = 'center';
      }
      break;

    default:
      break;
  }

  return css;
}

/**
 * 转换圆角为 CSS
 * @param {string|number} borderRadius - 圆角值
 * @returns {Object} CSS 样式对象
 */
function convertBorderRadiusToCSS(borderRadius) {
  if (!borderRadius) return {};

  if (typeof borderRadius === 'string') {
    return { borderRadius };
  } else if (typeof borderRadius === 'number') {
    return { borderRadius: `${borderRadius}px` };
  }

  return {};
}

/**
 * 将节点转换为完整的 CSS 对象
 * @param {Object} node - Figma 节点对象
 * @returns {Object} CSS 样式对象
 */
function convertNodeToCSS(node) {
  const css = {};

  // 1. 布局和定位
  if (node.layout) {
    Object.assign(css, convertLayoutToCSS(node.layout));
  }

  // 2. 填充样式
  if (node.fills) {
    Object.assign(css, convertFillsToCSS(node.fills));
  }

  // 3. 圆角
  if (node.borderRadius) {
    Object.assign(css, convertBorderRadiusToCSS(node.borderRadius));
  }

  // 4. 边框（如果有）
  if (node.strokes && node.strokes.length > 0) {
    const stroke = node.strokes[0];
    if (stroke.color) {
      const color = stroke.color;
      if (color.r !== undefined) {
        css.borderColor = `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a || 1})`;
      } else {
        css.borderColor = stroke.color;
      }
    }
    if (node.strokeWeight) {
      css.borderWidth = `${node.strokeWeight}px`;
    }
  }

  // 5. 透明度
  if (node.opacity !== undefined && node.opacity !== 1) {
    css.opacity = node.opacity;
  }

  return css;
}

/**
 * 生成 CSS 类名
 * @param {string} nodeName - 节点名称
 * @param {string} nodeId - 节点 ID
 * @returns {string} CSS 类名
 */
function generateClassName(nodeName, nodeId) {
  // 使用节点名称生成类名，如果名称不可用则使用 ID
  const baseName = nodeName
    ? nodeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : `node-${nodeId.replace(/:/g, '-')}`;

  return baseName || 'figma-node';
}

/**
 * 将 CSS 对象转换为 CSS 字符串
 * @param {Object} css - CSS 对象
 * @param {number} indent - 缩进级别
 * @returns {string} CSS 字符串
 */
function cssObjectToString(css, indent = 0) {
  const indentStr = '  '.repeat(indent);
  let cssStr = '';

  Object.entries(css).forEach(([key, value]) => {
    // 将 camelCase 转换为 kebab-case
    const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    cssStr += `${indentStr}${kebabKey}: ${value};\n`;
  });

  return cssStr;
}

/**
 * 从 MCP 数据生成完整的 HTML 和 CSS
 * @param {Object} mcpData - Figma MCP 数据
 * @param {Object} options - 选项
 * @returns {Object} { html, css, imageNodes }
 */
function generateCodeFromMCP(mcpData, options = {}) {
  const {
    imagePath = '/images',  // 图片路径前缀
    generateIds = true,     // 是否生成 data-node-id
    minify = false          // 是否压缩输出
  } = options;

  let html = '';
  let css = '';
  const imageNodes = extractImageNodes(mcpData);
  const imageMap = new Map();  // 用于映射节点 ID 到文件路径

  // 构建图片映射
  imageNodes.forEach(node => {
    const extension = node.type === 'IMAGE-SVG' || node.type === 'VECTOR' ? 'svg' : 'png';
    const fileName = `${node.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.${extension}`;
    imageMap.set(node.id, `${imagePath}/${fileName}`);
  });

  /**
   * 递归处理节点
   */
  function processNode(node, depth = 0) {
    const indent = '  '.repeat(depth);
    const className = generateClassName(node.name, node.id);
    const nodeCSS = convertNodeToCSS(node);

    // 生成 CSS
    if (Object.keys(nodeCSS).length > 0) {
      css += `.${className} {\n`;
      css += cssObjectToString(nodeCSS, 1);
      css += `}\n\n`;
    }

    // 确定 HTML 标签
    let tag = 'div';
    if (node.type === 'IMAGE' || node.type === 'IMAGE-SVG') {
      tag = 'img';
    } else if (node.type === 'TEXT') {
      tag = 'span';
    } else if (node.type === 'VECTOR') {
      tag = 'svg';
    }

    // 生成 HTML 开始标签
    let attributes = `class="${className}"`;
    if (generateIds) {
      attributes += ` data-node-id="${node.id.replace(/:/g, '-')}"`;
    }

    html += `${indent}<${tag} ${attributes}`;

    // 如果是图片，添加 src 属性
    if (tag === 'img' && imageMap.has(node.id)) {
      html += ` src="${imageMap.get(node.id)}"`;
      if (node.width) html += ` width="${node.width}"`;
      if (node.height) html += ` height="${node.height}"`;
    }

    html += '>';

    // 处理文本内容
    if (node.type === 'TEXT' && node.characters) {
      html += node.characters;
    }

    // 处理子节点
    if (node.children && node.children.length > 0) {
      if (!minify) html += '\n';
      node.children.forEach(child => {
        processNode(child, depth + 1);
      });
      if (!minify) html += indent;
    }

    // 自闭合标签处理
    if (tag === 'img' && (!node.children || node.children.length === 0)) {
      html = html.replace(/>$/, ' />');
    } else {
      html += `</${tag}>`;
    }

    if (!minify) html += '\n';
  }

  // 处理所有根节点
  if (mcpData.nodes && Array.isArray(mcpData.nodes)) {
    mcpData.nodes.forEach(node => {
      processNode(node, 0);
    });
  } else if (Array.isArray(mcpData)) {
    mcpData.forEach(node => {
      processNode(node, 0);
    });
  } else if (mcpData.id) {
    // 单个节点对象
    processNode(mcpData, 0);
  }

  return {
    html: html.trim(),
    css: css.trim(),
    imageNodes: imageNodes,
    imageDownloadNodes: prepareImageDownloadNodes(imageNodes)
  };
}

/**
 * 导出所有工具函数
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractImageNodes,
    prepareImageDownloadNodes,
    convertLayoutToCSS,
    convertFillsToCSS,
    convertBorderRadiusToCSS,
    convertNodeToCSS,
    generateClassName,
    cssObjectToString,
    generateCodeFromMCP
  };
}

// 浏览器环境下的全局导出
if (typeof window !== 'undefined') {
  window.FigmaMCPUtils = {
    extractImageNodes,
    prepareImageDownloadNodes,
    convertLayoutToCSS,
    convertFillsToCSS,
    convertBorderRadiusToCSS,
    convertNodeToCSS,
    generateClassName,
    cssObjectToString,
    generateCodeFromMCP
  };
}

