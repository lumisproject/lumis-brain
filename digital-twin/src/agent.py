import json
import re
import logging
import ast
from typing import List, Dict, Any, Optional
from langchain_core.messages import BaseMessage
from src.services import get_llm_completion
from src.retriever import GraphRetriever
from src.answer_generator import AnswerGenerator
from src.query_processor import QueryProcessor

# --- INTEGRATED JIRA IMPORTS ---
from src.jira_auth import get_valid_token
from src.jira_client import get_accessible_resources, jira_headers

class LumisAgent:
    def __init__(self, project_id: str, max_steps: int = 4, user_config: Dict = None, mode: str = "single-turn"):
        self.project_id = project_id
        self.user_config = user_config or {}
        print(f"Initializing LumisAgent with config: {self.user_config}")
        if "mode" not in self.user_config:
            self.user_config["mode"] = mode
        if "reasoning" in self.user_config:
            self.user_config["reasoning_enabled"] = self.user_config.get("reasoning")

        self.retriever = GraphRetriever(project_id)
        self.generator = AnswerGenerator(project_id)
        self.query_processor = QueryProcessor()
        self.max_steps = max_steps
        self.conversation_history: List[BaseMessage] = []
        self.logger = logging.getLogger(__name__)

    def ask(self, user_query: str) -> str:
        """
        Main entry point for user queries. Intercepts Jira keywords to trigger 
        task cross-referencing, otherwise proceeds with code analysis.
        """
        mode = self.user_config.get("mode", "single-turn")
        
        if mode == "single-turn":
            self.conversation_history = []

        scratchpad = []
        collected_elements: List[Dict[str, Any]] = [] 
        repo_structure = None 
        
        print(f"\n🤖 LUMIS: {user_query}")
        print(f"Reasoning Enabled: {self.user_config.get('reasoning_enabled', False)}")
        print(f"LLM Provider: {self.user_config.get('provider', 'default')} | Model: {self.user_config.get('model', 'default')}\n")
        print(f"--- Starting {'Multi-Turn' if mode == 'multi-turn' else 'Single-Turn'} Interaction ---\n")

        # Process query once before the autonomous scouting loop
        processed_query = self.query_processor.process(user_query, self.conversation_history, user_config=self.user_config)
        print(f"🎯 Intent: {processed_query.intent}")
        if processed_query.pseudocode_hints:
            print(f"💡 Pseudocode Hint Generated")

        for step in range(self.max_steps):
            response_text = get_llm_completion(
                self._get_system_prompt(), 
                self._build_step_prompt(processed_query, scratchpad),
                user_config=self.user_config
            )
            
            data = self._parse_response(response_text, fallback_query=user_query)
            thought = data.get("thought", "Analyzing...")
            action = data.get("action")
            confidence = data.get("confidence", 0)
            
            print(f"🤔 Step {step+1} ({confidence}%, ({action})): {thought}")

            if confidence >= 90 or action == "final_answer":
                break
            
            obs = self._execute_tool(action, data.get("action_input"), collected_elements, scratchpad, processed_query)
            print(f"\n\n🔧 Executed {action} with input '{data.get('action_input')}'. Observation: {obs}\n\n")
            if action == "list_files": 
                repo_structure = obs 

        result = self.generator.generate(
            query=user_query, 
            collected_elements=collected_elements, 
            repo_structure=repo_structure,
            history=self.conversation_history,
            user_config=self.user_config
        )
        self._update_history(user_query, result['answer'], mode)
        return result['answer']

    def _build_step_prompt(self, processed_query, scratchpad):
        history_text = ""
        if self.conversation_history and len(self.conversation_history) > 0:
            recent_msgs = self.conversation_history[-6:]
            history_text = "CONVERSATION HISTORY:\n" + "\n".join(
                [f"{m['role'].upper() if isinstance(m, dict) else m.type.upper()}: {m['content'] if isinstance(m, dict) else m.content}" for m in recent_msgs]
            ) + "\n\n"
            
        progress = "\n".join([f"Action: {s['action']} -> {s['observation']}" for s in scratchpad])
        query_context = f"USER QUERY: {processed_query.original}"
        
        insights = []
        if processed_query.rewritten_query:
             insights.append(f"Search Hint: Try searching for '{processed_query.rewritten_query}'")
        if processed_query.pseudocode_hints:
             insights.append(f"Implementation Hint:\n{processed_query.pseudocode_hints}")
             
        insight_text = "\n\n".join(insights)
        return f"{history_text}{query_context}\n\n{insight_text}\n\nPROGRESS:\n{progress}\n\nNEXT JSON:"

    # To check later ⚠️️: This parsing logic is now duplicated in query_processor.py. Consider centralizing it in a utility module if it becomes more complex or is needed elsewhere.
    def _parse_response(self, text: str, fallback_query: str = "") -> Dict[str, Any]:
        if not text: 
            return self._create_fallback(fallback_query, "Empty response from LLM")
        clean_text = text.replace("```json", "").replace("```", "").strip()
        start_idx = clean_text.find('{')
        end_idx = clean_text.rfind('}')
        if start_idx != -1 and end_idx != -1:
            try:
                json_str = self._sanitize_json_string(clean_text[start_idx:end_idx + 1])
                return json.loads(json_str)
            except Exception: pass
        try:
            if start_idx != -1 and end_idx != -1:
                return ast.literal_eval(clean_text[start_idx:end_idx + 1])
        except: pass
        return self._create_fallback(fallback_query, text[:200])

    def _create_fallback(self, query: str, thought_snippet: str) -> Dict[str, Any]:
        return {
            "thought": f"Parsing failed. Falling back to search. Raw: {thought_snippet}...",
            "action": "search_code",
            "action_input": query,
            "confidence": 50
        }

    def _sanitize_json_string(self, json_str: str) -> str:
        json_str = re.sub(r'//.*?\n', '\n', json_str)
        json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)
        return json_str

    def _execute_tool(self, action, inp, collected, scratchpad, processed_query=None):
        obs = "No results."
        try:
            if action == "list_files":
                files = self.retriever.list_all_files()
                obs = f"Repo contains {len(files)} files. First 50: {', '.join(files[:50])}"
            elif action == "read_file":
                path = str(inp).strip()
                data = self.retriever.fetch_file_content(path)
                if data:
                    collected.extend(data)
                    obs = f"Successfully read {path}."
                else:
                    obs = f"Error: File {path} not found."
            elif action == "search_code":
                search_input = str(inp)
                if processed_query and processed_query.rewritten_query:
                    search_input = f"{search_input} {processed_query.rewritten_query}"
                if processed_query and processed_query.pseudocode_hints:
                    search_input += f" {processed_query.pseudocode_hints}"
                
                data = self.retriever.search(search_input, user_config=self.user_config)
                
                if data:
                    collected.extend(data)
                    
                    found_matches = []
                    for d in data[:5]: 
                        found_matches.append(f"- {d['file_path']} ({d['unit_name']})")
                    
                    obs = f"Found {len(data)} matches. Top results context:\n" + "\n".join(found_matches)
                else:
                    obs = f"No results found. Try broader keywords."
        except Exception as e:
            obs = f"Tool Error: {str(e)}"
        scratchpad.append({"thought": "System Result", "action": f"{action}({inp})", "observation": obs})
        return obs

    def _get_system_prompt(self) -> str:
        return (
            "You are Lumis, a 'Scouting-First' code analysis agent.\n"
            "Your goal is to answer user queries with PRECISE code evidence.\n\n"
            "1. SCOUT: Use `list_files` or `search_code` to find RELEVANT FILE PATHS.\n"
            "2. READ: Only call `read_file` when you are 80%+ sure a file contains the answer.\n"
            "3. ANSWER: Call `final_answer` once you have the code snippets in your context.\n\n"
            "IMPORTANT: You MUST respond ONLY with a valid JSON object matching this exact schema. Do not include markdown formatting or outside text:\n"
            "{\n"
            '  "thought": "Your reasoning for the next step",\n'
            '  "action": "list_files | read_file | search_code | final_answer",\n'
            '  "action_input": "The input string for the chosen tool",\n'
            '  "confidence": 85\n'
            "}"
        )

    def _update_history(self, q, a, mode):
        if mode == "multi-turn":
            self.conversation_history.append({"role": "user", "content": q})
            self.conversation_history.append({"role": "assistant", "content": a})

    def analyze_fulfillment(self, issue: Dict, code_diff: str) -> Dict:
        """
        Standalone background AI job to compare code diffs against Jira task requirements.
        This is triggered by webhooks and uses the centralized LLM services.
        """
        summary = issue.get("fields", {}).get("summary", "No Summary")
        description = issue.get("fields", {}).get("description", "No Description")
        
        system_prompt = """
        You are a pragmatic, flexible, and experienced Technical Lead. Your job is to evaluate if a developer's code commit satisfies their active Jira task.

        EVALUATION RULES:
        1. Focus on Intent: Be flexible. If the code implements the core feature or resolves the main issue described in the task, consider it complete. Do not demand pixel-perfect adherence to every minor sub-bullet point unless it is critical.
        2. Benefit of the Doubt: If the code looks like a reasonable and functional implementation of the feature, assume it works as intended.

        STATUS DEFINITIONS:
        - "COMPLETE": The core functionality of the task is implemented. (This will move the ticket to Done).
        - "PARTIAL": The code is clearly just a minor "Work In Progress" update or only tackles a small fraction of the task.
        - "NONE": The code is completely unrelated to the task.

        FOLLOW-UP TASKS CREATION (STRICT):
        - DO NOT create follow-up tasks for incomplete requirements of the current task. 
        - If the code only partially completes the task, simply mark it "PARTIAL", list the missing requirements in your summary, and leave the follow_up_tasks array EMPTY. 
        - ONLY create follow-up tasks for entirely new, out-of-scope bugs, major security flaws, or technical debt discovered in the code.

        JSON OUTPUT FORMAT (STRICT):
        Return a JSON object with EXACTLY the following structure:
        {
        "fulfillment_status": "COMPLETE" | "PARTIAL" | "NONE",
        "summary": "A friendly 2-3 sentence summary of what was achieved.",
        "identified_risks": [
            {
            "risk_type": "INCOMPLETE_FEATURE" | "SECURITY_FLAW" | "BUG",
            "severity": "High" | "Medium" | "Low",
            "description": "Brief explanation of what is missing or broken.",
            "affected_units": ["filename.py", "function_name"]
            }
        ],
        "follow_up_tasks": [
            {
            "title": "Short title of new issue",
            "description": "Description of the out-of-scope issue found"
            }
        ]
        }
        - If the task is fully complete and has no risks, leave "identified_risks" and "follow_up_tasks" as empty arrays [].
        """
        
        prompt = f"""
        JIRA TASK SUMMARY: {summary}
        JIRA TASK DESCRIPTION: {description}
        CODE CHANGES (DIFF): {code_diff}
        
        Analyze the commit and respond STRICTLY in the JSON format defined in your instructions. Do not change the JSON keys.
        """
        
        try:
            response_text = get_llm_completion(system_prompt, prompt, user_config=self.user_config)
            # Robustly extract JSON block
            clean_json = response_text.strip().replace('```json', '').replace('```', '')
            start_idx = clean_json.find('{')
            end_idx = clean_json.rfind('}')
            if start_idx != -1 and end_idx != -1:
                return json.loads(clean_json[start_idx:end_idx + 1])
            return json.loads(clean_json)
        except Exception as e:
            print(f"AI Engine Error: {e}")
            return {"fulfillment_status": "PARTIAL", "summary": f"AI analysis failed: {str(e)}", "identified_risks": [], "follow_up_tasks": []}

    def match_task_to_commit(self, commit_message: str, issues: List[Dict]) -> Optional[Dict]:
        """Uses AI to determine if a commit message matches one of the active Jira tasks."""
        if not issues: return None

        # Prepare a list of candidate tasks for the AI
        candidates = "\n".join([f"- [{i['key']}] {i['fields']['summary']}" for i in issues])

        print(f"\n--- DEBUG: ACTIVE TASKS FED TO AI ---")
        print(candidates)
        print(f"-------------------------------------\n")
        
        system_prompt = "You are a Technical Lead. Your job is to match a developer's commit message to their active Jira task."
        user_prompt = f"""
        COMMIT MESSAGE: "{commit_message}"
        
        ACTIVE TASKS:
        {candidates}
        
        Analyze the commit message and match it to the most relevant task.
        Output ONLY the exact Task ID from inside the brackets (e.g., PROJ-123) of the matching task.
        Do NOT output the summary or any other text. 
        If absolutely no tasks are relevant, output exactly NONE.
        """

        try:
            response = get_llm_completion(system_prompt, user_prompt, user_config=self.user_config)
            match_id = response.strip().upper()
            
            if "NONE" in match_id: return None
            
            # Return the actual issue object from the list
            return next((i for i in issues if i['key'] in match_id), None)
        except Exception:
            return None
    
    def analyze_risks(self, commit_message: str, code_diff: str) -> dict:
        """
        Standalone AI code reviewer that uses graph context to predict 
        breaking changes and side effects.
        """
        # 1. Extract potential unit names from the diff to seed the graph search
        potential_units = re.findall(r'(?:def|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)', code_diff[:10000])
        
        # 2. Get the architectural context (neighbors in the graph)
        graph_context = self.retriever.get_architectural_context(potential_units)

        # 3. Enhanced Prompt with Chain-of-Thought and Pragmatism
        system_prompt = """
        You are an elite, pragmatic Senior Code Reviewer and Software Architect.
        Analyze the provided code diff for bugs, security risks, and breaking changes.
        
        CRITICAL RULES:
        1. MINIMIZE FALSE POSITIVES: You are highly conservative. Do NOT flag minor stylistic choices, standard refactoring, missing docstrings, or highly theoretical edge cases. ONLY flag concrete, provable bugs or severe architectural violations. If in doubt, do not flag it.
        2. DEEP STATE ANALYSIS: You must carefully trace variable lifecycles, data flow, and state mutations across the diff. 
        3. ARCHITECTURAL AWARENESS: Use the 'ARCHITECTURAL CONTEXT' to identify side-effects on dependent systems (e.g., changing a signature that breaks a neighbor).
        
        JSON OUTPUT FORMAT (STRICT):
        {
          "analysis_trace": "Step-by-step execution trace. Briefly track variable state changes and logic flow here BEFORE concluding risks.",
          "identified_risks": [
            {
              "risk_type": "SECURITY_FLAW" | "BUG" | "TECH_DEBT" | "BREAKING_CHANGE",
              "severity": "High" | "Medium" | "Low",
              "description": "Precise explanation of the exact failure mechanism.",
              "affected_units": ["name_of_function_or_file"]
            }
          ]
        }
        - If the code is safe and has no concrete risks, leave "identified_risks" as an empty array [].
        """
        
        user_prompt = f"""
        COMMIT MESSAGE: {commit_message}
        
        ARCHITECTURAL CONTEXT (Graph Neighbors):
        {graph_context}
        
        CODE CHANGES (DIFF):
        {code_diff}
        """
        
        try:
            from src.services import get_llm_completion
            response_text = get_llm_completion(system_prompt, user_prompt, user_config=self.user_config)
            
            clean_json = response_text.strip().replace('```json', '').replace('```', '')
            start_idx = clean_json.find('{')
            end_idx = clean_json.rfind('}')
            if start_idx != -1 and end_idx != -1:
                import json
                return json.loads(clean_json[start_idx:end_idx + 1])
            import json
            return json.loads(clean_json)
        except Exception as e:
            self.logger.error(f"Code reviewer error: {e}")
            return {"identified_risks": []}