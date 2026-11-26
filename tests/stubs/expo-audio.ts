// Stand-in so native seam code resolves in the node test run; tests replace it with vi.mock.
const unmocked = () => {
  throw new Error("expo-audio is not available in node tests; vi.mock it");
};
export const setAudioModeAsync = unmocked;
export const createAudioPlayer = unmocked;
export const createAudioPlaylist = unmocked;
