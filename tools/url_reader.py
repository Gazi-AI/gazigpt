"""
URL Okuma Aracı - Web sayfalarından metin çeker.
"""

import requests

TOOL_DEFINITION = {
    'name': 'url_reader',
    'emoji': '📄',
    'description': 'Bir web sayfasının içeriğini okur ve metin olarak döndürür. Haberler, makaleler, belgeler için.',
    'parameters': {
        'url': {
            'type': 'string',
            'description': 'Okunacak web sayfasının URL adresi',
            'required': True
        },
        'max_length': {
            'type': 'integer',
            'description': 'Maksimum karakter sayısı (varsayılan: 3000)',
            'required': False
        }
    }
}

def execute(params):
    url = params.get('url', '')
    max_length = params.get('max_length', 3000)
    
    if not url:
        return {'error': 'URL belirtilmedi.'}
    
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Gereksiz elementleri kaldır
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe']):
            tag.decompose()
        
        # Başlığı al
        title = soup.find('title')
        title_text = title.get_text(strip=True) if title else ''
        
        # Meta description
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        description = meta_desc['content'] if meta_desc and meta_desc.get('content') else ''
        
        # Ana içeriği al
        # Önce article veya main etiketlerini dene
        main_content = soup.find('article') or soup.find('main') or soup.find('body')
        
        if main_content:
            text = main_content.get_text(separator='\n', strip=True)
        else:
            text = soup.get_text(separator='\n', strip=True)
        
        # Boş satırları temizle
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        text = '\n'.join(lines)
        
        # Uzunluk sınırla
        if len(text) > max_length:
            text = text[:max_length] + '...'
        
        return {
            'url': url,
            'title': title_text,
            'description': description,
            'content': text,
            'content_length': len(text)
        }
        
    except requests.exceptions.Timeout:
        return {'error': 'Sayfa yüklenirken zaman aşımı oluştu.'}
    except requests.exceptions.HTTPError as e:
        return {'error': f'HTTP hatası: {e.response.status_code}'}
    except Exception as e:
        return {'error': f'Sayfa okuma hatası: {str(e)}'}
