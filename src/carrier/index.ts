import { CourierCompany, CarrierTracker, TrackingResult } from '../types.js';

const CARRIER_REGISTRY: Partial<Record<CourierCompany, CarrierTracker>> = {};

export function registerCarrier(company: CourierCompany, tracker: CarrierTracker): void {
  CARRIER_REGISTRY[company] = tracker;
}

export async function trackByCourier(
  courierCompany: CourierCompany,
  trackingNumber: string,
  displayCode: string
): Promise<TrackingResult | null> {
  const tracker = CARRIER_REGISTRY[courierCompany];
  if (!tracker) {
    console.error(`[Carrier] No carrier registered for: ${courierCompany}`);
    return null;
  }

  console.log(`[Carrier] Dispatching to ${courierCompany} for ${trackingNumber}`);
  return tracker.track(trackingNumber, displayCode);
}
