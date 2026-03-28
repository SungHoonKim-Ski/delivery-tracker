import { createApiTracker } from '../base-api-tracker.js';
import { buildTrackerDeliveryRequest, parseTrackerDeliveryEvents } from '../tracker-delivery/client.js';
import { mapCjStatus } from './status-map.js';

const cjTracker = createApiTracker({
  carrierCode: 'CJ',
  buildRequest(trackingNumber: string) {
    return buildTrackerDeliveryRequest('kr.cjlogistics', trackingNumber);
  },
  async parseEvents(response: Response) {
    return parseTrackerDeliveryEvents(response);
  },
  mapStatus: mapCjStatus,
});

export const trackCj = cjTracker.track;
