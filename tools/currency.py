"""
Döviz Kuru Aracı - Güncel döviz kurları ve çevirme.
"""

import requests

TOOL_DEFINITION = {
    'name': 'currency',
    'emoji': '💱',
    'description': 'Güncel döviz kurlarını gösterir ve para birimi dönüşümü yapar.',
    'parameters': {
        'amount': {'type': 'number', 'description': 'Miktar (varsayılan: 1)', 'required': False},
        'from_currency': {'type': 'string', 'description': 'Kaynak para birimi (USD, EUR, TRY)', 'required': True},
        'to_currency': {'type': 'string', 'description': 'Hedef para birimi', 'required': True}
    }
}

def execute(params):
    amount = params.get('amount', 1)
    from_curr = params.get('from_currency', 'USD').upper()
    to_curr = params.get('to_currency', 'TRY').upper()
    try:
        url = f"https://api.exchangerate-api.com/v4/latest/{from_curr}"
        response = requests.get(url, timeout=10)
        data = response.json()
        rates = data.get('rates', {})
        if to_curr not in rates:
            return {'error': f'"{to_curr}" para birimi bulunamadı.'}
        rate = rates[to_curr]
        converted = amount * rate
        popular = {}
        for curr in ['USD', 'EUR', 'GBP', 'TRY', 'JPY']:
            if curr in rates and curr != from_curr:
                popular[curr] = round(rates[curr], 4)
        return {
            'amount': amount, 'from': from_curr, 'to': to_curr,
            'rate': round(rate, 4), 'converted': round(converted, 2),
            'formatted': f'{amount} {from_curr} = {converted:,.2f} {to_curr}',
            'other_rates': popular
        }
    except Exception as e:
        return {'error': f'Döviz kuru hatası: {str(e)}'}
