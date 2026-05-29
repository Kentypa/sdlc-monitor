import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, GitGraph, Activity, ShieldCheck, Zap } from 'lucide-react';

export default function Home() {
  const [url, setUrl] = useState('https://github.com/nestjs/nest');
  const navigate = useNavigate();

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsedUrl = new URL(url);
      const parts = parsedUrl.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const owner = parts[0];
        const repo = parts[1];
        navigate(`/dashboard/${owner}/${repo}`);
      } else {
        alert('Invalid GitHub URL');
      }
    } catch {
      alert('Invalid URL format');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">

      {/* Hero Section */}
      <div className="text-center max-w-3xl mb-12">
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-[var(--text-main)] mb-6">
          Predict Project Risks <br />
          <span className="text-[var(--accent)]">Before They Happen</span>
        </h1>

        <p className="text-lg sm:text-xl text-[var(--text-muted)] leading-relaxed">
          Analyze GitHub repositories to detect developer burnout, measure code review efficiency, and predict project delays using empirical algorithms and logistic regression.
        </p>
      </div>

      {/* Search Input */}
      <div className="w-full max-w-2xl">
        <form onSubmit={handleAnalyze} className="relative group">
          <div className="relative flex items-center bg-[var(--bg-card)] rounded p-2 border border-[var(--border-color)] shadow-sm focus-within:border-[var(--accent)] transition-colors">
            <div className="p-3 text-[var(--text-muted)]">
              <GitGraph className="h-6 w-6" />
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full bg-transparent border-none outline-none text-[var(--text-main)] text-lg px-2 placeholder:text-[var(--text-muted)]/50"
            />
            <button
              type="submit"
              className="bg-[var(--accent)] text-white font-medium py-3 px-8 rounded hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <Search className="h-5 w-5" />
              <span>Analyze</span>
            </button>
          </div>
        </form>
      </div>

      {/* Features Cards */}
      <div className="grid sm:grid-cols-3 gap-6 mt-20 w-full max-w-5xl">
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-md p-6 flex flex-col items-center text-center gap-4">
          <div className="h-12 w-12 rounded bg-[var(--bg-base)] flex items-center justify-center">
            <Activity className="h-6 w-6 text-[var(--accent)]" />
          </div>
          <h3 className="font-bold text-lg text-[var(--text-main)]">Burnout Index</h3>
          <p className="text-[var(--text-muted)] text-sm">
            Detect developer fatigue based on overtime commits and extreme context switching.
          </p>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-md p-6 flex flex-col items-center text-center gap-4">
          <div className="h-12 w-12 rounded bg-[var(--bg-base)] flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-[var(--accent)]" />
          </div>
          <h3 className="font-bold text-lg text-[var(--text-main)]">ML Risk Score</h3>
          <p className="text-[var(--text-muted)] text-sm">
            Predict project delays using Logistic Regression combining burnout, churn, and lead time.
          </p>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-md p-6 flex flex-col items-center text-center gap-4">
          <div className="h-12 w-12 rounded bg-[var(--bg-base)] flex items-center justify-center">
            <GitGraph className="h-6 w-6 text-[var(--accent)]" />
          </div>
          <h3 className="font-bold text-lg text-[var(--text-main)]">Social Graph</h3>
          <p className="text-[var(--text-muted)] text-sm">
            Visualize code review interactions and identify bottlenecks in knowledge sharing.
          </p>
        </div>
      </div>
    </div>
  );
}
