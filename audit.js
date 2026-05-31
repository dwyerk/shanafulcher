/**
 * static HTML & Dynamic Content Audit Tool
 * Performs checks for Accessibility (A11y) and SEO best practices.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Terminal Colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

// Log symbols
const symbols = {
  success: `${colors.green}✔${colors.reset}`,
  warning: `${colors.yellow}⚠${colors.reset}`,
  error: `${colors.red}✘${colors.reset}`,
  info: `${colors.cyan}ℹ${colors.reset}`
};

// Global Audit State
const auditState = {
  passed: 0,
  warnings: 0,
  errors: 0,
  infos: 0,
  details: []
};

function addResult(category, name, passed, severity, message, recommendation = '') {
  if (passed) {
    auditState.passed++;
  } else {
    if (severity === 'error') auditState.errors++;
    else if (severity === 'warning') auditState.warnings++;
    else if (severity === 'info') auditState.infos++;
  }
  
  auditState.details.push({
    category,
    name,
    passed,
    severity,
    message,
    recommendation
  });
}

function runAudit() {
  console.log(`\n${colors.bright}${colors.bgBlue}${colors.white}  CAMPAIGN SITE AUDIT: SEO & ACCESSIBILITY (A11y)  ${colors.reset}\n`);

  const htmlPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    console.error(`${symbols.error} ${colors.red}Error: index.html not found at ${htmlPath}${colors.reset}`);
    process.exit(1);
  }

  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(htmlContent);
  const { document } = dom.window;

  // Run audits
  auditSEO(document);
  auditA11y(document);
  auditBlogPosts();

  // Print results
  printReport();

  // Exit code based on errors
  if (auditState.errors > 0) {
    console.log(`\n${colors.bgRed}${colors.white}  AUDIT FAILED: ${auditState.errors} error(s) found. See details above.  ${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`\n${colors.bgGreen}${colors.white}  AUDIT PASSED: No critical errors found.  ${colors.reset}\n`);
    process.exit(0);
  }
}

/* ==========================================================================
   SEO AUDIT CHECKS
   ========================================================================== */
