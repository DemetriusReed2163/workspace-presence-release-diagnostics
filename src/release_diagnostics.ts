import { z } from "zod";
import { infrai } from "./infrai_realtime";

export const buildEventSchema = z.object({
  buildId: z.string().min(1),
  project: z.string().min(1),
  commitSha: z.string().regex(/^[a-f0-9]{7,40}$/i),
  status: z.enum(["passed", "failed"]),
});

export type BuildEvent = z.infer<typeof buildEventSchema>;

type PresenceMember = { client_id?: string };

function membersFrom(data: unknown): PresenceMember[] {
  if (!data || typeof data !== "object") return [];
  const candidate = data as { members?: unknown; users?: unknown };
  const members = Array.isArray(candidate.members)
    ? candidate.members
    : Array.isArray(candidate.users)
      ? candidate.users
      : [];
  return members.filter(
    (member): member is PresenceMember => member !== null && typeof member === "object",
  );
}

export function decideRelease(status: BuildEvent["status"], onlineCount: number) {
  if (status === "failed") {
    return { operation: "hold" as const, diagnostic: "build_failed" as const };
  }
  if (onlineCount === 0) {
    return { operation: "queue" as const, diagnostic: "no_developer_online" as const };
  }
  return { operation: "release" as const, diagnostic: "reviewer_online" as const };
}

export async function recordBuildAndDiagnose(build: BuildEvent, channel: string) {
  await infrai.realtime.publish(
    {
      channel,
      event: "build.completed",
      data: build,
      account_id: build.project,
    },
    `build:${build.buildId}`,
  );

  const presence = await infrai.realtime.presence.get(channel);
  const members = membersFrom(presence);
  return {
    buildId: build.buildId,
    onlineCount: members.length,
    onlineClientIds: members.flatMap((member) =>
      typeof member.client_id === "string" ? [member.client_id] : [],
    ),
    ...decideRelease(build.status, members.length),
  };
}
