import logging
from src.agent import LumisAgent
from src.services import get_commit_diff
from src.db_client import supabase

logger = logging.getLogger(__name__)

async def process_code_review(project_id: str, commits: list, repo_name: str, agent: LumisAgent):
    """Standalone code review that runs for all commits, even without Jira/Notion connected."""
    supabase.table("project_risks").delete().eq("project_id", project_id).execute()
    for commit in commits:
        message = commit.get("message", "")
        sha = commit.get("sha")
        
        if sha is None: sha = "unknown"
        if not message or "merge" in message.lower():
            continue

        logger.info(f"--- Running Standalone Code Review for Commit: {sha[:7]} ---")

        try:
            diff_text = get_commit_diff(repo_name, sha)
            if not diff_text:
                continue
                
            analysis = agent.analyze_risks(commit_message=message, code_diff=diff_text)
            risks = analysis.get("identified_risks", [])

            if risks:
                for risk in risks:
                    new_risk = {
                        "project_id": project_id, 
                        "risk_type": risk.get("risk_type", "CODE_RISK"), 
                        "severity": risk.get("severity", "Medium"), 
                        "description": f"[{sha[:7]}] {risk.get('description', 'Code issue detected')}", 
                        "affected_units": risk.get("affected_units", [])
                    }
                    supabase.table("project_risks").insert(new_risk).execute()
                
                logger.info(f"⚠️ Standalone review found {len(risks)} risks for {sha[:7]}.")
            else:
                logger.info(f"✅ Standalone review passed for {sha[:7]} (No risks).")

        except Exception as e:
            logger.error(f"❌ Failed to process standalone code review for {sha}: {e}")