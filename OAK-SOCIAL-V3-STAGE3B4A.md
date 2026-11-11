# Stage 3B4A — ownership and approval policy foundation

Offline-only patch. Adds a nullable ownership migration, fail-closed approval policy,
and tests. It deliberately does NOT mount an approval endpoint or alter running services.

**Important:** Existing projects have unknown ownership. They cannot be approved by
this policy until ownership is reviewed and assigned. Do not infer authorship.

Next work: attribute new campaign/project creation and edits to the authenticated
staff member; transactionally enforce the policy in a replacement approval endpoint;
write staff audit records; test approval/edit races and gateway behavior. Do not
apply migration or restart containers yet.
