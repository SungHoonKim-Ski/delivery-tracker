import { SQSEvent, SQSRecord } from 'aws-lambda';
import { TrackingRequest } from './types.js';
import { trackByCourier } from './carrier/index.js';
import { sendResult } from './sqs/result-sender.js';

async function processRecord(record: SQSRecord): Promise<void> {
  let request: TrackingRequest;

  try {
    request = JSON.parse(record.body) as TrackingRequest;
  } catch (err) {
    console.error(`[Handler] Failed to parse SQS message body: ${record.body}`, err);
    return;
  }

  const { displayCode, trackingNumber, courierCompany } = request;

  if (!displayCode || !trackingNumber || !courierCompany) {
    console.error(`[Handler] Missing required fields in request:`, request);
    return;
  }

  console.log(`[Handler] Tracking ${courierCompany} / ${trackingNumber} (${displayCode})`);

  let result = null;

  try {
    result = await trackByCourier(courierCompany, trackingNumber, displayCode);
  } catch (err) {
    console.error(`[Handler] Carrier tracking threw unexpectedly for ${trackingNumber}:`, err);
    return;
  }

  if (!result) {
    console.warn(`[Handler] No result for ${courierCompany} / ${trackingNumber}`);
    return;
  }

  await sendResult(result);
}

export const handler = async (event: SQSEvent): Promise<void> => {
  console.log(`[Handler] Processing ${event.Records.length} record(s)`);

  await Promise.allSettled(event.Records.map((record) => processRecord(record)));
};
