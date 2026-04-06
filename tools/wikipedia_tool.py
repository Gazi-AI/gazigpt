"""
Wikipedia Aracı - Wikipedia'dan bilgi çeker.
"""

import requests

TOOL_DEFINITION = {
    'name': 'wikipedia',
    'emoji': '📚',
    'description': 'Wikipedia makale araması yapar ve özet bilgi döndürür.',
    'parameters': {
        'query': {
            'type': 'string',
            'description': 'Aranacak konu',
            'required': True
        },
        'language': {
            'type': 'string',
            'description': 'Dil kodu (varsayılan: "tr")',
            'required': False
        }
    }
}

def execute(params):
    query = params.get('query', '')
    lang = params.get('language', 'tr')
    
    if not query:
        return {'error': 'Aranacak konu belirtilmedi.'}
    
    try:
        # Wikipedia API
        url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{requests.utils.quote(query)}"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            return {
                'title': data.get('title', ''),
                'summary': data.get('extract', ''),
                'url': data.get('content_urls', {}).get('desktop', {}).get('page', ''),
                'thumbnail': data.get('thumbnail', {}).get('source', ''),
                'description': data.get('description', '')
            }
        
        # Arama yap
        search_url = f"https://{lang}.wikipedia.org/w/api.php"
        search_resp = requests.get(search_url, params={
            'action': 'query',
            'list': 'search',
            'srsearch': query,
            'format': 'json',
            'srlimit': 5
        }, timeout=10)
        
        search_data = search_resp.json()
        results = search_data.get('query', {}).get('search', [])
        
        if results:
            suggestions = []
            for r in results:
                suggestions.append({
                    'title': r['title'],
                    'snippet': r.get('snippet', '').replace('<span class="searchmatch">', '**').replace('</span>', '**')
                })
            return {
                'message': f'"{query}" için doğrudan makale bulunamadı, ancak ilgili sonuçlar:',
                'suggestions': suggestions
            }
        
        return {'error': f'"{query}" ile ilgili Wikipedia makalesi bulunamadı.'}
        
    except Exception as e:
        return {'error': f'Wikipedia hatası: {str(e)}'}
