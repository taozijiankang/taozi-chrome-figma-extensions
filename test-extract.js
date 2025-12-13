// 测试脚本：验证 extractImageNodes 是否能正确识别有 exportSettings 的节点

const fs = require('fs');
const path = require('path');

// 读取 ex.json 文件
const exJsonPath = path.join(__dirname, '../ex.json');
const exData = JSON.parse(fs.readFileSync(exJsonPath, 'utf-8'));

console.log('测试数据:', {
  id: exData.id,
  name: exData.name,
  type: exData.type,
  childrenCount: exData.children?.length || 0
});

// 检查 exportSettings
function findNodesWithExportSettings(node, path = '') {
  const results = [];
  const currentPath = path ? `${path}.${node.name || node.id}` : (node.name || node.id);
  
  if (node.exportSettings && node.exportSettings.length > 0) {
    const pngSettings = node.exportSettings.filter(s => s.format === 'PNG' || s.format === 'png');
    if (pngSettings.length > 0) {
      results.push({
        id: node.id,
        name: node.name,
        type: node.type,
        path: currentPath,
        exportSettings: node.exportSettings
      });
    }
  }
  
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(child => {
      results.push(...findNodesWithExportSettings(child, currentPath));
    });
  }
  
  return results;
}

const nodesWithExport = findNodesWithExportSettings(exData);
console.log('\n找到有 PNG exportSettings 的节点:');
nodesWithExport.forEach(node => {
  console.log(`  - ${node.name} (${node.type}) [${node.id}]`);
  console.log(`    路径: ${node.path}`);
  console.log(`    exportSettings:`, JSON.stringify(node.exportSettings, null, 2));
});

console.log(`\n总共找到 ${nodesWithExport.length} 个有 PNG exportSettings 的节点`);

