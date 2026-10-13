import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import {
  AppShellSkeleton,
  AuthPortalSkeleton,
  ContentPageSkeleton,
} from '@food/components/ui/loading-skeletons'

import ProtectedRoute from '@core/guards/ProtectedRoute'
import ModuleEnabledRoute, { getFirstEnabledModulePath } from '@core/guards/ModuleEnabledRoute'
import { useSettings } from '@core/context/SettingsContext'
import FoodProtectedRoute from '../modules/Food/components/ProtectedRoute'
import { AuthPageGuard } from '@core/guards/RouteGuard'
import { applyNativeShellClasses } from '@/shared/utils/nativeShell'
import { isModuleAuthenticated } from '@food/utils/auth'

const NATIVE_LAST_ROUTE_KEY = 'native_last_route'

// Lazy load the Food service module (Quick-spicy app)
const FoodApp = lazy(() => import('../modules/Food/routes'))
const AuthApp = lazy(() => import('../modules/auth/routes'))


const FoodUserLayout = lazy(() => import('../modules/Food/components/user/UserLayout'))
const FoodHomePage = lazy(() => import('../modules/Food/pages/user/Home'))
const FoodComingSoonPage = lazy(() => import('../modules/Food/pages/user/ComingSoon'))
const GlobalCartPage = lazy(() => import('../modules/Food/pages/user/cart/Cart'))
const GlobalSelectAddressPage = lazy(() => import('../modules/Food/pages/user/cart/SelectAddress'))
const GlobalAddressSelectorPage = lazy(() => import('../modules/Food/pages/user/cart/AddressSelectorPage'))
const SharedProfilePage = lazy(() => import('../modules/Food/pages/user/profile/Profile'))
const SharedProfileEditPage = lazy(() => import('../modules/Food/pages/user/profile/EditProfile'))
const SharedProfileSupportPage = lazy(() => import('../modules/Food/pages/user/profile/Support'))
const SharedProfileCouponsPage = lazy(() => import('../modules/Food/pages/user/profile/Coupons'))
const SharedProfileAboutPage = lazy(() => import('../modules/Food/pages/user/profile/About'))
const SharedProfileTermsPage = lazy(() => import('../modules/Food/pages/user/profile/Terms'))
const SharedProfilePrivacyPage = lazy(() => import('../modules/Food/pages/user/profile/Privacy'))
const SharedProfileRefundPage = lazy(() => import('../modules/Food/pages/user/profile/Refund'))
const SharedProfileShippingPage = lazy(() => import('../modules/Food/pages/user/profile/Shipping'))
const SharedProfileCancellationPage = lazy(() => import('../modules/Food/pages/user/profile/Cancellation'))

const RouteAwarePageLoader = () => {
  const location = useLocation()
  const pathname = location.pathname || ''

  if (pathname.startsWith('/user/auth')) {
    return <AuthPortalSkeleton />
  }



  if (pathname.startsWith('/admin')) {
    return <ContentPageSkeleton hero={false} />
  }

  return <AppShellSkeleton />
}
/**
 * FoodAppWrapper — Quick-spicy App. को /food prefix के साथ render करता है.
 * 
 * Quick-spicy की App.jsx में routes /restaurant, /usermain, /admin, /delivery
 * जैसे hain (bina /food prefix ke). Yahan hum useLocation se /food ke baad wala
 * path nikalne ke baad FoodApp render karte hain. FoodApp internally BrowserRouter
 * nahi use karta (sirf Routes use karta hai), isliye ye directly kaam karta hai.
 */
const DefaultHomeRedirect = () => {
  const location = useLocation()
  const { settings, loading } = useSettings()

  if (loading) {
    return <RouteAwarePageLoader />
  }

  return (
    <Navigate
      to={`${getFirstEnabledModulePath(settings)}${location.search}`}
      replace
    />
  )
}

const FoodAppWrapper = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <FoodApp />
    </Suspense>
  )
}

