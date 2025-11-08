import { DatabaseManager } from './database';
import { EmailCandidate } from './types';
import * as fs from 'fs';
import * as path from 'path';

describe('DatabaseManager', () => {
  let db: DatabaseManager;
  let testDbPath: string;

  beforeEach(() => {
    // Create a temporary database for testing
    testDbPath = path.join(__dirname, `test-${Date.now()}.db`);
    db = new DatabaseManager(testDbPath);
  });

  afterEach(() => {
    // Clean up
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('insertCandidates', () => {
    it('should insert candidates into the database', () => {
      const candidates = [
        {
          message_id: 'msg1',
          gmail_uid: 'uid1',
          subject: 'Flight Confirmation',
          from_email: 'noreply@united.com',
          msg_date: '2024-01-01',
          preview_text: 'Your flight is confirmed',
          html_content: '<html>Flight details</html>',
          plain_text: 'Flight details',
          confidence_score: 85,
          detection_reasons: JSON.stringify(['Known airline sender']),
        },
      ];

      const count = db.insertCandidates(candidates);
      expect(count).toBe(1);

      const retrieved = db.getCandidateByMessageId('msg1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.subject).toBe('Flight Confirmation');
    });

    it('should not insert duplicate candidates', () => {
      const candidate = {
        message_id: 'msg1',
        gmail_uid: 'uid1',
        subject: 'Flight Confirmation',
        from_email: 'noreply@united.com',
        msg_date: '2024-01-01',
        preview_text: 'Your flight is confirmed',
        html_content: '<html>Flight details</html>',
        plain_text: 'Flight details',
        confidence_score: 85,
        detection_reasons: JSON.stringify(['Known airline sender']),
      };

      db.insertCandidates([candidate]);
      db.insertCandidates([candidate]);

      const total = db.countTotalCandidates();
      expect(total).toBe(1);
    });
  });

  describe('review workflow', () => {
    beforeEach(() => {
      // Insert test candidates
      const candidates = [
        {
          message_id: 'msg1',
          gmail_uid: 'uid1',
          subject: 'Flight Confirmation',
          from_email: 'noreply@united.com',
          msg_date: '2024-01-01',
          preview_text: 'Your flight is confirmed',
          html_content: '<html>Flight details</html>',
          plain_text: 'Flight details',
          confidence_score: 85,
          detection_reasons: JSON.stringify(['Known airline sender']),
        },
        {
          message_id: 'msg2',
          gmail_uid: 'uid2',
          subject: 'Newsletter',
          from_email: 'marketing@example.com',
          msg_date: '2024-01-02',
          preview_text: 'Check out our deals',
          html_content: '<html>Marketing content</html>',
          plain_text: 'Marketing content',
          confidence_score: 35,
          detection_reasons: JSON.stringify(['Flight keyword in subject']),
        },
      ];
      db.insertCandidates(candidates);
    });

    it('should get unreviewed candidates', () => {
      const candidates = db.getUnreviewedCandidates(10);
      expect(candidates.length).toBe(2);
    });

    it('should mark candidates as reviewed', () => {
      const candidate = db.getCandidateByMessageId('msg1');
      expect(candidate).toBeDefined();

      db.markAsReviewed(candidate!.id);

      const unreviewed = db.getUnreviewedCandidates(10);
      expect(unreviewed.length).toBe(1);
      expect(unreviewed[0].message_id).toBe('msg2');
    });

    it('should insert review decision', () => {
      const candidate = db.getCandidateByMessageId('msg1');
      expect(candidate).toBeDefined();

      db.insertReviewDecision(candidate!.id, 'msg1', true, 'Looks good');

      const confirmedCount = db.countConfirmedFlights();
      expect(confirmedCount).toBe(1);
    });

    it('should track rejected emails', () => {
      const candidate = db.getCandidateByMessageId('msg2');
      expect(candidate).toBeDefined();

      db.insertReviewDecision(candidate!.id, 'msg2', false);

      const rejectedCount = db.countRejected();
      expect(rejectedCount).toBe(1);
    });

    it('should support undo functionality', () => {
      const candidate = db.getCandidateByMessageId('msg1');
      expect(candidate).toBeDefined();

      db.insertReviewDecision(candidate!.id, 'msg1', true);
      db.markAsReviewed(candidate!.id);

      const lastDecision = db.getLastDecision();
      expect(lastDecision).toBeDefined();
      expect(lastDecision?.message_id).toBe('msg1');

      db.deleteDecision(lastDecision!.id);
      db.markAsUnreviewed(lastDecision!.email_candidate_id);

      const unreviewed = db.countUnreviewed();
      expect(unreviewed).toBe(2);
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      // Insert and review some candidates
      const candidates = [
        {
          message_id: 'msg1',
          gmail_uid: 'uid1',
          subject: 'Flight 1',
          from_email: 'noreply@united.com',
          msg_date: '2024-01-01',
          preview_text: 'Flight confirmed',
          html_content: '<html>Details</html>',
          plain_text: 'Details',
          confidence_score: 85,
          detection_reasons: JSON.stringify(['Known airline sender']),
        },
        {
          message_id: 'msg2',
          gmail_uid: 'uid2',
          subject: 'Flight 2',
          from_email: 'noreply@delta.com',
          msg_date: '2024-01-02',
          preview_text: 'Flight confirmed',
          html_content: '<html>Details</html>',
          plain_text: 'Details',
          confidence_score: 90,
          detection_reasons: JSON.stringify(['Known airline sender']),
        },
        {
          message_id: 'msg3',
          gmail_uid: 'uid3',
          subject: 'Newsletter',
          from_email: 'marketing@example.com',
          msg_date: '2024-01-03',
          preview_text: 'Deals',
          html_content: '<html>Marketing</html>',
          plain_text: 'Marketing',
          confidence_score: 35,
          detection_reasons: JSON.stringify(['Flight keyword']),
        },
      ];
      db.insertCandidates(candidates);

      // Review first two
      const c1 = db.getCandidateByMessageId('msg1');
      const c2 = db.getCandidateByMessageId('msg2');
      
      db.insertReviewDecision(c1!.id, 'msg1', true);
      db.markAsReviewed(c1!.id);
      
      db.insertReviewDecision(c2!.id, 'msg2', false);
      db.markAsReviewed(c2!.id);
    });

    it('should calculate statistics correctly', () => {
      const stats = db.getStats();

      expect(stats.total_candidates).toBe(3);
      expect(stats.reviewed).toBe(2);
      expect(stats.unreviewed).toBe(1);
      expect(stats.confirmed_flights).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.review_rate).toBe(67); // 2/3 = 66.67% rounded to 67
    });
  });

  describe('search', () => {
    beforeEach(() => {
      const candidates = [
        {
          message_id: 'msg1',
          gmail_uid: 'uid1',
          subject: 'United Airlines Flight Confirmation',
          from_email: 'noreply@united.com',
          msg_date: '2024-01-01',
          preview_text: 'Flight confirmed',
          html_content: '<html>Details</html>',
          plain_text: 'Details',
          confidence_score: 85,
          detection_reasons: JSON.stringify(['Known airline sender']),
        },
        {
          message_id: 'msg2',
          gmail_uid: 'uid2',
          subject: 'Delta Flight Itinerary',
          from_email: 'noreply@delta.com',
          msg_date: '2024-01-02',
          preview_text: 'Itinerary details',
          html_content: '<html>Details</html>',
          plain_text: 'Details',
          confidence_score: 90,
          detection_reasons: JSON.stringify(['Known airline sender']),
        },
      ];
      db.insertCandidates(candidates);
    });

    it('should search by subject', () => {
      const results = db.searchCandidates('United');
      expect(results.length).toBe(1);
      expect(results[0].subject).toContain('United');
    });

    it('should search by email', () => {
      const results = db.searchCandidates('delta.com');
      expect(results.length).toBe(1);
      expect(results[0].from_email).toContain('delta.com');
    });

    it('should filter by reviewed status', () => {
      const c1 = db.getCandidateByMessageId('msg1');
      db.markAsReviewed(c1!.id);

      const reviewedResults = db.searchCandidates('Flight', true);
      expect(reviewedResults.length).toBe(1);

      const unreviewedResults = db.searchCandidates('Flight', false);
      expect(unreviewedResults.length).toBe(1);
    });
  });
});
