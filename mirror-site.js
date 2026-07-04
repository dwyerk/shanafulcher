const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { JSDOM } = require('jsdom');

const BASE_URL = 'https://www.shanafulcher.com';

// Resolve the archive directory path
let archiveDir = path.join(__dirname, 'archive');
const archiveDirArgIndex = process.argv.indexOf('--archive-dir');
if (archiveDirArgIndex !== -1 && process.argv[archiveDirArgIndex + 1]) {
  archiveDir = path.resolve(process.argv[archiveDirArgIndex + 1]);
} else if (process.env.ARCHIVE_DIR) {
  archiveDir = path.resolve(process.env.ARCHIVE_DIR);
}

const ARCHIVE_DIR = archiveDir;
const ASSETS_DIR = path.join(ARCHIVE_DIR, 'assets');

// Keep track of downloaded assets to avoid duplicates
const downloadedAssets = new Map();
// Keep track of pages to crawl
const pagesToCrawl = new Set();
const crawledPages = new Set();

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
        // Follow redirect
        const redirectUrl = new URL(res.headers.location, urlStr).href;
        return fetchUrlContent(redirectUrl).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${urlStr}: HTTP ${res.statusCode}`));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// Download an asset and save it to a destination path
async function downloadAsset(urlStr, destPath) {
  // Normalize URL (strip query/hash for checking duplicates on disk)
  const normalizedUrl = urlStr.split('?')[0].split('#')[0];
  if (downloadedAssets.has(normalizedUrl)) {
    return downloadedAssets.get(normalizedUrl);
  }

  // Define full filesystem path
  const fullDestPath = path.join(ARCHIVE_DIR, destPath);
  const dirName = path.dirname(fullDestPath);
  
  // Ensure target folder exists
  if (!fs.existsSync(dirName)) {
    fs.mkdirSync(dirName, { recursive: true });
  }

  try {
    console.log(`Downloading asset: ${urlStr} -> ${destPath}`);
    const data = await fetchUrlContent(urlStr);
    
    // Check if it's a CSS file so we can recursively download its assets
    if (destPath.endsWith('.css')) {
      let cssText = data.toString('utf8');
      cssText = await processCssContent(cssText, urlStr, destPath);
      fs.writeFileSync(fullDestPath, cssText, 'utf8');
    } else {
      fs.writeFileSync(fullDestPath, data);
    }
    
    downloadedAssets.set(normalizedUrl, destPath);
    return destPath;
  } catch (err) {
    console.error(`Error downloading asset ${urlStr}:`, err.message);
    // Return empty or fallback
    return null;
  }
}

// Map external CDN and local assets to a local folder structure
function mapUrlToLocalPath(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname;
    let pathname = parsed.pathname;
    
    // Strip trailing slash if any
    if (pathname.endsWith('/')) pathname = pathname.slice(0, -1);
    
    // Default file name if pathname is empty or a directory
    if (!pathname || pathname === '') {
      pathname = '/index.html';
    }

    // Clean up pathname for safe filesystems (remove special chars)
    pathname = pathname.replace(/[<>:"|?*]/g, '_');

    if (hostname.includes('wixstatic.com')) {
      return path.join('assets', 'wixstatic', pathname);
    } else if (hostname.includes('parastorage.com')) {
      return path.join('assets', 'parastorage', pathname);
    } else if (hostname.includes('googleapis.com')) {
      return path.join('assets', 'google-fonts', 'api', pathname);
    } else if (hostname.includes('gstatic.com')) {
      return path.join('assets', 'google-fonts', 'static', pathname);
    } else if (hostname === 'www.shanafulcher.com' || hostname === 'shanafulcher.com') {
      // If it's a static file resource on the main domain
      const ext = path.extname(pathname);
      if (ext && ext !== '.html') {
        return path.join('assets', 'local', pathname);
      }
    } else {
      // Other domains (e.g. CDNs)
      return path.join('assets', 'external', hostname, pathname);
    }
  } catch (e) {
    // Relative or invalid URL
  }
  return null;
}

// Process url() assets inside CSS content
async function processCssContent(cssText, cssUrl, localCssPath) {
  const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;
  let match;
  const matches = [];
  
  while ((match = urlRegex.exec(cssText)) !== null) {
    matches.push(match[1]);
  }

  const cssDir = path.dirname(localCssPath);

  for (const assetUrl of matches) {
    if (assetUrl.startsWith('data:')) continue;
    
    try {
      const absoluteAssetUrl = new URL(assetUrl, cssUrl).href;
      const localPath = mapUrlToLocalPath(absoluteAssetUrl);
      if (localPath) {
        await downloadAsset(absoluteAssetUrl, localPath);
        
        // Calculate relative path from CSS file location to the asset
        const fullLocalAssetPath = path.join(ARCHIVE_DIR, localPath);
        const fullLocalCssDir = path.join(ARCHIVE_DIR, cssDir);
        let relativeAssetPath = path.relative(fullLocalCssDir, fullLocalAssetPath);
        relativeAssetPath = relativeAssetPath.replace(/\\/g, '/'); // Windows support
        
        cssText = cssText.replace(assetUrl, relativeAssetPath);
      }
    } catch (e) {
      console.error(`Failed to process CSS asset ${assetUrl} in ${cssUrl}:`, e.message);
    }
  }
  
  return cssText;
}

// Helper to determine output path of a clean page URL in the archive
function getPageOutputPath(urlStr) {
  const parsed = new URL(urlStr);
  let pathname = parsed.pathname;
  if (pathname.endsWith('/')) pathname = pathname.slice(0, -1);

  if (!pathname || pathname === '' || pathname === '/') {
    return path.join(ARCHIVE_DIR, 'index.html');
  }

  // e.g. /about -> archive/about/index.html
  // e.g. /post/title -> archive/post/title/index.html
  return path.join(ARCHIVE_DIR, pathname, 'index.html');
}

// Helper to check if a URL is an internal page
function isInternalPageLink(urlStr) {
  try {
    const parsed = new URL(urlStr, BASE_URL);
    if (parsed.hostname !== 'www.shanafulcher.com' && parsed.hostname !== 'shanafulcher.com') {
      return false;
    }
    const pathname = parsed.pathname;
    const ext = path.extname(pathname);
    // Ignore static files
    if (ext && ext !== '.html') {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Parse sitemap and add all URLs to crawl list
async function loadUrlsFromSitemaps() {
  console.log('Fetching sitemaps...');
  try {
    const sitemaps = [
      `${BASE_URL}/pages-sitemap.xml`,
      `${BASE_URL}/blog-posts-sitemap.xml`
    ];

    for (const sitemapUrl of sitemaps) {
      console.log(`Reading sitemap: ${sitemapUrl}`);
      const xmlData = await fetchUrlContent(sitemapUrl);
      const xmlText = xmlData.toString('utf8');
      
      const locMatches = xmlText.match(/<loc>(https?:\/\/[^<]+)<\/loc>/g);
      if (locMatches) {
        locMatches.forEach(match => {
          const urlStr = match.replace(/<\/?loc>/g, '').trim();
          pagesToCrawl.add(urlStr);
        });
      }
    }
    
    console.log(`Found ${pagesToCrawl.size} pages/posts to mirror.`);
  } catch (err) {
    console.error('Failed to load sitemaps, falling back to manual URLs:', err.message);
    // Fallbacks
    const fallbackUrls = [
      BASE_URL,
      `${BASE_URL}/home`,
      `${BASE_URL}/about`,
      `${BASE_URL}/priorities`,
      `${BASE_URL}/updates`,
      `${BASE_URL}/get-involved`,
      `${BASE_URL}/contact`,
      `${BASE_URL}/blog`
    ];
    fallbackUrls.forEach(url => pagesToCrawl.add(url));
  }
}

// Main scrape process for a page
async function processPage(pageUrl) {
  if (crawledPages.has(pageUrl)) return;
  crawledPages.add(pageUrl);

  const outputPath = getPageOutputPath(pageUrl);
  console.log(`\nProcessing page [${crawledPages.size}/${pagesToCrawl.size}]: ${pageUrl}`);
  console.log(`Output destination: ${outputPath}`);

  try {
    const data = await fetchUrlContent(pageUrl);
    const htmlText = data.toString('utf8');
    const dom = new JSDOM(htmlText, { url: pageUrl });
    const { document } = dom.window;

    // 1. Gather and process stylesheets
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    for (const link of links) {
      const href = link.href;
      if (!href) continue;
      
      const localPath = mapUrlToLocalPath(href);
      if (localPath) {
        await downloadAsset(href, localPath);
        
        // Rewrite tag link
        const fullLocalPath = path.join(ARCHIVE_DIR, localPath);
        const relativePath = path.relative(path.dirname(outputPath), fullLocalPath).replace(/\\/g, '/');
        link.setAttribute('href', relativePath);
      }
    }

    // 2. Process Javascript tags
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    for (const script of scripts) {
      const src = script.src;
      if (!src) continue;
      
      const localPath = mapUrlToLocalPath(src);
      if (localPath) {
        await downloadAsset(src, localPath);
        
        // Rewrite tag src
        const fullLocalPath = path.join(ARCHIVE_DIR, localPath);
        const relativePath = path.relative(path.dirname(outputPath), fullLocalPath).replace(/\\/g, '/');
        script.setAttribute('src', relativePath);
      }
    }

    // 3. Process Images (high-resolution resolution first, then fallback)
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

      const wixMediaMatch = src.match(/(static\.wixstatic\.com\/media|wixstatic\/media)\/(.+)$/);
      if (wixMediaMatch) {
        const relativePathSuffix = wixMediaMatch[2];
        const targetWidth = imageInfo.targetWidth || imageInfo.imageData.width;
        const targetHeight = imageInfo.targetHeight || imageInfo.imageData.height;

        let highResSuffix = relativePathSuffix
          .replace(/w_\d+,h_\d+/, `w_${targetWidth},h_${targetHeight}`)
          .replace(/,blur_\d+/, '');

        const highResWixUrl = `https://static.wixstatic.com/media/${highResSuffix}`;
        const localDestPath = path.join('assets', 'wixstatic', 'media', highResSuffix);

        const downloadSuccess = await downloadAsset(highResWixUrl, localDestPath);
        if (downloadSuccess) {
          const fullLocalPath = path.join(ARCHIVE_DIR, localDestPath);
          const relativeImgPath = path.relative(path.dirname(outputPath), fullLocalPath).replace(/\\/g, '/');
          
          img.setAttribute('src', relativeImgPath);
          img.removeAttribute('srcset');
          img.dataset.processed = 'true';
        }
      }
    }

    const imgs = Array.from(document.querySelectorAll('img'));
    for (const img of imgs) {
      if (img.dataset.processed === 'true') {
        img.removeAttribute('data-processed');
        continue;
      }

      // Source src
      const src = img.src;
      if (src && !src.startsWith('data:')) {
        const localPath = mapUrlToLocalPath(src);
        if (localPath) {
          await downloadAsset(src, localPath);
          
          const fullLocalPath = path.join(ARCHIVE_DIR, localPath);
          const relativePath = path.relative(path.dirname(outputPath), fullLocalPath).replace(/\\/g, '/');
          img.setAttribute('src', relativePath);
        }
      }

      // Srcset (multiple resolutions)
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        // Wix URLs contain commas in paths, so we split only on commas followed by whitespace
        const parts = srcset.split(/,\s+/);
        const newParts = [];
        
        for (const part of parts) {
          const spaceIdx = part.indexOf(' ');
          const urlStr = spaceIdx === -1 ? part : part.substring(0, spaceIdx);
          const descriptor = spaceIdx === -1 ? '' : part.substring(spaceIdx);
          
          if (urlStr && !urlStr.startsWith('data:')) {
            try {
              const absUrl = new URL(urlStr, pageUrl).href;
              const localPath = mapUrlToLocalPath(absUrl);
              if (localPath) {
                await downloadAsset(absUrl, localPath);
                
                const fullLocalPath = path.join(ARCHIVE_DIR, localPath);
                const relativePath = path.relative(path.dirname(outputPath), fullLocalPath).replace(/\\/g, '/');
                newParts.push(`${relativePath}${descriptor}`);
              } else {
                newParts.push(part);
              }
            } catch (e) {
              newParts.push(part);
            }
          } else {
            newParts.push(part);
          }
        }
        
        img.setAttribute('srcset', newParts.join(', '));
      }
    }

    // 3.5. Process video elements (wix-video and standard videos)
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
          const relativeVideoPath = path.relative(path.dirname(outputPath), fullLocalPath).replace(/\\/g, '/');
          
          sourceEl.setAttribute('src', relativeVideoPath);
          sourceEl.setAttribute('type', `video/${videoInfo.videoFormat || 'mp4'}`);
          videoEl.appendChild(sourceEl);

          // Ensure proper attributes on video tag so it displays and plays natively
          videoEl.setAttribute('autoplay', '');
          videoEl.setAttribute('loop', '');
          videoEl.setAttribute('muted', '');
          videoEl.setAttribute('playsinline', '');
          
          // Remove style rules that might hide the video
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

    const standardVideos = Array.from(document.querySelectorAll('video[src]'));
    for (const videoEl of standardVideos) {
      const src = videoEl.getAttribute('src');
      if (src && !src.startsWith('data:')) {
        const localPath = mapUrlToLocalPath(src);
        if (localPath) {
          await downloadAsset(src, localPath);
          const fullLocalPath = path.join(ARCHIVE_DIR, localPath);
          const relativePath = path.relative(path.dirname(outputPath), fullLocalPath).replace(/\\/g, '/');
          videoEl.setAttribute('src', relativePath);
        }
      }
    }

    const standardSources = Array.from(document.querySelectorAll('source[src]'));
    for (const sourceEl of standardSources) {
      const src = sourceEl.getAttribute('src');
      if (src && !src.startsWith('data:')) {
        const localPath = mapUrlToLocalPath(src);
        if (localPath) {
          await downloadAsset(src, localPath);
          const fullLocalPath = path.join(ARCHIVE_DIR, localPath);
          const relativePath = path.relative(path.dirname(outputPath), fullLocalPath).replace(/\\/g, '/');
          sourceEl.setAttribute('src', relativePath);
        }
      }
    }

    // 4. Process Picture elements (Source tag srcsets)
    const sources = Array.from(document.querySelectorAll('source[srcset]'));
    for (const source of sources) {
      const srcset = source.getAttribute('srcset');
      if (srcset) {
        // Wix URLs contain commas in paths, so we split only on commas followed by whitespace
        const parts = srcset.split(/,\s+/);
        const newParts = [];
        for (const part of parts) {
          const spaceIdx = part.indexOf(' ');
          const urlStr = spaceIdx === -1 ? part : part.substring(0, spaceIdx);
          const descriptor = spaceIdx === -1 ? '' : part.substring(spaceIdx);
          
          if (urlStr && !urlStr.startsWith('data:')) {
            try {
              const absUrl = new URL(urlStr, pageUrl).href;
              const localPath = mapUrlToLocalPath(absUrl);
              if (localPath) {
                await downloadAsset(absUrl, localPath);
                
                const fullLocalPath = path.join(ARCHIVE_DIR, localPath);
                const relativePath = path.relative(path.dirname(outputPath), fullLocalPath).replace(/\\/g, '/');
                newParts.push(`${relativePath}${descriptor}`);
              } else {
                newParts.push(part);
              }
            } catch (e) {
              newParts.push(part);
            }
          } else {
            newParts.push(part);
          }
        }
        source.setAttribute('srcset', newParts.join(', '));
      }
    }

    // 5. Process inline style backgrounds and `<style>` blocks
    const styledElements = Array.from(document.querySelectorAll('[style]'));
    for (const el of styledElements) {
      const style = el.getAttribute('style');
      if (style.includes('url(')) {
        const cleanedStyle = await processCssContent(style, pageUrl, path.relative(ARCHIVE_DIR, outputPath));
        el.setAttribute('style', cleanedStyle);
      }
    }

    const styleBlocks = Array.from(document.querySelectorAll('style'));
    for (const block of styleBlocks) {
      let cssText = block.innerHTML;
      if (cssText.includes('url(')) {
        cssText = await processCssContent(cssText, pageUrl, path.relative(ARCHIVE_DIR, outputPath));
        block.innerHTML = cssText;
      }
    }

    // 6. Rewrite Navigation and Page-to-Page Anchor Tags
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href').trim();
      
      // Skip empty, hash, mailto, tel, and relative anchors that aren't page references
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        continue;
      }

      try {
        const absoluteUrl = new URL(href, pageUrl).href;
        
        if (isInternalPageLink(absoluteUrl)) {
          const destOutputPath = getPageOutputPath(absoluteUrl);
          const relativePagePath = path.relative(path.dirname(outputPath), destOutputPath).replace(/\\/g, '/');
          
          console.log(`Rewriting link: ${href} -> ${relativePagePath}`);
          anchor.setAttribute('href', relativePagePath);
        }
      } catch (err) {
        // If it's not a parseable URL, leave it alone
      }
    }

    // Ensure directory exists for output page
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // 7. Strip all script tags to prevent Wix client-side JS from booting up
    const allScripts = Array.from(document.querySelectorAll('script'));
    for (const script of allScripts) {
      script.remove();
    }

    // 8. Inject custom CSS override in the head to force visibility of animated elements
    let head = document.querySelector('head');
    if (!head) {
      head = document.createElement('head');
      document.documentElement.insertBefore(head, document.documentElement.firstChild);
    }
    const overrideStyle = document.createElement('style');
    overrideStyle.id = 'archive-custom-overrides';
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
    head.appendChild(overrideStyle);

    // Save final processed HTML
    fs.writeFileSync(outputPath, dom.serialize(), 'utf8');
    console.log(`Saved: ${outputPath}`);

  } catch (err) {
    console.error(`Failed to process page ${pageUrl}:`, err.message);
  }
}

// Orchestrator
async function run() {
  console.log('==================================================');
  console.log('   STARTING SHANAFULCHER.COM Wix SITE SCRAPER    ');
  console.log('==================================================');
  
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }

  await loadUrlsFromSitemaps();

  // Process pages sequentially
  for (const pageUrl of pagesToCrawl) {
    await processPage(pageUrl);
  }

  console.log('\n==================================================');
  console.log('   SCRAPING AND MIRRORING SUCCESSFULLY FINISHED   ');
  console.log(`Total Pages: ${crawledPages.size}`);
  console.log(`Total Assets Downloaded: ${downloadedAssets.size}`);
  console.log('==================================================');
}

run();
