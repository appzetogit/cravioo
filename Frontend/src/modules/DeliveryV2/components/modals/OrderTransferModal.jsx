import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRightLeft, X, Loader2, ShieldCheck } from "lucide-react";
import { deliveryAPI } from "@food/api";
import { toast } from "sonner";
import { useDeliveryStore } from "@/modules/DeliveryV2/store/useDeliveryStore";

const Backdrop = ({ onClose }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="absolute inset-0 bg-black/40 -z-10 pointer-events-auto"
    onClick={onClose}
  />
);

/**
 * D1's "Transfer this order?" prompt, shown just before the drop-OTP screen.
 * Offers the order to nearby DSU partners; if accepted, shows D1 the handover
 * OTP to read out to D2. If no DSU partner is found, or D1 changes their mind,
 * they fall back to completing the delivery themselves via onSkip.
 *
 * `transferAccepted` / `transferCompleted` are passed down from
 * useDeliveryNotifications (socket events transfer_accepted / transfer_completed)
 * so this component never opens its own socket connection.
 */
export const OrderTransferModal = ({
  order,
  onClose,
  onSkip,
  onTransferredAway,
  transferAccepted,
  transferCompleted,
}) => {
  const { riderLocation } = useDeliveryStore();
  const [step, setStep] = useState("offer"); // offer | searching | waiting | handover | none_found
  const [handoverOtp, setHandoverOtp] = useState("");

  const orderId = order?.orderMongoId || order?.orderId || order?._id;

  const handleOfferTransfer = async () => {
    if (!riderLocation?.lat || !riderLocation?.lng) {
      toast.error("Waiting for your location. Please try again in a moment.");
      return;
    }
    setStep("searching");
    try {
      const res = await deliveryAPI.initiateOrderTransfer(orderId, {
        lat: riderLocation.lat,
        lng: riderLocation.lng,
      });
      const data = res?.data?.data || {};
      if (data.eligible) {
        setStep("waiting");
      } else {
        setStep("none_found");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not start transfer");
      setStep("offer");
    }
  };

  // D2 accepted — show D1 the handover OTP (also arrives via socket transfer_accepted).
  useEffect(() => {
    if (!transferAccepted) return;
    const eventKey = String(transferAccepted.orderMongoId || transferAccepted.orderId || "");
    if (eventKey && eventKey === String(orderId) && transferAccepted.transferOtp) {
      setHandoverOtp(String(transferAccepted.transferOtp));
      setStep("handover");
    }
  }, [transferAccepted, orderId]);

  // Handover OTP verified by D2 — release D1 from this order immediately.
  useEffect(() => {
    if (!transferCompleted) return;
    const eventKey = String(transferCompleted.orderMongoId || transferCompleted.orderId || "");
    if (eventKey && eventKey === String(orderId)) {
      onTransferredAway?.();
    }
  }, [transferCompleted, orderId, onTransferredAway]);

  // Poll as a fallback for the waiting/handover steps, in case a socket event is missed.
  useEffect(() => {
    if (step !== "waiting" && step !== "handover") return undefined;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await deliveryAPI.getOrderById(orderId);
        const freshOrder = res?.data?.data?.order;
        const transfer = freshOrder?.transfer;
        if (cancelled || !transfer) return;
        if (transfer.status === "verified" || transfer.status === "completed") {
          clearInterval(interval);
          onTransferredAway?.();
        }
      } catch {
        /* keep polling */
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [step, orderId, onTransferredAway]);

  return (
    <div className="absolute inset-x-0 bottom-0 z-120 p-0 h-full flex items-end justify-center pointer-events-none">
      <Backdrop onClose={onClose} />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className="w-full bg-white rounded-t-[2.5rem] shadow-[0_-20px_60px_rgba(0,0,0,0.3)] p-6 pb-12 pointer-events-auto max-w-lg"
      >
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />

        <div className="flex justify-between items-start mb-6 px-1">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <div className="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center shadow-sm border bg-blue-50 text-blue-600 border-blue-100">
              <ArrowRightLeft className="w-7 h-7" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl md:text-2xl font-extrabold text-gray-900">Transfer this order?</h2>
              <p className="text-xs font-medium text-gray-500 mt-1">
                Hand off to a nearby DSU partner instead of delivering it yourself.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 shrink-0 flex items-center justify-center bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === "offer" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 px-1">
              We'll check for DSU partners near your current location. If one accepts, you'll get a
              handover code to share with them — your part of the delivery ends there.
            </p>
            <button
              onClick={handleOfferTransfer}
              className="w-full py-4 rounded-2xl font-bold text-sm bg-blue-600 text-white shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <ArrowRightLeft className="w-5 h-5" /> Find a DSU partner
            </button>
            <button
              onClick={onSkip}
              className="w-full py-4 rounded-2xl font-bold text-sm bg-gray-100 text-gray-700 active:scale-95 transition-all"
            >
              No, I'll deliver it myself
            </button>
          </div>
        )}

        {step === "searching" && (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-sm font-semibold text-gray-700">Looking for nearby DSU partners…</p>
          </div>
        )}

        {step === "none_found" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-4 gap-2 text-center">
              <p className="text-sm font-semibold text-gray-700">
                No DSU partners available nearby right now.
              </p>
              <p className="text-xs text-gray-500">You'll continue delivering this order yourself.</p>
            </div>
            <button
              onClick={onSkip}
              className="w-full py-4 rounded-2xl font-bold text-sm bg-gray-900 text-white active:scale-95 transition-all"
            >
              Continue delivery
            </button>
          </div>
        )}

        {step === "waiting" && (
          <div className="flex flex-col items-center py-8 gap-3 text-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-sm font-semibold text-gray-700">Waiting for a DSU partner to accept…</p>
            <button
              onClick={onSkip}
              className="mt-4 text-xs font-bold uppercase tracking-widest text-gray-500 underline"
            >
              Cancel and deliver it myself
            </button>
          </div>
        )}

        {step === "handover" && (
          <div className="space-y-5">
            <div className="flex flex-col items-center py-2 gap-2 text-center">
              <ShieldCheck className="w-10 h-10 text-emerald-600" />
              <p className="text-sm font-semibold text-gray-700">
                A DSU partner accepted. Share this code with them to complete the handover.
              </p>
            </div>
            <div className="flex justify-center gap-3">
              {String(handoverOtp).padStart(4, "0").split("").map((digit, i) => (
                <div
                  key={i}
                  className="w-14 h-18 bg-emerald-50 border-2 border-emerald-500 rounded-2xl flex items-center justify-center text-3xl font-bold text-emerald-700"
                >
                  {digit}
                </div>
              ))}
            </div>
            <p className="text-xs text-center text-gray-500">
              Your part of this delivery is complete once they verify this code.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
};
