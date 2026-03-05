import asyncio
from datetime import datetime, timezone
import networkx as nx
from src.db_client import get_project_data, save_risk_alerts, update_unit_risk_scores, delete_previous_risks
from src.services import get_llm_completion

async def analyze_grouped_conflict_with_llm(target_name, target_unit, sources, user_config):
    """
    Analyzes the interaction between multiple recently modified units and a single legacy code unit.
    Determines if the recent changes might break assumptions in the legacy code, or if this legacy code is becoming a risky bottleneck.
    """
    system_prompt = (
        "You are a Senior Software Architect specializing in legacy modernization. "
        "Analyze the interaction where MULTIPLE RECENTLY MODIFIED functions depend on a SINGLE LEGACY function (unchanged for months). "
        "Predict if the recent changes might break assumptions in the legacy code, or if this legacy code is becoming a risky bottleneck. "
        "Be concise. Focus on data flow, responsibilities, and architecture assumptions."
    )
    
    user_prompt = f"--- LEGACY CODE (Target: {target_name}) ---\n\n"
    user_prompt += f"--- RECENT CODE (Touching the legacy unit) ---\n"
    
    # Only pass the full summary for the top 3 most recently modified units to save tokens
    for i, s in enumerate(sources[:3]):
        user_prompt += f"\nActive Unit {i+1}: {s['source_key']}\n"
    
    # If there are more than 3 units, just list their names
    if len(sources) > 3:
        other_names = [s['source_key'] for s in sources[3:]]
        user_prompt += f"\n...and {len(sources) - 3} other active units ({', '.join(other_names)}).\n"
        
    user_prompt += "\nTASK: Explain the potential combined risk in 2-3 sentences. If the risk is generic, say 'Standard dependency risk'."
    
    # Wrap synchronous LLM call to run in a separate thread
    loop = asyncio.get_running_loop()
    analysis = await loop.run_in_executor(
        None,
        get_llm_completion,
        system_prompt,
        user_prompt,
        user_config=user_config
    )
    return analysis if analysis else "Standard dependency risk detected."


async def calculate_predictive_risks(project_id, user_config):
    print(f"Starting Grouped Risk Analysis for {project_id}...")
    # Delete previous risks
    delete_previous_risks(project_id)
    # 1. Fetch Graph Data
    units, edges = get_project_data(project_id)
    if not units:
        return 0

    now = datetime.now(timezone.utc)
    unit_map = {}
    
    # 2. Map all units and calculate exact age in days
    for unit in units:
        if not unit.get('last_modified_at'): continue
            
        try:
            last_mod = datetime.fromisoformat(unit['last_modified_at'].replace('Z', '+00:00'))
            unit['age_days'] = (now - last_mod).days
            unit_map[unit['unit_name']] = unit
        except ValueError:
            continue 

    # 3. BUILD THE SMART GRAPH
    G = nx.DiGraph()
    
    import_map = {}
    for edge in edges:
        if edge.get('edge_type') == 'imports' or '::' not in edge['target_unit_name']:
            src_file = edge['source_unit_name'].split('::')[0]
            if src_file not in import_map: import_map[src_file] = []
            import_map[src_file].append(edge['target_unit_name'])

    for edge in edges:
        source_id = edge['source_unit_name']
        target_short_name = edge['target_unit_name']
        
        if source_id not in unit_map: continue

        potential_targets = [k for k in unit_map.keys() if k.endswith(f"::{target_short_name}")]
        
        for target_id in potential_targets:
            src_file = source_id.split('::')[0]
            tgt_file = target_id.split('::')[0]
            
            target_mod_path = tgt_file.replace('\\', '.').replace('/', '.').replace('.py', '')
            
            file_imports = import_map.get(src_file, [])
            if src_file == tgt_file or any(imp in target_mod_path for imp in file_imports):
                G.add_edge(source_id, target_id)

    # 4. Group Conflicts by the Legacy Target Unit
    active_units = [k for k, v in unit_map.items() if v['age_days'] < 30]
    legacy_units = [k for k, v in unit_map.items() if v['age_days'] > 90]

    print(f"Analyzing paths from {len(active_units)} active units to {len(legacy_units)} older units...")

    grouped_conflicts = {}

    for source in active_units:
        if source not in G: continue
        for target in legacy_units:
            if target not in G or source == target: continue
            
            if nx.has_path(G, source, target):
                path = nx.shortest_path(G, source, target)
                if 1 < len(path) <= 4:
                    source_unit = unit_map[source]
                    target_unit = unit_map[target]
                    age_difference = target_unit['age_days'] - source_unit['age_days']
                    
                    if age_difference > 90:
                        if target not in grouped_conflicts:
                            grouped_conflicts[target] = []
                            
                        grouped_conflicts[target].append({
                            "source_key": source,
                            "source_unit": source_unit,
                            "age_difference": age_difference,
                            "path": " -> ".join(path)
                        })

    # 5. Run Grouped LLM analyses concurrently
    risks = []
    risk_scores = {}
    llm_coroutines = []
    conflict_details = []

    for target, sources in grouped_conflicts.items():
        # Sort sources by how recently they were modified (newest first)
        sources = sorted(sources, key=lambda x: x["source_unit"]["age_days"])
        target_unit = unit_map[target]
        
        print(f"Detected legacy conflict: {target} is being touched by {len(sources)} active units.")
        
        coro = analyze_grouped_conflict_with_llm(target, target_unit, sources, user_config)
        llm_coroutines.append(coro)
        
        conflict_details.append({
            "target_key": target,
            "target_age": target_unit['age_days'],
            "sources": sources,
            "max_age_difference": max(s["age_difference"] for s in sources)
        })
        
        # Risk scoring: Add high risk to the legacy target, small risk to all sources
        risk_scores[target] = risk_scores.get(target, 0) + (15 * len(sources))
        for s in sources:
            risk_scores[s['source_key']] = risk_scores.get(s['source_key'], 0) + 10

    if llm_coroutines:
        print(f"Running {len(llm_coroutines)} parallel AI risk assessments...")
        analyses = await asyncio.gather(*llm_coroutines)
        
        for i, analysis_result in enumerate(analyses):
            det = conflict_details[i]
            target = det['target_key']
            sources = det['sources']
            
            # Severity Logic: "High" if age gap is severe OR if touched by 3+ active units
            severity = "High" if det['max_age_difference'] > 180 or len(sources) >= 3 else "Medium"
            
            # Build unified list of affected units
            affected_list = [target] + [s['source_key'] for s in sources]
            
            description = (
                f"**Legacy Conflict:** The unit `{target}` (untouched for {det['target_age']} days) "
                f"is being affected by recent changes in {len(sources)} active unit(s).\n\n"
                f"**AI Analysis:** {analysis_result}"
            )
            
            risks.append({
                "project_id": project_id,
                "risk_type": "Legacy Conflict",
                "severity": severity, 
                "description": description,
                "affected_units": affected_list
            })

    # 6. Update Database Risk Scores
    score_updates = []
    for u_name, unit in unit_map.items():
        current_score = risk_scores.get(u_name, 0)
        if unit['age_days'] > 90: current_score += 10
        final_score = min(current_score, 100)
        
        if final_score > 0:
            score_updates.append({
                "project_id": project_id, "unit_name": u_name, "risk_score": final_score
            })

    # 7. Save Results
    print(f"Saving {len(risks)} grouped legacy conflicts.")
    save_risk_alerts(project_id, risks)
    update_unit_risk_scores(score_updates)
    
    return len(risks)