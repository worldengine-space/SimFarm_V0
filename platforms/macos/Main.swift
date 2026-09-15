import Cocoa
import Network
import WebKit

// Bundled static files only. Ephemeral loopback port; no external service.
final class LocalFiles {
  let root: URL
  let listener: NWListener
  let queue = DispatchQueue(label: "native-game.files")
  init(root: URL) throws {
    self.root = root.resolvingSymlinksInPath()
    let parameters = NWParameters.tcp
    parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
    listener = try NWListener(using: parameters)
  }
  func start(_ ready: @escaping (UInt16) -> Void, failure: @escaping (Error) -> Void) {
    listener.stateUpdateHandler = { state in
      if case .ready = state, let port = self.listener.port {
        DispatchQueue.main.async { ready(port.rawValue) }
      }
      if case .failed(let error) = state { DispatchQueue.main.async { failure(error) } }
    }
    listener.newConnectionHandler = { connection in
      connection.start(queue: self.queue)
      self.receive(connection, Data())
    }
    listener.start(queue: queue)
  }
  func receive(_ connection: NWConnection, _ prior: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) {
      data, _, complete, error in
      var request = prior
      request.append(data ?? Data())
      if request.count > 16384 {
        connection.cancel()
        return
      }
      if let header = String(data: request, encoding: .utf8), header.contains("\r\n\r\n") {
        let fields = header.components(separatedBy: "\r\n")[0].split(separator: " ")
        guard fields.count == 3, fields[0] == "GET",
          let components = URLComponents(string: String(fields[1]))
        else {
          connection.cancel()
          return
        }
        let relative = components.path == "/" ? "index.html" : String(components.path.dropFirst())
        let target = self.root.appendingPathComponent(relative).resolvingSymlinksInPath()
        guard target.path.hasPrefix(self.root.path + "/"), let body = try? Data(contentsOf: target)
        else {
          self.send(connection, "404 Not Found", "text/plain", Data("Not found".utf8))
          return
        }
        let types = [
          "html": "text/html; charset=utf-8", "mjs": "text/javascript", "js": "text/javascript",
          "json": "application/json", "png": "image/png", "css": "text/css", "wav": "audio/wav",
          "ogg": "audio/ogg", "mid": "audio/midi", "svg": "image/svg+xml",
          "webmanifest": "application/manifest+json",
        ]
        self.send(
          connection, "200 OK", types[target.pathExtension] ?? "application/octet-stream", body)
      } else if !complete && error == nil {
        self.receive(connection, request)
      } else {
        connection.cancel()
      }
    }
  }
  func send(_ connection: NWConnection, _ status: String, _ mime: String, _ body: Data) {
    var response = Data(
      "HTTP/1.1 \(status)\r\nContent-Type: \(mime)\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
        .utf8)
    response.append(body)
    connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
  }
}

