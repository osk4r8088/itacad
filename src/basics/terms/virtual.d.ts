/** The term index, built by the plugin in vite.config.ts; expand it with expandTermIndex. */
declare module 'virtual:term-index' {
  const terms: import('./build').TermIndexEntry[];
  export default terms;
}
