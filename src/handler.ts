import { TrackingRequest, TrackingResult } from './types.js';
import { trackByCourier } from './carrier/index.js';
import './carrier/register.js';
import { sendResultHttp } from './http/result-sender.js';

async function processRequest(request: TrackingRequest): Promise<void> {
  const { requestId, displayCode, trackingNumber, courierCompany } = request;

  if (!displayCode || !trackingNumber || !courierCompany) {
    console.error('[Handler] Missing required fields in request:', request);
    return;
  }

  console.log(`[Handler] Tracking ${courierCompany} / ${trackingNumber} (${displayCode})`);

  let tracked = null;
  try {
    tracked = await trackByCourier(courierCompany, trackingNumber, displayCode);
  } catch (err) {
    console.error(`[Handler] Carrier tracking threw unexpectedly for ${trackingNumber}:`, err);
    return;
  }

  if (!tracked) {
    console.warn(`[Handler] No result for ${courierCompany} / ${trackingNumber}`);
    return;
  }

  const result: TrackingResult = {
    requestId,
    displayCode: tracked.displayCode,
    events: tracked.events,
  };

  await sendResultHttp(result);
}

export const handler = async (event: TrackingRequest[]): Promise<void> => {
  console.log(`[Handler] Processing ${event.length} request(s)`);

  const settled = await Promise.allSettled(event.map(processRequest));
  const failedCount = settled.filter((result) => result.status === 'rejected').length;

  if (failedCount > 0) {
    throw new Error(`[Handler] Failed to process ${failedCount} request(s)`);
  }
};
