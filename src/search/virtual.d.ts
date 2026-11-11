/** The search index, built by the plugin in vite.config.ts. */
declare module 'virtual:search-index' {
  const docs: import('./schema').SearchDoc[];
  export default docs;
}
