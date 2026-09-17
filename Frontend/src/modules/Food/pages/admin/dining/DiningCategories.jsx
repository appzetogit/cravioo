import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Pencil, Plus, Search, Trash2, Upload, UtensilsCrossed, X } from "lucide-react"
import { toast } from "sonner"
import { diningAPI } from "@food/api"
import { diningErrorMessage, validateImageFile } from "@food/utils/dining"

const emptyForm = { name: "", description: "", sortOrder: 0, isActive: true }

export default function DiningCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState("")
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState("")
  const fileInputRef = useRef(null)
  const previewUrlRef = useRef("")

  const loadCategories = useCallback(async () => {
    setLoading(true)
    try {
      const res = await diningAPI.admin.listCategories()
      setCategories(res?.data?.data?.items || [])
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to load dining categories"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  // Object URLs are revoked on replace/unmount so previews never leak memory.
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return categories
    return categories.filter((category) => category.name.toLowerCase().includes(term))
  }, [categories, search])

  const setPreview = (url) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = url && url.startsWith("blob:") ? url : ""
    setImagePreview(url)
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setImageFile(null)
    setPreview("")
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (category) => {
    setEditing(category)
    setForm({
      name: category.name || "",
      description: category.description || "",
      sortOrder: category.sortOrder ?? 0,
      isActive: category.isActive !== false,
    })
    setImageFile(null)
    setPreview(category.image || "")
    setErrors({})
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
    setPreview("")
    setImageFile(null)
  }

  const handleImageChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const imageError = validateImageFile(file)
    if (imageError) {
      setErrors((prev) => ({ ...prev, image: imageError }))
      return
    }
    setImageFile(file)
    setPreview(URL.createObjectURL(file))
    setErrors((prev) => ({ ...prev, image: "" }))
  }

  const validate = () => {
    const next = {}
    if (form.name.trim().length < 2) next.name = "Category name must be at least 2 characters"
    if (form.description.length > 500) next.description = "Keep the description under 500 characters"
    if (Number(form.sortOrder) < 0) next.sortOrder = "Display order cannot be negative"
    if (!editing && !imageFile) next.image = "Category image is required"
    if (editing && !imageFile && !editing.image) next.image = "Category image is required"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) return

    const formData = new FormData()
    formData.append("name", form.name.trim())
    formData.append("description", form.description.trim())
    formData.append("sortOrder", String(Number(form.sortOrder) || 0))
    formData.append("isActive", String(form.isActive))
    if (imageFile) formData.append("image", imageFile)

    setSaving(true)
    try {
      if (editing) {
        await diningAPI.admin.updateCategory(editing.id, formData)
        toast.success("Dining category updated")
      } else {
        await diningAPI.admin.createCategory(formData)
        toast.success("Dining category created")
      }
      setModalOpen(false)
      setPreview("")
      setImageFile(null)
      await loadCategories()
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to save dining category"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (category) => {
    if (!window.confirm(`Delete "${category.name}"? This cannot be undone.`)) return
    setDeletingId(category.id)
    try {
      await diningAPI.admin.deleteCategory(category.id)
      toast.success("Dining category deleted")
      await loadCategories()
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to delete dining category"))
    } finally {
      setDeletingId("")
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Dining Categories</h1>
          <p className="text-sm text-slate-500 mt-1">
            Restaurants pick from these while raising a dining request, and users browse by them.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition"
        >
          <Plus className="h-4 w-4" /> Add Category
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search categories"
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-orange-400"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading categories…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
            <UtensilsCrossed className="h-8 w-8 text-slate-300" />
            <p className="text-sm">No dining categories yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Outlets</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((category) => (
                  <tr key={category.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={category.image}
                          alt={category.name}
                          loading="lazy"
                          className="h-11 w-11 rounded-lg object-cover border border-slate-200"
                        />
                        <span className="font-medium text-slate-900">{category.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                      {category.description || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{category.restaurantCount ?? 0}</td>
                    <td className="px-4 py-3 text-slate-600">{category.sortOrder ?? 0}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                          category.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-100 text-slate-600 border-slate-300"
                        }`}
                      >
                        {category.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(category)}
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
                          aria-label={`Edit ${category.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(category)}
                          disabled={deletingId === category.id}
                          className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          aria-label={`Delete ${category.name}`}
                        >
                          {deletingId === category.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                {editing ? "Edit dining category" : "Add dining category"}
              </h2>
              <button type="button" onClick={closeModal} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Category image <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-300">
                        <Upload className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {imagePreview ? "Change image" : "Upload image"}
                    </button>
                    <p className="mt-1 text-xs text-slate-400">PNG, JPG or WEBP · max 5MB</p>
                  </div>
                </div>
                {errors.image && <p className="mt-1 text-xs text-rose-600">{errors.image}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="e.g. Rooftop Dining"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
                {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Short line shown on the user app"
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
                {errors.description && <p className="mt-1 text-xs text-rose-600">{errors.description}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Display order</label>
                  <input
                    type="number"
                    min={0}
                    value={form.sortOrder}
                    onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                  />
                  {errors.sortOrder && <p className="mt-1 text-xs text-rose-600">{errors.sortOrder}</p>}
                </div>
                <div className="flex items-end">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 accent-orange-500"
                    />
                    Active
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editing ? "Save changes" : "Create category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
