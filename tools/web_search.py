import requests

TOOL_DEFINITION = {
    "name": "web_search",
    "description": "Güncel haberler veya genel bilgiler için internette arama yapar.",
    "emoji": "🔍",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Aranacak kelime veya cümle"
            }
        },
        "required": ["query"]
    }
}

def execute(params):
    query = params.get("query")
    if not query:
        return {"error": "Arama sorgusu boş."}
        
    try:
        # Pollinations search endpoint (deneyel)
        # Eğer bu çalışmazsa fallback olarak DuckDuckGo Instant Answer veya bir özet döndüreceğiz.
        url = f"https://text.pollinations.ai/search/{query}"
        resp = requests.get(url, timeout=15)
        
        if resp.status_code == 200:
            return {"results": resp.text[:2000]} # İçeriği biraz kısıtlayalım
            
        return {"error": "Arama servisi şu an kullanılamıyor."}
    except Exception as e:
        return {"error": f"Arama sırasında hata: {str(e)}"}
