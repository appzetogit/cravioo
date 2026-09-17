import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Phone,
  Search,
  ShieldOff,
  Users,
  X,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { diningAPI } from "@food/api"
import {
  DINING_PROFILE_STATUS_CLASSES,
  DINING_PROFILE_STATUS_LABELS,
  diningErrorMessage,
  formatCurrency,
} from "@food/utils/dining"

const STATUS_TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
  { value: "all", label: "All" },
]

const ACTION_LABELS = {
  approve: "Approve dining",
  reject: "Reject request",
  suspend: "Suspend dining",
  reinstate: "Reinstate dining",
}

export default function DiningRequests() {
  const navigate = useNavigate()
  const [status, setStatus] = useState("pending")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], pagination: { totalPages: 1, total: 0 }, counts: {} })
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [action, setAction] = useState(null)
  const [reason, setReason] = useState("")
  const [reasonError, setReasonError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    try {
      const res = await diningAPI.admin.listRequests({ status, search: search.trim() || undefined, page, limit: 20 })
      setData(res?.data?.data || { items: [], pagination: { totalPages: 1, total: 0 }, counts: {} })
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to load dining requests"))
    } finally {
      setLoading(false)
    }
  }, [status, search, page])

  useEffect(() => {
    // Debounced so typing in search does not fire a request per keystroke.
    const timer = setTimeout(loadRequests, search ? 350 : 0)
    return () => clearTimeout(timer)
  }, [loadRequests, search])

  const openDetail = async (request) => {
    setDetailLoading(true)
    setDetail({ id: request.id })
    try {
      const res = await diningAPI.admin.getRequest(request.id)
      setDetail(res?.data?.data || null)
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to load dining request"))
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const submitAction = async () => {
    if ((action === "reject" || action === "suspend") && reason.trim().length < 3) {
      setReasonError("Please share a reason (min 3 characters)")
      return
    }
    setSubmitting(true)
    try {
      await diningAPI.admin.reviewRequest(detail.id, { action, reason: reason.trim() })
      toast.success(`Dining request ${action}d`)
      setAction(null)
      setReason("")
      setDetail(null)
      await loadRequests()
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to update dining request"))
    } finally {
      setSubmitting(false)
    }
  }

  const availableActions = (currentStatus) => {
    if (currentStatus === "pending") return ["approve", "reject"]
    if (currentStatus === "approved") return ["suspend", "reject"]
    if (currentStatus === "rejected") return ["approve"]
    if (currentStatus === "suspended") return ["reinstate"]
    return []
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Dining Requests</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review outlets applying for dining. Approving unlocks slots, tables and bookings in their panel.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search outlet, city or phone"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-orange-400"
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading requests…
          </div>
        ) : data.items.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">No dining requests found</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.items.map((request) => (
              <button
                key={request.id}
                type="button"
                onClick={() => openDetail(request)}
                className="flex w-full items-center gap-4 p-4 text-left hover:bg-slate-50/70"
              >
                <img
                  src={request.coverImage}
                  alt={request.restaurantName}
                  loading="lazy"
                  className="h-16 w-20 rounded-lg border border-slate-200 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold text-slate-900">{request.restaurantName || "Outlet"}</h3>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        DINING_PROFILE_STATUS_CLASSES[request.status] || ""
                      }`}
                    >
                      {DINING_PROFILE_STATUS_LABELS[request.status] || request.status}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-slate-500">{request.about}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {request.city || "-"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {request.seatingCapacity} seats
                    </span>
                    <span>{formatCurrency(request.costForTwo)} for two</span>
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> {request.contactPhone}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
              </button>
            ))}
          </div>
        )}
      </div>

      {data.pagination?.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {page} of {data.pagination.totalPages} · {data.pagination.total} requests
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

      {detail && (
        <div className="fixed inset-0 z-[120] flex justify-end bg-black/40">
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Dining request</h2>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-lg p-1.5 hover:bg-slate-100"
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            {detailLoading || !detail.restaurantName ? (
              <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading details…
              </div>
            ) : (
              <div className="space-y-6 px-5 py-5">
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <img src={detail.coverImage} alt={detail.restaurantName} className="aspect-[16/7] w-full object-cover" />
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">{detail.restaurantName}</h3>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        DINING_PROFILE_STATUS_CLASSES[detail.status] || ""
                      }`}
                    >
                      {DINING_PROFILE_STATUS_LABELS[detail.status] || detail.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{detail.about}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Cost for two", value: formatCurrency(detail.costForTwo) },
                    { label: "Seating", value: `${detail.seatingCapacity} seats` },
                    { label: "Bookings", value: detail.totalBookings ?? 0 },
                    { label: "Rating", value: detail.ratingCount ? `${detail.ratingAvg} ★` : "No ratings" },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs text-slate-500">{stat.label}</p>
                      <p className="mt-1 font-semibold text-slate-900">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-900">Categories</h4>
                  <div className="flex flex-wrap gap-2">
                    {detail.categories?.map((category) => (
                      <span
                        key={category.id}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-3 text-sm text-slate-700"
                      >
                        {category.image && (
                          <img src={category.image} alt="" className="h-6 w-6 rounded-full object-cover" />
                        )}
                        {category.name}
                      </span>
                    ))}
                  </div>
                </div>

                {detail.cuisines?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-900">Cuisines</h4>
                    <p className="text-sm text-slate-600">{detail.cuisines.join(", ")}</p>
                  </div>
                )}

                {detail.amenities?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-900">Amenities</h4>
                    <p className="text-sm text-slate-600">{detail.amenities.join(", ")}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-900">Gallery</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {detail.gallery?.map((image) => (
                      <img
                        key={image}
                        src={image}
                        alt=""
                        loading="lazy"
                        className="aspect-square w-full rounded-lg border border-slate-200 object-cover"
                      />
                    ))}
                  </div>
                </div>

                {detail.menuImages?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-900">Menu images</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {detail.menuImages.map((image) => (
                        <img
                          key={image}
                          src={image}
                          alt=""
                          loading="lazy"
                          className="aspect-square w-full rounded-lg border border-slate-200 object-cover"
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2 rounded-xl border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900">Outlet & contact</h4>
                  <p className="text-sm text-slate-600">{detail.restaurant?.address || "-"}</p>
                  <p className="text-sm text-slate-600">
                    {detail.contactName} · {detail.contactPhone}
                  </p>
                  {detail.restaurant?.email && (
                    <p className="text-sm text-slate-600">{detail.restaurant.email}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/food/dining/bookings?restaurantId=${detail.restaurantId}`)}
                    className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <CalendarClock className="h-4 w-4" /> View booking history
                  </button>
                </div>

                {detail.rejectionReason && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    <strong>Last reason:</strong> {detail.rejectionReason}
                  </div>
                )}

                {detail.statusHistory?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-900">Timeline</h4>
                    <ul className="space-y-2">
                      {[...detail.statusHistory].reverse().map((entry, index) => (
                        <li key={`${entry.at}-${index}`} className="flex gap-3 text-sm">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                          <div>
                            <p className="font-medium text-slate-800">
                              {DINING_PROFILE_STATUS_LABELS[entry.status] || entry.status}
                              <span className="ml-2 text-xs font-normal text-slate-400">{entry.byRole}</span>
                            </p>
                            {entry.note && <p className="text-slate-500">{entry.note}</p>}
                            <p className="text-xs text-slate-400">
                              {entry.at ? new Date(entry.at).toLocaleString("en-GB") : ""}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="sticky bottom-0 flex flex-wrap gap-3 border-t border-slate-100 bg-white py-4">
                  {availableActions(detail.status).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setAction(value)
                        setReason("")
                        setReasonError("")
                      }}
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white ${
                        value === "approve" || value === "reinstate"
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : value === "suspend"
                            ? "bg-orange-500 hover:bg-orange-600"
                            : "bg-rose-600 hover:bg-rose-700"
                      }`}
                    >
                      {value === "approve" || value === "reinstate" ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : value === "suspend" ? (
                        <ShieldOff className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      {ACTION_LABELS[value]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {action && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">{ACTION_LABELS[action]}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {action === "approve" || action === "reinstate"
                ? "The outlet can immediately configure slots, tables and take bookings."
                : "The outlet will see this reason in their dining panel."}
            </p>
            <textarea
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
                setReasonError("")
              }}
              placeholder={action === "approve" || action === "reinstate" ? "Optional note" : "Reason (required)"}
              className="mt-3 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
            />
            {reasonError && <p className="mt-1 text-xs text-rose-600">{reasonError}</p>}
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setAction(null)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAction}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
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
