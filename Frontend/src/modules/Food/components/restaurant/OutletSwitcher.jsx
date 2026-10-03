import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { restaurantAPI } from "@food/api";
import { setAuthData } from "@food/utils/auth";
import {
  getRestaurantOrdersScope,
  setRestaurantOrdersScope,
} from "@food/utils/restaurantOrdersScope";

export default function OutletSwitcher() {
  const [outlets, setOutlets] = useState([]);
  const [activeOutletId, setActiveOutletId] = useState("");
  const [scope, setScope] = useState(getRestaurantOrdersScope());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    restaurantAPI
      .listOutlets()
      .then((res) => {
        if (cancelled) return;
        setOutlets(res?.data?.data?.outlets || []);
        setActiveOutletId(res?.data?.data?.activeOutletId || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const applySession = (session) => {
    if (!session?.accessToken) throw new Error("Could not switch outlet");
    setAuthData("restaurant", session.accessToken, session.user, session.refreshToken);
    window.location.reload();
  };

  const handleSwitch = async (outletId) => {
    if (!outletId || outletId === activeOutletId || busy) return;
    try {
      setBusy(true);
      const res = await restaurantAPI.switchOutlet(outletId);
      applySession(res?.data?.data);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || "Could not switch outlet");
      setBusy(false);
    }
  };

  const handleScopeChange = (nextScope) => {
    setRestaurantOrdersScope(nextScope);
    setScope(nextScope);
    window.location.reload();
  };

  const handleAddOutlet = async () => {
    const name = window.prompt("New outlet name");
    if (!name || !name.trim() || busy) return;
    try {
      setBusy(true);
      const res = await restaurantAPI.addOutlet(name.trim());
      const newOutletId = res?.data?.data?.outlet?.id;
      if (!newOutletId) throw new Error("Could not create outlet");
      toast.success("Outlet created. Complete its onboarding.");
      await handleSwitch(newOutletId);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || "Could not add outlet");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-white border-b border-slate-200 text-sm">
      {outlets.length > 1 && (
        <select
          value={activeOutletId}
          onChange={(e) => handleSwitch(e.target.value)}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-800"
          aria-label="Select outlet"
        >
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.restaurantName}
              {o.status !== "approved" ? ` (${o.status})` : ""}
            </option>
          ))}
        </select>
      )}

      {outlets.length > 1 && (
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
          <button
            type="button"
            onClick={() => handleScopeChange("outlet")}
            className={`px-3 py-1 ${scope === "outlet" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
          >
            This outlet
          </button>
          <button
            type="button"
            onClick={() => handleScopeChange("all")}
            className={`px-3 py-1 ${scope === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
          >
            All outlets
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={handleAddOutlet}
        disabled={busy}
        className="ml-auto rounded-lg bg-[#32C45A] px-3 py-1 font-semibold text-white disabled:opacity-50"
      >
        + Add outlet
      </button>
    </div>
  );
}
