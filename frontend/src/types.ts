export interface EmailCard {
  id: string;
  subject: string;
  from_email: string;
  date: string;
  preview_text: string;
  html_content?: string;
  confidence_score: number;
  highlights: string[];
}

export interface Stats {
  total_candidates: number;
  reviewed: number;
  unreviewed: number;
  confirmed_flights: number;
  rejected: number;
  review_rate: number;
}

export interface ReviewDecision {
  email_id: string;
  is_flight_confirmation: boolean;
  notes?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
