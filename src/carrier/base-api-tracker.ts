import { CarrierTracker, CourierOrderStatus, TrackingResult } from '../types.js';

export interface ApiTrackingEvent {
  statusText: string;
  location?: string;
  date?: string;
  time?: string;
  timestamp?: string;
}

export interface ApiTrackerConfig {
  carrierCode: string;
  buildRequest(trackingNumber: string): { url: string; init: RequestInit };
  parseLatestEvent(response: Response, trackingNumber: string): Promise<ApiTrackingEvent | null>;
  mapStatus(text: string): CourierOrderStatus | null;
}

function toTimestamp(event: ApiTrackingEvent): string | undefined {
  if (event.timestamp?.trim()) {
    return event.timestamp.trim();
  }

  const date = event.date?.trim() || '';
  const time = event.time?.trim() || '';
  const combined = [date, time].filter(Boolean).join(' ').trim();
  return combined || undefined;
}

export function createApiTracker(config: ApiTrackerConfig): CarrierTracker {
  return {
    async track(trackingNumber: string, displayCode: string): Promise<TrackingResult | null> {
      const { url, init } = config.buildRequest(trackingNumber);

      let response: Response;
      try {
        response = await fetch(url, init);
      } catch (err) {
        console.error(`[${config.carrierCode}] Request failed for ${trackingNumber}:`, err);
        return null;
      }

      if (!response.ok) {
        console.error(`[${config.carrierCode}] HTTP ${response.status} for ${trackingNumber}`);
        return null;
      }

      const event = await config.parseLatestEvent(response, trackingNumber);
      if (!event) {
        console.warn(`[${config.carrierCode}] No tracking event found for ${trackingNumber}`);
        return null;
      }

      const status = config.mapStatus(event.statusText.trim());
      if (!status) {
        console.warn(
          `[${config.carrierCode}] Unknown status text: "${event.statusText}" for ${trackingNumber}`
        );
        return null;
      }

      return {
        displayCode,
        status,
        location: event.location?.trim() || undefined,
        timestamp: toTimestamp(event),
      };
    },
  };
}
