import handler from 'vinext/server/app-router-entry';
import { createCloudflarePreview } from '../lib/cloudflare-preview';

// This preview intentionally has no database, object store, image optimizer,
// model credentials, or reverse proxy to the operator's local FastAPI process.
export default createCloudflarePreview(handler);
