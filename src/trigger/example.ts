import { logger, task, wait } from "@trigger.dev/sdk/v3";

export const helloWorldTask = task({
  id: "hello-world",
  maxDuration: 300,
  run: async (payload: { message?: string }, { ctx }) => {
    const greeting = payload.message ?? "Hello, world!";
    logger.log("Hello, world!", { greeting, ctx });

    await wait.for({ seconds: 2 });

    return {
      message: greeting,
      timestamp: new Date().toISOString(),
    };
  },
});