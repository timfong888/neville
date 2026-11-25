import { Redirect } from "expo-router";

// "/" opens Create. This lives inside the tabs, so the redirect switches tab and adds no second screen to the root stack.
export default function Index() {
  return <Redirect href="/create" />;
}
