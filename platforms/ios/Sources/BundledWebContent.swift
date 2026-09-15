import Foundation
import WebKit
import UniformTypeIdentifiers

/// A stable, local origin lets fetch() and persistent browser saves work offline.
final class BundledWebContent: NSObject, WKURLSchemeHandler {
    private let root = Bundle.main.bundleURL.appendingPathComponent("Web", isDirectory: true)

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let requestURL = urlSchemeTask.request.url, requestURL.host == "game" else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        let relativePath = requestURL.path == "/" ? "index.html" : String(requestURL.path.dropFirst())
        let file = root.appendingPathComponent(relativePath).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/") else {
            urlSchemeTask.didFailWithError(URLError(.noPermissionsToReadFile))
            return
        }
        do {
            var bytes = try Data(contentsOf: file)
            if ProcessInfo.processInfo.arguments.contains("--self-test"), relativePath == "game.js" {
                var script = String(decoding: bytes, as: UTF8.self)
                if let end = script.range(of: "})();", options: .backwards) {
                    script.insert(contentsOf: "globalThis.__simfarmIOSState = () => ({ ready, stage });\n", at: end.lowerBound)
                    bytes = Data(script.utf8)
                }
            }
            let mimeTypes = [
                "html": "text/html", "js": "application/javascript", "css": "text/css",
                "json": "application/json", "webmanifest": "application/manifest+json",
                "wav": "audio/wav", "svg": "image/svg+xml"
            ]
            let mime = mimeTypes[file.pathExtension] ??
                UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            guard let response = HTTPURLResponse(
                url: requestURL, statusCode: 200, httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": mime, "Content-Length": String(bytes.count)]
            ) else {
                throw URLError(.badServerResponse)
            }
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(bytes)
            urlSchemeTask.didFinish()
        } catch {
            urlSchemeTask.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // Reads are synchronous; no pending work survives start().
    }
}
