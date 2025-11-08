# Flight Email Classifier Web App: Tinder-Style Review Interface

**A web application for manual review and classification of potential flight confirmation emails.** This system presents candidate emails one at a time in a card-based interface where you swipe right (or click "Yes") for flight confirmations and swipe left (or click "No") for non-flight emails. The architecture uses a Node.js + TypeScript backend with relaxed classification thresholds (30-40% confidence instead of 50%+) to maximize recall, letting you make the final classification decision through an intuitive review process.

The technical approach combines Gmail API for email retrieval, Express.js with TypeScript for the backend, a React or vanilla JavaScript frontend with card-swiping UI, and SQLite for tracking review decisions. This design prioritizes user experience—quick load times, keyboard shortcuts, email preview with highlighting, and progress tracking—while ensuring no confirmation emails are missed through conservative initial filtering.

## Architecture overview: Backend, frontend, and data flow

**Use Express.js with TypeScript for the backend with async support and type safety.** Express.js provides excellent performance, extensive middleware ecosystem, and TypeScript adds compile-time type checking. Install with `npm install express cors` and dev dependencies `npm install -D typescript @types/node @types/express @types/cors ts-node nodemon`:

```typescript
import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8000;

// Enable CORS for frontend development
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));

app.use(express.json());

interface EmailCard {
  id: string;
  subject: string;
  from_email: string;
  date: string;
  preview_text: string;
  html_content?: string;
  confidence_score: number;
  highlights: string[];
}

interface ReviewDecision {
  email_id: string;
  is_flight_confirmation: boolean;
  notes?: string;
}

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Flight Email Classifier API' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

Alternative: Use Fastify for even better performance, or NestJS for a more opinionated framework with built-in TypeScript support and dependency injection. Express provides the most straightforward setup with wide community support.

**Design a card-based frontend with React and react-tinder-card library.** This provides smooth swipe animations and touch support. Install with `npm create vite@latest frontend -- --template react` then `npm install react-tinder-card`:

```jsx
import React, { useState, useEffect } from 'react';
import TinderCard from 'react-tinder-card';
import './App.css';

function App() {
  const [emails, setEmails] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmails();
  }, []);

  const fetchEmails = async () => {
    const response = await fetch('http://localhost:8000/api/emails/next-batch');
    const data = await response.json();
    setEmails(data.emails);
    setLoading(false);
  };

  const handleSwipe = async (direction, emailId) => {
    const isFlightConfirmation = direction === 'right';
    
    await fetch('http://localhost:8000/api/emails/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_id: emailId,
        is_flight_confirmation: isFlightConfirmation
      })
    });

    if (currentIndex === emails.length - 1) {
      fetchEmails();
      setCurrentIndex(0);
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const currentEmail = emails[currentIndex];

  return (
    <div className="app">
      <div className="card-container">
        {currentEmail && (
          <TinderCard
            key={currentEmail.id}
            onSwipe={(dir) => handleSwipe(dir, currentEmail.id)}
            preventSwipe={['up', 'down']}
          >
            <div className="card">
              <div className="card-header">
                <h3>{currentEmail.subject}</h3>
                <span className="from">{currentEmail.from_email}</span>
                <span className="date">{currentEmail.date}</span>
              </div>
              <div className="card-body">
                <div dangerouslySetInnerHTML={{ __html: currentEmail.html_content }} />
              </div>
              <div className="confidence">
                Confidence: {currentEmail.confidence_score}%
              </div>
            </div>
          </TinderCard>
        )}
      </div>
      
      <div className="button-container">
        <button 
          className="btn-no"
          onClick={() => handleSwipe('left', currentEmail.id)}
        >
          ✗ Not a Flight
        </button>
        <button 
          className="btn-yes"
          onClick={() => handleSwipe('right', currentEmail.id)}
        >
          ✓ Flight Confirmation
        </button>
      </div>
      
      <div className="progress">
        Reviewed: {currentIndex} / {emails.length}
      </div>
    </div>
  );
}

