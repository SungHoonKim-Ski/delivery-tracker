import { TrackingRequest, TrackingResult } from './types.js';
import { trackByCourier } from './carrier/index.js';
import './carrier/register.js';
import { sendResultHttp } from './http/result-sender.js';

async function processRequest(request: TrackingRequest): Promise<void> {
  const { requestId, shipmentId, displayCode, trackingNumber, courierCompany } = request;

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
    shipmentId,
    displayCode: tracked.displayCode,
    events: tracked.events,
  };

  await sendResultHttp(result);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const handler = async (event: TrackingRequest[]): Promise<void> => {
  console.log(`[Handler] Processing ${event.length} request(s) sequentially`);

  let failedCount = 0;
  for (let i = 0; i < event.length; i++) {
    try {
      await processRequest(event[i]);
    } catch {
      failedCount++;
    }
    if (i < event.length - 1) {
      await delay(300);
    }
  }

  if (failedCount > 0) {
    console.error(`[Handler] ${failedCount} request(s) failed`);
  }
};
