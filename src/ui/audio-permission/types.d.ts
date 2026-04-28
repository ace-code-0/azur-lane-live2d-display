export {};

declare global {
  interface Window {
    audioPlaybackPermissionReady?: Promise<void>;
  }
}