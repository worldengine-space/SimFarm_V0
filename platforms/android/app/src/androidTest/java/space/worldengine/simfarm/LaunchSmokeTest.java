package space.worldengine.simfarm;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Runs in the real Android WebView and drives the same touch path as a player. */
@RunWith(AndroidJUnit4.class)
public final class LaunchSmokeTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private WebView browser;

    @Test public void launchAndPlayOffline() throws Exception {
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        Activity activity = instrumentation.startActivitySync(intent);
        instrumentation.runOnMainSync(() -> browser = findWebView(activity.getWindow().getDecorView()));
        assertNotNull("Game WebView exists", browser);
        waitFor("document.readyState === 'complete' && !!document.getElementById('launch-game') && !document.getElementById('launch-game').disabled");
        evaluate("window.smokeErrors=[]; addEventListener('error', e=>smokeErrors.push(e.message));"
                + "addEventListener('unhandledrejection', e=>smokeErrors.push(String(e.reason)));"
                + "window.smokeData=0; const originalFetch=window.fetch; window.fetch=async (...args)=>{"
                + "const response=await originalFetch(...args); if(!response.ok)smokeErrors.push('HTTP '+response.status);"
                + "if(String(args[0]).startsWith('data/'))smokeData++; return response;}; true");
        screenshot("01-launcher.png");
        tapElement("document.getElementById('launch-game')", 0.5, 0.5);
        waitFor("document.getElementById('launch-screen').hidden && window.smokeData >= 5");
        // The loading/error screen has few colours. The original startup artwork uses a 16-colour palette.
        waitFor("(()=>{const p=document.getElementById('simfarm').getContext('2d').getImageData(0,0,640,480).data;"
                + "const c=new Set();for(let i=0;i<p.length;i+=64)c.add(p[i]+','+p[i+1]+','+p[i+2]);return c.size>8;})()");
        screenshot("02-game-title.png");
        evaluate("window.smokeTouches=[]; document.getElementById('simfarm').addEventListener('pointerdown',e=>{"
                + "const r=e.target.getBoundingClientRect();smokeTouches.push([(e.clientX-r.left)*640/r.width,"
                + "(e.clientY-r.top)*480/r.height,e.button]);},true); true");
        // Startup presents/title screens advance on taps; region Play is at (165,244).
        tapCanvas(320, 200);
        SystemClock.sleep(300);
        tapCanvas(320, 200);
        SystemClock.sleep(300);
        tapCanvas(165, 244);
        SystemClock.sleep(2000);
        screenshot("03-after-region-play.png");
        System.out.println("ANDROID TOUCH COORDINATES " + evaluate("smokeTouches"));
        System.out.println("ANDROID JS ERRORS " + evaluate("smokeErrors"));
        waitFor("(()=>{const p=document.getElementById('simfarm').getContext('2d').getImageData(639,1,1,1).data;"
                + "return p[0]===65 && p[1]===65 && p[2]===65;})()");
        screenshot("03-farm.png");
        assertEquals("No JavaScript or asset failures", "[]", evaluate("smokeErrors"));
        assertTrue("Canvas remains visible", evaluate("!document.getElementById('game-stage').hidden").equals("true"));
        instrumentation.runOnMainSync(activity::finish);
    }

    private WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i=0; i<group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private String evaluate(String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> browser.evaluateJavascript(script, value -> {
            result.set(value); done.countDown();
        }));
        assertTrue("WebView JavaScript callback", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    private void waitFor(String expression) throws Exception {
        long deadline = SystemClock.uptimeMillis() + 60000;
        while (SystemClock.uptimeMillis() < deadline) {
            if ("true".equals(evaluate(expression))) return;
            SystemClock.sleep(250);
        }
        fail("Timed out waiting for: " + expression);
    }

    private void tapCanvas(double x, double y) throws Exception {
        tapElement("document.getElementById('simfarm')", x/640, y/480);
    }

    private void tapElement(String element, double x, double y) throws Exception {
        JSONArray point = new JSONArray(evaluate("(()=>{const r=("+element+").getBoundingClientRect();"
                +"return [(r.left+r.width*"+x+")*devicePixelRatio,(r.top+r.height*"+y+")*devicePixelRatio];})()"));
        int[] location = new int[2];
        instrumentation.runOnMainSync(() -> browser.getLocationOnScreen(location));
        float screenX = (float)point.getDouble(0) + location[0] + browser.getPaddingLeft();
        float screenY = (float)point.getDouble(1) + location[1] + browser.getPaddingTop();
        long now = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, screenX, screenY, 0);
        MotionEvent up = MotionEvent.obtain(now, now+80, MotionEvent.ACTION_UP, screenX, screenY, 0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        instrumentation.sendPointerSync(down);
        instrumentation.sendPointerSync(up);
        down.recycle(); up.recycle();
    }

    @android.annotation.TargetApi(31)
    private void screenshot(String name) throws Exception {
        Bitmap bitmap = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull("Android screenshot", bitmap);
        // Stream into shell-owned Downloads so Gradle's app cleanup cannot erase evidence.
        assertTrue("Screenshot export requires Android 12+ test device", android.os.Build.VERSION.SDK_INT >= 31);
        android.os.ParcelFileDescriptor[] pipes = instrumentation.getUiAutomation()
                .executeShellCommandRw("mkdir -p /sdcard/Download/SimFarmSmoke; cat > /sdcard/Download/SimFarmSmoke/" + name);
        try (android.os.ParcelFileDescriptor.AutoCloseOutputStream output =
                new android.os.ParcelFileDescriptor.AutoCloseOutputStream(pipes[1])) {
            assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output));
        }
        try (android.os.ParcelFileDescriptor.AutoCloseInputStream output =
                new android.os.ParcelFileDescriptor.AutoCloseInputStream(pipes[0])) {
            while (output.read() != -1) { /* Wait until the shell write completes. */ }
        }
        bitmap.recycle();
    }
}
