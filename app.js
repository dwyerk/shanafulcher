/**
 * Shana Fulcher Website logic
 * Handles SPA routing, theme toggle, blog search/filtering, modals, forms, and animations.
 */

// Global state
let blogPosts = [];
let activeFilters = {
  search: '',
  category: 'all'
};

// Route mapping
const routes = {
  '/': 'view-home',
  '/about': 'view-about',
  '/priorities': 'view-priorities',
  '/updates': 'view-updates',
  '/get-involved': 'view-get-involved',
  '/contact': 'view-contact'
};

// Page Titles
const pageTitles = {
  'view-home': 'Shana Fulcher for City Council | Home',
  'view-about': 'Shana Fulcher for City Council | About Shana',
  'view-priorities': 'Shana Fulcher for City Council | Priorities',
  'view-updates': 'Shana Fulcher for City Council | Campaign Updates',
  'view-get-involved': 'Shana Fulcher for City Council | Join the Campaign',
  'view-contact': 'Shana Fulcher for City Council | Contact Shana'
};

/* ==========================================================================
   INITIALIZATION & ROUTER
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initRouter();
  initMobileMenu();
  loadBlogData();
  setupFormSubmissions();
  setupScrollAnimations();
});

// Client-side Router
function initRouter() {
  // Listen for navigation links
  document.body.addEventListener('click', (e) => {
    // Intercept clicks on links that are relative (internal routing)
    const targetLink = e.target.closest('a');
    if (targetLink && targetLink.getAttribute('href') && !targetLink.getAttribute('href').startsWith('http') && !targetLink.getAttribute('href').startsWith('#') && !targetLink.getAttribute('href').startsWith('tel:') && !targetLink.getAttribute('href').startsWith('mailto:')) {
      e.preventDefault();
      const path = targetLink.getAttribute('href');
      navigate(path);
    }
  });

  // Handle popstate (back/forward browser buttons)
  window.addEventListener('popstate', () => {
    handleRouting(window.location.pathname);
  });

  // Run initial routing on load
  handleRouting(window.location.pathname);
}

function navigate(path) {
  window.history.pushState({}, '', path);
  handleRouting(path);
}

function handleRouting(path) {
  // Check for exact route matches
  let targetView = routes[path];
  let postIdToOpen = null;

  // Handle post detail route: /post/:id
  if (path.startsWith('/post/')) {
    targetView = 'view-updates';
    postIdToOpen = path.replace('/post/', '');
  }

  // Fallback to home if route not found
  if (!targetView) {
    targetView = 'view-home';
    window.history.replaceState({}, '', '/');
  }

  // Switch Active View
  document.querySelectorAll('.page-view').forEach(view => {
    view.classList.remove('active-view');
  });

  const activeViewEl = document.getElementById(targetView);
  if (activeViewEl) {
    activeViewEl.classList.add('active-view');
    // Scroll to top on route change
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // Update nav menu active states
  updateNavActiveState(path);

  // Update Page Title
  document.title = pageTitles[targetView] || 'Shana Fulcher';

  // If mobile menu is open, close it
  closeMobileMenu();

  // If a post ID was specified, attempt to open the modal once blog data is loaded
  if (postIdToOpen) {
    // We wait slightly if blog data isn't loaded yet
    if (blogPosts.length > 0) {
      openPostById(postIdToOpen);
    } else {
      // Set an interval check or rely on the blog data fetch resolver
      const checkInterval = setInterval(() => {
        if (blogPosts.length > 0) {
          openPostById(postIdToOpen);
          clearInterval(checkInterval);
        }
      }, 100);
      // Timeout after 3 seconds
      setTimeout(() => clearInterval(checkInterval), 3000);
    }
  }
}

function updateNavActiveState(path) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    const href = link.getAttribute('href');
    if (href === path || (path.startsWith('/post/') && href === '/updates')) {
      link.classList.add('active');
    }
  });
}

/* ==========================================================================
   THEME MANAGER (DARK/LIGHT)
   ========================================================================== */
function initTheme() {
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const storedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (storedTheme === 'dark' || (!storedTheme && systemPrefersDark)) {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
    themeToggleBtn.setAttribute('aria-label', 'Switch to light theme');
  } else {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    themeToggleBtn.setAttribute('aria-label', 'Switch to dark theme');
  }

  themeToggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-theme');
    document.body.classList.toggle('light-theme', !isDark);
    
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeToggleBtn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
  });
}

/* ==========================================================================
   MOBILE MENU DRAWER
   ========================================================================== */
function initMobileMenu() {
  const toggleBtn = document.getElementById('mobile-menu-toggle');
  const navMenu = document.getElementById('primary-nav');

  toggleBtn.addEventListener('click', () => {
    const isOpen = navMenu.classList.toggle('open');
    toggleBtn.setAttribute('aria-expanded', isOpen);
  });
}

function closeMobileMenu() {
  const toggleBtn = document.getElementById('mobile-menu-toggle');
  const navMenu = document.getElementById('primary-nav');
  if (navMenu) navMenu.classList.remove('open');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
}

