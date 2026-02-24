import { createApiTracker } from '../base-api-tracker.js';
import { buildTrackerDeliveryRequest, parseTrackerDeliveryLatestEvent } from '../tracker-delivery/client.js';
import { mapHanjinStatus } from './status-map.js';

const hanjinApiTracker = createApiTracker({
  carrierCode: 'HANJIN',
  buildRequest(trackingNumber: string) {
    return buildTrackerDeliveryRequest('kr.hanjin', trackingNumber);
  },
  async parseLatestEvent(response: Response) {
    return parseTrackerDeliveryLatestEvent(response);
  },
  mapStatus: mapHanjinStatus,
});

export const trackHanjinApi = hanjinApiTracker.track;
