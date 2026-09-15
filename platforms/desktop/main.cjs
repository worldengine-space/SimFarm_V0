const { app, BrowserWindow, Menu, net, protocol, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const testing = process.argv.includes("--self-test");
const outputOption = process.argv.find((arg) =>
  arg.startsWith("--test-output="),
);
const testOutput = path.resolve(
  outputOption?.slice("--test-output=".length) || "desktop-test-results",
);
const failures = [];
if (testing)
  app.setPath(
    "userData",
    path.join(os.tmpdir(), `simfarm-test-${process.pid}`),
  );

async function finishTest(report) {
  await fs.mkdir(testOutput, { recursive: true });
  await fs.writeFile(
    path.join(testOutput, "result.json"),
    JSON.stringify(report, null, 2),
  );
  app.exit(report.success ? 0 : 1);
}
const { pathToFileURL } = require("node:url");

// A stable private origin keeps browser saves across launches, without a server.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "simfarm",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

function createWindow() {
  const window = new BrowserWindow({
    title: "SimFarm V0",
    width: 1024,
    height: 800,
    minWidth: 640,
    minHeight: 520,
    backgroundColor: "#000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  const openExternal = (url) => {
    if (
      [
        "https://worldengine.space",
        "https://twitter.com",
        "https://x.com",
        "https://www.linkedin.com",
        "https://linkedin.com",
      ].includes(new URL(url).origin)
    ) {
      void shell.openExternal(url);
    }
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("simfarm://game/")) {
      event.preventDefault();
      openExternal(url);
    }
  });
  if (testing) {
    setTimeout(() => {
      void finishTest({
        success: false,
        message: "Runtime test exceeded 90 seconds",
      });
    }, 90000);
    window.webContents.on("render-process-gone", (_event, details) => {
      void finishTest({ success: false, message: JSON.stringify(details) });
    });
    window.webContents.on("did-fail-load", (_event, code, message) =>
      failures.push(`${code}: ${message}`),
    );
    window.webContents.once("did-finish-load", async () => {
      try {
        await finishTest(
          await require("./self-test.cjs")(window, testOutput, failures),
        );
      } catch (error) {
        await finishTest({ success: false, message: error.stack });
      }
    });
  }
  window.loadURL("simfarm://game/index.html");
}

app.whenReady().then(() => {
  const gameRoot = path.join(__dirname, "game");
  protocol.handle("simfarm", async (request) => {
    const url = new URL(request.url);
    const file = path.resolve(gameRoot, "." + decodeURIComponent(url.pathname));
    if (url.host !== "game" || !file.startsWith(gameRoot + path.sep)) {
      return new Response("Not found", { status: 404 });
    }
    try {
      const response = await net.fetch(pathToFileURL(file).href);
      if (!response.ok) failures.push(`${response.status}: ${request.url}`);
      return response;
    } catch (error) {
      failures.push(`${request.url}: ${error.message}`);
      return new Response("Not found", { status: 404 });
    }
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Game",
        submenu: [
          { role: "togglefullscreen" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
    ]),
  );
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
