import { ApiTrackingEvent } from '../base-api-tracker.js';

interface TrackerDeliveryStatus {
  id?: string;
  text?: string;
}

interface TrackerDeliveryProgress {
  status?: TrackerDeliveryStatus;
  location?: {
    name?: string;
  };
  time?: string;
}

interface TrackerDeliveryResponse {
  state?: TrackerDeliveryStatus;
  progresses?: TrackerDeliveryProgress[];
}

export function buildTrackerDeliveryRequest(
  carrierId: string,
  trackingNumber: string
): { url: string; init: RequestInit } {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const apiKey = process.env.TRACKER_API_KEY;
  if (apiKey) {
    headers.Authorization = `TRACKQL-API-KEY ${apiKey}`;
  }

  return {
    url: `https://apis.tracker.delivery/carriers/${carrierId}/tracks/${encodeURIComponent(trackingNumber)}`,
    init: {
      method: 'GET',
      headers,
    },
  };
}

function stripOffset(time: string | undefined): string | null {
  if (!time) return null;
  const trimmed = time.trim();
  // "2026-03-29T10:00:00+09:00" → "2026-03-29T10:00:00"
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  return match ? match[1] : trimmed;
}

export async function parseTrackerDeliveryEvents(response: Response): Promise<ApiTrackingEvent[]> {
  const data = (await response.json()) as TrackerDeliveryResponse;

  const progresses = Array.isArray(data.progresses) ? data.progresses : [];

  if (progresses.length === 0) {
    const statusCode = data.state?.id || null;
    const statusText = data.state?.text || null;
    if (!statusCode && !statusText) {
      return [];
    }
    return [{ statusCode, statusText, location: null, timestamp: null }];
  }

  return progresses.map((p) => ({
    statusCode: p.status?.id || null,
    statusText: p.status?.text || null,
    location: p.location?.name || null,
    timestamp: stripOffset(p.time),
  }));
}
