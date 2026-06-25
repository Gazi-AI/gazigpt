export const config = {
  runtime: 'edge',
};

// Map Microsoft Speech ShortNames to Google Translate locales
const voiceToLocale = {
  'en-AU-WilliamMultilingualNeural': 'en-AU',
  'en-US-AndrewMultilingualNeural': 'en-US',
  'en-US-AvaMultilingualNeural': 'en-US',
  'en-US-EmmaMultilingualNeural': 'en-US',
  'fr-FR-VivienneMultilingualNeural': 'fr-FR',
  'fr-FR-RemyMultilingualNeural': 'fr-FR',
  'de-DE-SeraphinaMultilingualNeural': 'de-DE',
  'de-DE-FlorianMultilingualNeural': 'de-DE',
  'it-IT-GiuseppeMultilingualNeural': 'it-IT',
  'ko-KR-HyunsuMultilingualNeural': 'ko-KR',
  'pt-BR-ThalitaMultilingualNeural': 'pt-BR',
};

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text") || "";
  const voice = searchParams.get("voice") || "en-US-AvaMultilingualNeural";

  if (!text) {
    return new Response("No text provided", { status: 400 });
  }

  // Fallback to Turkish locale (tr-TR) if the voice is not mapped
  const locale = voiceToLocale[voice] || "tr-TR";

  // Google Translate TTS URL
  const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${locale}&client=tw-ob&q=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(googleTtsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`Google TTS returned status ${response.status}`);
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });

  } catch (err) {
    console.error("TTS Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
