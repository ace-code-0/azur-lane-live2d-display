import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

import { createModelAssetAliasPath } from './src/live2d/modelAssetPath';

function createStaticAliasPlugin(
  sourceDirectory: string,
  publicBasePath: string,
  toAliasPath: (relativePath: string) => string,
): Plugin {
  const aliases = new Map<string, string>();

  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const abs = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(abs) : [abs];
    });

  for (const sourcePath of walk(sourceDirectory)) {
    const relativePath = path
      .relative(sourceDirectory, sourcePath)
      .split(path.sep)
      .join('/');
    const aliasPath = `${publicBasePath.replace(/\/+$/, '')}/${toAliasPath(relativePath).replace(/^\/+/, '')}`;
    aliases.set(aliasPath, sourcePath);
  }

  return {
    name: 'static-alias',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestPath = req.url?.split('?', 1)[0];
        const sourcePath = requestPath ? aliases.get(requestPath) : undefined;

        if (!sourcePath) return next();

        res.end(fs.readFileSync(sourcePath));
      });
    },

    writeBundle(outputOptions) {
      if (!outputOptions.dir) return;

      for (const [requestPath, sourcePath] of aliases) {
        const outputPath = path.join(
          outputOptions.dir,
          requestPath.replace(/^\//, ''),
        );
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.copyFileSync(sourcePath, outputPath);
      }
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [
    createStaticAliasPlugin(
      path.resolve('public', 'model'),
      '/model',
      createModelAssetAliasPath,
    ),
  ],
});
