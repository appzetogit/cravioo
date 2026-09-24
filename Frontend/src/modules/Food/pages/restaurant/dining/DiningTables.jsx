import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Loader2, Pencil, Plus, Sofa, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Switch } from "@food/components/ui/switch"
import { diningAPI } from "@food/api"
import { DINING_TABLE_SECTIONS, diningErrorMessage } from "@food/utils/dining"

const emptyForm = { name: "", seats: 4, section: "indoor", note: "", isActive: true }

export default function DiningTables() {
  const navigate = useNavigate()
  const [tables, setTables] = useState([])
  const [summary, setSummary] = useState({ tables: 0, seats: 0 })
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await diningAPI.restaurant.listTables()
      setTables(res?.data?.data?.items || [])
      setSummary(res?.data?.data?.summary || { tables: 0, seats: 0 })
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to load tables"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (table) => {
    setEditing(table)
    setForm({
      name: table.name,
      seats: table.seats,
      section: table.section,
      note: table.note || "",
      isActive: table.isActive,
    })
    setErrors({})
    setModalOpen(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = "Table name is required"
    if (!(Number(form.seats) >= 1)) next.seats = "Seats must be at least 1"
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const payload = {
      name: form.name.trim(),
      seats: Number(form.seats),
      section: form.section,
      note: form.note.trim(),
      isActive: form.isActive,
    }

    setSaving(true)
    try {
      if (editing) {
        await diningAPI.restaurant.updateTable(editing.id, payload)
        toast.success("Table updated")
      } else {
        await diningAPI.restaurant.createTable(payload)
        toast.success("Table added")
      }
      setModalOpen(false)
      await load()
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to save table"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (table) => {
    if (!window.confirm(`Delete table "${table.name}"?`)) return
    try {
      await diningAPI.restaurant.deleteTable(table.id)
      toast.success("Table deleted")
      await load()
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to delete table"))
    }
  }

  const toggleActive = async (table, isActive) => {
    setTables((prev) => prev.map((row) => (row.id === table.id ? { ...row, isActive } : row)))
    try {
      await diningAPI.restaurant.updateTable(table.id, { isActive })
      await load()
    } catch (error) {
      setTables((prev) => prev.map((row) => (row.id === table.id ? { ...row, isActive: !isActive } : row)))
      toast.error(diningErrorMessage(error, "Failed to update table"))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-4">
        <button type="button" onClick={() => navigate(-1)} className="rounded-full p-1.5 hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Tables & Seating</h1>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <p className="text-xs text-gray-500">Active tables</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{summary.tables}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <p className="text-xs text-gray-500">Bookable seats</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{summary.seats}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading tables…
          </div>
        ) : tables.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
            <Sofa className="mx-auto h-9 w-9 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">
              Add your tables so slot capacity can be calculated.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tables.map((table) => (
              <div
                key={table.id}
                className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 font-semibold text-orange-600">
                  {table.seats}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900">{table.name}</p>
                  <p className="text-sm capitalize text-gray-500">
                    {table.section}
                    {table.note ? ` · ${table.note}` : ""}
                  </p>
                </div>
                <Switch
                  checked={table.isActive}
                  onCheckedChange={(checked) => toggleActive(table, checked)}
                />
                <button
                  type="button"
                  onClick={() => openEdit(table)}
                  className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(table)}
                  className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-gray-100 bg-white p-4">
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" /> Add table
        </button>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="font-semibold text-gray-900">{editing ? "Edit table" : "Add table"}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-1.5 hover:bg-gray-100">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Table name <span className="text-rose-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="e.g. T1 / Window booth"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
                {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Seats <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={form.seats}
                    onChange={(event) => setForm((prev) => ({ ...prev, seats: event.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                  />
                  {errors.seats && <p className="mt-1 text-xs text-rose-600">{errors.seats}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Section</label>
                  <select
                    value={form.section}
                    onChange={(event) => setForm((prev) => ({ ...prev, section: event.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                  >
                    {DINING_TABLE_SECTIONS.map((section) => (
                      <option key={section.value} value={section.value}>
                        {section.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Note</label>
                <input
                  value={form.note}
                  onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="e.g. Near the window"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
              </div>

              <label className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Available for booking</span>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
                />
              </label>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save table" : "Add table"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
