import type { helloWorldTask } from "@/trigger/example";
import { tasks } from "@trigger.dev/sdk/v3";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const handle = await tasks.trigger<typeof helloWorldTask>("hello-world", {
      message: "Contract Review Agent — Step Zero",
    });

    return NextResponse.json({
      ok: true,
      runId: handle.id,
      message: "Task triggered. Check the Trigger.dev dashboard and dev terminal.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to trigger task";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
