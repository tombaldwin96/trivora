/** Generated types matching Supabase migrations - keep in sync with schema */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type QuizType = 'daily' | 'live' | 'tournament' | 'practice' | 'arena' | 'coop' | 'async_challenge';
export type MatchStatus = 'pending' | 'in_progress' | 'completed' | 'abandoned';
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'declined';
export type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';
export type LiveSessionStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          country: string | null;
          cosmetics_json: Json | null;
          level: number;
          xp: number;
          is_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          status: string;
          provider: string;
          entitlement: string | null;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['subscriptions']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>;
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['categories']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
      };
      questions: {
        Row: {
          id: string;
          category_id: string;
          prompt: string;
          answers_json: Json;
          correct_index: number;
          explanation: string | null;
          difficulty: number;
          media_url: string | null;
          time_limit_ms: number;
          is_active: boolean;
          sub_category: string | null;
          language: string | null;
          appeal: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['questions']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['questions']['Insert']>;
      };
      quizzes: {
        Row: {
          id: string;
          type: QuizType;
          title: string;
          description: string | null;
          scheduled_at: string | null;
          published_at: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['quizzes']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['quizzes']['Insert']>;
      };
      quiz_questions: {
        Row: {
          id: string;
          quiz_id: string;
          question_id: string;
          order_index: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['quiz_questions']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['quiz_questions']['Insert']>;
      };
      attempts: {
        Row: {
          id: string;
          user_id: string;
          quiz_id: string;
          mode: string;
          started_at: string;
          ended_at: string | null;
          score_total: number;
          detail_json: Json | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['attempts']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['attempts']['Insert']>;
      };
      seasons: {
        Row: {
          id: string;
          mode: string;
          division: number;
          season_number: number;
          starts_at: string;
          ends_at: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['seasons']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['seasons']['Insert']>;
      };
      matches_1v1: {
        Row: {
          id: string;
          season_id: string;
          division: number;
          status: MatchStatus;
          player_a: string;
          player_b: string;
          started_at: string | null;
          ended_at: string | null;
          result: Json | null;
          points_a: number;
          points_b: number;
          mmr_delta_json: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['matches_1v1']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['matches_1v1']['Insert']>;
      };
      match_rounds: {
        Row: {
          id: string;
          match_id: string;
          question_id: string;
          a_answer: number | null;
          b_answer: number | null;
          a_time_ms: number | null;
          b_time_ms: number | null;
          a_correct: boolean | null;
          b_correct: boolean | null;
          round_score_json: Json | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['match_rounds']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['match_rounds']['Insert']>;
      };
      standings: {
        Row: {
          id: string;
          user_id: string;
          division: number;
          season_id: string;
          points: number;
          games_played: number;
          wins: number;
          draws: number;
          losses: number;
          promoted: boolean;
          relegated: boolean;
          mmr: number;
          updated_at: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['standings']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['standings']['Insert']>;
      };
      invites: {
        Row: {
          id: string;
          from_user: string;
          to_user: string | null;
          channel: string;
          deep_link_code: string;
          mode: string;
          status: InviteStatus;
          created_at: string;
          accepted_at: string | null;
          match_id: string | null;
        };
        Insert: Omit<Database['public']['Tables']['invites']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['invites']['Insert']>;
      };
      teams: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['teams']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['teams']['Insert']>;
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          role: string;
          joined_at: string;
        };
        Insert: Omit<Database['public']['Tables']['team_members']['Row'], 'id' | 'joined_at'> & {
          id?: string;
          joined_at?: string;
        };
        Update: Partial<Database['public']['Tables']['team_members']['Insert']>;
      };
      tournaments: {
        Row: {
          id: string;
          title: string;
          rules_json: Json | null;
          starts_at: string;
          ends_at: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['tournaments']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tournaments']['Insert']>;
      };
      tournament_entries: {
        Row: {
          id: string;
          tournament_id: string;
          user_id: string | null;
          team_id: string | null;
          status: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['tournament_entries']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tournament_entries']['Insert']>;
      };
      live_sessions: {
        Row: {
          id: string;
          quiz_id: string;
          stream_provider: string;
          stream_key_encrypted: string | null;
          playback_url: string | null;
          status: LiveSessionStatus;
          started_at: string | null;
          ended_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['live_sessions']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['live_sessions']['Insert']>;
      };
      live_answers: {
        Row: {
          id: string;
          session_id: string;
          question_id: string;
          user_id: string;
          answer_index: number;
          time_ms: number;
          is_correct: boolean;
          score: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['live_answers']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['live_answers']['Insert']>;
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          target_type: string;
          target_id: string;
          reason: string;
          notes: string | null;
          status: ReportStatus;
          created_at: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['reports']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['reports']['Insert']>;
      };
      audit_logs: {
        Row: {
          id: string;
          admin_id: string;
          action: string;
          entity_type: string;
          entity_id: string | null;
          meta_json: Json | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>;
      };
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          platform: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['push_tokens']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['push_tokens']['Insert']>;
      };
      analytics_events: {
        Row: {
          id: string;
          name: string;
          properties: Json | null;
          user_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['analytics_events']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['analytics_events']['Insert']>;
      };
      leaderboard_daily: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          score: number;
          rank: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['leaderboard_daily']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['leaderboard_daily']['Insert']>;
      };
      friends: {
        Row: {
          id: string;
          user_id: string;
          friend_id: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['friends']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['friends']['Insert']>;
      };
    };
    Enums: {
      quiz_type: QuizType;
      match_status: MatchStatus;
      invite_status: InviteStatus;
      report_status: ReportStatus;
      live_session_status: LiveSessionStatus;
    };
  };
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Enums = Database['public']['Enums'];
