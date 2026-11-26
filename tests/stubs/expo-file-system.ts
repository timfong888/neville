// Stand-in so native seam code resolves in the node test run; tests replace it with vi.mock.
export const Paths = { cache: "" };
export class File {
  constructor() {
    throw new Error("expo-file-system is not available in node tests; vi.mock it");
  }
}
