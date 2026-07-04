const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const { JSDOM } = require('jsdom');

const postsDir = path.join(__dirname, 'posts');
const outputDir = path.join(__dirname, 'data');
const outputFilePath = path.join(outputDir, 'posts.json');

// Parse YAML front matter using regex to avoid external dependency
function parseFrontMatter(fileContent) {
  const match = fileContent.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return {
      metadata: {},
      body: fileContent
    };
  }

  const frontMatterText = match[1];
  const body = match[2];
  const metadata = {};

  frontMatterText.split('\n').forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > -1) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      // Unescape escaped quotes and backslashes
      value = value
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
        
      metadata[key] = value;
    }
  });

  return { metadata, body };
}

// Clean excerpt by removing Wix metadata repeats if any
function cleanExcerpt(excerpt) {
  let clean = excerpt || '';
  if (clean.includes('min read')) {
    const parts = clean.split(/min read/i);
    clean = parts.length > 1 ? parts[1].trim() : clean;
  }
  return clean;
}

// Generate meta description snippet (max 160 characters)
function getMetaDescription(excerpt) {
  let clean = cleanExcerpt(excerpt);
  if (clean.length > 160) {
    clean = clean.slice(0, 157) + '...';
  }
  return clean;
}

// Find first image URL in markdown body or use frontmatter
function findPostImage(metadata, body) {
  if (metadata.og_image) return metadata.og_image;
  if (metadata.ogImage) return metadata.ogImage;
  if (metadata.image) return metadata.image;

  // Search markdown image syntax
  const mdImageMatch = body.match(/!\[.*?\]\((.*?)\)/);
  if (mdImageMatch && mdImageMatch[1]) {
    return mdImageMatch[1];
  }

  // Search HTML image tag
  const htmlImageMatch = body.match(/<img\s+[^>]*src=["'](.*?)["']/i);
  if (htmlImageMatch && htmlImageMatch[1]) {
    return htmlImageMatch[1];
  }

  return '/images/shana_portrait.jpg';
}

// Ensure URL is absolute for Open Graph metadata
function makeAbsoluteUrl(urlPath) {
  if (!urlPath) return 'https://www.shanafulcher.com/images/shana_portrait.jpg';
  if (urlPath.startsWith('http://') || urlPath.startsWith('https://')) {
    return urlPath;
  }
  const normalizedPath = urlPath.startsWith('/') ? urlPath : '/' + urlPath;
  return `https://www.shanafulcher.com${normalizedPath}`;
}

// XML escaping helper
function escapeXml(unsafe) {
  return (unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// Generate RSS 2.0 XML file
function generateRssFeed(posts) {
  console.log('Generating RSS feed...');
  
  const siteUrl = 'https://www.shanafulcher.com';
  const feedUrl = `${siteUrl}/rss.xml`;
  const lastBuildDate = new Date().toUTCString();
  
  // Find latest post date for pubDate of channel
  let pubDate = lastBuildDate;
  if (posts.length > 0 && posts[0].raw_date) {
    pubDate = posts[0].raw_date;
  }
  
  let rssXml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Shana Fulcher for Takoma Park City Council (Ward 1) - Updates</title>
  <link>${siteUrl}/updates</link>
  <description>Stay informed. Search and browse campaign announcements, legislative analysis, and community updates from Ward 1.</description>
  <language>en-us</language>
  <pubDate>${pubDate}</pubDate>
  <lastBuildDate>${lastBuildDate}</lastBuildDate>
  <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
`;

  posts.forEach(post => {
    const postUrl = `${siteUrl}/posts/${post.id}`;
    const cleanTitle = escapeXml(post.title);
    const cleanExcerptText = cleanExcerpt(post.excerpt);
    
    rssXml += `  <item>
    <title>${cleanTitle}</title>
    <link>${postUrl}</link>
    <guid isPermaLink="true">${postUrl}</guid>
    <pubDate>${post.raw_date || lastBuildDate}</pubDate>
    <description><![CDATA[${cleanExcerptText}]]></description>
  </item>
`;
  });

  rssXml += `</channel>
</rss>`;

  const rssOutputPath = path.join(__dirname, 'rss.xml');
  fs.writeFileSync(rssOutputPath, rssXml, 'utf8');
  console.log(`Successfully generated RSS feed at ${rssOutputPath}`);
}

// Generate standard sitemap.xml
function generateSitemap(posts) {
  console.log('Generating Sitemap...');
  const siteUrl = 'https://www.shanafulcher.com';
  
  let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
`;

  posts.forEach(post => {
    const postUrl = `${siteUrl}/posts/${post.id}`;
    sitemapXml += `  <url>
    <loc>${postUrl}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
`;
  });

  sitemapXml += `</urlset>`;

  const sitemapPath = path.join(__dirname, 'sitemap.xml');
  fs.writeFileSync(sitemapPath, sitemapXml, 'utf8');
  console.log(`Successfully generated Sitemap at ${sitemapPath}`);
}

// Generate standard robots.txt
function generateRobotsTxt() {
  console.log('Generating robots.txt...');
  const robotsContent = `User-agent: *
Allow: /

Sitemap: https://www.shanafulcher.com/sitemap.xml
`;

  const robotsPath = path.join(__dirname, 'robots.txt');
  fs.writeFileSync(robotsPath, robotsContent, 'utf8');
  console.log(`Successfully generated robots.txt at ${robotsPath}`);
}

function compilePosts() {
  console.log('Compiling Markdown posts...');

  if (!fs.existsSync(postsDir)) {
    console.error(`Error: Posts directory not found at ${postsDir}`);
    process.exit(1);
  }

  // Ensure output directories exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Clean and recreate postOutputDir safely inside posts/ without deleting the markdown files
  const postOutputDir = path.join(__dirname, 'posts');
  if (fs.existsSync(postOutputDir)) {
    const items = fs.readdirSync(postOutputDir);
    items.forEach(item => {
      const fullPath = path.join(postOutputDir, item);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      } catch (err) {
        // Handle error gracefully
      }
    });
  } else {
    fs.mkdirSync(postOutputDir, { recursive: true });
  }

  // Read index.html as base template
  const templatePath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(templatePath)) {
    console.error(`Error: index.html template not found at ${templatePath}`);
    process.exit(1);
  }
  const indexTemplate = fs.readFileSync(templatePath, 'utf8');

  const files = fs.readdirSync(postsDir);
  const markdownFiles = files.filter(file => file.endsWith('.md'));
  
  const posts = [];

  markdownFiles.forEach(file => {
    const filePath = path.join(postsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    const { metadata, body } = parseFrontMatter(content);
    
    if (!metadata.id) {
      metadata.id = path.basename(file, '.md');
    }
    
    if (!metadata.title) {
      metadata.title = 'Untitled Post';
    }

    // Compile Markdown body to HTML
    let contentHtml = '';
    try {
      contentHtml = marked.parse(body).trim();
    } catch (err) {
      console.error(`Error parsing Markdown in ${file}:`, err.message);
      contentHtml = body; // Fallback
    }

    // Wrap in top-level div if not present, to match Wix's layout style
    if (!contentHtml.startsWith('<div>')) {
      contentHtml = `<div>${contentHtml}</div>`;
    }

    // Generate standard HTTP date if raw_date is missing
    let rawDate = metadata.raw_date;
    if (!rawDate && metadata.date) {
      try {
        rawDate = new Date(metadata.date).toUTCString();
      } catch (e) {
        rawDate = '';
      }
    }

    posts.push({
      id: metadata.id,
      title: metadata.title,
      date: metadata.date || '',
      raw_date: rawDate || '',
      excerpt: metadata.excerpt || '',
      content_html: contentHtml
    });

    // Generate static HTML page for this post
    try {
      const dom = new JSDOM(indexTemplate);
      const document = dom.window.document;

      // 1. Update <title>
      const pageTitle = metadata.title || '';
      const fullTitle = `${pageTitle} | Shana Fulcher for Takoma Park City Council (Ward 1)`;
      document.title = fullTitle;

      // 2. Update <meta name="description">
      const cleanDesc = getMetaDescription(metadata.excerpt);
      const descVal = metadata.description || cleanDesc;
      let descMeta = document.querySelector('meta[name="description"]');
      if (!descMeta) {
        descMeta = document.createElement('meta');
        descMeta.setAttribute('name', 'description');
        document.head.appendChild(descMeta);
      }
      descMeta.setAttribute('content', descVal);

      // 3. Update canonical link
      const postUrl = `https://www.shanafulcher.com/posts/${metadata.id}`;
      let canonicalLink = document.querySelector('link[rel="canonical"]');
      if (!canonicalLink) {
        canonicalLink = document.createElement('link');
        canonicalLink.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalLink);
      }
      canonicalLink.setAttribute('href', postUrl);

      // Helper to set or create meta tags, avoiding duplicates by checking both property and name
      const setMetaProperty = (name, value, isProperty = true) => {
        const attrName = isProperty ? 'property' : 'name';
        const otherAttrName = isProperty ? 'name' : 'property';
        // Try to find the tag by name or property
        let meta = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
        if (!meta) {
          meta = document.createElement('meta');
          meta.setAttribute(attrName, name);
          document.head.appendChild(meta);
        } else {
          // If it exists but has the wrong attribute type, normalize it
          meta.removeAttribute(otherAttrName);
          meta.setAttribute(attrName, name);
        }
        meta.setAttribute('content', value);
      };

      // 4. Update Open Graph tags
      const postImage = makeAbsoluteUrl(findPostImage(metadata, body));
      const ogTitleVal = metadata.og_title || metadata.ogTitle || pageTitle;
      const ogDescVal = metadata.og_description || metadata.ogDescription || descVal;
      const ogImageVal = metadata.og_image || metadata.ogImage || postImage;

      setMetaProperty('og:type', 'article');
      setMetaProperty('og:url', postUrl);
      setMetaProperty('og:title', ogTitleVal);
      setMetaProperty('og:description', ogDescVal);
      setMetaProperty('og:image', ogImageVal);

      // 5. Update Twitter tags
      setMetaProperty('twitter:card', 'summary_large_image', false);
      setMetaProperty('twitter:url', postUrl, false);
      setMetaProperty('twitter:title', ogTitleVal, false);
      setMetaProperty('twitter:description', ogDescVal, false);
      setMetaProperty('twitter:image', ogImageVal, false);

      // 6. Pre-render post content inside the reader modal overlay for crawler indexing
      const modalTitleEl = document.getElementById('modal-post-title');
      const modalDateEl = document.getElementById('modal-post-date');
      const modalBodyEl = document.getElementById('modal-post-body');

      if (modalTitleEl) modalTitleEl.textContent = metadata.title;
      if (modalDateEl) modalDateEl.textContent = metadata.date || '';
      if (modalBodyEl) modalBodyEl.innerHTML = contentHtml;

      // 7. Write the static HTML file
      const postDir = path.join(postOutputDir, metadata.id);
      if (!fs.existsSync(postDir)) {
        fs.mkdirSync(postDir, { recursive: true });
      }
      fs.writeFileSync(path.join(postDir, 'index.html'), dom.serialize(), 'utf8');
    } catch (err) {
      console.error(`Error generating static page for ${file}:`, err.message);
    }
  });

  // Sort posts by date (newest first)
  posts.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    // Fallback if parsing fails
    if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
      return 0;
    }
    return dateB.getTime() - dateA.getTime();
  });

  // Write out the compiled JSON
  fs.writeFileSync(outputFilePath, JSON.stringify(posts, null, 2), 'utf8');
  console.log(`Successfully compiled ${posts.length} posts to ${outputFilePath}`);
  console.log(`Successfully generated static HTML pages in ${postOutputDir}`);

  // Generate RSS feed
  generateRssFeed(posts);

  // Generate Sitemap and Robots.txt
  generateSitemap(posts);
  generateRobotsTxt();
}

compilePosts();
