"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";
import { COVER_MODEL, COVER_PROMPT, COVER_SCHEMA, parseCoverIdentity } from "./coverIdentity";

/**
 * Cover-photo identification for the Look It Up scanner (Cover mode).
 * Takes a downscaled JPEG frame from the client camera, asks Claude to
 * identify the album, and returns { artist, title } for the search box.
 *
 * All failure modes return { ok: false } variants rather than throwing —
 * the scanner stays open and shows a toast, and a flaky identification
 * must never crash the sheet.
 */
export const identifyCover = action({
  args: {
    sessionToken: v.string(),
    imageBase64: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<
    | { ok: true; artist: string; title: string }
    | { ok: false; reason: "unconfigured" | "unidentified" | "error" }
  > => {
    // Validates the session (throws Unauthorized on a bad token); the
    // credentials themselves are unused here.
    await ctx.runQuery(internal.discogsHelpers.getUserCredentials, {
      sessionToken: args.sessionToken,
    });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { ok: false, reason: "unconfigured" };

    const client = new Anthropic({ apiKey });

    try {
      const response = await client.messages.create({
        model: COVER_MODEL,
        max_tokens: 256,
        output_config: {
          format: {
            type: "json_schema",
            schema: COVER_SCHEMA,
          },
        },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: args.imageBase64,
                },
              },
              { type: "text", text: COVER_PROMPT },
            ],
          },
        ],
      });

      if (response.stop_reason === "refusal") return { ok: false, reason: "unidentified" };

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") return { ok: false, reason: "unidentified" };

      let raw: unknown;
      try {
        raw = JSON.parse(textBlock.text);
      } catch {
        return { ok: false, reason: "unidentified" };
      }

      const identity = parseCoverIdentity(raw);
      if (!identity) return { ok: false, reason: "unidentified" };
      return { ok: true, artist: identity.artist, title: identity.title };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        console.error("identifyCover: rate limited");
      } else if (error instanceof Anthropic.APIError) {
        console.error("identifyCover: API error", error.status, error.message);
      } else {
        console.error("identifyCover: request failed", error);
      }
      return { ok: false, reason: "error" };
    }
  },
});
