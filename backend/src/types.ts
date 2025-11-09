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

export interface ReviewDecision {
  email_id: string;
  is_flight_confirmation: boolean;
  notes?: string;
}

export interface EmailCandidate {
  id: number;
  message_id: string;
  gmail_uid: string;
  subject: string;
  from_email: string;
  msg_date: string;
  preview_text: string;
  html_content: string;
  plain_text: string;
  confidence_score: number;
  detection_reasons: string;
  fetched_at: string;
  reviewed: number;
}

export interface ReviewDecisionRecord {
  id: number;
  email_candidate_id: number;
  message_id: string;
  is_flight_confirmation: number;
  reviewed_at: string;
  notes?: string;
}

export interface ConfirmedFlight {
  id: number;
  message_id: string;
  gmail_uid: string;
  subject: string;
  forwarded_to_tripit: number;
  forwarded_at?: string;
  parse_status?: string;
  tripit_trip_id?: string;
  created_at: string;
}

export interface EmailData {
  html: string;
  from_email: string;
  subject: string;
  plain_text?: string;
  message_id: string;
  date: string;
}

export interface ConfidenceResult {
  score: number;
  reasons: string[];
}

export interface Stats {
  total_candidates: number;
  reviewed: number;
  unreviewed: number;
  confirmed_flights: number;
  rejected: number;
  review_rate: number;
}
