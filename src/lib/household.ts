import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Member = {
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  display_name: string | null;
  avatar_url: string | null;
};
export type Household = {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  members: Member[];
};

export async function fetchHousehold(): Promise<Household | null> {
  const { data: hid, error: e1 } = await supabase.rpc("my_household_id");
  if (e1) throw new Error(e1.message);
  if (!hid) return null;
  const { data: h, error: e2 } = await supabase
    .from("households")
    .select("id,name,invite_code,owner_id")
    .eq("id", hid)
    .single();
  if (e2) throw new Error(e2.message);
  const { data: mem, error: e3 } = await supabase
    .from("household_members")
    .select("user_id,role,joined_at")
    .eq("household_id", hid)
    .order("joined_at");
  if (e3) throw new Error(e3.message);
  const ids = (mem ?? []).map((m) => m.user_id);
  const { data: profs } = await supabase
    .from("profiles")
    .select("id,display_name,avatar_url")
    .in("id", ids);
  const byId = new Map((profs ?? []).map((p) => [p.id, p]));
  return {
    ...h,
    members: (mem ?? []).map((m) => ({
      user_id: m.user_id,
      role: m.role as Member["role"],
      joined_at: m.joined_at,
      display_name: byId.get(m.user_id)?.display_name ?? null,
      avatar_url: byId.get(m.user_id)?.avatar_url ?? null,
    })),
  };
}

export function useHousehold() {
  return useQuery({ queryKey: ["household"], queryFn: fetchHousehold });
}

export async function rpc(name: string, args?: Record<string, unknown>) {
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export function memberName(m?: Pick<Member, "display_name"> | null) {
  return m?.display_name?.trim() || "Member";
}
