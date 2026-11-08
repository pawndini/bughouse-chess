import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const stageRoot = path.join(projectRoot, ".desktop-stage");

await rm(stageRoot, { recursive: true, force: true });
await mkdir(stageRoot, { recursive: true });
await cp(standaloneRoot, stageRoot, { recursive: true });
await cp(path.join(projectRoot, ".next", "static"), path.join(stageRoot, ".next", "static"), { recursive: true });
await cp(path.join(projectRoot, "public"), path.join(stageRoot, "public"), { recursive: true });
console.log(`Prepared standalone Bug Bully server at ${stageRoot}`);
