import { EmailCard as EmailCardType } from '../types';

interface EmailCardProps {
  email: EmailCardType;
  showContent: boolean;
}

function EmailCard({ email, showContent }: EmailCardProps) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="meta">
          <span className="confidence-badge">{email.confidence_score}% confidence</span>
          <span className="date">{new Date(email.date).toLocaleDateString()}</span>
        </div>
        <h2 className="subject">{email.subject}</h2>
        <p className="from">{email.from_email}</p>
      </div>

      {email.highlights.length > 0 && (
        <div className="highlights">
          <strong>Detected:</strong>
          <ul>
            {email.highlights.map((highlight, i) => (
              <li key={i}>{highlight}</li>
            ))}
          </ul>
        </div>
      )}

      {showContent && email.html_content && (
        <div className="card-body">
          <iframe
            srcDoc={email.html_content}
            title="Email Content"
            sandbox="allow-same-origin"
            className="email-preview"
          />
        </div>
      )}

      {showContent && !email.html_content && (
        <div className="card-body">
          <div className="preview-text">{email.preview_text}</div>
        </div>
      )}
    </div>
  );
}

export default EmailCard;
