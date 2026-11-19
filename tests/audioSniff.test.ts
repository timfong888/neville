import { describe, expect, it } from "vitest";
import { sniffAudio } from "@/lib/server/audioSniff";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("sniffAudio", () => {
  it("recognises WAV and MP3 by their bytes", () => {
    expect(sniffAudio(bytes("RIFF", [0, 0, 0, 0], "WAVEfmt "))).toBe("audio/wav");
    expect(sniffAudio(bytes("ID3", [4, 0, 0]))).toBe("audio/mpeg");
    expect(sniffAudio(bytes([0xff, 0xfb, 0x90, 0x00]))).toBe("audio/mpeg");
  });
  it("rejects anything else, whatever it is labelled", () => {
    expect(sniffAudio(bytes("<html>"))).toBeNull();
    expect(sniffAudio(bytes([0x89], "PNG\r\n"))).toBeNull();
    expect(sniffAudio(bytes("RIFF", [0, 0, 0, 0], "AVI "))).toBeNull();
    expect(sniffAudio(new Uint8Array())).toBeNull();
  });
});
