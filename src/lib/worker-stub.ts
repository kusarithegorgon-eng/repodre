// Stub for the `web-worker` package that elkjs bundles via CJS require.
// We pass our own browser-native workerFactory to ELK, so this module is
// never actually used — it just needs to exist so the import resolves.
export default class Worker {
  constructor() {
    throw new Error("web-worker stub: use ELK workerFactory instead");
  }
}
