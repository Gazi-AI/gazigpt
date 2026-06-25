export const config = {
  runtime: 'edge',
};

function makeSessionHash() {
  return Math.random().toString(36).substring(2, 13);
}

function cleanOutput(text, task) {
  if (typeof text !== 'string') return text;
  
  // Format task key to match Python output dictionary key, e.g. <DETAILED_CAPTION>
  const key = `<${task.toUpperCase().replace(/ /g, '_')}>`;
  const pattern = new RegExp(`['"]?${key}['"]?\\s*:\\s*['"]((?:\\\\['"]|[^'"])*)['"]`);
  const match = text.match(pattern);
  if (match) {
    return match[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
  }
  return text;
}

async function runGradioTask(serverPath, filename, taskPrompt) {
  const sessionHash = makeSessionHash();
  
  const joinRes = await fetch('https://gokaygokay-florence-2.hf.space/queue/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [
        { path: serverPath, orig_name: filename || 'image.png', meta: { _type: "gradio.FileData" } },
        taskPrompt,
        "",
        "microsoft/Florence-2-large"
      ],
      event_data: null,
      fn_index: 4,
      session_hash: sessionHash
    })
  });

  if (!joinRes.ok) {
    throw new Error(`Queue join failed: ${joinRes.statusText}`);
  }

  const dataRes = await fetch(`https://gokaygokay-florence-2.hf.space/queue/data?session_hash=${sessionHash}`);
  if (!dataRes.ok) {
    throw new Error(`Queue stream failed: ${dataRes.statusText}`);
  }

  const reader = dataRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.substring(6));
        if (event.msg === 'process_completed') {
          if (event.success && event.output && event.output.data) {
            return cleanOutput(event.output.data[0], taskPrompt);
          } else {
            throw new Error(event.output?.error || 'Process completed with error');
          }
        } else if (event.msg === 'process_failed' || event.msg === 'queue_full') {
          throw new Error(`Gradio task failed: ${event.message || event.msg}`);
        }
      }
    }
  }
  throw new Error('Stream ended without completion');
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { image_data, filename } = await req.json();
    if (!image_data) {
      return new Response(JSON.stringify({ error: 'Gorsel verisi bos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Decode base64 image to binary Blob
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
    const blob = new Blob([bytes], { type: 'image/png' });

    // 1. Upload file to Gradio upload space
    const formData = new FormData();
    formData.append('files', blob, filename || 'image.png');

    const uploadRes = await fetch('https://gokaygokay-florence-2.hf.space/upload', {
      method: 'POST',
      body: formData
    });

    if (!uploadRes.ok) {
      throw new Error(`HF Space upload failed: ${uploadRes.statusText}`);
    }

    const uploadData = await uploadRes.json();
    if (!uploadData || !uploadData[0]) {
      throw new Error('HF Space upload returned empty path');
    }
    const serverPath = uploadData[0];

    const results = [];

    // Detailed Caption Task
    try {
      const captionText = await runGradioTask(serverPath, filename, "Detailed Caption");
      if (captionText) {
        results.push(`[Gorsel Aciklamasi]\n${captionText}`);
      }
    } catch (err) {
      results.push(`[Caption hatasi: ${err.message}]`);
    }

    // OCR Task
    try {
      const ocrText = await runGradioTask(serverPath, filename, "OCR");
      if (ocrText && ocrText.trim()) {
        results.push(`[Gorseldeki Metin (OCR)]\n${ocrText}`);
      }
    } catch (err) {
      // Ignore OCR errors if OCR is not present/failed
    }

    const description = results.length > 0 ? results.join('\n\n') : 'Gorsel analiz edilemedi.';

    return new Response(JSON.stringify({
      success: true,
      description: description
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Gorsel analiz hatasi: ${err.message}` }), {
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

