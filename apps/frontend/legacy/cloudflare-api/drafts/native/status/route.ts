import { noStoreJson } from "../../../_lib/http";
import { officeStorage } from "@/db/office-repository";
import { onlyOfficeSettings } from "@/lib/onlyoffice-protocol";

export async function GET(request: Request) {
  const settings = onlyOfficeSettings(request);
  const configured = Boolean(settings && new URL(request.url).origin === settings.browserAppOrigin);
  if (!configured) return noStoreJson({ configured: false, reason: "document_service_not_configured" });
  try { officeStorage(); return noStoreJson({ configured: true }); }
  catch { return noStoreJson({ configured: false, reason: "file_storage_unavailable" }); }
}
