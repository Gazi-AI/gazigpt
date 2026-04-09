import datetime

TOOL_DEFINITION = {
    "name": "datetime_tool",
    "description": "Şu anki tarih ve saati öğrenmek için kullanılır.",
    "emoji": "⏰",
    "parameters": {
        "type": "object",
        "properties": {},
        "required": []
    }
}

def execute(params):
    now = datetime.datetime.now()
    return {
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "weekday": now.strftime("%A"),
        "timezone": "UTC+3" # Türkiye'nin genel yerel saati
    }
