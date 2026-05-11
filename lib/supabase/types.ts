export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      blitz_answers: {
        Row: {
          answered_at: string
          choice: number
          is_correct: boolean
          match_id: string
          question_index: number
          user_id: string
        }
        Insert: {
          answered_at?: string
          choice: number
          is_correct: boolean
          match_id: string
          question_index: number
          user_id: string
        }
        Update: {
          answered_at?: string
          choice?: number
          is_correct?: boolean
          match_id?: string
          question_index?: number
          user_id?: string
        }
        Relationships: []
      }
      blitz_matches: {
        Row: {
          blitz_started_at: string | null
          concept_id: string
          created_at: string
          current_q: number
          finished_at: string | null
          id: string
          persona_a: string
          persona_b: string | null
          player_a: string
          player_a_correct: number
          player_a_elo_after: number | null
          player_a_elo_before: number | null
          player_b: string | null
          player_b_correct: number
          player_b_elo_after: number | null
          player_b_elo_before: number | null
          q_started_at: string | null
          questions: Json
          state: Database["public"]["Enums"]["blitz_state"]
          study_started_at: string | null
          winner: string | null
        }
        Insert: {
          blitz_started_at?: string | null
          concept_id: string
          created_at?: string
          current_q?: number
          finished_at?: string | null
          id?: string
          persona_a: string
          persona_b?: string | null
          player_a: string
          player_a_correct?: number
          player_a_elo_after?: number | null
          player_a_elo_before?: number | null
          player_b?: string | null
          player_b_correct?: number
          player_b_elo_after?: number | null
          player_b_elo_before?: number | null
          q_started_at?: string | null
          questions: Json
          state?: Database["public"]["Enums"]["blitz_state"]
          study_started_at?: string | null
          winner?: string | null
        }
        Update: {
          blitz_started_at?: string | null
          concept_id?: string
          created_at?: string
          current_q?: number
          finished_at?: string | null
          id?: string
          persona_a?: string
          persona_b?: string | null
          player_a?: string
          player_a_correct?: number
          player_a_elo_after?: number | null
          player_a_elo_before?: number | null
          player_b?: string | null
          player_b_correct?: number
          player_b_elo_after?: number | null
          player_b_elo_before?: number | null
          q_started_at?: string | null
          questions?: Json
          state?: Database["public"]["Enums"]["blitz_state"]
          study_started_at?: string | null
          winner?: string | null
        }
        Relationships: []
      }
      blitz_queue: {
        Row: {
          joined_at: string
          persona_slug: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          persona_slug: string
          user_id: string
        }
        Update: {
          joined_at?: string
          persona_slug?: string
          user_id?: string
        }
        Relationships: []
      }
      concepts: {
        Row: {
          created_at: string
          difficulty: number
          id: string
          subject_id: string | null
          text: string
          title: string
        }
        Insert: {
          created_at?: string
          difficulty: number
          id?: string
          subject_id?: string | null
          text: string
          title: string
        }
        Update: {
          created_at?: string
          difficulty?: number
          id?: string
          subject_id?: string | null
          text?: string
          title?: string
        }
        Relationships: []
      }
      daily_drops: {
        Row: {
          concept_id: string
          created_at: string
          drop_date: string
          questions: Json
        }
        Insert: {
          concept_id: string
          created_at?: string
          drop_date: string
          questions: Json
        }
        Update: {
          concept_id?: string
          created_at?: string
          drop_date?: string
          questions?: Json
        }
        Relationships: []
      }
      flashcards: {
        Row: {
          back: string
          box: number
          concept_id: string | null
          correct_count: number
          created_at: string
          front: string
          id: string
          last_reviewed_at: string | null
          next_review_at: string
          persona_slug: string
          reviewed_count: number
          source: Database["public"]["Enums"]["flashcard_source"]
          user_id: string
        }
        Insert: {
          back: string
          box?: number
          concept_id?: string | null
          correct_count?: number
          created_at?: string
          front: string
          id?: string
          last_reviewed_at?: string | null
          next_review_at?: string
          persona_slug: string
          reviewed_count?: number
          source: Database["public"]["Enums"]["flashcard_source"]
          user_id: string
        }
        Update: {
          back?: string
          box?: number
          concept_id?: string | null
          correct_count?: number
          created_at?: string
          front?: string
          id?: string
          last_reviewed_at?: string | null
          next_review_at?: string
          persona_slug?: string
          reviewed_count?: number
          source?: Database["public"]["Enums"]["flashcard_source"]
          user_id?: string
        }
        Relationships: []
      }
      gauntlet_attempts: {
        Row: {
          concept_id: string
          correct_count: number
          created_at: string
          drop_date: string | null
          elapsed_seconds: number
          elo_after: number
          elo_before: number
          elo_delta: number
          id: string
          is_ranked: boolean
          performance: number
          persona_slug: string
          total_count: number
          user_id: string
          xp_awarded: number
        }
        Insert: {
          concept_id: string
          correct_count: number
          created_at?: string
          drop_date?: string | null
          elapsed_seconds: number
          elo_after: number
          elo_before: number
          elo_delta: number
          id?: string
          is_ranked?: boolean
          performance: number
          persona_slug: string
          total_count?: number
          user_id: string
          xp_awarded: number
        }
        Update: {
          concept_id?: string
          correct_count?: number
          created_at?: string
          drop_date?: string | null
          elapsed_seconds?: number
          elo_after?: number
          elo_before?: number
          elo_delta?: number
          id?: string
          is_ranked?: boolean
          performance?: number
          persona_slug?: string
          total_count?: number
          user_id?: string
          xp_awarded?: number
        }
        Relationships: []
      }
      learning_fingerprints: {
        Row: {
          created_at: string
          id: string
          last_updated: string
          persona_id: string
          subject_id: string
          updates_count: number
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_updated?: string
          persona_id: string
          subject_id: string
          updates_count?: number
          user_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_updated?: string
          persona_id?: string
          subject_id?: string
          updates_count?: number
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
      personas: {
        Row: {
          accent_color: string | null
          created_at: string
          id: string
          name: string
          slug: string
          system_prompt: string
          tagline: string | null
        }
        Insert: {
          accent_color?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          system_prompt: string
          tagline?: string | null
        }
        Update: {
          accent_color?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          system_prompt?: string
          tagline?: string | null
        }
        Relationships: []
      }
      radio_episodes: {
        Row: {
          audio_url: string | null
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          id: string
          script: Json | null
          source_text: string
          status: Database["public"]["Enums"]["radio_status"]
          title: string
          updated_at: string
          user_id: string
          word_count: number | null
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          script?: Json | null
          source_text: string
          status?: Database["public"]["Enums"]["radio_status"]
          title: string
          updated_at?: string
          user_id: string
          word_count?: number | null
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          script?: Json | null
          source_text?: string
          status?: Database["public"]["Enums"]["radio_status"]
          title?: string
          updated_at?: string
          user_id?: string
          word_count?: number | null
        }
        Relationships: []
      }
      study_room_members: {
        Row: {
          correct_count: number
          current_q: number
          display_name: string | null
          finish_position: number | null
          finished_at: string | null
          joined_at: string
          persona_slug: string | null
          room_id: string
          user_id: string
        }
        Insert: {
          correct_count?: number
          current_q?: number
          display_name?: string | null
          finish_position?: number | null
          finished_at?: string | null
          joined_at?: string
          persona_slug?: string | null
          room_id: string
          user_id: string
        }
        Update: {
          correct_count?: number
          current_q?: number
          display_name?: string | null
          finish_position?: number | null
          finished_at?: string | null
          joined_at?: string
          persona_slug?: string | null
          room_id?: string
          user_id?: string
        }
        Relationships: []
      }
      study_rooms: {
        Row: {
          code: string
          created_at: string
          finished_at: string | null
          host_id: string
          id: string
          pass_threshold: number
          questions: Json | null
          quiz_started_at: string | null
          source_text: string | null
          state: Database["public"]["Enums"]["study_room_state"]
          study_seconds: number
          study_started_at: string | null
          title: string
        }
        Insert: {
          code: string
          created_at?: string
          finished_at?: string | null
          host_id: string
          id?: string
          pass_threshold?: number
          questions?: Json | null
          quiz_started_at?: string | null
          source_text?: string | null
          state?: Database["public"]["Enums"]["study_room_state"]
          study_seconds?: number
          study_started_at?: string | null
          title?: string
        }
        Update: {
          code?: string
          created_at?: string
          finished_at?: string | null
          host_id?: string
          id?: string
          pass_threshold?: number
          questions?: Json | null
          quiz_started_at?: string | null
          source_text?: string | null
          state?: Database["public"]["Enums"]["study_room_state"]
          study_seconds?: number
          study_started_at?: string | null
          title?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          category: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          clerk_id: string
          created_at: string
          current_streak: number
          elo: number
          email: string | null
          last_active: string
          last_streak_date: string | null
          rank: Database["public"]["Enums"]["rank_tier"]
          updated_at: string
          username: string | null
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          clerk_id: string
          created_at?: string
          current_streak?: number
          elo?: number
          email?: string | null
          last_active?: string
          last_streak_date?: string | null
          rank?: Database["public"]["Enums"]["rank_tier"]
          updated_at?: string
          username?: string | null
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          clerk_id?: string
          created_at?: string
          current_streak?: number
          elo?: number
          email?: string | null
          last_active?: string
          last_streak_date?: string | null
          rank?: Database["public"]["Enums"]["rank_tier"]
          updated_at?: string
          username?: string | null
          xp?: number
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      advance_blitz_question: {
        Args: { p_force?: boolean; p_match_id: string }
        Returns: Database["public"]["Tables"]["blitz_matches"]["Row"]
      }
      compute_rank: {
        Args: { p_xp: number }
        Returns: Database["public"]["Enums"]["rank_tier"]
      }
      dequeue_blitz_partner: {
        Args: {
          p_concept_id: string
          p_persona_slug: string
          p_questions: Json
          p_user_id: string
        }
        Returns: string | null
      }
      record_blitz_answer: {
        Args: {
          p_choice: number
          p_match_id: string
          p_question_index: number
          p_user_id: string
        }
        Returns: Database["public"]["Tables"]["blitz_answers"]["Row"]
      }
      record_gauntlet_attempt: {
        Args: {
          p_concept_id: string
          p_correct_count: number
          p_drop_date: string | null
          p_elapsed_seconds: number
          p_elo_delta: number
          p_is_ranked: boolean
          p_new_streak: number
          p_performance: number
          p_persona_slug: string
          p_streak_date: string
          p_user_id: string
          p_xp_delta: number
        }
        Returns: Database["public"]["Tables"]["gauntlet_attempts"]["Row"]
      }
      start_blitz_phase: {
        Args: { p_match_id: string }
        Returns: Database["public"]["Tables"]["blitz_matches"]["Row"]
      }
    }
    Enums: {
      blitz_state: "WAITING" | "STUDY" | "BLITZ" | "FINISHED" | "ABANDONED"
      flashcard_source: "colosseum" | "gauntlet" | "study_room" | "blitz"
      radio_status: "pending" | "scripting" | "voicing" | "ready" | "failed"
      rank_tier:
        | "Freshman"
        | "Sophomore"
        | "Junior"
        | "Senior"
        | "Graduate"
        | "PhD"
        | "Dean"
      study_room_state: "LOBBY" | "STUDY" | "QUIZ" | "FINISHED"
    }
    CompositeTypes: Record<string, never>
  }
}

export type RankTier = Database["public"]["Enums"]["rank_tier"]
export type BlitzState = Database["public"]["Enums"]["blitz_state"]
export type StudyRoomState = Database["public"]["Enums"]["study_room_state"]
export type FlashcardSource = Database["public"]["Enums"]["flashcard_source"]
export type RadioStatus = Database["public"]["Enums"]["radio_status"]

export type UserRow = Database["public"]["Tables"]["users"]["Row"]
export type SubjectRow = Database["public"]["Tables"]["subjects"]["Row"]
export type PersonaRow = Database["public"]["Tables"]["personas"]["Row"]
export type FingerprintRow =
  Database["public"]["Tables"]["learning_fingerprints"]["Row"]
export type ConceptRow = Database["public"]["Tables"]["concepts"]["Row"]
export type DailyDropRow = Database["public"]["Tables"]["daily_drops"]["Row"]
export type GauntletAttemptRow =
  Database["public"]["Tables"]["gauntlet_attempts"]["Row"]
export type BlitzMatchRow = Database["public"]["Tables"]["blitz_matches"]["Row"]
export type BlitzAnswerRow = Database["public"]["Tables"]["blitz_answers"]["Row"]
export type BlitzQueueRow = Database["public"]["Tables"]["blitz_queue"]["Row"]
export type StudyRoomRow = Database["public"]["Tables"]["study_rooms"]["Row"]
export type StudyRoomMemberRow =
  Database["public"]["Tables"]["study_room_members"]["Row"]
export type FlashcardRow = Database["public"]["Tables"]["flashcards"]["Row"]
export type RadioEpisodeRow =
  Database["public"]["Tables"]["radio_episodes"]["Row"]
