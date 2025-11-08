import { EmailCard, Stats, ReviewDecision } from './types';

const API_BASE_URL = 'http://localhost:8000';

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(error.error || `HTTP ${response.status}`, response.status);
  }

  return response.json();
}

export async function getNextBatch(batchSize: number = 20): Promise<{
  emails: EmailCard[];
  total_remaining: number;
}> {
  return fetchApi(`/api/emails/next-batch?batch_size=${batchSize}`);
}

export async function submitReview(decision: ReviewDecision): Promise<{
  status: string;
  remaining: number;
}> {
  return fetchApi('/api/emails/review', {
    method: 'POST',
    body: JSON.stringify(decision),
  });
}

export async function getStats(): Promise<Stats> {
  return fetchApi('/api/stats');
}

export async function undoLastReview(): Promise<{
  status: string;
  undone_email_id: string;
}> {
  return fetchApi('/api/emails/undo', {
    method: 'POST',
  });
}

export async function searchEmails(query: string, reviewed?: boolean): Promise<{
  results: EmailCard[];
  count: number;
}> {
  const params = new URLSearchParams({ q: query });
  if (reviewed !== undefined) {
    params.append('reviewed', String(reviewed));
  }
  return fetchApi(`/api/emails/search?${params}`);
}

export async function checkHealth(): Promise<{
  status: string;
  timestamp: string;
}> {
  return fetchApi('/api/health');
}
