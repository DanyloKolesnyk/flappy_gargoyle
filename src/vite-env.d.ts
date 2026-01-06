/// <reference types="vite/client" />

interface Window {
  ethereum?: any;
  Buffer?: any;
}

declare var window: Window & typeof globalThis;
declare var Buffer: any;