import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

import { ALL_PERSONAS } from "@/lib/ai/personas";
import { fetchRoomById, fetchRoomMembers } from "@/lib/rooms/queries";
import { getAnonServerSupabase } from "@/lib/supabase/server";

import { RoomView } from "./room-view";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/rooms/" + id);
  }

  const room = await fetchRoomById(id);
  if (!room) notFound();
  const members = await fetchRoomMembers(id);

  const supabase = getAnonServerSupabase();
  const { data: profiles } = await supabase
    .from("users")
    .select("clerk_id, username, avatar_url")
    .in(
      "clerk_id",
      members.map((m) => m.user_id),
    );

  return (
    <RoomView
      initialRoom={room}
      initialMembers={members}
      profiles={profiles ?? []}
      youAreHost={room.host_id === userId}
      you={userId}
      personas={ALL_PERSONAS.map((p) => ({
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
        accentColor: p.accentColor,
        isCreator: p.isCreator,
      }))}
    />
  );
}
