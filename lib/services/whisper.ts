// Lemonfox.ai STT integration with fallback to Groq
export async function transcribeAudio(audioFile: File): Promise<string> {
  // Try Lemonfox.ai first
  if (process.env.WHISPER_API_KEY) {
    try {
      console.log("[Transcription] Attempting Lemonfox.ai...");
      const formData = new FormData();
      formData.append("file", audioFile);
      formData.append("language", "ko"); // Korean language
      formData.append("response_format", "json"); // JSON response

      const response = await fetch(
        "https://api.lemonfox.ai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.WHISPER_API_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error("[Transcription] Lemonfox.ai failed:", error);
        throw new Error(`Lemonfox.ai error: ${error}`);
      }

      const data = await response.json();
      console.log("[Transcription] Lemonfox.ai succeeded");
      return data.text;
    } catch (error) {
      console.error("[Transcription] Lemonfox.ai error:", error);
      // Fall through to Groq
    }
  }

  // Fallback to Groq
  if (process.env.GROQ_API_KEY) {
    console.log("[Transcription] Falling back to Groq...");
    return await transcribeAudioWithGroq(audioFile);
  }

  // No API keys available
  throw new Error(
    "No transcription API keys configured. Please set WHISPER_API_KEY or GROQ_API_KEY"
  );
}

// Alternative: Use Groq as backup
export async function transcribeAudioWithGroq(audioFile: File): Promise<string> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY not configured");
  }

  // Groq Whisper Large V3 API
  const formData = new FormData();
  formData.append("file", audioFile);
  formData.append("model", "whisper-large-v3");
  formData.append("language", "ko");
  formData.append("response_format", "json");

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
    const error = await response.text();
    console.error("[Transcription] Groq failed:", error);
    throw new Error(`Groq API error: ${error}`);
  }

  const data = await response.json();
  console.log("[Transcription] Groq succeeded");
  return data.text;
}
