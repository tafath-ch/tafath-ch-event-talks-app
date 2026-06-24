// Application State
let state = {
    releases: [],
    filteredReleases: [],
    bookmarks: new Set(),
    activeTab: 'all',          // 'all' or 'bookmarks'
    activeCategory: 'All',     // 'All' or specific categories
    searchTerm: '',
    timeFilter: 'all',         // 'all', '7', '30', '90', '365'
    sortOrder: 'desc',         // 'desc' or 'asc'
    selectedRelease: null      // Current release open in the drawer
};

// DOM Elements
const elements = {
    timelineStream: document.getElementById('timeline-stream'),
    timelineLoading: document.getElementById('timeline-loading'),
    timelineEmpty: document.getElementById('timeline-empty'),
    btnRefresh: document.getElementById('btn-refresh'),
    statusIndicator: document.getElementById('status-indicator'),
    statusText: document.getElementById('status-text'),
    lastFetchedText: document.getElementById('last-fetched-text'),
    searchInput: document.getElementById('search-input'),
    clearSearch: document.getElementById('clear-search'),
    timeFilter: document.getElementById('time-filter'),
    sortOrder: document.getElementById('sort-order'),
    categoryPills: document.getElementById('category-pills'),
    starredCountBadge: document.getElementById('starred-count-badge'),
    
    // Overview Cards
    statTotal: document.getElementById('stat-total-count'),
    statFeatures: document.getElementById('stat-features-count'),
    statFixes: document.getElementById('stat-fixes-count'),
    statAnnouncements: document.getElementById('stat-announcements-count'),
    overviewCards: document.querySelectorAll('.stat-card'),
    
    // Active filters
    activeFiltersInfo: document.getElementById('active-filters-info'),
    filterSummaryText: document.getElementById('filter-summary-text'),
    btnResetFilters: document.getElementById('btn-reset-filters'),
    btnClearFiltersEmpty: document.getElementById('btn-clear-filters-empty'),
    
    // Nav
    navAll: document.getElementById('nav-all'),
    navBookmarks: document.getElementById('nav-bookmarks'),
    
    // Sidebar widget
    distributionChart: document.getElementById('distribution-chart'),
    
    // Drawer
    drawerOverlay: document.getElementById('drawer-overlay'),
    drawerPanel: document.getElementById('drawer-panel'),
    drawerCloseBtn: document.getElementById('btn-close-drawer'),
    drawerDate: document.getElementById('drawer-date'),
    drawerCategory: document.getElementById('drawer-category-badge'),
    drawerStarBtn: document.getElementById('btn-drawer-star'),
    drawerTitle: document.getElementById('drawer-title'),
    drawerContent: document.getElementById('drawer-content-html'),
    drawerDocsLink: document.getElementById('drawer-docs-link'),
    drawerTweetBtn: document.getElementById('btn-drawer-tweet'),
    drawerCopyLinkBtn: document.getElementById('btn-drawer-copy-link'),
    
    // Toast
    toast: document.getElementById('toast-notification'),
    toastIcon: document.getElementById('toast-icon'),
    toastMessage: document.getElementById('toast-message')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    loadBookmarks();
    fetchReleases();
    setupEventListeners();
});

// Load Bookmarks from LocalStorage
function loadBookmarks() {
    try {
        const saved = localStorage.getItem('bq_release_bookmarks');
        if (saved) {
            const parsed = JSON.parse(saved);
            state.bookmarks = new Set(parsed);
        }
    } catch (e) {
        console.error('Failed to load bookmarks', e);
    }
    updateStarredCountUI();
}

// Save Bookmarks to LocalStorage
function saveBookmarks() {
    try {
        const arr = Array.from(state.bookmarks);
        localStorage.setItem('bq_release_bookmarks', JSON.stringify(arr));
    } catch (e) {
        console.error('Failed to save bookmarks', e);
    }
    updateStarredCountUI();
}

