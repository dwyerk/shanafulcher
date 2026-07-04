const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { JSDOM } = require('jsdom');

// Resolve the archive directory path
let archiveDir = path.join(__dirname, 'archive');
const archiveDirArgIndex = process.argv.indexOf('--archive-dir');
if (archiveDirArgIndex !== -1 && process.argv[archiveDirArgIndex + 1]) {
  archiveDir = path.resolve(process.argv[archiveDirArgIndex + 1]);
} else if (process.env.ARCHIVE_DIR) {
  archiveDir = path.resolve(process.env.ARCHIVE_DIR);
}

const ARCHIVE_DIR = archiveDir;

// Cache to avoid duplicate downloads
const downloadedAssets = new Set();

// Helper to request content from a URL
function fetchUrlContent(urlStr) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const client = parsed.protocol === 'https:' ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      }
    };
    client.get(urlStr, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, urlStr).href;
        return fetchUrlContent(redirectUrl).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// Download helper
async function downloadAsset(urlStr, destPath) {
  const normalizedUrl = urlStr.split('?')[0].split('#')[0];
  if (downloadedAssets.has(normalizedUrl)) {
    return true;
  }
  const fullDestPath = path.join(ARCHIVE_DIR, destPath);
  const dirName = path.dirname(fullDestPath);
  if (!fs.existsSync(dirName)) {
    fs.mkdirSync(dirName, { recursive: true });
  }
  try {
    console.log(`Downloading: ${urlStr} -> ${destPath}`);
    const data = await fetchUrlContent(urlStr);
    fs.writeFileSync(fullDestPath, data);
    downloadedAssets.add(normalizedUrl);
    return true;
  } catch (err) {
    console.error(`Failed to download ${urlStr}: ${err.message}`);
    return false;
  }
}

// Find all HTML files recursively
function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      if (f !== 'assets') {
        walkDir(dirPath, callback);
      }
    } else {
      callback(dirPath);
    }
  });
}

