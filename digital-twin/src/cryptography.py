from src.config import Config
from cryptography.fernet import Fernet

ENCRYPTION_KEY = Config.ENCRYPTION_KEY
cipher_suite = Fernet(ENCRYPTION_KEY.encode())

def encrypt_value(plain_text: str) -> str:
    if not plain_text: return plain_text
    return cipher_suite.encrypt(plain_text.encode()).decode()

def decrypt_value(encrypted_text: str) -> str:
    if not encrypted_text: return encrypted_text
    return cipher_suite.decrypt(encrypted_text.encode()).decode()
    