import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

spawnSync("pnpm", ["install"], { stdio: "inherit", cwd: __dirname, shell: true });

spawnSync("node", ["packages/mcp-server/dist/start.js"], { stdio: "inherit", cwd: __dirname, shell: true });