const SharedFoodHomeRoute = () => {
  const { settings, refetch } = useSettings()
  const location = useLocation()

  // Force a fresh settings check on every visit to this entry point — settings
  // are otherwise session-cached, which would let a stale "Coming Soon off"
  // linger for a whole tab session after admin turns it on.
  useEffect(() => {
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // This is a separate top-level entry for the bare /food/user path (kept so
  // /food/user <-> legacy /quick don't remount through different app trees) —
  // it never goes through UserRouter.jsx, so the login/coming-soon gates there
  // don't cover it. Must be enforced here too.
  if (!isModuleAuthenticated('user')) {
    return <Navigate to="/user/auth/login" state={{ from: location }} replace />
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <FoodUserLayout>
        {settings?.userComingSoonEnabled ? <FoodComingSoonPage /> : <FoodHomePage />}
      </FoodUserLayout>
    </Suspense>
  )
}

/** Legal/info pages stay reachable even in Coming Soon mode (see UserRouter.jsx's own exemption list). */
const SHARED_COMING_SOON_EXEMPT_PATHS = [
  '/profile/about', '/profile/terms', '/profile/privacy', '/profile/refund',
  '/profile/shipping', '/profile/cancellation', '/profile/support',
]

/**
 * Layout for the shared /cart and /profile/* routes above. These sit outside
 * UserRouter.jsx too, so Coming Soon mode has to be enforced here as well —
 * login itself is handled per-route by ProtectedRoute/FoodProtectedRoute.
 */
const SharedCartProfileGate = () => {
  const { settings, refetch } = useSettings()
  const location = useLocation()
  const isExempt = SHARED_COMING_SOON_EXEMPT_PATHS.includes(location.pathname)

  useEffect(() => {
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Suspense fallback={<PageLoader />}>
      <FoodUserLayout>
        {settings?.userComingSoonEnabled && !isExempt ? <FoodComingSoonPage /> : <Outlet />}
      </FoodUserLayout>
    </Suspense>
  )
}

const RedirectToFood = () => {
  const location = useLocation();
  // We safely replace the exact current pathname with a /food prefixed pathname
  // This effectively catches programmatic navigation to absolute paths like '/restaurant/login'
  // and turns them into '/food/restaurant/login'
  return <Navigate to={`/food${location.pathname}${location.search}`} replace />;
};

const AdminRouter = lazy(() => import('../modules/Food/components/admin/AdminRouter'))

const AppRoutes = () => {
  const location = useLocation()

  useEffect(() => {
    // Eagerly prefetch the user app routes chunk after initial mount
    const prefetchTimeout = setTimeout(() => {
      import('../modules/Food/routes').catch(() => {});
    }, 2000);

    return () => clearTimeout(prefetchTimeout);
  }, []);

  useEffect(() => {
    applyNativeShellClasses(location.pathname)

    if (typeof window === 'undefined') return

    const protocol = String(window.location?.protocol || '').toLowerCase()
    const userAgent = String(window.navigator?.userAgent || '').toLowerCase()
    const isNativeLikeShell =
      Boolean(window.flutter_inappwebview) ||
      Boolean(window.ReactNativeWebView) ||
      protocol === 'file:' ||
      userAgent.includes(' wv') ||
      userAgent.includes('; wv')

    if (!isNativeLikeShell) return

    const route = `${location.pathname || ''}${location.search || ''}`
    if (route.startsWith('/food/') || route.startsWith('/admin')) {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route)
    }
  }, [location.pathname, location.search])

  return (
    <Routes>
        {/* Root lands on the first enabled customer module */}
        <Route path="/" element={<DefaultHomeRedirect />} />

        {/* Auth Module */}
        <Route
          path="/user/auth/*"
          element={
            <AuthPageGuard module="user" home="/food/user">
              <AuthApp />
            </AuthPageGuard>
          }
        />
        <Route path="/portal" element={<DefaultHomeRedirect />} />
        <Route path="/login" element={<Navigate to={`/user/auth/login${location.search}`} replace />} />

        {/* Food Module */}
        <Route
          path="/food/*"
          element={
            <ModuleEnabledRoute moduleKey="food">
              <FoodAppWrapper />
            </ModuleEnabledRoute>
          }
        />

        {/* Public Customer Storefront Layout (Some routes inside are protected) */}
        <Route
          element={
            <Outlet />
          }
        >
          {/* Shared home entry so /food/user <-> /quick doesn't remount through different app trees */}
          <Route
            path="/food/user"
            element={
              <ModuleEnabledRoute moduleKey="food">
                <SharedFoodHomeRoute />
              </ModuleEnabledRoute>
            }
          />

          {/* Legacy Quick Commerce / Porter landing bookmarks redirect to the food home */}
          <Route path="/quick" element={<Navigate to="/food/user" replace />} />
          <Route path="/porter" element={<Navigate to="/food/user" replace />} />

          {/* Global shared cart */}
          <Route element={<SharedCartProfileGate />}>
            <Route path="/cart" element={<ProtectedRoute requiredRole="user" loginPath="/user/auth/login"><GlobalCartPage /></ProtectedRoute>} />
            <Route path="/cart/checkout" element={<Navigate to="/cart" replace />} />
            <Route path="/cart/select-address" element={<ProtectedRoute requiredRole="user" loginPath="/user/auth/login"><GlobalSelectAddressPage /></ProtectedRoute>} />
            <Route path="/cart/address-selector" element={<ProtectedRoute requiredRole="user" loginPath="/user/auth/login"><GlobalAddressSelectorPage /></ProtectedRoute>} />
            <Route path="/profile" element={<FoodProtectedRoute requiredRole="user" loginPath="/user/auth/login"><SharedProfilePage /></FoodProtectedRoute>} />
            <Route path="/profile/edit" element={<FoodProtectedRoute requiredRole="user" loginPath="/user/auth/login"><SharedProfileEditPage /></FoodProtectedRoute>} />
            <Route path="/profile/support" element={<FoodProtectedRoute requiredRole="user" loginPath="/user/auth/login"><SharedProfileSupportPage /></FoodProtectedRoute>} />
            <Route path="/profile/coupons" element={<FoodProtectedRoute requiredRole="user" loginPath="/user/auth/login"><SharedProfileCouponsPage /></FoodProtectedRoute>} />
            <Route path="/profile/about" element={<SharedProfileAboutPage />} />
            <Route path="/profile/terms" element={<SharedProfileTermsPage />} />
            <Route path="/profile/privacy" element={<SharedProfilePrivacyPage />} />
            <Route path="/profile/refund" element={<SharedProfileRefundPage />} />
            <Route path="/profile/shipping" element={<SharedProfileShippingPage />} />
            <Route path="/profile/cancellation" element={<SharedProfileCancellationPage />} />
          </Route>

          {/* Legacy Quick Commerce / Porter deep links redirect to the food home */}
          <Route path="/quick/*" element={<Navigate to="/food/user" replace />} />
          <Route path="/quick-commerce/*" element={<Navigate to="/food/user" replace />} />
          <Route path="/qc/*" element={<Navigate to="/food/user" replace />} />
          <Route path="/porter/*" element={<Navigate to="/food/user" replace />} />

          {/* Dynamic intercept redirects for bare paths (accessed programmatically) */}
          <Route path="/user/*" element={<RedirectToFood />} />
          <Route path="/restaurant/*" element={<RedirectToFood />} />
          <Route path="/delivery/*" element={<RedirectToFood />} />
          <Route path="/usermain/*" element={<RedirectToFood />} />
          <Route path="/orders/*" element={<RedirectToFood />} />
        </Route>

        {/* Global Admin Portal - wrap lazy router in Suspense to avoid blank/crash on direct admin URLs */}
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminRouter />
            </Suspense>
          }
        />
        
        {/* Fallback 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
  )
}

const PageLoader = () => <RouteAwarePageLoader />

export default AppRoutes
