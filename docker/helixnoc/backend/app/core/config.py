import os

class Settings:
    PROJECT_NAME: str = "Helix NOC"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super_secret_helix_key_for_jwt")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://helix_user:helix_password@db:5432/helix_db")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")
    
    # Security: Fallback to this key ONLY for testing. Production MUST provide via .env
    ENCRYPTION_KEY: str = os.getenv("ENCRYPTION_KEY", "SUdJIqzpuuE1DCPGvlIRuzJFZHeagXfx9QMHQuGONc4=")

settings = Settings()
