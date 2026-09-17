import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, CalendarDays, Loader2, MapPin, Star, Users, X } from "lucide-react"
import { toast } from "sonner"
import { diningAPI } from "@food/api"
import {
  DINING_BOOKING_STATUS_CLASSES,
  DINING_BOOKING_STATUS_LABELS,
  diningErrorMessage,
  formatDateKey,
  formatSlotRange,
} from "@food/utils/dining"

const TABS = [
  { value: "active", label: "Upcoming" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
]

export default function DiningBookings() {
  const navigate = useNavigate()
  const [tab, setTab] = useState("active")
  const [data, setData] = useState({ items: [], counts: {} })
  const [loading, setLoading] = useState(true)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState("")
  const [rateTarget, setRateTarget] = useState(null)
  const [rating, setRating] = useState(5)
  const [review, setReview] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await diningAPI.user.listBookings({ status: tab, limit: 50 })
      setData(res?.data?.data || { items: [], counts: {} })
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to load your bookings"))
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  const submitCancel = async () => {
    if (cancelReason.trim().length < 3) {
      toast.error("Please tell the restaurant why")
      return
    }
    setSubmitting(true)
    try {
      await diningAPI.user.cancelBooking(cancelTarget.id, { reason: cancelReason.trim() })
      toast.success("Booking cancelled")
      setCancelTarget(null)
      setCancelReason("")
      await load()
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to cancel booking"))
    } finally {
      setSubmitting(false)
    }
  }

  const submitRating = async () => {
    setSubmitting(true)
    try {
      await diningAPI.user.rateBooking(rateTarget.id, { rating, review: review.trim() })
      toast.success("Thanks for your feedback")
      setRateTarget(null)
      setReview("")
      setRating(5)
      await load()
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to submit rating"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 dark:bg-[#0f0f0f]">
      <div className="sticky top-0 z-30 border-b border-gray-100 bg-white dark:border-gray-800 dark:bg-[#1a1a1a]">
        <div className="flex items-center gap-3 px-4 py-4">
          <button type="button" onClick={() => navigate(-1)} className="rounded-full p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
            <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-200" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">My Dining Bookings</h1>
        </div>
        <div className="flex gap-2 px-4 pb-3">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                tab === item.value
                  ? "border-orange-300 bg-orange-50 text-orange-700"
                  : "border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-[#1a1a1a] dark:text-gray-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading bookings…
          </div>
        ) : data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-[#1a1a1a]">
            <CalendarDays className="mx-auto h-9 w-9 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">No bookings yet</p>
            <button
              type="button"
              onClick={() => navigate("/food/user/dining")}
              className="mt-4 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Explore dining
            </button>
          </div>
        ) : (
          data.items.map((booking) => (
            <div
              key={booking.id}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-[#1a1a1a]"
            >
              <div className="flex gap-3 p-4">
                {booking.restaurantImage && (
                  <img
                    src={booking.restaurantImage}
                    alt={booking.restaurantName}
                    loading="lazy"
                    className="h-20 w-24 shrink-0 rounded-xl object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-semibold text-gray-900 dark:text-white">
                      {booking.restaurantName}
                    </h3>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        DINING_BOOKING_STATUS_CLASSES[booking.status] || ""
                      }`}
                    >
                      {DINING_BOOKING_STATUS_LABELS[booking.status] || booking.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{booking.bookingCode}</p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {formatDateKey(booking.date, { withYear: false })} ·{" "}
                    {formatSlotRange(booking.slotStart, booking.slotEnd)}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                    <Users className="h-3.5 w-3.5 text-gray-400" /> {booking.guests} guests
                  </p>
                </div>
              </div>

              {booking.restaurantAddress && (
                <p className="flex items-start gap-2 px-4 pb-3 text-sm text-gray-500 dark:text-gray-400">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {booking.restaurantAddress}
                </p>
              )}

              {booking.tables?.length > 0 && (
                <p className="px-4 pb-3 text-sm text-gray-500">
                  Table: {booking.tables.map((table) => table.name).join(", ")}
                </p>
              )}

              {booking.cancelReason && (
                <p className="px-4 pb-3 text-sm text-rose-600">Reason: {booking.cancelReason}</p>
              )}

              {(booking.canCancel || booking.canRate) && (
                <div className="flex gap-2 border-t border-gray-100 p-3 dark:border-gray-800">
                  {booking.canCancel && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelTarget(booking)
                        setCancelReason("")
                      }}
                      className="flex-1 rounded-xl border border-rose-200 py-2.5 text-sm font-semibold text-rose-600"
                    >
                      Cancel booking
                    </button>
                  )}
                  {booking.canRate && (
                    <button
                      type="button"
                      onClick={() => {
                        setRateTarget(booking)
                        setRating(5)
                        setReview("")
                      }}
                      className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white"
                    >
                      Rate visit
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl dark:bg-[#1a1a1a]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Cancel booking</h3>
              <button type="button" onClick={() => setCancelTarget(null)}>
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {cancelTarget.restaurantName} · {formatDateKey(cancelTarget.date, { withYear: false })}
            </p>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Reason for cancelling"
              className="mt-3 w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-[#111] dark:text-white"
            />
            <button
              type="button"
              onClick={submitCancel}
              disabled={submitting}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancel booking
            </button>
          </div>
        </div>
      )}

      {rateTarget && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl dark:bg-[#1a1a1a]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Rate your visit</h3>
              <button type="button" onClick={() => setRateTarget(null)}>
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <p className="mt-1 text-sm text-gray-500">{rateTarget.restaurantName}</p>
            <div className="mt-4 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" onClick={() => setRating(value)}>
                  <Star
                    className={`h-8 w-8 ${
                      value <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
            </div>
            <textarea
              rows={3}
              value={review}
              onChange={(event) => setReview(event.target.value)}
              placeholder="Share what you liked (optional)"
              className="mt-4 w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-[#111] dark:text-white"
            />
            <button
              type="button"
              onClick={submitRating}
              disabled={submitting}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit rating
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
