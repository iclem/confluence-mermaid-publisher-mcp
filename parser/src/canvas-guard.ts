import { execFileSync } from "node:child_process";
import { renameSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// canvas ships a platform-specific native binding. When node_modules is shared
// across platforms (macOS host + Linux dev container on a mounted volume), a
// foreign binding hard-kills the process (SIGKILL) at load time — and jsdom
// optionally require()s canvas, so a broken binding takes down any mermaid
// parsing, not just geometry extraction. Probe the binding in a child process
// and park the package aside when it is unusable on this platform; npm
// install/rebuild restores it for the current platform on demand.
function disableBrokenCanvas(): void {
  let packageJsonPath: string;
  try {
    packageJsonPath = createRequire(import.meta.url).resolve("canvas/package.json");
  } catch {
    return; // canvas not installed or already parked
  }
  const packageDir = dirname(packageJsonPath);
  try {
    const entryPoint = join(packageDir, "lib", "canvas.js");
    execFileSync(process.execPath, ["-e", `require(${JSON.stringify(entryPoint)})`], {
      stdio: "ignore",
    });
  } catch {
    try {
      renameSync(packageDir, `${packageDir}.disabled-${process.platform}-${process.arch}`);
    } catch {
      // best effort: if parking fails, leave the package untouched
    }
  }
}

disableBrokenCanvas();
