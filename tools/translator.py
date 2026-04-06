"""
Çeviri Aracı - Metinleri farklı diller arasında çevirir.
"""

import requests

TOOL_DEFINITION = {
    'name': 'translator',
    'emoji': '🌐',
    'description': 'Metinleri bir dilden başka bir dile çevirir. 100+ dil desteği.',
    'parameters': {
        'text': {
            'type': 'string',
            'description': 'Çevrilecek metin',
            'required': True
        },
        'source_lang': {
            'type': 'string',
            'description': 'Kaynak dil kodu (örn: "tr", "en", "de", "auto" otomatik algılama)',
            'required': False
        },
        'target_lang': {
            'type': 'string',
            'description': 'Hedef dil kodu (örn: "en", "tr", "de")',
            'required': True
        }
    }
}

def execute(params):
    text = params.get('text', '')
    source = params.get('source_lang', 'auto')
    target = params.get('target_lang', 'en')
    
    if not text:
        return {'error': 'Çevrilecek metin belirtilmedi.'}
    
    try:
        # MyMemory Translation API (ücretsiz, anahtarsız)
        url = "https://api.mymemory.translated.net/get"
        lang_pair = f"{source}|{target}"
        
        response = requests.get(url, params={
            'q': text,
            'langpair': lang_pair
        }, timeout=10)
        
        data = response.json()
        
        if data.get('responseStatus') == 200:
            translated = data['responseData']['translatedText']
            
            # Alternatif çeviriler
            matches = []
            for match in data.get('matches', [])[:3]:
                if match.get('translation') != translated:
                    matches.append({
                        'translation': match['translation'],
                        'quality': match.get('quality', ''),
                        'source': match.get('created-by', '')
                    })
            
            return {
                'original': text,
                'translated': translated,
                'source_lang': source,
                'target_lang': target,
                'alternatives': matches
            }
        else:
            return {'error': f"Çeviri hatası: {data.get('responseDetails', 'Bilinmeyen hata')}"}
            
    except Exception as e:
        return {'error': f'Çeviri hatası: {str(e)}'}
