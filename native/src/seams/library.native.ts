import { Directory, File, Paths } from "expo-file-system";
import { EMPTY_LIBRARY, type Library, parseLibrary } from "@/lib/library/model";
import { kv } from "./kv.native";
import type { LibrarySeam } from "./types";

// Records as JSON (same key and shape as the website's device store), recordings as files.
const KEY = "nv_library_v1";
const audioDir = () => {
  const d = new Directory(Paths.document, "audio");
  if (!d.exists) d.create({ intermediates: true });
  return d;
};
const audioFile = (id: string) => new File(audioDir(), `${encodeURIComponent(id)}.audio`);

async function read(): Promise<Library> {
  try {
    return parseLibrary(JSON.parse((await kv.get(KEY)) ?? "null"));
  } catch {
    return EMPTY_LIBRARY;
  }
}
const write = (lib: Library) => kv.set(KEY, JSON.stringify(lib));

export const library: LibrarySeam = {
  load: read,
  async save(m, audio) {
    const lib = await read();
    const f = audioFile(m.id);
    if (audio) {
      if (!f.exists) f.create();
      f.write(new Uint8Array(audio));
    } else if (audio === null && f.exists) f.delete();
    const rest = lib.manifestations.filter((x) => x.id !== m.id);
    await write({ ...lib, manifestations: [{ ...m, hasAudio: audio ? true : audio === null ? false : m.hasAudio }, ...rest] });
  },
  async remove(id) {
    const lib = await read();
    const f = audioFile(id);
    if (f.exists) f.delete();
    await write({ ...lib, manifestations: lib.manifestations.filter((x) => x.id !== id), playlists: lib.playlists.map((p) => ({ ...p, itemIds: p.itemIds.filter((i) => i !== id) })) });
  },
  async audioUri(id) {
    const f = audioFile(id);
    return f.exists ? f.uri : null;
  },
  async savePlaylist(p) {
    const lib = await read();
    await write({ ...lib, playlists: [p, ...lib.playlists.filter((x) => x.id !== p.id)] });
  },
  async deletePlaylist(id) {
    const lib = await read();
    await write({ ...lib, playlists: lib.playlists.filter((x) => x.id !== id) });
  },
};
