package com.foodrestaurant.app

import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import io.flutter.plugins.firebase.messaging.FlutterFirebaseMessagingService

/**
 * Raises the new-order alert from Kotlin, the moment the push lands.
 *
 * ## Why this exists
 *
 * The alert used to be drawn by `flutter_local_notifications` from the Dart
 * background handler, which only runs once a Flutter engine has been started. When
 * the app is killed, or the phone has been sitting idle, that happens late or not at
 * all — so the alert arrived silently, or long after the order did. This runs before
 * any engine is involved.
 *
 * ## Why it extends FlutterFirebaseMessagingService
 *
 * Android gives the MESSAGING_EVENT intent filter to exactly ONE service. A plain
 * `FirebaseMessagingService` declared here would win that election and silently
 * displace the `firebase_messaging` plugin's own service — Dart would stop receiving
 * pushes entirely, taking every other notification in the app with it. The symptom is
 * brutal to diagnose, because this alert keeps working perfectly while everything
 * else goes quiet.
 *
 * Extending the plugin's service and calling `super` keeps both paths alive.
 */
class NewOrderMessagingService : FlutterFirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        // Cheap and permanent. Whether a push physically reached the device is the
        // first question in every "notifications aren't coming" report, and without a
        // line here it is unanswerable: a message dropped by FCM, by the OEM, or sent
        // to a stale token all look identical from the outside — nothing happens.
        Log.i(TAG, "FCM received: type=${data["type"]} id=${orderIdOf(data)}")

        // The alert is posted BEFORE super, and the ordering is load-bearing.
        //
        // super.onMessageReceived is what wakes Dart, and Dart decides whether to draw
        // its own alert. Posting after super means Dart gets there first and the
        // restaurant sees two notifications for one order.
        //
        // Wrapped so a failure here can never stop the push reaching Dart.
        if (data.isNotEmpty()) {
            try {
                when (data["type"]) {
                    in NEW_ORDER_TYPES -> NewOrderNotifier.show(applicationContext, data)
                    in CLOSE_TYPES -> NewOrderNotifier.dismiss(applicationContext, orderIdOf(data))
                }
            } catch (t: Throwable) {
                Log.e(TAG, "failed to post new-order alert", t)
                // Kotlin owns EVERY Android alert for a new order, including this
                // failure path. Dart used to provide the fallback, but that needed the
                // two languages to agree on who had drawn what, and getting that wrong
                // shows two alerts for one order.
                if (data["type"] in NEW_ORDER_TYPES) {
                    try {
                        NewOrderNotifier.showFallback(applicationContext, data)
                    } catch (_: Throwable) {
                        // Nothing further is possible from here.
                    }
                }
            }
        }

        // ALWAYS called, whatever happened above — silencing Dart would break every
        // other push in the app, not just this one.
        super.onMessageReceived(message)
    }

    /**
     * The token can be refreshed while the app is in the background, where Dart's
     * listener does not exist yet. Handing it to `super` lets the plugin persist it.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
    }

    companion object {
        private const val TAG = "NewOrderFcm"

        private val NEW_ORDER_TYPES = setOf("new_order")

        /** Order taken elsewhere, cancelled, or withdrawn by the backend. */
        private val CLOSE_TYPES = setOf(
            "order_taken",
            "order_cancelled",
            "new_order_closed",
            "order_expired",
        )

        fun orderIdOf(data: Map<String, String>): String? =
            listOf("orderMongoId", "orderId", "_id", "id")
                .asSequence()
                .mapNotNull { data[it] }
                .firstOrNull { it.isNotBlank() }
    }
}
