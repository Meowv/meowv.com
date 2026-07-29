import type { WorkbookSnapshot } from "../../models/workbook";

export function workbookSnapshotToJsonBuffer(snapshot: WorkbookSnapshot): ArrayBuffer {
  const json = JSON.stringify(snapshot, null, 2);
  if (!json) {
    throw new Error("无法序列化当前工作簿快照。");
  }

  const encoded = new TextEncoder().encode(`${json}\n`);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}
