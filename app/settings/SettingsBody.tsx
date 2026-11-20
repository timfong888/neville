"use client";

import { useState } from "react";
import DeliveryPicker from "./DeliveryPicker";
import ModePicker from "./ModePicker";
import MusicPicker from "./MusicPicker";
import VoicePicker from "./VoicePicker";

/** Applying a mode rewrites the settings below it; remounting them makes them show the new values. */
export default function SettingsBody() {
  const [rev, setRev] = useState(0);
  return (
    <>
      <h2>Mode</h2>
      <ModePicker onApplied={() => setRev((r) => r + 1)} />
      <h2>Delivery</h2>
      <DeliveryPicker key={`d${rev}`} />
      <h2>Voice</h2>
      <VoicePicker />
      <h2>Music</h2>
      <MusicPicker key={`m${rev}`} />
    </>
  );
}
