import { infrai } from "../src/infrai_realtime";

const channel = process.env.INFRAI_WORKSPACE_CHANNEL ?? "devtools-main";
await infrai.realtime.channel.create(channel);
console.log(`Presence channel ready: ${channel}`);
