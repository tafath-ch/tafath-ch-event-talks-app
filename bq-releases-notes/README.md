# BigQuery Release Notes Hub

A premium, modern, and interactive single-page web application built with Python Flask and plain vanilla HTML, JavaScript, and CSS. It fetches, parses, structures, and presents Google Cloud BigQuery release notes from their official feed.

## Features

- **Granular Parsing**: Splitting Google's daily grouped release notes into individual structured cards (e.g., Features, Fixes, Announcements, Deprecations) for more focused reading and searching.
- **Smart Local Caching**: Minimizes redundant external network requests to Google Cloud by caching feed records locally for 1 hour. Provides manual refresh ("Sync Latest") capability.
- **Advanced Interactive UI**:
  - **Premium Dark Aesthetics**: A dark-mode Dashboard styled with curated accent colors, fluid micro-animations, and glassmorphism.
  - **Full-Text Live Search**: Filters notes in real-time as you type, matching content, titles, dates, or tags.
  - **Dynamic Multi-Filters**: Allows filtering by Category (Feature, Fix, etc.), Time range (last 7, 30, 90, 365 days), or Starred status.
  - **Interactive Analytics Overview**: Includes cards showing counts of updates per category and visual bars representing category distribution. Clicking on any analytic card filters the feed directly!
  - **Personal Stars/Bookmarks**: Save specific updates of interest to your browser's local storage (persisting across page reloads).
  - **Slide-out Detail Drawer**: Smooth drawer displaying full release details, styling for HTML markup/code snippets, and direct links to official Google Cloud documentation.
  - **Direct Note Sharing**: Generates shareable URL links containing unique note IDs (`?id=...`) which automatically launch the app and open the drawer to that specific update for shared collaboration.

## Directory Structure

```text
bq-releases-notes/
├── app.py                  # Python Flask Server & Feed Parsing
├── requirements.txt        # Backend dependencies
├── templates/
│   └── index.html          # Web application structure
└── static/
    ├── css/
    │   └── styles.css      # Core Design System, Animations, and Layouts
    └── js/
        └── app.js          # Main Application Logic (State, Filters, UI events)
```

## Setup and Running

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run Server**:
   ```bash
   python app.py
   ```

3. **Open App**:
   Navigate to [http://127.0.0.1:5000](http://127.0.0.1:5000) in your web browser.
