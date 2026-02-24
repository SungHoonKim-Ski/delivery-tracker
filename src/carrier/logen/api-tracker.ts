import { createApiTracker } from '../base-api-tracker.js';
import { buildTrackerDeliveryRequest, parseTrackerDeliveryLatestEvent } from '../tracker-delivery/client.js';
import { mapLogenStatus } from './status-map.js';

const logenApiTracker = createApiTracker({
  carrierCode: 'LOGEN',
  buildRequest(trackingNumber: string) {
    return buildTrackerDeliveryRequest('kr.logen', trackingNumber);
  },
  async parseLatestEvent(response: Response) {
    return parseTrackerDeliveryLatestEvent(response);
  },
  mapStatus: mapLogenStatus,
});

export const trackLogenApi = logenApiTracker.track;
