import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Stats from '../components/Stats';
import { Stats as StatsType } from '../types';

describe('Stats', () => {
  const mockStats: StatsType = {
    total_candidates: 100,
    reviewed: 60,
    unreviewed: 40,
    confirmed_flights: 35,
    rejected: 25,
    review_rate: 60,
  };

  it('renders all stat items', () => {
    render(<Stats stats={mockStats} />);

    expect(screen.getByText('Reviewed:')).toBeInTheDocument();
    expect(screen.getByText('Remaining:')).toBeInTheDocument();
    expect(screen.getByText('Confirmed:')).toBeInTheDocument();
    expect(screen.getByText('Progress:')).toBeInTheDocument();
  });

  it('displays correct stat values', () => {
    render(<Stats stats={mockStats} />);

    expect(screen.getByText('60')).toBeInTheDocument(); // reviewed
    expect(screen.getByText('40')).toBeInTheDocument(); // unreviewed
    expect(screen.getByText('35')).toBeInTheDocument(); // confirmed
    expect(screen.getByText('60%')).toBeInTheDocument(); // review_rate
  });

  it('renders with zero stats', () => {
    const zeroStats: StatsType = {
      total_candidates: 0,
      reviewed: 0,
      unreviewed: 0,
      confirmed_flights: 0,
      rejected: 0,
      review_rate: 0,
    };

    render(<Stats stats={zeroStats} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
