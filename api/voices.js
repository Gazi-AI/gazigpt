export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const voices = [
    { ShortName: 'en-AU-WilliamMultilingualNeural', FriendlyName: 'William', Locale: 'tr-TR', Gender: 'Male' },
    { ShortName: 'en-US-AndrewMultilingualNeural', FriendlyName: 'Andrew', Locale: 'tr-TR', Gender: 'Male' },
    { ShortName: 'en-US-AvaMultilingualNeural', FriendlyName: 'Ava', Locale: 'tr-TR', Gender: 'Female' },
    { ShortName: 'en-US-BrianMultilingualNeural', FriendlyName: 'Brian', Locale: 'tr-TR', Gender: 'Male' },
    { ShortName: 'en-US-EmmaMultilingualNeural', FriendlyName: 'Emma', Locale: 'tr-TR', Gender: 'Female' },
    { ShortName: 'fr-FR-VivienneMultilingualNeural', FriendlyName: 'Vivienne', Locale: 'tr-TR', Gender: 'Female' },
    { ShortName: 'fr-FR-RemyMultilingualNeural', FriendlyName: 'Remy', Locale: 'tr-TR', Gender: 'Male' },
    { ShortName: 'de-DE-SeraphinaMultilingualNeural', FriendlyName: 'Seraphina', Locale: 'tr-TR', Gender: 'Female' },
    { ShortName: 'de-DE-FlorianMultilingualNeural', FriendlyName: 'Florian', Locale: 'tr-TR', Gender: 'Male' },
    { ShortName: 'it-IT-GiuseppeMultilingualNeural', FriendlyName: 'Giuseppe', Locale: 'tr-TR', Gender: 'Male' },
    { ShortName: 'ko-KR-HyunsuMultilingualNeural', FriendlyName: 'Hyunsu', Locale: 'tr-TR', Gender: 'Male' },
    { ShortName: 'pt-BR-ThalitaMultilingualNeural', FriendlyName: 'Thalita', Locale: 'tr-TR', Gender: 'Female' }
  ];

  return new Response(JSON.stringify(voices), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}
