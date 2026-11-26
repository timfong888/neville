// Platform seams (docs/specs/native-ios.md). Each seam has a `.native.ts` and a
// `.web.ts` file next to a plain `.ts` that re-exports the native one for the
// type checker; Metro picks the platform file. Screens import the plain name
// only, so no screen knows which audio engine is underneath.

/** What a session reports while it plays. */
export type PlayState = {
  playing: boolean;
  /** Position in the list of clips given to `open`. */
  index: number;
  /** True once, when the last clip has finished, or when another session replaced this one. Never true for a loop's own end. */
  ended: boolean;
  /** True with `ended` when another session opened and ended this one. */
  replaced?: boolean;
  /** True once, when a clip could not be loaded or decoded. The session has stopped playing. */
  failed?: boolean;
  /** How far through the current clip, 0 to 1, when the engine knows. */
  progress?: number;
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
   * Gives a session its own address for a clip that someone else owns, such as a library recording.
   * On the web this is a copy, so the session keeps playing if the owner replaces or frees the clip.
   * On a phone it is the owner's file itself, so the file must stay in place until the session stops.
   */
  keep(name: string, src: string): Promise<string>;
  /** Length of a clip in seconds; 0 when it cannot be read. */
  duration(src: string): Promise<number>;
  /**
   * Opens the clips as one session, played in order with no timer between
   * them, so it continues with the screen locked. It starts paused. The title
   * is shown on the lock screen. With `loop`, the first clip plays again after the last,
   * the session never ends by itself, and `stop` is the only way out.
   * One session at a time: opening one ends the one before it, which gets `ended` and `replaced`.
   */
  open(srcs: string[], o: { title: string; loop?: boolean; onState(s: PlayState): void }): PlaySession;
  /** How many sessions have opened so far. A caller that sees it change while it waits knows another session took over. */
  opened(): number;

}
