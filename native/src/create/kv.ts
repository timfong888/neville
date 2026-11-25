// A stand-in for the key-value seam, with the same signatures. The shell PR ports the real seam to
// native/src/seams; then this file and its two siblings go and session.ts imports the seam.
export * from "./kv.native";
