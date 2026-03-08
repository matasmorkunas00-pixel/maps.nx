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

  const sendMagicLink = useCallback(async (email) => {
    if (!supabase) throw new Error("Supabase is not configured");

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) throw new Error("Enter your email address");

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
    return normalizedEmail;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return {
    isConfigured: SUPABASE_CONFIGURED,
    isReady,
    session,
    user: session?.user ?? null,
    userEmail: session?.user?.email ?? null,
    sendMagicLink,
    signOut,
  };
}
