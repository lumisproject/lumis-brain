import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import logging

logger = logging.getLogger("LumisAPI")

# --- RATE LIMITING & RETRY STRATEGY ---
notion_session = requests.Session()
retry_strategy = Retry(
    total=5,
    backoff_factor=2,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["HEAD", "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE"]
)
adapter = HTTPAdapter(max_retries=retry_strategy)
notion_session.mount("https://", adapter)
notion_session.mount("http://", adapter)

# Notion requires a specific version header
NOTION_VERSION = "2022-06-28"

def notion_headers(access_token: str):
    return {
        "Authorization": f"Bearer {access_token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
    }

def get_accessible_databases(access_token: str):
    """Searches the user's workspace for available databases they've shared with Lumis."""
    url = "https://api.notion.com/v1/search"
    payload = {
        "filter": {
            "value": "database",
            "property": "object"
        }
    }
    response = notion_session.post(url, headers=notion_headers(access_token), json=payload)
    response.raise_for_status()
    results = response.json().get("results", [])
    
    # Return a clean list of databases with their IDs and Titles
    databases = []
    for db in results:
        title = "Untitled Database"
        if "title" in db and db["title"]:
            title = db["title"][0].get("plain_text", "Untitled Database")
        databases.append({"id": db["id"], "name": title})
        
    return databases

def get_active_tasks(database_id: str, access_token: str):
    """Fetches recent tasks from the database. (Simplified to grab the last 10 updated)."""
    url = f"https://api.notion.com/v1/databases/{database_id}/query"
    
    # We sort by last edited time to get the most relevant active tasks
    payload = {
        "sorts": [
            {
                "timestamp": "last_edited_time",
                "direction": "descending"
            }
        ],
        "page_size": 10
    }
    
    try:
        response = notion_session.post(url, headers=notion_headers(access_token), json=payload)
        response.raise_for_status()
        pages = response.json().get("results", [])
        
        # Parse Notion's complex property structure into something Lumis AI can read
        tasks = []
        for page in pages:
            props = page.get("properties", {})
            
            # Extract Title (Assuming the primary column is named "Name" or "Task")
            title = "Unknown Task"
            for key, val in props.items():
                if val.get("type") == "title" and val.get("title"):
                    title = val["title"][0].get("plain_text", title)
                    break
            
            tasks.append({
                "id": page["id"],
                "url": page.get("url"),
                "summary": title,
                "raw_properties": props # Keep raw props for later processing if needed
            })
            
        return tasks
    except Exception as e:
        logger.error(f"❌ Failed to fetch Notion tasks: {e}")
        return []

def add_comment(page_id: str, comment_text: str, access_token: str):
    """Adds a comment to a specific Notion page (task)."""
    url = "https://api.notion.com/v1/comments"
    payload = {
        "parent": {
            "page_id": page_id
        },
        "rich_text": [
            {
                "text": {
                    "content": comment_text
                }
            }
        ]
    }
    try:
        response = notion_session.post(url, headers=notion_headers(access_token), json=payload)
        response.raise_for_status()
    except Exception as e:
        logger.error(f"❌ Failed to add Notion comment: {e}")

def transition_task(page_id: str, access_token: str):
    """Moves a task to 'Done' (Assumes a Status property exists)."""
    url = f"https://api.notion.com/v1/pages/{page_id}"
    
    # NOTE: Notion properties are strictly typed and named by the user. 
    # This assumes they have a property named "Status" with an option "Done".
    payload = {
        "properties": {
            "Status": {
                "status": {
                    "name": "Done"
                }
            }
        }
    }
    try:
        response = notion_session.patch(url, headers=notion_headers(access_token), json=payload)
        response.raise_for_status()
        logger.info(f"🚀 Successfully moved Notion task {page_id} to Done.")
    except Exception as e:
        logger.error(f"❌ Failed to transition Notion task. It might not have a 'Status' property: {e}")

def create_task(database_id: str, summary: str, description: str, access_token: str):
    """Creates a new task in the specified database."""
    url = "https://api.notion.com/v1/pages"
    
    # We structure a basic page with a Title property and a text block for description
    payload = {
        "parent": {
            "database_id": database_id
        },
        "properties": {
            # Notion's default title column is usually 'Name'
            "Name": {
                "title": [
                    {
                        "text": {
                            "content": summary
                        }
                    }
                ]
            }
        },
        "children": [
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [
                        {
                            "type": "text",
                            "text": {
                                "content": description
                            }
                        }
                    ]
                }
            }
        ]
    }
    
    try:
        response = notion_session.post(url, headers=notion_headers(access_token), json=payload)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"❌ Failed to create Notion task: {e}")
        return None