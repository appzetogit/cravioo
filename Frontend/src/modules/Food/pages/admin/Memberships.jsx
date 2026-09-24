import { useCallback, useEffect, useMemo, useState } from "react"
import { Award, Loader2, Plus, Search, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@food/api"

const UNIT_LABEL = { DAY: "Day", WEEK: "Week", MONTH: "Month", YEAR: "Year" }
const STATUS_STYLE = {
  active: "bg-green-100 text-green-700",
  expired: "bg-slate-100 text-slate-600",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-amber-100 text-amber-700",
  pending: "bg-blue-100 text-blue-700",
  failed: "bg-rose-100 text-rose-700",
}
const STATUS_FILTERS = [
  { value: "", label: "All paid" },
  { value: "active", label: "Active" },
  { value: "expiring", label: "Expiring in 7 days" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
  { value: "pending", label: "Payment pending" },
  { value: "failed", label: "Payment failed" },
]

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-"
const fmtDateTime = (v) =>
  v
    ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "-"
const durationText = (value, unit) => `${value} ${UNIT_LABEL[unit] || unit}${Number(value) === 1 ? "" : "s"}`
const apiMessage = (error, fallback) => error?.response?.data?.message || fallback
const unwrap = (res) => res?.data?.data ?? {}

function StatCard({ label, value, hint, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200",
    green: "border-green-200 bg-green-50",
    amber: "border-amber-200 bg-amber-50",
    red: "border-red-200 bg-red-50",
  }
  return (
    <div className={`rounded-xl border bg-white p-4 ${tones[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function Overview({ dashboard, loading }) {
  if (loading || !dashboard) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    )
  }
  const { counts, revenue, perPlan, monthly } = dashboard
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.revenue))
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Net revenue" value={money(revenue.net)} hint={`Gross ${money(revenue.gross)} - refunds ${money(revenue.refunded)}`} tone="green" />
        <StatCard label="This month" value={money(revenue.thisMonth)} hint={`Today ${money(revenue.today)}`} />
        <StatCard label="Active members" value={counts.active} hint={`${counts.expiringSoon} expiring in ${dashboard.expiringSoonDays} days`} tone="green" />
        <StatCard label="Total purchases" value={counts.totalPurchases} hint={`${counts.expired} expired · ${counts.cancelled} cancelled`} />
        <StatCard label="Refunded" value={counts.refunded} tone="amber" />
        <StatCard label="Payment pending" value={counts.pending} hint="Started checkout, not paid" />
        <StatCard label="Payment failed" value={counts.failed} tone="red" />
        <StatCard label="Expired" value={counts.expired} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Revenue by plan</h3>
          {perPlan.length === 0 ? (
            <p className="text-sm text-slate-500">No sales yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="pb-2">Plan</th>
                  <th className="pb-2 text-right">Sold</th>
                  <th className="pb-2 text-right">Active</th>
                  <th className="pb-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {perPlan.map((p) => (
                  <tr key={p.planId} className="border-t border-slate-100">
                    <td className="py-2 font-medium text-slate-800">{p.planName}</td>
                    <td className="py-2 text-right">{p.sold}</td>
                    <td className="py-2 text-right">{p.active}</td>
                    <td className="py-2 text-right font-semibold">{money(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Net revenue, last 6 months</h3>
          {monthly.length === 0 ? (
            <p className="text-sm text-slate-500">No sales yet.</p>
          ) : (
            <div className="space-y-2">
              {monthly.map((m) => (
                <div key={m.month} className="flex items-center gap-3 text-sm">
                  <span className="w-16 shrink-0 text-slate-500">{m.month}</span>
                  <div className="h-5 flex-1 rounded bg-slate-100">
                    <div className="h-5 rounded bg-emerald-500" style={{ width: `${(m.revenue / maxMonthly) * 100}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right font-semibold">{money(m.revenue)}</span>
                  <span className="w-14 shrink-0 text-right text-xs text-slate-500">{m.sold} sold</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const emptyPlanForm = {
  name: "",
  description: "",
  price: "",
  durationValue: "1",
  durationUnit: "MONTH",
  benefitsText: "",
  isActive: true,
}

function PlanModal({ plan, onClose, onSaved }) {
  const [form, setForm] = useState(
    plan
      ? {
          name: plan.name,
          description: plan.description || "",
          price: String(plan.price),
          durationValue: String(plan.durationValue),
          durationUnit: plan.durationUnit,
          benefitsText: (plan.benefits || []).join("\n"),
          isActive: plan.isActive,
        }
      : emptyPlanForm,
  )
  const [saving, setSaving] = useState(false)
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      durationValue: Number(form.durationValue),
      durationUnit: form.durationUnit,
      benefits: form.benefitsText.split("\n").map((b) => b.trim()).filter(Boolean),
      isActive: form.isActive,
    }
    if (!payload.name) return toast.error("Plan name is required")
    if (!Number.isFinite(payload.price) || payload.price < 1) return toast.error("Enter a valid amount")
    if (!Number.isInteger(payload.durationValue) || payload.durationValue < 1) return toast.error("Enter a valid duration")

    try {
      setSaving(true)
      if (plan) await adminAPI.updateMembershipPlan(plan._id, payload)
      else await adminAPI.createMembershipPlan(payload)
      toast.success(plan ? "Plan updated" : "Plan created")
      onSaved()
    } catch (error) {
      toast.error(apiMessage(error, "Failed to save plan"))
    } finally {
      setSaving(false)
    }
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{plan ? "Edit plan" : "Create membership plan"}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
          <input className={input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Gold Monthly" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Description (optional)</label>
          <input className={input} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Amount (₹)</label>
            <input type="number" min="1" className={input} value={form.price} onChange={(e) => set("price", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Duration</label>
            <input type="number" min="1" step="1" className={input} value={form.durationValue} onChange={(e) => set("durationValue", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Unit</label>
            <select className={input} value={form.durationUnit} onChange={(e) => set("durationUnit", e.target.value)}>
              {Object.entries(UNIT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}(s)</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Benefits (one per line)</label>
          <textarea
            rows={5}
            className={input}
            value={form.benefitsText}
            onChange={(e) => set("benefitsText", e.target.value)}
            placeholder={"Free delivery on all orders\nExclusive members-only coupons"}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="h-4 w-4" />
          Active (visible to customers for purchase)
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save plan
          </button>
        </div>
      </form>
    </div>
  )
}

function Plans() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(undefined) // undefined = closed, null = new, object = edit

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setPlans(unwrap(await adminAPI.getMembershipPlans()).plans || [])
    } catch (error) {
      toast.error(apiMessage(error, "Failed to load plans"))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const toggle = async (plan) => {
    try {
      await adminAPI.setMembershipPlanStatus(plan._id, !plan.isActive)
      toast.success(plan.isActive ? "Plan deactivated" : "Plan activated")
      load()
    } catch (error) {
      toast.error(apiMessage(error, "Failed to update plan"))
    }
  }
  const remove = async (plan) => {
    if (!window.confirm(`Delete "${plan.name}"? Existing members keep their membership until it expires.`)) return
    try {
      await adminAPI.deleteMembershipPlan(plan._id)
      toast.success("Plan deleted")
      load()
    } catch (error) {
      toast.error(apiMessage(error, "Failed to delete plan"))
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setEditing(null)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
          <Plus className="h-4 w-4" /> Create plan
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
      ) : plans.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">No plans yet. Create the first membership plan.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan._id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-bold text-slate-900">{plan.name}</p>
                  <p className="text-sm text-slate-500">{durationText(plan.durationValue, plan.durationUnit)}</p>
                </div>
                <p className="text-xl font-bold text-emerald-700">{money(plan.price)}</p>
              </div>
              {plan.description && <p className="mt-2 text-sm text-slate-600">{plan.description}</p>}
              {plan.benefits?.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {plan.benefits.map((b) => <li key={b}>{b}</li>)}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-500">{plan.soldCount} sold · {plan.activeCount} active</p>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${plan.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                  {plan.isActive ? "Active" : "Inactive"}
                </span>
                <div className="flex items-center gap-2 text-sm">
                  <button onClick={() => toggle(plan)} className="text-slate-600 hover:underline">{plan.isActive ? "Deactivate" : "Activate"}</button>
                  <button onClick={() => setEditing(plan)} className="text-blue-600 hover:underline">Edit</button>
                  <button onClick={() => remove(plan)} className="text-red-600" aria-label="Delete plan"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing !== undefined && (
        <PlanModal
          plan={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined)
            load()
          }}
        />
      )}
    </div>
  )
}

function Members({ plans }) {
  const [filters, setFilters] = useState({ status: "", planId: "", search: "", fromDate: "", toDate: "" })
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ memberships: [], total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState(null)
  const [searchInput, setSearchInput] = useState("")

  const params = useMemo(() => {
    const p = { page, limit: 20 }
    Object.entries(filters).forEach(([k, v]) => {
      if (v) p[k] = v
    })
    return p
  }, [filters, page])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setData(unwrap(await adminAPI.getMemberships(params)))
    } catch (error) {
      toast.error(apiMessage(error, "Failed to load memberships"))
    } finally {
      setLoading(false)
    }
  }, [params])
  useEffect(() => {
    load()
  }, [load])

  const setFilter = (key, value) => {
    setPage(1)
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const act = async (m, kind) => {
    const verb = kind === "refund" ? "refund the full amount and end" : "cancel"
    const reason = window.prompt(`Reason to ${verb} this membership (optional):`)
    if (reason === null) return
    try {
      setActingId(m.id)
      if (kind === "refund") await adminAPI.refundMembership(m.id, reason)
      else await adminAPI.cancelMembership(m.id, reason)
      toast.success(kind === "refund" ? "Refund initiated" : "Membership cancelled")
      load()
    } catch (error) {
      toast.error(apiMessage(error, "Action failed"))
    } finally {
      setActingId(null)
    }
  }

  const field = "rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault()
            setFilter("search", searchInput.trim())
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className={`${field} w-64 pl-9`}
            placeholder="Name, phone, payment ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </form>
        <select className={field} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
          {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className={field} value={filters.planId} onChange={(e) => setFilter("planId", e.target.value)}>
          <option value="">All plans</option>
          {plans.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
        <input type="date" className={field} value={filters.fromDate} onChange={(e) => setFilter("fromDate", e.target.value)} />
        <input type="date" className={field} value={filters.toDate} onChange={(e) => setFilter("toDate", e.target.value)} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3">Customer</th>
              <th className="px-3 py-3">Plan</th>
              <th className="px-3 py-3 text-right">Amount</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Purchased</th>
              <th className="px-3 py-3">Expires</th>
              <th className="px-3 py-3">Payment</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-500" /></td></tr>
            ) : data.memberships.length === 0 ? (
              <tr><td colSpan={8} className="py-12 text-center text-slate-500">No memberships found.</td></tr>
            ) : (
              data.memberships.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-900">{m.user?.name || "-"}</p>
                    <p className="text-xs text-slate-500">{m.user?.phone || m.user?.email || ""}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-800">{m.planName}</p>
                    <p className="text-xs text-slate-500">{durationText(m.durationValue, m.durationUnit)}</p>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">{money(m.amountPaid)}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[m.status] || ""}`}>{m.status}</span>
                    {m.status === "active" && (
                      <p className="mt-1 text-xs text-slate-500">{m.daysRemaining} day{m.daysRemaining === 1 ? "" : "s"} left</p>
                    )}
                    {m.failureReason && <p className="mt-1 text-xs text-rose-600">{m.failureReason}</p>}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{fmtDateTime(m.paidAt || m.createdAt)}</td>
                  <td className="px-3 py-3 text-slate-600">{fmtDate(m.expiryDate)}</td>
                  <td className="px-3 py-3 text-xs text-slate-500">
                    <p className="break-all">{m.razorpayPaymentId || "-"}</p>
                    {m.refundId && <p className="break-all text-amber-700">Refund: {m.refundId}</p>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {actingId === m.id ? (
                      <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                    ) : (
                      <div className="flex justify-end gap-3 text-xs">
                        {m.status === "active" && (
                          <button onClick={() => act(m, "cancel")} className="text-red-600 hover:underline">Cancel</button>
                        )}
                        {["active", "expired", "cancelled"].includes(m.status) && m.razorpayPaymentId && (
                          <button onClick={() => act(m, "refund")} className="text-amber-700 hover:underline">Refund</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <span>{data.total} record{data.total === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40">Prev</button>
          <span>Page {page} of {data.totalPages || 1}</span>
          <button disabled={page >= (data.totalPages || 1)} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  )
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "plans", label: "Plans" },
  { key: "members", label: "Members & Payments" },
]

export default function Memberships() {
  const [tab, setTab] = useState("overview")
  const [dashboard, setDashboard] = useState(null)
  const [loadingDashboard, setLoadingDashboard] = useState(true)
  const [plans, setPlans] = useState([])

  const loadDashboard = useCallback(async () => {
    try {
      setLoadingDashboard(true)
      setDashboard(unwrap(await adminAPI.getMembershipDashboard()))
    } catch (error) {
      toast.error(apiMessage(error, "Failed to load membership dashboard"))
    } finally {
      setLoadingDashboard(false)
    }
  }, [])

  useEffect(() => {
    if (tab === "overview") loadDashboard()
    if (tab === "members") {
      adminAPI
        .getMembershipPlans()
        .then((res) => setPlans(unwrap(res).plans || []))
        .catch(() => {})
    }
  }, [tab, loadDashboard])

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center gap-3">
          <Award className="h-6 w-6 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-900">Memberships</h1>
        </div>
        <div className="mb-5 flex gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium ${
                tab === t.key ? "border-b-2 border-emerald-600 text-emerald-700" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "overview" && <Overview dashboard={dashboard} loading={loadingDashboard} />}
        {tab === "plans" && <Plans />}
        {tab === "members" && <Members plans={plans} />}
      </div>
    </div>
  )
}