async function fixHtmlFile(filePath) {
  console.log(`\nProcessing HTML file: ${filePath}`);
  const html = fs.readFileSync(filePath, 'utf8');
  const dom = new JSDOM(html);
  const { document } = dom.window;

  // 1. Resolve and download high-resolution images
  const elementsWithImageInfo = Array.from(document.querySelectorAll('[data-image-info]'));
  for (const el of elementsWithImageInfo) {
    const rawInfo = el.getAttribute('data-image-info');
    let imageInfo;
    try {
      imageInfo = JSON.parse(rawInfo);
    } catch (e) {
      continue;
    }

    if (!imageInfo || !imageInfo.imageData || !imageInfo.imageData.uri) {
      continue;
    }

    const img = el.querySelector('img');
    if (!img) continue;

    const src = img.getAttribute('src');
    if (!src) continue;

    // Check if the src is a wixstatic media image
    const lqipMatch = src.match(/(assets\/wixstatic\/media|wixstatic\/media)\/(.+)$/);
    if (lqipMatch) {
      const relativePathSuffix = lqipMatch[2];
      const targetWidth = imageInfo.targetWidth || imageInfo.imageData.width;
      const targetHeight = imageInfo.targetHeight || imageInfo.imageData.height;

      // Replace dimensions and remove blur
      let highResSuffix = relativePathSuffix
        .replace(/w_\d+,h_\d+/, `w_${targetWidth},h_${targetHeight}`)
        .replace(/,blur_\d+/, '');

      const highResWixUrl = `https://static.wixstatic.com/media/${highResSuffix}`;
      const localDestPath = path.join('assets', 'wixstatic', 'media', highResSuffix);

      const downloadSuccess = await downloadAsset(highResWixUrl, localDestPath);
      if (downloadSuccess) {
        // Rewrite src to use relative path to high-res image
        const fullLocalPath = path.join(ARCHIVE_DIR, localDestPath);
        const relativeImgPath = path.relative(path.dirname(filePath), fullLocalPath).replace(/\\/g, '/');
        
        console.log(`Updating image: ${src} -> ${relativeImgPath}`);
        img.setAttribute('src', relativeImgPath);
        img.removeAttribute('srcset'); // Remove srcset to avoid browser loading lower res/blur
      }
    }
  }
  // 1.5. Resolve and download background videos
  const wixVideos = Array.from(document.querySelectorAll('wix-video'));
  for (const wixVideo of wixVideos) {
    const rawInfo = wixVideo.getAttribute('data-video-info');
    if (!rawInfo) continue;

    let videoInfo;
    try {
      videoInfo = JSON.parse(rawInfo);
    } catch (e) {
      continue;
    }

    if (!videoInfo || !videoInfo.qualities || videoInfo.qualities.length === 0) {
      continue;
    }

    // Sort qualities descending by resolution (e.g. 1080p, 720p, etc.) to get highest quality
    const sortedQualities = videoInfo.qualities.sort((a, b) => {
      const resA = parseInt(a.quality) || 0;
      const resB = parseInt(b.quality) || 0;
      return resB - resA;
    });

    const bestQuality = sortedQualities[0];
    if (!bestQuality || !bestQuality.url) continue;

    const absoluteVideoUrl = `https://video.wixstatic.com/${bestQuality.url}`;
    const localDestPath = path.join('assets', 'wixstatic', bestQuality.url);

    const downloadSuccess = await downloadAsset(absoluteVideoUrl, localDestPath);
    if (downloadSuccess) {
      const videoEl = wixVideo.querySelector('video');
      if (videoEl) {
        // Clear any old sources
        videoEl.innerHTML = '';
        
        // Create source element
        const sourceEl = document.createElement('source');
        const fullLocalPath = path.join(ARCHIVE_DIR, localDestPath);
        const relativeVideoPath = path.relative(path.dirname(filePath), fullLocalPath).replace(/\\/g, '/');
        
        sourceEl.setAttribute('src', relativeVideoPath);
        sourceEl.setAttribute('type', `video/${videoInfo.videoFormat || 'mp4'}`);
        videoEl.appendChild(sourceEl);

        // Ensure proper attributes on video tag so it displays and plays natively
        videoEl.setAttribute('autoplay', '');
        videoEl.setAttribute('loop', '');
        videoEl.setAttribute('muted', '');
        videoEl.setAttribute('playsinline', '');
        
        // Remove style rules that might hide the video (e.g. opacity: 0)
        videoEl.style.opacity = '1';
        videoEl.style.visibility = 'visible';
        videoEl.style.width = '100%';
        videoEl.style.height = '100%';
        videoEl.style.objectFit = 'cover';
        videoEl.style.position = 'absolute';
        videoEl.style.top = '0';
        videoEl.style.left = '0';
        
        console.log(`Updated video: ${bestQuality.url} -> ${relativeVideoPath}`);
      }
    }
  }

  // Support standard video and source tags as well
  const standardVideos = Array.from(document.querySelectorAll('video[src]'));
  for (const videoEl of standardVideos) {
    const src = videoEl.getAttribute('src');
    if (src && src.startsWith('http') && src.includes('wixstatic.com')) {
      const pathname = new URL(src).pathname;
      const localDestPath = path.join('assets', 'wixstatic', pathname);
      const downloadSuccess = await downloadAsset(src, localDestPath);
      if (downloadSuccess) {
        const fullLocalPath = path.join(ARCHIVE_DIR, localDestPath);
        const relativeVideoPath = path.relative(path.dirname(filePath), fullLocalPath).replace(/\\/g, '/');
        videoEl.setAttribute('src', relativeVideoPath);
      }
    }
  }

  const standardSources = Array.from(document.querySelectorAll('source[src]'));
  for (const sourceEl of standardSources) {
    const src = sourceEl.getAttribute('src');
    if (src && src.startsWith('http') && src.includes('wixstatic.com')) {
      const pathname = new URL(src).pathname;
      const localDestPath = path.join('assets', 'wixstatic', pathname);
      const downloadSuccess = await downloadAsset(src, localDestPath);
      if (downloadSuccess) {
        const fullLocalPath = path.join(ARCHIVE_DIR, localDestPath);
        const relativeVideoPath = path.relative(path.dirname(filePath), fullLocalPath).replace(/\\/g, '/');
        sourceEl.setAttribute('src', relativeVideoPath);
      }
    }
  }

  // 2. Inject custom CSS override in the head
  let head = document.querySelector('head');
  if (!head) {
    head = document.createElement('head');
    document.documentElement.insertBefore(head, document.documentElement.firstChild);
  }

  // Check if override already exists
  let overrideStyle = document.getElementById('archive-custom-overrides');
  if (!overrideStyle) {
    overrideStyle = document.createElement('style');
    overrideStyle.id = 'archive-custom-overrides';
    head.appendChild(overrideStyle);
    console.log('Injected custom CSS override.');
  }

  overrideStyle.innerHTML = `
    /* Custom overrides to force visibility of animated and lazy-loaded elements when JS is stripped */
    [id^="comp-"]:not([data-motion-enter="done"]) {
      opacity: 1 !important;
      visibility: visible !important;
      transform: none !important;
      animation: none !important;
    }
    .XWeqiF, .sAGPNe, .cCFKrw, .gG6uhp {
      opacity: 1 !important;
      visibility: visible !important;
      transform: none !important;
      transition: none !important;
      animation: none !important;
    }
    /* Force background videos to be visible and play properly without Wix client JS */
    wix-video video {
      opacity: 1 !important;
      visibility: visible !important;
      object-fit: cover !important;
      width: 100% !important;
      height: 100% !important;
    }
  `;

  // 3. Save file back
  fs.writeFileSync(filePath, dom.serialize(), 'utf8');
}

async function run() {
  console.log('==================================================');
  console.log('   STARTING ARCHIVE POST-PROCESSING & VISUAL FIX   ');
  console.log('==================================================');

  const files = [];
  walkDir(ARCHIVE_DIR, (filePath) => {
    if (filePath.endsWith('.html')) {
      files.push(filePath);
    }
  });

  console.log(`Found ${files.length} HTML pages to process.`);

  for (const file of files) {
    try {
      await fixHtmlFile(file);
    } catch (err) {
      console.error(`Error processing file ${file}:`, err.message);
    }
  }

  console.log('==================================================');
  console.log('   POST-PROCESSING SUCCESSFULLY FINISHED          ');
  console.log('==================================================');
}

run();
