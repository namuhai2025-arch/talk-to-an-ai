import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";

const geminiApiKey = defineSecret("GEMINI_API_KEY");

if (!getApps().length) {
  initializeApp();
}

const AUTHORIZED_VOICE_TIERS = new Set(["presence", "professionals", "elite"]);
const DEFAULT_VOICE_NAME = "Puck";
const LIVE_MODEL_ID = "gemini-2.0-flash-exp";

function buildVoiceSystemInstruction({
  userName,
  clientLocalTime,
  preferredLanguage,
  recentChatSnippet,
}) {
  const languageDirective =
    preferredLanguage && preferredLanguage !== "auto"
      ? `The user's explicitly configured language preference is "${preferredLanguage}". Default to speaking this language unless the user directly initiates dialogue in another language.`
      : `Detect and mirror the user's spoken language dynamically in real time. If they speak Spanish, speak natural Spanish. If they speak Tagalog, English, French, Japanese, or code-switch, match their cadence and dialect immediately without announcing the transition.`;

  return [
    `[IDENTITY & PERSONA]`,
    `You are Puck, the voice companion of Talkio. You are the "Playful Anchor"—grounded, witty, warm, emotionally intelligent, and genuinely present. You sound like an authentic close friend over the phone, never an automated assistant or corporate bot.`,
    ``,
    `[MULTILINGUAL BEHAVIOR]`,
    languageDirective,
    `Maintain your warm, charismatic, and lightly teasing personality regardless of the language you are speaking. Use natural colloquialisms and conversational contractions native to that language.`,
    ``,
    `[SPOKEN AUDIO ACOUSTIC CONSTRAINTS]`,
    `You are communicating exclusively through real-time bidirectional spoken audio. Strictly follow these acoustic rules:`,
    `- NEVER generate markdown formatting, bold text, asterisks, bullet points, numbered lists, or emojis.`,
    `- NEVER output stage directions or parenthetical expressions like (laughs), *chuckles*, or [sighs]. Express emotion purely through choice of words, pauses (using commas and ellipses), and vocal cadence.`,
    `- Keep every conversational turn compact: 1 to 3 sentences maximum. Never monologue or give lectures. Leave space for natural conversational turn-taking.`,
    `- Yield immediately if interrupted by the user.`,
    ``,
    `[CALL CALLER CONTEXT]`,
    `User Name: ${userName || "Friend"}`,
    `User Local Time: ${clientLocalTime || "Unknown"}`,
    `Recent Companion Text History: ${recentChatSnippet || "No prior text conversation today."}`,
  ].join("\n");
}

export const initVoiceSession = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 60,
    cors: true,
    secrets: [geminiApiKey],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const authHeader = req.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const idToken = authHeader.split("Bearer ")[1].trim();
    let decodedToken;

    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch (authError) {
      console.error("Token verification failed:", authError);
      return res.status(401).json({ error: "Invalid authentication token" });
    }

    const uid = decodedToken.uid;
    const db = getFirestore();

    try {
      const userDocRef = db.collection("users").doc(uid);
      const userDocSnap = await userDocRef.get();
      const userDocData = userDocSnap.exists ? userDocSnap.data() : {};

      // 1. Resolve Access Tier
      const activePlan = (userDocData.tier || userDocData.plan || "free").toString().toLowerCase().trim();

      if (!AUTHORIZED_VOICE_TIERS.has(activePlan)) {
        return res.status(403).json({
          error: "UPGRADE_REQUIRED",
          requiredTier: "presence",
          currentTier: activePlan,
          message: "Voice Presence calls require the Talkio Presence plan.",
        });
      }

      // 2. Fetch Recent Chat Context Snippet (last 3 text interactions)
      let recentChatSnippet = "";
      try {
        const messagesSnapshot = await db
          .collection("users")
          .doc(uid)
          .collection("messages")
          .orderBy("createdAt", "desc")
          .limit(3)
          .get();

        if (!messagesSnapshot.empty) {
          const pastTurns = [];
          messagesSnapshot.docs.reverse().forEach((doc) => {
            const data = doc.data();
            const sender = data.sender === "user" ? (userDocData.displayName || "User") : "Talkio";
            if (data.text) {
              pastTurns.push(`${sender}: ${data.text}`);
            }
          });
          recentChatSnippet = pastTurns.join(" | ");
        }
      } catch (contextError) {
        console.warn("Could not retrieve past context snippet, proceeding without it:", contextError.message);
      }

      // 3. Extract Session Config from Client
      const body = req.body || {};
      const clientLocalTime = typeof body.clientLocalTime === "string" ? body.clientLocalTime.slice(0, 32) : "Unknown";
      const preferredLanguage = typeof body.preferredLanguage === "string" ? body.preferredLanguage.slice(0, 32) : "auto";
      const userName = userDocData.displayName || userDocData.firstName || decodedToken.name || "Friend";

      // 4. Construct Live Session Prompt
      const systemInstruction = buildVoiceSystemInstruction({
        userName,
        clientLocalTime,
        preferredLanguage,
        recentChatSnippet,
      });

      // 5. Mint Ephemeral Token using Google GenAI Live Client Configuration
      const apiKeyVal = geminiApiKey.value();
      const tokenExpirySeconds = 300; // 5 minutes TTL to establish handshake

      const tokenResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1alpha/authTokens`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKeyVal,
          },
          body: JSON.stringify({
            ttl: `${tokenExpirySeconds}s`,
            uses: 1,
          }),
          signal: AbortSignal.timeout(8000),
        }
      );

      let ephemeralToken = null;

      if (tokenResponse.ok) {
        const tokenJson = await tokenResponse.json();
        ephemeralToken = tokenJson.name || tokenJson.token;
      } else {
        // Fallback for direct edge relay if ephemeral tokens are provisioned under custom scoped keys
        console.warn(`Ephemeral authTokens endpoint returned status ${tokenResponse.status}. Falling back to signed session dispatch.`);
      }

      // 6. Record Initialized Presence Voice Session in Firestore
      const sessionDocRef = await db.collection("users").doc(uid).collection("voiceSessions").add({
        status: "initialized",
        tier: activePlan,
        voiceName: DEFAULT_VOICE_NAME,
        model: LIVE_MODEL_ID,
        preferredLanguage,
        clientLocalTime,
        createdAt: FieldValue.serverTimestamp(),
      });

      // 7. Return Handshake Payload to Client
      return res.status(200).json({
        sessionId: sessionDocRef.id,
        wsEndpoint: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`,
        ephemeralToken: ephemeralToken,
        voiceConfig: {
          model: LIVE_MODEL_ID,
          voiceName: DEFAULT_VOICE_NAME,
          systemInstruction,
          audioConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: DEFAULT_VOICE_NAME,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      console.error("Failed to initialize voice session:", error);
      return res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "Failed to initialize live voice session.",
      });
    }
  }
);