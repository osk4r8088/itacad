import { buildIndex } from './build';

// Entry for the plugin in vite.config.ts. The index is awaited here because the topics load on demand,
// and the module runner of the plugin is gone once this module has been imported.
export default await buildIndex();
