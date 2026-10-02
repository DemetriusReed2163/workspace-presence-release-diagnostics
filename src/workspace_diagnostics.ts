import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError } from "./infrai_realtime";
import { buildEventSchema, recordBuildAndDiagnose } from "./release_diagnostics";

const port = Number(process.env.PORT ?? 3000);
const channel = process.env.INFRAI_WORKSPACE_CHANNEL ?? "devtools-main";

function send(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/build-events") {
    send(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const build = buildEventSchema.parse(await readJson(request));
    const result = await recordBuildAndDiagnose(build, channel);
    send(response, 200, result);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "invalid_build_event" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code });
      return;
    }
    send(response, 500, { error: "request_failed" });
  }
});

if (process.env.NODE_ENV !== "test") {
  server.listen(port, () => console.log(`Workspace diagnostics listening on ${port}`));
}
