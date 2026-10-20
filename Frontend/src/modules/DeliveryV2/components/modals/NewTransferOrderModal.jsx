import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRightLeft, MapPin, IndianRupee } from "lucide-react";
import { ActionSlider } from "@/modules/DeliveryV2/components/ui/ActionSlider";

const OFFER_WINDOW_SEC = 30;

/**
 * D2's "incoming order transfer" offer — a DSU partner is being offered an
 * order another driver (D1) is handing off nearby. Distinct from NewOrderModal
 * (restaurant pickup offers): there is no restaurant leg here, just D1's
 * current handover location and the customer drop.
 */
export const NewTransferOrderModal = ({ offer, onAccept, onReject }) => {
  const [timeLeft, setTimeLeft] = useState(OFFER_WINDOW_SEC);

  useEffect(() => {
    setTimeLeft(OFFER_WINDOW_SEC);
  }, [offer?.orderMongoId, offer?.orderId]);

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [offer?.orderMongoId, offer?.orderId]);

  useEffect(() => {
    if (timeLeft <= 0) onReject?.();
  }, [timeLeft, onReject]);

  if (!offer) return null;

  const distanceMeters = Number(offer.pickupDistanceMeters ?? offer.distanceMeters);
  const distanceLabel = Number.isFinite(distanceMeters)
    ? distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toFixed(1)} km away`
      : `${Math.round(distanceMeters)} m away`
    : "Nearby";
  const earnings = Number(offer.dsuTransferCharge || 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] bg-black/60 flex items-end justify-center p-0"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className="w-full max-w-lg bg-white rounded-t-[3rem] overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.5)] flex flex-col"
      >
        <div className="bg-blue-600 px-6 pt-8 pb-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-100">
                Order Transfer
              </p>
              <h2 className="text-xl font-extrabold">Pickup from another driver</h2>
            </div>
          </div>
          <p className="text-sm text-blue-50">
            Another delivery partner wants to hand you an order that's already picked up.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Handover point
                </p>
                <p className="text-sm font-bold text-gray-900">{distanceLabel}</p>
              </div>
            </div>
            {earnings > 0 && (
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">DSU Earning</p>
                <p className="text-lg font-extrabold text-emerald-600 flex items-center gap-0.5">
                  <IndianRupee className="w-4 h-4" />
                  {earnings.toFixed(0)}
                </p>
              </div>
            )}
          </div>

          {Number.isFinite(Number(offer.itemsCount)) && Number(offer.itemsCount) > 0 && (
            <p className="text-xs text-gray-500 text-center">
              {offer.itemsCount} item{Number(offer.itemsCount) === 1 ? "" : "s"} · Order #
              {offer.orderId}
            </p>
          )}
        </div>

        <div className="p-5 pb-8 space-y-4">
          <ActionSlider
            label="Slide to Accept Transfer"
            onConfirm={() => onAccept(offer)}
            color="bg-blue-600"
            successLabel="Accepted ✓"
            timeProgress={(timeLeft / OFFER_WINDOW_SEC) * 100}
          />
          <button
            onClick={onReject}
            className="w-full text-gray-400 font-bold text-[9px] uppercase tracking-widest hover:text-red-500 transition-colors py-1 active:scale-95"
          >
            Pass this transfer
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
