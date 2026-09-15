const fs = require("node:fs/promises");
const path = require("node:path");

// Runs inside the real packaged Electron process, with normal sandbox settings.
module.exports = async function selfTest(window, output, failures) {
  const web = window.webContents;
  const evaluate = (source) => web.executeJavaScript(source, true);
  const waitFor = async (source) => {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (await evaluate(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error(`Timed out: ${source}`);
  };
  await fs.mkdir(output, { recursive: true });
  await waitFor(
    "document.getElementById('launch-game')?.disabled === false && Array.from(document.querySelectorAll('#launch-screen img')).every(image => image.complete && image.naturalWidth > 0)",
  );
  await fs.writeFile(
    path.join(output, "splash.png"),
    (await web.capturePage()).toPNG(),
  );
  await waitFor("document.getElementById('launch-game')?.disabled === false");
  await evaluate(
    "window.__sfDesktopTestEnabled = true; document.getElementById('launch-game').click()",
  );
  await waitFor("window.__sfDesktopTest?.ready() === true");

  const downloaded = new Promise((resolve, reject) => {
    web.session.once("will-download", (_event, item) => {
      item.setSavePath(path.join(output, "TEST.SFM"));
      item.once("done", (_doneEvent, state) =>
        state === "completed" ? resolve() : reject(Error(`Download ${state}`)),
      );
    });
  });
  const farm = await evaluate("window.__sfDesktopTest.exercise()");
  if (farm !== true) throw Error("Farm save/import failed");
  await downloaded;
  const save = await fs.readFile(path.join(output, "TEST.SFM"));
  if (save.length !== 139072)
    throw Error(`Unexpected save size ${save.length}`);
  await fs.writeFile(
    path.join(output, "game.png"),
    (await web.capturePage()).toPNG(),
  );

  // Reload the actual page to prove browser storage survives a new document.
  await new Promise((resolve) => {
    web.once("did-finish-load", resolve);
    web.reload();
  });
  await waitFor("document.getElementById('launch-game')?.disabled === false");
  await evaluate(
    "window.__sfDesktopTestEnabled = true; document.getElementById('launch-game').click()",
  );
  await waitFor("window.__sfDesktopTest?.ready() === true");
  if ((await evaluate("window.__sfDesktopTest.restore()")) !== true)
    throw Error("Saved farm did not restore");
  if (failures.length) throw Error(failures.join("\n"));
  return {
    success: true,
    platform: process.platform,
    arch: process.arch,
    message:
      "Splash, bundled assets, farm creation, SFM export/import, persistent save and reload passed",
    saveBytes: save.length,
  };
};
