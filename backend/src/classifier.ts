import { EmailData, ConfidenceResult } from './types';

const KNOWN_AIRLINE_SENDERS = [
  'united.com',
  'delta.com',
  'aa.com',
  'southwest.com',
  'jetblue.com',
  'alaskaair.com',
  'spirit.com',
  'frontier.com',
  'allegiantair.com',
];

const KNOWN_OTA_SENDERS = [
  'expedia.com',
  'kayak.com',
  'priceline.com',
  'booking.com',
  'orbitz.com',
  'travelocity.com',
  'hotwire.com',
  'cheapoair.com',
];

const CONFIRMATION_KEYWORDS = ['confirmation', 'confirmed', 'itinerary', 'booking', 'receipt'];

const FLIGHT_KEYWORDS = ['flight', 'airline', 'boarding', 'departure', 'arrival'];

const CONFIDENCE_THRESHOLD = 30;

function hasFlightReservationSchema(html: string): boolean {
  return (
    html.includes('FlightReservation') || html.includes('schema.org/FlightReservation')
  );
}

function isKnownSender(email: string): boolean {
  const lowerEmail = email.toLowerCase();
  return (
    KNOWN_AIRLINE_SENDERS.some((domain) => lowerEmail.includes(domain)) ||
    KNOWN_OTA_SENDERS.some((domain) => lowerEmail.includes(domain))
  );
}

function hasConfirmationKeywords(subject: string): boolean {
  const lowerSubject = subject.toLowerCase();
  return CONFIRMATION_KEYWORDS.some((kw) => lowerSubject.includes(kw));
}

function hasFlightKeywords(subject: string): boolean {
  const lowerSubject = subject.toLowerCase();
  return FLIGHT_KEYWORDS.some((kw) => lowerSubject.includes(kw));
}

function detectFlightMarkers(text: string): string[] {
  const markers: string[] = [];

  // Confirmation code pattern (6 alphanumeric characters)
  if (/\b[A-Z0-9]{6}\b/.test(text)) {
    markers.push('confirmation code');
  }

  // Flight number pattern (e.g., AA123, DL4567)
  if (/\b[A-Z]{2}\d{1,4}\b/.test(text)) {
    markers.push('flight number');
  }

  // Airport code pattern (3 uppercase letters)
  if (/\b[A-Z]{3}\b/.test(text)) {
    markers.push('airport code');
  }

  return markers;
}

export function calculateConfidenceScore(emailData: EmailData): ConfidenceResult {
  let score = 0;
  const reasons: string[] = [];

  // Schema.org FlightReservation (highest confidence)
  if (hasFlightReservationSchema(emailData.html)) {
    score += 50;
    reasons.push('Has FlightReservation schema markup');
  }

  // Airline/OTA sender domain
  if (isKnownSender(emailData.from_email)) {
    score += 20;
    reasons.push('Known airline/OTA sender');
  }

  // Subject line patterns
  if (hasConfirmationKeywords(emailData.subject)) {
    score += 15;
    reasons.push('Confirmation keyword in subject');
  }

  if (hasFlightKeywords(emailData.subject)) {
    score += 10;
    reasons.push('Flight keyword in subject');
  }

  // Content markers (any 2+ markers)
  const text = emailData.plain_text || '';
  const markersFound = detectFlightMarkers(text);

  if (markersFound.length >= 2) {
    score += 10;
    reasons.push(`Flight markers: ${markersFound.join(', ')}`);
  }

  return { score, reasons };
}

export function isCandidateForReview(emailData: EmailData): {
  isCandidate: boolean;
  score: number;
  reasons: string[];
} {
  const { score, reasons } = calculateConfidenceScore(emailData);
  return { isCandidate: score >= CONFIDENCE_THRESHOLD, score, reasons };
}

export function generateGmailSearchQuery(): string {
  return `
    (flight OR airline OR boarding OR departure OR arrival OR itinerary OR confirmation)
    OR from:(united.com OR delta.com OR aa.com OR southwest.com OR jetblue.com OR 
             expedia.com OR kayak.com OR priceline.com OR booking.com)
    after:2000/01/01
  `.trim();
}