/* ==========================================================================
   BLOG CONTROLLER & SEARCH ENGINE
   ========================================================================== */
async function loadBlogData() {
  const blogContainer = document.getElementById('blog-posts-container');
  try {
    const res = await fetch('/data/posts.json');
    if (!res.ok) throw new Error('Failed to load blog posts data.');
    blogPosts = await res.json();
    
    // Inject Categories into blog posts
    blogPosts = blogPosts.map(post => {
      post.categories = categorizePost(post);
      return post;
    });

    // Render teaser on home view
    renderHomeTeaser();

    // Render full blog lists
    renderBlogPosts();
    setupBlogControls();

  } catch (err) {
    console.error(err);
    if (blogContainer) {
      blogContainer.innerHTML = `<div class="loading-spinner" style="color: var(--color-accent)">Error loading updates. Please refresh the page.</div>`;
    }
  }
}

// Categorize post dynamically based on keyword matching
function categorizePost(post) {
  const textToScan = (post.title + " " + post.excerpt + " " + post.content_html).toLowerCase();
  const categories = ['all'];

  // Housing preservation / rent / landlord
  if (textToScan.includes('housing') || textToScan.includes('rent') || textToScan.includes('landlord') || textToScan.includes('tenant') || textToScan.includes('building') || textToScan.includes('construction') || textToScan.includes('PILOT')) {
    categories.push('housing');
  }
  // Budget / grants / amendment
  if (textToScan.includes('budget') || textToScan.includes('funding') || textToScan.includes('grant') || textToScan.includes('amendment') || textToScan.includes('dollar') || textToScan.includes('survey')) {
    categories.push('budget');
  }
  // Traffic / humps / safety / police
  if (textToScan.includes('police') || textToScan.includes('speed') || textToScan.includes('hump') || textToScan.includes('safety') || textToScan.includes('street') || textToScan.includes('intersection') || textToScan.includes('sidewalk') || textToScan.includes('traffic') || textToScan.includes('crime')) {
    categories.push('safety');
  }
  // Meeting schedules, agenda, worksessions
  if (textToScan.includes('agenda') || textToScan.includes('meeting') || textToScan.includes('work session') || textToScan.includes('voting') || textToScan.includes('ordinance') || textToScan.includes('council')) {
    categories.push('council');
  }

  return categories;
}

function renderHomeTeaser() {
  if (blogPosts.length === 0) return;
  const latest = blogPosts[0]; // RSS is sorted newest first
  
  const teaserTitle = document.getElementById('teaser-title');
  const teaserDate = document.getElementById('teaser-date');
  const teaserExcerpt = document.getElementById('teaser-excerpt');
  const teaserReadMore = document.getElementById('teaser-read-more');

  if (teaserTitle) teaserTitle.textContent = latest.title;
  if (teaserDate) teaserDate.textContent = latest.date;
  
  // Excerpt cleanup (remove Wix metadata repeats if any)
  let cleanExcerpt = latest.excerpt;
  if (cleanExcerpt.includes('5 min read') || cleanExcerpt.includes('4 min read') || cleanExcerpt.includes('3 min read')) {
    const parts = cleanExcerpt.split(/min read/i);
    cleanExcerpt = parts.length > 1 ? parts[1].trim() : cleanExcerpt;
  }
  if (teaserExcerpt) teaserExcerpt.textContent = cleanExcerpt;

  if (teaserReadMore) {
    teaserReadMore.addEventListener('click', () => {
      navigate(`/post/${latest.id}`);
    });
  }
}

function renderBlogPosts() {
  const container = document.getElementById('blog-posts-container');
  const noPostsMsg = document.getElementById('no-posts-found');
  if (!container) return;

  container.innerHTML = '';

  const filtered = blogPosts.filter(post => {
    // Match Category
    const matchesCategory = activeFilters.category === 'all' || post.categories.includes(activeFilters.category);
    
    // Match Search Query
    const query = activeFilters.search.toLowerCase().trim();
    const matchesSearch = !query || 
      post.title.toLowerCase().includes(query) || 
      post.excerpt.toLowerCase().includes(query) || 
      post.content_html.toLowerCase().includes(query);

    return matchesCategory && matchesSearch;
  });

  if (filtered.length === 0) {
    noPostsMsg.style.display = 'block';
    return;
  }

  noPostsMsg.style.display = 'none';

  filtered.forEach(post => {
    const card = document.createElement('article');
    card.className = 'blog-card animate-on-scroll animated';
    
    // Process excerpt to remove initial wix noise
    let cleanExcerpt = post.excerpt;
    if (cleanExcerpt.includes('min read')) {
      const splitParts = cleanExcerpt.split(/min read/i);
      cleanExcerpt = splitParts.length > 1 ? splitParts[1].trim() : cleanExcerpt;
    }
    // Limit length
    if (cleanExcerpt.length > 180) {
      cleanExcerpt = cleanExcerpt.slice(0, 175) + '...';
    }

    card.innerHTML = `
      <div class="blog-card-meta">
        <span>📅 ${post.date}</span>
        <span>✍️ Shana Fulcher</span>
      </div>
      <h3 class="blog-card-title">${post.title}</h3>
      <p class="blog-card-excerpt">${cleanExcerpt}</p>
      <a href="/post/${post.id}" class="card-link read-post-link" data-post-id="${post.id}">Read full notes &rarr;</a>
    `;

    container.appendChild(card);
  });

  // Setup click listeners for dynamic post links
  container.querySelectorAll('.read-post-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const id = link.getAttribute('data-post-id');
      navigate(`/post/${id}`);
    });
  });
}

