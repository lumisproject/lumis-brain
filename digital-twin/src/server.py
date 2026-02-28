import logging
import asyncio
import inspect
import requests
from typing import Dict, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi import APIRouter

# Core Modules
from src.agent import LumisAgent, analyze_fulfillment, match_task_to_commit
from src.ingestor import ingest_repo
from src.db_client import supabase, get_project_risks
from src.config import Config
from src.risk_engine import calculate_predictive_risks

# Jira Integration Modules
from src.jira_auth import jira_auth_router, get_valid_token
from src.jira_client import (
    get_accessible_resources,
    get_issue_details,
    get_active_issues,
    add_comment as add_jira_comment,
    transition_issue as transition_jira_issue,
    create_issue as create_jira_issue,
    get_projects
)

# Notion Integration Modules (NEW)
from src.notion_auth import notion_auth_router, get_valid_notion_token
from src.notion_client import (
    get_active_tasks as get_notion_tasks, 
    add_comment as add_notion_comment, 
    transition_task as transition_notion_task, 
    create_task as create_notion_task
)

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
app.include_router(notion_auth_router) # <-- NEW Notion auth router

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

def get_commit_diff(repo_full_name: str, commit_sha: str):
    """Fetches the actual code changes (diff) for a specific commit."""
    url = f"https://api.github.com/repos/{repo_full_name}/commits/{commit_sha}"
    
    headers = {
        "Authorization": f"token {Config.GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3.diff" 
    }
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        return response.text
    except Exception as e:
        logger.error(f"Failed to fetch diff from GitHub: {e}")
        return ""
    
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


# --- NOTION BACKGROUND WORKER (NEW) ---
async def process_notion_webhook_logic(payload: dict, access_token: str, project_id: str, database_id: str):
    """Handles auto-syncing GitHub commits to Notion."""
    commits = payload.get("commits", [])
    repo_name = payload.get("repository", {}).get("full_name")
    
    active_tasks = get_notion_tasks(database_id, access_token)

    for commit in commits:
        message = commit.get("message", "")
        sha = commit.get("id")
        
        if not message or "merge" in message.lower():
            continue

        logger.info(f"--- Processing Commit for Notion: {message[:50]}... ---")

        # 1. SEMANTIC MATCHING
        matched_task = match_task_to_commit(message, active_tasks) if active_tasks else None
        
        # 2. Rogue Commit Auto-Fulfillment
        if not matched_task:
            logger.info(f"No existing Notion task found for commit. Auto-generating...")
            try:
                desc = f"Auto-generated ticket for commit {sha} in {repo_name}.\n\nMessage: {message}"
                new_task = create_notion_task(database_id, message[:200], desc, access_token)
                if new_task:
                    new_task_id = new_task['id']
                    logger.info(f"✅ Auto-created Notion rogue ticket {new_task_id}")
                    add_notion_comment(new_task_id, f"✅ **Auto-Completed!**\nCode committed directly: `{message}`", access_token)
                    transition_notion_task(new_task_id, access_token)
            except Exception as e:
                logger.error(f"❌ Failed to auto-create Notion ticket: {e}")
            continue

        # 3. EXISTING LOGIC: Handled matched issues
        task_id = matched_task["id"]
        task_summary = matched_task.get("summary", "No summary")
        logger.info(f"✅ AI Linked commit to Notion Task: {task_summary}")

        try:
            diff_text = get_commit_diff(repo_name, sha)
            # The AI prompt expects "matched_issue" to have 'fields' -> 'summary'. Adapt dict.
            ai_adapted_task = {"key": task_id, "fields": {"summary": task_summary, "description": ""}}
            analysis = analyze_fulfillment(issue=ai_adapted_task, code_diff=diff_text)

            status = analysis.get("fulfillment_status", "PARTIAL")
            comment_body = f"🤖 **Lumis AI Sync**\n\n{analysis.get('summary', 'Work processed.')}"

            if status != "COMPLETE":
                add_notion_comment(task_id, f"🛠️ **Progress Update**\n{comment_body}", access_token)
                logger.info(f"📝 Notion Task {task_id} updated with partial progress.")
            else:
                add_notion_comment(task_id, f"✅ **Task Completed!**\n{comment_body}", access_token)
                transition_notion_task(task_id, access_token)
                logger.info(f"🚀 Notion Task {task_id} marked as COMPLETE.")

        except Exception as e:
            logger.error(f"❌ Failed to sync commit {sha} with Notion: {e}")

    logger.info("--- Notion Sync Cycle Complete ---")


