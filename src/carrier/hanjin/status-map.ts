import { CourierOrderStatus } from '../../types.js';

export function mapHanjinStatus(text: string): CourierOrderStatus | null {
  const normalized = text.trim().toLowerCase();

  if (normalized === 'delivered') {
    return 'DELIVERED';
  }

  if (
    normalized === 'in_transit' ||
    normalized === 'out_for_delivery' ||
    normalized === 'at_destination_hub' ||
    normalized === 'at_pickup_hub'
  ) {
    return 'IN_TRANSIT';
  }

  if (normalized === 'information_received' || normalized === 'at_pickup') {
    return 'SHIPPED';
  }

  if (text.includes('배달완료') || text.includes('배송완료')) {
    return 'DELIVERED';
  }

  if (
    text.includes('이동중') ||
    text.includes('간선') ||
    text.includes('배송출발') ||
    text.includes('배달출발') ||
    text.includes('도착') ||
    text.includes('상차') ||
    text.includes('하차')
  ) {
    return 'IN_TRANSIT';
  }

  if (text.includes('접수') || text.includes('집하') || text.includes('집화처리')) {
    return 'SHIPPED';
  }

  return null;
}
