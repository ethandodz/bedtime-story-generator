# 🌙 Bedtime Story Maker

Pick a movie or book your child loves, choose their age and how long the story should be, and AI writes a gentle bedtime version and reads it out loud. You can download the narration as an MP3 and put it on a Yoto Make Your Own card.

- **Story writing:** Claude (Anthropic API). It retells the story in its own words, softens scary bits, pitches the vocabulary to the child's age, and ends calmly.
- **Reading aloud:** the free built-in voice of your phone or computer, or (optional) a more natural storyteller voice via OpenAI text-to-speech.
- **Yoto:** download the MP3, then add it to a Make Your Own playlist in the Yoto app and link it to a card.

## Free version (runs inside Claude)

`bedtime-page.html` is a no-setup version published as a Claude artifact: https://claude.ai/artifact/MEbKXbgEtx6FjNkskDJ4Y4. Stories are written through the viewer's own Claude account and read aloud with the device's built-in voice, so no API keys are needed. It has no Yoto/MP3 export.

## Run the server version

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # required: https://console.anthropic.com
export OPENAI_API_KEY=sk-...          # optional: natural voices + MP3 download
npm start
```

Then open http://localhost:3000.

Without `OPENAI_API_KEY`, stories are still read aloud using the device's voice, but the MP3 download for Yoto is turned off (device voices can't be saved as audio).

## Adding to a Yoto card

1. Make a story and press **Download MP3**.
2. In the Yoto app (or my.yotoplay.com): **Library → Make Your Own → new playlist**.
3. Add the MP3 as a track, then **Link to card** with a blank Make Your Own card.
