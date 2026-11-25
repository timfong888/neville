// Platform seams (docs/specs/native-ios.md). Each seam has a `.native.ts` and a
// `.web.ts` file next to a plain `.ts` that re-exports the native one for the
// type checker; Metro picks the platform file. Screens import the plain name
// only, so no screen knows which audio engine is underneath.

/** What a session reports while it plays. */
export type PlayState = {
  playing: boolean;
  /** Position in the list of clips given to `open`. */
  index: number;
  /** True once, when the last clip has finished. */
  ended: boolean;
  /** True once, when a clip could not be loaded or decoded. The session has stopped playing. */
  failed?: boolean;
};

/** One playing session. `stop` also frees it and clears the lock screen. */
export type PlaySession = { play(): void; pause(): void; stop(): void };

/** What the app needs from the platform's audio. */
export interface AudioSeam {
  /** Background playback and lock-screen mode. A no-op on the web. */
  configure(): Promise<void>;
  /**
   * Writes audio bytes somewhere the player can read; returns its address.
   * Saving a name again replaces it. On the web an open session keeps the clip it was given.
   * On a phone the file itself is replaced, so stop a session before saving a name it uses.
   */
  save(name: string, bytes: Uint8Array, mime: string): Promise<string>;
  /**
   * Takes a copy of a clip that someone else owns, such as a library recording,
   * so a session can keep playing it if the owner replaces or frees it. Returns the copy's address.
   */
  keep(name: string, src: string): Promise<string>;
  /** Length of a clip in seconds; 0 when it cannot be read. */
  duration(src: string): Promise<number>;
  /**
   * Opens the clips as one session, played in order with no timer between
   * them, so it continues with the screen locked. It starts paused. The title
   * is shown on the lock screen.
   */
  open(srcs: string[], o: { title: string; onState(s: PlayState): void }): PlaySession;
}
