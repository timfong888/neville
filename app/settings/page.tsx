import type { Metadata } from "next";
import SettingsBody from "./SettingsBody";

export const metadata: Metadata = { title: "Settings — Neville" };

export default function SettingsPage() {
  return (
    <>
      <h1>Settings</h1>
      <p className="lede">Pick a mode, then fine-tune the pace, tone, voice and music.</p>
      <SettingsBody />
    </>
  );
}
