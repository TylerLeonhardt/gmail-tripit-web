import Database from 'better-sqlite3';
import {
  EmailCandidate,
  ReviewDecisionRecord,
  ConfirmedFlight,
  Stats,
} from './types';

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS email_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE NOT NULL,
        gmail_uid TEXT,
        subject TEXT,
        from_email TEXT,
        msg_date TEXT,
        preview_text TEXT,
        html_content TEXT,
        plain_text TEXT,
        confidence_score INTEGER,
        detection_reasons TEXT,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed BOOLEAN DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS review_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_candidate_id INTEGER NOT NULL,
        message_id TEXT NOT NULL,
        is_flight_confirmation BOOLEAN NOT NULL,
        reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        FOREIGN KEY (email_candidate_id) REFERENCES email_candidates(id)
      );

      CREATE TABLE IF NOT EXISTS confirmed_flights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE NOT NULL,
        gmail_uid TEXT,
        subject TEXT,
        forwarded_to_tripit BOOLEAN DEFAULT 0,
        forwarded_at TIMESTAMP,
        parse_status TEXT,
        tripit_trip_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_candidates_reviewed ON email_candidates(reviewed);
      CREATE INDEX IF NOT EXISTS idx_decisions_confirmation ON review_decisions(is_flight_confirmation);
      CREATE INDEX IF NOT EXISTS idx_message_id ON email_candidates(message_id);
    `);
  }

  getUnreviewedCandidates(limit: number = 20): EmailCandidate[] {
    const stmt = this.db.prepare(`
      SELECT * FROM email_candidates 
      WHERE reviewed = 0 
      ORDER BY confidence_score DESC, msg_date DESC
      LIMIT ?
    `);
    return stmt.all(limit) as EmailCandidate[];
  }

  insertReviewDecision(
    emailCandidateId: number,
    messageId: string,
    isFlightConfirmation: boolean,
    notes?: string
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO review_decisions 
      (email_candidate_id, message_id, is_flight_confirmation, notes)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(emailCandidateId, messageId, isFlightConfirmation ? 1 : 0, notes);
  }

  markAsReviewed(candidateId: number): void {
    const stmt = this.db.prepare('UPDATE email_candidates SET reviewed = 1 WHERE id = ?');
    stmt.run(candidateId);
  }

  markAsUnreviewed(candidateId: number): void {
    const stmt = this.db.prepare('UPDATE email_candidates SET reviewed = 0 WHERE id = ?');
    stmt.run(candidateId);
  }

  countUnreviewed(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM email_candidates WHERE reviewed = 0');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  countReviewed(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM email_candidates WHERE reviewed = 1');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  countTotalCandidates(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM email_candidates');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  countConfirmedFlights(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM review_decisions 
      WHERE is_flight_confirmation = 1
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  countRejected(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM review_decisions 
      WHERE is_flight_confirmation = 0
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  calculateReviewRate(): number {
    const total = this.countTotalCandidates();
    const reviewed = this.countReviewed();
    return total === 0 ? 0 : Math.round((reviewed / total) * 100);
  }

  getCandidateByMessageId(messageId: string): EmailCandidate | undefined {
    const stmt = this.db.prepare('SELECT * FROM email_candidates WHERE message_id = ?');
    return stmt.get(messageId) as EmailCandidate | undefined;
  }

  insertConfirmedFlight(messageId: string, gmailUid: string, subject: string): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO confirmed_flights (message_id, gmail_uid, subject)
      VALUES (?, ?, ?)
    `);
    stmt.run(messageId, gmailUid, subject);
  }

  insertCandidates(
    candidates: Omit<EmailCandidate, 'id' | 'fetched_at' | 'reviewed'>[]
  ): number {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO email_candidates 
      (message_id, gmail_uid, subject, from_email, msg_date, preview_text, html_content, plain_text, 
       confidence_score, detection_reasons)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insert = this.db.transaction((candidates) => {
      for (const c of candidates) {
        stmt.run(
          c.message_id,
          c.gmail_uid,
          c.subject,
          c.from_email,
          c.msg_date,
          c.preview_text,
          c.html_content,
          c.plain_text,
          c.confidence_score,
          c.detection_reasons
        );
      }
    });

    insert(candidates);
    return candidates.length;
  }

  getLastDecision(): ReviewDecisionRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM review_decisions 
      ORDER BY reviewed_at DESC 
      LIMIT 1
    `);
    return stmt.get() as ReviewDecisionRecord | undefined;
  }

  deleteDecision(decisionId: number): void {
    const stmt = this.db.prepare('DELETE FROM review_decisions WHERE id = ?');
    stmt.run(decisionId);
  }

  searchCandidates(query: string, reviewedFilter?: boolean): EmailCandidate[] {
    let sql = `
      SELECT * FROM email_candidates 
      WHERE (subject LIKE ? OR from_email LIKE ? OR message_id LIKE ?)
    `;
    const params: any[] = [`%${query}%`, `%${query}%`, `%${query}%`];

    if (reviewedFilter !== undefined) {
      sql += ' AND reviewed = ?';
      params.push(reviewedFilter ? 1 : 0);
    }

    sql += ' ORDER BY msg_date DESC LIMIT 100';

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as EmailCandidate[];
  }

  getStats(): Stats {
    return {
      total_candidates: this.countTotalCandidates(),
      reviewed: this.countReviewed(),
      unreviewed: this.countUnreviewed(),
      confirmed_flights: this.countConfirmedFlights(),
      rejected: this.countRejected(),
      review_rate: this.calculateReviewRate(),
    };
  }

  close(): void {
    this.db.close();
  }
}
