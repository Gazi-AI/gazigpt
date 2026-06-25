export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('OK', {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  try {
    let imageUrl;
    
    if (req.method === 'POST') {
      const body = await req.json();
      imageUrl = body.url;
    } else {
      const url = new URL(req.url);
      imageUrl = url.searchParams.get('url');
    }

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'URL parametresi gerekli' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', "Access-Control-Allow-Origin": "*" }
      });
    }

    // Fetch the image from the remote URL
    const imageRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!imageRes.ok) {
      throw new Error(`Image fetch failed: ${imageRes.status} ${imageRes.statusText}`);
    }

    const contentType = imageRes.headers.get('content-type') || 'image/png';
    const imageBuffer = await imageRes.arrayBuffer();

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (err) {
    console.error('[Image Proxy Error]:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
