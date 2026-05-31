const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

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

function compilePosts() {
  console.log('Compiling Markdown posts to data/posts.json...');

  if (!fs.existsSync(postsDir)) {
    console.error(`Error: Posts directory not found at ${postsDir}`);
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

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
}

compilePosts();
