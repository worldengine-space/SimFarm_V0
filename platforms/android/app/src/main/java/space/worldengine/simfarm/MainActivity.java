package space.worldengine.simfarm;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;

/** Offline game host. Only APK assets are accessible to the embedded browser. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net/";
    private static final int OPEN_SAVE = 1;
    private static final int WRITE_SAVE = 2;
    private WebView game;
    private ValueCallback<Uri[]> fileSelection;
    private byte[] pendingSave;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        game = new WebView(this);
        game.setBackgroundColor(0xff000000);
        game.getSettings().setJavaScriptEnabled(true);
        game.getSettings().setDomStorageEnabled(true);
        game.getSettings().setAllowFileAccess(false);
        // Content URIs are required for files explicitly selected in Android's picker.
        game.getSettings().setAllowContentAccess(true);
        game.getSettings().setMediaPlaybackRequiresUserGesture(false);
        game.addJavascriptInterface(new SaveBridge(), "SimFarmHost");
        game.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request.getUrl().toString().startsWith(ORIGIN)) return false;
                if (request.isForMainFrame() && "https".equals(request.getUrl().getScheme())) {
                    startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!uri.toString().startsWith(ORIGIN)) return missingResource();
                String path = uri.getPath().substring(1);
                if (path.isEmpty()) path = "index.html";
                if (path.contains("..")) return missingResource();
                String extension = MimeTypeMap.getFileExtensionFromUrl(path);
                String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
                if (extension.equals("js")) mime = "text/javascript";
                if (mime == null) mime = "application/octet-stream";
                try {
                    return new WebResourceResponse(mime, "UTF-8", getAssets().open(path));
                } catch (IOException error) {
                    return missingResource();
                }
            }
        });
        game.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                                       FileChooserParams parameters) {
                if (fileSelection != null) fileSelection.onReceiveValue(null);
                fileSelection = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("*/*");
                startActivityForResult(picker, OPEN_SAVE);
                return true;
            }
        });
        setContentView(game);
        // Keep the game inside cutouts and system gesture insets on newer phones.
        game.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        game.loadUrl(ORIGIN + "index.html");
    }

    private static WebResourceResponse missingResource() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    /** Android's document picker writes the same SFM bytes as the browser download. */
    private final class SaveBridge {
        @JavascriptInterface public void saveFile(String filename, String base64) {
            if (base64 == null || base64.length() > 4 * 1024 * 1024) return;
            final byte[] bytes;
            try { bytes = Base64.decode(base64, Base64.DEFAULT); }
            catch (IllegalArgumentException error) { return; }
            runOnUiThread(() -> {
                if (pendingSave != null) return;
                pendingSave = bytes;
                Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("application/octet-stream");
                picker.putExtra(Intent.EXTRA_TITLE, filename.replaceAll("[^A-Za-z0-9._-]", "_"));
                startActivityForResult(picker, WRITE_SAVE);
            });
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == OPEN_SAVE && fileSelection != null) {
            Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
            fileSelection.onReceiveValue(uri == null ? null : new Uri[] { uri });
            fileSelection = null;
        }
        if (request == WRITE_SAVE) {
            if (result == RESULT_OK && data != null && data.getData() != null && pendingSave != null) {
                try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                    if (output == null) throw new IOException("No writable document");
                    output.write(pendingSave);
                    Toast.makeText(this, "Farm saved", Toast.LENGTH_SHORT).show();
                } catch (IOException error) {
                    Toast.makeText(this, "Could not save farm: " + error.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
            pendingSave = null;
        }
    }

    @Override protected void onPause() { game.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (game != null) game.onResume(); }
    @Override protected void onDestroy() {
        if (fileSelection != null) fileSelection.onReceiveValue(null);
        game.removeJavascriptInterface("SimFarmHost");
        game.destroy();
        super.onDestroy();
    }
}
