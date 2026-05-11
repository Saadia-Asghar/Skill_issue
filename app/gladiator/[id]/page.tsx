import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

import { fetchGladiatorMatch } from "@/lib/gladiator/queries";

import { GladiatorMatchView } from "./match-view";

export const dynamic = "force-dynamic";

export default async function GladiatorMatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) notFound();

  const { id } = await params;
  const match = await fetchGladiatorMatch(id);
  if (!match) notFound();
  if (![match.player_one_id, match.player_two_id].includes(userId)) notFound();

  return <GladiatorMatchView initialMatch={match} userId={userId} />;
}
