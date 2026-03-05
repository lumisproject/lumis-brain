import logging
import asyncio
import requests
from typing import Dict, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Core Modules
from src.agent import LumisAgent
from src.ingestor import ingest_repo
from src.db_client import supabase, get_project_risks
from src.config import Config

# Jira Integration Modules
from src.jira_auth import jira_auth_router, get_valid_token
from src.jira_client import get_accessible_resources, get_projects

# Notion Integration Modules (NEW)
from src.notion_auth import notion_auth_router, get_valid_notion_token

from src.tasks_checking import check_taskes

# --- CONFIGURATION ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LumisAPI")

app = FastAPI(title="Lumis Brain API")

# Allow Frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Auth Routes
app.include_router(jira_auth_router)
app.include_router(notion_auth_router)

# --- STATE MANAGEMENT ---
active_agents: Dict[str, LumisAgent] = {}
ingestion_state: Dict[str, Dict] = {}

# --- MODELS ---
class ChatRequest(BaseModel):
    project_id: str
    query: str
    mode: str = "single-turn"
    reasoning: bool = False
    user_config: Optional[Dict] = None

class IngestRequest(BaseModel):
    user_id: str
    repo_url: str
    user_config: Optional[Dict] = None

def get_repo_name_from_url(repo_url: str) -> str:
    """Normalize a GitHub URL to the `owner/repo` form expected by the API."""
    # strip .git suffix and any trailing slash
    name = repo_url.rstrip("/")
    if name.endswith(".git"):
        name = name[:-4]
    # remove protocol and domain if present
    for prefix in ("https://github.com/", "http://github.com/", "git@github.com:"):
        if name.startswith(prefix):
            name = name[len(prefix) :]
            break
    return name


def fetch_commits(repo_full_name: str):
    """Return the most recent commits for the repository as a normalized list."""
    url = f"https://api.github.com/repos/{repo_full_name}/commits"
    headers = {"Authorization": f"token {Config.GITHUB_TOKEN}"}
    try:
        resp = requests.get(url, headers=headers, params={"per_page": 5})
        resp.raise_for_status()
        commits_data = resp.json()
        
        formatted_commits = []
        for c in commits_data:
            formatted_commits.append({
                "sha": c.get("sha"),
                "message": c.get("commit", {}).get("message", "")
            })
        return formatted_commits
    except Exception as e:
        logger.error(f"Failed to fetch commits for {repo_full_name}: {e}")
        return []
    
def update_progress(project_id, task, message):
    if project_id not in ingestion_state:
        ingestion_state[project_id] = {"status": "processing", "logs": [], "step": "Starting"}
    
    state = ingestion_state[project_id]

    if task == "STARTING":
        state["status"]="PROGRESSING"
        state["logs"]=[]
        state["error"]=None
    
    state["step"]=task

    if message:
        state["logs"].append(f"[{task}] {message}")

    if task == "DONE":
        state["status"] = "completed"
    elif task == "Error":
        state["status"] = "failed"
        state["error"] = message
    elif task != "STARTING": 
        state["status"] = "PROCESSING"


async def run_ingestion_pipeline(repo_url: str, project_id: str, user_config: Dict = None):
    def progress_cb(t, m):
        update_progress(project_id, t, m)
        
    try:
        await ingest_repo(repo_url=repo_url, project_id=project_id, progress_callback=progress_cb, user_config=user_config)
        progress_cb("DONE", "Sync complete.")

    except Exception as e:
        logger.error(f"Ingestion Pipeline Error: {e}")
        progress_cb("Error", f"Pipeline failed: {str(e)}")

# --- ENDPOINTS ---

