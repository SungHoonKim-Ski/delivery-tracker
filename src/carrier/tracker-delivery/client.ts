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

export async function parseTrackerDeliveryLatestEvent(response: Response): Promise<ApiTrackingEvent | null> {
  const data = (await response.json()) as TrackerDeliveryResponse;

  const progresses = Array.isArray(data.progresses) ? data.progresses : [];
  const lastProgress = progresses.length > 0 ? progresses[progresses.length - 1] : undefined;

  const statusCode = lastProgress?.status?.id || data.state?.id || '';
  const statusText = lastProgress?.status?.text || data.state?.text || statusCode;

  if (!statusCode && !statusText) {
    return null;
  }

  return {
    statusText: statusCode || statusText,
    location: lastProgress?.location?.name || '',
    timestamp: lastProgress?.time || undefined,
  };
}
