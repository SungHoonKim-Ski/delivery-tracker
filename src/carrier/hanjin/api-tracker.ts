import { createApiTracker } from '../base-api-tracker.js';
import { buildTrackerDeliveryRequest, parseTrackerDeliveryEvents } from '../tracker-delivery/client.js';
import { mapHanjinStatus } from './status-map.js';

const hanjinApiTracker = createApiTracker({
  carrierCode: 'HANJIN',
  buildRequest(trackingNumber: string) {
    return buildTrackerDeliveryRequest('kr.hanjin', trackingNumber);
  },
  async parseEvents(response: Response) {
    return parseTrackerDeliveryEvents(response);
  },
  mapStatus: mapHanjinStatus,
});

export const trackHanjinApi = hanjinApiTracker.track;
