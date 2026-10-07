import { useEffect, useState } from "react"
import { Search, Loader2, Plug, Settings2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@food/components/ui/dialog"
import { Input } from "@food/components/ui/input"
import { Button } from "@food/components/ui/button"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const debugError = (...args) => {}

const emptyForm = { restId: "", appKey: "", appSecret: "", accessToken: "" }

export default function PetPoojaIntegration() {
  const [restaurants, setRestaurants] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [onlyConnected, setOnlyConnected] = useState(false)

  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [isSaving, setIsSaving] = useState(false)
  const [togglingId, setTogglingId] = useState(null)

  const fetchRestaurants = async () => {
    try {
      setIsLoading(true)
      const res = await adminAPI.getPetpoojaRestaurants({
        search,
        onlyConnected: onlyConnected || undefined,
        limit: 100,
      })
      setRestaurants(res?.data?.data?.data || [])
    } catch (err) {
      debugError("Failed to load PetPooja restaurants:", err)
      toast.error(err?.response?.data?.message || "Failed to load restaurants")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(fetchRestaurants, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, onlyConnected])

  const openConfigure = (restaurant) => {
    setSelected(restaurant)
    setForm({
      restId: restaurant.petpooja.restId || "",
      appKey: "",
      appSecret: "",
      accessToken: "",
    })
  }

  const handleSave = async () => {
    if (!selected) return
    if (!form.restId.trim()) {
      toast.error("restID is required")
      return
    }
    try {
      setIsSaving(true)
      const body = { restId: form.restId.trim(), enabled: true }
      // Only send secrets the admin actually typed — keeps already-saved ones untouched.
      if (form.appKey.trim()) body.appKey = form.appKey.trim()
      if (form.appSecret.trim()) body.appSecret = form.appSecret.trim()
      if (form.accessToken.trim()) body.accessToken = form.accessToken.trim()

      const res = await adminAPI.updatePetpoojaConfig(selected.id, body)
      const updated = res?.data?.data
      setRestaurants((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      toast.success(`${selected.restaurantName} connected to PetPooja`)
      setSelected(null)
    } catch (err) {
      debugError("Failed to save PetPooja config:", err)
      toast.error(err?.response?.data?.message || "Failed to save PetPooja settings")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDisconnect = async (restaurant) => {
    try {
      setTogglingId(restaurant.id)
      const res = await adminAPI.updatePetpoojaConfig(restaurant.id, { enabled: false })
      const updated = res?.data?.data
      setRestaurants((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      toast.success(`${restaurant.restaurantName} disconnected from PetPooja`)
    } catch (err) {
      debugError("Failed to disconnect PetPooja:", err)
      toast.error(err?.response?.data?.message || "Failed to update")
    } finally {
      setTogglingId(null)
    }
  }

  const hasAnyCredentials = (p) => Boolean(p.restId && p.appKey && p.appSecret && p.accessToken)

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
              <Plug className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">PetPooja Integration</h1>
              <p className="text-sm text-slate-500">
                Only restaurants connected here get orders pushed to PetPooja for POS billing/invoices.
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="relative flex-1 md:max-w-md">
              <input
                type="text"
                placeholder="Search restaurant by name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={onlyConnected}
                onChange={(e) => setOnlyConnected(e.target.checked)}
                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
              />
              Show connected only
            </label>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
                <p className="text-sm text-slate-500">Loading restaurants...</p>
              </div>
            ) : restaurants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <p className="text-sm text-slate-500">No restaurants match your search.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                    <th className="px-6 py-4">Restaurant</th>
                    <th className="px-6 py-4">City</th>
                    <th className="px-6 py-4">PetPooja restID</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-center w-48">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {restaurants.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors text-sm text-slate-800">
                      <td className="px-6 py-4 font-semibold text-slate-900">{r.restaurantName}</td>
                      <td className="px-6 py-4 text-slate-600">{r.city || "—"}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-600">{r.petpooja.restId || "—"}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            r.petpooja.enabled
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {r.petpooja.enabled ? "Connected" : "Not connected"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => openConfigure(r)} className="gap-1.5">
                            <Settings2 className="w-3.5 h-3.5" />
                            {hasAnyCredentials(r.petpooja) ? "Edit" : "Connect"}
                          </Button>
                          {r.petpooja.enabled && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={togglingId === r.id}
                              onClick={() => handleDisconnect(r)}
                              className="text-red-600 border-red-200 hover:bg-red-50"
                            >
                              Disconnect
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !isSaving && !open && setSelected(null)}>
        <DialogContent className="sm:max-w-md p-6 flex flex-col gap-5">
          <DialogHeader className="gap-2">
            <DialogTitle className="text-xl">Connect {selected?.restaurantName}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Enter the credentials PetPooja issued for this restaurant (support@petpooja.com). Leave a
              secret field blank to keep its current saved value.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">restID *</label>
              <Input
                value={form.restId}
                onChange={(e) => setForm({ ...form, restId: e.target.value })}
                placeholder="PetPooja restaurant ID"
                className="mt-1 h-11"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">App key</label>
              <Input
                value={form.appKey}
                onChange={(e) => setForm({ ...form, appKey: e.target.value })}
                placeholder={
                  selected?.petpooja.appKey ? `Saved: ${selected.petpooja.appKey}` : "App key"
                }
                className="mt-1 h-11"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">App secret</label>
              <Input
                type="password"
                value={form.appSecret}
                onChange={(e) => setForm({ ...form, appSecret: e.target.value })}
                placeholder={
                  selected?.petpooja.appSecret ? `Saved: ${selected.petpooja.appSecret}` : "App secret"
                }
                className="mt-1 h-11"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Access token</label>
              <Input
                type="password"
                value={form.accessToken}
                onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
                placeholder={
                  selected?.petpooja.accessToken ? `Saved: ${selected.petpooja.accessToken}` : "Access token"
                }
                className="mt-1 h-11"
              />
            </div>
          </div>

          <DialogFooter className="gap-3 sm:gap-3">
            <Button type="button" variant="outline" onClick={() => setSelected(null)} disabled={isSaving} className="h-11 w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="h-11 w-full sm:w-auto sm:min-w-36 bg-orange-600 hover:bg-orange-700 text-white"
            >
              {isSaving ? "Saving..." : "Save & connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
