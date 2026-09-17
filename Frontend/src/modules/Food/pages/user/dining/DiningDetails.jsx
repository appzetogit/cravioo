import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Minus,
  Phone,
  Plus,
  Star,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { diningAPI } from "@food/api"
import { isModuleAuthenticated } from "@food/utils/auth"
import {
  addDays,
  diningErrorMessage,
  formatCurrency,
  formatDateKey,
  formatTime,
  toDateKey,
  validateBookingForm,
} from "@food/utils/dining"

const OCCASIONS = ["Birthday", "Anniversary", "Date night", "Business meal", "Family get-together"]

export default function DiningDetails() {
  const { restaurantId } = useParams()
  const navigate = useNavigate()

  const [place, setPlace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeImage, setActiveImage] = useState("")

  const [date, setDate] = useState(toDateKey())
  const [guests, setGuests] = useState(2)
  const [availability, setAvailability] = useState(null)
  const [slotLoading, setSlotLoading] = useState(false)
  const [slotStart, setSlotStart] = useState("")

  const [form, setForm] = useState({ guestName: "", guestPhone: "", occasion: "", specialRequest: "" })
  const [errors, setErrors] = useState({})
  const [booking, setBooking] = useState(false)
  const [confirmation, setConfirmation] = useState(null)

  const isAuthenticated = isModuleAuthenticated("user")

  useEffect(() => {
    let active = true
    setLoading(true)
    diningAPI.public
      .getRestaurant(restaurantId)
      .then((res) => {
        if (!active) return
        const data = res?.data?.data || null
        setPlace(data)
        setActiveImage(data?.coverImage || "")
      })
      .catch((error) => {
        if (!active) return
        toast.error(diningErrorMessage(error, "Dining is not available at this outlet"))
        setPlace(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [restaurantId])

  const dateOptions = useMemo(() => {
    const window = place?.bookingWindowDays ?? 14
    return Array.from({ length: Math.min(window, 14) }, (_, index) => toDateKey(addDays(new Date(), index)))
  }, [place?.bookingWindowDays])

  const loadAvailability = useCallback(async () => {
    if (!restaurantId) return
    setSlotLoading(true)
    setSlotStart("")
    try {
      const res = await diningAPI.public.getAvailability(restaurantId, { date, guests })
      setAvailability(res?.data?.data || null)
    } catch (error) {
      setAvailability(null)
      toast.error(diningErrorMessage(error, "Failed to load slots"))
    } finally {
      setSlotLoading(false)
    }
  }, [restaurantId, date, guests])

  useEffect(() => {
    loadAvailability()
  }, [loadAvailability])

  const maxGuests = availability?.maxGuestsPerBooking ?? place?.maxGuestsPerBooking ?? 12

  const handleBook = async () => {
    if (!isAuthenticated) {
      navigate("/user/auth/login", { state: { redirectTo: `/food/user/dining/${restaurantId}` } })
      return
    }

    const validationErrors = validateBookingForm({ ...form, guests, date, slotStart, maxGuests })
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) {
      toast.error("Please complete the booking details")
      return
    }

    setBooking(true)
    try {
      const res = await diningAPI.user.createBooking({
        restaurantId,
        date,
        slotStart,
        guests,
        guestName: form.guestName.trim(),
        guestPhone: form.guestPhone.trim(),
        occasion: form.occasion,
        specialRequest: form.specialRequest.trim(),
      })
      setConfirmation(res?.data?.data || null)
      await loadAvailability()
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to create booking"))
      await loadAvailability()
    } finally {
      setBooking(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  if (!place) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-gray-600">Dining is not available at this outlet right now.</p>
        <button
          type="button"
          onClick={() => navigate("/food/user/dining")}
          className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Browse dining places
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28 dark:bg-[#0f0f0f]">
      <div className="relative">
        <img src={activeImage} alt={place.name} className="aspect-[16/9] w-full object-cover" />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="absolute left-4 top-4 rounded-full bg-black/50 p-2 text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>

      {place.gallery?.length > 1 && (
        <div className="flex gap-2 overflow-x-auto bg-white p-3 dark:bg-[#1a1a1a]">
          {[place.coverImage, ...place.gallery].filter(Boolean).map((image) => (
            <button key={image} type="button" onClick={() => setActiveImage(image)}>
              <img
                src={image}
                alt=""
                loading="lazy"
                className={`h-16 w-20 rounded-lg object-cover ${
                  activeImage === image ? "ring-2 ring-orange-400" : ""
                }`}
              />
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4 p-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-[#1a1a1a]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{place.name}</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {(place.cuisines || []).join(", ") || "Dining"}
              </p>
            </div>
            {place.ratingCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-sm font-medium text-white">
                {place.ratingAvg} <Star className="h-3.5 w-3.5 fill-white" />
              </span>
            )}
          </div>

          <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" /> {place.address || place.city}
            </p>
            {place.contactPhone && (
              <a href={`tel:${place.contactPhone}`} className="flex items-center gap-2 text-orange-600">
                <Phone className="h-4 w-4" /> {place.contactPhone}
              </a>
            )}
            <p>{formatCurrency(place.costForTwo)} for two · {place.seatingCapacity} seats</p>
          </div>

          {place.categories?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {place.categories.map((category) => (
                <span
                  key={category.id}
                  className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700"
                >
                  {category.name}
                </span>
              ))}
            </div>
          )}

          <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{place.about}</p>

          {place.amenities?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {place.amenities.map((amenity) => (
                <span
                  key={amenity}
                  className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"
                >
                  {amenity}
                </span>
              ))}
            </div>
          )}
        </div>

        {place.weeklySchedule?.some((day) => day.isOpen) && (
          <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-[#1a1a1a]">
            <h2 className="mb-2 flex items-center gap-2 font-medium text-gray-900 dark:text-white">
              <Clock className="h-4 w-4 text-gray-400" /> Dining hours
            </h2>
            <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
              {place.weeklySchedule.map((day) => (
                <li key={day.dayOfWeek} className="flex justify-between">
                  <span>{day.day}</span>
                  <span>
                    {day.isOpen && day.slots.length > 0
                      ? day.slots
                          .map((slot) => `${formatTime(slot.startTime)}-${formatTime(slot.endTime)}`)
                          .join(", ")
                      : "Closed"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Booking */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-[#1a1a1a]">
          <h2 className="font-semibold text-gray-900 dark:text-white">Book a table</h2>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {dateOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDate(option)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-sm ${
                  date === option
                    ? "border-orange-300 bg-orange-50 text-orange-700"
                    : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                }`}
              >
                {formatDateKey(option, { withYear: false })}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <Users className="h-4 w-4 text-gray-400" /> Guests
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setGuests((prev) => Math.max(1, prev - 1))}
                className="rounded-full border border-gray-200 p-2 disabled:opacity-40 dark:border-gray-700"
                disabled={guests <= 1}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-6 text-center font-semibold text-gray-900 dark:text-white">{guests}</span>
              <button
                type="button"
                onClick={() => setGuests((prev) => Math.min(maxGuests, prev + 1))}
                className="rounded-full border border-gray-200 p-2 disabled:opacity-40 dark:border-gray-700"
                disabled={guests >= maxGuests}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          {errors.guests && <p className="mt-1 text-xs text-rose-600">{errors.guests}</p>}

          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Available slots</p>
            {slotLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking availability…
              </div>
            ) : !availability?.slots?.length ? (
              <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500 dark:bg-[#111]">
                {availability?.reason || "No slots for this date"}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availability.slots.map((slot) => (
                  <button
                    key={slot.startTime}
                    type="button"
                    disabled={!slot.isAvailable}
                    onClick={() => setSlotStart(slot.startTime)}
                    title={slot.unavailableReason || `${slot.seatsLeft} seats left`}
                    className={`rounded-xl border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      slotStart === slot.startTime
                        ? "border-orange-400 bg-orange-50 text-orange-700"
                        : "border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {formatTime(slot.startTime)}
                    {slot.isAvailable && slot.seatsLeft <= 6 && (
                      <span className="ml-1 text-xs text-rose-500">{slot.seatsLeft} left</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {errors.slotStart && <p className="mt-1 text-xs text-rose-600">{errors.slotStart}</p>}
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Name for the reservation <span className="text-rose-500">*</span>
              </label>
              <input
                value={form.guestName}
                onChange={(event) => setForm((prev) => ({ ...prev, guestName: event.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-[#111] dark:text-white"
              />
              {errors.guestName && <p className="mt-1 text-xs text-rose-600">{errors.guestName}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Phone number <span className="text-rose-500">*</span>
              </label>
              <input
                inputMode="numeric"
                maxLength={10}
                value={form.guestPhone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, guestPhone: event.target.value.replace(/\D/g, "") }))
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-[#111] dark:text-white"
              />
              {errors.guestPhone && <p className="mt-1 text-xs text-rose-600">{errors.guestPhone}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Occasion
              </label>
              <div className="flex flex-wrap gap-2">
                {OCCASIONS.map((occasion) => (
                  <button
                    key={occasion}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        occasion: prev.occasion === occasion ? "" : occasion,
                      }))
                    }
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      form.occasion === occasion
                        ? "border-orange-300 bg-orange-50 text-orange-700"
                        : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {occasion}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Special request
              </label>
              <textarea
                rows={3}
                maxLength={500}
                value={form.specialRequest}
                onChange={(event) => setForm((prev) => ({ ...prev, specialRequest: event.target.value }))}
                placeholder="Window seat, high chair, cake…"
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-[#111] dark:text-white"
              />
            </div>
          </div>

          {availability?.autoConfirm && (
            <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
              Instant confirmation at this outlet.
            </p>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-[#1a1a1a]">
        <button
          type="button"
          onClick={handleBook}
          disabled={booking || !slotStart}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {booking && <Loader2 className="h-4 w-4 animate-spin" />}
          {slotStart ? `Book for ${guests} at ${formatTime(slotStart)}` : "Select a slot to continue"}
        </button>
      </div>

      {confirmation && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-6 text-center sm:rounded-2xl dark:bg-[#1a1a1a]">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h3 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
              {confirmation.status === "confirmed" ? "Table confirmed" : "Request sent"}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {confirmation.status === "confirmed"
                ? "Your table is booked. Show the booking code at the outlet."
                : "The restaurant will confirm your table shortly. You'll get a notification."}
            </p>
            <div className="mt-4 rounded-xl bg-gray-50 p-4 text-left text-sm dark:bg-[#111]">
              <p className="font-semibold text-gray-900 dark:text-white">{confirmation.bookingCode}</p>
              <p className="mt-1 text-gray-600 dark:text-gray-300">
                {formatDateKey(confirmation.date)} · {formatTime(confirmation.slotStart)} ·{" "}
                {confirmation.guests} guests
              </p>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => navigate("/food/user/dining/bookings")}
                className="flex-1 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white"
              >
                My bookings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
