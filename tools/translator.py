import requests

TOOL_DEFINITION = {
    "name": "translator",
    "description": "Metinleri bir dilden diğerine çevirmek için kullanılır.",
    "emoji": "🌐",
    "parameters": {
        "type": "object",
        "properties": {
            "text": {
                "type": "string",
                "description": "Çevrilecek metin"
            },
            "to_lang": {
                "type": "string",
                "description": "Hedef dil kodu (en, tr, de, fr, es vb.)",
                "default": "en"
            }
        },
        "required": ["text", "to_lang"]
    }
}

def execute(params):
    text = params.get("text")
    to_lang = params.get("to_lang", "en")
    
    if not text:
        return {"error": "Metin boş olamaz."}
        
    try:
        # LibreTranslate veya MyMemory gibi ücretsiz bir API
        url = f"https://api.mymemory.translated.net/get?q={requests.utils.quote(text)}&langpair=auto|{to_lang}"
        resp = requests.get(url, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            translated = data.get("responseData", {}).get("translatedText")
            return {
                "original": text,
                "translated": translated,
                "target_lang": to_lang,
                "info": "Çeviri tamamlandı."
            }
        return {"error": f"Çeviri hatası ({resp.status_code})"}
    except Exception as e:
        return {"error": f"Çeviri sırasında hata: {str(e)}"}
