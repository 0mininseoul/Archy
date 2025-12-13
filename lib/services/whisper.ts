// Groq Whisper Large V3 STT Service
// Using Groq API for fast and accurate Korean transcription

export async function transcribeAudio(audioFile: File): Promise<string> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY not configured");
  }

  console.log("[Transcription] Starting Groq Whisper transcription...");
  console.log("[Transcription] File type:", audioFile.type, "Size:", audioFile.size);

  const formData = new FormData();
  formData.append("file", audioFile);
  formData.append("model", "whisper-large-v3");
  formData.append("language", "ko"); // Korean language for best accuracy
  formData.append("response_format", "json");

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Transcription] Groq API error:", errorText);
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.text || data.text.trim().length === 0) {
      throw new Error("Transcription returned empty result");
    }

    console.log("[Transcription] Groq transcription succeeded, length:", data.text.length);
    return data.text;
  } catch (error) {
    console.error("[Transcription] Groq error:", error);
    throw new Error(
      `Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
