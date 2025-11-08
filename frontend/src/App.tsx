import { useState, useEffect, useCallback } from 'react';
import { EmailCard, Stats } from './types';
import { getNextBatch, submitReview, getStats, undoLastReview } from './api';
import EmailCardComponent from './components/EmailCard';
import Controls from './components/Controls';
import StatsDisplay from './components/Stats';
import './App.css';

function App() {
  const [emails, setEmails] = useState<EmailCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showContent, setShowContent] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBatch = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getNextBatch(20);
      setEmails(data.emails);
      setCurrentIndex(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch emails');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStatsData = useCallback(async () => {
    try {
      const data = await getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  useEffect(() => {
    fetchBatch();
    fetchStatsData();
  }, [fetchBatch, fetchStatsData]);

  const handleDecision = useCallback(
    async (isFlightConfirmation: boolean) => {
      const currentEmail = emails[currentIndex];
      if (!currentEmail) return;

      try {
        await submitReview({
          email_id: currentEmail.id,
          is_flight_confirmation: isFlightConfirmation,
        });

        // Move to next email
        if (currentIndex >= emails.length - 3) {
          // Pre-fetch next batch when near end
          fetchBatch();
        } else {
          setCurrentIndex(currentIndex + 1);
        }

        fetchStatsData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit review');
      }
    },
    [emails, currentIndex, fetchBatch, fetchStatsData]
  );

  const handleUndo = useCallback(async () => {
    try {
      await undoLastReview();
      setCurrentIndex(Math.max(0, currentIndex - 1));
      fetchBatch();
      fetchStatsData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo');
    }
  }, [currentIndex, fetchBatch, fetchStatsData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'n' || e.key === 'N') {
        handleDecision(false);
      } else if (e.key === 'ArrowRight' || e.key === 'y' || e.key === 'Y') {
        handleDecision(true);
      } else if (e.key === 'u' || e.key === 'U') {
        handleUndo();
      } else if (e.key === 'h' || e.key === 'H') {
        setShowContent(!showContent);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleDecision, handleUndo, showContent]);

  const currentEmail = emails[currentIndex];

  if (loading && emails.length === 0) {
    return (
      <div className="app">
        <div className="loading">Loading emails...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>✈️ Flight Email Classifier</h1>
        {stats && <StatsDisplay stats={stats} />}
      </header>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="main-content">
        {currentEmail ? (
          <EmailCardComponent email={currentEmail} showContent={showContent} />
        ) : (
          <div className="empty-state">
            <h2>🎉 All done!</h2>
            <p>No more emails to review.</p>
            <button onClick={fetchBatch} className="btn">
              Check for more
            </button>
          </div>
        )}
      </div>

      <Controls
        onYes={() => handleDecision(true)}
        onNo={() => handleDecision(false)}
        onUndo={handleUndo}
        disabled={!currentEmail}
      />

      <div className="help">
        <button onClick={() => setShowContent(!showContent)}>
          {showContent ? 'Hide' : 'Show'} Content (H)
        </button>
        <span className="progress-text">
          {currentIndex + 1} / {emails.length}
        </span>
      </div>
    </div>
  );
}

export default App;
