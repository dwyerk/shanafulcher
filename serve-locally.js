const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;

// Resolve the archive directory path
let archiveDir = path.join(__dirname, 'archive');

// Allow overriding via environment variable or command-line arguments (e.g. node serve-locally.js --archive-dir /path/to/backup/archive)
const archiveDirArgIndex = process.argv.indexOf('--archive-dir');
if (archiveDirArgIndex !== -1 && process.argv[archiveDirArgIndex + 1]) {
  archiveDir = path.resolve(process.argv[archiveDirArgIndex + 1]);
} else if (process.env.ARCHIVE_DIR) {
  archiveDir = path.resolve(process.env.ARCHIVE_DIR);
}


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
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
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

  if (urlPath === '/archive') {
    res.writeHead(301, { 'Location': '/archive/' });
    res.end();
    return;
  }

  let filePath;
  let ext;

  const isArchiveRequest = urlPath.startsWith('/archive/') || urlPath === '/archive';

  if (isArchiveRequest) {
    let archiveSubPath = urlPath.slice(8); // Remove '/archive'
    if (archiveSubPath.startsWith('/')) {
      archiveSubPath = archiveSubPath.slice(1);
    }
    if (archiveSubPath === '') {
      archiveSubPath = 'index.html';
    }

    filePath = path.join(archiveDir, archiveSubPath);
    ext = path.extname(filePath).toLowerCase();

    if (!ext) {
      const potentialIndexPath = path.join(filePath, 'index.html');
      if (fs.existsSync(potentialIndexPath)) {
        filePath = potentialIndexPath;
        ext = '.html';
      } else {
        filePath = filePath + '.html';
        ext = '.html';
      }
    }
  } else {
    filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
    ext = path.extname(filePath).toLowerCase();

    if (!ext) {
      const potentialIndexPath = path.join(filePath, 'index.html');
      if (fs.existsSync(potentialIndexPath)) {
        filePath = potentialIndexPath;
        ext = '.html';
      } else {
        filePath = path.join(__dirname, 'index.html');
        ext = '.html';
      }
    }
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
  console.log(`Serving archive from: ${archiveDir}`);
  console.log(`Press Ctrl+C to stop.`);
  console.log(`=======================================================`);
});
