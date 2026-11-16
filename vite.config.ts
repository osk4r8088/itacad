import { defineConfig, runnerImport, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Data built when the site is built, as a module: `import('virtual:search-index')`, `import terms from 'virtual:term-index'`.
 * The entry module runs in Node from the data the pages render, and its default export ends up in the bundle as JSON.
 * The search index (src/search/built.ts) gets a file of its own that the browser loads when the search is opened;
 * the term index (src/basics/terms/built.ts) goes with the Basics & Concepts pages.
 */
function buildTimeData(id: string, entry: string): Plugin {
  const resolved = `\0${id}`;
  let root = '';
  return {
    name: id.replace('virtual:', ''),
    configResolved(config) {
      root = config.root;
    },
    resolveId: (source) => (source === id ? resolved : undefined),
    async load(source) {
      if (source !== resolved) return undefined;
      // Runs the builder in Node with a plain configuration: the data modules need no plugins.
      const { module } = await runnerImport<{ default: unknown }>(entry, { configFile: false, root, logLevel: 'error' });
      // JSON.parse of one string is faster for the browser than a large object literal.
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(module.default))});`;
    },
  };
}

export default defineConfig({
  plugins: [react(), buildTimeData('virtual:search-index', '/src/search/built.ts'), buildTimeData('virtual:term-index', '/src/basics/terms/built.ts')],
  base: './',
  build: {
    // The password checker loads zxcvbn with its dictionaries (about 1.8 MB) only on its own page.
    // The main bundle is guarded separately by the size check in .github/workflows/ci.yml.
    chunkSizeWarningLimit: 2000,
  },
});
