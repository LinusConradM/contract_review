import { streams } from "@trigger.dev/sdk/v3";
import { SUMMARY_STREAM_ID } from "./streamKeys";

// The realtime stream that carries the final summary document to the frontend,
// one token (string delta) at a time. Defined once here so the task that pipes
// into it and any server code that reads it agree on the id and chunk type.
//
// Server-only: imports the Trigger SDK. The browser subscribes using the plain
// SUMMARY_STREAM_ID string via useRealtimeStream(runId, SUMMARY_STREAM_ID).
export const summaryStream = streams.define<string>({ id: SUMMARY_STREAM_ID });
