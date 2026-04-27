import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { createEscapedPath } from './src/utils/pathSegmentEscape';

import { cloudflare } from "@cloudflare/vite-plugin";

const modelDir = path.resolve('public/model');

/**
 * 递归遍历目录并建立 [编码路径 -> 物理路径] 的映射
 */
const getModelAliases = () => {
  const aliases = new Map<string, string>();
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else {
        const rel = path.relative(modelDir, fullPath).replace(/\\/g, '/');
        // 将编码后的路径映射回原始文件
        aliases.set(`/model/${createEscapedPath(rel)}`, fullPath);
      }
    }
  };
  walk(modelDir);
  return aliases;
};

export default defineConfig({
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve('src'),
    },
  },
  plugins: [{
    name: 'model-alias-plugin',
    // 开发服务器：拦截编码后的请求并返回原始文件内容
    configureServer(server) {
      const aliases = getModelAliases();
      server.middlewares.use((req, res, next) => {
        const filePath = aliases.get(req.url?.split('?')[0] || '');
        if (filePath) return res.end(fs.readFileSync(filePath));
        next();
      });
    },
    // 构建：将原始文件复制到 dist 中编码后的位置
    writeBundle(options) {
      const aliases = getModelAliases();
      for (const [aliasPath, sourcePath] of aliases) {
        const dest = path.join(options.dir!, aliasPath);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(sourcePath, dest);
      }
    },
  }, cloudflare()],
});