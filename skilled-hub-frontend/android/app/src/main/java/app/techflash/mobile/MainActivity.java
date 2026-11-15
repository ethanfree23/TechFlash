package app.techflash.mobile;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Prevent Android WebView rubber-band / pull-edge gestures that can
    // trigger a full document reload when the user pulls down at scroll top.
    WebView webView = getBridge() != null ? getBridge().getWebView() : null;
    if (webView != null) {
      webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
    }
  }
}
