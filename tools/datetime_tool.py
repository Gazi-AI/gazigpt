"""
Tarih/Saat Aracı - Zaman dilimleri, tarih hesaplamaları.
"""

from datetime import datetime, timedelta
import time

TOOL_DEFINITION = {
    'name': 'datetime_tool',
    'emoji': '🕐',
    'description': 'Tarih ve saat bilgileri verir. Farklı zaman dilimleri, tarih hesaplamaları, geri sayım.',
    'parameters': {
        'action': {
            'type': 'string',
            'description': 'İşlem: "now" (şu anki zaman), "diff" (iki tarih arası fark), "add" (tarih ekle/çıkar), "format" (tarih biçimle)',
            'required': True
        },
        'date1': {
            'type': 'string',
            'description': 'Birinci tarih (YYYY-MM-DD formatında)',
            'required': False
        },
        'date2': {
            'type': 'string',
            'description': 'İkinci tarih (YYYY-MM-DD formatında)',
            'required': False
        },
        'days': {
            'type': 'integer',
            'description': '"add" işlemi için eklenecek gün sayısı (negatif = çıkar)',
            'required': False
        },
        'timezone_offset': {
            'type': 'integer',
            'description': 'UTC\'den fark (saat, örn: 3 = UTC+3 Türkiye)',
            'required': False
        }
    }
}

def execute(params):
    action = params.get('action', 'now')
    
    try:
        if action == 'now':
            offset = params.get('timezone_offset', 3)  # Varsayılan Türkiye
            now = datetime.utcnow() + timedelta(hours=offset)
            
            # Türkçe gün ve ay isimleri
            days_tr = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
            months_tr = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
                        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
            
            return {
                'datetime': now.strftime('%Y-%m-%d %H:%M:%S'),
                'date': now.strftime('%Y-%m-%d'),
                'time': now.strftime('%H:%M:%S'),
                'day_name': days_tr[now.weekday()],
                'formatted': f"{now.day} {months_tr[now.month]} {now.year}, {days_tr[now.weekday()]} {now.strftime('%H:%M')}",
                'timezone': f'UTC+{offset}',
                'unix_timestamp': int(time.time()),
                'week_number': now.isocalendar()[1],
                'day_of_year': now.timetuple().tm_yday
            }
        
        elif action == 'diff':
            date1 = params.get('date1', '')
            date2 = params.get('date2', '')
            
            if not date1 or not date2:
                return {'error': 'İki tarih de belirtilmeli (date1 ve date2).'}
            
            d1 = datetime.strptime(date1, '%Y-%m-%d')
            d2 = datetime.strptime(date2, '%Y-%m-%d')
            diff = abs(d2 - d1)
            
            years = diff.days // 365
            months = (diff.days % 365) // 30
            days = (diff.days % 365) % 30
            
            return {
                'date1': date1,
                'date2': date2,
                'total_days': diff.days,
                'years': years,
                'months': months,
                'days': days,
                'formatted': f'{years} yıl, {months} ay, {days} gün',
                'total_hours': diff.days * 24,
                'total_minutes': diff.days * 24 * 60,
                'total_weeks': diff.days / 7
            }
        
        elif action == 'add':
            date1 = params.get('date1', datetime.utcnow().strftime('%Y-%m-%d'))
            days = params.get('days', 0)
            
            d = datetime.strptime(date1, '%Y-%m-%d')
            result = d + timedelta(days=days)
            
            return {
                'original_date': date1,
                'days_added': days,
                'result_date': result.strftime('%Y-%m-%d'),
                'result_day': ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'][result.weekday()]
            }
        
        else:
            return {'error': f'Bilinmeyen işlem: {action}. Kullanılabilir: now, diff, add'}
    
    except ValueError as e:
        return {'error': f'Tarih format hatası: {str(e)}. YYYY-MM-DD formatı kullanın.'}
    except Exception as e:
        return {'error': f'Tarih/saat hatası: {str(e)}'}
