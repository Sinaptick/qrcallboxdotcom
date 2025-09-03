// Simple HTTPS proxy to forward requests to your VM
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Create a self-signed certificate for local HTTPS
const options = {
  key: fs.readFileSync(path.join(__dirname, 'localhost-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'localhost-cert.pem'))
};

const server = https.createServer(options, (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Forward request to VM
  const vmUrl = `http://34.45.52.250:5002${req.url}`;
  console.log(`Proxying: ${req.method} ${vmUrl}`);
  
  const options = {
    method: req.method,
    headers: req.headers
  };
  
  delete options.headers.host;
  
  const proxyReq = http.request(vmUrl, options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  
  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err);
    res.writeHead(500);
    res.end('Proxy error');
  });
  
  req.pipe(proxyReq);
});

server.listen(8443, () => {
  console.log('HTTPS proxy running on https://localhost:8443');
  console.log('Update Chrome extension to use: https://localhost:8443');
});