function auditSEO(document) {
  const category = 'SEO';

  // 1. Document Title
  const titleEl = document.querySelector('title');
  if (!titleEl) {
    addResult(category, 'Document Title', false, 'error', 'No <title> tag found in the document.', 'Add a <title> tag inside the <head> of index.html.');
  } else {
    const titleText = titleEl.textContent.trim();
    if (!titleText) {
      addResult(category, 'Document Title', false, 'error', 'The <title> tag is empty.', 'Provide a descriptive title for your webpage.');
    } else if (titleText.length < 30 || titleText.length > 65) {
      addResult(category, 'Document Title', false, 'warning', `Title length (${titleText.length} chars) is outside the optimal range (30-65 chars). Current: "${titleText}"`, 'Adjust the title to be between 30 and 65 characters for optimal search engine display.');
    } else {
      addResult(category, 'Document Title', true, 'success', `Title tag is present and optimal: "${titleText}" (${titleText.length} chars)`);
    }
  }

  // 2. Meta Description
  const descEl = document.querySelector('meta[name="description"]');
  if (!descEl) {
    addResult(category, 'Meta Description', false, 'error', 'No <meta name="description"> tag found.', 'Add a meta description tag to summarize the page content for search engines.');
  } else {
    const descText = descEl.getAttribute('content') ? descEl.getAttribute('content').trim() : '';
    if (!descText) {
      addResult(category, 'Meta Description', false, 'error', 'The meta description content is empty.', 'Provide a brief summary of the webpage content inside the content attribute of the meta description.');
    } else if (descText.length < 120 || descText.length > 160) {
      addResult(category, 'Meta Description', false, 'warning', `Meta description length (${descText.length} chars) is outside the optimal range (120-160 chars). Current: "${descText.substring(0, 40)}..."`, 'Refine the description content to be between 120 and 160 characters to avoid search result truncation.');
    } else {
      addResult(category, 'Meta Description', true, 'success', `Meta description is present and optimal (${descText.length} chars).`);
    }
  }

  // 3. Meta Keywords (Optional/Info)
  const keywordsEl = document.querySelector('meta[name="keywords"]');
  if (!keywordsEl) {
    addResult(category, 'Meta Keywords', false, 'info', 'No <meta name="keywords"> tag found.', 'Note: Search engines generally ignore this now, but it can be useful for internal tags.');
  } else {
    addResult(category, 'Meta Keywords', true, 'success', 'Meta keywords tag is present.');
  }

  // 4. Canonical Link
  const canonicalEl = document.querySelector('link[rel="canonical"]');
  if (!canonicalEl) {
    addResult(category, 'Canonical Link', false, 'warning', 'No <link rel="canonical"> tag found.', 'Add a <link rel="canonical" href="https://www.shanafulcher.com/"> to prevent duplicate content issues.');
  } else {
    const href = canonicalEl.getAttribute('href');
    if (!href) {
      addResult(category, 'Canonical Link', false, 'error', 'Canonical link is missing its href attribute.', 'Define the absolute URL in the href attribute of the canonical link.');
    } else {
      addResult(category, 'Canonical Link', true, 'success', `Canonical link points to: "${href}"`);
    }
  }

  // 5. Open Graph Tags
  const ogTags = ['og:title', 'og:description', 'og:url', 'og:type'];
  const missingOg = [];
  ogTags.forEach(tag => {
    if (!document.querySelector(`meta[property="${tag}"]`)) {
      missingOg.push(tag);
    }
  });
  if (missingOg.length > 0) {
    addResult(category, 'Open Graph Tags', false, 'warning', `Missing Open Graph tags: ${missingOg.join(', ')}`, 'Add Open Graph meta tags to control how the site is previewed when shared on social networks.');
  } else {
    addResult(category, 'Open Graph Tags', true, 'success', 'All primary Open Graph tags are present.');
  }

  // 6. Twitter Meta Tags
  const twitterTags = ['twitter:card', 'twitter:title', 'twitter:description'];
  const missingTwitter = [];
  twitterTags.forEach(tag => {
    if (!document.querySelector(`meta[name="${tag}"]`) && !document.querySelector(`meta[property="${tag}"]`)) {
      missingTwitter.push(tag);
    }
  });
  if (missingTwitter.length > 0) {
    addResult(category, 'Twitter Cards', false, 'warning', `Missing Twitter meta tags: ${missingTwitter.join(', ')}`, 'Add Twitter card meta tags to optimize social sharing on X/Twitter.');
  } else {
    addResult(category, 'Twitter Cards', true, 'success', 'All primary Twitter card tags are present.');
  }

  // 7. Heading Hierarchy & Single H1
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const h1s = headings.filter(h => h.tagName.toLowerCase() === 'h1');
  
  if (h1s.length === 0) {
    addResult(category, 'Heading H1 Check', false, 'error', 'No <h1> tag found on the page.', 'Ensure the page has exactly one <h1> representing the main page topic.');
  } else if (h1s.length > 1) {
    addResult(category, 'Heading H1 Check', false, 'warning', `Multiple <h1> tags found (${h1s.length} total).`, 'Ideally, restrict <h1> to a single tag representing the primary site headline, and use <h2> for page view sections to structure the document correctly.');
  } else {
    addResult(category, 'Heading H1 Check', true, 'success', 'Exactly one <h1> tag is present on the page.');
  }

  // Check Heading Order Hierarchy (no skipping downward)
  let prevLevel = 0;
  let headingOrderPassed = true;
  const headingViolations = [];

  headings.forEach(heading => {
    const level = parseInt(heading.tagName.charAt(1));
    if (prevLevel > 0 && level > prevLevel + 1) {
      headingOrderPassed = false;
      headingViolations.push(`Skipped from <h${prevLevel}> to <h${level}> ("${heading.textContent.trim().substring(0, 30)}...")`);
    }
    prevLevel = level;
  });

  if (!headingOrderPassed) {
    addResult(category, 'Heading Hierarchy', false, 'warning', `Heading tags do not follow a strict sequential order: ${headingViolations.join('; ')}`, 'Do not skip heading levels (e.g. from H2 to H4). Ensure headers flow logically (H1 -> H2 -> H3) to support assistive readers.');
  } else {
    addResult(category, 'Heading Hierarchy', true, 'success', 'Heading hierarchy flows sequentially without skipping levels.');
  }

  // 8. Link Descriptive Text Check
  const links = Array.from(document.querySelectorAll('a'));
  const genericTerms = ['click here', 'read more', 'learn more', 'more', 'link', 'here', 'go', 'button', 'info', 'website'];
  const problematicLinks = [];

  links.forEach((link, idx) => {
    const linkText = link.textContent.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    if (genericTerms.includes(linkText)) {
      problematicLinks.push({
        text: link.textContent.trim(),
        href: link.getAttribute('href'),
        id: link.id || `Link index ${idx}`
      });
    }
  });

  if (problematicLinks.length > 0) {
    const linkDetails = problematicLinks.map(l => `"${l.text}" (href: "${l.href}", id: ${l.id})`).join(', ');
    addResult(category, 'Descriptive Link Text', false, 'warning', `Found links with non-descriptive text: ${linkDetails}`, 'Use descriptive text for links that explains where the link leads (e.g., "Read our housing platform" instead of "Read more"). This improves SEO indexing and screen-reader context.');
  } else {
    addResult(category, 'Descriptive Link Text', true, 'success', 'All links have descriptive text content.');
  }
}

