import { createFullReportHandler } from '@/lib/agent/full-report-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = createFullReportHandler();
