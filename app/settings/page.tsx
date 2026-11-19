import type { Metadata } from "next";
import { speechEnabled } from "@/lib/server/openrouter";
import VoicePicker from "./VoicePicker";

export const metadata: Metadata = { title: "Settings — Neville" };

export default function SettingsPage() {
  return (
    <>
      <h1>Settings</h1>
      <p className="lede">Choose the voice for your manifestations.</p>
      <VoicePicker speechOn={speechEnabled()} />
    </>
  );
}
