import requests

TOOL_DEFINITION = {
    "name": "currency",
    "description": "Güncel döviz kurlarını öğrenmek için kullanılır (USD, EUR, TRY vb.).",
    "emoji": "💱",
    "parameters": {
        "type": "object",
        "properties": {
            "base": {
                "type": "string",
                "description": "Ana para birimi (örneğin: USD, EUR, TRY)"
            },
            "to": {
                "type": "string",
                "description": "Dönüştürülecek para birimi (opsiyonel)"
            }
        },
        "required": ["base"]
    }
}

def execute(params):
    base = params.get("base", "TRY").upper()
    target = params.get("to")
    
    try:
        # Ücretsiz bir kur servisi
        url = f"https://api.exchangerate-api.com/v4/latest/{base}"
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            rates = data.get("rates", {})
            
            if target:
                target = target.upper()
                if target in rates:
                    return {
                        "base": base,
                        "target": target,
                        "rate": rates[target],
                        "date": data.get("date")
                    }
                else:
                    return {"error": f"Para birimi bulunamadı: {target}"}
            
            # Belirli ana birimleri döndür
            main_rates = {k: rates[k] for k in ["USD", "EUR", "TRY", "GBP"] if k in rates and k != base}
            return {
                "base": base,
                "rates": main_rates,
                "date": data.get("date")
            }
        return {"error": f"Kur bilgisi alınamadı ({resp.status_code})"}
    except Exception as e:
        return {"error": f"Bir hata oluştu: {str(e)}"}
