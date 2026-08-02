import "@testing-library/jest-dom/vitest";

Object.defineProperty(globalThis, "File", { writable: true, value: window.File });
Object.defineProperty(globalThis, "FormData", { writable: true, value: window.FormData });

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(URL, "createObjectURL", {
  writable: true,
  value: () => "blob:test",
});

Object.defineProperty(URL, "revokeObjectURL", {
  writable: true,
  value: () => undefined,
});

Object.defineProperty(HTMLAnchorElement.prototype, "click", {
  writable: true,
  value: () => undefined,
});
