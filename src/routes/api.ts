import { Hono } from 'hono';
import type { Env } from '../types/env';
import { fetchPopularPeople, buildCelebrityFromPerson, selectCelebritiesForSession, type Celebrity } from '../services/tmdb';

const api = new Hono<{ Bindings: Env }>();

// Health check
api.get('/health', (c) => c.json({ status: 'ok' }));

// Start a new game session
api.post('/session/start', async (c) => {
  const env = c.env;

  try {
    // Fetch popular people from TMDB (10 random pages from top 200 = ~200 people pool)
    const people = await fetchPopularPeople(env, 10);

    // Build celebrity data from known_for (no extra API calls needed)
    const celebrities: Celebrity[] = [];
    for (const person of people) {
      const celeb = buildCelebrityFromPerson(person);
      if (celeb) {
        celebrities.push(celeb);
      }
    }

    // Select celebrities for this session (aim for 40, minimum 5)
    const selected = selectCelebritiesForSession(celebrities, 40);

    if (selected.length < 5) {
      return c.json({ error: 'Not enough celebrity data available' }, 500);
    }

    // Create session in D1
    const sessionId = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO sessions (id, status, celebrities, current_index, responses) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      sessionId,
      'playing',
      JSON.stringify(selected),
      0,
      '[]'
    ).run();

    return c.json({
      sessionId,
      totalCelebrities: selected.length,
      currentIndex: 0,
      celebrity: selected[0],
    });
  } catch (error) {
    console.error('Session start error:', error);
    return c.json({ error: 'Failed to start session' }, 500);
  }
});

// Get current session state
api.get('/session/:id', async (c) => {
  const sessionId = c.req.param('id');

  const result = await c.env.DB.prepare(
    'SELECT * FROM sessions WHERE id = ?'
  ).bind(sessionId).first();

  if (!result) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const celebrities = JSON.parse(result.celebrities as string) as Celebrity[];
  const currentIndex = result.current_index as number;
  const responses = JSON.parse(result.responses as string);

  return c.json({
    sessionId,
    status: result.status,
    totalCelebrities: celebrities.length,
    currentIndex,
    celebrity: currentIndex < celebrities.length ? celebrities[currentIndex] : null,
    responses,
  });
});

// Submit a response
api.post('/session/:id/respond', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json() as { recognized: boolean };

  const result = await c.env.DB.prepare(
    'SELECT * FROM sessions WHERE id = ?'
  ).bind(sessionId).first();

  if (!result) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const celebrities = JSON.parse(result.celebrities as string) as Celebrity[];
  const currentIndex = result.current_index as number;
  const responses = JSON.parse(result.responses as string) as Array<{
    celebrityId: number;
    recognized: boolean;
    timestamp: string;
  }>;

  if (currentIndex >= celebrities.length) {
    return c.json({ error: 'Session already complete' }, 400);
  }

  // Record response
  responses.push({
    celebrityId: celebrities[currentIndex].id,
    recognized: body.recognized,
    timestamp: new Date().toISOString(),
  });

  const nextIndex = currentIndex + 1;
  const isComplete = nextIndex >= celebrities.length;

  // Update session
  await c.env.DB.prepare(
    'UPDATE sessions SET current_index = ?, responses = ?, status = ?, completed_at = ? WHERE id = ?'
  ).bind(
    nextIndex,
    JSON.stringify(responses),
    isComplete ? 'results' : 'playing',
    isComplete ? new Date().toISOString() : null,
    sessionId
  ).run();

  // Return current celebrity for reveal
  const currentCelebrity = celebrities[currentIndex];

  return c.json({
    revealed: currentCelebrity,
    recognized: body.recognized,
    nextIndex,
    isComplete,
    nextCelebrity: !isComplete ? celebrities[nextIndex] : null,
  });
});