# --- JIRA BACKGROUND WORKER ---
async def process_webhook_logic(payload: dict, access_token: str, project_id: str, preferred_jira_project: str = None):
    commits = payload.get("commits", [])
    repo_name = payload.get("repository", {}).get("full_name")
    
    resources = get_accessible_resources(access_token)
    if not resources:
        logger.error("No active Jira sites found for this user.")
        return
    
    current_cloud_id = resources[0]["id"]
    active_issues = get_active_issues(current_cloud_id, access_token)
    
    project_key = preferred_jira_project
    
    if not project_key:
        if active_issues:
            project_key = active_issues[0]["key"].split("-")[0]
        else:
            projects = get_projects(current_cloud_id, access_token)
            if projects:
                project_key = projects[0]["key"]

    if not project_key:
        logger.error("Could not determine a Jira Project Key. Aborting Jira sync.")
        return

    for commit in commits:
        message = commit.get("message", "")
        sha = commit.get("id")
        
        if not message or "merge" in message.lower():
            continue

        logger.info(f"--- Processing Commit for Jira: {message[:50]}... ---")

        matched_issue = match_task_to_commit(message, active_issues) if active_issues else None
        
        if not matched_issue:
            logger.info(f"No existing ticket found for commit. Auto-generating completed ticket.")
            try:
                desc = f"Auto-generated ticket for commit {sha} in {repo_name}."
                new_ticket = create_jira_issue(current_cloud_id, project_key, message[:250], desc, access_token)
                new_task_id = new_ticket['key']
                
                logger.info(f"✅ Auto-created rogue ticket {new_task_id}")
                add_jira_comment(current_cloud_id, new_task_id, f"✅ **Auto-Completed!**\nCode was committed directly without an associated ticket: \n`{message}`", access_token)
                transition_jira_issue(current_cloud_id, new_task_id, access_token)
            except Exception as e:
                logger.error(f"❌ Failed to auto-create ticket for rogue commit: {e}")
            continue

        task_id = matched_issue["key"]
        task_summary = matched_issue['fields'].get('summary', 'No summary')
        logger.info(f"✅ AI Linked commit to {task_id}: {task_summary}")

        try:
            diff_text = get_commit_diff(repo_name, sha)
            analysis = analyze_fulfillment(issue=matched_issue, code_diff=diff_text)

            status = analysis.get("fulfillment_status", "PARTIAL")
            risks = analysis.get("identified_risks", [])
            comment_body = f"🤖 **Lumis AI Sync**\n\n{analysis.get('summary', 'Work processed.')}"

            try:
                supabase.table("project_risks").delete().eq("project_id", project_id).contains("affected_units", [task_id]).execute()
            except Exception as e:
                logger.error(f"Could not clear old risks for {task_id}: {e}")

            if status != "COMPLETE":
                if not risks:
                    risks = [{"risk_type": "INCOMPLETE_FEATURE", "severity": "Low", "description": analysis.get("summary", "Partial update."), "affected_units": [task_id]}]
                for risk in risks:
                    units = risk.get("affected_units", [])
                    if task_id not in units: units.append(task_id)
                    new_risk = {"project_id": project_id, "risk_type": risk.get("risk_type", "INCOMPLETE"), "severity": risk.get("severity", "Medium"), "description": risk.get("description", "Missing requirements"), "affected_units": units}
                    supabase.table("project_risks").insert(new_risk).execute()
                
                add_jira_comment(current_cloud_id, task_id, f"🛠️ **Progress Update**\n{comment_body}\n\n⚠️ *Risks logged in Lumis.*", access_token)
                logger.info(f"📝 {task_id} updated. {len(risks)} risks saved.")

            elif status == "COMPLETE" and not risks:
                add_jira_comment(current_cloud_id, task_id, f"✅ **Task Completed!**\n{comment_body}\n\n🎉 *All risks resolved.*", access_token)
                transition_jira_issue(current_cloud_id, task_id, access_token)
                logger.info(f"🚀 {task_id} marked as COMPLETE.")

            for follow_up in analysis.get("follow_up_tasks", []):
                create_jira_issue(current_cloud_id, project_key, f"Follow-up: {follow_up['title'][:200]}", f"Created by Lumis based on commit {sha}:\n\n{follow_up['description']}", access_token)
                logger.info(f"⚠️ Created critical follow-up task.")

        except Exception as e:
            logger.error(f"❌ Failed to sync commit {sha} with Jira: {e}")

    logger.info("--- Jira Sync Cycle Complete ---")

async def run_ingestion_pipeline(repo_url: str, project_id: str, user_id: str):
    def progress_cb(t, m):
        update_progress(project_id, t, m)
        
    try:
        if inspect.iscoroutinefunction(ingest_repo):
            await ingest_repo(repo_url=repo_url, project_id=project_id, user_id=user_id, progress_callback=progress_cb)
        else:
            await asyncio.to_thread(ingest_repo, repo_url=repo_url, project_id=project_id, user_id=user_id, progress_callback=progress_cb)
        
        progress_cb("RISK_ANALYSIS", "Running Legacy Code Conflict Analysis...")
        risks_found = await calculate_predictive_risks(project_id)
        logger.info(f"Risk analysis complete for {project_id}. Found {risks_found} legacy conflicts.")
        
        progress_cb("DONE", "Sync complete.")
    except Exception as e:
        logger.error(f"Ingestion Pipeline Error: {e}")
        progress_cb("Error", f"Pipeline failed: {str(e)}")

