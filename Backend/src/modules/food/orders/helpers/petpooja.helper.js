import { config } from '../../../../config/env.js';
import { logger } from '../../../../utils/logger.js';

/** A restaurant must have these filled in by admin before an order can be pushed. */
export const isPetpoojaConfigured = (restaurant) => {
  const p = restaurant?.petpooja;
  return Boolean(p?.enabled && p.restId && p.appKey && p.appSecret && p.accessToken);
};

const two = (n) => String(Math.round((Number(n) || 0) * 100) / 100);

/** Builds the `orderinfo` payload PetPooja's /save_order expects from our order + restaurant docs. */
export const buildPetpoojaOrderInfo = (order, restaurant) => {
  const addr = order.deliveryAddress || {};
  const pricing = order.pricing || {};
  const customerName = order.userId?.name || addr.label || 'Customer';
  const customerPhone = order.userId?.phone || addr.phone || '';

  return {
    Restaurant: {
      res_name: restaurant.restaurantName || '',
      address: [restaurant.addressLine1, restaurant.addressLine2, restaurant.city]
        .filter(Boolean)
        .join(', '),
      contact_information: restaurant.primaryContactNumber || restaurant.ownerPhone || '',
      restID: restaurant.petpooja.restId,
    },
    Customer: {
      name: customerName,
      address: [addr.street, addr.additionalDetails, addr.city, addr.state].filter(Boolean).join(', '),
      phone: customerPhone,
      email: order.userId?.email || '',
      latitude: addr.location?.coordinates?.[1] != null ? String(addr.location.coordinates[1]) : '',
      longitude: addr.location?.coordinates?.[0] != null ? String(addr.location.coordinates[0]) : '',
    },
    Order: {
      orderID: order.orderId,
      order_type: order.deliveryMode === 'quick' ? 'Delivery' : 'Delivery',
      payment_type: order.payment?.method === 'cash' ? 'COD' : 'ONLINE',
      total: two(pricing.total),
      tax_total: two((pricing.tax || 0) + (pricing.foodGst || 0)),
      discount_total: two(pricing.discount || 0),
      delivery_charges: two(pricing.deliveryFee || pricing.totalDeliveryFee),
      packing_charges: two(pricing.packagingFee),
      description: order.note || '',
      created_on: new Date(order.createdAt || Date.now()).toISOString(),
      collect_cash: order.payment?.method === 'cash' ? two(pricing.total) : '0',
      enable_delivery: '1',
    },
    OrderItem: (order.items || []).map((item) => ({
      id: item.itemId,
      name: item.name,
      price: two(item.price),
      final_price: two(item.price),
      quantity: String(item.quantity),
      description: item.notes || '',
      variation_name: item.variantName || '',
    })),
    Tax: [],
    Discount: pricing.discount
      ? [{ title: pricing.couponCode || 'Discount', amount: two(pricing.discount) }]
      : [],
  };
};

/** Pushes one order into a restaurant's PetPooja POS for billing/KOT. Never throws to the caller. */
export const pushOrderToPetpooja = async (order, restaurant) => {
  if (!isPetpoojaConfigured(restaurant)) {
    return { success: false, skipped: true, reason: 'NOT_CONFIGURED' };
  }

  const body = {
    app_key: restaurant.petpooja.appKey,
    app_secret: restaurant.petpooja.appSecret,
    access_token: restaurant.petpooja.accessToken,
    orderinfo: buildPetpoojaOrderInfo(order, restaurant),
  };

  try {
    const response = await fetch(`${config.petpoojaOrdersApiUrl}/save_order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || String(data?.success) !== '1') {
      const message = data?.message || `PetPooja responded with ${response.status}`;
      logger.error(`PetPooja save_order failed for order ${order.orderId}: ${message}`);
      return { success: false, error: message };
    }

    logger.info(`PetPooja save_order succeeded for order ${order.orderId} -> petpooja orderID ${data.orderID}`);
    return { success: true, petpoojaOrderId: data.orderID || '', message: data.message || '' };
  } catch (err) {
    logger.error(`PetPooja save_order request failed for order ${order.orderId}: ${err?.message || err}`);
    return { success: false, error: err?.message || 'Request failed' };
  }
};
