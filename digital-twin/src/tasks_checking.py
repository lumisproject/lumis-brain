from src.agent import LumisAgent
from src.services import get_commit_diff
from src.db_client import supabase

# Jira Integration Modules
from src.jira_auth import get_valid_token
from src.jira_client import (
    get_accessible_resources,
    get_active_issues,
    add_comment as add_jira_comment,
    transition_issue as transition_jira_issue,
    create_issue as create_jira_issue,
    get_projects
)

# Notion Integration Modules
from src.notion_auth import get_valid_notion_token
from src.notion_client import (
    get_active_tasks as get_notion_tasks, 
    add_comment as add_notion_comment, 
    transition_task as transition_notion_task, 
    create_task as create_notion_task
)

import logging
logger = logging.getLogger(__name__)

async def process_notion(commits: list, repo_name:str, access_token: str, database_id: str, agent: LumisAgent = None):
    """Handles auto-syncing GitHub commits to Notion."""    
    active_tasks = get_notion_tasks(database_id, access_token)

    for commit in commits:
        message = commit.get("message", "")
        sha = commit.get("sha")
        
        if not message or "merge" in message.lower():
            continue

        logger.info(f"--- Processing Commit for Notion: {message[:50]}... ---")

        # 1. SEMANTIC MATCHING
        matched_task = agent.match_task_to_commit(message, active_tasks) if active_tasks else None
        
        # 2. Rogue Commit Auto-Fulfillment
        if not matched_task:
            logger.info(f"No existing Notion task found for commit. Auto-generating...")
            try:
                desc = f"Auto-generated ticket for commit {sha[:7]} in {repo_name}.\n\nMessage: {message}"
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
            analysis = agent.analyze_fulfillment(issue=ai_adapted_task, code_diff=diff_text)

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
async def process_jira(commits: list, repo_name: str, access_token: str, project_id: str, jira_project_id: str = None, agent: LumisAgent = None):
    resources = get_accessible_resources(access_token)
    if not resources:
        logger.error("No active Jira sites found for this user.")
        return
    
    current_cloud_id = resources[0]["id"]
    active_issues = get_active_issues(current_cloud_id, access_token)
    
    project_key = jira_project_id
    
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
        sha = commit.get("sha")
        
        if not message or "merge" in message.lower():
            continue

        logger.info(f"--- Processing Commit for Jira: {message[:50]}... ---")

        matched_issue = agent.match_task_to_commit(message, active_issues) if active_issues else None
        
        if not matched_issue:
            logger.info(f"No existing ticket found for commit. Auto-generating ticket.")
            try:
                desc = f"Auto-generated ticket for commit {sha} in {repo_name}."
                new_ticket = create_jira_issue(current_cloud_id, project_key, message[:250], desc, access_token)
                new_task_id = new_ticket['key']
                
                logger.info(f"✅ Auto-created rogue ticket {new_task_id}")
                
                # --- NEW: AI Analysis for Rogue Commits ---
                diff_text = get_commit_diff(repo_name, sha)
                
                # Create a fake issue context for the AI
                dummy_issue = {"key": new_task_id, "fields": {"summary": message[:250], "description": desc}}
                analysis = agent.analyze_fulfillment(issue=dummy_issue, code_diff=diff_text)
                
                status = analysis.get("fulfillment_status", "PARTIAL")
                risks = analysis.get("identified_risks", [])
                comment_body = f"🤖 **Lumis AI Sync**\n\n{analysis.get('summary', 'Code analyzed.')}"

                if status != "COMPLETE" or risks:
                    # Errors detected! Don't transition to Done.
                    if not risks:
                        risks = [{"risk_type": "CODE_RISK", "severity": "Medium", "description": analysis.get("summary", "Potential issue in rogue commit."), "affected_units": [new_task_id]}]
                    
                    # Save the risks to Supabase
                    for risk in risks:
                        units = risk.get("affected_units", [])
                        if new_task_id not in units: units.append(new_task_id)
                        new_risk = {
                            "project_id": project_id, 
                            "risk_type": risk.get("risk_type", "INCOMPLETE"), 
                            "severity": risk.get("severity", "Medium"), 
                            "description": risk.get("description", "Missing requirements or code errors"), 
                            "affected_units": units
                        }
                        supabase.table("project_risks").insert(new_risk).execute()
                    
                    add_jira_comment(current_cloud_id, new_task_id, f"⚠️ **Risks Detected!**\nCode was committed directly but contained issues:\n{comment_body}\n\n*Ticket left in To Do. Risks logged in Lumis.*", access_token)
                    logger.info(f"⚠️ Rogue commit {sha} had errors. Left in To Do.")
                    
                else:
                    # No errors, safe to transition to Done
                    add_jira_comment(current_cloud_id, new_task_id, f"✅ **Auto-Completed!**\nCode was committed directly and passed AI checks: \n`{message}`\n\n{comment_body}", access_token)
                    transition_jira_issue(current_cloud_id, new_task_id, access_token)
                    logger.info(f"✅ Rogue commit {sha} passed checks. Marked as COMPLETE.")
                    
            except Exception as e:
                logger.error(f"❌ Failed to process rogue commit: {e}")
            continue

        task_id = matched_issue["key"]
        task_summary = matched_issue['fields'].get('summary', 'No summary')
        logger.info(f"✅ AI Linked commit to {task_id}: {task_summary}")

        try:
            diff_text = get_commit_diff(repo_name, sha)
            analysis = agent.analyze_fulfillment(issue=matched_issue, code_diff=diff_text)

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


def check_taskes(user_id, project_id, commits, repo_name, background_tasks, jira_project_id, notion_project_id, agent):
    jira_token = get_valid_token(user_id)
    if jira_token:
        try:
            resources = get_accessible_resources(jira_token)
            if resources:
                background_tasks.add_task(
                    process_jira,
                    commits=commits,
                    repo_name=repo_name,
                    access_token=jira_token,
                    project_id=project_id,
                    jira_project_id=jira_project_id,
                    agent=agent
                )
                logger.info(f"Jira sync queued for user {user_id}")
        except Exception as jira_err:
            logger.error(f"Jira Sync Auth Error: {str(jira_err)}")
    else:
        logger.warning(f"Jira Sync Skipped: No valid token for user {user_id}")
    
    # Trigger Notion Sync if connected
    notion_token = get_valid_notion_token(user_id)
    if notion_token:
        background_tasks.add_task(
            process_notion,
            commits=commits,
            repo_name=repo_name,
            access_token=notion_token,
            database_id=notion_project_id,
            agent=agent
        )
        logger.info(f"Notion sync queued for user {user_id}")
    else:
        logger.warning(f"Notion Sync Skipped: No valid token for user {user_id}")