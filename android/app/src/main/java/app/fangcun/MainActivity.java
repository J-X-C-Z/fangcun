package app.fangcun;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://fangcun.example.org/";
    private static final String APP_HOST = "fangcun.example.org";
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1201;
    private static final int CALENDAR_PERMISSION_REQUEST = 1202;
    private WebView webView;
    private SystemCalendarBridge systemCalendar;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureEdgeToEdgeWindow();
        setContentView(R.layout.activity_main);
        ReminderReceiver.ensureChannel(this);
        systemCalendar = new SystemCalendarBridge(this);
        webView = findViewById(R.id.webview);
        webView.setBackgroundColor(Color.rgb(244, 242, 237));
        configureWebView();
        if (savedInstanceState == null) {
            if (!handleVoiceIntent(getIntent())) webView.loadUrl(APP_URL + integrationReturnQuery(getIntent()));
        } else webView.restoreState(savedInstanceState);
    }

    private void configureEdgeToEdgeWindow() {
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(attributes);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        } else {
            window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            );
        }
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " FangcunAndroid/1.0");
        webView.addJavascriptInterface(new NativeBridge(), "FangcunNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && APP_HOST.equalsIgnoreCase(uri.getHost())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
        });
    }

    public final class NativeBridge {
        @JavascriptInterface
        public void syncReminders(String payload) {
            if (payload == null || payload.length() > 262144) return;
            ReminderScheduler.replaceAll(getApplicationContext(), payload);
        }

        @JavascriptInterface
        public void requestReminderPermissions() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
                } else openExactAlarmSettingsIfNeeded();
            });
        }

        @JavascriptInterface
        public void requestCalendarPermissions() {
            runOnUiThread(() -> {
                if (!systemCalendar.hasPermission()) {
                    requestPermissions(new String[]{Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR}, CALENDAR_PERMISSION_REQUEST);
                } else notifyCalendarPermission(true);
            });
        }

        @JavascriptInterface
        public String readSystemCalendar(String account) {
            return systemCalendar.read(account);
        }

        @JavascriptInterface
        public String syncSystemCalendar(String payload) {
            if (payload == null || payload.length() > 1048576) return "{\"error\":\"同步内容过大\"}";
            return systemCalendar.sync(payload);
        }

        @JavascriptInterface
        public void openSystemCalendar() {
            runOnUiThread(() -> {
                Uri uri = CalendarContract.CONTENT_URI.buildUpon().appendPath("time").appendPath(String.valueOf(System.currentTimeMillis())).build();
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            });
        }

        @JavascriptInterface
        public void openExternal(String value) {
            if (value == null || value.length() > 4096) return;
            Uri uri = Uri.parse(value);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || !(host.equals("login.microsoftonline.com") || host.endsWith(".microsoftonline.com") || host.equals("accounts.google.com"))) return;
            runOnUiThread(() -> startActivity(new Intent(Intent.ACTION_VIEW, uri)));
        }
    }

    private void openExactAlarmSettingsIfNeeded() {
        if (Build.VERSION.SDK_INT < 31) return;
        AlarmManager manager = getSystemService(AlarmManager.class);
        if (manager != null && !manager.canScheduleExactAlarms()) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) openExactAlarmSettingsIfNeeded();
        if (requestCode == CALENDAR_PERMISSION_REQUEST) notifyCalendarPermission(systemCalendar.hasPermission());
    }

    private void notifyCalendarPermission(boolean granted) {
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript("window.FangcunNativeCalendarPermission&&window.FangcunNativeCalendarPermission(" + granted + ")", null));
    }

    @Override
    protected void onResume() {
        super.onResume();
        ReminderScheduler.rescheduleStored(this);
        if (webView != null) webView.postDelayed(() -> webView.evaluateJavascript("window.FangcunNativeCalendarResume&&window.FangcunNativeCalendarResume()", null), 250);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (handleVoiceIntent(intent)) return;
        String query = integrationReturnQuery(intent);
        if (!query.isEmpty() && webView != null) webView.loadUrl(APP_URL + query);
    }

    private boolean handleVoiceIntent(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"fangcun".equalsIgnoreCase(data.getScheme()) || !"voice".equalsIgnoreCase(data.getHost())) return false;
        String text = data.getQueryParameter("text");
        Uri.Builder target = Uri.parse(APP_URL).buildUpon().appendQueryParameter("quick", "voice");
        if (text != null && !text.trim().isEmpty()) target.appendQueryParameter("text", text.trim());
        webView.loadUrl(target.build().toString());
        return true;
    }

    private String integrationReturnQuery(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"fangcun".equalsIgnoreCase(data.getScheme())) return "";
        if ("outlook-connected".equalsIgnoreCase(data.getHost())) return "?outlook=connected";
        if ("google-connected".equalsIgnoreCase(data.getHost())) return "?google=connected";
        return "";
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
