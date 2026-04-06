"""
Web Arama Aracı - İnternette arama yapar
DuckDuckGo üzerinden anahtar kelime araması.
"""

import requests
import json

TOOL_DEFINITION = {
    'name': 'web_search',
    'emoji': '🔍',
    'description': 'İnternette arama yapar. Güncel bilgiler, haberler ve her türlü bilgi için kullanılır.',
    'parameters': {
        'query': {
            'type': 'string',
            'description': 'Aranacak metin',
            'required': True
        },
        'max_results': {
            'type': 'integer',
            'description': 'Maksimum sonuç sayısı (varsayılan: 5)',
            'required': False
        }
    }
}

def execute(params):
    query = params.get('query', '')
    max_results = params.get('max_results', 5)
    
    if not query:
        return {'error': 'Arama sorgusu belirtilmedi.'}
    
    try:
        # DuckDuckGo Instant Answer API
        url = "https://api.duckduckgo.com/"
        response = requests.get(url, params={
            'q': query,
            'format': 'json',
            'no_html': 1,
            't': 'gaziAI'
        }, timeout=10)
        
        data = response.json()
        
        results = []
        
        # Abstract (ana özet)
        if data.get('Abstract'):
            results.append({
                'title': data.get('Heading', 'Sonuç'),
                'snippet': data['Abstract'],
                'url': data.get('AbstractURL', ''),
                'source': data.get('AbstractSource', '')
            })
        
        # Related topics
        for topic in data.get('RelatedTopics', [])[:max_results]:
            if isinstance(topic, dict) and 'Text' in topic:
                results.append({
                    'title': topic.get('Text', '')[:80],
                    'snippet': topic.get('Text', ''),
                    'url': topic.get('FirstURL', ''),
                })
        
        # Eğer DuckDuckGo'dan yeterli sonuç gelmezse
        if not results:
            # Fallback: basit web arama
            search_url = f"https://html.duckduckgo.com/html/?q={query}"
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            resp = requests.get(search_url, headers=headers, timeout=10)
            
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(resp.text, 'html.parser')
            
            for result_div in soup.select('.result')[:max_results]:
                title_el = result_div.select_one('.result__title')
                snippet_el = result_div.select_one('.result__snippet')
                link_el = result_div.select_one('.result__url')
                
                if title_el:
                    results.append({
                        'title': title_el.get_text(strip=True),
                        'snippet': snippet_el.get_text(strip=True) if snippet_el else '',
                        'url': link_el.get_text(strip=True) if link_el else ''
                    })
        
        return {
            'query': query,
            'results_count': len(results),
            'results': results
        }
        
    except Exception as e:
        return {'error': f'Arama hatası: {str(e)}'}
