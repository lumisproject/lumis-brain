import time
import requests
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse
from src.config import Config
from src.db_client import supabase
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LumisAPI")

notion_auth_router = APIRouter()

def build_notion_auth_url(user_id: str):
    # Notion uses a slightly different OAuth format
    url = (
        f"https://api.notion.com/v1/oauth/authorize"
        f"?client_id={Config.NOTION_CLIENT_ID}"
        f"&response_type=code"
        f"&owner=user"
        f"&redirect_uri={Config.NOTION_REDIRECT_URI}"
        f"&state={user_id}"
    )
    return url

def save_notion_tokens(user_id: str, tokens: dict):
    # Notion tokens don't currently expire in the same way Jira's do, 
    # but they provide a workspace_id we should save.
    data = {
        "user_id": user_id, 
        "access_token": tokens.get("access_token"),
        "workspace_id": tokens.get("workspace_id"),
        "bot_id": tokens.get("bot_id")
    }
    supabase.table("notion_tokens").upsert(data).execute()

def exchange_code_for_notion_token(code: str, user_id: str):
    # Notion requires Basic Auth using Client ID and Secret for the token exchange
    auth = (Config.NOTION_CLIENT_ID, Config.NOTION_CLIENT_SECRET)
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": Config.NOTION_REDIRECT_URI
    }
    
    res = requests.post("https://api.notion.com/v1/oauth/token", auth=auth, json=payload)
    res.raise_for_status()
    tokens = res.json()
    save_notion_tokens(user_id, tokens)
    return tokens

def get_valid_notion_token(user_id: str):
    try:
        response = supabase.table("notion_tokens").select("*").eq("user_id", user_id).execute()
        user_data = response.data[0] if response.data else None
        
        if not user_data: 
            return None
            
        return user_data["access_token"]
    except Exception as e:
        logger.error(f"❌ Error fetching valid Notion token: {str(e)}")
        return None

@notion_auth_router.get("/auth/notion/connect")
def connect_notion(state: str):
    return RedirectResponse(build_notion_auth_url(state))

@notion_auth_router.get("/auth/notion/callback")
def notion_callback(request: Request):
    code = request.query_params.get("code")
    state = request.query_params.get("state")  # This is the user_id
    
    if not code or not state: 
        return {"error": "Missing code or state"}
        
    try:
        exchange_code_for_notion_token(code, state)
        # Redirect back to frontend Settings page
        return RedirectResponse("http://localhost:8080/settings?message=Notion connected successfully")
    except Exception as e:
        logger.error(f"Notion Callback error: {e}")
        return RedirectResponse("http://localhost:8080/settings?error=Failed to connect Notion")

@notion_auth_router.delete("/api/notion/disconnect/{user_id}")
async def disconnect_notion(user_id: str):
    try:
        supabase.table("notion_tokens").delete().eq("user_id", user_id).execute()
        return {"status": "success", "message": "Notion disconnected successfully"}
    except Exception as e:
        logger.error(f"Notion Disconnect error: {e}")
        raise HTTPException(status_code=500, detail="Failed to disconnect Notion")