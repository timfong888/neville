import { useLocalSearchParams } from "expo-router";
import { Placeholder } from "../../src/ui/Screen";

// Placeholder. Owner: the Player session. `id` is a Library item id.
export default function Player() {
  useLocalSearchParams<{ id: string }>(); // the Library item id
  return <Placeholder title="Player" note="Plays the saved recording for one Library item." />;
}
