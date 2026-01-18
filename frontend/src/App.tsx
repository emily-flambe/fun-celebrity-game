import { useState, useCallback, useEffect } from 'react';
import type { GameState, Celebrity, ResultMetrics, DistributionPoint, Response } from './types';

// API response types
interface StartSessionResponse {
  sessionId: string;
  totalCelebrities: number;
  celebrities: Celebrity[];
}

interface ResultsResponse {
  distribution: DistributionPoint[];
  metrics: ResultMetrics;
  celebrities: Celebrity[];
  responses: Response[];
}

// Local response tracking (before submitting to server)
interface LocalResponse {
  celebrityId: number;
  recognized: boolean;
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
  const [showMethodology, setShowMethodology] = useState(false);

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

  // Local responses state (stored until game complete)
  const [localResponses, setLocalResponses] = useState<Map<number, boolean>>(new Map());

  const startGame = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLocalResponses(new Map());

    try {
      const response = await fetch('/api/session/start', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to start game');

      const data: StartSessionResponse = await response.json();
      const newState: GameState = {
        sessionId: data.sessionId,
        status: 'playing',
        celebrities: data.celebrities,
        currentIndex: 0,
        responses: [],
        currentCelebrity: data.celebrities[0],
        lastResponse: null,
      };

      setState(newState);
      localStorage.setItem('celebrity-game-session', JSON.stringify({
        sessionId: data.sessionId,
        status: 'playing',
        celebrities: data.celebrities,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Record answer locally (no server call)
  const submitResponse = useCallback((recognized: boolean) => {
    if (!state.currentCelebrity) return;

    // Store response locally
    setLocalResponses(prev => {
      const updated = new Map(prev);
      updated.set(state.currentCelebrity!.id, recognized);
      return updated;
    });

    // Transition to reveal
    setState(prev => ({
      ...prev,
      status: 'reveal',
      lastResponse: recognized,
    }));
  }, [state.currentCelebrity]);

  // Go to next celebrity
  const nextCelebrity = useCallback(() => {
    const nextIndex = state.currentIndex + 1;

    if (nextIndex >= state.celebrities.length) {
      // Game complete - submit all responses to server
      completeGame();
    } else {
      // Check if we already have an answer for the next celebrity
      const nextCeleb = state.celebrities[nextIndex];
      const existingAnswer = localResponses.get(nextCeleb.id);

      setState(prev => ({
        ...prev,
        status: existingAnswer !== undefined ? 'reveal' : 'playing',
        currentIndex: nextIndex,
        currentCelebrity: nextCeleb,
        lastResponse: existingAnswer ?? null,
      }));
    }
  }, [state.currentIndex, state.celebrities, localResponses]);

  // Go back to previous celebrity
  const goBack = useCallback(() => {
    if (state.currentIndex <= 0) return;

    const prevIndex = state.currentIndex - 1;
    const prevCeleb = state.celebrities[prevIndex];
    const existingAnswer = localResponses.get(prevCeleb.id);

    setState(prev => ({
      ...prev,
      status: existingAnswer !== undefined ? 'reveal' : 'playing',
      currentIndex: prevIndex,
      currentCelebrity: prevCeleb,
      lastResponse: existingAnswer ?? null,
    }));
  }, [state.currentIndex, state.celebrities, localResponses]);

  // Change answer on current celebrity (from reveal back to playing)
  const changeAnswer = useCallback(() => {
    setState(prev => ({
      ...prev,
      status: 'playing',
      lastResponse: null,
    }));
  }, []);

  // Submit all responses and go to results
  const completeGame = useCallback(async () => {
    if (!state.sessionId) return;

    setLoading(true);
    try {
      // Build responses array from local state
      const responses = state.celebrities.map(celeb => ({
        celebrityId: celeb.id,
        recognized: localResponses.get(celeb.id) ?? false,
      }));

      await fetch(`/api/session/${state.sessionId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses }),
      });

      setState(prev => ({ ...prev, status: 'results' }));
      fetchResults(state.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, state.celebrities, localResponses]);

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
        if (e.key === 'y' || e.key === 'Y') {
          submitResponse(true);
        } else if (e.key === 'n' || e.key === 'N') {
          submitResponse(false);
        } else if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
          goBack();
        }
      } else if (state.status === 'reveal' && !loading) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
          nextCelebrity();
        } else if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
          goBack();
        } else if (e.key === 'c' || e.key === 'C') {
          changeAnswer();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.status, loading, submitResponse, nextCelebrity, goBack, changeAnswer]);

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
    const totalCelebrities = state.celebrities.length;
    const progress = (state.currentIndex / totalCelebrities) * 100;
    const canGoBack = state.currentIndex > 0;

    return (
      <div className="h-screen flex flex-col items-center p-4 pt-4 overflow-hidden">
        <div className="max-w-md w-full flex flex-col h-full">
          {/* Progress bar */}
          <div className="mb-3 flex-shrink-0">
            <div className="flex justify-between text-sm text-slate-400 mb-1">
              <span>Progress</span>
              <span>{state.currentIndex + 1} / {totalCelebrities}</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Celebrity image - flex-1 to fill available space with max constraint */}
          <div className="flex-1 min-h-0 flex items-center justify-center mb-3">
            <div className="w-full max-h-full aspect-[3/4] bg-slate-800 rounded-xl overflow-hidden">
              <img
                src={state.currentCelebrity.image_url}
                alt="Celebrity"
                className="w-full h-full object-cover"
                loading="eager"
              />
            </div>
          </div>

          {/* Question */}
          <p className="text-lg text-center mb-3 flex-shrink-0">Do you recognize this person?</p>

          {/* Buttons */}
          <div className="grid grid-cols-2 gap-3 flex-shrink-0">
            <button
              onClick={() => submitResponse(true)}
              disabled={loading}
              className="py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 rounded-xl font-semibold text-lg transition-colors"
            >
              Yes
            </button>
            <button
              onClick={() => submitResponse(false)}
              disabled={loading}
              className="py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 rounded-xl font-semibold text-lg transition-colors"
            >
              No
            </button>
          </div>

          {/* Back button */}
          {canGoBack && (
            <div className="mt-2 flex-shrink-0">
              <button
                onClick={goBack}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Reveal Screen
  if (state.status === 'reveal' && state.currentCelebrity) {
    const totalCelebrities = state.celebrities.length;
    const progress = ((state.currentIndex + 1) / totalCelebrities) * 100;
    const isLastOne = state.currentIndex >= totalCelebrities - 1;
    const canGoBack = state.currentIndex > 0;

    return (
      <div className="h-screen flex flex-col items-center p-4 pt-4 overflow-hidden">
        <div className="max-w-md w-full flex flex-col h-full">
          {/* Progress bar */}
          <div className="mb-3 flex-shrink-0">
            <div className="flex justify-between text-sm text-slate-400 mb-1">
              <span>Progress</span>
              <span>{state.currentIndex + 1} / {totalCelebrities}</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Celebrity image - smaller on reveal to make room for info */}
          <div className="flex-1 min-h-0 flex items-center justify-center mb-2">
            <div className="h-full max-w-[70%] aspect-[3/4] bg-slate-800 rounded-xl overflow-hidden">
              <img
                src={state.currentCelebrity.image_url}
                alt={state.currentCelebrity.name}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Celebrity info */}
          <div className="text-center mb-2 flex-shrink-0">
            <h2 className="text-xl font-bold">{state.currentCelebrity.name}</h2>
            <p className="text-slate-400 text-sm">{state.currentCelebrity.occupation}</p>
            {state.currentCelebrity.top_works.length > 0 && (
              <p className="text-slate-300 text-sm mt-1">
                Known for: {state.currentCelebrity.top_works.join(', ')}
              </p>
            )}
          </div>

          {/* User's answer with change option */}
          <button
            onClick={changeAnswer}
            className={`text-center py-2 px-3 rounded-lg mb-3 flex-shrink-0 text-sm transition-colors ${
              state.lastResponse
                ? 'bg-green-900/50 text-green-300 hover:bg-green-900/70'
                : 'bg-red-900/50 text-red-300 hover:bg-red-900/70'
            }`}
          >
            {state.lastResponse ? '✓ Recognized' : '✗ Didn\'t recognize'}
            <span className="text-xs opacity-60 ml-2">(click to change)</span>
          </button>

          {/* Navigation buttons */}
          <div className="flex gap-2 flex-shrink-0">
            {canGoBack && (
              <button
                onClick={goBack}
                className="py-3 px-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-medium transition-colors"
              >
                ←
              </button>
            )}
            <button
              onClick={isLastOne ? completeGame : nextCelebrity}
              disabled={loading}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 rounded-xl font-semibold text-lg transition-colors"
            >
              {loading ? 'Submitting...' : isLastOne ? 'See Results' : 'Next →'}
            </button>
          </div>
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
            <div className="flex items-end justify-between gap-2" style={{ height: '160px' }}>
              {decades.map((decade, i) => {
                const heightPercent = Math.max((decadeAverages[i] / maxRate) * 100, 4);
                const isPeak = decade === results.metrics.peakDecade;
                return (
                  <div key={decade} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div
                      className={`w-full rounded-t transition-all duration-500 ${
                        isPeak ? 'bg-yellow-500' : 'bg-blue-500'
                      }`}
                      style={{ height: `${heightPercent}%`, minHeight: '6px' }}
                    />
                    <span className="text-xs text-slate-400 mt-2 flex-shrink-0">{decade.slice(0, 4)}</span>
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

          {/* Methodology (expandable) */}
          <div className="bg-slate-800 rounded-xl mb-6 overflow-hidden">
            <button
              onClick={() => setShowMethodology(!showMethodology)}
              className="w-full p-4 flex justify-between items-center text-left hover:bg-slate-700/50 transition-colors"
            >
              <span className="font-medium text-slate-300">How is this calculated?</span>
              <span className={`text-slate-400 transition-transform ${showMethodology ? 'rotate-180' : ''}`}>
                ▼
              </span>
            </button>
            {showMethodology && (
              <div className="px-4 pb-4 text-sm text-slate-400 space-y-3">
                <p>
                  <strong className="text-slate-300">Celebrity Selection:</strong> We pull 40 popular celebrities
                  from TMDB's database, each with a "relevance window" based on when their most famous
                  works were released.
                </p>
                <p>
                  <strong className="text-slate-300">Era Distribution:</strong> For each year from 1950 to present,
                  we count how many celebrities with relevance in that year you recognized. The chart shows
                  this recognition rate averaged by decade.
                </p>
                <p>
                  <strong className="text-slate-300">Center of Gravity:</strong> A weighted average of all years,
                  where years with higher recognition rates pull the center toward them. It represents
                  your "cultural midpoint."
                </p>
                <p>
                  <strong className="text-slate-300">Knowledge Breadth:</strong> The span of years where your
                  recognition rate is at least 50% of your peak rate.
                </p>
                <p>
                  <strong className="text-slate-300">Nostalgia Index:</strong> Ratio of your pre-2000 recognition
                  rate to post-2000. Above 1.0 means you recognize more classic celebrities; below 1.0
                  means you're more tuned into modern culture.
                </p>
              </div>
            )}
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
                const tasteLabel = results.metrics.nostalgiaIndex > 1.2
                  ? 'classic film buff'
                  : results.metrics.nostalgiaIndex < 0.8
                    ? 'pop culture native'
                    : 'well-rounded cinephile';
                const text = `🎬 I'm a ${results.metrics.peakDecade} ${tasteLabel}!\n\nMy cultural center of gravity: ${results.metrics.centerOfGravity}\nRecognized ${results.metrics.overallRate}% of celebrities\n\nWhat era are you from? ${window.location.origin}`;
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
