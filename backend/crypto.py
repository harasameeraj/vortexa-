import base64
import os
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def generate_rsa_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


def sign_token(private_key_pem: str, token: str) -> str:
    private_key = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
    signature = private_key.sign(token.encode(), padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(signature).decode()


def verify_signature(public_key_pem: str, token: str, signature_b64: str) -> bool:
    try:
        public_key = serialization.load_pem_public_key(public_key_pem.encode())
        signature = base64.b64decode(signature_b64)
        public_key.verify(signature, token.encode(), padding.PKCS1v15(), hashes.SHA256())
        return True
    except Exception:
        return False


def encrypt_record(data: str) -> tuple[str, str]:
    key = AESGCM.generate_key(bit_length=256)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, data.encode(), None)
    encrypted = base64.b64encode(nonce + ciphertext).decode()
    key_b64 = base64.b64encode(key).decode()
    return encrypted, key_b64


def decrypt_record(encrypted_b64: str, key_b64: str) -> str:
    key = base64.b64decode(key_b64)
    raw = base64.b64decode(encrypted_b64)
    nonce, ciphertext = raw[:12], raw[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode()
