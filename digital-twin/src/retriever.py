import logging
from typing import List, Dict, Any
from src.db_client import supabase
from src.services import get_embedding, get_llm_completion

class GraphRetriever:
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.logger = logging.getLogger(__name__)

    def list_all_files(self) -> List[str]:
        response = supabase.table("memory_units").select("file_path").eq("project_id", self.project_id).execute()
        if not response.data: return []
        return sorted(list(set([item['file_path'] for item in response.data])))

    def fetch_file_content(self, file_path: str) -> List[Dict[str, Any]]:
        try:
            response = supabase.table("memory_units")\
                .select("id, unit_name, unit_type, content, file_path")\
                .eq("project_id", self.project_id)\
                .eq("file_path", file_path)\
                .execute()
            return response.data if response.data else []
        except Exception as e:
            self.logger.error(f"Error fetching file: {e}")
            return []

    def search(self, query: str, limit: int = 5, user_config: dict = None) -> List[Dict[str, Any]]:
        """
        Hybrid Search + Graph Expansion + Query Augmentation
        """
        try:
            # 1. Augment Query
            augmented_query = self._augment_query(query, user_config=user_config)
            if augmented_query != query:
                print(f"🔹 Augmented Query: {augmented_query}")

            # 2. Generate Vector from the augmented text
            query_vector = get_embedding(augmented_query)
            
            # 3. Prepare Params for Hybrid Search
            params = {
                "query_embedding": query_vector,
                "query_text": f"{query} {augmented_query}",
                "match_threshold": 0.05, 
                "match_count": limit,
                "filter_project_id": self.project_id
            }
            
            # 4. Call the Hybrid RPC function
            rpc_response = supabase.rpc("match_code_hybrid", params).execute()
            hits = rpc_response.data if rpc_response.data else []
            
            if not hits:
                return []
            
            # 5. Deduplicate Initial Results
            seen = set()
            unique_hits = []
            for hit in hits:
                if hit['id'] not in seen:
                    seen.add(hit['id'])
                    unique_hits.append(hit)
            
            # 6. GRAPH EXPANSION
            # This fetches functions called by the search results to provide full context
            enhanced_hits = self._expand_graph(unique_hits)
            
            return enhanced_hits
            
        except Exception as e:
            self.logger.error(f"Search error: {e}")
            return []
        
    def _augment_query(self, user_query: str, user_config: dict = None) -> str:
        """Uses LLM to expand short queries into technical search terms."""
        # Simple heuristic: don't augment if it looks like a direct file path or very specific code
        if "/" in user_query or "." in user_query: return user_query

        system_prompt = (
            "You are a query optimizer for a semantic code search engine.\n"
            "Your goal is to convert the user's high-level question into a keyword-rich search query.\n"
            "Include synonyms, technical terms, and library names likely to be used in the code.\n"
            "Keep it concise. Output ONLY the augmented query string."
        )
        
        user_prompt = f"User Question: {user_query}\n\nAugmented Search Query:"
        
        suggestion = get_llm_completion(system_prompt, user_prompt, user_config=user_config)
        return suggestion.strip() if suggestion else user_query

    def _expand_graph(self, initial_hits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Finds immediate neighbors (dependencies) of the hits."""
        if not initial_hits:
            return []

        source_names = [h['unit_name'] for h in initial_hits]
        
        try:
            edges = supabase.table("graph_edges")\
                .select("target_unit_name")\
                .eq("project_id", self.project_id)\
                .in_("source_unit_name", source_names)\
                .limit(15)\
                .execute()
            
            if not edges.data:
                return initial_hits

            target_names = [e['target_unit_name'] for e in edges.data]
            
            # REMOVED 'summary' from the select statement here
            neighbors = supabase.table("memory_units")\
                .select("id, unit_name, unit_type, content, file_path")\
                .eq("project_id", self.project_id)\
                .in_("unit_name", target_names)\
                .limit(10)\
                .execute()
                
            combined = initial_hits + (neighbors.data if neighbors.data else [])
            
            seen = set()
            unique = []
            for node in combined:
                if node['id'] not in seen:
                    seen.add(node['id'])
                    unique.append(node)
                    
            return unique
        except Exception as e:
            self.logger.error(f"Graph expansion failed: {e}")
            return initial_hits
        
    def get_architectural_context(self, unit_names: List[str]) -> str:
        """
        Fetches units that are directly connected to the 
        provided list of units in the dependency graph.
        """
        if not unit_names:
            return "No units identified for graph expansion."

        try:
            edges = supabase.table("graph_edges")\
                .select("source_unit_name, target_unit_name")\
                .eq("project_id", self.project_id)\
                .or_(f"source_unit_name.in.({','.join(unit_names)}),target_unit_name.in.({','.join(unit_names)})")\
                .limit(20)\
                .execute()
            
            if not edges.data:
                return "No immediate graph neighbors found."

            related_units = set()
            for edge in edges.data:
                related_units.add(edge['source_unit_name'])
                related_units.add(edge['target_unit_name'])
            
            for original in unit_names:
                related_units.discard(original)

            if not related_units:
                return "No external dependencies found."

            nodes = supabase.table("memory_units")\
                .select("unit_name, file_path")\
                .eq("project_id", self.project_id)\
                .in_("unit_name", list(related_units))\
                .execute()

            context_lines = []
            for node in nodes.data:
                context_lines.append(f"- {node['unit_name']} (in {node['file_path']})")
            
            return "\n".join(context_lines)

        except Exception as e:
            self.logger.error(f"Failed to fetch architectural context: {e}")
            return "Error retrieving graph context."