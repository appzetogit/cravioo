import { useEffect, useState } from "react"
import { Loader2, Bike, Phone, MapPin } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@food/api"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog"

const ASSIGNABLE_STATUSES = ["confirmed", "preparing", "ready_for_pickup"]
const ASSIGNABLE_PHASES = ["waiting_activation", "en_route_to_pickup"]

/** True while admin may still assign / reassign a rider (rider has not reached the restaurant). */
export function canAdminAssignDriver(order) {
  const status = String(order?.backendOrderStatus || "").toLowerCase()
  if (!ASSIGNABLE_STATUSES.includes(status)) return false
  const phase = order?.deliveryState?.currentPhase || "waiting_activation"
  if (!ASSIGNABLE_PHASES.includes(phase)) return false
  if (["offered", "accepted", "verified"].includes(order?.transfer?.status)) return false
  return true
}

export default function AssignDriverDialog({ isOpen, onOpenChange, order, onAssigned }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [assigningId, setAssigningId] = useState(null)

  const orderKey = order?.id || order?._id

  useEffect(() => {
    if (!isOpen || !orderKey) return
    let cancelled = false
    setLoading(true)
    setData(null)
    adminAPI
      .getAssignableDrivers(orderKey)
      .then((res) => {
        if (!cancelled) setData(res?.data?.data || null)
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.response?.data?.message || "Failed to load drivers")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, orderKey])

  const handleAssign = async (driver) => {
    setAssigningId(driver.id)
    try {
      await adminAPI.assignDriverToOrder(orderKey, driver.id)
      toast.success(`Order assigned to ${driver.name}`)
      onAssigned?.()
      onOpenChange(false)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to assign driver")
    } finally {
      setAssigningId(null)
    }
  }

  const drivers = data?.drivers || []
  const hasCurrent = Boolean(data?.order?.currentDriverId)

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-white p-6 rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{hasCurrent ? "Reassign Driver" : "Assign Driver"}</DialogTitle>
          <DialogDescription className="mt-1 text-slate-500">
            Order <span className="font-semibold text-slate-700">{order?.orderId}</span>
            {data?.restaurant?.name ? ` · ${data.restaurant.name}` : ""}. Online drivers nearest to the
            restaurant are listed first.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading drivers...
          </div>
        )}

        {!loading && data && !data.order?.canAssign && (
          <p className="text-sm text-amber-600 py-4">
            This order can no longer be assigned or reassigned (driver already started or order moved on).
          </p>
        )}

        {!loading && data?.order?.canAssign && drivers.length === 0 && (
          <p className="text-sm text-slate-500 py-6 text-center">No online drivers available right now.</p>
        )}

        {!loading && data?.order?.canAssign && drivers.length > 0 && (
          <ul className="space-y-2 pt-2">
            {drivers.map((d, idx) => (
              <li
                key={d.id}
                className={`flex items-center justify-between gap-3 border rounded-xl p-3 ${
                  d.isCurrent ? "border-emerald-300 bg-emerald-50" : "border-slate-200"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Bike className="w-4 h-4 text-slate-500" />
                    <span className="truncate">{d.name}</span>
                    {idx === 0 && d.distanceKm != null && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Nearest</span>
                    )}
                    {d.isCurrent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        Assigned
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {d.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {d.phone}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {d.distanceKm != null ? `${d.distanceKm} km from restaurant` : "Location unknown"}
                      {d.isStale && d.distanceKm != null ? " (old GPS)" : ""}
                    </span>
                    <span>
                      Active orders: {d.activeOrders}/{d.maxConcurrentOrders}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={d.isCurrent || assigningId !== null}
                  onClick={() => handleAssign(d)}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {assigningId === d.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {hasCurrent ? "Reassign" : "Assign"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
