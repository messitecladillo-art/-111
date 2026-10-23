# Preserved Cloudflare route implementations

The original business route handlers are retained here as migration evidence. They are excluded from the Next application and are not callable in the hosted runtime.

The complete pre-migration source (452 files), including its tests, is preserved and hash-verified in `.collab/runs/20261007-p0/baseline-source.zip`. Its receipt records the source manifest and archive hashes.

P0 uses FastAPI for all hosted identity, project, credential, model and questionnaire-version operations. Public stateless case/rule/diagnosis endpoints remain in Next during P0 to preserve the current workbench; they have no account, database or external-service access. Remaining storage/Office APIs migrate with their feature batches. Frontend local editing, analysis and export tools remain usable throughout migration.

Do not reconnect these archived routes as fallback account or storage paths. Historical identity/data import requires a separate verified migration.
