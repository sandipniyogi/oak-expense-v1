# Stage 3B4B1 — Project ownership attribution

Offline-only source patch, applied after Stage 3B4A. Records authenticated staff ID for newly created campaign projects and subsequent project edits. Legacy projects remain unassigned.

This does NOT implement the replacement approval endpoint. Rendering and export paths can also change approval-relevant content and need separate race-safe ownership/approval handling before deployment.

Do not run migrations or restart Docker. Run unit tests, inspect SQL and integration behavior before staging.
