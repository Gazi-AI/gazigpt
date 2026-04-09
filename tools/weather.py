import requests

TOOL_DEFINITION = {
    "name": "weather",
    "description": "Herhangi bir şehrin güncel hava durumunu öğrenmek için kullanılır.",
    "emoji": "🌤️",
    "parameters": {
        "type": "object",
        "properties": {
            "city": {
                "type": "string",
                "description": "Hava durumu öğrenilecek şehir (örneğin: İstanbul, Ankara, Londra)"
            }
        },
        "required": ["city"]
    }
}

def execute(params):
    city = params.get("city", "Istanbul")
    # Not: Gerçek bir API anahtarı olmadan Pollinations veya başka bir servisi kullanabiliriz.
    # Burada Pollinations'ın bir özelliğini veya basit bir mock/ücretsiz API'yi kullanabiliriz.
    # Şimdilik basit bir ücretsiz API kullanalım (wttr.in)
    try:
        url = f"https://wttr.in/{city}?format=j1"
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            current = data['current_condition'][0]
            weather_desc = current['lang_tr'][0]['value'] if 'lang_tr' in current else current['weatherDesc'][0]['value']
            return {
                "city": city,
                "temperature": f"{current['temp_C']}°C",
                "condition": weather_desc,
                "humidity": f"%{current['humidity']}",
                "wind": f"{current['windspeedKmph']} km/s"
            }
        return {"error": f"Hava durumu bilgisi alınamadı ({resp.status_code})"}
    except Exception as e:
        return {"error": f"Bir hata oluştu: {str(e)}"}
