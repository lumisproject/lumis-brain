import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Default LLM Settings
    DEFAULT_LLM_PROVIDER = os.getenv("DEFAULT_LLM_PROVIDER", "openrouter")
    DEFAULT_LLM_MODEL = os.getenv("MODEL", "stepfun/step-3.5-flash:free")
    DEFAULT_LLM_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
    
    # Embedding Settings
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")