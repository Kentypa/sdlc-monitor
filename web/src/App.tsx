import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { GitGraph, Activity, ShieldAlert, GitBranch, Menu, X, Moon, Sun } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';

function Navigation() {
  const [darkMode, setDarkMode] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [repoInput, setRepoInput] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoInput.trim()) return;

    // Parse github url or "owner/repo" format
    try {
      if (repoInput.includes('github.com')) {
        const url = new URL(repoInput);
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) navigate(`/dashboard/${parts[0]}/${parts[1]}`);
      } else {
        const parts = repoInput.split('/');
        if (parts.length === 2) navigate(`/dashboard/${parts[0]}/${parts[1]}`);
      }
    } catch {
      // ignore
    }
  };

  return (
    <>
      <nav className="bg-[var(--bg-card)] border-b border-[var(--border-color)] sticky top-0 z-50 px-4 py-3 sm:px-6 lg:px-8 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-[var(--accent)]">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <Link to="/" className="text-xl font-bold tracking-tight text-[var(--text-main)] hidden sm:block">
              SDLC<span className="text-indigo-500 font-light">Monitor</span>
            </Link>
          </div>

          {/* Search form in header */}
          <form onSubmit={handleSearch} className="flex-1 max-w-md mx-4 hidden md:block">
            <div className="relative">
              <input
                type="text"
                placeholder="owner/repo (e.g. nestjs/nest)"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                className="w-full bg-[var(--bg-base)] border border-[var(--border-color)] rounded px-4 py-1.5 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors text-[var(--text-main)]"
              />
            </div>
          </form>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded hover:bg-[var(--bg-base)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)]"
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden flex items-center gap-4">
            <button onClick={() => setDarkMode(!darkMode)} className="text-[var(--text-muted)]">
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-[var(--text-main)]">
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </nav>

      {isMobileMenuOpen && (
        <div className="md:hidden bg-[var(--bg-card)] border-b border-[var(--border-color)] absolute w-full z-40 p-4 flex flex-col gap-4 shadow-md">
          <form onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="owner/repo"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              className="w-full bg-[var(--bg-base)] border border-[var(--border-color)] rounded px-4 py-2 text-sm text-[var(--text-main)]"
            />
          </form>
          <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className="block px-4 py-2 text-base font-medium hover:bg-[var(--bg-base)] rounded">Home</Link>
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-[var(--bg-base)] transition-colors duration-300 flex flex-col">
        <Navigation />

        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard/:owner/:repo" element={<Dashboard />} />
          </Routes>
        </main>

        <footer className="border-t border-[var(--border-color)] py-8 mt-auto bg-[var(--bg-card)]/50">
          <div className="mx-auto max-w-7xl px-4 text-center text-[var(--text-muted)] flex flex-col items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-indigo-500" />
              <span className="font-medium text-[var(--text-main)]">Predictive SDLC Monitor</span>
            </div>
            <p className="text-sm max-w-md">
              MVP developed for thesis project. Predictive analytics for software development lifecycle using pure math and empirical algorithms.
            </p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
