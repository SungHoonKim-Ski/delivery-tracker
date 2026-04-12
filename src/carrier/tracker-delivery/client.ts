import { ApiTrackingEvent } from '../base-api-tracker.js';

// ── v2 GraphQL response types ──

interface TrackEventStatus {
  code: string;
  name: string | null;
}

interface TrackEventNode {
  time: string | null;
  status: TrackEventStatus;
  description: string | null;
  location: {
    name: string | null;
  } | null;
}

interface TrackEventsConnection {
  edges: Array<{ node: TrackEventNode }>;
}

interface TrackResponse {
  data?: {
    track?: {
      lastEvent?: TrackEventNode;
      events?: TrackEventsConnection;
    };
  };
  errors?: Array<{ message: string }>;
}

// ── carrier ID → GraphQL query mapping ──

const GRAPHQL_QUERY = `
query Track($carrierId: ID!, $trackingNumber: String!) {
  track(carrierId: $carrierId, trackingNumber: $trackingNumber) {
    lastEvent {
      time
      status { code name }
      description
      location { name }
    }
    events(last: 50) {
      edges {
        node {
          time
          status { code name }
          description
          location { name }
        }
      }
    }
  }
}
`.trim();

export function buildTrackerDeliveryRequest(
  carrierId: string,
  trackingNumber: string
): { url: string; init: RequestInit } {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'onuljang-tracker/1.0',
  };

  const apiKey = process.env.TRACKER_API_KEY;
  if (apiKey) {
    headers.Authorization = `TRACKQL-API-KEY ${apiKey}`;
  } else {
    console.warn('[TrackerDelivery] TRACKER_API_KEY is not set');
  }

  const body = JSON.stringify({
    query: GRAPHQL_QUERY,
    variables: { carrierId, trackingNumber },
  });

  return {
    url: 'https://apis.tracker.delivery/graphql',
    init: {
      method: 'POST',
      headers,
      body,
    },
  };
}

function toLocalDateTime(time: string | null | undefined): string | null {
  if (!time) return null;
  const trimmed = time.trim();
  // "2026-03-29T10:00:00.123+09:00" → "2026-03-29T10:00:00"
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  return match ? match[1] : trimmed;
}

function isUsableEvent(node: TrackEventNode): boolean {
  // v2 first event is often a placeholder with time=null, location="상품위치"
  // UNKNOWN status (e.g. 인수자등록) provides no useful tracking info
  return node.time != null && node.status.code !== 'UNKNOWN';
}

export async function parseTrackerDeliveryEvents(response: Response): Promise<ApiTrackingEvent[]> {
  const data = (await response.json()) as TrackResponse;

  if (data.errors && data.errors.length > 0) {
    console.error('[TrackerDelivery] GraphQL errors:', data.errors.map(e => e.message).join(', '));
  }

  const track = data.data?.track;
  if (!track) {
    return [];
  }

  const edges = track.events?.edges;
  if (edges && edges.length > 0) {
    return edges
      .map(({ node }) => node)
      .filter(isUsableEvent)
      .map((node) => ({
        statusCode: node.status.code || null,
        statusText: node.status.name || null,
        location: node.location?.name || null,
        timestamp: toLocalDateTime(node.time),
      }));
  }

  // fallback: lastEvent only
  if (track.lastEvent && isUsableEvent(track.lastEvent)) {
    const e = track.lastEvent;
    return [{
      statusCode: e.status.code || null,
      statusText: e.status.name || null,
      location: e.location?.name || null,
      timestamp: toLocalDateTime(e.time),
    }];
  }

  return [];
}
