const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  // Parse URL and clean query strings / hash fragments
  let urlPath = req.url;
  const questionMarkIndex = urlPath.indexOf('?');
  if (questionMarkIndex !== -1) {
    urlPath = urlPath.substring(0, questionMarkIndex);
  }
  const hashIndex = urlPath.indexOf('#');
  if (hashIndex !== -1) {
    urlPath = urlPath.substring(0, hashIndex);
  }

  let filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  let ext = path.extname(filePath).toLowerCase();

  // If there's no extension, it's a client-side route. Fall back to index.html.
  if (!ext) {
    filePath = path.join(__dirname, 'index.html');
    ext = '.html';
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // If the path has an extension, it's a missing asset -> return 404
        if (path.extname(urlPath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
        } else {
          // Serve index.html as fallback for clean URLs
          fs.readFile(path.join(__dirname, 'index.html'), (err, indexContent) => {
            if (err) {
              res.writeHead(500);
              res.end('Error loading index.html');
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(indexContent, 'utf-8');
            }
          });
        }
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`Local SPA development server running at http://localhost:${PORT}/`);
  console.log(`Supporting page refreshes for routes like /updates`);
  console.log(`Press Ctrl+C to stop.`);
  console.log(`=======================================================`);
});
