# Flight Email Classifier Web App: Tinder-Style Review Interface

**A web application for manual review and classification of potential flight confirmation emails.** This system presents candidate emails one at a time in a card-based interface where you swipe right (or click "Yes") for flight confirmations and swipe left (or click "No") for non-flight emails. The architecture uses a Python backend with relaxed classification thresholds (30-40% confidence instead of 50%+) to maximize recall, letting you make the final classification decision through an intuitive review process.

The technical approach combines Gmail API for email retrieval, a lightweight Python web framework (Flask or FastAPI) for the backend, a React or vanilla JavaScript frontend with card-swiping UI, and SQLite for tracking review decisions. This design prioritizes user experience—quick load times, keyboard shortcuts, email preview with highlighting, and progress tracking—while ensuring no confirmation emails are missed through conservative initial filtering.

## Architecture overview: Backend, frontend, and data flow

**Use FastAPI for the backend with async support and automatic API documentation.** FastAPI provides excellent performance, built-in validation with Pydantic, automatic OpenAPI documentation, and WebSocket support for real-time updates. Install with `pip install fastapi uvicorn[standard] python-multipart`:

```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uvicorn

app = FastAPI(title="Flight Email Classifier", version="1.0.0")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class EmailCard(BaseModel):
    id: str
    subject: str
    from_email: str
    date: str
    preview_text: str
    html_content: Optional[str]
    confidence_score: int
    highlights: List[str] = []

class ReviewDecision(BaseModel):
    email_id: str
    is_flight_confirmation: bool
    notes: Optional[str] = None

@app.get("/")
def read_root():
    return {"message": "Flight Email Classifier API"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

Alternative: Flask with `pip install flask flask-cors` for simpler setup if you don't need async features. FastAPI's automatic `/docs` endpoint provides interactive API testing without additional tools.

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

```python
def calculate_confidence_score(email_data):
    score = 0
    reasons = []
    
    # Schema.org FlightReservation (highest confidence)
    if has_flight_reservation_schema(email_data['html']):
        score += 50
        reasons.append("Has FlightReservation schema markup")
    
    # Airline/OTA sender domain
    known_senders = [
        'united.com', 'delta.com', 'aa.com', 'southwest.com',
        'jetblue.com', 'expedia.com', 'kayak.com', 'priceline.com'
    ]
    if any(domain in email_data['from_email'].lower() for domain in known_senders):
        score += 20
        reasons.append(f"Known airline/OTA sender")
    
    # Subject line patterns (relaxed)
    confirmation_keywords = ['confirmation', 'confirmed', 'itinerary', 'booking']
    if any(kw in email_data['subject'].lower() for kw in confirmation_keywords):
        score += 15
        reasons.append("Confirmation keyword in subject")
    
    # Flight-related keywords in subject
    flight_keywords = ['flight', 'airline', 'boarding', 'departure']
    if any(kw in email_data['subject'].lower() for kw in flight_keywords):
        score += 10
        reasons.append("Flight keyword in subject")
    
    # Content markers (any 2+ markers)
    text = email_data.get('plain_text', '')
    markers_found = []
    if re.search(r'\b[A-Z0-9]{6}\b', text):
        markers_found.append("confirmation code")
    if re.search(r'\b[A-Z]{2}\d{1,4}\b', text):
        markers_found.append("flight number")
    if re.search(r'\b[A-Z]{3}\b', text):
        markers_found.append("airport code")
    
    if len(markers_found) >= 2:
        score += 10
        reasons.append(f"Flight markers: {', '.join(markers_found)}")
    
    return score, reasons

# Classify as candidate if score >= 30 (was 50+ in original spec)
def is_candidate_for_review(email_data):
    score, reasons = calculate_confidence_score(email_data)
    return score >= 30, score, reasons
