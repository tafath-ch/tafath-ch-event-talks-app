import os
import re
import json
import time
import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Constants
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_FILE = "releases_cache.json"
CACHE_EXPIRY_SECONDS = 3600  # 1 hour cache

def parse_feed_xml(xml_content):
    """
    Parses Atom XML feed content into structured JSON list of release note entries.
    """
    root = ET.fromstring(xml_content)
    # The default namespace is http://www.w3.org/2005/Atom
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    parsed_entries = []
    
    for entry in root.findall('atom:entry', ns):
        title_el = entry.find('atom:title', ns)
        id_el = entry.find('atom:id', ns)
        updated_el = entry.find('atom:updated', ns)
        link_el = entry.find('atom:link', ns)
        content_el = entry.find('atom:content', ns)
        
        raw_title = title_el.text if title_el is not None else ""
        entry_id = id_el.text if id_el is not None else ""
        updated_raw = updated_el.text if updated_el is not None else ""
        link = link_el.attrib.get('href', '') if link_el is not None else ""
        content_html = content_el.text if content_el is not None else ""
        
        # Format the updated date into ISO standard and display format
        formatted_date = raw_title
        iso_date = ""
        try:
            dt = datetime.fromisoformat(updated_raw)
            formatted_date = dt.strftime("%B %d, %Y")
            iso_date = dt.date().isoformat()
        except Exception:
            # Fallback parsing
            match = re.search(r'(\d{4}-\d{2}-\d{2})', updated_raw)
            if match:
                iso_date = match.group(1)
                try:
                    dt = datetime.strptime(iso_date, "%Y-%m-%d")
                    formatted_date = dt.strftime("%B %d, %Y")
                except Exception:
                    pass
        
        # Split content html by <h3> category tags
        parts = re.split(r'<h3[^>]*>(.*?)</h3>', content_html, flags=re.IGNORECASE)
        
        # If there are no <h3> headings, add the whole text as "General"
        if len(parts) <= 1:
            parsed_entries.append({
                "id": f"{entry_id}_0",
                "original_entry_id": entry_id,
                "title": raw_title,
                "date": formatted_date,
                "iso_date": iso_date,
                "raw_updated": updated_raw,
                "link": link,
                "category": "General",
                "html_content": content_html.strip()
            })
        else:
            # First element is the text before the first <h3> (usually empty or intro text)
            intro = parts[0].strip()
            if intro:
                parsed_entries.append({
                    "id": f"{entry_id}_intro",
                    "original_entry_id": entry_id,
                    "title": raw_title,
                    "date": formatted_date,
                    "iso_date": iso_date,
                    "raw_updated": updated_raw,
                    "link": link,
                    "category": "General",
                    "html_content": intro
                })
            
            # Sub-sections alternate: parts[1] = category, parts[2] = html, parts[3] = category, parts[4] = html, etc.
            sub_id = 1
            for idx in range(1, len(parts), 2):
                category = parts[idx].strip()
                html_snippet = parts[idx+1].strip() if idx+1 < len(parts) else ""
                
                # Standardize category names (e.g. Feature, Fix, Announcement, Deprecated)
                std_category = category.capitalize()
                
                parsed_entries.append({
                    "id": f"{entry_id}_{sub_id}",
                    "original_entry_id": entry_id,
                    "title": f"{raw_title} - {std_category}",
                    "date": formatted_date,
                    "iso_date": iso_date,
                    "raw_updated": updated_raw,
                    "link": f"{link}#{raw_title.replace(' ', '_').replace(',', '')}" if link else "",
                    "category": std_category,
                    "html_content": html_snippet
                })
                sub_id += 1
                
    return parsed_entries

def get_cached_releases():
    """
    Retrieves parsed releases from cache file if valid, otherwise returns None.
    """
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            # Check expiration
            cached_time = data.get("timestamp", 0)
            if time.time() - cached_time < CACHE_EXPIRY_SECONDS:
                return data.get("releases", []), True # served from cache
        except Exception:
            pass
    return None, False

def save_to_cache(releases):
    """
    Saves parsed releases list into the local cache file.
    """
    try:
        data = {
            "timestamp": time.time(),
            "releases": releases
        }
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Failed to write cache: {e}")

@app.route('/')
def index():
    """
    Serves the main application page.
    """
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    """
    API endpoint that returns the list of BigQuery release notes.
    Supports force refreshing using query parameter `?refresh=true`.
    """
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    
    # Try cache first if not force refreshed
    if not force_refresh:
        releases, is_cached = get_cached_releases()
        if releases is not None:
            return jsonify({
                "status": "success",
                "source": "cache",
                "count": len(releases),
                "last_updated": datetime.fromtimestamp(os.path.getmtime(CACHE_FILE)).isoformat(),
                "releases": releases
            })
            
    # Cache miss or forced refresh: fetch from Google Cloud feed
    try:
        response = requests.get(FEED_URL, timeout=15)
        response.raise_for_status()
        
        # Parse XML
        releases = parse_feed_xml(response.content)
        
        # Save to cache
        save_to_cache(releases)
        
        return jsonify({
            "status": "success",
            "source": "network",
            "count": len(releases),
            "last_updated": datetime.now().isoformat(),
            "releases": releases
        })
    except Exception as e:
        # Fallback to expired cache if network call fails
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                return jsonify({
                    "status": "warning",
                    "message": f"Network fetch failed ({str(e)}). Served from stale cache.",
                    "source": "stale_cache",
                    "count": len(data.get("releases", [])),
                    "last_updated": datetime.fromtimestamp(os.path.getmtime(CACHE_FILE)).isoformat(),
                    "releases": data.get("releases", [])
                })
            except Exception:
                pass
                
        return jsonify({
            "status": "error",
            "message": f"Failed to fetch and parse release notes: {str(e)}",
            "releases": []
        }), 500

if __name__ == '__main__':
    # Bind to standard development port
    app.run(debug=True, host='127.0.0.1', port=5000)
