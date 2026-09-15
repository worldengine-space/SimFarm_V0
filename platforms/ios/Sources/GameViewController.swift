import UIKit
import WebKit
import UniformTypeIdentifiers

final class GameViewController: UIViewController, WKScriptMessageHandler,
    UIDocumentPickerDelegate, WKNavigationDelegate {
    private var webView: WKWebView!
    private var exportedFile: URL?

    override var prefersStatusBarHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(BundledWebContent(), forURLScheme: "simfarm")
        configuration.allowsInlineMediaPlayback = true
        configuration.userContentController.add(self, name: "saveFiles")
        configuration.userContentController.addUserScript(WKUserScript(
            source: Self.fileBridge, injectionTime: .atDocumentStart, forMainFrameOnly: true
        ))
        if ProcessInfo.processInfo.arguments.contains("--self-test") {
            configuration.userContentController.addUserScript(WKUserScript(
                source: SmokeTest.script, injectionTime: .atDocumentEnd, forMainFrameOnly: true
            ))
        }
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.bounces = false
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
        webView.load(URLRequest(url: URL(string: "simfarm://game/index.html")!))
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "simfarm",
              let payload = message.body as? [String: String] else { return }
        if payload["action"] == "smoke", ProcessInfo.processInfo.arguments.contains("--self-test") {
            if let result = try? JSONSerialization.data(withJSONObject: payload),
               let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
                try? result.write(to: directory.appendingPathComponent("smoke.json"), options: .atomic)
            }
            return
        }
        if payload["action"] == "import" {
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data], asCopy: true)
            picker.delegate = self
            present(picker, animated: true)
        } else if payload["action"] == "export",
                  let base64 = payload["base64"], base64.count <= 1_000_000,
                  let bytes = Data(base64Encoded: base64) {
            do {
                let name = URL(fileURLWithPath: payload["name"] ?? "SIMFARM.SFM").lastPathComponent
                let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let file = directory.appendingPathComponent(name.isEmpty ? "SIMFARM.SFM" : name)
                try bytes.write(to: file)
                exportedFile = file
                let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                share.popoverPresentationController?.sourceView = view
                share.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
                share.completionWithItemsHandler = { [weak self] _, _, _, _ in
                    try? FileManager.default.removeItem(at: directory)
                    self?.exportedFile = nil
                }
                present(share, animated: true)
            } catch { showError(error.localizedDescription) }
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let file = urls.first else { return }
        do {
            let bytes = try Data(contentsOf: file)
            guard bytes.count == 139_072 else {
                showError("A SimFarm save must contain exactly 139,072 bytes.")
                webView.evaluateJavaScript("window.simfarmCancelImport()")
                return
            }
            let values = try JSONSerialization.data(withJSONObject: [bytes.base64EncodedString(), file.lastPathComponent])
            let arguments = String(decoding: values, as: UTF8.self)
            webView.evaluateJavaScript("window.simfarmReceiveFile(...\(arguments))") { [weak self] _, error in
                if let error = error { self?.showError(error.localizedDescription) }
            }
        } catch {
            webView.evaluateJavaScript("window.simfarmCancelImport()")
            showError(error.localizedDescription)
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        webView.evaluateJavaScript("window.simfarmCancelImport()")
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.scheme == "https" || url.scheme == "http" {
            UIApplication.shared.open(url)
        }
        decisionHandler(url.scheme == "simfarm" ? .allow : .cancel)
    }

    private func showError(_ message: String) {
        let alert = UIAlertController(title: "SimFarm", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    /// Keeps the browser game's file controls unchanged while using iOS Files and sharing.
    private static let fileBridge = #"""
    (() => {
      let pendingInput;
      const inputClick = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function () {
        if (this.type !== "file") return inputClick.call(this);
        pendingInput = this;
        window.webkit.messageHandlers.saveFiles.postMessage({ action: "import" });
      };
      window.simfarmCancelImport = () => {
        pendingInput?.dispatchEvent(new Event("cancel", { bubbles: true }));
        pendingInput = null;
      };
      window.simfarmReceiveFile = (base64, name) => {
        if (!pendingInput) return;
        const bytes = Uint8Array.from(atob(base64), value => value.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], name, { type: "application/octet-stream" }));
        pendingInput.files = transfer.files;
        pendingInput.dispatchEvent(new Event("change", { bubbles: true }));
        pendingInput = null;
      };
      window.SimFarmHost = {
        saveFile(name, base64) {
          window.webkit.messageHandlers.saveFiles.postMessage({ action: "export", name, base64 });
        }
      };
    })();
    """#
}