// Get results
api.get('/session/:id/results', async (c) => {
  const sessionId = c.req.param('id');

  const result = await c.env.DB.prepare(
    'SELECT * FROM sessions WHERE id = ?'
  ).bind(sessionId).first();

  if (!result) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const celebrities = JSON.parse(result.celebrities as string) as Celebrity[];
  const responses = JSON.parse(result.responses as string) as Array<{
    celebrityId: number;
    recognized: boolean;
  }>;

  // Compute era distribution
  const currentYear = new Date().getFullYear();
  const yearScores: Record<number, { recognized: number; total: number }> = {};

  for (let year = 1950; year <= currentYear; year++) {
    yearScores[year] = { recognized: 0, total: 0 };
  }

  for (const response of responses) {
    const celeb = celebrities.find(c => c.id === response.celebrityId);
    if (!celeb) continue;

    for (let year = celeb.relevance_window.start; year <= celeb.relevance_window.end; year++) {
      if (yearScores[year]) {
        yearScores[year].total += 1;
        if (response.recognized) {
          yearScores[year].recognized += 1;
        }
      }
    }
  }

  // Convert to distribution
  const distribution: Array<{ year: number; rate: number; sampleSize: number }> = [];
  for (const [yearStr, scores] of Object.entries(yearScores)) {
    const year = parseInt(yearStr, 10);
    if (scores.total > 0) {
      distribution.push({
        year,
        rate: scores.recognized / scores.total,
        sampleSize: scores.total,
      });
    }
  }

  // Smooth distribution (5-year window)
  const smoothed = distribution.map((point, i) => {
    const windowSize = 5;
    const half = Math.floor(windowSize / 2);
    const windowStart = Math.max(0, i - half);
    const windowEnd = Math.min(distribution.length - 1, i + half);

    let totalWeight = 0;
    let weightedSum = 0;

    for (let j = windowStart; j <= windowEnd; j++) {
      const weight = distribution[j].sampleSize;
      weightedSum += distribution[j].rate * weight;
      totalWeight += weight;
    }

    return {
      year: point.year,
      rate: totalWeight > 0 ? weightedSum / totalWeight : 0,
    };
  });

  // Compute summary metrics
  const decadeRates: Record<string, { total: number; sum: number }> = {};
  for (const point of smoothed) {
    const decade = `${Math.floor(point.year / 10) * 10}s`;
    if (!decadeRates[decade]) {
      decadeRates[decade] = { total: 0, sum: 0 };
    }
    decadeRates[decade].total++;
    decadeRates[decade].sum += point.rate;
  }

  let peakDecade = '1990s';
  let peakAvgRate = 0;
  for (const [decade, stats] of Object.entries(decadeRates)) {
    const avgRate = stats.total > 0 ? stats.sum / stats.total : 0;
    if (avgRate > peakAvgRate) {
      peakAvgRate = avgRate;
      peakDecade = decade;
    }
  }

  // Center of gravity
  let totalWeight = 0;
  let weightedYearSum = 0;
  for (const point of distribution) {
    const weight = point.rate * point.sampleSize;
    weightedYearSum += point.year * weight;
    totalWeight += weight;
  }
  const centerOfGravity = totalWeight > 0 ? Math.round(weightedYearSum / totalWeight) : currentYear;

  // Overall recognition rate
  const totalRecognized = responses.filter(r => r.recognized).length;
  const overallRate = responses.length > 0 ? totalRecognized / responses.length : 0;

  // Breadth calculation
  const peakRate = Math.max(...distribution.map(d => d.rate), 0.01);
  const threshold = peakRate * 0.5;
  const yearsAboveThreshold = distribution.filter(d => d.rate >= threshold).map(d => d.year);
  const breadth = yearsAboveThreshold.length > 0
    ? Math.max(...yearsAboveThreshold) - Math.min(...yearsAboveThreshold)
    : 0;

  // Nostalgia index
  const pre2000 = smoothed.filter(d => d.year < 2000);
  const post2000 = smoothed.filter(d => d.year >= 2000);
  const pre2000Avg = pre2000.length > 0 ? pre2000.reduce((s, d) => s + d.rate, 0) / pre2000.length : 0;
  const post2000Avg = post2000.length > 0 ? post2000.reduce((s, d) => s + d.rate, 0) / post2000.length : 0;
  const nostalgiaIndex = post2000Avg > 0 ? pre2000Avg / post2000Avg : 1;

  return c.json({
    distribution: smoothed,
    metrics: {
      peakDecade,
      centerOfGravity,
      breadth,
      overallRate: Math.round(overallRate * 100),
      nostalgiaIndex: Math.round(nostalgiaIndex * 10) / 10,
    },
    celebrities,
    responses,
  });
});

export default api;
