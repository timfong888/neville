import { useLocalSearchParams } from "expo-router";
import { Placeholder } from "../../src/ui/Screen";

// Placeholder. Owner: the shell session (#118).
export default function LibraryDetail() {
  useLocalSearchParams<{ id: string }>(); // the Library item id
  return <Placeholder title="Library item" note="Title, script and actions for one item." />;
}
