import { useState, useCallback, useEffect } from 'react';
import type { GameState, Celebrity, ResultMetrics, DistributionPoint, Response } from './types';

// API response types
interface StartSessionResponse {
  sessionId: string;
  totalCelebrities: number;
  currentIndex: number;
  celebrity: Celebrity;
}

interface SubmitResponseResponse {
  revealed: Celebrity;
  recognized: boolean;
  nextIndex: number;
  isComplete: boolean;
  nextCelebrity: Celebrity | null;
}

interface GetSessionResponse {
  sessionId: string;
  status: 'intro' | 'playing' | 'results';
  totalCelebrities: number;
  currentIndex: number;
  celebrity: Celebrity | null;
  responses: Response[];
}

interface ResultsResponse {
  distribution: DistributionPoint[];
  metrics: ResultMetrics;
  celebrities: Celebrity[];
  responses: Response[];
}

const initialState: GameState = {
  sessionId: null,
  status: 'intro',
  celebrities: [],
  currentIndex: 0,
  responses: [],
  currentCelebrity: null,
  lastResponse: null,
};

export default function App() {
  const [state, setState] = useState<GameState>(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{
    distribution: DistributionPoint[];
    metrics: ResultMetrics;
    celebrities: Celebrity[];
    responses: Response[];
  } | null>(null);

  // Check for existing session in localStorage
  useEffect(() => {
    const savedSession = localStorage.getItem('celebrity-game-session');
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        if (parsed.sessionId && parsed.status !== 'results') {
          // Offer to resume
          setState(prev => ({ ...prev, sessionId: parsed.sessionId }));
        }
      } catch {
        localStorage.removeItem('celebrity-game-session');
      }
    }
  }, []);

  const startGame = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/session/start', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to start game');

      const data: StartSessionResponse = await response.json();
      const newState: GameState = {
        sessionId: data.sessionId,
        status: 'playing',
        celebrities: [],
        currentIndex: 0,
        responses: [],
        currentCelebrity: data.celebrity,
        lastResponse: null,
      };

      setState(newState);
      localStorage.setItem('celebrity-game-session', JSON.stringify({
        sessionId: data.sessionId,
        status: 'playing',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const submitResponse = useCallback(async (recognized: boolean) => {
    if (!state.sessionId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/session/${state.sessionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recognized }),
      });

      if (!response.ok) throw new Error('Failed to submit response');

      const data: SubmitResponseResponse = await response.json();

      setState(prev => ({
        ...prev,
        status: 'reveal',
        currentCelebrity: data.revealed,
        lastResponse: recognized,
        currentIndex: data.nextIndex,
      }));

      // If complete, transition to results after reveal
      if (data.isComplete) {
        setTimeout(() => {
          setState(prev => ({ ...prev, status: 'results' }));
          fetchResults(state.sessionId!);
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [state.sessionId]);

  const nextCelebrity = useCallback(async () => {
    if (!state.sessionId) return;

    try {
      const response = await fetch(`/api/session/${state.sessionId}`);
      if (!response.ok) throw new Error('Failed to get session');

      const data: GetSessionResponse = await response.json();

      if (data.status === 'results') {
        setState(prev => ({ ...prev, status: 'results' }));
        fetchResults(state.sessionId!);
      } else {
        setState(prev => ({
          ...prev,
          status: 'playing',
          currentCelebrity: data.celebrity,
          currentIndex: data.currentIndex,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [state.sessionId]);

  const fetchResults = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/session/${sessionId}/results`);
      if (!response.ok) throw new Error('Failed to fetch results');
      const data: ResultsResponse = await response.json();
      setResults(data);
      localStorage.removeItem('celebrity-game-session');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const playAgain = useCallback(() => {
    setState(initialState);
    setResults(null);
    setError(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (state.status === 'playing' && !loading) {
        if (e.key === 'y' || e.key === 'Y' || e.key === 'ArrowLeft') {
          submitResponse(true);
        } else if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight') {
          submitResponse(false);
        }
      } else if (state.status === 'reveal' && !loading) {
        if (e.key === 'Enter' || e.key === ' ') {
          nextCelebrity();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.status, loading, submitResponse, nextCelebrity]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => { setError(null); playAgain(); }}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Intro Screen
  if (state.status === 'intro') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-4xl font-bold mb-2">What Era Are You From?</h1>
          <p className="text-slate-400 mb-8">A Celebrity Recognition Quiz</p>

          <div className="bg-slate-800 rounded-xl p-6 mb-8 text-left">
            <p className="mb-4">You'll see photos of <strong>40 celebrities</strong>.</p>
            <p className="mb-4">For each one, answer honestly:</p>
            <p className="text-xl font-medium text-center my-4">Do you RECOGNIZE this person?</p>
            <p className="text-slate-400 text-sm mb-4">
              (Not "do you know their name" — just "have I seen this face before")
            </p>
            <p>At the end, we'll show you which cultural era you're most connected to.</p>
          </div>

          <button
            onClick={startGame}
            disabled={loading}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 rounded-xl font-semibold text-lg transition-colors"
          >
            {loading ? 'Loading celebrities...' : 'Start Game'}
          </button>

          <p className="text-slate-500 text-sm mt-6">
            We don't store any personal data. This is just for fun.
          </p>
        </div>
      </div>
    );
  }

  // Playing Screen
  if (state.status === 'playing' && state.currentCelebrity) {
    const totalCelebrities = 40;
    const progress = (state.currentIndex / totalCelebrities) * 100;

    return (
      <div className="min-h-screen flex flex-col items-center p-4 pt-8">
        <div className="max-w-md w-full">
          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span>Progress</span>
              <span>{state.currentIndex + 1} / {totalCelebrities}</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Celebrity image */}
          <div className="aspect-square w-full bg-slate-800 rounded-2xl overflow-hidden mb-6">
            <img
              src={state.currentCelebrity.image_url}
              alt="Celebrity"
              className="w-full h-full object-cover"
              loading="eager"
            />
          </div>

          {/* Question */}
          <p className="text-xl text-center mb-6">Do you recognize this person?</p>

          {/* Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => submitResponse(true)}
              disabled={loading}
              className="py-4 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 rounded-xl font-semibold text-lg transition-colors"
            >
              Yes
              <span className="block text-sm font-normal opacity-75">I've seen them</span>
            </button>
            <button
              onClick={() => submitResponse(false)}
              disabled={loading}
              className="py-4 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 rounded-xl font-semibold text-lg transition-colors"
            >
              No
              <span className="block text-sm font-normal opacity-75">No idea</span>
            </button>
          </div>

          <p className="text-slate-500 text-sm text-center mt-4">
            Keyboard: Y/N or Arrow keys
          </p>
        </div>
      </div>
    );
  }

  // Reveal Screen
  if (state.status === 'reveal' && state.currentCelebrity) {
    const totalCelebrities = 40;
    const progress = (state.currentIndex / totalCelebrities) * 100;
    const isLastOne = state.currentIndex >= totalCelebrities;

    return (
      <div className="min-h-screen flex flex-col items-center p-4 pt-8">
        <div className="max-w-md w-full">
          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span>Progress</span>
              <span>{Math.min(state.currentIndex, totalCelebrities)} / {totalCelebrities}</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Celebrity image */}
          <div className="aspect-square w-full bg-slate-800 rounded-2xl overflow-hidden mb-4">
            <img
              src={state.currentCelebrity.image_url}
              alt={state.currentCelebrity.name}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Celebrity info */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-1">{state.currentCelebrity.name}</h2>
            <p className="text-slate-400 mb-3">{state.currentCelebrity.occupation}</p>
            {state.currentCelebrity.top_works.length > 0 && (
              <p className="text-slate-300">
                Known for: {state.currentCelebrity.top_works.join(', ')}
              </p>
            )}
          </div>

          {/* User's answer */}
          <div className={`text-center p-3 rounded-lg mb-6 ${
            state.lastResponse ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
          }`}>
            Your answer: {state.lastResponse ? 'Recognized' : 'Didn\'t recognize'}
          </div>

          {/* Next button */}
          {!isLastOne ? (
            <button
              onClick={nextCelebrity}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold text-lg transition-colors"
            >
              Next
            </button>
          ) : (
            <div className="text-center text-slate-400">
              Loading results...
            </div>
          )}
        </div>
      </div>
    );
  }

  // Results Screen
  if (state.status === 'results' && results) {
    // Group distribution by decade for chart
    const decadeData: Record<string, number[]> = {};
    for (const point of results.distribution) {
      const decade = `${Math.floor(point.year / 10) * 10}s`;
      if (!decadeData[decade]) decadeData[decade] = [];
      decadeData[decade].push(point.rate);
    }

    const decades = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
    const decadeAverages = decades.map(d => {
      const rates = decadeData[d] || [];
      return rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    });
    const maxRate = Math.max(...decadeAverages, 0.1);

    return (
      <div className="min-h-screen flex flex-col items-center p-4 pt-8">
        <div className="max-w-lg w-full">
          <h1 className="text-3xl font-bold text-center mb-8">Your Results</h1>

          {/* Era Chart */}
          <div className="bg-slate-800 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 text-center">Recognition Rate by Decade</h2>
            <div className="flex items-end justify-between h-40 gap-2">
              {decades.map((decade, i) => {
                const height = (decadeAverages[i] / maxRate) * 100;
                const isPeak = decade === results.metrics.peakDecade;
                return (
                  <div key={decade} className="flex-1 flex flex-col items-center">
                    <div
                      className={`w-full rounded-t transition-all duration-500 ${
                        isPeak ? 'bg-yellow-500' : 'bg-blue-500'
                      }`}
                      style={{ height: `${Math.max(height, 4)}%` }}
                    />
                    <span className="text-xs text-slate-400 mt-2">{decade.slice(0, 4)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center of Gravity */}
          <div className="bg-gradient-to-br from-purple-900/50 to-blue-900/50 rounded-xl p-6 mb-6 text-center">
            <p className="text-slate-300 mb-2">Your Cultural Center of Gravity</p>
            <p className="text-5xl font-bold text-yellow-400 mb-2">{results.metrics.centerOfGravity}</p>
            <p className="text-slate-300">
              You're most connected to the <strong>{results.metrics.peakDecade}</strong>
            </p>
          </div>

          {/* Quick Stats */}
          <div className="bg-slate-800 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Quick Stats</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-400">Overall recognition rate</span>
                <span className="font-medium">{results.metrics.overallRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Peak decade</span>
                <span className="font-medium">{results.metrics.peakDecade}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Knowledge breadth</span>
                <span className="font-medium">{results.metrics.breadth} years</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Nostalgia index</span>
                <span className="font-medium">
                  {results.metrics.nostalgiaIndex}x
                  {results.metrics.nostalgiaIndex > 1 ? ' (classic taste)' : ' (modern taste)'}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={playAgain}
              className="py-4 bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold transition-colors"
            >
              Play Again
            </button>
            <button
              onClick={() => {
                const text = `My cultural center of gravity is ${results.metrics.centerOfGravity}! I'm a ${results.metrics.peakDecade} person at heart. Take the quiz: ${window.location.origin}`;
                navigator.clipboard.writeText(text);
                alert('Copied to clipboard!');
              }}
              className="py-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold transition-colors"
            >
              Share
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-slate-400">Loading...</p>
      </div>
    </div>
  );
}
