import { type DeviceData, deviceDataFromLibrary } from "@/lib/deviceDataCopy";
import { library } from "./seams/library";

/**
 * What is saved on this phone, for the delete-account prompt: the library's counts. Undefined (the
 * prompt then says that anything on the phone stays there) when the library is empty or cannot be
 * read. The wish being typed is not counted yet: the Create screen's store is not merged (#91).
 */
export async function deviceData(): Promise<DeviceData | undefined> {
  try {
    return deviceDataFromLibrary(await library.load());
  } catch {
    return undefined;
  }
}
