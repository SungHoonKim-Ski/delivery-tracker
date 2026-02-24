export type CourierCompany = 'LOGEN' | 'HANJIN' | 'CJ' | 'LOTTE';

export type CourierOrderStatus = 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED';

export interface TrackingRequest {
  displayCode: string;
  trackingNumber: string;
  courierCompany: CourierCompany;
}

export interface TrackingResult {
  displayCode: string;
  status: CourierOrderStatus;
  location?: string;
  timestamp?: string;
}

export interface CarrierTracker {
  track(trackingNumber: string, displayCode: string): Promise<TrackingResult | null>;
}
