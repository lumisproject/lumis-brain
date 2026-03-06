import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Default LLM settings
    DEFAULT_LLM_PROVIDER = os.getenv("DEFAULT_LLM_PROVIDER", "openrouter")
    DEFAULT_LLM_MODEL = os.getenv("MODEL", "stepfun/step-3.5-flash:free")
    DEFAULT_LLM_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
    
    # Embedding settings
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

    # Jira settings
    JIRA_CLIENT_ID = os.getenv("JIRA_CLIENT_ID")
    JIRA_CLIENT_SECRET = os.getenv("JIRA_CLIENT_SECRET")
    JIRA_REDIRECT_URI = os.getenv("JIRA_REDIRECT_URI", "http://localhost:5000/auth/jira/callback")
    JIRA_REDIRECT=os.getenv("JIRA_REDIRECT", "http://localhost:8080/auth/jira/callback")
    
    JIRA_AUTH_URL = "https://auth.atlassian.com/authorize"
    JIRA_TOKEN_URL = "https://auth.atlassian.com/oauth/token"
    JIRA_API_BASE = "https://api.atlassian.com"
    JIRA_API_BASE_URL = "https://api.atlassian.com/ex/jira"
    
    # Supabase settings
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

    # Github settings
    GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")

    # Notion settings
    NOTION_CLIENT_ID = os.getenv("NOTION_CLIENT_ID")
    NOTION_CLIENT_SECRET = os.getenv("NOTION_CLIENT_SECRET")
    NOTION_REDIRECT_URI = os.getenv("NOTION_REDIRECT_URI")

    # Encryption settings
    ENCRYPTION_KEY = os.getenv("FERNET_SECRET_KEY")