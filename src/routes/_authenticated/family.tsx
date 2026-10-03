import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Crown, LogOut, RefreshCw, UserMinus, Users, UserPlus, Home, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHousehold, rpc, memberName } from "@/lib/household";
import { MemberAvatar } from "@/components/member-avatar";

export const Route = createFileRoute("/_authenticated/family")({
  validateSearch: (s: Record<string, unknown>): { code?: string } => ({
    code: typeof s.code === "string" ? s.code : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Family — FreshTrack" },
      { name: "description", content: "Share a kitchen inventory with your household." },
    ],
  }),
  component: FamilyPage,
});

function useAction(fn: () => Promise<unknown>, success: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(success);
      qc.invalidateQueries({ queryKey: ["household"] });
      qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Something went wrong"),
  });
}

function FamilyPage() {
  const hq = useHousehold();
  const { code } = Route.useSearch();
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  return (
    <div className="px-5 pt-12">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
        Family plan
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Household</h1>
      {hq.isLoading ? (
        <div className="mt-8 h-40 rounded-3xl bg-muted animate-pulse" />
      ) : hq.data ? (
        <Dashboard me={me} />
      ) : (
        <Setup initialCode={code} />
      )}
    </div>
  );
}

function Setup({ initialCode }: { initialCode?: string }) {
  const [mode, setMode] = useState<"choose" | "create" | "join">(initialCode ? "join" : "choose");
  const [name, setName] = useState("");
  const [code, setCode] = useState((initialCode ?? "").toUpperCase());
  const create = useAction(() => rpc("create_household", { _name: name }), "Family created — you're the owner");
  const join = useAction(() => rpc("join_household", { _code: code }), "Welcome to the family!");

  if (mode === "choose")
    return (
      <div className="mt-6 space-y-3">
        <div className="rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-6">
          <Users className="size-8" />
          <h2 className="mt-3 text-lg font-semibold">Track food together</h2>
          <p className="text-sm opacity-90 mt-1">
            Share one inventory with your household so nobody buys duplicates or lets food go to waste.
          </p>
        </div>
        <ChoiceButton icon={Home} title="Create Family Group" desc="Start a household and invite others" onClick={() => setMode("create")} />
        <ChoiceButton icon={UserPlus} title="Join Existing Family" desc="Use a 6-character invite code" onClick={() => setMode("join")} />
      </div>
    );

  return (
    <div className="mt-6 bg-surface rounded-3xl p-5 ring-1 ring-black/5">
      {mode === "create" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <h2 className="font-semibold">Create Family Group</h2>
          <label className="block mt-4 text-xs font-medium text-muted-foreground">Family Name</label>
          <input
            autoFocus
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Smith Household"
            className="mt-1 w-full h-11 px-4 rounded-2xl bg-background ring-1 ring-border text-sm"
          />
          <button
            disabled={!name.trim() || create.isPending}
            className="mt-4 w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
          >
            {create.isPending ? "Creating…" : "Create Family"}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) join.mutate();
          }}
        >
          <h2 className="font-semibold">Join Existing Family</h2>
          <label className="block mt-4 text-xs font-medium text-muted-foreground">Invite Code</label>
          <input
            autoFocus
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="ABC123"
            className="mt-1 w-full h-14 px-4 rounded-2xl bg-background ring-1 ring-border text-center text-2xl font-mono tracking-[0.4em]"
          />
          <button
            disabled={code.length !== 6 || join.isPending}
            className="mt-4 w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
          >
            {join.isPending ? "Joining…" : "Join Household"}
          </button>
        </form>
      )}
      <button onClick={() => setMode("choose")} className="mt-3 w-full text-sm text-muted-foreground">
        Back
      </button>
    </div>
  );
}

function ChoiceButton({ icon: Icon, title, desc, onClick }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 bg-surface rounded-2xl p-4 ring-1 ring-black/5 text-left active:scale-[0.99] transition-transform"
    >
      <span className="size-11 rounded-xl bg-primary-soft text-primary grid place-items-center">
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block font-semibold text-sm">{title}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </button>
  );
}

