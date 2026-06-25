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
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { image_data, space = 'lightricks-ltx-2-3', filename = 'image.png' } = await req.json();
    if (!image_data) {
      return new Response(JSON.stringify({ error: 'Gorsel verisi bos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', "Access-Control-Allow-Origin": "*" }
      });
    }

    let blob;
    if (image_data.startsWith('http')) {
      const fetchRes = await fetch(image_data);
      blob = await fetchRes.blob();
    } else {
      let base64Image = image_data;
      if (base64Image.includes(',')) {
        base64Image = base64Image.split(',')[1];
      }
      const binaryString = atob(base64Image);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      blob = new Blob([bytes], { type: 'image/png' });
    }

    const formData = new FormData();
    formData.append('files', blob, filename);

    // Try Gradio 5/6 route first
    let uploadRes = await fetch(`https://${space}.hf.space/gradio_api/upload`, {
      method: 'POST',
      body: formData
    });

    if (uploadRes.status === 404) {
      console.log('gradio_api/upload returned 404, falling back to legacy /upload...');
      uploadRes = await fetch(`https://${space}.hf.space/upload`, {
        method: 'POST',
        body: formData
      });
    }

    if (!uploadRes.ok) {
      throw new Error(`HF Space upload failed: ${uploadRes.statusText}`);
    }

    const uploadData = await uploadRes.json();
    return new Response(JSON.stringify(uploadData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });

  } catch (err) {
    console.error('[Upload Proxy Error]:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }
}
