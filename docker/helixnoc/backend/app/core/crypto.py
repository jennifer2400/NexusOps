from cryptography.fernet import Fernet
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

# Initialize Fernet instance with the configured encryption key
try:
    fernet = Fernet(settings.ENCRYPTION_KEY.encode('utf-8'))
except Exception as e:
    logger.error(f"Failed to initialize encryption key: {e}")
    fernet = None

def encrypt_secret(value: str) -> str:
    """Encrypts a plaintext string and returns a URL-safe base64-encoded encrypted string."""
    if not value:
        return value
    if fernet is None:
        raise ValueError("Encryption key is not valid or not configured.")
    return fernet.encrypt(value.encode('utf-8')).decode('utf-8')

def decrypt_secret(encrypted_value: str) -> str:
    """Decrypts a URL-safe base64-encoded encrypted string and returns the plaintext."""
    if not encrypted_value:
        return encrypted_value
    if fernet is None:
        raise ValueError("Encryption key is not valid or not configured.")
    try:
        return fernet.decrypt(encrypted_value.encode('utf-8')).decode('utf-8')
    except Exception as e:
        logger.error(f"Failed to decrypt value: {e}")
        # Retornamos el valor en caso de que accidentalmente haya sido guardado en texto plano
        # (backward compatibility for old plain-text entries in DB)
        return encrypted_value
