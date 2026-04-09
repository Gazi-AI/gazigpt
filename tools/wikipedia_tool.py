import requests

TOOL_DEFINITION = {
    "name": "wikipedia_tool",
    "description": "Bir konu hakkında Wikipedia'dan bilgi almak için kullanılır.",
    "emoji": "📚",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Bilgi istenen konu"
            },
            "lang": {
                "type": "string",
                "description": "Dil kodu (tr, en vb.)",
                "default": "tr"
            }
        },
        "required": ["query"]
    }
}

def execute(params):
    query = params.get("query")
    lang = params.get("lang", "tr")
    
    if not query:
        return {"error": "Arama sorgusu boş olamaz."}
        
    try:
        url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{query.replace(' ', '_')}"
        resp = requests.get(url, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            return {
                "title": data.get("title"),
                "extract": data.get("extract"),
                "url": data.get("content_urls", {}).get("desktop", {}).get("page"),
                "thumbnail": data.get("thumbnail", {}).get("source")
            }
        elif resp.status_code == 404:
            # Arama yapmayı dene
            search_url = f"https://{lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch={query}&format=json"
            search_resp = requests.get(search_url, timeout=10)
            if search_resp.status_code == 200:
                s_data = search_resp.json()
                results = s_data.get("query", {}).get("search", [])
                if results:
                    best_match = results[0]['title']
                    return {"info": f"Tam eşleşme bulunamadı. Şunlar olabilir: {best_match}", "suggestions": [r['title'] for r in results[:4]]}
            return {"error": "Konu Wikipedia'da bulunamadı."}
        return {"error": f"Wikipedia hatası ({resp.status_code})"}
    except Exception as e:
        return {"error": f"Bir hata oluştu: {str(e)}"}