# --- ENDPOINTS ---

@app.post("/api/webhook/{user_id}/{project_id}")
async def github_webhook(user_id: str, project_id: str, request: Request, background_tasks: BackgroundTasks):
    try:
        res = supabase.table("projects").select("*").eq("id", project_id).eq("user_id", user_id).maybe_single().execute()

        if not res or not res.data:
            logger.warning(f"Webhook Ignored: Project {project_id} not found for user {user_id}")
            return {"status": "ignored", "reason": "project_not_found"}

        project_data = res.data
        preferred_jira_project = project_data.get("jira_project_key")
        notion_database_id = project_data.get("notion_database_id") # <-- NEW

        payload = await request.json()

        if "zen" in payload:
            logger.info("GitHub Zen ping received. Connection verified.")
            return {"status": "ok", "message": "Lumis Unified Gateway is listening"}

        ref = payload.get("ref", "")
        if "refs/heads/" in ref:
            new_sha = payload.get("after")
            repo_url = payload.get("repository", {}).get("clone_url")
            commits = payload.get("commits", [])

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
                user_id=user_id
            )

            # Trigger Jira Sync if connected
            jira_token = get_valid_token(user_id)
            if jira_token:
                try:
                    resources = get_accessible_resources(jira_token)
                    if resources:
                        background_tasks.add_task(process_webhook_logic, payload=payload, access_token=jira_token, project_id=project_id, preferred_jira_project=preferred_jira_project)
                        logger.info(f"Jira sync queued for user {user_id}")
                except Exception as jira_err:
                    logger.error(f"Jira Sync Auth Error: {str(jira_err)}")
            
            # Trigger Notion Sync if connected
            if notion_database_id:
                notion_token = get_valid_notion_token(user_id)
                if notion_token:
                    background_tasks.add_task(process_notion_webhook_logic, payload=payload, access_token=notion_token, project_id=project_id, database_id=notion_database_id)
                    logger.info(f"Notion sync queued for user {user_id}")
                else:
                    logger.warning(f"Notion Sync Skipped: No valid token for user {user_id}")

            return {"status": "sync_started", "commit": new_sha}

        return {"status": "ignored", "reason": "not_a_push_event"}

    except Exception as e:
        logger.error(f"CRITICAL: Unified Webhook Error: {str(e)}")
        return {"status": "error", "message": str(e)}

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    try:
        if req.project_id not in active_agents:
            logger.info(f"✨ Spawning agent for {req.project_id}")
            active_agents[req.project_id] = LumisAgent(project_id=req.project_id, mode=req.mode)
        
        agent = active_agents[req.project_id]
        agent.mode = req.mode
        agent.user_config = req.user_config 

        response_text = await asyncio.to_thread(
            agent.ask, 
            req.query, 
            reasoning_enabled=req.reasoning,
            user_id=req.user_config.get("user_id") if req.user_config else None
        )
        
        return {"response": response_text}
        
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/api/ingest")
async def start_ingest(req: IngestRequest, background_tasks: BackgroundTasks):
    try:
        existing = supabase.table("projects").select("id, last_commit").eq("repo_url", req.repo_url).eq("user_id", req.user_id).execute()
        if existing.data:
            project_id = existing.data[0]['id']
        else:
            res = supabase.table("projects").insert({"user_id": req.user_id, "repo_url": req.repo_url}).execute()
            project_id = res.data[0]['id']

        ingestion_state[project_id] = {"status": "starting", "logs": ["Request received..."], "step": "Init"}

        background_tasks.add_task(
            run_ingestion_pipeline,
            repo_url=req.repo_url,
            project_id=project_id,
            user_id=req.user_id
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

@app.post("/api/projects/{project_id}/jira-mapping")
async def update_jira_mapping(project_id: str, payload: dict):
    jira_key = payload.get("jira_project_key")
    if not jira_key: raise HTTPException(status_code=400, detail="Missing jira_project_key")
    supabase.table("projects").update({"jira_project_key": jira_key}).eq("id", project_id).execute()
    return {"status": "success", "jira_project_key": jira_key}

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
    notion_db_id = payload.get("notion_database_id")
    if not notion_db_id:
        raise HTTPException(status_code=400, detail="Missing notion_database_id")
        
    supabase.table("projects").update({"notion_database_id": notion_db_id}).eq("id", project_id).execute()
    return {"status": "success", "notion_database_id": notion_db_id}

@app.get("/api/status")
async def health_check():
    return {"status": "ok", "service": "Lumis Project"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=5000)