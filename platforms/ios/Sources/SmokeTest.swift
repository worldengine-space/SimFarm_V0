import Foundation

/// Enabled only by the CI launch argument; production launches expose no observer.
enum SmokeTest {
    static let script = #"""
    (async () => {
      const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
      const waitFor = async (condition, label) => {
        const deadline = Date.now() + 90000;
        while (!condition()) {
          if (Date.now() > deadline) throw new Error("Timed out: " + label);
          await pause(200);
        }
      };
      const report = (status, detail) => window.webkit.messageHandlers.saveFiles.postMessage({
        action: "smoke", status, detail
      });
      try {
        await waitFor(() => document.getElementById("launch-game")?.disabled === false, "Play countdown");
        document.getElementById("launch-game").click();
        await waitFor(() => window.__simfarmIOSState?.().ready, "game assets and data");
        const canvas = document.getElementById("simfarm");
        // Synthetic pointer events have no OS pointer to capture. Keep game
        // event routing intact while bypassing only browser pointer capture.
        canvas.setPointerCapture = () => {};
        canvas.releasePointerCapture = () => {};
        const click = async (x, y) => {
          const bounds = canvas.getBoundingClientRect();
          const point = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch",
            clientX: bounds.left + x * bounds.width / 640,
            clientY: bounds.top + y * bounds.height / 480, button: 0 };
          canvas.dispatchEvent(new PointerEvent("pointerdown", { ...point, buttons: 1 }));
          canvas.dispatchEvent(new PointerEvent("pointerup", { ...point, buttons: 0 }));
          await pause(250);
        };
        if (window.__simfarmIOSState().stage === "presents") await click(320, 240);
        if (window.__simfarmIOSState().stage === "title") await click(320, 240);
        await waitFor(() => window.__simfarmIOSState().stage === "region", "region selection");
        await click(272, 96);
        await click(150, 244);
        await waitFor(() => window.__simfarmIOSState().stage === "game", "farm gameplay");
        await pause(1000);
        const pixels = canvas.getContext("2d").getImageData(0, 0, 640, 480).data;
        const colors = new Set();
        for (let i = 0; i < pixels.length; i += 16) colors.add(pixels[i] + "," + pixels[i+1] + "," + pixels[i+2]);
        // The original artwork uses a 16-color palette. Reference farm
        // screenshots contain 15 colors, so require most of that palette.
        if (colors.size < 10) throw new Error("Game canvas lacks rendered scenery (" + colors.size + " colors)");
        report("passed", "Play countdown, asset/data loading, touch navigation, region start and rendered farm passed");
      } catch (error) { report("failed", error.message); }
    })();
    """#
}
