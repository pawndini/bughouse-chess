const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

let serverProcess;
let mainWindow;
let shuttingDown = false;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not choose a local Bug Bully port."));
        return;
      }
      const { port } = address;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (serverProcess?.exitCode !== null && serverProcess?.exitCode !== undefined) {
      throw new Error(`Bug Bully server exited with code ${serverProcess.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local Next.js server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Bug Bully server did not become ready in time.");
}

async function startRelay() {
  const port = await getFreePort();
  const serverRoot = path.join(process.resourcesPath, "relay-server");
  const serverEntry = path.join(serverRoot, "server.js");
  const url = `http://127.0.0.1:${port}`;

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: serverRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "production",
    },
    stdio: "ignore",
    windowsHide: true,
  });
  serverProcess.once("error", (error) => console.error("Unable to start Bug Bully server:", error));

  await waitForServer(url);

  mainWindow = new BrowserWindow({
    title: "Bug Bully",
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 640,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith("https://")) void shell.openExternal(target);
    return { action: "deny" };
  });
  await mainWindow.loadURL(url);
}

function stopServer() {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
  }
}

app.whenReady().then(startRelay).catch((error) => {
  console.error("Bug Bully failed to start:", error);
  app.quit();
});

app.on("before-quit", () => {
  if (shuttingDown) return;
  shuttingDown = true;
  stopServer();
});

app.on("window-all-closed", () => {
  stopServer();
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && !shuttingDown) {
    startRelay().catch((error) => {
      console.error("Bug Bully failed to restart:", error);
      app.quit();
    });
  }
});