```

This relaxed threshold catches more potential emails at the cost of increased review volume. A 20-year email history with 5,000 true flight confirmations might yield 6,000-8,000 candidates (20-60% false positive rate), but ensures minimal missed flights.

**Optimize the Gmail search query for breadth rather than precision.** Use an expansive search that prioritizes recall:

```python
# Relaxed search query
query = '''
    (flight OR airline OR boarding OR departure OR arrival OR itinerary OR confirmation)
    OR from:(united.com OR delta.com OR aa.com OR southwest.com OR jetblue.com OR 
             expedia.com OR kayak.com OR priceline.com OR booking.com)
    after:2000/01/01
'''
```

This casts a wider net, accepting that the manual review step filters out false positives. You can further expand by adding more airline domains or travel-related keywords.

**Pre-fetch and cache email content during initial scan phase.** Run a background job that searches Gmail, scores candidates, and stores full HTML/text content in the database:

```python
import asyncio
from googleapiclient.discovery import build

class EmailFetcher:
    def __init__(self, gmail_service, db_manager):
        self.service = gmail_service
        self.db = db_manager
    
    async def fetch_and_score_candidates(self, query):
        messages = self.list_messages_with_pagination(query)
        
        candidates = []
        for msg in messages:
            # Fetch full message content
            full_msg = self.service.users().messages().get(
                userId='me',
                id=msg['id'],
                format='full'
            ).execute()
            
            email_data = self.extract_email_data(full_msg)
            is_candidate, score, reasons = is_candidate_for_review(email_data)
            
            if is_candidate:
                candidates.append({
                    'message_id': email_data['message_id'],
                    'gmail_uid': msg['id'],
                    'subject': email_data['subject'],
                    'from_email': email_data['from'],
                    'msg_date': email_data['date'],
                    'html_content': email_data['html'],
                    'plain_text': email_data['text'],
                    'confidence_score': score,
                    'detection_reasons': json.dumps(reasons)
                })
            
            # Rate limiting
            await asyncio.sleep(0.1)
        
        # Bulk insert into database
        self.db.insert_candidates(candidates)
        return len(candidates)
```

This one-time fetch operation runs before you start reviewing, ensuring fast load times in the web interface. For 20 years of email, expect 30-60 minutes for the initial scan with rate limiting.

## API endpoints: Backend routes for email review workflow

**Implement REST endpoints for fetching candidates and submitting decisions:**

```python
from fastapi import FastAPI, HTTPException, Query
from typing import Optional, List
import json

@app.get("/api/emails/next-batch")
async def get_next_batch(batch_size: int = Query(20, ge=1, le=100)):
    """Fetch next batch of unreviewed email candidates."""
    candidates = db.get_unreviewed_candidates(limit=batch_size)
    
    if not candidates:
        return {"emails": [], "message": "No more emails to review"}
    
    emails = []
    for c in candidates:
        emails.append({
            "id": c['message_id'],
            "subject": c['subject'],
            "from_email": c['from_email'],
            "date": c['msg_date'],
            "preview_text": c['preview_text'],
            "html_content": c['html_content'],
            "confidence_score": c['confidence_score'],
            "highlights": json.loads(c['detection_reasons'])
        })
    
    return {"emails": emails, "total_remaining": db.count_unreviewed()}

