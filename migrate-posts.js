const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const TurndownService = require('turndown');

const postsFilePath = path.join(__dirname, 'data', 'posts.json');
const outputDir = path.join(__dirname, 'posts');

// Helper to escape double quotes and format YAML front matter strings safely
function formatYamlValue(val) {
  if (!val) return '""';
  const escaped = val
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ');
  return `"${escaped}"`;
}

function runMigration() {
  console.log('Starting migration from data/posts.json to Markdown files...');

  if (!fs.existsSync(postsFilePath)) {
    console.error(`Error: Source file not found at ${postsFilePath}`);
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created directory: ${outputDir}`);
  }

  const postsRaw = fs.readFileSync(postsFilePath, 'utf8');
  let posts;
  try {
    posts = JSON.parse(postsRaw);
  } catch (err) {
    console.error('Failed to parse JSON file:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(posts)) {
    console.error('Error: posts.json does not contain a JSON array.');
    process.exit(1);
  }

  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
  });

  // Keep line breaks and lists clean
  turndownService.addRule('lineBreak', {
    filter: ['br'],
    replacement: () => '\n'
  });

  let migratedCount = 0;

  posts.forEach((post, index) => {
    const id = post.id || `post-${index}`;
    const title = post.title || 'Untitled Post';
    const date = post.date || '';
    const excerpt = post.excerpt || '';
    const contentHtml = post.content_html || '';

    // Step 1: Parse and clean Wix metadata from HTML content
    const dom = new JSDOM(`<div>${contentHtml}</div>`);
    const container = dom.window.document.querySelector('div');

    // Remove top H1 title if it matches post title
    const topH1 = container.querySelector('h1');
    if (topH1 && topH1.textContent.trim().toLowerCase() === title.trim().toLowerCase()) {
      topH1.remove();
    }

    // Remove author metadata list (e.g. "Shana Fulcher", "Oct 30, 2024", "5 min read")
    const lists = container.querySelectorAll('ul');
    for (const list of lists) {
      const text = list.textContent.toLowerCase();
      if (text.includes('shana fulcher') && text.includes('min read')) {
        list.remove();
        break;
      }
    }

    const cleanedHtml = container.innerHTML;

    // Step 2: Convert cleaned HTML to Markdown
    let markdownBody = '';
    try {
      markdownBody = turndownService.turndown(cleanedHtml).trim();
    } catch (err) {
      console.error(`Warning: Failed to convert HTML to Markdown for post "${title}":`, err.message);
      // Fallback: use raw cleaned HTML inside Markdown (completely valid Markdown)
      markdownBody = cleanedHtml;
    }

    // Step 3: Format YAML front matter
    const frontMatter = [
      '---',
      `id: ${id}`,
      `title: ${formatYamlValue(title)}`,
      `date: ${formatYamlValue(date)}`,
      `excerpt: ${formatYamlValue(excerpt)}`,
      '---',
      ''
    ].join('\n');

    // Step 4: Write to file
    const postFileName = `${id}.md`;
    const postFilePath = path.join(outputDir, postFileName);
    fs.writeFileSync(postFilePath, frontMatter + markdownBody + '\n', 'utf8');
    migratedCount++;
    console.log(`Migrated: [${migratedCount}/${posts.length}] ${postFileName}`);
  });

  console.log(`\nMigration completed successfully! Generated ${migratedCount} files in ${outputDir}`);
}

runMigration();
