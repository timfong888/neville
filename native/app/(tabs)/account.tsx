import { Link } from "expo-router";
import { Text } from "react-native";
import { Screen } from "../../src/ui/Screen";
import { colors, type } from "../../src/theme";

// Placeholder. Owner: the Account session. The Phase 0 sign-in page stays reachable until this replaces it.
export default function Account() {
  return (
    <Screen title="Account">
      <Text style={type.muted}>Sign in with Apple, sign out and delete account.</Text>
      <Link href="/phase0" style={{ color: colors.accentText, fontSize: 16 }}>Phase 0 sign-in page</Link>
    </Screen>
  );
}
