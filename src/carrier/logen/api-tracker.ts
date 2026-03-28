import { createApiTracker } from '../base-api-tracker.js';
import { buildTrackerDeliveryRequest, parseTrackerDeliveryEvents } from '../tracker-delivery/client.js';
import { mapLogenStatus } from './status-map.js';

const logenApiTracker = createApiTracker({
  carrierCode: 'LOGEN',
  buildRequest(trackingNumber: string) {
    return buildTrackerDeliveryRequest('kr.logen', trackingNumber);
  },
  async parseEvents(response: Response) {
    return parseTrackerDeliveryEvents(response);
  },
  mapStatus: mapLogenStatus,
});

export const trackLogenApi = logenApiTracker.track;
