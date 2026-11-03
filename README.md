# Agent sessions board

A private dashboard. The data file (`data.enc.json`) is encrypted with AES-256-GCM, with a key derived from a passphrase using PBKDF2-SHA256 (600,000 iterations). Decryption happens in the browser; nothing is sent anywhere.
