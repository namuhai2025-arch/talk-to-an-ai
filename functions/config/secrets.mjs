import { defineSecret } from "firebase-functions/params";

export const livekitApiKey = defineSecret("LIVEKIT_API_KEY");
export const livekitApiSecret = defineSecret("LIVEKIT_API_SECRET");
export const livekitUrl = defineSecret("LIVEKIT_URL");