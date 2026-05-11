import "server-only";

import { z } from "zod";

import { gauntletModel } from "@/lib/ai/client";
import { normalizeQuestionPool } from "@/lib/ai/question-normalize";
import { safeGenerateObject } from "@/lib/ai/structured";
import { ROOM_QUESTION_COUNT } from "@/lib/realtime/constants";
import {
  getAnonServerSupabase,
  getServerSupabase,
} from "@/lib/supabase/server";
import type {
  Json,
  StudyRoomMemberRow,
  StudyRoomRow,
} from "@/lib/supabase/types";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // unambiguous
const ROOM_CODE_LENGTH = 6;

/**
 * Generate a 6-char unambiguous room code (no I/O/0/1). Repeats up to 5 times
 * on collision before throwing — at 32^6 = ~1B keyspace, collision is mostly
 * theoretical, but we still guard.
 */
export async function generateUniqueRoomCode(): Promise<string> {
  const supabase = getAnonServerSupabase();
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET.charAt(
        Math.floor(Math.random() * ROOM_CODE_ALPHABET.length),
      );
    }
    const { data } = await supabase
      .from("study_rooms")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error("Could not allocate a unique room code (5 collisions)");
}

export async function fetchRoomByCode(code: string): Promise<StudyRoomRow | null> {
  const supabase = getAnonServerSupabase();
  const { data } = await supabase
    .from("study_rooms")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  return data ?? null;
}

