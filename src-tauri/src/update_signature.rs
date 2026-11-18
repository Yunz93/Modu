use base64::{engine::general_purpose::STANDARD, Engine};
// The trust root comes from the application configuration, never from release metadata.
pub fn verify(bytes: &[u8], signature: &str, version: &str) -> Result<(), String> {
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).map_err(|e| e.to_string())?;
    let decode = |s: &str| -> Result<String, String> {
        String::from_utf8(STANDARD.decode(s.trim()).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())
    };
    let public = decode(
        config["plugins"]["updater"]["pubkey"]
            .as_str()
            .ok_or("缺少可信公钥。")?,
    )?;
    let signature = decode(signature)?;
    let key = minisign_verify::PublicKey::decode(&public).map_err(|e| e.to_string())?;
    let sig = minisign_verify::Signature::decode(&signature).map_err(|e| e.to_string())?;
    key.verify(bytes, &sig, true)
        .map_err(|_| "更新包不属于墨牍或已被篡改。")?;
    let signed = sig
        .trusted_comment()
        .split('\t')
        .find_map(|part| part.strip_prefix("version:"))
        .ok_or("签名缺少受保护的版本号。")?;
    let signed =
        semver::Version::parse(signed.trim_start_matches('v')).map_err(|e| e.to_string())?;
    let announced =
        semver::Version::parse(version.trim_start_matches('v')).map_err(|e| e.to_string())?;
    if signed != announced {
        return Err("签名版本与发布清单不一致。".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const DATA: &[u8] = include_bytes!("../../tests/fixtures/update-payload.txt");
    const SIGNATURE: &str = include_str!("../../tests/fixtures/update-payload.txt.sig");
    #[test]
    fn accepts_trusted_signature_and_bound_version() {
        verify(DATA, SIGNATURE, "0.1.1").unwrap();
    }
    #[test]
    fn rejects_tampered_bytes_missing_signature_and_spoofed_version() {
        assert!(verify(b"changed", SIGNATURE, "0.1.1").is_err());
        assert!(verify(DATA, "", "0.1.1").is_err());
        assert!(verify(DATA, SIGNATURE, "9.9.9").is_err());
    }
    #[test]
    fn mutually_consistent_untrusted_signature_is_still_rejected() {
        assert!(verify(
            DATA,
            include_str!("../../tests/fixtures/update-untrusted.sig"),
            "0.1.1"
        )
        .is_err());
    }
}
