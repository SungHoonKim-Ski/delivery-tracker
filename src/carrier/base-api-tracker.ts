import { CarrierTracker, CourierOrderStatus, TrackingEvent, TrackingResult } from '../types.js';

export interface ApiTrackingEvent {
  statusCode: string | null;
  statusText: string | null;
  location: string | null;
  timestamp: string | null;
}

export interface ApiTrackerConfig {
  carrierCode: string;
  buildRequest(trackingNumber: string): { url: string; init: RequestInit };
  parseEvents(response: Response, trackingNumber: string): Promise<ApiTrackingEvent[]>;
  mapStatus(text: string): CourierOrderStatus | null;
}

function toTrackingEvent(
  event: ApiTrackingEvent,
  mapStatus: (text: string) => CourierOrderStatus | null
): TrackingEvent {
  const statusKey = (event.statusCode || event.statusText || '').trim();
  return {
    eventAt: event.timestamp,
    location: event.location,
    rawStatusCode: event.statusCode,
    rawStatusText: event.statusText,
    mappedStatus: statusKey ? mapStatus(statusKey) : null,
  };
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

      const rawEvents = await config.parseEvents(response, trackingNumber);
      if (rawEvents.length === 0) {
        console.warn(`[${config.carrierCode}] No tracking events found for ${trackingNumber}`);
        return null;
      }

      const events: TrackingEvent[] = rawEvents.map((e) => toTrackingEvent(e, config.mapStatus));

      const hasAnyUsable = events.some(
        (e) => e.eventAt || e.location || e.rawStatusCode || e.rawStatusText
      );
      if (!hasAnyUsable) {
        console.warn(`[${config.carrierCode}] All events unusable for ${trackingNumber}`);
        return null;
      }

      return { displayCode, events };
    },
  };
}
