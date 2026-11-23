import { useRef, useState } from "react";
import { ActivityIndicator, Linking, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";

// The Neville app is the hosted web app. This shell only gives it a native iOS home.
const APP_URL = "https://getneville.vercel.app";
const APP_HOST = "getneville.vercel.app";
const BG = "#151820";

export default function App() {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);

  // Keep the app's own pages inside the shell; send everything else to the system browser.
  const allow = (req) => {
    try {
      const u = new URL(req.url);
      if (u.protocol === "about:" || u.protocol === "blob:" || u.protocol === "data:") return true;
      if (u.hostname === APP_HOST) return true;
      if (req.isTopFrame === false) return true; // iframes / subresources
    } catch {
      return false;
    }
    Linking.openURL(req.url).catch(() => {});
    return false;
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      {failed ? (
        <View style={styles.center}>
          <Text style={styles.msg}>Can't reach Neville.</Text>
          <Text style={styles.link} onPress={() => setFailed(false)}>Try again</Text>
        </View>
      ) : (
        <WebView
          ref={ref}
          source={{ uri: APP_URL }}
          style={styles.web}
          containerStyle={styles.web}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.center}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          sharedCookiesEnabled
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={allow}
          onError={() => setFailed(true)}
          onHttpError={() => {}}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  web: { flex: 1, backgroundColor: BG },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: BG },
  msg: { color: "#fff", fontSize: 16, marginBottom: 12 },
  link: { color: "#9db4ff", fontSize: 16 },
});