function Dashboard({ me }: { me: string | null }) {
  const h = useHousehold().data!;
  const isOwner = h.owner_id === me;
  const [rename, setRename] = useState(h.name);
  const regen = useAction(() => rpc("regenerate_invite_code"), "New invite code generated");
  const leave = useAction(() => rpc("leave_household"), "You left the family");
  const save = useAction(() => rpc("rename_household", { _name: rename }), "Family name updated");
  const removeM = useMutationFor("remove_household_member", "Member removed");
  const transferM = useMutationFor("transfer_household_ownership", "Ownership transferred");

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error("Couldn't copy");
    }
  };
  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/family?code=${h.invite_code}`;

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-5">
        {isOwner ? (
          <div className="flex gap-2">
            <input
              value={rename}
              maxLength={60}
              onChange={(e) => setRename(e.target.value)}
              className="flex-1 bg-transparent text-xl font-semibold outline-none border-b border-primary-foreground/30"
            />
            {rename.trim() && rename !== h.name && (
              <button onClick={() => save.mutate()} className="text-sm font-semibold underline">
                Save
              </button>
            )}
          </div>
        ) : (
          <h2 className="text-xl font-semibold">{h.name}</h2>
        )}
        <p className="text-sm opacity-90 mt-1">{h.members.length} member{h.members.length > 1 ? "s" : ""}</p>
        <div className="mt-4 rounded-2xl bg-primary-foreground/15 p-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-80">Invite code</p>
            <p className="font-mono text-2xl font-semibold tracking-[0.3em]">{h.invite_code}</p>
          </div>
          <div className="flex gap-2">
            <IconBtn label="Copy code" onClick={() => copy(h.invite_code, "Invite code copied")}><Copy className="size-4" /></IconBtn>
            <IconBtn label="Copy link" onClick={() => copy(link, "Invite link copied")}><Link2 className="size-4" /></IconBtn>
            {isOwner && (
              <IconBtn label="Regenerate code" onClick={() => regen.mutate()}>
                <RefreshCw className={`size-4 ${regen.isPending ? "animate-spin" : ""}`} />
              </IconBtn>
            )}
          </div>
        </div>
      </div>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Members</h3>
        <div className="mt-3 bg-surface rounded-2xl ring-1 ring-black/5 divide-y divide-border">
          {h.members.map((m) => {
            const nm = m.user_id === me ? `${memberName(m)} (you)` : memberName(m);
            return (
              <div key={m.user_id} className="flex items-center gap-3 p-4">
                <MemberAvatar name={memberName(m)} url={m.avatar_url} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{nm}</p>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${m.role === "owner" ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {m.role === "owner" && <Crown className="size-3" />} {m.role}
                  </span>
                </div>
                {isOwner && m.user_id !== me && (
                  <div className="flex gap-1">
                    <button
                      aria-label="Make owner"
                      onClick={() => confirm(`Make ${memberName(m)} the owner?`) && transferM.mutate(m.user_id)}
                      className="size-9 rounded-full grid place-items-center bg-muted text-foreground"
                    >
                      <Crown className="size-4" />
                    </button>
                    <button
                      aria-label="Remove member"
                      onClick={() => confirm(`Remove ${memberName(m)} from the family?`) && removeM.mutate(m.user_id)}
                      className="size-9 rounded-full grid place-items-center bg-destructive/10 text-destructive"
                    >
                      <UserMinus className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <button
        onClick={() => {
          if (isOwner && h.members.length > 1) {
            toast.error("Transfer ownership to another member before leaving");
            return;
          }
          if (confirm("Leave this family? Your shared items will move back to your personal list.")) leave.mutate();
        }}
        className="w-full h-12 rounded-2xl ring-1 ring-destructive/30 text-destructive font-semibold flex items-center justify-center gap-2"
      >
        <LogOut className="size-4" /> Leave Family
      </button>
    </div>
  );
}

function useMutationFor(name: string, success: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => rpc(name, { _user_id: userId }),
    onSuccess: () => {
      toast.success(success);
      qc.invalidateQueries({ queryKey: ["household"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Something went wrong"),
  });
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="size-9 rounded-full bg-primary-foreground/20 grid place-items-center active:scale-95 transition-transform"
    >
      {children}
    </button>
  );
}