export default App;
```

Alternative: vanilla JavaScript with Hammer.js for touch gestures (`npm install hammerjs`) if you want to avoid React's complexity. The card-based UI pattern works well for both desktop (click buttons) and mobile (swipe gestures).

**Implement a three-tier database schema for email staging, review decisions, and processing state:**

```sql
-- Candidate emails awaiting review
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
    detection_reasons TEXT,  -- JSON array of why it was flagged
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed BOOLEAN DEFAULT 0
);

-- User review decisions
CREATE TABLE IF NOT EXISTS review_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_candidate_id INTEGER NOT NULL,
    message_id TEXT NOT NULL,
    is_flight_confirmation BOOLEAN NOT NULL,
    reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (email_candidate_id) REFERENCES email_candidates(id)
);

-- Processing state for confirmed flights
CREATE TABLE IF NOT EXISTS confirmed_flights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT UNIQUE NOT NULL,
    gmail_uid TEXT,
    subject TEXT,
    forwarded_to_tripit BOOLEAN DEFAULT 0,
    forwarded_at TIMESTAMP,
    parse_status TEXT,  -- 'SUCCESS', 'FAILED', 'PENDING'
    tripit_trip_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_candidates_reviewed ON email_candidates(reviewed);
CREATE INDEX idx_decisions_confirmation ON review_decisions(is_flight_confirmation);
CREATE INDEX idx_message_id ON email_candidates(message_id);
```

This schema separates concerns: candidates for review, user decisions, and confirmed flights ready for TripIt forwarding. The `reviewed` flag enables efficient queries for the next unreviewed batch.

## Email candidate selection: Relaxed filtering strategy

**Lower the confidence threshold to 30-40% to maximize recall over precision.** Since you're manually reviewing everything, false positives are acceptable—missing true flight confirmations is not. Adjust the multi-layer classifier scoring:

```typescript
interface EmailData {
  html: string;
  from_email: string;
  subject: string;
  plain_text?: string;
}

interface ConfidenceResult {
  score: number;
  reasons: string[];
}

function hasFlightReservationSchema(html: string): boolean {
  // Check for Schema.org FlightReservation markup
  return html.includes('FlightReservation') || html.includes('schema.org/FlightReservation');
}

function calculateConfidenceScore(emailData: EmailData): ConfidenceResult {
  let score = 0;
  const reasons: string[] = [];
  
  // Schema.org FlightReservation (highest confidence)
  if (hasFlightReservationSchema(emailData.html)) {
    score += 50;
    reasons.push("Has FlightReservation schema markup");
  }
  
  // Airline/OTA sender domain
  const knownSenders = [
    'united.com', 'delta.com', 'aa.com', 'southwest.com',
    'jetblue.com', 'expedia.com', 'kayak.com', 'priceline.com'
  ];
  if (knownSenders.some(domain => emailData.from_email.toLowerCase().includes(domain))) {
    score += 20;
    reasons.push("Known airline/OTA sender");
  }
  
  // Subject line patterns (relaxed)
  const confirmationKeywords = ['confirmation', 'confirmed', 'itinerary', 'booking'];
  if (confirmationKeywords.some(kw => emailData.subject.toLowerCase().includes(kw))) {
    score += 15;
    reasons.push("Confirmation keyword in subject");
  }
  
  // Flight-related keywords in subject
  const flightKeywords = ['flight', 'airline', 'boarding', 'departure'];
  if (flightKeywords.some(kw => emailData.subject.toLowerCase().includes(kw))) {
    score += 10;
    reasons.push("Flight keyword in subject");
  }
  
  // Content markers (any 2+ markers)
  const text = emailData.plain_text || '';
  const markersFound: string[] = [];
  
  if (/\b[A-Z0-9]{6}\b/.test(text)) {
    markersFound.push("confirmation code");
  }
  if (/\b[A-Z]{2}\d{1,4}\b/.test(text)) {
    markersFound.push("flight number");
  }
  if (/\b[A-Z]{3}\b/.test(text)) {
    markersFound.push("airport code");
  }
  
  if (markersFound.length >= 2) {
    score += 10;
    reasons.push(`Flight markers: ${markersFound.join(', ')}`);
  }
  
  return { score, reasons };
}

