import type { DeviceData } from "@/lib/deviceDataCopy";

/**
 * What is saved on this phone, for the delete-account prompt. The Library and Create screens own
 * that storage and are being built alongside this one (#91), so nothing can be counted yet:
 * undefined makes the prompt say that anything on the phone stays there. Wire the counts in here.
 */
export async function deviceData(): Promise<DeviceData | undefined> {
  return undefined;
}
