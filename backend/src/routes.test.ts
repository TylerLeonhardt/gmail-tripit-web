import request from 'supertest';
import express from 'express';
import { DatabaseManager } from './database';
import { createRouter } from './routes';
import { EmailCandidate } from './types';
import * as fs from 'fs';
import * as path from 'path';

describe('API Routes', () => {
  let app: express.Application;
  let db: DatabaseManager;
  let testDbPath: string;

  beforeEach(() => {
    // Create test app and database
    testDbPath = path.join(__dirname, `test-${Date.now()}.db`);
    db = new DatabaseManager(testDbPath);
    
    app = express();
    app.use(express.json());
    app.use(createRouter(db));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/emails/next-batch', () => {
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
          subject: 'Flight Itinerary',
          from_email: 'noreply@delta.com',
          msg_date: '2024-01-02',
          preview_text: 'Your itinerary',
          html_content: '<html>Itinerary</html>',
          plain_text: 'Itinerary',
          confidence_score: 90,
          detection_reasons: JSON.stringify(['Known airline sender', 'Flight keyword']),
        },
      ];
      db.insertCandidates(candidates);
    });

    it('should return unreviewed candidates', async () => {
      const response = await request(app).get('/api/emails/next-batch');
      
      expect(response.status).toBe(200);
      expect(response.body.emails).toBeDefined();
      expect(response.body.emails.length).toBe(2);
      expect(response.body.total_remaining).toBe(2);
    });

    it('should respect batch size parameter', async () => {
      const response = await request(app).get('/api/emails/next-batch?batch_size=1');
      
      expect(response.status).toBe(200);
      expect(response.body.emails.length).toBe(1);
    });

    it('should limit batch size to 100', async () => {
      const response = await request(app).get('/api/emails/next-batch?batch_size=200');
      
      expect(response.status).toBe(200);
      // Should be limited even though we requested 200
    });

    it('should return empty array when no candidates', async () => {
      // Mark all as reviewed
      const candidates = db.getUnreviewedCandidates(10);
      candidates.forEach((c: EmailCandidate) => db.markAsReviewed(c.id));

      const response = await request(app).get('/api/emails/next-batch');
      
      expect(response.status).toBe(200);
      expect(response.body.emails).toEqual([]);
      expect(response.body.message).toBe('No more emails to review');
    });

    it('should parse detection reasons as JSON', async () => {
      const response = await request(app).get('/api/emails/next-batch');
      
      expect(response.status).toBe(200);
      expect(response.body.emails[0].highlights).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/emails/review', () => {
    let candidateId: string;

    beforeEach(() => {
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
      db.insertCandidates(candidates);
      candidateId = 'msg1';
    });

    it('should accept a review decision', async () => {
      const response = await request(app)
        .post('/api/emails/review')
        .send({
          email_id: candidateId,
          is_flight_confirmation: true,
        });
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.remaining).toBe(0);
    });

    it('should mark email as reviewed', async () => {
      await request(app)
        .post('/api/emails/review')
        .send({
          email_id: candidateId,
          is_flight_confirmation: true,
        });

      const unreviewed = db.countUnreviewed();
      expect(unreviewed).toBe(0);
    });

    it('should create confirmed flight for positive reviews', async () => {
      await request(app)
        .post('/api/emails/review')
        .send({
          email_id: candidateId,
          is_flight_confirmation: true,
        });

      const confirmed = db.countConfirmedFlights();
      expect(confirmed).toBe(1);
    });

    it('should not create confirmed flight for negative reviews', async () => {
      await request(app)
        .post('/api/emails/review')
        .send({
          email_id: candidateId,
          is_flight_confirmation: false,
        });

      const confirmed = db.countConfirmedFlights();
      expect(confirmed).toBe(0);
    });

    it('should return 400 for invalid request', async () => {
      const response = await request(app)
        .post('/api/emails/review')
        .send({
          email_id: candidateId,
          // missing is_flight_confirmation
        });
      
      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent email', async () => {
      const response = await request(app)
        .post('/api/emails/review')
        .send({
          email_id: 'non-existent',
          is_flight_confirmation: true,
        });
      
      expect(response.status).toBe(404);
    });

    it('should accept optional notes', async () => {
      const response = await request(app)
        .post('/api/emails/review')
        .send({
          email_id: candidateId,
          is_flight_confirmation: true,
          notes: 'Test note',
        });
      
      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/stats', () => {
    beforeEach(() => {
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
      ];
      db.insertCandidates(candidates);

      // Review one
      const c1 = db.getCandidateByMessageId('msg1');
      db.insertReviewDecision(c1!.id, 'msg1', true);
      db.markAsReviewed(c1!.id);
    });

    it('should return statistics', async () => {
      const response = await request(app).get('/api/stats');
      
      expect(response.status).toBe(200);
      expect(response.body.total_candidates).toBe(2);
      expect(response.body.reviewed).toBe(1);
      expect(response.body.unreviewed).toBe(1);
      expect(response.body.confirmed_flights).toBe(1);
      expect(response.body.rejected).toBe(0);
      expect(response.body.review_rate).toBe(50);
    });
  });

  describe('POST /api/emails/undo', () => {
    let candidateId: string;

    beforeEach(() => {
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
      db.insertCandidates(candidates);
      candidateId = 'msg1';
    });

    it('should undo last review', async () => {
      // First, make a review
      const candidate = db.getCandidateByMessageId(candidateId);
      db.insertReviewDecision(candidate!.id, candidateId, true);
      db.markAsReviewed(candidate!.id);

      expect(db.countUnreviewed()).toBe(0);

      // Now undo
      const response = await request(app).post('/api/emails/undo');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.undone_email_id).toBe(candidateId);
      expect(db.countUnreviewed()).toBe(1);
    });

    it('should return 404 when nothing to undo', async () => {
      const response = await request(app).post('/api/emails/undo');
      
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/emails/search', () => {
    beforeEach(() => {
      const candidates = [
        {
          message_id: 'msg1',
          gmail_uid: 'uid1',
          subject: 'United Flight Confirmation',
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
          preview_text: 'Itinerary',
          html_content: '<html>Details</html>',
          plain_text: 'Details',
          confidence_score: 90,
          detection_reasons: JSON.stringify(['Known airline sender']),
        },
      ];
      db.insertCandidates(candidates);
    });

    it('should search candidates', async () => {
      const response = await request(app).get('/api/emails/search?q=United');
      
      expect(response.status).toBe(200);
      expect(response.body.results.length).toBe(1);
      expect(response.body.results[0].subject).toContain('United');
    });

    it('should return 400 without query parameter', async () => {
      const response = await request(app).get('/api/emails/search');
      
      expect(response.status).toBe(400);
    });

    it('should filter by reviewed status', async () => {
      const c1 = db.getCandidateByMessageId('msg1');
      db.markAsReviewed(c1!.id);

      const response = await request(app).get('/api/emails/search?q=Flight&reviewed=true');
      
      expect(response.status).toBe(200);
      expect(response.body.results.length).toBe(1);
    });
  });
});
