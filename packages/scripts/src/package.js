import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dayjs from "dayjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "../../../");

const ROOT_DIST_DIR = path.resolve(ROOT_DIR, "dist");

console.log("复制 根目录");
copyPath(path.resolve(ROOT_DIR, "index.mjs"), path.resolve(ROOT_DIST_DIR, "index.mjs"));
copyPath(path.resolve(ROOT_DIR, "package.json"), path.resolve(ROOT_DIST_DIR, "package.json"));
copyPath(path.resolve(ROOT_DIR, "pnpm-lock.yaml"), path.resolve(ROOT_DIST_DIR, "pnpm-lock.yaml"));
copyPath(path.resolve(ROOT_DIR, "pnpm-workspace.yaml"), path.resolve(ROOT_DIST_DIR, "pnpm-workspace.yaml"));

console.log("复制 browser-plugin");
copyPath(path.resolve(ROOT_DIR, "packages/browser-plugin/dist"), path.resolve(ROOT_DIST_DIR, "browser-plugin"));
console.log("复制 browser-plugin 完成");

copyPath(
  path.resolve(ROOT_DIR, "packages/mcp-server/package.json"),
  path.resolve(ROOT_DIST_DIR, "packages/mcp-server/package.json")
);
copyPath(path.resolve(ROOT_DIR, "packages/mcp-server/dist"), path.resolve(ROOT_DIST_DIR, "packages/mcp-server/dist"));
console.log("复制 mcp-server 完成");

/**
 * 设置版本号
 */
const version = dayjs().format("YYYY.MMDD.HHmmss");
console.log("设置版本号", version);
//
const packageJson = JSON.parse(fs.readFileSync(path.resolve(ROOT_DIST_DIR, "package.json"), "utf-8"));
packageJson.version = version;
fs.writeFileSync(path.resolve(ROOT_DIST_DIR, "package.json"), JSON.stringify(packageJson, null, 2));
//
const manifestJson = JSON.parse(fs.readFileSync(path.resolve(ROOT_DIST_DIR, "browser-plugin/manifest.json"), "utf-8"));
manifestJson.version = version;
fs.writeFileSync(path.resolve(ROOT_DIST_DIR, "browser-plugin/manifest.json"), JSON.stringify(manifestJson, null, 2));
//
const mcpServerPackageJson = JSON.parse(
  fs.readFileSync(path.resolve(ROOT_DIST_DIR, "packages/mcp-server/package.json"), "utf-8")
);
mcpServerPackageJson.version = version;
fs.writeFileSync(path.resolve(ROOT_DIST_DIR, "packages/mcp-server/package.json"), JSON.stringify(mcpServerPackageJson, null, 2));
//
console.log("设置版本号完成");

/**
 * @param {string} from
 * @param {string} target
 */
function copyPath(from, target) {
  const targetPath = path.resolve(ROOT_DIST_DIR, target);
  if (fs.statSync(from).isDirectory()) {
    fs.cpSync(from, targetPath, { recursive: true });
  } else {
    if (!fs.existsSync(path.dirname(targetPath))) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    }
    fs.copyFileSync(from, targetPath);
  }
}
