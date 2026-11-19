import type { Metadata } from "next";
import DeliveryPicker from "./DeliveryPicker";
import VoicePicker from "./VoicePicker";

export const metadata: Metadata = { title: "Settings — Neville" };

export default function SettingsPage() {
  return (
    <>
      <h1>Settings</h1>
      <p className="lede">Choose how your manifestations sound: the voice, the pace and the tone.</p>
      <h2>Delivery</h2>
      <DeliveryPicker />
      <h2>Voice</h2>
      <VoicePicker />
    </>
  );
}
