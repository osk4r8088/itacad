import { buildTermIndex } from './build';

// Entry for the plugin in vite.config.ts, like src/search/built.ts.
export default await buildTermIndex();
