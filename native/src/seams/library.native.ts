import { Directory, File, Paths } from "expo-file-system";
import { AUDIO_EXTS, extFor, makeFileLibrary } from "./libraryCore";

export type { AudioBytes, DeviceLibrary } from "./library.types";

// Files in the app's documents folder: library/library.json and library/<id>.<ext>.
// They survive a force-quit and an app update, and are removed with the app.
function dir(): Directory {
  const d = new Directory(Paths.document, "library");
  if (!d.exists) d.create();
  return d;
}
const records = () => new File(dir(), "library.json");
const audioFile = (id: string) => AUDIO_EXTS.map((e) => new File(dir(), `${id}.${e}`)).find((f) => f.exists) ?? null;

export const library = makeFileLibrary({
  async readRecords() {
    const f = records();
    return f.exists ? f.text() : null;
  },
  async writeRecords(json) {
    const f = records();
    if (!f.exists) f.create();
    f.write(json);
  },
  async writeAudio(id, audio) {
    // Write beside the old recording first, so a full disk leaves the old one playable.
    const tmp = new File(dir(), `${id}.tmp`);
    if (tmp.exists) tmp.delete();
    tmp.create();
    try {
      tmp.write(audio.bytes);
    } catch (e) {
      if (tmp.exists) tmp.delete();
      throw e;
    }
    audioFile(id)?.delete();
    tmp.move(new File(dir(), `${id}.${extFor(audio.mime)}`));
  },
  async deleteAudio(id) {
    audioFile(id)?.delete();
  },
  async audioUri(id) {
    return audioFile(id)?.uri ?? null;
  },
});
