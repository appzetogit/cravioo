/**
 * Cashfree Payment Integration Utility
 * Handles Cashfree checkout initialization. Loaded directly from Cashfree's CDN
 * (required for PCI compliance - never bundle/self-host this script).
 */

let cashfreeScriptLoaded = false;
const CASHFREE_MODE = import.meta.env?.VITE_CASHFREE_ENV === 'production' ? 'production' : 'sandbox';

/**
 * Load the Cashfree checkout script.
 */
export const loadCashfreeScript = () => {
  return new Promise((resolve, reject) => {
    if (cashfreeScriptLoaded || window.Cashfree) {
      cashfreeScriptLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    script.onload = () => {
      cashfreeScriptLoaded = true;
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load Cashfree script'));
    };
    document.body.appendChild(script);
  });
};

/**
 * Open the Cashfree hosted checkout for a one-time order payment.
 * @param {Object} options
 * @param {String} options.paymentSessionId - from the backend's create-order response
 * @param {String} [options.redirectTarget] - '_self' | '_blank' | '_modal' (default '_modal')
 * @param {Function} options.onSuccess - called with { orderId } once checkout closes after a payment attempt
 * @param {Function} options.onError - called on failure
 */
export const initCashfreePayment = async (options) => {
  try {
    await loadCashfreeScript();
    if (!window.Cashfree) {
      throw new Error('Cashfree SDK not available');
    }

    const cashfree = window.Cashfree({ mode: CASHFREE_MODE });
    const result = await cashfree.checkout({
      paymentSessionId: options.paymentSessionId,
      redirectTarget: options.redirectTarget || '_modal',
    });

    // checkout() resolves once the modal closes (success, failure, or user dismiss).
    // Cashfree never hands back a signature - the caller must re-verify order status
    // with the backend (which re-checks with Cashfree's server) before trusting payment.
    if (result?.error) {
      if (options.onError) options.onError(result.error);
      return result;
    }
    if (options.onSuccess) options.onSuccess({ orderId: options.orderId });
    return result;
  } catch (error) {
    console.error('Error initializing Cashfree checkout:', error);
    if (options.onError) options.onError(error);
    throw error;
  }
};

/**
 * Open the Cashfree hosted checkout to authorize a recurring subscription mandate.
 * @param {Object} options
 * @param {String} options.subscriptionSessionId - from the backend's create-subscription response
 */
export const initCashfreeSubscription = async (options) => {
  try {
    await loadCashfreeScript();
    if (!window.Cashfree) {
      throw new Error('Cashfree SDK not available');
    }

    const cashfree = window.Cashfree({ mode: CASHFREE_MODE });
    const result = await cashfree.checkout({
      paymentSessionId: options.subscriptionSessionId,
      redirectTarget: options.redirectTarget || '_modal',
    });

    if (result?.error) {
      if (options.onError) options.onError(result.error);
      return result;
    }
    if (options.onSuccess) options.onSuccess({ subscriptionId: options.subscriptionId });
    return result;
  } catch (error) {
    if (options.onError) options.onError(error);
    throw error;
  }
};

/**
 * Format amount for display (Cashfree amounts are already in rupees, not paise).
 * @param {Number} amount
 * @returns {String}
 */
export const formatAmount = (amount) => {
  return `₹${Number(amount || 0).toFixed(2)}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Flutter WebView Bridge Utilities
// Shared between SignupStep2, Cart and any other page that needs Cashfree
// inside a flutter_inappwebview WebView.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect if the page is running inside a Flutter InAppWebView.
 * @returns {boolean}
 */
export const isFlutterWebView = () => {
  return (
    typeof window !== 'undefined' &&
    !!window.flutter_inappwebview &&
    typeof window.flutter_inappwebview.callHandler === 'function'
  );
};

/**
 * Trigger a Cashfree payment via the native Flutter Cashfree SDK, falling back
 * to the web checkout above when no native handler responds.
 *
 * @param {Object} cfOptions - { orderId, paymentSessionId, amount, currency }
 * @returns {Promise<{cashfree_order_id}>}
 */
export const handleFlutterCashfreePayment = (cfOptions) => {
  return new Promise((resolve, reject) => {
    try {
      const payload = {
        orderId: cfOptions.orderId,
        order_id: cfOptions.orderId,
        paymentSessionId: cfOptions.paymentSessionId,
        payment_session_id: cfOptions.paymentSessionId,
        amount: cfOptions.amount,
        currency: cfOptions.currency || 'INR',
      };

      let settled = false;
      let timeoutId = null;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        ['onCashfreeSuccess', 'onCashfreePaymentSuccess', 'onPaymentSuccess', 'cashfreePaymentSuccess']
          .forEach((name) => { if (window[name] === handleSuccess) delete window[name]; });
        ['onCashfreeFailure', 'onCashfreePaymentFailure', 'onPaymentFailure', 'onPaymentError', 'cashfreePaymentFailure']
          .forEach((name) => { if (window[name] === handleFailure) delete window[name]; });
        window.removeEventListener('message', handleMessage);
      };

      const finishSuccess = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        const orderId = result?.cashfree_order_id || result?.orderId || result?.order_id || cfOptions.orderId;
        resolve({ cashfree_order_id: orderId });
      };

      const finishFailure = (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        const msg = (typeof err === 'string'
          ? err
          : err?.error?.description || err?.description || err?.message) || 'Payment failed or cancelled';
        reject(new Error(msg));
      };

      const handleSuccess = (result) => finishSuccess(result);
      const handleFailure = (err) => finishFailure(err);
      ['onCashfreeSuccess', 'onCashfreePaymentSuccess', 'onPaymentSuccess', 'cashfreePaymentSuccess']
        .forEach((name) => { window[name] = handleSuccess; });
      ['onCashfreeFailure', 'onCashfreePaymentFailure', 'onPaymentFailure', 'onPaymentError', 'cashfreePaymentFailure']
        .forEach((name) => { window[name] = handleFailure; });

      const handleMessage = (event) => {
        let data = event.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch { return; }
        }
        if (!data || typeof data !== 'object') return;
        const type = data.type || data.event || '';
        if (/cashfree/i.test(type) && /success/i.test(type)) {
          finishSuccess(data.payload || data.result || data);
        } else if (/cashfree/i.test(type) && /(fail|error|cancel)/i.test(type)) {
          finishFailure(data.payload || data.result || data);
        } else if (data.cashfree_order_id || data.orderId) {
          finishSuccess(data);
        }
      };
      window.addEventListener('message', handleMessage);

      const handlerNames = [
        'initCashfreePayment',
        'initCashfree',
        'cashfreePayment',
        'startCashfree',
        'openCashfreeCheckout',
        'openCashfree',
        'startPayment',
        'cashfreeCheckout',
      ];

      const tryHandlers = async () => {
        for (const handlerName of handlerNames) {
          if (settled) return;

          try {
            const callPromise = window.flutter_inappwebview.callHandler(handlerName, payload);

            callPromise.then((res) => {
              if (res && typeof res === 'object') {
                if (res.cashfree_order_id || res.orderId) finishSuccess(res);
                else if (res.error || res.cancelled) finishFailure(res.error || 'Payment cancelled');
              }
            }).catch(() => { /* handled in loop below */ });

            const result = await Promise.race([
              callPromise,
              new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
            ]);

            if (settled) return;

            if (result && typeof result === 'object') {
              if (result.cashfree_order_id || result.orderId) { finishSuccess(result); return; }
              if (result.error || result.cancelled) { finishFailure(result.error || 'Payment cancelled'); return; }
            }

            // Handler accepted the call → native UI is open; wait up to 10 minutes.
            timeoutId = setTimeout(() => {
              finishFailure(new Error('Payment timed out. Please try again.'));
            }, 10 * 60 * 1000);
            return;

          } catch (err) {
            if (err.message === 'timeout') {
              continue;
            }
            console.warn(`[Cashfree Flutter] Handler "${handlerName}" rejected:`, err);
          }
        }

        if (settled) return;

        // No native Cashfree handler found → fall back to web checkout inside the WebView.
        console.warn('[Cashfree Flutter] No native handler found. Falling back to web checkout.');
        cleanup();

        try {
          await loadCashfreeScript();
          if (!window.Cashfree) throw new Error('Cashfree web SDK unavailable');

          const cashfree = window.Cashfree({ mode: CASHFREE_MODE });
          const result = await cashfree.checkout({
            paymentSessionId: cfOptions.paymentSessionId,
            redirectTarget: '_modal',
          });
          if (result?.error) {
            reject(new Error(result.error?.message || 'Payment failed'));
            return;
          }
          resolve({ cashfree_order_id: cfOptions.orderId });
        } catch (webErr) {
          reject(new Error('Payment unavailable. Please try again.'));
        }
      };

      tryHandlers();
    } catch (e) {
      reject(new Error('Flutter payment bridge unavailable'));
    }
  });
};
