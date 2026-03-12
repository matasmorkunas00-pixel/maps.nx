import { useCallback, useEffect, useState } from "react";
import { SUPABASE_CONFIGURED, supabase } from "../utils/supabase";

export function useSupabaseAuth() {
  const [session, setSession] = useState(null);
  const [isReady, setIsReady] = useState(!SUPABASE_CONFIGURED);

  useEffect(() => {
    if (!supabase) return undefined;

    let isActive = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isActive) return;
      if (error) {
        console.error("Failed to restore Supabase session:", error);
      }
      setSession(data?.session ?? null);
      setIsReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setIsReady(true);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const user = session?.user ?? null;

  return {
    isConfigured: SUPABASE_CONFIGURED,
    isReady,
    session,
    user,
    userEmail: user?.email ?? null,
    userName: user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? null,
    userAvatarUrl: user?.user_metadata?.avatar_url ?? null,
    signInWithGoogle,
    signOut,
  };
}
