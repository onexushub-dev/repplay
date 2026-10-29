// Jest stand-in for the native MMKV store: an in-memory map per id, so modules that open storage at import time
// (src/data/mmkv.ts) load in tests that do not mock it themselves.
export function createMMKV({ id }: { id?: string } = {}) {
  const map = new Map<string, string>();
  void id;
  return {
    getString: (k: string) => map.get(k),
    set: (k: string, v: string) => void map.set(k, v),
    remove: (k: string) => map.delete(k),
    getAllKeys: () => [...map.keys()],
  };
}
