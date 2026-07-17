/**
 * securityCleanup - clears localStorage, sessionStorage, CacheStorage and
 * attempts to delete all IndexedDB databases available in the browser.
 */
export async function securityCleanup() {
  try {
    // Conservative full-clear utility (falls back to best-effort)
    localStorage.clear();
    sessionStorage.clear();

    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }

    // Attempt to remove all indexedDB databases
    const idb = (indexedDB as any);
    if (idb && typeof idb.databases === "function") {
      try {
        const dbs = await idb.databases();
        await Promise.all(
          dbs.map((d: any) =>
            d.name
              ? new Promise((res) => {
                  const req = indexedDB.deleteDatabase(d.name);
                  req.onsuccess = () => res(true);
                  req.onerror = () => res(true);
                  req.onblocked = () => res(true);
                })
              : Promise.resolve(true)
          )
        );
      } catch {}
    }
  } catch (err) {
    console.error("securityCleanup failed:", err);
  }
}

export async function clearUserSessionData(userId: string) {
  try {
    // Remove user-scoped localStorage keys (recent projects and other keys containing userId)
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.includes(userId) || k.startsWith("rp_encrypted_v1:")) {
          localStorage.removeItem(k);
        }
      }
    } catch {}

    sessionStorage.clear();

    // Attempt to delete indexedDB databases that include the userId
    const idb = (indexedDB as any);
    if (idb && typeof idb.databases === "function") {
      try {
        const dbs = await idb.databases();
        await Promise.all(
          dbs.map((d: any) =>
            d.name && d.name.includes(userId)
              ? new Promise((res) => {
                  const req = indexedDB.deleteDatabase(d.name);
                  req.onsuccess = () => res(true);
                  req.onerror = () => res(true);
                  req.onblocked = () => res(true);
                })
              : Promise.resolve(true)
          )
        );
      } catch {}
    }
  } catch (err) {
    console.error("clearUserSessionData failed:", err);
  }
}
