import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/bottom-nav";
import { useSupermarketWatch } from "@/hooks/use-supermarket-watch";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
 beforeLoad: async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.user) throw redirect({ to: "/auth" });
    return { user: session.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  useSupermarketWatch();
  return (
    <div className="app-shell pb-28">
      <Outlet />
      <BottomNav />
    </div>
  );
}

