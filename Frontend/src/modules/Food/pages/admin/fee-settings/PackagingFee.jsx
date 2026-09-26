import { useCallback, useEffect, useMemo, useState } from "react"
import { Package, Search, Loader2, Save, CheckSquare, Square } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@food/api"

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
const apiMessage = (error, fallback) => error?.response?.data?.message || fallback
const unwrap = (res) => res?.data?.data ?? {}

/** Mirrors the server's splitInclusiveGst so the preview matches the real order calculation. */
const splitInclusiveGst = (gross, ratePct) => {
  const g = Number(gross) || 0
  const r = Number(ratePct) || 0
  if (!(g > 0) || !(r > 0)) return { gst: 0, net: g }
  const gst = Math.round((g - g / (1 + r / 100)) * 100) / 100
  return { gst, net: Math.round((g - gst) * 100) / 100 }
}

export default function PackagingFee() {
  const [restaurants, setRestaurants] = useState([])
  const [filters, setFilters] = useState({ restaurantId: "", search: "" })
  const [searchInput, setSearchInput] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState({}) // id -> { packagingFee, packagingFeeGstRate }
  const [savingId, setSavingId] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [bulkFee, setBulkFee] = useState("")
  const [bulkGst, setBulkGst] = useState("")
  const [bulkSaving, setBulkSaving] = useState(false)

  useEffect(() => {
    adminAPI
      .getRestaurants({ page: 1, limit: 200 })
      .then((res) => {
        const list = res?.data?.data?.restaurants || []
        setRestaurants(list.map((r) => ({ id: r._id, name: r.name || r.restaurantName || "" })))
      })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const params = { page, limit: 20 }
      if (filters.restaurantId) params.restaurantId = filters.restaurantId
      if (filters.search) params.search = filters.search
      const result = unwrap(await adminAPI.getFoodsForPackaging(params))
      setData(result)
      const nextDrafts = {}
      for (const item of result.items || []) {
        nextDrafts[item.id] = { packagingFee: String(item.packagingFee ?? 0), packagingFeeGstRate: String(item.packagingFeeGstRate ?? 0) }
      }
      setDrafts(nextDrafts)
      setSelected(new Set())
    } catch (error) {
      toast.error(apiMessage(error, "Failed to load food items"))
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    load()
  }, [load])

  const setFilter = (key, value) => {
    setPage(1)
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const updateDraft = (id, key, value) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))
  }

  const saveOne = async (item) => {
    const draft = drafts[item.id]
    const packagingFee = Number(draft.packagingFee)
    const packagingFeeGstRate = Number(draft.packagingFeeGstRate || 0)
    if (!Number.isFinite(packagingFee) || packagingFee < 0) {
      toast.error("Packaging fee must be a number ≥ 0")
      return
    }
    if (!Number.isFinite(packagingFeeGstRate) || packagingFeeGstRate < 0 || packagingFeeGstRate > 100) {
      toast.error("GST % must be between 0 and 100")
      return
    }
    try {
      setSavingId(item.id)
      await adminAPI.setFoodPackaging(item.id, { packagingFee, packagingFeeGstRate })
      toast.success(`Packaging fee saved for "${item.name}"`)
      setData((prev) => ({
        ...prev,
        items: prev.items.map((it) => (it.id === item.id ? { ...it, packagingFee, packagingFeeGstRate } : it)),
      }))
    } catch (error) {
      toast.error(apiMessage(error, "Failed to save packaging fee"))
    } finally {
      setSavingId(null)
    }
  }

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === data.items.length ? new Set() : new Set(data.items.map((i) => i.id))))
  }

  const applyBulk = async () => {
    const packagingFee = Number(bulkFee)
    const packagingFeeGstRate = Number(bulkGst || 0)
    if (selected.size === 0) {
      toast.error("Select at least one food item")
      return
    }
    if (!Number.isFinite(packagingFee) || packagingFee < 0) {
      toast.error("Packaging fee must be a number ≥ 0")
      return
    }
    if (!Number.isFinite(packagingFeeGstRate) || packagingFeeGstRate < 0 || packagingFeeGstRate > 100) {
      toast.error("GST % must be between 0 and 100")
      return
    }
    try {
      setBulkSaving(true)
      const res = await adminAPI.bulkSetFoodPackaging({
        itemIds: [...selected],
        packagingFee,
        packagingFeeGstRate,
      })
      toast.success(`Packaging fee applied to ${unwrap(res).modified ?? selected.size} item(s)`)
      await load()
      setBulkFee("")
      setBulkGst("")
    } catch (error) {
      toast.error(apiMessage(error, "Failed to bulk-apply packaging fee"))
    } finally {
      setBulkSaving(false)
    }
  }

  const bulkPreview = useMemo(() => {
    const fee = Number(bulkFee)
    if (!Number.isFinite(fee) || fee <= 0) return null
    return splitInclusiveGst(fee, bulkGst)
  }, [bulkFee, bulkGst])

  const field = "px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-2 flex items-center gap-3">
          <Package className="h-6 w-6 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-900">Packaging Fee (Food Items)</h1>
        </div>
        <p className="mb-5 text-sm text-slate-600">
          Packaging fee is set per food item, not globally. The customer pays exactly what is set here for each item
          they order (× quantity); items with no fee set have no packaging charge. GST here is <strong>included</strong> in
          the fee — the GST part goes to the platform&apos;s GST account and the restaurant is credited the rest.
        </p>

        {/* Filters */}
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
              placeholder="Search food name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>
          <select className={field} value={filters.restaurantId} onChange={(e) => setFilter("restaurantId", e.target.value)}>
            <option value="">All restaurants</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Bulk apply bar */}
        {selected.size > 0 && (
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900 w-full">
              {selected.size} item{selected.size === 1 ? "" : "s"} selected — apply the same packaging fee to all of them
            </p>
            <div>
              <label className="block text-xs font-medium text-emerald-900 mb-1">Packaging Fee (₹)</label>
              <input type="number" min="0" step="1" value={bulkFee} onChange={(e) => setBulkFee(e.target.value)} className={`${field} w-36`} placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-emerald-900 mb-1">GST % (included)</label>
              <input type="number" min="0" max="100" step="0.1" value={bulkGst} onChange={(e) => setBulkGst(e.target.value)} className={`${field} w-32`} placeholder="0" />
            </div>
            <button
              onClick={applyBulk}
              disabled={bulkSaving}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {bulkSaving && <Loader2 className="h-4 w-4 animate-spin" />} Apply to Selected
            </button>
            {bulkPreview && (
              <p className="w-full text-xs text-emerald-800">
                Customer pays ₹{Number(bulkFee).toFixed(2)} per unit → restaurant gets ₹{bulkPreview.net.toFixed(2)} + GST ₹{bulkPreview.gst.toFixed(2)}
              </p>
            )}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">
                  <button onClick={toggleSelectAll} className="flex items-center" title="Select all on this page">
                    {selected.size === data.items.length && data.items.length > 0 ? (
                      <CheckSquare className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-3">Food Item</th>
                <th className="px-3 py-3">Restaurant</th>
                <th className="px-3 py-3 text-right">Price</th>
                <th className="px-3 py-3">Packaging Fee (₹)</th>
                <th className="px-3 py-3">GST % (included)</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-500" /></td></tr>
              ) : data.items.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-slate-500">No food items found.</td></tr>
              ) : (
                data.items.map((item) => {
                  const draft = drafts[item.id] || { packagingFee: "0", packagingFeeGstRate: "0" }
                  const preview = Number(draft.packagingFee) > 0 ? splitInclusiveGst(draft.packagingFee, draft.packagingFeeGstRate) : null
                  return (
                    <tr key={item.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <button onClick={() => toggleSelect(item.id)}>
                          {selected.has(item.id) ? (
                            <CheckSquare className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-400" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {item.image && <img src={item.image} alt="" className="h-8 w-8 rounded object-cover" />}
                          <p className="font-medium text-slate-900">{item.name}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{item.restaurantName || "-"}</td>
                      <td className="px-3 py-3 text-right">{money(item.price)}</td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={draft.packagingFee}
                          onChange={(e) => updateDraft(item.id, "packagingFee", e.target.value)}
                          className={`${field} w-24`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={draft.packagingFeeGstRate}
                          onChange={(e) => updateDraft(item.id, "packagingFeeGstRate", e.target.value)}
                          className={`${field} w-24`}
                        />
                        {preview && preview.gst > 0 && (
                          <p className="mt-1 text-[11px] text-slate-500">Restaurant gets ₹{preview.net.toFixed(2)}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => saveOne(item)}
                          disabled={savingId === item.id}
                          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ml-auto"
                        >
                          {savingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Save
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
          <span>{data.total} food item{data.total === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40">Prev</button>
            <span>Page {page} of {data.totalPages || 1}</span>
            <button disabled={page >= (data.totalPages || 1)} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  )
}
