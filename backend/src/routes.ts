import express, { Request, Response } from 'express';
import { DatabaseManager } from './database';
import { ReviewDecision, EmailCard } from './types';

export function createRouter(db: DatabaseManager): express.Router {
  const router = express.Router();

  router.get('/api/emails/next-batch', async (req: Request, res: Response) => {
    try {
      const batchSize = Math.min(parseInt(req.query.batch_size as string) || 20, 100);

      const candidates = db.getUnreviewedCandidates(batchSize);

      if (candidates.length === 0) {
        return res.json({ emails: [], message: 'No more emails to review' });
      }

      const emails: EmailCard[] = candidates.map((c) => ({
        id: c.message_id,
        subject: c.subject,
        from_email: c.from_email,
        date: c.msg_date,
        preview_text: c.preview_text,
        html_content: c.html_content,
        confidence_score: c.confidence_score,
        highlights: JSON.parse(c.detection_reasons),
      }));

      const totalRemaining = db.countUnreviewed();

      res.json({ emails, total_remaining: totalRemaining });
    } catch (error) {
      console.error('Error fetching candidates:', error);
      res.status(500).json({ error: 'Failed to fetch candidates' });
    }
  });

  router.post('/api/emails/review', async (req: Request, res: Response) => {
    try {
      const decision: ReviewDecision = req.body;

      // Validate input
      if (!decision.email_id || typeof decision.is_flight_confirmation !== 'boolean') {
        return res.status(400).json({ error: 'Invalid request body' });
      }

      // Find candidate
      const candidate = db.getCandidateByMessageId(decision.email_id);
      if (!candidate) {
        return res.status(404).json({ error: 'Email not found' });
      }

      // Record decision
      db.insertReviewDecision(
        candidate.id,
        decision.email_id,
        decision.is_flight_confirmation,
        decision.notes
      );

      // Mark as reviewed
      db.markAsReviewed(candidate.id);

      // If confirmed flight, add to processing queue
      if (decision.is_flight_confirmation) {
        db.insertConfirmedFlight(decision.email_id, candidate.gmail_uid, candidate.subject);
      }

      const remaining = db.countUnreviewed();

      res.json({ status: 'success', remaining });
    } catch (error) {
      console.error('Error submitting review:', error);
      res.status(500).json({ error: 'Failed to submit review' });
    }
  });

  router.get('/api/stats', async (req: Request, res: Response) => {
    try {
      const stats = db.getStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  router.post('/api/emails/undo', async (req: Request, res: Response) => {
    try {
      const lastDecision = db.getLastDecision();
      if (!lastDecision) {
        return res.status(404).json({ error: 'No decisions to undo' });
      }

      db.deleteDecision(lastDecision.id);
      db.markAsUnreviewed(lastDecision.email_candidate_id);

      res.json({ status: 'success', undone_email_id: lastDecision.message_id });
    } catch (error) {
      console.error('Error undoing review:', error);
      res.status(500).json({ error: 'Failed to undo review' });
    }
  });

  router.get('/api/emails/search', async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      const reviewed = req.query.reviewed as string | undefined;

      if (!query) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
      }

      const reviewedFilter =
        reviewed === 'true' ? true : reviewed === 'false' ? false : undefined;

      const results = db.searchCandidates(query, reviewedFilter);

      res.json({ results, count: results.length });
    } catch (error) {
      console.error('Error searching candidates:', error);
      res.status(500).json({ error: 'Failed to search candidates' });
    }
  });

  router.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return router;
}
