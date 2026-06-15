import type { DocSorterApi } from "../preload/preload";

declare global {
  interface Window {
    docSorter: DocSorterApi;
  }
}

export {};
