// Ambient type stub for the canvas package so the parser still typechecks
// when canvas-guard.ts parks the package (wrong-platform native binding moved
// aside as node_modules/canvas.disabled-*). Only the surface the render shims
// use is declared; the real package types apply whenever canvas is installed.
declare module "canvas" {
  export function createCanvas(width: number, height: number): {
    getContext(contextId: "2d"): {
      font: string;
      measureText(text: string): { width: number };
    };
  };
}
