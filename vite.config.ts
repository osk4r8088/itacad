import { defineConfig, runnerImport, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The search index as a module: `import('virtual:search-index')`.
 * It is built here, when the site is built, from the data the pages render (src/search/build.ts),
 * and ends up in a file of its own that the browser loads when the search is opened.
 */
function searchIndex(): Plugin {
  const id = 'virtual:search-index';
  const resolved = `\0${id}`;
  let root = '';
  return {
    name: 'search-index',
    configResolved(config) {
      root = config.root;
    },
    resolveId: (source) => (source === id ? resolved : undefined),
    async load(source) {
      if (source !== resolved) return undefined;
      // Runs the builder in Node with a plain configuration: the data modules need no plugins.
      const { module } = await runnerImport<typeof import('./src/search/built')>('/src/search/built.ts', { configFile: false, root, logLevel: 'error' });
      const docs = module.default;
      // JSON.parse of one string is faster for the browser than a large object literal.
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(docs))});`;
    },
  };
}

export default defineConfig({
  plugins: [react(), searchIndex()],
  base: './',
  build: {
    // The password checker loads zxcvbn with its dictionaries (about 1.8 MB) only on its own page.
    // The main bundle is guarded separately by the size check in .github/workflows/ci.yml.
    chunkSizeWarningLimit: 2000,
  },
});