function setupBlogControls() {
  const searchInput = document.getElementById('blog-search');
  const filterPills = document.querySelectorAll('.filter-pill');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      activeFilters.search = e.target.value;
      renderBlogPosts();
    });
  }

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilters.category = pill.getAttribute('data-filter');
      renderBlogPosts();
    });
  });
}

/* ==========================================================================
   MODAL READING DIALOG
   ========================================================================== */
const modal = document.getElementById('post-reader-modal');
const modalTitle = document.getElementById('modal-post-title');
const modalDate = document.getElementById('modal-post-date');
const modalBody = document.getElementById('modal-post-body');
const closeModalBtns = [
  document.getElementById('close-modal-btn'),
  document.getElementById('modal-close-footer-btn')
];

function openPostById(id) {
  const post = blogPosts.find(p => p.id === id);
  if (!post || !modal) return;

  modalTitle.textContent = post.title;
  modalDate.textContent = post.date;

  // Clean Wix HTML metadata repeating sections (e.g. <h1>Title</h1> and the following list showing author/read-time)
  let cleanHtml = post.content_html;
  
  // Wix structure starts with structural headers and details inside nested divs.
  // We'll strip the first <h1>Title</h1> tag block and any following lists if they exist.
  // Using HTML DOM parsing to remove elements dynamically
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = cleanHtml;
  
  const topH1 = tempDiv.querySelector('h1');
  if (topH1 && topH1.textContent.trim() === post.title.trim()) {
    topH1.remove();
  }
  
  // Strip metadata lists (the list containing "Shana Fulcher" and "min read")
  const metaLists = tempDiv.querySelectorAll('ul');
  for (const list of metaLists) {
    const listText = list.textContent.toLowerCase();
    if (listText.includes('shana fulcher') && listText.includes('min read')) {
      list.remove();
      break;
    }
  }

  modalBody.innerHTML = tempDiv.innerHTML;

  // Show modal using native dialog API
  modal.showModal();
  
  // Lock body scroll
  document.body.style.overflow = 'hidden';

  // Modal event handling
  closeModalBtns.forEach(btn => {
    if (btn) {
      btn.onclick = closeModal;
    }
  });

  // Handle click outside modal box
  modal.onclick = (e) => {
    const rect = modal.getBoundingClientRect();
    const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
    if (!isInDialog) {
      closeModal();
    }
  };

  // Esc key closes naturally but let's intercept to restore body scroll
  modal.onclose = () => {
    document.body.style.overflow = '';
    // Restore updates view route path in history without modal ID
    window.history.pushState({}, '', '/updates');
    updateNavActiveState('/updates');
    document.title = pageTitles['view-updates'];
  };
}

function closeModal() {
  if (modal) {
    modal.close();
  }
}

/* ==========================================================================
   ASYNCHRONOUS NETLIFY FORM SUBMISSIONS
   ========================================================================== */
function setupFormSubmissions() {
  const forms = [
    { id: 'contact-form', successId: 'contact-success' },
    { id: 'get-involved-form', successId: 'involved-success' },
    { id: 'subscribe-form', successId: 'subscribe-success' }
  ];

  forms.forEach(formConfig => {
    const form = document.getElementById(formConfig.id);
    const successMsg = document.getElementById(formConfig.successId);

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Prepare Form Data for Netlify Forms POST
        const formData = new FormData(form);
        
        // Gather action/method
        const submitBtn = form.querySelector('button[type="submit"]');
        const origBtnText = submitBtn ? submitBtn.textContent : 'Submit';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Submitting...';
        }

        try {
          const response = await fetch('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(formData).toString()
          });

          if (response.ok) {
            // Smoothly hide form and show success message
            form.style.display = 'none';
            if (successMsg) {
              successMsg.style.display = 'block';
              successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          } else {
            throw new Error('Form submission failed.');
          }
        } catch (error) {
          console.error(error);
          alert('Sorry, there was an issue submitting your form. Please try emailing directly.');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = origBtnText;
          }
        }
      });
    }
  });
}

/* ==========================================================================
   SCROLL INTERSECTION ANIMATIONS
   ========================================================================== */
function setupScrollAnimations() {
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
          observer.unobserve(entry.target); // Animate once
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    document.querySelectorAll('.animate-on-scroll').forEach(el => {
      observer.observe(el);
    });
  } else {
    // Fallback: trigger immediately if browser lacks IntersectionObserver support
    document.querySelectorAll('.animate-on-scroll').forEach(el => {
      el.classList.add('animated');
    });
  }
}