// Update Bookmarks badge count
function updateStarredCountUI() {
    elements.starredCountBadge.textContent = state.bookmarks.size;
    if (state.bookmarks.size > 0) {
        elements.starredCountBadge.style.display = 'inline-block';
    } else {
        elements.starredCountBadge.style.display = 'none';
        if (state.activeTab === 'bookmarks') {
            switchTab('all');
        }
    }
}

// Fetch Release Notes
async function fetchReleases(force = false) {
    showLoading(true);
    updateSyncStatus('syncing', 'Fetching updates...', 'Request in progress');
    
    try {
        const url = `/api/releases${force ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('API server returned error status');
        
        const data = await response.json();
        
        if (data.status === 'error') {
            throw new Error(data.message);
        }
        
        state.releases = data.releases || [];
        
        // Update statuses
        const updateTime = new Date(data.last_updated);
        const formatTime = updateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const sourceLabel = data.source === 'cache' ? 'Cached' : 'Synced';
        
        updateSyncStatus('online', 'Connected', `${sourceLabel} at ${formatTime}`);
        
        if (force) {
            showToast('Release notes synchronized successfully', 'success');
        }
        
        // Process data
        processReleases();
        
        // Check if there is a shared release ID in the query params
        checkSharedRelease();
        
    } catch (error) {
        console.error('Error fetching release notes:', error);
        updateSyncStatus('offline', 'Error Syncing', error.message || 'Check network connection');
        showToast('Failed to fetch latest release notes', 'error');
        showLoading(false);
        elements.timelineEmpty.style.display = 'flex';
        elements.timelineStream.style.display = 'none';
    }
}

function showLoading(isLoading) {
    if (isLoading) {
        elements.timelineLoading.style.display = 'flex';
        elements.timelineStream.style.display = 'none';
        elements.timelineEmpty.style.display = 'none';
        elements.btnRefresh.classList.add('loading');
        elements.btnRefresh.disabled = true;
    } else {
        elements.timelineLoading.style.display = 'none';
        elements.btnRefresh.classList.remove('loading');
        elements.btnRefresh.disabled = false;
    }
}

function updateSyncStatus(status, text, subtitle) {
    elements.statusIndicator.className = `status-indicator ${status}`;
    elements.statusText.textContent = text;
    elements.lastFetchedText.textContent = subtitle;
}

// Process Releases (Filtering, sorting, widgets, counters)
function processReleases() {
    // 1. Calculate stats of entire dataset (unfiltered)
    calculateGlobalStats();
    
    // 2. Render sidebar distribution widget
    renderDistributionWidget();
    
    // 3. Render filter pills dynamically
    renderCategoryPills();
    
    // 4. Apply current filters & sorting
    applyFilters();
    
    showLoading(false);
}

// Calculate overview statistics
function calculateGlobalStats() {
    elements.statTotal.textContent = state.releases.length;
    
    const features = state.releases.filter(r => r.category === 'Feature').length;
    const fixes = state.releases.filter(r => r.category === 'Fix').length;
    const announcements = state.releases.filter(r => r.category === 'Announcement').length;
    
    elements.statFeatures.textContent = features;
    elements.statFixes.textContent = fixes;
    elements.statAnnouncements.textContent = announcements;
}

// Render Sidebar distribution bar charts
function renderDistributionWidget() {
    const total = state.releases.length;
    if (total === 0) return;
    
    const cats = ['Feature', 'Fix', 'Announcement', 'Deprecated'];
    const labelMapping = {
        'Feature': 'Features',
        'Fix': 'Fixes & Improvs',
        'Announcement': 'Announcements',
        'Deprecated': 'Deprecations'
    };
    
    elements.distributionChart.innerHTML = '';
    
    cats.forEach(cat => {
        const count = state.releases.filter(r => r.category === cat).length;
        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
        
        const cardClass = cat.toLowerCase();
        
        const wrapper = document.createElement('div');
        wrapper.className = 'dist-bar-wrapper';
        wrapper.innerHTML = `
            <div class="dist-bar-label">
                <span>${labelMapping[cat]}</span>
                <span>${count} (${percentage}%)</span>
            </div>
            <div class="dist-bar-bg">
                <div class="dist-bar-fill ${cardClass}" style="width: 0%"></div>
            </div>
        `;
        
        elements.distributionChart.appendChild(wrapper);
        
        // Trigger width animation on next tick
        setTimeout(() => {
            const fill = wrapper.querySelector('.dist-bar-fill');
            if (fill) fill.style.width = `${percentage}%`;
        }, 50);
    });
}

// Generate category filters list
function renderCategoryPills() {
    // Unique list of categories present
    const categories = new Set(state.releases.map(r => r.category));
    const sortedCats = Array.from(categories).sort();
    
    // Rebuild Category Pills
    elements.categoryPills.innerHTML = '';
    
    // Add 'All' Pill
    const allPill = document.createElement('button');
    allPill.className = `filter-pill ${state.activeCategory === 'All' ? 'active' : ''}`;
    allPill.innerHTML = `<span>All Categories</span>`;
    allPill.addEventListener('click', () => filterByCategory('All'));
    elements.categoryPills.appendChild(allPill);
    
    sortedCats.forEach(cat => {
        if (!cat) return;
        const count = state.releases.filter(r => r.category === cat).length;
        
        const pill = document.createElement('button');
        const catClass = cat.toLowerCase();
        pill.className = `filter-pill ${state.activeCategory === cat ? 'active' : ''} ${catClass}`;
        pill.innerHTML = `
            <span class="pill-dot ${catClass}"></span>
            <span>${cat}</span>
            <span style="font-size: 11px; margin-left: 4px; opacity: 0.6">(${count})</span>
        `;
        
        pill.addEventListener('click', () => filterByCategory(cat));
        elements.categoryPills.appendChild(pill);
    });
}

// Filter and render timeline
function applyFilters() {
    const now = new Date();
    
    state.filteredReleases = state.releases.filter(release => {
        // Tab Filter (All vs Starred/Bookmarks)
        if (state.activeTab === 'bookmarks' && !state.bookmarks.has(release.id)) {
            return false;
        }
        
        // Category Filter
        if (state.activeCategory !== 'All' && release.category !== state.activeCategory) {
            return false;
        }
        
        // Search Term Filter
        if (state.searchTerm) {
            const query = state.searchTerm.toLowerCase();
            const titleMatch = (release.title || '').toLowerCase().includes(query);
            const contentMatch = (release.html_content || '').toLowerCase().includes(query);
            const catMatch = (release.category || '').toLowerCase().includes(query);
            const dateMatch = (release.date || '').toLowerCase().includes(query);
            
            if (!titleMatch && !contentMatch && !catMatch && !dateMatch) {
                return false;
            }
        }
        
        // Time Filter (days)
        if (state.timeFilter !== 'all') {
            const days = parseInt(state.timeFilter, 10);
            if (release.iso_date) {
                const releaseDate = new Date(release.iso_date);
                const diffTime = Math.abs(now - releaseDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays > days) return false;
            } else {
                return false; // Skip if no parsable date
            }
        }
        
        return true;
    });
    
    // Sort logic
    state.filteredReleases.sort((a, b) => {
        const dateA = new Date(a.iso_date || a.raw_updated || 0);
        const dateB = new Date(b.iso_date || b.raw_updated || 0);
        return state.sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
    
    renderTimeline();
    updateFilterSummaryUI();
}

// Render the main list of release notes
function renderTimeline() {
    elements.timelineStream.innerHTML = '';
    
    if (state.filteredReleases.length === 0) {
        elements.timelineEmpty.style.display = 'flex';
        elements.timelineStream.style.display = 'none';
        return;
    }
    
    elements.timelineEmpty.style.display = 'none';
    elements.timelineStream.style.display = 'flex';
    
    state.filteredReleases.forEach(release => {
        const isStarred = state.bookmarks.has(release.id);
        const catClass = release.category.toLowerCase();
        
        // Create card element
        const card = document.createElement('article');
        card.className = 'release-card';
        card.dataset.id = release.id;
        
        // Set short summary length check (does it have long content?)
        const isLongContent = release.html_content.length > 300;
        
        card.innerHTML = `
            <div class="release-card-header">
                <div class="release-card-meta">
                    <span class="category-badge ${catClass}">${release.category}</span>
                    <span class="release-date">${release.date}</span>
                </div>
                <div class="release-card-actions">
                    <button class="btn-icon btn-star ${isStarred ? 'starred' : ''}" title="${isStarred ? 'Remove Star' : 'Star this note'}">
                        <span class="material-symbols-outlined">${isStarred ? 'star' : 'grade'}</span>
                    </button>
                    <button class="btn-icon btn-tweet-icon" title="Tweet this update">
                        <svg class="twitter-icon" viewBox="0 0 24 24" width="16" height="16" style="display: block;">
                            <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                    </button>
                    <button class="btn-icon btn-share" title="Copy shareable link">
                        <span class="material-symbols-outlined">share</span>
                    </button>
                </div>
            </div>
            
            <div class="release-card-body ${isLongContent ? '' : 'expanded'}">
                ${release.html_content}
            </div>
            
            <div class="release-card-footer">
                ${isLongContent ? `
                    <button class="btn-read-more">
                        <span>Read More</span>
                        <span class="material-symbols-outlined" style="font-size: 16px;">keyboard_arrow_down</span>
                    </button>
                ` : '<span></span>'}
                
                <button class="btn btn-secondary btn-sm btn-view-details">
                    <span>Full Details</span>
                    <span class="material-symbols-outlined" style="font-size: 16px;">arrow_forward</span>
                </button>
            </div>
        `;
        
        // Event Listeners for inside the card
        
        // Bookmark Button Click
        const starBtn = card.querySelector('.btn-star');
        starBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleBookmark(release.id);
        });
        
        // Share Button Click
        const shareBtn = card.querySelector('.btn-share');
        shareBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyShareableLink(release.id);
        });
        
        // Tweet Button Click
        const tweetBtn = card.querySelector('.btn-tweet-icon');
        if (tweetBtn) {
            tweetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                tweetRelease(release);
            });
        }
        
        // Expand Body Button
        const readMoreBtn = card.querySelector('.btn-read-more');
        if (readMoreBtn) {
            readMoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const body = card.querySelector('.release-card-body');
                const isExpanded = body.classList.toggle('expanded');
                
                readMoreBtn.querySelector('span:first-child').textContent = isExpanded ? 'Show Less' : 'Read More';
                readMoreBtn.querySelector('span:last-child').textContent = isExpanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down';
            });
        }
        
        // View Details / Click anywhere on card (except interactive links)
        card.addEventListener('click', (e) => {
            // Ignore if clicked on links, code snippets or interactive buttons
            if (e.target.closest('a') || e.target.closest('button')) {
                return;
            }
            openDrawer(release);
        });
        
        const detailsBtn = card.querySelector('.btn-view-details');
        detailsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDrawer(release);
        });
        
        elements.timelineStream.appendChild(card);
    });
}

// Show info on active filters
function updateFilterSummaryUI() {
    const hasActiveFilters = state.activeCategory !== 'All' || state.searchTerm || state.timeFilter !== 'all' || state.activeTab === 'bookmarks';
    
    if (hasActiveFilters) {
        elements.activeFiltersInfo.style.display = 'flex';
        
        let filtersDesc = `Showing <strong>${state.filteredReleases.length}</strong> updates`;
        
        if (state.activeTab === 'bookmarks') {
            filtersDesc += ` in <strong>Starred</strong>`;
        }
        if (state.activeCategory !== 'All') {
            filtersDesc += ` marked <strong>${state.activeCategory}</strong>`;
        }
        if (state.timeFilter !== 'all') {
            filtersDesc += ` from last <strong>${state.timeFilter} days</strong>`;
        }
        if (state.searchTerm) {
            filtersDesc += ` matching <strong>"${state.searchTerm}"</strong>`;
        }
        
        elements.filterSummaryText.innerHTML = filtersDesc;
    } else {
        elements.activeFiltersInfo.style.display = 'none';
    }
}

// Toggle Bookmarking a Release Note
function toggleBookmark(id) {
    const wasStarred = state.bookmarks.has(id);
    
    if (wasStarred) {
        state.bookmarks.delete(id);
        showToast('Star removed', 'success');
    } else {
        state.bookmarks.add(id);
        showToast('Added to Starred Notes', 'success');
    }
    
    saveBookmarks();
    
    // Re-apply filters (especially important if in bookmarks tab)
    applyFilters();
    
    // Sync Drawer star button state if open
    if (state.selectedRelease && state.selectedRelease.id === id) {
        updateDrawerStarButtonUI(id);
    }
}

// Filter triggers
function filterByCategory(category) {
    state.activeCategory = category;
    
    // Highlight overview card if category matches
    elements.overviewCards.forEach(card => {
        const cardCat = card.dataset.category;
        if (cardCat === category) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
    
    // Update pills highlighting
    renderCategoryPills();
    applyFilters();
}

function switchTab(tab) {
    state.activeTab = tab;
    
    if (tab === 'all') {
        elements.navAll.classList.add('active');
        elements.navBookmarks.classList.remove('active');
    } else {
        elements.navAll.classList.remove('active');
        elements.navBookmarks.classList.add('active');
    }
    
    applyFilters();
}

// Detail Drawer Management
function openDrawer(release) {
    state.selectedRelease = release;
    
    elements.drawerDate.textContent = release.date;
    elements.drawerTitle.textContent = release.category === 'General' ? 'Release Update' : `${release.category} Update`;
    elements.drawerContent.innerHTML = release.html_content;
    
    // Set category badge style
    const catClass = release.category.toLowerCase();
    elements.drawerCategory.className = `category-badge ${catClass}`;
    elements.drawerCategory.textContent = release.category;
    
    // Setup documents links
    elements.drawerDocsLink.href = release.link || 'https://cloud.google.com/bigquery/docs/release-notes';
    
    // Update star button in drawer
    updateDrawerStarButtonUI(release.id);
    
    // Open drawer panel
    elements.drawerOverlay.classList.add('active');
    elements.drawerPanel.classList.add('active');
    
    // Update active url state silently without reloading to allow direct sharing
    const newUrl = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(release.id)}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
}

function closeDrawer() {
    state.selectedRelease = null;
    elements.drawerOverlay.classList.remove('active');
    elements.drawerPanel.classList.remove('active');
    
    // Reset URL query parameters silently
    const resetUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.pushState({ path: resetUrl }, '', resetUrl);
}

function updateDrawerStarButtonUI(id) {
    const isStarred = state.bookmarks.has(id);
    if (isStarred) {
        elements.drawerStarBtn.classList.add('starred');
        elements.drawerStarBtn.querySelector('span').textContent = 'star';
        elements.drawerStarBtn.querySelector('span:last-child').textContent = 'Starred';
    } else {
        elements.drawerStarBtn.classList.remove('starred');
        elements.drawerStarBtn.querySelector('span').textContent = 'grade';
        elements.drawerStarBtn.querySelector('span:last-child').textContent = 'Star Update';
    }
}

// Copy Shareable Link Helper
function copyShareableLink(id) {
    const link = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(id)}`;
    copyTextToClipboard(link, 'Shareable link copied to clipboard!');
}

// Tweet Release Note Helper
function tweetRelease(release) {
    const text = `Google BigQuery Update: ${release.title} [${release.category}]`;
    const url = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(release.id)}`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420,referrerpolicy=no-referrer');
}

function copyTextToClipboard(text, successMsg) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg, 'success');
    }, (err) => {
        console.error('Attempted to copy, failed: ', err);
        showToast('Failed to copy link. Please manually copy the URL.', 'error');
    });
}

// Check if loaded with shared release ID
function checkSharedRelease() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
        const found = state.releases.find(r => r.id === id);
        if (found) {
            // Open it automatically
            setTimeout(() => openDrawer(found), 250);
        } else {
            showToast('Shared release note not found.', 'error');
        }
    }
}

// Toast Alert
let toastTimeout;
function showToast(message, type = 'success') {
    clearTimeout(toastTimeout);
    
    elements.toastMessage.textContent = message;
    elements.toast.className = `toast-notification active ${type}`;
    elements.toastIcon.textContent = type === 'success' ? 'check_circle' : 'error';
    
    toastTimeout = setTimeout(() => {
        elements.toast.classList.remove('active');
    }, 3000);
}

// Setup all Event Listeners
function setupEventListeners() {
    // Search input
    let searchDebounce;
    elements.searchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        state.searchTerm = val;
        
        elements.clearSearch.style.display = val ? 'block' : 'none';
        
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            applyFilters();
        }, 150);
    });
    
    // Clear search
    elements.clearSearch.addEventListener('click', () => {
        elements.searchInput.value = '';
        state.searchTerm = '';
        elements.clearSearch.style.display = 'none';
        applyFilters();
    });
    
    // Date & Time Filters
    elements.timeFilter.addEventListener('change', (e) => {
        state.timeFilter = e.target.value;
        applyFilters();
    });
    
    // Sorting order
    elements.sortOrder.addEventListener('change', (e) => {
        state.sortOrder = e.target.value;
        applyFilters();
    });
    
    // Sync buttons
    elements.btnRefresh.addEventListener('click', () => {
        fetchReleases(true);
    });
    
    // Sidebar Tabs
    elements.navAll.addEventListener('click', () => switchTab('all'));
    elements.navBookmarks.addEventListener('click', () => switchTab('bookmarks'));
    
    // Overview Dashboard filter trigger (click card to filter)
    elements.overviewCards.forEach(card => {
        card.addEventListener('click', () => {
            const cat = card.dataset.category;
            if (cat) {
                // If it is already active, clear filter. Else, select it.
                if (state.activeCategory === cat) {
                    filterByCategory('All');
                } else {
                    filterByCategory(cat);
                }
            }
        });
    });
    
    // Resets & Clears
    const resetAll = () => {
        state.activeCategory = 'All';
        state.searchTerm = '';
        state.timeFilter = 'all';
        state.sortOrder = 'desc';
        state.activeTab = 'all';
        
        elements.searchInput.value = '';
        elements.clearSearch.style.display = 'none';
        elements.timeFilter.value = 'all';
        elements.sortOrder.value = 'desc';
        
        elements.navAll.classList.add('active');
        elements.navBookmarks.classList.remove('active');
        
        elements.overviewCards.forEach(c => c.classList.remove('active'));
        
        renderCategoryPills();
        applyFilters();
    };
    
    elements.btnResetFilters.addEventListener('click', resetAll);
    elements.btnClearFiltersEmpty.addEventListener('click', resetAll);
    
    // Drawer handlers
    elements.drawerCloseBtn.addEventListener('click', closeDrawer);
    elements.drawerOverlay.addEventListener('click', closeDrawer);
    
    elements.drawerStarBtn.addEventListener('click', () => {
        if (state.selectedRelease) {
            toggleBookmark(state.selectedRelease.id);
        }
    });
    
    elements.drawerCopyLinkBtn.addEventListener('click', () => {
        if (state.selectedRelease) {
            copyShareableLink(state.selectedRelease.id);
        }
    });

    elements.drawerTweetBtn.addEventListener('click', () => {
        if (state.selectedRelease) {
            tweetRelease(state.selectedRelease);
        }
    });
}
