# SQLite barrier prototype

This isolated prototype guards only explicitly named disposable test tables. It is not installed in restaurant.sqlite and is not wired into restaurant HTTP handlers. Restaurant strict-mode writes remain blocked. The test creates and removes a temporary SQLite database inside the existing restaurant staging container; no restart/build is needed.

Test coverage: unpermitted INSERT/UPDATE/DELETE, browsing, current and stale permits, rollback, overlapping operation rejection, separate connection rejection, synchronization permits, closed claims, and freeze refusing to complete while a writer owns a transaction. Production asynchronous drain/retry behavior is not implemented.

SQLite has no server-side role boundary. A process with write access to the file can modify state, replace functions, drop triggers/tables or otherwise bypass this prototype. Production needs a single trusted writer, restricted filesystem access, schema/connection controls and crash recovery. This test does not establish protection against a malicious file owner. Transaction callbacks are trusted synchronous code and must never schedule asynchronous SQL work. Sessions, audit, caches, file uploads and HTTP/coordinator integration still need an explicit policy and implementation. Real Mac/VPS replication remains incomplete.

Keep PR #9 draft and deployment paused.
