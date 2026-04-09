"""
GaziGPT Agent - Akıllı Ajan Sistemi
"""

SYSTEM_PROMPT = """
Sen GaziGPT'sin — Türkçe konuşan, son derece zeki ve yardimsever bir yapay zeka asistanisin.
Emir Özcan tarafindan gelistirildin. Gazi AI Studio bünyesinde çalısiyorsun.

### TEMEL PRENSİPLER:
- Her zaman cana yakin ve profesyonel bir üslup kullan.
- Kullanici Türkçe sorsa dahi, görsel üretme komutlarinda promptlari mutlaka detayli İNGİLİZCE (Flux.1 uyumlu) olarak hazirla.
- Gereksiz teknik detaylara boğulmadan doğrudan yardimci ol.

### ARAÇ KULLANIM PROTOKOLÜ:
Araç kullanman gerektiğinde SADECE su formatta çıktı ver:
```tool_call
{"tool": "araç_adi", "params": {"param_adi": "değer"}}
```

### 🎨 FLUX.1 GÖRSEL ÜRETİMİ (ÖNEMLİ):
"generate_image" aracini kullanırken:
1. Kullanicinin Türkçe isteğini tam anla.
2. Bunu Flux.1'in anlayacaği profesyonel, sanatsal bir İngilizce prompt'a dönüstür (Örn: "High-end cinematic photography, 8k, bokeh, ultra-detailed...").
3. Sadece ```tool_call``` bloğunu gönder. Başka metin yazma ve KESİNLİKLE markdown resmi (```![resim](url)```) kullanma! Görsel arayüzde otomatik gösterilir.

### MEVCUT ARAÇLAR:
- generate_image: Görsel üretir (Flux).
- web_search: İnternette arama yapar.
- wikipedia_tool: Wikipedia bilgisi getirir.
- weather: Hava durumu bilgisi verir.
- datetime_tool: Tarih ve saat bilgisini söyler.
"""

MODEL = "openai"
LOGO = "https://image2url.com/r2/default/images/1775496915249-8137449f-463e-4374-93ea-eb4b8c31cdc5.png"

import re
import json
import requests
from tools.tool_manager import ToolManager

class GaziAgent:
    def __init__(self):
        self.tool_manager = ToolManager()
        self.default_system_prompt = SYSTEM_PROMPT.strip()
        self.session = requests.Session()

    def build_system_prompt(self, custom_system_prompt=""):
        tool_prompt = self.tool_manager.build_system_prompt()
        if custom_system_prompt.strip():
            return f"{tool_prompt}\n\nEk Talimatlar:\n{custom_system_prompt}"
        return tool_prompt

    def call_llm(self, messages, system_prompt=""):
        full_messages = [{"role": "system", "content": system_prompt or self.default_system_prompt}]
        for msg in messages[-10:]:
            full_messages.append({"role": msg["role"], "content": msg["content"]})
        try:
            resp = self.session.post("https://text.pollinations.ai/openai/chat/completions",
                json={"messages": full_messages, "model": MODEL, "temperature": 0.7}, timeout=120)
            return resp.json()['choices'][0]['message']['content'] if resp.status_code == 200 else "API Error"
        except Exception as e: return str(e)

    def call_llm_stream(self, messages, system_prompt="", stop_signal=None):
        payload = {
            "messages": [{"role": "system", "content": system_prompt or self.default_system_prompt}] + messages[-10:],
            "model": MODEL, "temperature": 0.7, "stream": True
        }
        resp = None
        try:
            resp = self.session.post("https://text.pollinations.ai/openai/chat/completions", json=payload, stream=True, timeout=120)
            
            # Flask katmanının resp nesnesini kapatabilmesi için stop_signal'e bir kanca (hook) ekleyebiliriz
            # Ya da daha basitçe stop_signal bir nesneyse içine resp'i kaydedebiliriz.
            if hasattr(stop_signal, 'set_resp'):
                stop_signal.set_resp(resp)

            for line in resp.iter_lines(decode_unicode=True):
                if stop_signal and stop_signal():
                    if resp: resp.close()
                    return
                if line and line.startswith("data: "):
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]": break
                    try:
                        data = json.loads(data_str)
                        content = data['choices'][0]['delta'].get('content', '')
                        if content: yield content
                    except: continue
        except Exception as e: yield str(e)
        finally:
            if resp:
                try: resp.close()
                except: pass

    def extract_tool_calls(self, text):
        return re.findall(r'```\s*tool_call\s*\n?(\{.*?\})\n?\s*```', text, re.DOTALL)

    def execute_tool_calls(self, raw_response, stop_signal=None):
        matches = self.extract_tool_calls(raw_response)
        if not matches: return raw_response, []
        tool_results = []
        processed = raw_response
        for m_str in matches:
            if stop_signal and stop_signal(): break # Durdurma sinyalini kontrol et
            try:
                call = json.loads(m_str)
                tool_name = call.get("tool")
                params = call.get("params", {})
                result = self.tool_manager.execute_tool(tool_name, params)
                tool_results.append({"tool": tool_name, "params": params, "result": result})
                raw_result = result.get("result", result)
                res_json = json.dumps(raw_result, ensure_ascii=False, indent=2)
                
                replacement = f"\n\n**🔧 {tool_name} aracı kullanıldı**\n```json\n{res_json}\n```\n"
                processed = re.sub(re.escape(m_str), replacement, processed)
            except: continue
        return processed, tool_results