@app.post("/api/webhook/{user_id}/{project_id}")
async def github_webhook(user_id: str, project_id: str, request: Request, background_tasks: BackgroundTasks):
    try:
        payload = await request.json()

        if "zen" in payload:
            logger.info("GitHub Zen ping received. Connection verified.")
            return {"status": "ok", "message": "Lumis Unified Gateway is listening"}

        # Fix: Provide a default user_config for webhooks
        user_config = {"user_id": user_id}
        agent = LumisAgent(project_id=project_id, max_steps=3, user_config=user_config, mode="single-turn") 

        ref = payload.get("ref", "")
        if "refs/heads/" in ref:
            new_sha = payload.get("after")
            repo_url = payload.get("repository", {}).get("clone_url")

            supabase.table("projects").update({"last_commit": new_sha}).eq("id", project_id).execute()
            logger.info(f"Webhook Trigger: Push detected on {ref} (Commit: {new_sha[:7]})")

            update_progress(
                project_id, 
                "STARTING", 
                f"GitHub Push detected ({new_sha[:7]}). Initializing Unified Sync..."
            )

            background_tasks.add_task(
                run_ingestion_pipeline,
                repo_url=repo_url,
                project_id=project_id,
                user_config=user_config
            )

            raw_commits = payload.get("commits", [])
            repo_name = payload.get("repository", {}).get("full_name")

            # Fix: Normalize GitHub push webhook payload format to match what our AI expects
            normalized_commits = []
            for c in raw_commits:
                normalized_commits.append({
                    "sha": c.get("id", c.get("sha")),
                    "message": c.get("message", "")
                })

            proj_row = (
                supabase.table("projects")
                .select("jira_project_id, notion_project_id")
                .eq("id", project_id)
                .maybe_single()
                .execute()
            )
            
            if proj_row and proj_row.data:
                proj_data = proj_row.data[0] if isinstance(proj_row.data, list) else proj_row.data
                jira_proj = proj_data.get("jira_project_id")
                notion_proj = proj_data.get("notion_project_id")
            else:
                jira_proj = None
                notion_proj = None

            check_taskes(
                user_id=user_id,
                project_id=project_id,
                commits=normalized_commits,
                repo_name=repo_name,
                background_tasks=background_tasks,
                jira_project_id=jira_proj,
                notion_project_id=notion_proj,
                agent=agent
            )
            
            return {"status": "sync_started", "commit": new_sha}

        return {"status": "ignored", "reason": "not_a_push_event"}

    except Exception as e:
        logger.error(f"CRITICAL: Unified Webhook Error: {str(e)}")
        return {"status": "error", "message": str(e)}

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    try:
        # FIX: Check if agent exists, if not, create AND SAVE IT.
        if req.project_id not in active_agents:
            logger.info(f"✨ Spawning agent for {req.project_id}")
            agent = LumisAgent(project_id=req.project_id, user_config=req.user_config)
            print(f"Agent initialized with config: {agent.user_config}")
            
            active_agents[req.project_id] = agent
        else:
            agent = active_agents[req.project_id]

        # Now the agent will remember its state and properly apply the reasoning flag
        response_text = await asyncio.to_thread(
            agent.ask, 
            req.query,
        )
        
        return {"response": response_text}
        
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/api/ingest")
async def start_ingest(req: IngestRequest, background_tasks: BackgroundTasks):
    try:
        logger.info(f"✨ Spawning agent for {req.repo_url}")

        existing = (
            supabase.table("projects")
            .select("id, last_commit, jira_project_id, notion_project_id")
            .eq("repo_url", req.repo_url)
            .eq("user_id", req.user_id)
            .limit(1)
            .execute()
        )
        
        repo_name = get_repo_name_from_url(req.repo_url)
        commits = fetch_commits(repo_name)

        if existing and existing.data and len(existing.data) > 0:
            project_data = existing.data[0]
            
            project_id = project_data.get('id')
            jira_proj = project_data.get('jira_project_id')
            notion_proj = project_data.get('notion_project_id')
            last_commit = project_data.get('last_commit')
            logger.info(f"Existing project found for {req.repo_url} (ID: {project_id}, Repo: {repo_name}, Last Commit: {last_commit[:7] if last_commit else 'N/A'})")
        else:
            latest_commit_sha = commits[0]["sha"] if commits else None
            insert_payload = {
                "user_id": req.user_id,
                "repo_url": req.repo_url,
                "jira_project_id": None,
                "notion_project_id": None,
                "last_commit": latest_commit_sha,
            }
            res = supabase.table("projects").insert(insert_payload).execute()
            
            if not res or not res.data:
                 raise Exception("Failed to create project in database")
                 
            project_id = res.data[0]['id']
            jira_proj = None
            notion_proj = None

        agent = LumisAgent(project_id=project_id, max_steps=3, user_config=req.user_config)

        ingestion_state[project_id] = {"status": "starting", "logs": ["Request received..."], "step": "Init"}

        background_tasks.add_task(
            run_ingestion_pipeline,
            repo_url=req.repo_url,
            project_id=project_id,
            user_config=agent.user_config
        )

        check_taskes(
            user_id=req.user_id,
            project_id=project_id,
            commits=commits,
            repo_name=repo_name,
            background_tasks=background_tasks,
            jira_project_id=jira_proj,
            notion_project_id=notion_proj,
            agent=agent
        )

        return {"project_id": project_id, "status": "started"}
    except Exception as e:
        logger.error(f"Ingest start failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ingest/status/{project_id}")
