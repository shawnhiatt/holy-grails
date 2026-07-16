/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "*.svg" {
  const src: string;
  export default src;
}

// CLAUDE.md's iOS Safari truncation pattern requires the nonstandard
// -webkit-text-overflow property, which csstype doesn't know about.
// React renders vendor-prefixed camelCase properties fine — this only
// teaches the type system.
import "react";
declare module "react" {
  interface CSSProperties {
    WebkitTextOverflow?: string;
  }
}
