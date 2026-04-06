"""
Hava Durumu Aracı - Anlık hava durumu bilgisi.
Open-Meteo API (ücretsiz, anahtarsız).
"""

import requests

TOOL_DEFINITION = {
    'name': 'weather',
    'emoji': '🌤️',
    'description': 'Belirtilen şehrin anlık hava durumunu gösterir. Sıcaklık, nem, rüzgar hızı ve daha fazlası.',
    'parameters': {
        'city': {
            'type': 'string',
            'description': 'Şehir adı (örn: "İstanbul", "Ankara", "London")',
            'required': True
        }
    }
}

WMO_CODES = {
    0: "☀️ Açık", 1: "🌤️ Çoğunlukla açık", 2: "⛅ Parçalı bulutlu", 3: "☁️ Bulutlu",
    45: "🌫️ Sisli", 48: "🌫️ Kırağılı sis",
    51: "🌦️ Hafif çisenti", 53: "🌦️ Orta çisenti", 55: "🌧️ Yoğun çisenti",
    61: "🌧️ Hafif yağmur", 63: "🌧️ Orta yağmur", 65: "🌧️ Şiddetli yağmur",
    71: "🌨️ Hafif kar", 73: "🌨️ Orta kar", 75: "❄️ Yoğun kar",
    80: "🌧️ Hafif sağanak", 81: "🌧️ Orta sağanak", 82: "⛈️ Şiddetli sağanak",
    95: "⛈️ Gök gürültülü fırtına", 96: "⛈️ Dolu ile fırtına", 99: "⛈️ Şiddetli dolu"
}

def execute(params):
    city = params.get('city', '')
    
    if not city:
        return {'error': 'Şehir adı belirtilmedi.'}
    
    try:
        # Geocoding API ile koordinatları bul
        geo_url = "https://geocoding-api.open-meteo.com/v1/search"
        geo_resp = requests.get(geo_url, params={
            'name': city, 'count': 1, 'language': 'tr'
        }, timeout=10)
        
        geo_data = geo_resp.json()
        
        if not geo_data.get('results'):
            return {'error': f'"{city}" şehri bulunamadı.'}
        
        location = geo_data['results'][0]
        lat = location['latitude']
        lon = location['longitude']
        city_name = location.get('name', city)
        country = location.get('country', '')
        
        # Hava durumu API
        weather_url = "https://api.open-meteo.com/v1/forecast"
        weather_resp = requests.get(weather_url, params={
            'latitude': lat,
            'longitude': lon,
            'current': 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl',
            'daily': 'temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset',
            'timezone': 'auto',
            'forecast_days': 3
        }, timeout=10)
        
        weather_data = weather_resp.json()
        current = weather_data.get('current', {})
        daily = weather_data.get('daily', {})
        
        weather_code = current.get('weather_code', 0)
        condition = WMO_CODES.get(weather_code, "Bilinmiyor")
        
        # Günlük tahmin
        forecast = []
        if daily.get('time'):
            for i in range(min(3, len(daily['time']))):
                forecast.append({
                    'date': daily['time'][i],
                    'max_temp': daily['temperature_2m_max'][i],
                    'min_temp': daily['temperature_2m_min'][i],
                    'condition': WMO_CODES.get(daily['weather_code'][i], '?')
                })
        
        return {
            'city': city_name,
            'country': country,
            'condition': condition,
            'temperature': current.get('temperature_2m'),
            'feels_like': current.get('apparent_temperature'),
            'humidity': current.get('relative_humidity_2m'),
            'wind_speed': current.get('wind_speed_10m'),
            'wind_direction': current.get('wind_direction_10m'),
            'pressure': current.get('pressure_msl'),
            'forecast': forecast
        }
        
    except Exception as e:
        return {'error': f'Hava durumu hatası: {str(e)}'}