// Classify as candidate if score >= 30 (was 50+ in original spec)
function isCandidateForReview(emailData: EmailData): { isCandidate: boolean; score: number; reasons: string[] } {
  const { score, reasons } = calculateConfidenceScore(emailData);
  return { isCandidate: score >= 30, score, reasons };
}
```

This relaxed threshold catches more potential emails at the cost of increased review volume. A 20-year email history with 5,000 true flight confirmations might yield 6,000-8,000 candidates (20-60% false positive rate), but ensures minimal missed flights.

**Optimize the Gmail search query for breadth rather than precision.** Use an expansive search that prioritizes recall:

```typescript
// Relaxed search query
const query = `
  (flight OR airline OR boarding OR departure OR arrival OR itinerary OR confirmation)
  OR from:(united.com OR delta.com OR aa.com OR southwest.com OR jetblue.com OR 
           expedia.com OR kayak.com OR priceline.com OR booking.com)
  after:2000/01/01
`;
```

This casts a wider net, accepting that the manual review step filters out false positives. You can further expand by adding more airline domains or travel-related keywords.

**Pre-fetch and cache email content during initial scan phase.** Run a background job that searches Gmail, scores candidates, and stores full HTML/text content in the database:

```typescript
import { google } from 'googleapis';
import { DatabaseManager } from './database';

interface EmailCandidate {
  message_id: string;
  gmail_uid: string;
  subject: string;
  from_email: string;
  msg_date: string;
  html_content: string;
  plain_text: string;
  confidence_score: number;
  detection_reasons: string;
}

class EmailFetcher {
  private gmail: any;
  private db: DatabaseManager;

  constructor(gmailClient: any, dbManager: DatabaseManager) {
    this.gmail = gmailClient;
    this.db = dbManager;
  }

  async fetchAndScoreCandidates(query: string): Promise<number> {
    const messages = await this.listMessagesWithPagination(query);
    
    const candidates: EmailCandidate[] = [];
    
    for (const msg of messages) {
      // Fetch full message content
      const fullMsg = await this.gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full'
      });
      
      const emailData = this.extractEmailData(fullMsg.data);
      const { isCandidate, score, reasons } = isCandidateForReview(emailData);
      
      if (isCandidate) {
        candidates.push({
          message_id: emailData.message_id,
          gmail_uid: msg.id,
          subject: emailData.subject,
          from_email: emailData.from_email,
          msg_date: emailData.date,
          html_content: emailData.html,
          plain_text: emailData.plain_text,
          confidence_score: score,
          detection_reasons: JSON.stringify(reasons)
        });
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Bulk insert into database
    await this.db.insertCandidates(candidates);
    return candidates.length;
  }

  private async listMessagesWithPagination(query: string): Promise<any[]> {
    const messages: any[] = [];
    let pageToken: string | undefined;
    
    do {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 500,
        pageToken
      });
      
      if (response.data.messages) {
        messages.push(...response.data.messages);
      }
      
      pageToken = response.data.nextPageToken;
    } while (pageToken);
    
    return messages;
  }

  private extractEmailData(message: any): EmailData & { message_id: string; date: string } {
    // Extract headers, body parts, etc.
    // Implementation details omitted for brevity
    return {} as any;
  }
}
```

This one-time fetch operation runs before you start reviewing, ensuring fast load times in the web interface. For 20 years of email, expect 30-60 minutes for the initial scan with rate limiting.

## API endpoints: Backend routes for email review workflow

**Implement REST endpoints for fetching candidates and submitting decisions:**

```typescript
import express, { Request, Response } from 'express';
import { DatabaseManager } from './database';

const router = express.Router();
const db = new DatabaseManager('./data/emails.db');

interface ReviewDecisionBody {
  email_id: string;
  is_flight_confirmation: boolean;
  notes?: string;
}

