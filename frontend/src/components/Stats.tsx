import { Stats as StatsType } from '../types';

interface StatsProps {
  stats: StatsType;
}

function Stats({ stats }: StatsProps) {
  return (
    <div className="stats">
      <div className="stat-item">
        <span className="stat-label">Reviewed:</span>
        <span className="stat-value">{stats.reviewed}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Remaining:</span>
        <span className="stat-value">{stats.unreviewed}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Confirmed:</span>
        <span className="stat-value">{stats.confirmed_flights}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Progress:</span>
        <span className="stat-value">{stats.review_rate}%</span>
      </div>
    </div>
  );
}

export default Stats;
