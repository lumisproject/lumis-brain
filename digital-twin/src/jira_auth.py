import time
import requests
from urllib.parse import urlencode
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse
from src.config import Config
from src.db_client import supabase
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LumisAPI")

jira_auth_router = APIRouter()
SCOPES = ["read:jira-work", "write:jira-work", "offline_access"]

def build_auth_url(user_id: str):
    params = {
        "audience": "api.atlassian.com", 
        "client_id": Config.JIRA_CLIENT_ID,
        "scope": " ".join(SCOPES), 
        "redirect_uri": Config.JIRA_REDIRECT_URI,
        "state": user_id, 
        "response_type": "code", 
        "prompt": "consent"
    }
    return f"{Config.JIRA_AUTH_URL}?{urlencode(params)}"

def save_tokens(user_id: str, tokens: dict):
    expires_at = time.time() + tokens.get("expires_in", 3600)
    data = {
        "user_id": user_id, 
        "access_token": tokens.get("access_token"),
        "refresh_token": tokens.get("refresh_token"), 
        "expires_at": expires_at
    }
    supabase.table("jira_tokens").upsert(data).execute()

def exchange_code_for_token(code: str, user_id: str):
    payload = {
        "grant_type": "authorization_code", 
        "client_id": Config.JIRA_CLIENT_ID,
        "client_secret": Config.JIRA_CLIENT_SECRET, 
        "code": code, 
        "redirect_uri": Config.JIRA_REDIRECT_URI
    }
    res = requests.post(Config.JIRA_TOKEN_URL, json=payload)
    res.raise_for_status()
    tokens = res.json()
    save_tokens(user_id, tokens)
    return tokens

def refresh_jira_token(user_id: str):
    """Refreshes the Jira token and handles revoked permissions."""
    try:
        response = supabase.table("jira_tokens").select("*").eq("user_id", user_id).execute()
        user_data = response.data[0] if response.data else None
        
        if not user_data or not user_data.get("refresh_token"): 
            return None

        payload = {
            "grant_type": "refresh_token", 
            "client_id": Config.JIRA_CLIENT_ID,
            "client_secret": Config.JIRA_CLIENT_SECRET, 
            "refresh_token": user_data["refresh_token"]
        }
        
        res = requests.post(Config.JIRA_TOKEN_URL, json=payload)
        
        if res.status_code == 200:
            new_tokens = res.json()
            # Atlassian sometimes omits the refresh token if the old one is still valid
            if "refresh_token" not in new_tokens: 
                new_tokens["refresh_token"] = user_data["refresh_token"]
                
            save_tokens(user_id, new_tokens)
            logger.info(f"✅ Successfully refreshed Jira token for user {user_id}")
            return new_tokens["access_token"]
        else:
            logger.error(f"❌ Failed to refresh Jira token: {res.status_code} - {res.text}")
            
            # If the token was revoked or is invalid (400, 401, 403), wipe it from DB
            if res.status_code in [400, 401, 403]:
                logger.warning(f"⚠️ Refresh token invalid/revoked. Auto-disconnecting Jira for {user_id}.")
                supabase.table("jira_tokens").delete().eq("user_id", user_id).execute()
                
            return None
            
    except Exception as e:
        logger.error(f"❌ Exception during Jira token refresh: {str(e)}")
        return None

def get_valid_token(user_id: str):
    """Gets the token from DB, refreshing proactively if it expires in less than 5 minutes."""
    try:
        response = supabase.table("jira_tokens").select("*").eq("user_id", user_id).execute()
        user_data = response.data[0] if response.data else None
        
        if not user_data: 
            return None
            
        # Proactively refresh if it expires in less than 5 minutes (300 seconds)
        if time.time() > (user_data["expires_at"] - 300): 
            logger.info(f"🔄 Token for user {user_id} is expiring soon. Triggering refresh...")
            return refresh_jira_token(user_id)
            
        return user_data["access_token"]
        
    except Exception as e:
        logger.error(f"❌ Error fetching valid Jira token: {str(e)}")
        return None

@jira_auth_router.get("/auth/jira/connect")
def connect_jira(state: str):
    return RedirectResponse(build_auth_url(state))

@jira_auth_router.get("/auth/jira/callback")
def jira_callback(request: Request):
    code, state = request.query_params.get("code"), request.query_params.get("state")
    if not code or not state: return {"error": "Missing code or state"}
    try:
        exchange_code_for_token(code, state)
        # Redirects back to frontend Settings page
        return RedirectResponse(f"{Config.JIRA_REDIRECT}?message=Jira connected successfully")
    except Exception as e:
        logger.error(f"Callback error: {e}")
        return RedirectResponse(f"{Config.JIRA_REDIRECT}?error=Failed to connect Jira")

@jira_auth_router.delete("/api/jira/disconnect/{user_id}")
async def disconnect_jira(user_id: str):
    try:
        # Delete the token entry for this user
        supabase.table("jira_tokens").delete().eq("user_id", user_id).execute()
        return {"status": "success", "message": "Jira disconnected successfully"}
    except Exception as e:
        logger.error(f"Disconnect error: {e}")
        raise HTTPException(status_code=500, detail="Failed to disconnect Jira")