async def get_ingest_status(project_id: str):
    return ingestion_state.get(project_id, {"status": "idle", "logs": [], "step": "Ready"})

@app.get("/api/risks/{project_id}")
async def get_risks_endpoint(project_id: str):
    risks = get_project_risks(project_id)
    return {"status": "success", "risks": risks if risks else []}

@app.get("/api/jira/projects/{user_id}")
async def get_user_jira_projects(user_id: str):
    access_token = get_valid_token(user_id)
    if not access_token:
        raise HTTPException(status_code=401, detail="Jira not connected")
        
    resources = get_accessible_resources(access_token)
    if not resources: return []
        
    cloud_id = resources[0]["id"]
    projects = get_projects(cloud_id, access_token)
    return [{"key": p["key"], "name": p["name"]} for p in projects]


@app.delete("/api/projects/{user_id}/{project_id}")
async def delete_project(user_id: str, project_id: str):
    """
    Permanently deletes a project and all associated analysis data for a given user.
    """
    try:
        res = (
            supabase.table("projects")
            .select("id, user_id")
            .eq("id", project_id)
            .maybe_single()
            .execute()
        )

        if not res or not res.data:
            raise HTTPException(status_code=404, detail="Project not found")

        db_project = res.data[0] if isinstance(res.data, list) else res.data
        if db_project.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")

        # Delete associated analysis data
        supabase.table("memory_units").delete().eq("project_id", project_id).execute()
        supabase.table("graph_edges").delete().eq("project_id", project_id).execute()
        supabase.table("project_risks").delete().eq("project_id", project_id).execute()

        # Delete the project record itself
        supabase.table("projects").delete().eq("id", project_id).eq("user_id", user_id).execute()

        # Clear in-memory state
        active_agents.pop(project_id, None)
        ingestion_state.pop(project_id, None)

        return {"status": "deleted"}
    except HTTPException:
        # Re-raise known HTTP errors
        raise
    except Exception as e:
        logger.error(f"Project delete failed for {project_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete project")

@app.post("/api/projects/{project_id}/jira-mapping")
async def update_jira_mapping(project_id: str, payload: dict):
    jira_key = payload.get("jira_project_id")
    if not jira_key: raise HTTPException(status_code=400, detail="Missing jira_project_id")
    supabase.table("projects").update({"jira_project_id": jira_key}).eq("id", project_id).execute()
    return {"status": "success", "jira_project_id": jira_key}

# --- NEW NOTION ENDPOINTS ---
@app.get("/api/notion/databases/{user_id}")
async def get_user_notion_databases(user_id: str):
    """Fetches all Notion databases available to the connected user."""
    from src.notion_client import get_accessible_databases 
    
    access_token = get_valid_notion_token(user_id)
    if not access_token:
        raise HTTPException(status_code=401, detail="Notion not connected")
        
    databases = get_accessible_databases(access_token)
    return databases

@app.post("/api/projects/{project_id}/notion-mapping")
async def update_notion_mapping(project_id: str, payload: dict):
    """Saves the user's selected Notion database ID."""
    notion_db_id = payload.get("notion_project_id")
    if not notion_db_id:
        raise HTTPException(status_code=400, detail="Missing notion_project_id")
        
    supabase.table("projects").update({"notion_project_id": notion_db_id}).eq("id", project_id).execute()
    return {"status": "success", "notion_project_id": notion_db_id}

@app.get("/api/status")
async def health_check():
    return {"status": "ok", "service": "Lumis Project"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=5000)