export async function fetchRoomById(id: string): Promise<StudyRoomRow | null> {
  const supabase = getAnonServerSupabase();
  const { data } = await supabase
    .from("study_rooms")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

export async function fetchRoomMembers(
  roomId: string,
): Promise<StudyRoomMemberRow[]> {
  const supabase = getAnonServerSupabase();
  const { data } = await supabase
    .from("study_room_members")
    .select("*")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  return data ?? [];
}

/**
 * Generate canonical room quiz questions from a lecture/slide text. Mirrors
 * the structure of {@link generateGauntlet} but always returns
 * {@link ROOM_QUESTION_COUNT} questions.
 */
const RoomQuestionSchema = z.object({
  q: z.string(),
  choices: z.array(z.string()).length(4),
  correct_index: z.number().int().min(0).max(3),
  gotcha: z.string(),
});
const RoomPoolSchema = z.object({
  questions: z.array(RoomQuestionSchema).length(ROOM_QUESTION_COUNT),
});

const RelaxedRoomQuestionSchema = z.object({
  q: z.string(),
  choices: z.array(z.string()).min(2).max(8),
  correct_index: z.number().int().min(0).max(7),
  gotcha: z.string(),
});
const RelaxedRoomPoolSchema = z.object({
  questions: z.array(RelaxedRoomQuestionSchema).min(1).max(12),
});

export type RoomQuestion = z.infer<typeof RoomQuestionSchema>;

export async function generateRoomQuestions(
  source: string,
): Promise<RoomQuestion[]> {
  const system = `You are writing a ${ROOM_QUESTION_COUNT}-question MCQ quiz for a small study room of friends going through the same lecture together.

Rules:
1. Each question tests a meaningfully different idea from the source.
2. Mix difficulty: roughly easy → hard.
3. Distractors must be plausible (cover common misconceptions).
4. NEVER use "all of the above", double negatives, or trick wording.
5. Keep stems concise.

JSON SHAPE:
{
  "questions": [
    { "q": "string", "choices": ["string","string","string","string"],
      "correct_index": 0|1|2|3, "gotcha": "string" }
  ]  // exactly ${ROOM_QUESTION_COUNT} items
}`;
  const prompt = [`Lecture / slide source text:`, source.trim()].join("\n");
  try {
    const object = await safeGenerateObject({
      model: gauntletModel,
      schema: RoomPoolSchema,
      system,
      prompt,
      temperature: 0.4,
    });
    return object.questions;
  } catch {
    console.warn("[rooms] strict schema failed; repairing with relaxed parse");
    const relaxed = await safeGenerateObject({
      model: gauntletModel,
      schema: RelaxedRoomPoolSchema,
      system: `${system}

CRITICAL: Exactly 4 choices per question.`,
      prompt,
      temperature: 0.4,
    });
    return normalizeQuestionPool(
      relaxed.questions,
      ROOM_QUESTION_COUNT,
      4,
    ) as RoomQuestion[];
  }
}

/**
 * Server-side answer grading + atomic member update. Increments correct_count
 * and bumps current_q. If the member crosses the room's pass_threshold, we
 * stamp finished_at and assign their finish_position based on existing
 * finishers.
 */
export async function gradeRoomAnswer(opts: {
  roomId: string;
  userId: string;
  questionIndex: number;
  choice: number;
}): Promise<{
  isCorrect: boolean;
  correct_index: number;
  finished: boolean;
  finish_position: number | null;
  correct_count: number;
}> {
  const supabase = await getServerSupabase();

  // Use a single SELECT to fetch the room (questions + threshold) and the
  // member row.
  const [{ data: room }, { data: member }] = await Promise.all([
    supabase.from("study_rooms").select("*").eq("id", opts.roomId).maybeSingle(),
    supabase
      .from("study_room_members")
      .select("*")
      .eq("room_id", opts.roomId)
      .eq("user_id", opts.userId)
      .maybeSingle(),
  ]);
  if (!room) throw new Error("Room not found");
  if (room.state !== "QUIZ") throw new Error("Room is not in QUIZ state");
  if (!member) throw new Error("You are not a member of this room");
  if (member.finished_at) {
    throw new Error("You already finished this room");
  }

  const questions = room.questions as unknown as RoomQuestion[] | null;
  if (!questions) throw new Error("Room has no questions yet");
  if (opts.questionIndex !== member.current_q) {
    throw new Error(
      `Wrong question index (expected ${member.current_q}, got ${opts.questionIndex})`,
    );
  }
  const q = questions[opts.questionIndex];
  if (!q) throw new Error("Question index out of range");

  const isCorrect = opts.choice === q.correct_index;
  const newCorrect = member.correct_count + (isCorrect ? 1 : 0);
  const newQ = member.current_q + 1;

  // Did the member just pass?
  let finishPosition: number | null = null;
  let finishedAt: string | null = null;
  const reachedPass = newCorrect >= room.pass_threshold;
  const ranOut = newQ >= questions.length;
  if (reachedPass || ranOut) {
    const { count } = await supabase
      .from("study_room_members")
      .select("user_id", { count: "exact", head: true })
      .eq("room_id", opts.roomId)
      .not("finished_at", "is", null);
    finishPosition = (count ?? 0) + 1;
    finishedAt = new Date().toISOString();
  }

  await supabase
    .from("study_room_members")
    .update({
      correct_count: newCorrect,
      current_q: newQ,
      finished_at: finishedAt,
      finish_position: finishPosition,
    })
    .eq("room_id", opts.roomId)
    .eq("user_id", opts.userId);

  // If everyone has finished, mark the room FINISHED. (Only the host needs
  // to be able to update; we side-step RLS via the anon client's deferred
  // policy by relying on a separate "host marks done" flow if RLS rejects.
  // For now we use the same authed client and let RLS pass for the host.)
  if (finishedAt) {
    const { count: remaining } = await supabase
      .from("study_room_members")
      .select("user_id", { count: "exact", head: true })
      .eq("room_id", opts.roomId)
      .is("finished_at", null);
    if ((remaining ?? 0) === 0) {
      // Best-effort — host policy will succeed for the host; non-host writes
      // will fail under RLS but the next host action will mop up.
      await supabase
        .from("study_rooms")
        .update({ state: "FINISHED", finished_at: new Date().toISOString() })
        .eq("id", opts.roomId);
    }
  }

  return {
    isCorrect,
    correct_index: q.correct_index,
    finished: !!finishedAt,
    finish_position: finishPosition,
    correct_count: newCorrect,
  };
}

/**
 * Helper used by the host action endpoints — checks the caller is the host of
 * the room and returns it, or throws.
 */
export async function assertHost(
  roomId: string,
  callerId: string,
): Promise<StudyRoomRow> {
  const supabase = getAnonServerSupabase();
  const { data: room } = await supabase
    .from("study_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) throw new Error("Room not found");
  if (room.host_id !== callerId) {
    throw new Error("Only the host can perform this action");
  }
  return room;
}

export type RoomQuestionsJson = Json;
