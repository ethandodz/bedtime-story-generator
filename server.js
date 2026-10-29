import express from "express";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const anthropic = new Anthropic();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 3000;

// A calm read-aloud pace is roughly 120 words per minute.
const WORDS_PER_MINUTE = 120;

function ageGuidance(age) {
  if (age <= 3) return "Use very short, simple sentences, lots of gentle repetition and sound words, and only a couple of characters.";
  if (age <= 5) return "Use simple vocabulary, short sentences, a clear and gentle plot, and a little repetition kids can anticipate.";
  if (age <= 8) return "Use rich but accessible vocabulary, some light humour, and a simple adventure with a clear beginning, middle and end.";
  return "Use more varied vocabulary and a slightly more detailed plot, while keeping the tone cosy and calming.";
}

const SYSTEM_PROMPT = `You are a warm, gifted children's storyteller who writes bedtime stories meant to be read aloud.

The parent picks a movie or book their child loves. Retell it as an original bedtime story in your own words: keep the beloved characters, setting and heart of the plot, but never quote or reproduce the original text or script.

Bedtime rules:
- Soften or skip anything scary, violent or sad. Villains become misunderstood, silly, or simply go away. No peril that would keep a child awake.
- The pace slows as the story goes on, and the ending is calm, safe and sleepy (characters settling down to rest is a lovely finish).
- Write for the ear: flowing sentences that sound good spoken aloud. No markdown, no headings, no bullet points, no emoji, no stage directions.
- If you don't recognise the title, write an original story inspired by the title instead.

Output format: the first line is a short story title, then a blank line, then the story.`;

app.get("/api/config", (_req, res) => {
  res.json({ naturalVoice: Boolean(OPENAI_API_KEY) });
});

app.post("/api/story", async (req, res) => {
  const title = String(req.body.title || "").trim().slice(0, 200);
  const age = Math.min(12, Math.max(1, Number(req.body.age) || 5));
  const minutes = Math.min(20, Math.max(2, Number(req.body.minutes) || 5));
  const childName = String(req.body.childName || "").trim().slice(0, 40);
  if (!title) return res.status(400).json({ error: "Please choose a movie or book." });

  const words = minutes * WORDS_PER_MINUTE;
  const userPrompt = [
    `Movie or book: ${title}`,
    `Child's age: ${age}. ${ageGuidance(age)}`,
    `Length: about ${words} words (roughly ${minutes} minutes read aloud). Stay close to this length.`,
    childName
      ? `Include a child named ${childName} as a friendly character who joins the adventure.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");

  try {
    const stream = anthropic.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(event.delta.text);
      }
    }

    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      res.write("\n\n[Sorry, a story couldn't be made for that title. Please try another one.]");
    }
    res.end();
  } catch (err) {
    console.error("Story generation failed:", err);
    if (!res.headersSent) res.status(500);
    res.end("\n\n[Something went wrong while writing the story. Please try again.]");
  }
});

// Split text into chunks under the TTS input limit, breaking on sentence ends.
function chunkText(text, max = 3500) {
  const sentences = text.match(/[^.!?\n]+[.!?]*["”']?\s*|\n+/g) || [text];
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > max && current) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

app.post("/api/audio", async (req, res) => {
  if (!OPENAI_API_KEY) return res.status(501).json({ error: "Natural voice is not configured." });
  const text = String(req.body.text || "").slice(0, 20000);
  const voice = String(req.body.voice || "sage");
  if (!text.trim()) return res.status(400).json({ error: "No story text." });

  try {
    const parts = [];
    for (const chunk of chunkText(text)) {
      const r = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice,
          input: chunk,
          instructions:
            "Read this as a bedtime story for a young child: warm, gentle, soothing and unhurried, with soft expression for different characters. Slow down further towards the end.",
          response_format: "mp3",
        }),
      });
      if (!r.ok) throw new Error(`TTS failed (${r.status}): ${await r.text()}`);
      parts.push(Buffer.from(await r.arrayBuffer()));
    }
    // MP3 frames can be concatenated directly into one playable file.
    res.setHeader("Content-Type", "audio/mpeg");
    res.end(Buffer.concat(parts));
  } catch (err) {
    console.error("Audio generation failed:", err);
    res.status(500).json({ error: "Couldn't create the audio. Please try again." });
  }
});

app.listen(PORT, () => {
  console.log(`Bedtime story generator running at http://localhost:${PORT}`);
});
