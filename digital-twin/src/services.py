import hashlib
import numpy as np
import requests
import logging
from src.config import Config
from src.cryptography import decrypt_value

# --- LangChain Imports ---
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langchain_huggingface import HuggingFaceEmbeddings

logger = logging.getLogger(__name__)

# 1. EMBEDDINGS INFRASTRUCTURE
lc_embedder = HuggingFaceEmbeddings(model_name=Config.EMBEDDING_MODEL)

class EmbedModelWrapper:
    def __init__(self, embedder):
        self.embedder = embedder
        
    def encode(self, texts):
        embeddings = self.embedder.embed_documents(texts)
        return np.array(embeddings)

embed_model = EmbedModelWrapper(lc_embedder)

def get_embedding(text: str):
    """Returns a flat list of floats for a single query (used in retriever.py)"""
    return lc_embedder.embed_query(text)


# 2. LLM INFRASTRUCTURE.
def get_llm(temperature=0.3, user_config=None):
    reasoning_enabled = user_config.get("reasoning_enabled", False) if user_config else False

    provider = user_config.get("provider") or Config.DEFAULT_LLM_PROVIDER
    api_key = user_config.get("api_key") or Config.DEFAULT_LLM_API_KEY
    model_name = user_config.get("model") or Config.DEFAULT_LLM_MODEL

    if user_config and user_config.get("api_key") and user_config.get("api_key") != Config.DEFAULT_LLM_API_KEY:
        api_key = decrypt_value(api_key)

    print(f"Using LLM Provider: {provider}, Model: {model_name}, Reasoning: {reasoning_enabled}")

    if provider == "openrouter":
        extra_body = {"reasoning": {"enabled": True}} if reasoning_enabled else None
        return ChatOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            model=model_name,
            temperature=temperature,
            extra_body=extra_body
        )

    elif provider == "openai":
        return ChatOpenAI(
            api_key=api_key,
            model=model_name,
            temperature=temperature
        )

    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            api_key=api_key,
            model=model_name,
            temperature=temperature
        )

    elif provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            google_api_key=api_key,
            model=model_name,
            temperature=temperature
        )

    raise ValueError(f"Provider {provider} is not supported yet.")


def get_llm_completion(system_prompt, user_prompt, user_config=None):
    try:
        # 1. Dynamically get the LLM based on user overrides or defaults
        llm = get_llm(
            temperature=0.3,
            user_config=user_config,
        )
        
        # 2. Format messages using LangChain primitives
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ]
        
        # 3. Invoke model
        response = llm.invoke(messages)
        content = response.content
        
        # FIX: Handle cases where LangChain returns a list of blocks instead of a string
        if isinstance(content, list):
            content = " ".join([str(c.get("text", "")) if isinstance(c, dict) else str(c) for c in content])
            
        return str(content).strip()
        
    except Exception as e:
        print(f"LLM Error: {e}")
        return None

def generate_footprint(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

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