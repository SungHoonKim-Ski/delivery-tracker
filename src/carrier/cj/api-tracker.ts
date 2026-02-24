import { createApiTracker } from '../base-api-tracker.js';
import { buildTrackerDeliveryRequest, parseTrackerDeliveryLatestEvent } from '../tracker-delivery/client.js';
import { mapCjStatus } from './status-map.js';

const cjTracker = createApiTracker({
  carrierCode: 'CJ',
  buildRequest(trackingNumber: string) {
    return buildTrackerDeliveryRequest('kr.cjlogistics', trackingNumber);
  },
  async parseLatestEvent(response: Response) {
    return parseTrackerDeliveryLatestEvent(response);
  },
  mapStatus: mapCjStatus,
});

export const trackCj = cjTracker.track;
