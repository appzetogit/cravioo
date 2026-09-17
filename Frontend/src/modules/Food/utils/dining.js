/** Shared dining helpers used by the admin, restaurant and user surfaces. */

export const DINING_BOOKING_STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  seated: "Seated",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Declined",
  no_show: "No show",
}

export const DINING_BOOKING_STATUS_CLASSES = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  seated: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-slate-100 text-slate-700 border-slate-300",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  no_show: "bg-orange-50 text-orange-700 border-orange-200",
}

export const DINING_PROFILE_STATUS_LABELS = {
  draft: "Draft",
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
}

export const DINING_PROFILE_STATUS_CLASSES = {
  draft: "bg-slate-100 text-slate-700 border-slate-300",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  suspended: "bg-orange-50 text-orange-700 border-orange-200",
}

export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

export const DINING_TABLE_SECTIONS = [
  { value: "indoor", label: "Indoor" },
  { value: "outdoor", label: "Outdoor" },
  { value: "rooftop", label: "Rooftop" },
  { value: "private", label: "Private dining" },
  { value: "bar", label: "Bar" },
  { value: "garden", label: "Garden" },
]

/** "YYYY-MM-DD" for a Date, in the user's local calendar. */
export const toDateKey = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export const addDays = (date, days) => {
  const d = date instanceof Date ? new Date(date) : new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export const formatDateKey = (dateKey, { withYear = true } = {}) => {
  if (!dateKey) return "-"
  const d = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateKey
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  })
}

/** "18:30" -> "6:30 PM" */
export const formatTime = (hhmm) => {
  if (!hhmm) return "-"
  const [hours, minutes] = String(hhmm).split(":").map(Number)
  if (!Number.isFinite(hours)) return hhmm
  const period = hours >= 12 ? "PM" : "AM"
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${String(minutes ?? 0).padStart(2, "0")} ${period}`
}

export const formatSlotRange = (start, end) => `${formatTime(start)} - ${formatTime(end)}`

export const formatCurrency = (value) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`

/** Uniform error text for any dining API failure. */
export const diningErrorMessage = (error, fallback = "Something went wrong") =>
  error?.response?.data?.message || error?.message || fallback

/** Client-side guard so users see field errors before the request is sent. */
export const validateBookingForm = ({ guestName, guestPhone, guests, date, slotStart, maxGuests }) => {
  const errors = {}
  if (!String(guestName || "").trim() || String(guestName).trim().length < 2) {
    errors.guestName = "Enter the name for the reservation"
  }
  if (!/^[0-9]{10}$/.test(String(guestPhone || "").trim())) {
    errors.guestPhone = "Enter a valid 10 digit phone number"
  }
  const guestCount = Number(guests)
  if (!Number.isInteger(guestCount) || guestCount < 1) {
    errors.guests = "Select at least 1 guest"
  } else if (maxGuests && guestCount > maxGuests) {
    errors.guests = `Maximum ${maxGuests} guests per booking`
  }
  if (!date) errors.date = "Select a date"
  if (!slotStart) errors.slotStart = "Select a time slot"
  return errors
}

/** Images are mandatory everywhere in dining — this keeps the rule in one place. */
export const validateImageFile = (file, { maxSizeMb = 5 } = {}) => {
  if (!file) return "Image is required"
  if (!/^image\/(png|jpe?g|webp|avif)$/i.test(file.type || "")) {
    return "Only PNG, JPG, WEBP or AVIF images are allowed"
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    return `Image must be ${maxSizeMb}MB or smaller`
  }
  return ""
}
