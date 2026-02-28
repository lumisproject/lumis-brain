import re
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from src.config import Config
import logging

logger = logging.getLogger("LumisAPI")

# --- RATE LIMITING & RETRY STRATEGY ---
# Create a global session that automatically handles 429 Too Many Requests
# and server errors with exponential backoff and respects 'Retry-After' headers.
jira_session = requests.Session()
retry_strategy = Retry(
    total=5,  # Maximum number of retries before giving up
    backoff_factor=2,  # Exponential backoff multiplier (2s, 4s, 8s...)
    status_forcelist=[429, 500, 502, 503, 504],  # HTTP status codes to trigger a retry
    allowed_methods=["HEAD", "GET", "POST", "PUT", "DELETE", "OPTIONS", "TRACE"]
)
adapter = HTTPAdapter(max_retries=retry_strategy)
jira_session.mount("https://", adapter)
jira_session.mount("http://", adapter)


def jira_headers(access_token: str):
    return {"Authorization": f"Bearer {access_token}", "Accept": "application/json", "Content-Type": "application/json"}

def get_accessible_resources(access_token: str):
    url = f"{Config.JIRA_API_BASE}/oauth/token/accessible-resources"
    response = jira_session.get(url, headers={"Authorization": f"Bearer {access_token}"})
    response.raise_for_status()
    return response.json()

def get_issue_details(cloud_id: str, issue_key: str, access_token: str):
    url = f"{Config.JIRA_API_BASE}/ex/jira/{cloud_id}/rest/api/3/issue/{issue_key}?fields=summary,description,status"
    response = jira_session.get(url, headers=jira_headers(access_token))
    response.raise_for_status()
    return response.json()

def add_comment(cloud_id: str, issue_key: str, comment: str, access_token: str):
    url = f"{Config.JIRA_API_BASE}/ex/jira/{cloud_id}/rest/api/3/issue/{issue_key}/comment"
    payload = {"body": {"type": "doc", "version": 1, "content": [{"type": "paragraph", "content": [{"type": "text", "text": comment}]}]}}
    jira_session.post(url, headers=jira_headers(access_token), json=payload).raise_for_status()

def transition_issue(cloud_id: str, issue_key: str, access_token: str):
    """Universally finds the 'Done' transition regardless of Jira language or custom names."""
    url = f"https://api.atlassian.com/ex/jira/{cloud_id}/rest/api/3/issue/{issue_key}/transitions"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    
    # 1. Fetch available transitions
    response = jira_session.get(url, headers=headers)
    if response.status_code != 200:
        logger.error(f"Failed to fetch transitions: {response.text}")
        return

    transitions = response.json().get("transitions", [])
    
    # 2. Look for the universal 'done' category key
    transition_id = None
    target_name = None
    for t in transitions:
        # Jira exposes the category key universally (e.g., 'new', 'indeterminate', 'done')
        category_key = t.get("to", {}).get("statusCategory", {}).get("key", "")
        
        if category_key == "done":
            transition_id = t["id"]
            target_name = t["to"]["name"] # Capture the translated name for logging
            break

    # 3. Fallback: Your idea! (If Jira is acting weird, pick the last one)
    if not transition_id and transitions:
        transition_id = transitions[-1]["id"]
        target_name = transitions[-1]["to"]["name"]
        logger.warning(f"No 'done' category found. Falling back to the last option: {target_name}")

    if not transition_id:
        logger.error(f"❌ No transitions available to move {issue_key}.")
        return

    # 4. Execute the move
    payload = {"transition": {"id": transition_id}}
    res = jira_session.post(url, headers=headers, json=payload)
    if res.status_code == 204:
        logger.info(f"🚀 Successfully moved {issue_key} to '{target_name}' (Universal Match)")
    else:
        logger.error(f"Failed to transition: {res.text}")

def create_issue(cloud_id: str, project_key: str, summary: str, description: str, access_token: str):
    url = f"{Config.JIRA_API_BASE}/ex/jira/{cloud_id}/rest/api/3/issue"
    payload = {
        "fields": {
            "project": {"key": project_key}, "summary": summary,
            "description": {"type": "doc", "version": 1, "content": [{"type": "paragraph", "content": [{"type": "text", "text": description}]}]},
            "issuetype": {"name": "Task"}
        }
    }
    res = jira_session.post(url, headers=jira_headers(access_token), json=payload)
    res.raise_for_status()
    return res.json()  # Returns the new ticket info so we can transition it

def get_projects(cloud_id: str, access_token: str):
    """Fetches the projects to find the Project Key when the board has no active tasks."""
    url = f"{Config.JIRA_API_BASE}/ex/jira/{cloud_id}/rest/api/3/project"
    response = jira_session.get(url, headers=jira_headers(access_token))
    if response.status_code == 200:
        return response.json()
    return []

def get_active_issues(cloud_id: str, access_token: str):
    """Fetches active tasks using the new Jira JQL Search API."""
    url = f"https://api.atlassian.com/ex/jira/{cloud_id}/rest/api/3/search/jql"
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    
    payload = {
        "jql": "statusCategory != Done ORDER BY updated DESC",
        "maxResults": 5,
        "fields": ["summary", "description", "status"]
    }

    try:
        response = jira_session.post(url, headers=headers, json=payload)
        
        if response.status_code != 200:
            logger.error(f"Jira API Error {response.status_code}: {response.text}")
            return []
            
        return response.json().get("issues", [])
    except Exception as e:
        logger.error(f"Search API Error: {e}")
        return []