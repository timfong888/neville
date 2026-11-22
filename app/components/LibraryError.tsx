"use client";

/** Shown instead of an empty library when the saved library could not be loaded. */
export default function LibraryError({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="card" role="alert">
      <p>Your saved library could not be loaded just now. Nothing has been deleted.</p>
      <p className="small muted">{error}</p>
      <button className="btn sm" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
