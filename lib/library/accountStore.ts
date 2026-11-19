// The server-backed library for signed-in people. Same interface as the
// device store, so the library and playlist pages do not know the difference.
import { type Library, type Manifestation, type Playlist, parseLibrary } from "@/lib/library/model";
import { CHANGED, type LibraryStore } from "@/lib/library/store";

async function ok(res: Response): Promise<Response> {
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `Request failed (${res.status}).`);
  }
  return res;
}

const changed = () => window.dispatchEvent(new Event(CHANGED));

export class AccountStore implements LibraryStore {
  readonly kind = "account" as const;

  async load(): Promise<Library> {
    const res = await ok(await fetch("/api/library", { cache: "no-store" }));
    return parseLibrary(await res.json());
  }

  private async put(m: Manifestation, audio: Blob | null | undefined): Promise<void> {
    const form = new FormData();
    form.set("meta", JSON.stringify(m));
    if (audio) form.set("audio", audio, "audio");
    if (audio === null) form.set("removeAudio", "1");
    await ok(await fetch(`/api/library/manifestations/${m.id}`, { method: "PUT", body: form }));
    changed();
  }

  saveManifestation(m: Manifestation, audio?: Blob | null) {
    return this.put(m, audio ?? undefined);
  }

  updateManifestation(m: Manifestation, audio?: Blob | null) {
    return this.put(m, audio);
  }

  async deleteManifestation(id: string): Promise<void> {
    await ok(await fetch(`/api/library/manifestations/${id}`, { method: "DELETE" }));
    changed();
  }

  async getAudio(id: string): Promise<Blob | null> {
    const res = await fetch(`/api/library/manifestations/${id}/audio`);
    return res.ok ? res.blob() : null;
  }

  async savePlaylist(p: Playlist): Promise<void> {
    await ok(
      await fetch(`/api/library/playlists/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      }),
    );
    changed();
  }

  async deletePlaylist(id: string): Promise<void> {
    await ok(await fetch(`/api/library/playlists/${id}`, { method: "DELETE" }));
    changed();
  }
}
