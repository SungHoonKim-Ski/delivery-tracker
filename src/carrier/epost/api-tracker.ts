import { createApiTracker } from '../base-api-tracker.js';
import { buildTrackerDeliveryRequest, parseTrackerDeliveryEvents } from '../tracker-delivery/client.js';
import { mapEpostStatus } from './status-map.js';

const epostTracker = createApiTracker({
  carrierCode: 'EPOST',
  buildRequest(trackingNumber: string) {
    return buildTrackerDeliveryRequest('kr.epost', trackingNumber);
  },
  async parseEvents(response: Response) {
    return parseTrackerDeliveryEvents(response);
  },
  mapStatus: mapEpostStatus,
});

export const trackEpost = epostTracker.track;
