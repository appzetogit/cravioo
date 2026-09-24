import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Search, Users } from "lucide-react"
import { toast } from "sonner"
import { diningAPI } from "@food/api"
import {
  DINING_BOOKING_STATUS_CLASSES,
  DINING_BOOKING_STATUS_LABELS,
  diningErrorMessage,
  formatDateKey,
  formatSlotRange,
} from "@food/utils/dining"

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "seated", label: "Seated" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No show" },
]

export default function DiningBookings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const restaurantId = searchParams.get("restaurantId") || ""

  const [status, setStatus] = useState("all")
  const [search, setSearch] = useState("")
  const [range, setRange] = useState({ from: "", to: "" })
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], pagination: { totalPages: 1, total: 0 }, counts: {} })
  const [loading, setLoading] = useState(true)

  const loadBookings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await diningAPI.admin.listBookings({
        status,
        page,
        limit: 20,
        ...(restaurantId ? { restaurantId } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(range.from ? { from: range.from } : {}),
        ...(range.to ? { to: range.to } : {}),
      })
      setData(res?.data?.data || { items: [], pagination: { totalPages: 1, total: 0 }, counts: {} })
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to load dining bookings"))
    } finally {
      setLoading(false)
    }
  }, [status, page, restaurantId, search, range.from, range.to])

  useEffect(() => {
    const timer = setTimeout(loadBookings, search ? 350 : 0)
    return () => clearTimeout(timer)
  }, [loadBookings, search])

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Dining Bookings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every table reservation across outlets, with live status.
          </p>
        </div>
        {restaurantId && (
          <button
            type="button"
            onClick={() => {
              setSearchParams({})
              setPage(1)
            }}
            className="self-start rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700"
          >
            Filtered by outlet · Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatus(tab.value)
              setPage(1)
            }}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
              status === tab.value
                ? "border-orange-300 bg-orange-50 text-orange-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab.label}
            {data.counts?.[tab.value] ? (
              <span className="ml-1.5 rounded-full bg-white px-1.5 text-xs text-slate-600">
                {data.counts[tab.value]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search booking code, guest or outlet"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-orange-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={range.from}
            onChange={(event) => {
              setRange((prev) => ({ ...prev, from: event.target.value }))
              setPage(1)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={range.to}
            min={range.from || undefined}
            onChange={(event) => {
              setRange((prev) => ({ ...prev, to: event.target.value }))
              setPage(1)
            }}
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading bookings…
          </div>
        ) : data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-500">
            <CalendarDays className="h-8 w-8 text-slate-300" />
            <p className="text-sm">No bookings found for these filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Booking</th>
                  <th className="px-4 py-3">Outlet</th>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Slot</th>
                  <th className="px-4 py-3">Guests</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((booking) => (
                  <tr key={booking.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{booking.bookingCode}</p>
                      <p className="text-xs text-slate-400">
                        {booking.createdAt ? new Date(booking.createdAt).toLocaleDateString("en-GB") : "-"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{booking.restaurantName || "-"}</td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">{booking.guestName}</p>
                      <p className="text-xs text-slate-400">{booking.guestPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <p>{formatDateKey(booking.date, { withYear: false })}</p>
                      <p className="text-xs text-slate-400">
                        {formatSlotRange(booking.slotStart, booking.slotEnd)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-slate-700">
                        <Users className="h-3.5 w-3.5 text-slate-400" /> {booking.guests}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                          DINING_BOOKING_STATUS_CLASSES[booking.status] || ""
                        }`}
                      >
                        {DINING_BOOKING_STATUS_LABELS[booking.status] || booking.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.pagination?.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {page} of {data.pagination.totalPages} · {data.pagination.total} bookings
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((prev) => prev - 1)}
              className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={page >= data.pagination.totalPages}
              onClick={() => setPage((prev) => prev + 1)}
              className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
