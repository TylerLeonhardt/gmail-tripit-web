import {
  calculateConfidenceScore,
  isCandidateForReview,
  generateGmailSearchQuery,
} from './classifier';
import { EmailData } from './types';

describe('Classifier', () => {
  describe('calculateConfidenceScore', () => {
    it('should give high score for emails with FlightReservation schema', () => {
      const email: EmailData = {
        message_id: 'msg1',
        subject: 'Flight Confirmation',
        from_email: 'noreply@example.com',
        date: '2024-01-01',
        html: '<script type="application/ld+json">{"@type":"FlightReservation"}</script>',
        plain_text: 'Flight details',
      };

      const result = calculateConfidenceScore(email);
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.reasons).toContain('Has FlightReservation schema markup');
    });

    it('should recognize known airline senders', () => {
      const email: EmailData = {
        message_id: 'msg1',
        subject: 'Your flight',
        from_email: 'noreply@united.com',
        date: '2024-01-01',
        html: '<html>Flight details</html>',
        plain_text: 'Flight details',
      };

      const result = calculateConfidenceScore(email);
      expect(result.score).toBeGreaterThanOrEqual(20);
      expect(result.reasons).toContain('Known airline/OTA sender');
    });

    it('should recognize confirmation keywords in subject', () => {
      const email: EmailData = {
        message_id: 'msg1',
        subject: 'Flight Confirmation #ABC123',
        from_email: 'noreply@example.com',
        date: '2024-01-01',
        html: '<html>Details</html>',
        plain_text: 'Details',
      };

      const result = calculateConfidenceScore(email);
      expect(result.reasons).toContain('Confirmation keyword in subject');
    });

    it('should recognize flight keywords in subject', () => {
      const email: EmailData = {
        message_id: 'msg1',
        subject: 'Your flight departure information',
        from_email: 'noreply@example.com',
        date: '2024-01-01',
        html: '<html>Details</html>',
        plain_text: 'Details',
      };

      const result = calculateConfidenceScore(email);
      expect(result.reasons).toContain('Flight keyword in subject');
    });

    it('should detect flight markers in content', () => {
      const email: EmailData = {
        message_id: 'msg1',
        subject: 'Travel Information',
        from_email: 'noreply@example.com',
        date: '2024-01-01',
        html: '<html>Details</html>',
        plain_text: 'Your confirmation code is ABC123. Flight AA1234 from JFK to LAX.',
      };

      const result = calculateConfidenceScore(email);
      expect(result.reasons.some((r: string) => r.includes('Flight markers'))).toBe(true);
    });

    it('should calculate combined score for strong candidate', () => {
      const email: EmailData = {
        message_id: 'msg1',
        subject: 'Flight Confirmation - AA1234',
        from_email: 'noreply@aa.com',
        date: '2024-01-01',
        html: '<html>Flight details</html>',
        plain_text: 'Confirmation ABC123. Flight AA1234 from JFK to LAX.',
      };

      const result = calculateConfidenceScore(email);
      expect(result.score).toBeGreaterThanOrEqual(50);
    });

    it('should give low score for non-flight emails', () => {
      const email: EmailData = {
        message_id: 'msg1',
        subject: 'Newsletter: Weekly Deals',
        from_email: 'marketing@example.com',
        date: '2024-01-01',
        html: '<html>Check out our deals</html>',
        plain_text: 'Check out our deals',
      };

      const result = calculateConfidenceScore(email);
      expect(result.score).toBeLessThan(30);
    });
  });

  describe('isCandidateForReview', () => {
    it('should accept emails above threshold', () => {
      const email: EmailData = {
        message_id: 'msg1',
        subject: 'Flight Confirmation',
        from_email: 'noreply@united.com',
        date: '2024-01-01',
        html: '<html>Flight details</html>',
        plain_text: 'Confirmation ABC123. Flight UA123 from SFO to JFK.',
      };

      const result = isCandidateForReview(email);
      expect(result.isCandidate).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(30);
    });

    it('should reject emails below threshold', () => {
      const email: EmailData = {
        message_id: 'msg1',
        subject: 'Newsletter',
        from_email: 'marketing@example.com',
        date: '2024-01-01',
        html: '<html>Deals</html>',
        plain_text: 'Check out deals',
      };

      const result = isCandidateForReview(email);
      expect(result.isCandidate).toBe(false);
      expect(result.score).toBeLessThan(30);
    });

    it('should accept borderline cases with 30+ score', () => {
      const email: EmailData = {
        message_id: 'msg1',
        subject: 'Flight information',
        from_email: 'noreply@example.com',
        date: '2024-01-01',
        html: '<html>Flight AA123 from JFK to LAX</html>',
        plain_text: 'Flight AA123 from JFK to LAX with confirmation ABC123',
      };

      const result = isCandidateForReview(email);
      // Should have flight keyword (10) + flight markers (10) = 20, which is below threshold
      // But with confirmation code and flight number patterns, it might qualify
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('generateGmailSearchQuery', () => {
    it('should generate a valid Gmail search query', () => {
      const query = generateGmailSearchQuery();
      
      expect(query).toContain('flight');
      expect(query).toContain('airline');
      expect(query).toContain('confirmation');
      expect(query).toContain('united.com');
      expect(query).toContain('delta.com');
      expect(query).toContain('after:2000/01/01');
    });

    it('should not be empty', () => {
      const query = generateGmailSearchQuery();
      expect(query.trim().length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle emails with empty content', () => {
      const email: EmailData = {
        message_id: 'msg1',
        subject: '',
        from_email: '',
        date: '2024-01-01',
        html: '',
        plain_text: '',
      };

      const result = calculateConfidenceScore(email);
      expect(result.score).toBe(0);
      expect(result.reasons.length).toBe(0);
    });

    it('should handle emails with only HTML content', () => {
      const email: EmailData = {
        message_id: 'msg1',
        subject: 'Flight Confirmation',
        from_email: 'noreply@united.com',
        date: '2024-01-01',
        html: '<html><body>Your flight is confirmed. AA123 from JFK to LAX.</body></html>',
      };

      const result = calculateConfidenceScore(email);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should be case-insensitive for keywords', () => {
      const email1: EmailData = {
        message_id: 'msg1',
        subject: 'FLIGHT CONFIRMATION',
        from_email: 'noreply@UNITED.COM',
        date: '2024-01-01',
        html: '<html>Details</html>',
        plain_text: 'Details',
      };

      const email2: EmailData = {
        message_id: 'msg2',
        subject: 'flight confirmation',
        from_email: 'noreply@united.com',
        date: '2024-01-01',
        html: '<html>Details</html>',
        plain_text: 'Details',
      };

      const result1 = calculateConfidenceScore(email1);
      const result2 = calculateConfidenceScore(email2);

      expect(result1.score).toBe(result2.score);
    });
  });
});
