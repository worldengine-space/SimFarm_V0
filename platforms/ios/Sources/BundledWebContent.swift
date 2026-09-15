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
            let bytes = try Data(contentsOf: file)
            let mimeTypes = [
                "html": "text/html", "js": "application/javascript", "css": "text/css",
                "json": "application/json", "webmanifest": "application/manifest+json",
                "wav": "audio/wav", "svg": "image/svg+xml"
            ]
            let mime = mimeTypes[file.pathExtension] ??
                UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            let response = URLResponse(
                url: requestURL, mimeType: mime, expectedContentLength: bytes.count,
                textEncodingName: mime.hasPrefix("text/") ? "utf-8" : nil
            )
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
