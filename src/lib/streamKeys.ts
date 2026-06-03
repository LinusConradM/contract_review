// Stream key shared between the Trigger.dev task (which pipes to it) and the
// browser hook (which subscribes to it). Kept in its own dependency-free module
// so the client bundle can import the constant without pulling in the
// server-only @trigger.dev/sdk.
export const SUMMARY_STREAM_ID = "summary-output";
