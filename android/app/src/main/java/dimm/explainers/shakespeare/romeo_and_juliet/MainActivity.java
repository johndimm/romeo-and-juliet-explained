package dimm.explainers.shakespeare.romeo_and_juliet;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WebView webView = getBridge() != null ? getBridge().getWebView() : null;
    if (webView == null) return;

    WebSettings settings = webView.getSettings();
    if (settings == null) return;

    settings.setSupportZoom(true);
    settings.setBuiltInZoomControls(false);
    settings.setDisplayZoomControls(false);
    settings.setUseWideViewPort(true);
    settings.setLoadWithOverviewMode(true);
  }
}