/* ==========================================================================
   ACCESSIBILITY (A11y) AUDIT CHECKS
   ========================================================================== */
function auditA11y(document) {
  const category = 'Accessibility';

  // 1. HTML Lang attribute
  const htmlEl = document.documentElement;
  const lang = htmlEl.getAttribute('lang');
  if (!lang) {
    addResult(category, 'Language Attribute', false, 'error', 'No lang attribute on the <html> tag.', 'Add lang="en" (or the appropriate language code) to the html tag to enable screen readers to read in the correct pronunciation.');
  } else {
    addResult(category, 'Language Attribute', true, 'success', `HTML lang attribute is present: "${lang}"`);
  }

  // 2. Viewport scaling restrictions
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    const content = viewport.getAttribute('content') || '';
    if (content.includes('user-scalable=no') || content.includes('maximum-scale=1') || content.includes('maximum-scale=0')) {
      addResult(category, 'Viewport Zooming', false, 'error', 'Viewport settings restrict user zooming (user-scalable=no or maximum-scale < 2).', 'Remove restrictions like user-scalable=no and maximum-scale=1.0 from the viewport meta content attribute to support visually impaired users.');
    } else {
      addResult(category, 'Viewport Zooming', true, 'success', 'Viewport configuration permits user zooming.');
    }
  } else {
    addResult(category, 'Viewport Zooming', false, 'warning', 'No viewport meta tag found.', 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0"> for standard responsive scaling.');
  }

  // 3. Landmark tags
  const landmarks = {
    header: document.querySelector('header') || document.querySelector('[role="banner"]'),
    nav: document.querySelector('nav') || document.querySelector('[role="navigation"]'),
    main: document.querySelector('main') || document.querySelector('[role="main"]'),
    footer: document.querySelector('footer') || document.querySelector('[role="contentinfo"]')
  };

  const missingLandmarks = Object.keys(landmarks).filter(key => !landmarks[key]);
  if (missingLandmarks.length > 0) {
    addResult(category, 'HTML Landmarks', false, 'warning', `Missing accessibility landmarks: ${missingLandmarks.join(', ')}`, 'Ensure the document contains semantic landmarks (<header>, <nav>, <main>, <footer>) or appropriate ARIA roles to support keyboard layout scanning by screen readers.');
  } else {
    addResult(category, 'HTML Landmarks', true, 'success', 'All primary structural landmark elements are present.');
  }

  // 4. Skip to Main Content Link
  const skipLink = document.querySelector('a[href^="#"]');
  if (!skipLink || !skipLink.classList.contains('skip-link')) {
    addResult(category, 'Skip Link', false, 'warning', 'No skip-to-main-content link detected at the top of the body.', 'Add a skip link (e.g. <a href="#main-content" class="skip-link">Skip to main content</a>) immediately after the opening <body> tag to assist keyboard users in skipping site navigation.');
  } else {
    const targetId = skipLink.getAttribute('href').substring(1);
    const targetEl = document.getElementById(targetId);
    if (!targetEl) {
      addResult(category, 'Skip Link', false, 'error', `Skip link target ID "${targetId}" does not exist in the DOM.`, `Ensure there is an element matching id="${targetId}" (typically your <main> container).`);
    } else if (targetEl.getAttribute('tabindex') !== '-1' && targetEl.getAttribute('tabindex') !== '0') {
      addResult(category, 'Skip Link', false, 'warning', `Skip link target element #${targetId} lacks a tabindex attribute.`, `Add tabindex="-1" to the #${targetId} main container to allow keyboard focus to move there programmatically when the link is activated.`);
    } else {
      addResult(category, 'Skip Link', true, 'success', `Skip link is present and correctly references focusable container #${targetId}.`);
    }
  }

  // 5. Image Alternative Text
  const images = Array.from(document.querySelectorAll('img'));
  let missingAlts = 0;
  let emptyAltsOnPotentialInformative = [];

  images.forEach((img, idx) => {
    const src = img.getAttribute('src') || '';
    if (!img.hasAttribute('alt')) {
      missingAlts++;
    } else {
      const altVal = img.getAttribute('alt').trim();
      const isDecorative = img.getAttribute('role') === 'presentation' || img.getAttribute('role') === 'none';
      
      // If alt is empty, verify if it looks like a portrait or key informative photo
      if (altVal === '' && !isDecorative) {
        if (src.includes('portrait') || src.includes('shana') || src.includes('campaign') || src.includes('group') || src.includes('event')) {
          emptyAltsOnPotentialInformative.push(`"${src}"`);
        }
      }
    }
  });

  if (missingAlts > 0) {
    addResult(category, 'Image Alt Attributes', false, 'error', `Found ${missingAlts} image(s) completely missing the "alt" attribute.`, 'All img tags must have an alt attribute. If decorative, set alt="". If informative, provide a descriptive string.');
  } else if (emptyAltsOnPotentialInformative.length > 0) {
    addResult(category, 'Image Alt Attributes', false, 'warning', `Found empty alt text on images that appear informative: ${emptyAltsOnPotentialInformative.join(', ')}`, 'Provide meaningful alt description strings for these key visual elements, or explicitly set role="presentation" if they are purely decorative.');
  } else {
    addResult(category, 'Image Alt Attributes', true, 'success', 'All images have alt attributes (and informative images have non-empty text).');
  }

  // 6. Form Field Labels
  const formFields = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]), textarea, select'));
  let unlabelledFields = [];

  formFields.forEach(field => {
    const id = field.id;
    let labelFound = false;

    // Check if wrapped in a label
    if (field.closest('label')) {
      labelFound = true;
    }
    // Check if an external label has a matching 'for' attribute
    if (!labelFound && id) {
      const externalLabel = document.querySelector(`label[for="${id}"]`);
      if (externalLabel) {
        labelFound = true;
      }
    }
    // Check for aria-label or aria-labelledby
    if (!labelFound && (field.hasAttribute('aria-label') || field.hasAttribute('aria-labelledby'))) {
      labelFound = true;
    }

    if (!labelFound) {
      unlabelledFields.push(`<${field.tagName.toLowerCase()} id="${id || 'no-id'}" name="${field.getAttribute('name') || 'no-name'}">`);
    }
  });

  if (unlabelledFields.length > 0) {
    addResult(category, 'Form Labels', false, 'error', `Found ${unlabelledFields.length} form field(s) without associated labels: ${unlabelledFields.join(', ')}`, 'Ensure every form control has an accessible name. Use a <label for="inputId"> element matching the input ID, wrap the input in a <label>, or provide an aria-label attribute.');
  } else {
    addResult(category, 'Form Labels', true, 'success', 'All form input fields are properly labeled.');
  }

  // 7. Interactive Element Accessible Names (Buttons/Links)
  const buttons = Array.from(document.querySelectorAll('button'));
  let unnamedButtons = [];

  buttons.forEach((btn, idx) => {
    const name = btn.textContent.trim();
    const hasAriaLabel = btn.hasAttribute('aria-label') && btn.getAttribute('aria-label').trim() !== '';
    const hasAriaLabelledby = btn.hasAttribute('aria-labelledby');

    if (!name && !hasAriaLabel && !hasAriaLabelledby) {
      unnamedButtons.push(`Index ${idx} (id: "${btn.id || 'none'}")`);
    }
  });

  if (unnamedButtons.length > 0) {
    addResult(category, 'Button Accessible Names', false, 'error', `Found buttons missing text or accessibility labels: ${unnamedButtons.join(', ')}`, 'Give buttons an accessible name. If a button contains only an icon (like SVG or emoji), add an aria-label attribute describing its action.');
  } else {
    addResult(category, 'Button Accessible Names', true, 'success', 'All buttons have accessible names.');
  }

  // 8. Duplicate IDs Check
  const allElements = Array.from(document.querySelectorAll('[id]'));
  const ids = allElements.map(el => el.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  const uniqueDuplicates = [...new Set(duplicates)];

  if (uniqueDuplicates.length > 0) {
    addResult(category, 'Unique IDs', false, 'error', `Duplicate element ID(s) found in DOM: ${uniqueDuplicates.join(', ')}`, 'Element IDs must be unique across the document to prevent scripting errors and assistive tech screen reader confusion.');
  } else {
    addResult(category, 'Unique IDs', true, 'success', 'All element IDs are unique across the page.');
  }

  // 9. Dialog Modal Checks
  const dialogs = Array.from(document.querySelectorAll('dialog'));
  let problematicDialogs = [];

  dialogs.forEach(dialog => {
    const isModal = dialog.getAttribute('aria-modal') === 'true';
    const hasLabel = dialog.hasAttribute('aria-label') || dialog.hasAttribute('aria-labelledby');
    if (!isModal || !hasLabel) {
      problematicDialogs.push({
        id: dialog.id,
        isModal,
        hasLabel
      });
    }
  });

  if (problematicDialogs.length > 0) {
    const details = problematicDialogs.map(d => `dialog id="${d.id}" (aria-modal="${d.isModal}", hasLabel=${d.hasLabel})`).join(', ');
    addResult(category, 'Dialog Modal Settings', false, 'warning', `Found dialog element(s) with missing attributes: ${details}`, 'Ensure dialog overlay panels specify aria-modal="true" and have an aria-labelledby referencing the dialog title tag to announce details correctly.');
  } else {
    addResult(category, 'Dialog Modal Settings', true, 'success', 'All dialog modal attributes are properly configured.');
  }

  // 10. Aria ID References Validity
  let invalidAriaRefs = [];
  const ariaRefAttrs = ['aria-controls', 'aria-describedby', 'aria-labelledby'];

  allElements.forEach(el => {
    ariaRefAttrs.forEach(attr => {
      if (el.hasAttribute(attr)) {
        const refIds = el.getAttribute(attr).split(/\s+/);
        refIds.forEach(refId => {
          if (refId && !document.getElementById(refId)) {
            invalidAriaRefs.push(`Element #${el.id || el.tagName.toLowerCase()} uses ${attr}="${refId}" but #${refId} does not exist.`);
          }
        });
      }
    });
  });

  if (invalidAriaRefs.length > 0) {
    addResult(category, 'ARIA ID References', false, 'error', `Invalid ID references in ARIA attributes: ${invalidAriaRefs.join('; ')}`, 'Correct ARIA attributes to reference existing element IDs. Broken references disable reading descriptions or control operations for assistive tech.');
  } else {
    addResult(category, 'ARIA ID References', true, 'success', 'All ARIA ID references exist and resolve correctly.');
  }
}

