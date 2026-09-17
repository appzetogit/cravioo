import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  Clock,
  Loader2,
  Settings2,
  Sofa,
  UtensilsCrossed,
} from "lucide-react"
import { toast } from "sonner"
import { Switch } from "@food/components/ui/switch"
import { diningAPI } from "@food/api"
import {
  DINING_PROFILE_STATUS_CLASSES,
  DINING_PROFILE_STATUS_LABELS,
  diningErrorMessage,
} from "@food/utils/dining"

const SETTINGS_FIELDS = [
  { key: "bookingWindowDays", label: "Booking window (days)", min: 1, max: 90 },
  { key: "slotDurationMins", label: "Slot duration (mins)", min: 15, max: 240 },
  { key: "maxGuestsPerBooking", label: "Max guests per booking", min: 1, max: 50 },
  { key: "minAdvanceMins", label: "Min advance notice (mins)", min: 0, max: 1440 },
]

export default function DiningManagement() {
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [savingSetting, setSavingSetting] = useState(false)
  const [settings, setSettings] = useState({})

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const res = await diningAPI.restaurant.getDashboard()
      const data = res?.data?.data || null
      setDashboard(data)
      if (data?.profile) {
        setSettings({
          bookingWindowDays: data.profile.bookingWindowDays,
          slotDurationMins: data.profile.slotDurationMins,
          maxGuestsPerBooking: data.profile.maxGuestsPerBooking,
          minAdvanceMins: data.profile.minAdvanceMins,
          autoConfirm: data.profile.autoConfirm,
          isOnline: data.profile.isOnline,
        })
      }
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to load dining dashboard"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const profile = dashboard?.profile
  const isApproved = profile?.status === "approved"

  const saveSettings = async (patch) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    setSavingSetting(true)
    try {
      const res = await diningAPI.restaurant.updateSettings(patch)
      const updated = res?.data?.data
      if (updated) {
        setDashboard((prev) => (prev ? { ...prev, profile: updated } : prev))
      }
      toast.success("Dining settings updated")
    } catch (error) {
      setSettings(settings)
      toast.error(diningErrorMessage(error, "Failed to update dining settings"))
    } finally {
      setSavingSetting(false)
    }
  }

  const stats = dashboard?.stats

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading dining…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-4">
        <button type="button" onClick={() => navigate(-1)} className="rounded-full p-1.5 hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Dining Management</h1>
      </div>

      <div className="space-y-4 p-4">
        {!profile ? (
          <div className="rounded-2xl border border-dashed border-orange-200 bg-white p-6 text-center">
            <UtensilsCrossed className="mx-auto h-10 w-10 text-orange-400" />
            <h2 className="mt-3 text-base font-semibold text-gray-900">Start taking table bookings</h2>
            <p className="mt-1 text-sm text-gray-500">
              Send a dining request with your photos and seating details. Once admin approves it, you can
              manage slots, tables and reservations right here.
            </p>
            <button
              type="button"
              onClick={() => navigate("/restaurant/dining/request")}
              className="mt-4 w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Raise dining request
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-500">Dining status</p>
                  <span
                    className={`mt-1 inline-flex rounded-full border px-3 py-1 text-sm font-medium ${
                      DINING_PROFILE_STATUS_CLASSES[profile.status] || ""
                    }`}
                  >
                    {DINING_PROFILE_STATUS_LABELS[profile.status] || profile.status}
                  </span>
                </div>
                {profile.coverImage && (
                  <img
                    src={profile.coverImage}
                    alt="Dining cover"
                    className="h-16 w-24 rounded-xl object-cover"
                  />
                )}
              </div>

              {profile.status === "pending" && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                  Your request is with the admin team. You will be notified once it is reviewed.
                </p>
              )}
              {(profile.status === "rejected" || profile.status === "suspended") && profile.rejectionReason && (
                <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
                  <strong>Reason:</strong> {profile.rejectionReason}
                </p>
              )}

              <button
                type="button"
                onClick={() => navigate("/restaurant/dining/request")}
                className="mt-3 w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {profile.status === "rejected" ? "Edit & resubmit request" : "Edit dining details"}
              </button>
            </div>

            {isApproved && (
              <>
                <div className="rounded-2xl border border-gray-100 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">Accepting bookings</p>
                      <p className="text-sm text-gray-500">
                        Turn off to pause new reservations without losing your setup.
                      </p>
                    </div>
                    <Switch
                      checked={settings.isOnline !== false}
                      disabled={savingSetting}
                      onCheckedChange={(checked) => saveSettings({ isOnline: checked })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Today's bookings", value: stats?.today?.bookings ?? 0 },
                    { label: "Today's guests", value: stats?.today?.guests ?? 0 },
                    { label: "Pending requests", value: stats?.pending ?? 0 },
                    { label: "Confirmed", value: stats?.confirmed ?? 0 },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-2xl border border-gray-100 bg-white p-4">
                      <p className="text-xs text-gray-500">{stat.label}</p>
                      <p className="mt-1 text-xl font-semibold text-gray-900">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                  {[
                    {
                      label: "Bookings",
                      hint: `${stats?.pending ?? 0} awaiting your response`,
                      icon: CalendarClock,
                      path: "/restaurant/dining/bookings",
                    },
                    {
                      label: "Slots & availability",
                      hint: "Set open days, timings and holidays",
                      icon: Clock,
                      path: "/restaurant/dining/slots",
                    },
                    {
                      label: "Tables & seating",
                      hint: `${dashboard?.tables?.tables ?? 0} tables · ${dashboard?.tables?.seats ?? 0} seats`,
                      icon: Sofa,
                      path: "/restaurant/dining/tables",
                    },
                  ].map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => navigate(item.path)}
                      className="flex w-full items-center gap-3 border-b border-gray-100 p-4 text-left last:border-b-0 hover:bg-gray-50"
                    >
                      <span className="rounded-xl bg-orange-50 p-2.5 text-orange-600">
                        <item.icon className="h-5 w-5" />
                      </span>
                      <span className="flex-1">
                        <span className="block font-medium text-gray-900">{item.label}</span>
                        <span className="block text-sm text-gray-500">{item.hint}</span>
                      </span>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-gray-500" />
                    <h2 className="font-medium text-gray-900">Booking rules</h2>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {SETTINGS_FIELDS.map((field) => (
                      <div key={field.key}>
                        <label className="mb-1 block text-xs text-gray-500">{field.label}</label>
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          value={settings[field.key] ?? ""}
                          onChange={(event) =>
                            setSettings((prev) => ({ ...prev, [field.key]: event.target.value }))
                          }
                          onBlur={(event) => {
                            const value = Number(event.target.value)
                            if (!Number.isFinite(value) || value < field.min || value > field.max) {
                              toast.error(`${field.label} must be between ${field.min} and ${field.max}`)
                              setSettings((prev) => ({ ...prev, [field.key]: profile[field.key] }))
                              return
                            }
                            if (value !== profile[field.key]) saveSettings({ [field.key]: value })
                          }}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">Auto-confirm bookings</p>
                      <p className="text-sm text-gray-500">
                        Skip manual approval when seats are available.
                      </p>
                    </div>
                    <Switch
                      checked={settings.autoConfirm === true}
                      disabled={savingSetting}
                      onCheckedChange={(checked) => saveSettings({ autoConfirm: checked })}
                    />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
