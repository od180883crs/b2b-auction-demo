import { getSessionProfile } from "@/lib/supabase/server";
import { JoinClient } from "./JoinClient";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { user } = await getSessionProfile();
  return <JoinClient token={token} loggedIn={!!user} />;
}
