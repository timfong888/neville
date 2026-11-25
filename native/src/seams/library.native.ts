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
const recordsNew = () => new File(dir(), "library.json.new");
const audioFile = (id: string) => AUDIO_EXTS.map((e) => new File(dir(), `${id}.${e}`)).find((f) => f.exists) ?? null;
const staged = (id: string) => AUDIO_EXTS.map((e) => ({ ext: e, file: new File(dir(), `${id}.${e}.new`) })).find((s) => s.file.exists) ?? null;

/** Writes the whole file under a spare name first, so a full disk never leaves a half-written file in place. */
function writeWhole(f: File, data: string | Uint8Array) {
  if (f.exists) f.delete();
  f.create();
  try {
    f.write(data);
  } catch (e) {
    if (f.exists) f.delete();
    throw e;
  }
}

export const library = makeFileLibrary({
  async readRecords() {
    // library.json is removed only after library.json.new is complete, so if it is missing the new file is the library.
    const f = records().exists ? records() : recordsNew().exists ? recordsNew() : null;
    return f ? f.text() : null;
  },
  async writeRecords(json) {
    const next = recordsNew();
    writeWhole(next, json);
    if (records().exists) records().delete();
    next.move(records());
  },
  async stageAudio(id, audio) {
    await this.discardStaged(id);
    writeWhole(new File(dir(), `${id}.${extFor(audio.mime)}.new`), audio.bytes);
  },
  async commitAudio(id) {
    const s = staged(id);
    if (!s) return;
    audioFile(id)?.delete();
    s.file.move(new File(dir(), `${id}.${s.ext}`));
  },
  async discardStaged(id) {
    staged(id)?.file.delete();
  },
  async deleteAudio(id) {
    audioFile(id)?.delete();
  },
  async audioUri(id) {
    return audioFile(id)?.uri ?? null;
  },
});
