import { createApiTracker } from '../base-api-tracker.js';
import { buildTrackerDeliveryRequest, parseTrackerDeliveryEvents } from '../tracker-delivery/client.js';
import { mapLotteStatus } from './status-map.js';

const lotteTracker = createApiTracker({
  carrierCode: 'LOTTE',
  buildRequest(trackingNumber: string) {
    return buildTrackerDeliveryRequest('kr.lotte', trackingNumber);
  },
  async parseEvents(response: Response) {
    return parseTrackerDeliveryEvents(response);
  },
  mapStatus: mapLotteStatus,
});

export const trackLotte = lotteTracker.track;
