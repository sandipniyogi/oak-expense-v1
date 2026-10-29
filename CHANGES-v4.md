# v4 changes

- Added local `oak-ai` Docker service.
- Uses native macOS Ollama at `host.docker.internal:11434`.
- Default model: `qwen3:8b`.
- Uses Ollama structured JSON output for deterministic product proposals.
- Added Admin Panel `AI Assistant` tab.
- Added editable review/approval workflow.
- Added duplicate-candidate warnings.
- Added transactional Inventory API endpoint for approved proposals.
- Added `oak_inv_ai_audit` table.
- Staging AI port: `4400`.
- Production AI port: `4401`.
