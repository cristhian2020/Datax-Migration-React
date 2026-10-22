import os
from sqlalchemy import create_engine
import core.config as config

def get_current_config():
    return {
        "old_repo": os.getenv("OLD_REPO_PATH", config.DEFAULT_OLD_REPO),
        "new_repo": os.getenv("NEW_REPO_PATH", config.DEFAULT_NEW_REPO),
        "db_host": os.getenv("DB_HOST", config.DEFAULT_DB_HOST),
        "db_port": int(os.getenv("DB_PORT", config.DEFAULT_DB_PORT)),
        "db_user": os.getenv("DB_USER", config.DEFAULT_DB_USER),
        "db_pass": os.getenv("DB_PASS", config.DEFAULT_DB_PASS),
        "db_name": os.getenv("DB_NAME", config.DEFAULT_DB_NAME),
        "ssh_host": os.getenv("SSH_HOST", config.DEFAULT_SSH_HOST),
        "ssh_port": int(os.getenv("SSH_PORT", config.DEFAULT_SSH_PORT)),
        "ssh_user": os.getenv("SSH_USER", config.DEFAULT_SSH_USER),
        "ssh_pass": os.getenv("SSH_PASS", config.DEFAULT_SSH_PASS),
        "github_repo": os.getenv("GITHUB_REPO", config.DEFAULT_GITHUB_REPO),
        "github_token": os.getenv("GITHUB_TOKEN", config.DEFAULT_GITHUB_TOKEN),
        "gemini_api_key": os.getenv("GEMINI_API_KEY", config.DEFAULT_GEMINI_API_KEY),
        "taiga_host": os.getenv("TAIGA_HOST", config.DEFAULT_TAIGA_HOST),
        "taiga_user": os.getenv("TAIGA_USER", config.DEFAULT_TAIGA_USER),
        "taiga_pass": os.getenv("TAIGA_PASS", config.DEFAULT_TAIGA_PASS),
        "taiga_project_slug": os.getenv("TAIGA_PROJECT_SLUG", config.DEFAULT_TAIGA_PROJECT_SLUG),
    }

def get_engine():
    cfg = get_current_config()
    try:
        user = cfg["db_user"]
        pw = cfg["db_pass"]
        host = cfg["db_host"]
        port = cfg["db_port"]
        name = cfg["db_name"]
        conn_str = f"postgresql+psycopg2://{user}:{pw}@{host}:{port}/{name}"
        engine = create_engine(conn_str, connect_args={"connect_timeout": 3})
        return engine
    except Exception:
        return None
