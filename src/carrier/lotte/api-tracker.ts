import { createApiTracker } from '../base-api-tracker.js';
import { buildTrackerDeliveryRequest, parseTrackerDeliveryLatestEvent } from '../tracker-delivery/client.js';
import { mapLotteStatus } from './status-map.js';

const lotteTracker = createApiTracker({
  carrierCode: 'LOTTE',
  buildRequest(trackingNumber: string) {
    return buildTrackerDeliveryRequest('kr.lotte', trackingNumber);
  },
  async parseLatestEvent(response: Response) {
    return parseTrackerDeliveryLatestEvent(response);
  },
  mapStatus: mapLotteStatus,
});

export const trackLotte = lotteTracker.track;