final class GameApp: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler,
  WKUIDelegate
{
  var window: NSWindow!
  var web: WKWebView!
  var server: LocalFiles!
  var origin: URL!
  let selfTest = CommandLine.arguments.contains("--self-test")
  let scoreKey = "simfarm-v0.save"
  let testDomain = "space.worldengine.simfarm.test." + UUID().uuidString
  lazy var scoreStore = selfTest ? UserDefaults(suiteName: testDomain)! : UserDefaults.standard
  var testReloaded = false
  func applicationDidFinishLaunching(_ notification: Notification) {
    let menu = NSMenu()
    let appItem = NSMenuItem()
    let appMenu = NSMenu()
    appMenu.addItem(
      withTitle: "About SimFarm V0",
      action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    appMenu.addItem(
      withTitle: "Quit SimFarm V0", action: #selector(NSApplication.terminate(_:)),
      keyEquivalent: "q")
    appItem.submenu = appMenu
    menu.addItem(appItem)
    let gameItem = NSMenuItem(title: "Game", action: nil, keyEquivalent: "")
    let gameMenu = NSMenu(title: "Game")
    let restart = NSMenuItem(
      title: "Restart Game…", action: #selector(restartGame), keyEquivalent: "r")
    restart.target = self
    gameMenu.addItem(restart)
    let full = NSMenuItem(
      title: "Toggle Full Screen", action: #selector(fullScreen), keyEquivalent: "f")
    full.keyEquivalentModifierMask = [.command, .control]
    full.target = self
    gameMenu.addItem(full)
    gameItem.submenu = gameMenu
    menu.addItem(gameItem)
    NSApp.mainMenu = menu
    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1024, height: 768),
      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false
    )
    window.title = "SimFarm V0"
    window.minSize = NSSize(width: 640, height: 502)
    window.collectionBehavior = [.fullScreenPrimary]
    window.center()
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.mediaTypesRequiringUserActionForPlayback = []
    configuration.userContentController.add(self, name: "scores")
    configuration.userContentController.add(self, name: "saveFile")
    installScoreBridge(configuration.userContentController)
    web = WKWebView(frame: .zero, configuration: configuration)
    web.navigationDelegate = self
    web.uiDelegate = self
    window.contentView = web
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    do {
      server = try LocalFiles(root: Bundle.main.resourceURL!.appendingPathComponent("game"))
      server.start(
        { port in
          self.origin = URL(string: "http://127.0.0.1:\(port)/")!
          self.web.load(URLRequest(url: self.origin))
        }, failure: { self.fail($0.localizedDescription) })
    } catch { fail(error.localizedDescription) }
    if selfTest {
      DispatchQueue.main.asyncAfter(deadline: .now() + 35) { self.finishTest(false, "Timed out") }
    }
  }
  func installScoreBridge(_ controller: WKUserContentController) {
    let stored = scoreStore.string(forKey: scoreKey)
    let encoded = String(
      data: try! JSONSerialization.data(withJSONObject: [stored as Any? ?? NSNull()]),
      encoding: .utf8)!
    let script = """
      window.__sfTestEnabled=\(selfTest ? "true" : "false");
      (()=>{let saved=\(encoded)[0]; window.nativeScoreStore={
      getItem(key){return saved;},setItem(key,value){saved=value;window.webkit.messageHandlers.scores.postMessage(value);}};})();
      """
    controller.removeAllUserScripts()
    controller.addUserScript(
      WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
  }
  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    if message.name == "saveFile", message.frameInfo.isMainFrame,
      let payload = message.body as? [String: String], let encoded = payload["base64"],
      let data = Data(base64Encoded: encoded), data.count <= 2_000_000
    {
      if selfTest {
        let path = ProcessInfo.processInfo.environment["SF_APP_TEST_DIR"] ?? NSTemporaryDirectory()
        do {
          try data.write(to: URL(fileURLWithPath: path).appendingPathComponent("TEST.SFM"))
        } catch { finishTest(false, error.localizedDescription) }
        return
      }
      let panel = NSSavePanel()
      panel.nameFieldStringValue = payload["name"] ?? "SIMFARM.SFM"
      panel.beginSheetModal(for: window) { response in
        if response == .OK, let url = panel.url {
          do { try data.write(to: url, options: .atomic) } catch {
            self.fail(error.localizedDescription)
          }
        }
      }
      return
    }
    guard message.frameInfo.isMainFrame, message.name == "scores",
      let text = message.body as? String,
      let bytes = text.data(using: .utf8), bytes.count <= 4_000_000,
      let values = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
      values["state"] != nil
    else { return }
    scoreStore.set(text, forKey: scoreKey)
  }
  func webView(
    _ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
    initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void
  ) {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = false
    panel.allowsMultipleSelection = false
    panel.beginSheetModal(for: window) { response in
      completionHandler(response == .OK ? panel.urls : nil)
    }
  }
  func openExternal(_ url: URL?) {
    guard let url = url, url.scheme == "https",
      ["worldengine.space", "twitter.com", "x.com", "www.linkedin.com", "linkedin.com"].contains(
        url.host ?? "")
    else { return }
    NSWorkspace.shared.open(url)
  }
  func webView(
    _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    openExternal(navigationAction.request.url)
    return nil
  }
  func webView(
    _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    let url = navigationAction.request.url
    if navigationAction.targetFrame?.isMainFrame == true {
      installScoreBridge(web.configuration.userContentController)
    }
    if navigationAction.navigationType == .linkActivated { openExternal(url) }
    decisionHandler(url?.host == "127.0.0.1" && url?.port == origin?.port ? .allow : .cancel)
  }
  func webView(
    _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) { fail(error.localizedDescription) }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard selfTest else { return }
    launchTestWhenReady()
  }
  func launchTestWhenReady() {
    web.evaluateJavaScript(
      "(() => { const button = document.getElementById('launch-game'); if (!button || button.disabled) return false; button.click(); return true; })()"
    ) { result, error in
      if let error = error {
        self.finishTest(false, error.localizedDescription)
        return
      }
      if result as? Bool != true {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.launchTestWhenReady() }
        return
      }
      self.pollTest()
    }
  }
  func pollTest() {
    web.evaluateJavaScript("window.__sfTest?.ready() === true") { result, error in
      if let error = error {
        self.finishTest(false, error.localizedDescription)
        return
      }
      if result as? Bool != true {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.pollTest() }
        return
      }
      if self.testReloaded {
        self.web.evaluateJavaScript("window.__sfTest.restore()") { result, error in
          self.finishTest(
            error == nil && result as? Bool == true,
            "Bundled assets, farm rendering, SFM export/import, native save persistence and reload passed"
          )
        }
        return
      }
      self.web.evaluateJavaScript("window.__sfTest.exercise()") { result, error in
        if let error = error {
          self.finishTest(false, error.localizedDescription)
          return
        }
        guard result as? Bool == true else {
          self.finishTest(false, "Gameplay/save round trip failed")
          return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.snapshotTest() }
      }
    }
  }
  func snapshotTest() {
    web.takeSnapshot(with: nil) { image, error in
      guard let image = image, let tiff = image.tiffRepresentation,
        let bitmap = NSBitmapImageRep(data: tiff),
        let png = bitmap.representation(using: .png, properties: [:])
      else {
        self.finishTest(false, error?.localizedDescription ?? "Snapshot failed")
        return
      }
      let path = ProcessInfo.processInfo.environment["SF_APP_TEST_DIR"] ?? NSTemporaryDirectory()
      do {
        try png.write(to: URL(fileURLWithPath: path).appendingPathComponent("game.png"))
        let save = try Data(
          contentsOf: URL(fileURLWithPath: path).appendingPathComponent("TEST.SFM"))
        guard save.count > 1000, self.scoreStore.string(forKey: self.scoreKey) != nil else {
          self.finishTest(false, "Native file/cache save failed")
          return
        }
      } catch {
        self.finishTest(false, error.localizedDescription)
        return
      }
      self.testReloaded = true
      self.web.reload()
    }
  }
  func finishTest(_ success: Bool, _ message: String) {
    guard selfTest else { return }
    let report: [String: Any] = [
      "success": success, "message": message, "bundle": Bundle.main.bundlePath,
    ]
    let path = ProcessInfo.processInfo.environment["SF_APP_TEST_DIR"] ?? NSTemporaryDirectory()
    if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted]) {
      try? data.write(to: URL(fileURLWithPath: path).appendingPathComponent("result.json"))
    }
    scoreStore.removePersistentDomain(forName: testDomain)
    exit(success ? 0 : 1)
  }
  func fail(_ message: String) {
    if selfTest {
      finishTest(false, message)
      return
    }
    let alert = NSAlert()
    alert.messageText = "Unable to start the game"
    alert.informativeText = message
    alert.runModal()
  }
  @objc func restartGame() {
    let alert = NSAlert()
    alert.messageText = "Restart the game?"
    alert.informativeText = "Unsaved changes will be lost. Saved farm files will remain."
    alert.addButton(withTitle: "Restart")
    alert.addButton(withTitle: "Cancel")
    if alert.runModal() == .alertFirstButtonReturn { web.reload() }
  }
  @objc func fullScreen() { window.toggleFullScreen(nil) }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
  func applicationWillTerminate(_ notification: Notification) { server?.listener.cancel() }
}
let app = NSApplication.shared
let delegate = GameApp()
app.setActivationPolicy(.regular)
app.delegate = delegate
app.run()
