// UUID v4 for one user action (create, re-record, new variation).
// Framework-free: used by web, native and server code.
import { newId } from "@/lib/library/model";

/** Returns a new UUID v4 attempt ID. */
export const newAttemptId = newId;

/** "Reference 7F3A-91C2": first 8 hex chars of a UUID, uppercase, grouped. */
export function shortRef(id: string): string {
  const h = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4, 8)}`;
}

/** "b56f1666": first 8 hex chars of a UUID, lowercase, as the support code shown to users. */
export function codeRef(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toLowerCase();
}

/** Clipboard text for the Copy button: "Neville ref <uuid> <ISO time UTC> [build]". */
export function copyLine(id: string, build = ""): string {
  const t = new Date().toISOString();
  return build ? `Neville ref ${id} ${t} ${build}` : `Neville ref ${id} ${t}`;
}
