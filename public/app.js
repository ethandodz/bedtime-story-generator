const $ = (id) => document.getElementById(id);

const NATURAL_VOICES = ["sage", "coral", "fable", "shimmer", "ballad", "alloy"];

let storyText = "";
let storyTitle = "";
let naturalVoice = false;
let audioCache = { key: "", blob: null };

init();

async function init() {
  try {
    const config = await (await fetch("/api/config")).json();
    naturalVoice = config.naturalVoice;
  } catch {}
  fillVoices();
  if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = fillVoices;
}

function fillVoices() {
  const select = $("voice");
  const previous = select.value;
  select.innerHTML = "";
  if (naturalVoice) {
    const group = document.createElement("optgroup");
    group.label = "Natural storyteller voices";
    for (const v of NATURAL_VOICES) group.append(new Option(`✨ ${v[0].toUpperCase()}${v.slice(1)}`, `ai:${v}`));
    select.append(group);
  }
  const browserVoices = "speechSynthesis" in window
    ? speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"))
    : [];
  if (browserVoices.length) {
    const group = document.createElement("optgroup");
    group.label = "Device voices (free)";
    for (const v of browserVoices) group.append(new Option(`${v.name} (${v.lang})`, `device:${v.name}`));
    select.append(group);
  }
  if (!select.options.length) select.append(new Option("Device voice", "device:"));
  if ([...select.options].some((o) => o.value === previous)) select.value = previous;

  $("download-note").textContent = naturalVoice
    ? "The MP3 uses the natural voice selected above."
    : "MP3 download needs a natural voice — add an OPENAI_API_KEY on the server to enable it.";
  $("download").disabled = !naturalVoice;
}

$("story-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  stopReading();
  storyText = "";
  audioCache = { key: "", blob: null };
  $("result").hidden = false;
  $("story").innerHTML = "<p><em>Once upon a time… (writing your story)</em></p>";
  setBusy(true);

  try {
    const res = await fetch("/api/story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: $("title").value,
        age: $("age").value,
        minutes: $("minutes").value,
        childName: $("child-name").value,
      }),
    });
    if (!res.ok && res.headers.get("content-type")?.includes("json")) {
      throw new Error((await res.json()).error);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      storyText += decoder.decode(value, { stream: true });
      renderStory();
    }
  } catch (err) {
    $("story").innerHTML = `<p>${escapeHtml(err.message || "Something went wrong.")}</p>`;
  } finally {
    setBusy(false);
  }
});

function renderStory() {
  const [first, ...rest] = storyText.trim().split("\n");
  storyTitle = first.trim();
  const paragraphs = rest.join("\n").split(/\n\s*\n|\n/).filter((p) => p.trim());
  $("story").innerHTML =
    `<h2>${escapeHtml(storyTitle)}</h2>` +
    paragraphs.map((p) => `<p>${escapeHtml(p.trim())}</p>`).join("");
}

function setBusy(busy) {
  $("generate").disabled = busy;
  $("generate").textContent = busy ? "Writing your story…" : "✨ Make my story";
  $("play").disabled = busy;
  $("download").disabled = busy || !naturalVoice;
}

$("play").addEventListener("click", async () => {
  if (!storyText.trim()) return;
  stopReading();
  const voice = $("voice").value;
  if (voice.startsWith("ai:")) {
    const blob = await getAudio(voice.slice(3));
    if (!blob) return;
    const player = $("player");
    player.src = URL.createObjectURL(blob);
    player.hidden = false;
    player.play();
  } else {
    readWithDeviceVoice(voice.replace(/^device:/, ""));
  }
  $("stop").disabled = false;
});

$("stop").addEventListener("click", stopReading);

function stopReading() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  $("player").pause();
  $("stop").disabled = true;
}

function readWithDeviceVoice(name) {
  if (!("speechSynthesis" in window)) {
    alert("Your browser can't read aloud. Try Chrome, Safari or Edge.");
    return;
  }
  const voice = speechSynthesis.getVoices().find((v) => v.name === name);
  // Speak paragraph by paragraph: some browsers cut off very long utterances.
  const parts = storyText.split(/\n+/).filter((p) => p.trim());
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    if (voice) u.voice = voice;
    u.rate = 0.85;
    u.pitch = 1.05;
    if (i === parts.length - 1) u.onend = () => ($("stop").disabled = true);
    speechSynthesis.speak(u);
  });
}

async function getAudio(voice) {
  const key = `${voice}:${storyText}`;
  if (audioCache.key === key) return audioCache.blob;
  const play = $("play");
  const label = play.textContent;
  play.disabled = true;
  play.textContent = "Recording voice…";
  try {
    const res = await fetch("/api/audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: storyText, voice }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    audioCache = { key, blob: await res.blob() };
    return audioCache.blob;
  } catch (err) {
    alert(err.message || "Couldn't create the audio.");
    return null;
  } finally {
    play.disabled = false;
    play.textContent = label;
  }
}

$("download").addEventListener("click", async () => {
  const selected = $("voice").value;
  const voice = selected.startsWith("ai:") ? selected.slice(3) : NATURAL_VOICES[0];
  const blob = await getAudio(voice);
  if (!blob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(storyTitle || "bedtime-story").replace(/[^\w\- ]+/g, "").trim() || "bedtime-story"}.mp3`;
  a.click();
});

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
