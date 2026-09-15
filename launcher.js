// The shared launch screen is used by the web, desktop, and mobile packages.
(() => {
  "use strict";
  const button = document.getElementById("launch-game");
  const splash = document.getElementById("launch-screen");
  const stage = document.getElementById("game-stage");
  const status = document.getElementById("launch-status");
  let started = false;
  let countdownFinished = false;
  const background = document.getElementById("launch-background");
  const countdown = document.getElementById("launch-countdown");
  const beginCountdown = () => {
    const start = performance.now();
    const update = () => {
      const remaining = Math.max(0, 5 - (performance.now() - start) / 1000);
      countdown.textContent =
        remaining > 0
          ? `Your world opens in ${Math.ceil(remaining)}…`
          : "Your world is ready.";
      if (remaining > 0) setTimeout(update, 100);
      else {
        countdownFinished = true;
        button.disabled = false;
      }
    };
    // The first countdown frame follows image load and one painted frame.
    requestAnimationFrame(() => requestAnimationFrame(update));
  };
  if (background.complete) beginCountdown();
  else {
    background.addEventListener("load", beginCountdown, { once: true });
    background.addEventListener("error", beginCountdown, { once: true });
  }

  const canvas = document.getElementById("simfarm");
  const touchTools = document.getElementById("touch-tools");
  const keyboard = document.getElementById("touch-keyboard");
  const keyboardToggle = document.getElementById("toggle-touch-keyboard");
  const input = document.getElementById("touch-text");
  const sendKey = (key) =>
    canvas.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  const showKeyboard = (show) => {
    keyboard.hidden = !show;
    keyboardToggle.setAttribute("aria-expanded", String(show));
    if (show) input.focus();
    else {
      input.blur();
      canvas.focus();
    }
  };
  keyboardToggle.addEventListener("click", () => showKeyboard(keyboard.hidden));
  document
    .getElementById("close-touch-keyboard")
    .addEventListener("click", () => showKeyboard(false));
  input.addEventListener("input", () => {
    for (const key of input.value) sendKey(key);
    input.value = "";
  });
  input.addEventListener("keydown", (event) => {
    if (["Enter", "Backspace", "Escape"].includes(event.key)) {
      event.preventDefault();
      sendKey(event.key);
    }
  });
  document
    .querySelectorAll("[data-game-key]")
    .forEach((key) =>
      key.addEventListener("click", () => sendKey(key.dataset.gameKey)),
    );
  const secondary = document.getElementById("touch-secondary");
  let secondaryArmed = false;
  let secondaryPointer = null;
  const setSecondary = (enabled) => {
    secondaryArmed = enabled;
    secondary.setAttribute("aria-pressed", String(enabled));
    secondary.textContent = enabled
      ? "Right-click: tap game"
      : "Right-click: off";
  };
  secondary.addEventListener("click", () => setSecondary(!secondaryArmed));
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (!secondaryArmed || !event.isTrusted) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setSecondary(false);
      secondaryPointer = event.pointerId;
      canvas.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          clientX: event.clientX,
          clientY: event.clientY,
          button: 2,
          buttons: 2,
        }),
      );
    },
    true,
  );
  for (const type of ["pointermove", "pointerup", "pointercancel"])
    canvas.addEventListener(
      type,
      (event) => {
        if (event.pointerId !== secondaryPointer) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (type !== "pointermove") secondaryPointer = null;
      },
      true,
    );

  button.addEventListener("click", () => {
    if (started || !countdownFinished) return;
    started = true;
    button.disabled = true;
    status.textContent = "Opening your farm…";
    const script = document.createElement("script");
    script.src = "game.js";
    script.onload = () => {
      splash.hidden = true;
      stage.hidden = false;
      touchTools.hidden = false;
      document.body.classList.add("playing");
      document.getElementById("simfarm").focus();
    };
    script.onerror = () => {
      script.remove();
      started = false;
      button.disabled = false;
      status.textContent = "The game could not load. Please try again.";
    };
    document.body.append(script);
  });

  // Only packaged web builds enable offline caching. Native shells already
  // bundle their assets, and development should always use fresh source files.
  if (
    document.querySelector('meta[name="simfarm-offline"]') &&
    "serviceWorker" in navigator &&
    window.isSecureContext
  ) {
    navigator.serviceWorker
      .register("service-worker.js")
      .then(async () => {
        await navigator.serviceWorker.ready;
        if (!started) status.textContent = "Ready to play offline.";
      })
      .catch(() => {
        if (!started)
          status.textContent = "Play online. Offline storage is unavailable.";
      });
  }
})();
