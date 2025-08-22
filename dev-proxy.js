// Simple development proxy for GroupMe functions
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';

const app = express();

// Enable CORS for all requests
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

// Proxy GroupMe API requests to Firebase Functions
app.use('/api/groupme', createProxyMiddleware({
  target: 'https://qrwebaccdb.web.app',
  changeOrigin: true,
  secure: true,
  logLevel: 'debug',
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).send('Proxy error');
  }
}));

// Proxy other API requests
app.use('/api', createProxyMiddleware({
  target: 'https://qrwebaccdb.web.app',
  changeOrigin: true,
  secure: true
}));

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Development proxy server running on http://localhost:${PORT}`);
  console.log('Proxying /api/* requests to https://qrwebaccdb.web.app');
});