import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Plus, Store } from "lucide-react";
import { restaurantAPI } from "@food/api";
import { setAuthData } from "@food/utils/auth";
import { Button } from "@food/components/ui/button";
import { Input } from "@food/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@food/components/ui/dialog";
import {
  cacheOutletNames,
  getRestaurantOrdersScope,
  setRestaurantOrdersScope,
} from "@food/utils/restaurantOrdersScope";

export default function OutletSwitcher() {
  const [outlets, setOutlets] = useState([]);
  const [activeOutletId, setActiveOutletId] = useState("");
  const [scope, setScope] = useState(getRestaurantOrdersScope());
  const [busy, setBusy] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newOutletName, setNewOutletName] = useState("");

  useEffect(() => {
    let cancelled = false;
    restaurantAPI
      .listOutlets()
      .then((res) => {
        if (cancelled) return;
        const list = res?.data?.data?.outlets || [];
        setOutlets(list);
        cacheOutletNames(list);
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
    const name = newOutletName.trim();
    if (!name || busy) return;
    try {
      setBusy(true);
      const res = await restaurantAPI.addOutlet(name);
      const created = res?.data?.data;
      if (!created?.outlet?.id || !created?.registrationToken) {
        throw new Error("Could not create outlet");
      }
      const session = await restaurantAPI.switchOutlet(created.outlet.id);
      const sessionData = session?.data?.data;
      if (!sessionData?.accessToken) throw new Error("Could not open the new outlet");
      setAuthData("restaurant", sessionData.accessToken, sessionData.user, sessionData.refreshToken);
      // Onboarding for the new outlet authenticates with the outlet-scoped registration token.
      sessionStorage.setItem("restaurant_registrationToken", created.registrationToken);
      toast.success("Outlet created. Complete its onboarding.");
      window.location.href = "/food/restaurant/onboarding?step=2";
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

      <Button
        type="button"
        size="sm"
        onClick={() => {
          setNewOutletName("");
          setShowAddDialog(true);
        }}
        disabled={busy}
        className="ml-auto bg-[#32C45A] hover:bg-[#28A047] text-white gap-1.5"
      >
        <Plus className="w-4 h-4" />
        Add outlet
      </Button>

      <Dialog open={showAddDialog} onOpenChange={(open) => !busy && setShowAddDialog(open)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="mx-auto sm:mx-0 mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-[#32C45A]/10 text-[#32C45A]">
              <Store className="h-5 w-5" />
            </div>
            <DialogTitle>Add a new outlet</DialogTitle>
            <DialogDescription>
              Your existing restaurant details, PAN and bank account carry over automatically.
              You'll only need to fill in this outlet's own location, menu and documents.
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            value={newOutletName}
            onChange={(e) => setNewOutletName(e.target.value)}
            placeholder="Outlet name (e.g. Sweet Jain - Andheri)"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddOutlet();
            }}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddOutlet}
              disabled={busy || !newOutletName.trim()}
              className="bg-[#32C45A] hover:bg-[#28A047] text-white"
            >
              {busy ? "Creating..." : "Create outlet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
