import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, CalendarDays, Loader2, Phone, Search, Users, X } from "lucide-react"
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
  { value: "pending", label: "New" },
  { value: "confirmed", label: "Confirmed" },
  { value: "seated", label: "Seated" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
]

/** Status moves the restaurant is allowed to make from each state. */
const NEXT_ACTIONS = {
  pending: [
    { status: "confirmed", label: "Confirm", tone: "primary" },
    { status: "rejected", label: "Decline", tone: "danger" },
  ],
  confirmed: [
    { status: "seated", label: "Mark seated", tone: "primary" },
    { status: "no_show", label: "No show", tone: "muted" },
    { status: "cancelled", label: "Cancel", tone: "danger" },
  ],
  seated: [
    { status: "completed", label: "Complete", tone: "primary" },
    { status: "no_show", label: "No show", tone: "muted" },
  ],
}

const toneClass = {
  primary: "bg-orange-500 text-white hover:bg-orange-600",
  danger: "border border-rose-200 text-rose-600 hover:bg-rose-50",
  muted: "border border-gray-200 text-gray-700 hover:bg-gray-50",
}

export default function RestaurantDiningBookings() {
  const navigate = useNavigate()
  const [tab, setTab] = useState("pending")
  const [search, setSearch] = useState("")
  const [data, setData] = useState({ items: [], counts: {}, pagination: { totalPages: 1 } })
  const [loading, setLoading] = useState(true)
  const [tables, setTables] = useState([])
  const [action, setAction] = useState(null)
  const [note, setNote] = useState("")
  const [selectedTables, setSelectedTables] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await diningAPI.restaurant.listBookings({
        status: tab,
        limit: 50,
        ...(search.trim() ? { search: search.trim() } : {}),
      })
      setData(res?.data?.data || { items: [], counts: {}, pagination: { totalPages: 1 } })
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to load bookings"))
    } finally {
      setLoading(false)
    }
  }, [tab, search])

  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  useEffect(() => {
    diningAPI.restaurant
      .listTables()
      .then((res) => setTables((res?.data?.data?.items || []).filter((table) => table.isActive)))
      .catch(() => setTables([]))
  }, [])

  const openAction = (booking, nextStatus) => {
    setAction({ booking, status: nextStatus })
    setNote("")
    setSelectedTables([])
  }

  const submitAction = async () => {
    const { booking, status } = action
    if ((status === "rejected" || status === "cancelled") && note.trim().length < 3) {
      toast.error("Please share a reason")
      return
    }
    setSubmitting(true)
    try {
      await diningAPI.restaurant.updateBookingStatus(booking.id, {
        status,
        note: note.trim(),
        ...(status === "confirmed" && selectedTables.length > 0 ? { tableIds: selectedTables } : {}),
      })
      toast.success(`Booking ${DINING_BOOKING_STATUS_LABELS[status]?.toLowerCase() || "updated"}`)
      setAction(null)
      await load()
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to update booking"))
    } finally {
      setSubmitting(false)
    }
  }

  const selectedSeats = tables
    .filter((table) => selectedTables.includes(table.id))
    .reduce((sum, table) => sum + table.seats, 0)

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="sticky top-0 z-20 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3 px-4 py-4">
          <button type="button" onClick={() => navigate(-1)} className="rounded-full p-1.5 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Dining Bookings</h1>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-3">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                tab === item.value
                  ? "border-orange-300 bg-orange-50 text-orange-700"
                  : "border-gray-200 bg-white text-gray-600"
              }`}
            >
              {item.label}
              {data.counts?.[item.value] ? ` (${data.counts[item.value]})` : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search code, guest or phone"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-orange-400"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading bookings…
          </div>
        ) : data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
            <CalendarDays className="mx-auto h-9 w-9 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">No bookings here yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.items.map((booking) => (
              <div key={booking.id} className="rounded-2xl border border-gray-100 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{booking.guestName}</p>
                    <p className="text-sm text-gray-500">{booking.bookingCode}</p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      DINING_BOOKING_STATUS_CLASSES[booking.status] || ""
                    }`}
                  >
                    {DINING_BOOKING_STATUS_LABELS[booking.status] || booking.status}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-600">
                  <p className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4 text-gray-400" />
                    {formatDateKey(booking.date, { withYear: false })}
                  </p>
                  <p>{formatSlotRange(booking.slotStart, booking.slotEnd)}</p>
                  <p className="inline-flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-gray-400" /> {booking.guests} guests
                  </p>
                  <a
                    href={`tel:${booking.guestPhone}`}
                    className="inline-flex items-center gap-1.5 text-orange-600"
                  >
                    <Phone className="h-4 w-4" /> {booking.guestPhone}
                  </a>
                </div>

                {booking.tables?.length > 0 && (
                  <p className="mt-2 text-sm text-gray-500">
                    Tables: {booking.tables.map((table) => table.name).join(", ")}
                  </p>
                )}
                {booking.occasion && (
                  <p className="mt-1 text-sm text-gray-500">Occasion: {booking.occasion}</p>
                )}
                {booking.specialRequest && (
                  <p className="mt-1 rounded-xl bg-amber-50 p-2.5 text-sm text-amber-800">
                    {booking.specialRequest}
                  </p>
                )}
                {booking.cancelReason && (
                  <p className="mt-1 text-sm text-rose-600">Reason: {booking.cancelReason}</p>
                )}

                {NEXT_ACTIONS[booking.status]?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {NEXT_ACTIONS[booking.status].map((item) => (
                      <button
                        key={item.status}
                        type="button"
                        onClick={() => openAction(booking, item.status)}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold ${toneClass[item.tone]}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {action && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="font-semibold text-gray-900">
                {DINING_BOOKING_STATUS_LABELS[action.status]} · {action.booking.bookingCode}
              </h2>
              <button type="button" onClick={() => setAction(null)} className="rounded-lg p-1.5 hover:bg-gray-100">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              {action.status === "confirmed" && (
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-700">
                    Assign tables (optional) · {action.booking.guests} guests
                  </p>
                  {tables.length === 0 ? (
                    <p className="text-sm text-gray-500">No active tables configured.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tables.map((table) => {
                        const active = selectedTables.includes(table.id)
                        return (
                          <button
                            key={table.id}
                            type="button"
                            onClick={() =>
                              setSelectedTables((prev) =>
                                active ? prev.filter((id) => id !== table.id) : [...prev, table.id],
                              )
                            }
                            className={`rounded-xl border px-3 py-2 text-sm ${
                              active
                                ? "border-orange-300 bg-orange-50 text-orange-700"
                                : "border-gray-200 text-gray-600"
                            }`}
                          >
                            {table.name} · {table.seats}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {selectedTables.length > 0 && (
                    <p
                      className={`mt-2 text-sm ${
                        selectedSeats < action.booking.guests ? "text-rose-600" : "text-gray-500"
                      }`}
                    >
                      Selected seats: {selectedSeats} / {action.booking.guests} needed
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {action.status === "rejected" || action.status === "cancelled"
                    ? "Reason (required)"
                    : "Note (optional)"}
                </label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
              </div>

              <button
                type="button"
                onClick={submitAction}
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
