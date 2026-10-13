import { Link } from "react-router-dom"
import { Clock } from "lucide-react"
import { useSettings } from "@core/context/SettingsContext"

/**
 * Admin-controlled full-screen block for the User app. Shown to every logged-in
 * customer when GlobalSettings.userComingSoonEnabled is true — nothing else in
 * the user app is reachable while this is on (see the gate in UserRouter.jsx).
 */
export default function ComingSoon() {
  const { settings } = useSettings()
  const appName = settings?.appName || settings?.companyName || "Cravioo"

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] dark:bg-[#0a0a0a] px-6">
      <div className="max-w-md w-full text-center">
        {settings?.logoUrl ? (
          <img
            src={settings.logoUrl}
            alt={appName}
            className="w-20 h-20 rounded-full object-cover mx-auto mb-6 border border-gray-200 dark:border-gray-800"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-[#32C45A]/10 flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-[#32C45A]" />
          </div>
        )}

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          We'll be right back
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-8">
          {appName} is temporarily unavailable while we get things ready. Please check back
          again shortly.
        </p>

        <Link
          to="/food/user/profile/logout"
          className="inline-block text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline"
        >
          Log out
        </Link>
      </div>
    </div>
  )
}
