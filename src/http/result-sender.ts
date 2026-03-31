import { TrackingResult } from '../types.js';

export async function sendResultHttp(result: TrackingResult): Promise<void> {
  const url = process.env.RESULT_API_URL;
  if (!url) {
    throw new Error('RESULT_API_URL must be set');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request_id: result.requestId,
      display_code: result.displayCode,
      events: result.events.map(e => ({
        event_at: e.eventAt,
        location: e.location,
        raw_status_code: e.rawStatusCode,
        raw_status_text: e.rawStatusText,
        mapped_status: e.mappedStatus,
      })),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
}
