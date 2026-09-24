import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, CalendarOff, Copy, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Switch } from "@food/components/ui/switch"
import { diningAPI } from "@food/api"
import { DAY_LABELS, diningErrorMessage, formatDateKey, toDateKey } from "@food/utils/dining"

const defaultSlot = { startTime: "12:00", endTime: "15:00", capacity: 0, isActive: true }

const buildDefaultDays = () =>
  DAY_LABELS.map((day, dayOfWeek) => ({ dayOfWeek, day, isOpen: false, slots: [] }))

export default function DiningSlots() {
  const navigate = useNavigate()
  const [days, setDays] = useState(buildDefaultDays)
  const [blockedDates, setBlockedDates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [blockForm, setBlockForm] = useState({ date: "", reason: "" })
  const [blocking, setBlocking] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await diningAPI.restaurant.getSlots()
      const data = res?.data?.data
      setDays(data?.days?.length ? data.days : buildDefaultDays())
      setBlockedDates(data?.blockedDates || [])
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to load dining slots"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const updateDay = (dayOfWeek, patch) => {
    setDays((prev) => prev.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day)))
  }

  const updateSlot = (dayOfWeek, index, patch) => {
    setDays((prev) =>
      prev.map((day) =>
        day.dayOfWeek === dayOfWeek
          ? { ...day, slots: day.slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)) }
          : day,
      ),
    )
  }

  const addSlot = (dayOfWeek) => {
    setDays((prev) =>
      prev.map((day) =>
        day.dayOfWeek === dayOfWeek
          ? { ...day, isOpen: true, slots: [...day.slots, { ...defaultSlot }] }
          : day,
      ),
    )
  }

  const removeSlot = (dayOfWeek, index) => {
    setDays((prev) =>
      prev.map((day) =>
        day.dayOfWeek === dayOfWeek
          ? { ...day, slots: day.slots.filter((_, i) => i !== index) }
          : day,
      ),
    )
  }

  /** Copy a configured day across the whole week — the most common setup. */
  const copyToAllDays = (dayOfWeek) => {
    const source = days.find((day) => day.dayOfWeek === dayOfWeek)
    if (!source) return
    setDays((prev) =>
      prev.map((day) => ({
        ...day,
        isOpen: source.isOpen,
        slots: source.slots.map((slot) => ({ ...slot })),
      })),
    )
    toast.success(`${source.day}'s timings copied to all days`)
  }

  const validate = () => {
    for (const day of days) {
      if (!day.isOpen) continue
      if (day.slots.length === 0) {
        toast.error(`${day.day} is open but has no slots`)
        return false
      }
      const sorted = [...day.slots].sort((a, b) => a.startTime.localeCompare(b.startTime))
      for (let i = 0; i < sorted.length; i += 1) {
        if (sorted[i].startTime >= sorted[i].endTime) {
          toast.error(`${day.day}: slot end time must be after start time`)
          return false
        }
        if (i > 0 && sorted[i].startTime < sorted[i - 1].endTime) {
          toast.error(`${day.day}: slots cannot overlap`)
          return false
        }
        if (Number(sorted[i].capacity) < 0) {
          toast.error(`${day.day}: capacity cannot be negative`)
          return false
        }
      }
    }
    return true
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      await diningAPI.restaurant.saveSlots({
        days: days.map((day) => ({
          dayOfWeek: day.dayOfWeek,
          isOpen: day.isOpen,
          slots: day.slots.map((slot) => ({
            startTime: slot.startTime,
            endTime: slot.endTime,
            capacity: Number(slot.capacity) || 0,
            isActive: slot.isActive !== false,
          })),
        })),
      })
      toast.success("Dining slots saved")
      await load()
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to save dining slots"))
    } finally {
      setSaving(false)
    }
  }

  const handleBlockDate = async () => {
    if (!blockForm.date) {
      toast.error("Select a date to block")
      return
    }
    setBlocking(true)
    try {
      await diningAPI.restaurant.addBlockedDate(blockForm)
      toast.success("Date blocked")
      setBlockForm({ date: "", reason: "" })
      await load()
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to block date"))
    } finally {
      setBlocking(false)
    }
  }

  const handleUnblock = async (id) => {
    try {
      await diningAPI.restaurant.removeBlockedDate(id)
      setBlockedDates((prev) => prev.filter((entry) => entry.id !== id))
      toast.success("Date unblocked")
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to unblock date"))
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading slots…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-4">
        <button type="button" onClick={() => navigate(-1)} className="rounded-full p-1.5 hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Slots & Availability</h1>
      </div>

      <div className="space-y-3 p-4">
        <p className="text-sm text-gray-500">
          Set the times guests can book. Leave capacity at 0 to use your total active table seats.
        </p>

        {days.map((day) => (
          <div key={day.dayOfWeek} className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch
                  checked={day.isOpen}
                  onCheckedChange={(checked) => updateDay(day.dayOfWeek, { isOpen: checked })}
                />
                <span className="font-medium text-gray-900">{day.day}</span>
              </div>
              {day.slots.length > 0 && (
                <button
                  type="button"
                  onClick={() => copyToAllDays(day.dayOfWeek)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-orange-600"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy to all
                </button>
              )}
            </div>

            {day.isOpen && (
              <div className="mt-3 space-y-2">
                {day.slots.map((slot, index) => (
                  <div key={index} className="flex items-center gap-2 rounded-xl bg-gray-50 p-2">
                    <input
                      type="time"
                      value={slot.startTime}
                      onChange={(event) =>
                        updateSlot(day.dayOfWeek, index, { startTime: event.target.value })
                      }
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm outline-none focus:border-orange-400"
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="time"
                      value={slot.endTime}
                      onChange={(event) => updateSlot(day.dayOfWeek, index, { endTime: event.target.value })}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm outline-none focus:border-orange-400"
                    />
                    <input
                      type="number"
                      min={0}
                      value={slot.capacity}
                      onChange={(event) => updateSlot(day.dayOfWeek, index, { capacity: event.target.value })}
                      title="Seats bookable in this slot (0 = all table seats)"
                      className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm outline-none focus:border-orange-400"
                    />
                    <button
                      type="button"
                      onClick={() => removeSlot(day.dayOfWeek, index)}
                      className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                      aria-label="Remove slot"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addSlot(day.dayOfWeek)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-600"
                >
                  <Plus className="h-4 w-4" /> Add slot
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarOff className="h-4 w-4 text-gray-500" />
            <h2 className="font-medium text-gray-900">Blocked dates</h2>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="date"
              min={toDateKey()}
              value={blockForm.date}
              onChange={(event) => setBlockForm((prev) => ({ ...prev, date: event.target.value }))}
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
            />
            <input
              value={blockForm.reason}
              onChange={(event) => setBlockForm((prev) => ({ ...prev, reason: event.target.value }))}
              placeholder="Reason (optional)"
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
            />
            <button
              type="button"
              onClick={handleBlockDate}
              disabled={blocking}
              className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Block
            </button>
          </div>

          {blockedDates.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {blockedDates.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium text-gray-800">{formatDateKey(entry.date)}</span>
                    {entry.reason && <span className="ml-2 text-gray-500">{entry.reason}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUnblock(entry.id)}
                    className="text-rose-600 hover:text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-gray-500">No blocked dates</p>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-gray-100 bg-white p-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save slots
        </button>
      </div>
    </div>
  )
}
