import type { Metadata } from "next";
import DeliveryPicker from "./DeliveryPicker";
import MusicPicker from "./MusicPicker";
import VoicePicker from "./VoicePicker";

export const metadata: Metadata = { title: "Settings — Neville" };

export default function SettingsPage() {
  return (
    <>
      <h1>Settings</h1>
      <p className="lede">Choose how your manifestations sound: the voice, the pace, the tone and the music.</p>
      <h2>Delivery</h2>
      <DeliveryPicker />
      <h2>Voice</h2>
      <VoicePicker />
      <h2>Music</h2>
      <MusicPicker />
    </>
  );
}