/* ==========================================================================
   DYNAMIC BLOG POST AUDIT CHECKS
   ========================================================================== */
function auditBlogPosts() {
  const category = 'Blog Content';
  const postsPath = path.join(__dirname, 'data', 'posts.json');

  if (!fs.existsSync(postsPath)) {
    addResult(category, 'Blog JSON File', false, 'warning', 'Blog posts data file (data/posts.json) not found.', 'Create a data/posts.json file containing blog/news articles.');
    return;
  }

  try {
    const postsData = fs.readFileSync(postsPath, 'utf8');
    const posts = JSON.parse(postsData);

    if (!Array.isArray(posts)) {
      addResult(category, 'Blog JSON Format', false, 'error', 'Blog posts file does not contain a valid JSON array.', 'Verify the format of data/posts.json.');
      return;
    }

    addResult(category, 'Blog JSON Format', true, 'success', `Successfully loaded and parsed ${posts.length} blog posts.`);

    let totalImages = 0;
    let missingAlts = 0;
    let badLinksCount = 0;
    const genericTerms = ['click here', 'read more', 'learn more', 'more', 'link', 'here', 'go', 'button', 'info', 'website'];
    const problematicPosts = [];

    posts.forEach(post => {
      const html = post.content_html || '';
      if (!html) return;

      const postDom = new JSDOM(`<div>${html}</div>`);
      const container = postDom.window.document.querySelector('div');

      // Check Images Alt
      const imgs = Array.from(container.querySelectorAll('img'));
      imgs.forEach(img => {
        totalImages++;
        if (!img.hasAttribute('alt')) {
          missingAlts++;
        }
      });

      // Check Links Text
      const links = Array.from(container.querySelectorAll('a'));
      links.forEach(link => {
        const text = link.textContent.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        if (genericTerms.includes(text)) {
          badLinksCount++;
          if (!problematicPosts.includes(post.title)) {
            problematicPosts.push(post.title);
          }
        }
      });
    });

    if (totalImages > 0 && missingAlts > 0) {
      addResult(category, 'Blog Image Alts', false, 'error', `Found ${missingAlts} image(s) missing alt text out of ${totalImages} total images inside blog HTML content.`, 'Add alt attribute descriptions to all image structures inside Wix post HTML content to ensure readers can understand blog post illustrations.');
    } else if (totalImages > 0) {
      addResult(category, 'Blog Image Alts', true, 'success', `All ${totalImages} images inside blog posts have alt attributes.`);
    }

    if (badLinksCount > 0) {
      addResult(category, 'Blog Link Text', false, 'warning', `Found ${badLinksCount} generic links (e.g. "click here") in blog posts: "${problematicPosts.slice(0, 3).join('", "')}${problematicPosts.length > 3 ? '...' : ''}"`, 'Edit post contents inside posts.json to use descriptive link texts instead of generic expressions like "click here" or "learn more".');
    } else {
      addResult(category, 'Blog Link Text', true, 'success', 'All links inside blog posts use descriptive link texts.');
    }

  } catch (err) {
    addResult(category, 'Blog Data Parsing', false, 'error', `Error reading or parsing blog data: ${err.message}`, 'Fix syntax errors or invalid paths associated with data/posts.json.');
  }
}

