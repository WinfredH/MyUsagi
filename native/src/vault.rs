//! AES-256-CBC asset vault — 1:1 port of `src/asset-vault.js`.

use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use rand::RngCore;
use sha2::{Digest, Sha256};

type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;
type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;

fn key() -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(b"mybuddy::usagi::asset-vault::v1");
    h.finalize().into()
}

/// Encrypt plaintext -> `[16-byte IV][ciphertext]`.
pub fn encrypt(plain: &[u8]) -> Vec<u8> {
    let key = key();
    let mut iv = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut iv);
    let ct = Aes256CbcEnc::new(&key.into(), &iv.into()).encrypt_padded_vec_mut::<Pkcs7>(plain);
    let mut out = Vec::with_capacity(16 + ct.len());
    out.extend_from_slice(&iv);
    out.extend_from_slice(&ct);
    out
}

/// Decrypt `[16-byte IV][ciphertext]` -> plaintext.
pub fn decrypt(buf: &[u8]) -> Result<Vec<u8>, String> {
    if buf.len() < 17 {
        return Err("vault: buffer too short".into());
    }
    let key = key();
    let iv: [u8; 16] = buf[..16]
        .try_into()
        .map_err(|_| "vault: bad IV".to_string())?;
    Aes256CbcDec::new(&key.into(), &iv.into())
        .decrypt_padded_vec_mut::<Pkcs7>(&buf[16..])
        .map_err(|e| format!("vault decrypt: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let plain = b"hello usagi";
        let enc = encrypt(plain);
        assert!(enc.len() > plain.len());
        let dec = decrypt(&enc).unwrap();
        assert_eq!(dec, plain);
    }

    #[test]
    fn decrypt_too_short() {
        assert!(decrypt(&[0u8; 16]).is_err());
        assert!(decrypt(&[]).is_err());
    }

    #[test]
    fn decrypt_corrupt_ciphertext() {
        let mut buf = vec![0u8; 32];
        rand::thread_rng().fill_bytes(&mut buf);
        assert!(decrypt(&buf).is_err());
    }

    #[test]
    fn encrypt_produces_unique_iv() {
        let plain = b"same plaintext";
        let enc1 = encrypt(plain);
        let enc2 = encrypt(plain);
        assert_ne!(&enc1[..16], &enc2[..16]);
        assert_eq!(decrypt(&enc1).unwrap(), plain);
        assert_eq!(decrypt(&enc2).unwrap(), plain);
    }
}
