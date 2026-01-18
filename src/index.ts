import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types/env';
import api from './routes/api';

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use('*', cors());

// API routes
app.route('/api', api);

// SPA fallback - serve frontend for all other routes
app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
