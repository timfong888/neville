import { Directory, File, Paths } from "expo-file-system";
import { makeFileLibrary } from "./libraryCore";

export type { AudioBytes, DeviceLibrary } from "./library.types";

// Files in the app's documents folder: library/library.json and one file per recording.
// They survive a force-quit and an app update, and are removed with the app.
// Every rule about names and order lives in libraryCore, which the unit tests run.
function dir(): Directory {
  const d = new Directory(Paths.document, "library");
  if (!d.exists) d.create();
  return d;
}
const file = (name: string) => new File(dir(), name);

export const library = makeFileLibrary({
  list: async () => dir().list().map((e) => e.name),
  read: async (name) => (file(name).exists ? file(name).text() : null),
  async write(name, data) {
    const f = file(name);
    if (f.exists) f.delete();
    f.create();
    f.write(data);
  },
  move: async (from, to) => file(from).move(file(to)),
  async remove(name) {
    if (file(name).exists) file(name).delete();
  },
  uri: async (name) => (file(name).exists ? file(name).uri : null),
});
