import requests

TOOL_DEFINITION = {
    "name": "generate_image",
    "description": "Metin açıklamasına dayalı görsel oluşturur (DALL-E / Flux).",
    "emoji": "🎨",
    "parameters": {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "Görselin İngilizce betimlemesi (detaylı olmalı)"
            },
            "ratio": {
                "type": "string",
                "description": "Görsel oranı (1:1, 16:9, 9:16)",
                "default": "1:1"
            }
        },
        "required": ["prompt"]
    }
}

def execute(params):
    prompt = params.get("prompt", "a beautiful digital art")
    ratio = params.get("ratio", "1:1")
    
    # Pollinations Image URL formatı
    # Örnek: https://pollinations.ai/p/[PROMPT]?width=[W]&height=[H]&seed=[S]&model=flux
    
    width, height = 1024, 1024
    if ratio == "16:9":
        width, height = 1280, 720
    elif ratio == "9:16":
        width, height = 720, 1280
        
    import random
    import urllib.parse
    
    seed = str(random.randint(1, 999999999))
    encoded_prompt = urllib.parse.quote(prompt)
    
    # model=zimage ile görsel üretme
    image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?model=zimage&nologo=true&seed={seed}&width={width}&height={height}"
    
    return {
        "image_url": image_url,
        "prompt": prompt,
        "style": "zimage",
        "seed": seed,
        "info": "Görsel başarıyla oluşturuldu."
    }
