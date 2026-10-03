import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFoodItems } from "@/lib/items.functions";
import { FoodCard } from "@/components/food-card";
import { computeStatus, itemValue, formatRM, type FoodStatus } from "@/lib/food-utils";
import { useState, useMemo } from "react";
import { Search, Wallet, User, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useHousehold, memberName } from "@/lib/household";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory — FreshTrack" }] }),
  component: Inventory,
});

const FILTERS: { label: string; value: "all" | FoodStatus }[] = [
  { label: "All", value: "all" },
  { label: "Fresh", value: "fresh" },
  { label: "Expiring", value: "expiring_soon" },
  { label: "Expired", value: "expired" },
  { label: "Consumed", value: "consumed" },
];

function Inventory() {
  const fetchItems = useServerFn(listFoodItems);
  const itemsQ = useSuspenseQuery({
    queryKey: ["items"],
    queryFn: () => fetchItems(),
  });
  const [filter, setFilter] = useState<"all" | FoodStatus>("all");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"personal" | "family">("personal");
  const hh = useHousehold().data;
  const me = itemsQ.data.userId;
  const byId = new Map((hh?.members ?? []).map((m) => [m.user_id, m]));
  const who = (uid?: string | null) => {
    if (!uid) return undefined;
    const m = byId.get(uid);
    return { name: uid === me ? "You" : memberName(m), url: m?.avatar_url };
  };

  const items = useMemo(
    () =>
      itemsQ.data.items.map((i) => ({
        ...i,
        status: computeStatus(i.expiry_date, i.status === "consumed"),
      })),
    [itemsQ.data.items],
  );

  const filtered = items.filter((i) => {
    if (scope === "personal" ? i.household_id || i.user_id !== me : !i.household_id) return false;
    if (filter !== "all" && i.status !== filter) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const totalValue = filtered
    .filter((i) => i.status !== "consumed" && i.status !== "expired")
    .reduce((s, i) => s + itemValue(i), 0);

  return (
    <div className="px-5 pt-12">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
            {items.length} items
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold flex items-center justify-end gap-1">
            <Wallet className="size-3" /> On hand
          </p>
          <p className="text-base font-semibold tabular-nums">{formatRM(totalValue)}</p>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 p-1 rounded-2xl bg-muted">
        {([["personal", "My Personal Items", User], ["family", "Family Inventory", Users]] as const).map(([v, l, Ic]) => (
          <button
            key={v}
            onClick={() => setScope(v)}
            className={`h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${scope === v ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground"}`}
          >
            <Ic className="size-3.5" /> {l}
          </button>
        ))}
      </div>
      {scope === "family" && !hh && (
        <Link to="/family" className="mt-3 block text-center text-sm bg-primary-soft text-primary rounded-2xl p-3 font-medium">
          You're not in a family yet — create or join one →
        </Link>
      )}

      <div className="mt-4 relative">
        <Search className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your kitchen…"
          className="w-full h-11 pl-11 pr-4 rounded-2xl bg-surface ring-1 ring-border text-sm"
        />
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto -mx-5 px-5 no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`flex-none h-9 px-3.5 rounded-full text-sm font-medium ring-1 transition-colors ${
              filter === f.value
                ? "bg-primary text-primary-foreground ring-primary"
                : "bg-surface text-foreground ring-border"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            No items match.
          </p>
        ) : (
          filtered.map((i) => (
            <FoodCard key={i.id} item={i} addedBy={scope === "family" ? who(i.updated_by ?? i.user_id) : undefined} />
          ))
        )}
      </div>
    </div>
  );
}
