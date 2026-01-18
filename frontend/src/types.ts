export interface Celebrity {
  id: number;
  name: string;
  image_url: string;
  relevance_window: { start: number; end: number };
  occupation: string;
  popularity_score: number;
  top_works: string[];
}

export interface Response {
  celebrityId: number;
  recognized: boolean;
  timestamp: string;
}

export interface GameState {
  sessionId: string | null;
  status: 'intro' | 'playing' | 'reveal' | 'results';
  celebrities: Celebrity[];
  currentIndex: number;
  responses: Response[];
  currentCelebrity: Celebrity | null;
  lastResponse: boolean | null;
}

export interface ResultMetrics {
  peakDecade: string;
  centerOfGravity: number;
  breadth: number;
  overallRate: number;
  nostalgiaIndex: number;
}

export interface DistributionPoint {
  year: number;
  rate: number;
}
