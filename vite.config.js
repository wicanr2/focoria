import { defineConfig } from 'vite';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

function localScenes() {
  function install(server) {
    if (!process.env.LOCAL_SCENE_DIR) return;
    const root = realpathSync(process.env.LOCAL_SCENE_DIR);
    server.middlewares.use((req, res, next) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (!pathname.startsWith('/models/')) return next();
      if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; res.end(); return; }
      const name = pathname.slice('/models/'.length);
      if (!/^(manifest\.json|shalun-L[0-6]-[a-z0-9]+\.glb)$/.test(name)) {
        res.statusCode = 404; res.end(); return;
      }
      try {
        const file = realpathSync(path.join(root, name));
        if (path.dirname(file) !== root) throw new Error('素材路徑越界');
        const stat = statSync(file);
        if (!stat.isFile()) throw new Error('不是素材檔案');
        res.setHeader('Content-Type', name.endsWith('.json') ? 'application/json' : 'model/gltf-binary');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'no-cache');
        if (req.method === 'HEAD') { res.end(); return; }
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
      } catch { res.statusCode = 404; res.end(); }
    });
  }
  return { name: 'local-scene-files', configureServer: install, configurePreviewServer: install };
}

export default defineConfig({
  // GitHub Pages 使用 /<repository>/ 子路徑；相對 base 也能在本機 preview 運作。
  base: './',
  plugins: [localScenes()],
});
