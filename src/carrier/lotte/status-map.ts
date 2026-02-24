import { CourierOrderStatus } from '../../types.js';

export function mapLotteStatus(text: string): CourierOrderStatus | null {
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
    text.includes('간선상차') ||
    text.includes('간선하차') ||
    text.includes('배송출발') ||
    text.includes('배달중') ||
    text.includes('이동중')
  ) {
    return 'IN_TRANSIT';
  }

  if (text.includes('집하') || text.includes('접수') || text.includes('상품접수')) {
    return 'SHIPPED';
  }

  return null;
}
