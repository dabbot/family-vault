import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  inbound_alias: string | null;
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isFamilyMember, setIsFamilyMember] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) {
        setProfile(null);
        setIsAdmin(false);
        setIsFamilyMember(false);
        setLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (!data.session?.user) setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    (async () => {
      const [p, r, fm] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url, inbound_alias").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        user.email
          ? supabase.from("family_members").select("email").ilike("email", user.email).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setProfile(p.data as Profile | null);
      const admin = (r.data ?? []).some((x: { role: string }) => x.role === "admin");
      setIsAdmin(admin);
      setIsFamilyMember(admin || !!fm.data);
      setLoading(false);
    })();
  }, [user]);

  return { session, user, profile, isAdmin, isFamilyMember, loading };
}
