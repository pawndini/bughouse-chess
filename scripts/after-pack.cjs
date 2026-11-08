/* global require, exports */
/* eslint-disable @typescript-eslint/no-require-imports */
const { cp } = require("node:fs/promises");
const path = require("node:path");

// electron-builder filters node_modules from extraResources. Restore the exact
// dependencies traced by Next.js so the installed server runs independently.
exports.default = async function afterPack(context) {
  const source = path.join(context.packager.projectDir, ".desktop-stage", "node_modules");
  const target = path.join(context.appOutDir, "resources", "relay-server", "node_modules");
  await cp(source, target, { recursive: true });
};
