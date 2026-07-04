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
  if (metadata.image) return metadata.image;
  if (metadata.og_image) return metadata.og_image;
  if (metadata.ogImage) return metadata.ogImage;

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

  // Clean and recreate postOutputDir to prevent stale generated pages
  const postOutputDir = path.join(__dirname, 'post');
  if (fs.existsSync(postOutputDir)) {
    fs.rmSync(postOutputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(postOutputDir, { recursive: true });

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
      const fullTitle = `${metadata.title} | Shana Fulcher for Takoma Park City Council (Ward 1)`;
      document.title = fullTitle;

      // 2. Update <meta name="description">
      const cleanDesc = getMetaDescription(metadata.excerpt);
      let descMeta = document.querySelector('meta[name="description"]');
      if (!descMeta) {
        descMeta = document.createElement('meta');
        descMeta.setAttribute('name', 'description');
        document.head.appendChild(descMeta);
      }
      descMeta.setAttribute('content', cleanDesc);

      // 3. Update canonical link
      const postUrl = `https://www.shanafulcher.com/post/${metadata.id}`;
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
      setMetaProperty('og:type', 'article');
      setMetaProperty('og:url', postUrl);
      setMetaProperty('og:title', metadata.title);
      setMetaProperty('og:description', cleanDesc);
      setMetaProperty('og:image', postImage);

      // 5. Update Twitter tags
      setMetaProperty('twitter:card', 'summary_large_image', false);
      setMetaProperty('twitter:url', postUrl, false);
      setMetaProperty('twitter:title', metadata.title, false);
      setMetaProperty('twitter:description', cleanDesc, false);
      setMetaProperty('twitter:image', postImage, false);

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
}

compilePosts();