router.get('/api/emails/next-batch', async (req: Request, res: Response) => {
  try {
    const batchSize = Math.min(parseInt(req.query.batch_size as string) || 20, 100);
    
    const candidates = await db.getUnreviewedCandidates(batchSize);
    
    if (candidates.length === 0) {
      return res.json({ emails: [], message: 'No more emails to review' });
    }
    
    const emails = candidates.map(c => ({
      id: c.message_id,
      subject: c.subject,
      from_email: c.from_email,
      date: c.msg_date,
      preview_text: c.preview_text,
      html_content: c.html_content,
      confidence_score: c.confidence_score,
      highlights: JSON.parse(c.detection_reasons)
    }));
    
    const totalRemaining = await db.countUnreviewed();
    
    res.json({ emails, total_remaining: totalRemaining });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

router.post('/api/emails/review', async (req: Request, res: Response) => {
  try {
    const decision: ReviewDecisionBody = req.body;
    
    // Find candidate
    const candidate = await db.getCandidateByMessageId(decision.email_id);
    if (!candidate) {
      return res.status(404).json({ error: 'Email not found' });
    }
    
    // Record decision
    await db.insertReviewDecision(
      candidate.id,
      decision.email_id,
      decision.is_flight_confirmation,
      decision.notes
    );
    
    // Mark as reviewed
    await db.markAsReviewed(candidate.id);
    
    // If confirmed flight, add to processing queue
    if (decision.is_flight_confirmation) {
      await db.insertConfirmedFlight(
        decision.email_id,
        candidate.gmail_uid,
        candidate.subject
      );
    }
    
    const remaining = await db.countUnreviewed();
    
    res.json({ status: 'success', remaining });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

router.get('/api/stats', async (req: Request, res: Response) => {
  try {
    const stats = {
      total_candidates: await db.countTotalCandidates(),
      reviewed: await db.countReviewed(),
      unreviewed: await db.countUnreviewed(),
      confirmed_flights: await db.countConfirmedFlights(),
      rejected: await db.countRejected(),
      review_rate: await db.calculateReviewRate()
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/api/emails/undo', async (req: Request, res: Response) => {
  try {
    const lastDecision = await db.getLastDecision();
    if (!lastDecision) {
      return res.status(404).json({ error: 'No decisions to undo' });
    }
    
    await db.deleteDecision(lastDecision.id);
    await db.markAsUnreviewed(lastDecision.email_candidate_id);
    
    res.json({ status: 'success', undone_email_id: lastDecision.message_id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to undo review' });
  }
});

router.get('/api/emails/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const reviewed = req.query.reviewed as string | undefined;
    
    const reviewedFilter = reviewed === 'true' ? true : reviewed === 'false' ? false : undefined;
    
    const results = await db.searchCandidates(query, reviewedFilter);
    
    res.json({ results, count: results.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to search candidates' });
  }
});

export default router;
```

These endpoints provide the complete CRUD operations needed for the review workflow. The `/next-batch` endpoint returns multiple emails at once for pre-loading, improving perceived performance.

**Add WebSocket support for real-time progress updates:**

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

class ConnectionManager {
  private connections: Set<WebSocket> = new Set();

  connect(ws: WebSocket): void {
    this.connections.add(ws);
  }

  disconnect(ws: WebSocket): void {
    this.connections.delete(ws);
  }

  broadcast(message: any): void {
    const data = JSON.stringify(message);
    for (const connection of this.connections) {
      if (connection.readyState === WebSocket.OPEN) {
        connection.send(data);
      }
    }
  }
}

const manager = new ConnectionManager();

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    manager.connect(ws);
    
    ws.on('close', () => {
      manager.disconnect(ws);
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      manager.disconnect(ws);
    });
  });
}

// In your review endpoint, broadcast updates
router.post('/api/emails/review', async (req: Request, res: Response) => {
  // ... existing code ...
  
  // Broadcast progress update
  manager.broadcast({
    type: 'progress_update',
    reviewed: await db.countReviewed(),
    remaining: await db.countUnreviewed()
  });
  
  res.json({ status: 'success' });
});
```

WebSocket updates enable showing live progress if multiple users review simultaneously or if you have the app open on multiple devices. Install with `npm install ws` and types with `npm install -D @types/ws`.

## Frontend UI: Card interface and user experience

**Design a clean card interface with keyboard shortcuts for efficient review:**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import TinderCard from 'react-tinder-card';

function App() {
  const [emails, setEmails] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState({});
  const [showContent, setShowContent] = useState(true);

  useEffect(() => {
    fetchBatch();
    fetchStats();
    
    // Keyboard shortcuts
    const handleKeyPress = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'n') {
        handleDecision(false);
      } else if (e.key === 'ArrowRight' || e.key === 'y') {
        handleDecision(true);
      } else if (e.key === 'u') {
        handleUndo();
      } else if (e.key === 'h') {
        setShowContent(!showContent);
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentIndex, showContent]);

  const handleDecision = async (isFlightConfirmation) => {
    const currentEmail = emails[currentIndex];
    
    await fetch('http://localhost:8000/api/emails/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_id: currentEmail.id,
        is_flight_confirmation: isFlightConfirmation
      })
    });

    // Move to next email
    if (currentIndex >= emails.length - 3) {
      // Pre-fetch next batch when near end
      fetchBatch();
    }
    setCurrentIndex(currentIndex + 1);
    fetchStats();
  };

  const handleUndo = async () => {
    await fetch('http://localhost:8000/api/emails/undo', { method: 'POST' });
    setCurrentIndex(Math.max(0, currentIndex - 1));
    fetchBatch();
    fetchStats();
  };

  const currentEmail = emails[currentIndex];

  return (
    <div className="app">
      <header className="header">
        <h1>✈️ Flight Email Classifier</h1>
        <div className="stats">
          <span>Reviewed: {stats.reviewed}</span>
          <span>Remaining: {stats.unreviewed}</span>
          <span>Confirmed: {stats.confirmed_flights}</span>
        </div>
      </header>

      <div className="main-content">
        {currentEmail ? (
          <div className="card-wrapper">
            <div className="card">
              <div className="card-header">
                <div className="meta">
                  <span className="confidence-badge">
                    {currentEmail.confidence_score}% confidence
                  </span>
                  <span className="date">{currentEmail.date}</span>
                </div>
                <h2 className="subject">{currentEmail.subject}</h2>
                <p className="from">{currentEmail.from_email}</p>
              </div>

              {currentEmail.highlights.length > 0 && (
                <div className="highlights">
                  <strong>Detected:</strong>
                  <ul>
                    {currentEmail.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}

              {showContent && (
                <div className="card-body">
                  <iframe
                    srcDoc={currentEmail.html_content}
                    title="Email Content"
                    sandbox="allow-same-origin"
                    className="email-preview"
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <h2>🎉 All done!</h2>
            <p>No more emails to review.</p>
          </div>
        )}
      </div>

      <div className="controls">
        <button 
          className="btn btn-no"
          onClick={() => handleDecision(false)}
          disabled={!currentEmail}
        >
          <span className="icon">✗</span>
          <span className="label">Not a Flight</span>
          <span className="shortcut">N or ←</span>
        </button>
        
        <button
          className="btn btn-undo"
          onClick={handleUndo}
        >
          <span className="icon">↶</span>
          <span className="label">Undo</span>
          <span className="shortcut">U</span>
        </button>

        <button 
          className="btn btn-yes"
          onClick={() => handleDecision(true)}
          disabled={!currentEmail}
        >
          <span className="icon">✓</span>
          <span className="label">Flight Confirmation</span>
          <span className="shortcut">Y or →</span>
        </button>
      </div>

      <div className="help">
        <button onClick={() => setShowContent(!showContent)}>
          {showContent ? 'Hide' : 'Show'} Content (H)
        </button>
      </div>
    </div>
  );
}

export default App;
```

**Add CSS for polished card-based interface:**

```css
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.header {
  padding: 20px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.header h1 {
  margin: 0 0 10px 0;
  font-size: 24px;
}

.stats {
  display: flex;
  gap: 20px;
  font-size: 14px;
  color: #666;
}

.main-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: hidden;
}

.card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.card-header {
  padding: 20px;
  border-bottom: 1px solid #eee;
}

.meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 12px;
}

.confidence-badge {
  background: #667eea;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.subject {
  margin: 10px 0;
  font-size: 18px;
  color: #333;
}

.from {
  color: #666;
  font-size: 14px;
}

.highlights {
  padding: 15px 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #eee;
  font-size: 13px;
}

.highlights ul {
  margin: 5px 0 0 0;
  padding-left: 20px;
}

.card-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.email-preview {
  width: 100%;
  height: 100%;
  border: none;
  min-height: 400px;
}

.controls {
  display: flex;
  gap: 20px;
  padding: 20px;
  justify-content: center;
  background: rgba(255, 255, 255, 0.95);
}

.btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 15px 30px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-no {
  background: #ff6b6b;
  color: white;
}

.btn-yes {
  background: #51cf66;
  color: white;
}

.btn-undo {
  background: #adb5bd;
  color: white;
}

.icon {
  font-size: 24px;
  margin-bottom: 5px;
}

.shortcut {
  font-size: 11px;
  opacity: 0.8;
  margin-top: 5px;
}

.empty-state {
  text-align: center;
  color: white;
}
```

This design emphasizes speed and clarity—large buttons, keyboard shortcuts prominently displayed, and confidence scores immediately visible.

## Deployment and workflow: Running the complete system

**Project structure for the web application:**

```
gmail-flight-reviewer/
├── README.md
├── package.json
├── tsconfig.json
├── .env.example
├── backend/
│   ├── src/
│   │   ├── server.ts
│   │   ├── database.ts
│   │   ├── gmail-client.ts
│   │   ├── classifier.ts
│   │   ├── routes.ts
│   │   └── types.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── components/
│   │   │   ├── EmailCard.tsx
│   │   │   ├── Controls.tsx
│   │   │   └── Stats.tsx
│   │   └── api/
│   │       └── client.ts
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── config/
│   ├── credentials.json
│   └── settings.ts
└── data/
    └── emails.db
```

**Installation and setup steps:**

```bash
# Backend setup
cd gmail-flight-reviewer/backend
npm init -y
npm install express cors ws googleapis better-sqlite3
npm install -D typescript @types/node @types/express @types/cors @types/ws ts-node nodemon

# Create tsconfig.json
npx tsc --init

# Frontend setup
cd ../frontend
npm create vite@latest . -- --template react-ts
npm install react-tinder-card axios
npm install

# Configure Gmail API credentials
# 1. Create project at console.cloud.google.com
# 2. Enable Gmail API
# 3. Create OAuth 2.0 credentials
# 4. Download credentials.json to config/
```

**Complete workflow from setup to TripIt forwarding:**

1. **Initial scan phase** (30-60 minutes for 20 years): Run the fetcher script to search Gmail, score candidates, and populate the database:

```bash
npm run fetch-candidates -- --query "flight OR airline" --after "2000/01/01"
```

2. **Start the web application**:

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

3. **Review candidates** (2-4 hours for 6,000 emails at 30-40 emails/minute): Open browser to `http://localhost:5173`, use keyboard shortcuts for rapid review. Take breaks every 30-60 minutes to maintain focus.

4. **Export confirmed flights**: After completing reviews, export the confirmed list:

```bash
npm run export-confirmed -- --output confirmed_flights.json
```

5. **Bulk forward to TripIt** (2-3 days due to Gmail limits): Use the original forwarding script with the confirmed list:

```bash
npm run forward-to-tripit -- --batch-size 100 --delay 60
```

**Backend database manager with helper methods:**

```typescript
import Database from 'better-sqlite3';

interface EmailCandidate {
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

interface ReviewDecision {
  id: number;
  email_candidate_id: number;
  message_id: string;
  is_flight_confirmation: number;
  reviewed_at: string;
  notes?: string;
}

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private initDatabase(): void {
    // Create tables (SQL from earlier section)
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

  async getUnreviewedCandidates(limit: number = 20): Promise<EmailCandidate[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM email_candidates 
      WHERE reviewed = 0 
      ORDER BY confidence_score DESC, msg_date DESC
      LIMIT ?
    `);
    return stmt.all(limit) as EmailCandidate[];
  }

  async insertReviewDecision(
    emailCandidateId: number,
    messageId: string,
    isFlightConfirmation: boolean,
    notes?: string
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO review_decisions 
      (email_candidate_id, message_id, is_flight_confirmation, notes)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(emailCandidateId, messageId, isFlightConfirmation ? 1 : 0, notes);
  }

  async markAsReviewed(candidateId: number): Promise<void> {
    const stmt = this.db.prepare('UPDATE email_candidates SET reviewed = 1 WHERE id = ?');
    stmt.run(candidateId);
  }

  async countUnreviewed(): Promise<number> {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM email_candidates WHERE reviewed = 0');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  async countConfirmedFlights(): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM review_decisions 
      WHERE is_flight_confirmation = 1
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  async getCandidateByMessageId(messageId: string): Promise<EmailCandidate | undefined> {
    const stmt = this.db.prepare('SELECT * FROM email_candidates WHERE message_id = ?');
    return stmt.get(messageId) as EmailCandidate | undefined;
  }

  async insertConfirmedFlight(messageId: string, gmailUid: string, subject: string): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO confirmed_flights (message_id, gmail_uid, subject)
      VALUES (?, ?, ?)
    `);
    stmt.run(messageId, gmailUid, subject);
  }

  async insertCandidates(candidates: Omit<EmailCandidate, 'id' | 'fetched_at' | 'reviewed'>[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO email_candidates 
      (message_id, gmail_uid, subject, from_email, msg_date, html_content, plain_text, 
       confidence_score, detection_reasons)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insert = this.db.transaction((candidates) => {
      for (const c of candidates) {
        stmt.run(
          c.message_id, c.gmail_uid, c.subject, c.from_email, c.msg_date,
          c.html_content, c.plain_text, c.confidence_score, c.detection_reasons
        );
      }
    });

    insert(candidates);
  }
}
```

**Performance optimization with batch pre-loading and caching:**

```typescript
import { DatabaseManager } from './database';

interface EmailBatch {
  emails: any[];
}

export class EmailBatchLoader {
  private cache: any[] = [];
  private batchSize: number;
  private db: DatabaseManager;

  constructor(db: DatabaseManager, batchSize: number = 20) {
    this.db = db;
    this.batchSize = batchSize;
  }

  async getNextBatch(): Promise<any[]> {
    if (this.cache.length < this.batchSize) {
      // Pre-load next batch in background
      this.loadBatch();
    }

    // Return current cache and clear
    const batch = this.cache.slice(0, this.batchSize);
    this.cache = this.cache.slice(this.batchSize);
    return batch;
  }

  private async loadBatch(): Promise<void> {
    const newEmails = await this.db.getUnreviewedCandidates(this.batchSize * 2);
    this.cache.push(...newEmails);
  }
}
```

This ensures zero perceived load time between batches during review.

## Expected outcomes and timeline

**Review velocity of 30-40 emails per minute is achievable with keyboard shortcuts.** Assuming 2 seconds per decision average (1 second to assess, 1 second to press key), you'll process 30 emails/minute. For 6,000 candidate emails, expect 3-3.5 hours of active review time. Taking breaks every 30-60 minutes for focus, the complete review fits into a single day of work.

**False positive rate of 20-40% is acceptable with manual review.** With the relaxed 30% threshold, expect 1,200-2,400 non-flight emails in the 6,000 candidates. These are quickly rejected with a single keystroke. The benefit: near-zero false negatives—you won't miss true flight confirmations.

**Build and deploy timeline: 2-3 days for complete implementation.** Day 1: Backend API with Gmail integration, database setup, candidate fetching (6-8 hours). Day 2: Frontend UI with card interface, keyboard shortcuts, stats dashboard (6-8 hours). Day 3: Testing, refinement, initial candidate scan, and start review process (4-6 hours). The simpler scope compared to the full automated system—no complex parsing, deduplication, or forwarding logic—enables faster development.

**The web app approach provides flexibility and control.** You see every candidate before forwarding, eliminating anxiety about false positives being sent to TripIt. The relaxed filtering ensures comprehensive coverage without complex parsing logic. The Tinder-style interface makes the review process almost enjoyable, transforming a tedious classification task into a rapid swiping workflow. You can pause and resume at any time, review statistics continuously, and undo mistakes immediately.

This architecture balances automation (Gmail API, candidate scoring) with human judgment (final classification), providing the optimal mix of speed and accuracy for a one-time historical import project.
