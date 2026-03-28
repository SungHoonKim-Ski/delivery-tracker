export type CourierCompany = 'LOGEN' | 'HANJIN' | 'CJ' | 'LOTTE' | 'EPOST';

export type CourierOrderStatus = 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED';

export interface TrackingRequest {
  displayCode: string;
  trackingNumber: string;
  courierCompany: CourierCompany;
}

export interface TrackingEvent {
  eventAt: string | null;
  location: string | null;
  rawStatusCode: string | null;
  rawStatusText: string | null;
  mappedStatus: CourierOrderStatus | null;
}

export interface TrackingResult {
  displayCode: string;
  events: TrackingEvent[];
}

export interface CarrierTracker {
  track(trackingNumber: string, displayCode: string): Promise<TrackingResult | null>;
}