/* ==========================================================================
   REPORT FORMATTER
   ========================================================================== */
function printReport() {
  const categoryOrder = ['SEO', 'Accessibility', 'Blog Content'];

  categoryOrder.forEach(cat => {
    const catResults = auditState.details.filter(r => r.category === cat);
    if (catResults.length === 0) return;

    console.log(`\n${colors.bright}${colors.cyan}=== ${cat} CHECKS ===${colors.reset}`);

    catResults.forEach(r => {
      let symbol = symbols.success;
      let color = colors.green;
      let severityLabel = '';

      if (!r.passed) {
        if (r.severity === 'error') {
          symbol = symbols.error;
          color = colors.red;
          severityLabel = `[${colors.red}${colors.bright}ERROR${colors.reset}${color}] `;
        } else if (r.severity === 'warning') {
          symbol = symbols.warning;
          color = colors.yellow;
          severityLabel = `[${colors.yellow}WARN${colors.reset}${color}] `;
        } else {
          symbol = symbols.info;
          color = colors.blue;
          severityLabel = `[${colors.blue}INFO${colors.reset}${color}] `;
        }
      }

      console.log(`  ${symbol} ${colors.bright}${r.name}:${colors.reset} ${color}${severityLabel}${r.message}${colors.reset}`);
      if (!r.passed && r.recommendation) {
        console.log(`     ${colors.dim}👉 Recommendation: ${r.recommendation}${colors.reset}`);
      }
    });
  });

  // Print Summary Table
  console.log(`\n${colors.bright}${colors.white}=== AUDIT SUMMARY ===${colors.reset}`);
  console.log(`  ${symbols.success} Passed:    ${colors.green}${auditState.passed}${colors.reset}`);
  console.log(`  ${symbols.error} Errors:    ${colors.red}${auditState.errors}${colors.reset}`);
  console.log(`  ${symbols.warning} Warnings:  ${colors.yellow}${auditState.warnings}${colors.reset}`);
  console.log(`  ${symbols.info} Infos:     ${colors.cyan}${auditState.infos}${colors.reset}`);
  console.log(`  Total Checks Executed: ${auditState.passed + auditState.errors + auditState.warnings + auditState.infos}`);
}

// Execute Audit
runAudit();