@app.post("/api/emails/review")
async def submit_review(decision: ReviewDecision):
    """Record user's classification decision."""
    # Find candidate
    candidate = db.get_candidate_by_message_id(decision.email_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Email not found")
    
    # Record decision
    db.insert_review_decision(
        email_candidate_id=candidate['id'],
        message_id=decision.email_id,
        is_flight_confirmation=decision.is_flight_confirmation,
        notes=decision.notes
    )
    
    # Mark as reviewed
    db.mark_as_reviewed(candidate['id'])
    
    # If confirmed flight, add to processing queue
    if decision.is_flight_confirmation:
        db.insert_confirmed_flight(
            message_id=decision.email_id,
            gmail_uid=candidate['gmail_uid'],
            subject=candidate['subject']
        )
    
    return {"status": "success", "remaining": db.count_unreviewed()}

@app.get("/api/stats")
async def get_stats():
    """Get review progress statistics."""
    return {
        "total_candidates": db.count_total_candidates(),
        "reviewed": db.count_reviewed(),
        "unreviewed": db.count_unreviewed(),
        "confirmed_flights": db.count_confirmed_flights(),
        "rejected": db.count_rejected(),
        "review_rate": db.calculate_review_rate()  # emails/minute
    }

@app.post("/api/emails/undo")
async def undo_last_review():
    """Undo the most recent review decision."""
    last_decision = db.get_last_decision()
    if not last_decision:
        raise HTTPException(status_code=404, detail="No decisions to undo")
    
    db.delete_decision(last_decision['id'])
    db.mark_as_unreviewed(last_decision['email_candidate_id'])
    
    return {"status": "success", "undone_email_id": last_decision['message_id']}

@app.get("/api/emails/search")
async def search_candidates(q: str, reviewed: Optional[bool] = None):
    """Search candidates by subject, sender, or content."""
    results = db.search_candidates(query=q, reviewed_filter=reviewed)
    return {"results": results, "count": len(results)}
```

These endpoints provide the complete CRUD operations needed for the review workflow. The `/next-batch` endpoint returns multiple emails at once for pre-loading, improving perceived performance.

**Add WebSocket support for real-time progress updates:**

```python
from fastapi import WebSocket, WebSocketDisconnect
from typing import List

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
    
    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Broadcast updates after each review
@app.post("/api/emails/review")
async def submit_review(decision: ReviewDecision):
    # ... existing code ...
    
    # Broadcast progress update
    await manager.broadcast({
        "type": "progress_update",
        "reviewed": db.count_reviewed(),
        "remaining": db.count_unreviewed()
    })
    
    return {"status": "success"}
```

WebSocket updates enable showing live progress if multiple users review simultaneously or if you have the app open on multiple devices.

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
├── requirements.txt
├── package.json
├── .env.example
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── gmail_client.py
│   ├── classifier.py
│   └── models.py
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── components/
│   │   │   ├── EmailCard.jsx
│   │   │   ├── Controls.jsx
│   │   │   └── Stats.jsx
│   │   └── api/
│   │       └── client.js
│   ├── index.html
│   └── vite.config.js
├── config/
│   ├── credentials.json
│   └── settings.py
└── data/
    └── emails.db
```

**Installation and setup steps:**

```bash
# Backend setup
cd gmail-flight-reviewer
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install fastapi uvicorn[standard] google-api-python-client google-auth-oauthlib
pip install beautifulsoup4 lxml sqlalchemy python-multipart

# Frontend setup
cd frontend
npm create vite@latest . -- --template react
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
python backend/fetch_candidates.py --query "flight OR airline" --after "2000/01/01"
```

2. **Start the web application**:

```bash
# Terminal 1: Backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev
```

3. **Review candidates** (2-4 hours for 6,000 emails at 30-40 emails/minute): Open browser to `http://localhost:5173`, use keyboard shortcuts for rapid review. Take breaks every 30-60 minutes to maintain focus.

4. **Export confirmed flights**: After completing reviews, export the confirmed list:

```bash
python backend/export_confirmed.py --output confirmed_flights.json
```

5. **Bulk forward to TripIt** (2-3 days due to Gmail limits): Use the original forwarding script with the confirmed list:

```bash
python backend/forward_to_tripit.py --batch-size 100 --delay 60
```

**Backend database manager with helper methods:**

```python
import sqlite3
from contextlib import contextmanager
from typing import List, Optional, Dict

class DatabaseManager:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_database()
    
    @contextmanager
    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    
    def get_unreviewed_candidates(self, limit: int = 20) -> List[Dict]:
        with self.get_connection() as conn:
            cursor = conn.execute("""
                SELECT * FROM email_candidates 
                WHERE reviewed = 0 
                ORDER BY confidence_score DESC, msg_date DESC
                LIMIT ?
            """, (limit,))
            return [dict(row) for row in cursor.fetchall()]
    
    def insert_review_decision(self, email_candidate_id: int, 
                              message_id: str, 
                              is_flight_confirmation: bool,
                              notes: Optional[str] = None):
        with self.get_connection() as conn:
            conn.execute("""
                INSERT INTO review_decisions 
                (email_candidate_id, message_id, is_flight_confirmation, notes)
                VALUES (?, ?, ?, ?)
            """, (email_candidate_id, message_id, is_flight_confirmation, notes))
    
    def mark_as_reviewed(self, candidate_id: int):
        with self.get_connection() as conn:
            conn.execute("""
                UPDATE email_candidates SET reviewed = 1 WHERE id = ?
            """, (candidate_id,))
    
    def count_unreviewed(self) -> int:
        with self.get_connection() as conn:
            result = conn.execute(
                "SELECT COUNT(*) FROM email_candidates WHERE reviewed = 0"
            ).fetchone()
            return result[0]
    
    def count_confirmed_flights(self) -> int:
        with self.get_connection() as conn:
            result = conn.execute("""
                SELECT COUNT(*) FROM review_decisions 
                WHERE is_flight_confirmation = 1
            """).fetchone()
            return result[0]
```

**Performance optimization with batch pre-loading and caching:**

```python
# Pre-load next batch while user reviews current batch
from concurrent.futures import ThreadPoolExecutor

class EmailBatchLoader:
    def __init__(self, db: DatabaseManager, batch_size: int = 20):
        self.db = db
        self.batch_size = batch_size
        self.cache = []
        self.executor = ThreadPoolExecutor(max_workers=2)
    
    async def get_next_batch(self) -> List[Dict]:
        if len(self.cache) < self.batch_size:
            # Pre-load next batch in background
            self.executor.submit(self._load_batch)
        
        # Return current cache and clear
        batch = self.cache[:self.batch_size]
        self.cache = self.cache[self.batch_size:]
        return batch
    
    def _load_batch(self):
        new_emails = self.db.get_unreviewed_candidates(self.batch_size * 2)
        self.cache.extend(new_emails)
```

This ensures zero perceived load time between batches during review.

## Expected outcomes and timeline

**Review velocity of 30-40 emails per minute is achievable with keyboard shortcuts.** Assuming 2 seconds per decision average (1 second to assess, 1 second to press key), you'll process 30 emails/minute. For 6,000 candidate emails, expect 3-3.5 hours of active review time. Taking breaks every 30-60 minutes for focus, the complete review fits into a single day of work.

**False positive rate of 20-40% is acceptable with manual review.** With the relaxed 30% threshold, expect 1,200-2,400 non-flight emails in the 6,000 candidates. These are quickly rejected with a single keystroke. The benefit: near-zero false negatives—you won't miss true flight confirmations.

**Build and deploy timeline: 2-3 days for complete implementation.** Day 1: Backend API with Gmail integration, database setup, candidate fetching (6-8 hours). Day 2: Frontend UI with card interface, keyboard shortcuts, stats dashboard (6-8 hours). Day 3: Testing, refinement, initial candidate scan, and start review process (4-6 hours). The simpler scope compared to the full automated system—no complex parsing, deduplication, or forwarding logic—enables faster development.

**The web app approach provides flexibility and control.** You see every candidate before forwarding, eliminating anxiety about false positives being sent to TripIt. The relaxed filtering ensures comprehensive coverage without complex parsing logic. The Tinder-style interface makes the review process almost enjoyable, transforming a tedious classification task into a rapid swiping workflow. You can pause and resume at any time, review statistics continuously, and undo mistakes immediately.

This architecture balances automation (Gmail API, candidate scoring) with human judgment (final classification), providing the optimal mix of speed and accuracy for a one-time historical import project.
