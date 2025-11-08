import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmailCard from '../components/EmailCard';
import { EmailCard as EmailCardType } from '../types';

describe('EmailCard', () => {
  const mockEmail: EmailCardType = {
    id: 'test-1',
    subject: 'Test Flight Confirmation',
    from_email: 'noreply@united.com',
    date: '2024-01-01T12:00:00Z',
    preview_text: 'Your flight is confirmed',
    html_content: '<html><body>Flight details</body></html>',
    confidence_score: 85,
    highlights: ['Known airline sender', 'Flight keyword in subject'],
  };

  it('renders email subject', () => {
    render(<EmailCard email={mockEmail} showContent={true} />);
    expect(screen.getByText('Test Flight Confirmation')).toBeInTheDocument();
  });

  it('renders email sender', () => {
    render(<EmailCard email={mockEmail} showContent={true} />);
    expect(screen.getByText('noreply@united.com')).toBeInTheDocument();
  });

  it('renders confidence score', () => {
    render(<EmailCard email={mockEmail} showContent={true} />);
    expect(screen.getByText('85% confidence')).toBeInTheDocument();
  });

  it('renders highlights', () => {
    render(<EmailCard email={mockEmail} showContent={true} />);
    expect(screen.getByText('Known airline sender')).toBeInTheDocument();
    expect(screen.getByText('Flight keyword in subject')).toBeInTheDocument();
  });

  it('shows email content when showContent is true', () => {
    render(<EmailCard email={mockEmail} showContent={true} />);
    const iframe = screen.getByTitle('Email Content');
    expect(iframe).toBeInTheDocument();
  });

  it('hides email content when showContent is false', () => {
    render(<EmailCard email={mockEmail} showContent={false} />);
    const iframe = screen.queryByTitle('Email Content');
    expect(iframe).not.toBeInTheDocument();
  });

  it('shows preview text when no html content', () => {
    const emailWithoutHtml = { ...mockEmail, html_content: undefined };
    render(<EmailCard email={emailWithoutHtml} showContent={true} />);
    expect(screen.getByText('Your flight is confirmed')).toBeInTheDocument();
  });
});
