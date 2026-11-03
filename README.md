# Agent sessions board

A private dashboard. The data file (`data.enc.json`) is encrypted with AES-256-GCM, with a key derived from a passphrase using PBKDF2-SHA256 (600,000 iterations). Decryption happens in the browser; nothing is sent anywhere.

## Public swarms tab

`public-swarms.json` holds six anonymised Claude Code sessions with sub-agent fan-out, reduced from
[semianalysisai/cc-traces-weka-with-subagents-051926](https://huggingface.co/datasets/semianalysisai/cc-traces-weka-with-subagents-051926)
(Apache-2.0, pinned revision). Regenerate with `python tools/fetch_public_swarms.py`. The metrics are computed in the browser by `swarms.js`.
