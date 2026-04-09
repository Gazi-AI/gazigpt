"""
GaziGPT - Ana Flask Sunucusu (Sadeleştirilmiş Metin Modu)
Sohbetler tarayıcıda (localStorage) tutulur.
Sunucu sadece AI yanıtlarını ve tool çalıştırmayı yönetir.
"""

import os
import sys
import json
import time
import webbrowser
import threading
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agent import GaziAgent

app = Flask(__name__, static_folder="static")
CORS(app)

# Agent başlat
print("--- GaziGPT Baslatiliyor (Metin Modu) ---")
agent = GaziAgent()
print(f"--- {len(agent.tool_manager.tools)} arac yuklendi ---\n")


@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory("static", filename)

@app.route("/api/config", methods=["GET"])
def api_config():
    from agent import LOGO
    return jsonify({"logo": LOGO})

# İzleme sınıfı: Aktif isteği ve ağ bağlantısını takip eder
class StopSignal:
    def __init__(self):
        self.stop_event = threading.Event()
        self.active_resp = None
    def __call__(self):
        return self.stop_event.is_set()
    def set(self):
        self.stop_event.set()
        if self.active_resp:
            try: self.active_resp.close()
            except: pass
    def set_resp(self, resp):
        self.active_resp = resp
    def is_set(self):
        return self.stop_event.is_set()

# İstek takibi (Zombi istekleri ve çoklu bağlantıyı önlemek için)
active_requests = {}

@app.route("/api/chat/stream", methods=["POST"])
def api_chat_stream():
    client_ip = request.remote_addr
    
    # Eski isteği anında ve ağ seviyesinde öldür
    if client_ip in active_requests:
        active_requests[client_ip].set()
    
    stop_signal = StopSignal()
    active_requests[client_ip] = stop_signal

    data = request.json or {}
    messages = data.get("messages", [])
    user_message = data.get("message", "").strip()

    if not user_message:
        return jsonify({"error": "Mesaj boş olamaz."}), 400

    if not messages or messages[-1].get("content") != user_message:
        messages.append({"role": "user", "content": user_message})

    prompt = agent.build_system_prompt()

    def generate():
        import json as _json
        full_text = ""

        def should_stop():
            return stop_signal.is_set()

        try:
            # 1. Aşama: AI Yanıtı
            for chunk in agent.call_llm_stream(messages, system_prompt=prompt, stop_signal=stop_signal):
                if should_stop(): break
                full_text += chunk
                yield f"data: {_json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"

            # 2. Aşama: Tool Call Kontrolü
            tool_matches = agent.extract_tool_calls(full_text)

            if tool_matches:
                yield f"data: {_json.dumps({'type': 'tool_start', 'count': len(tool_matches)}, ensure_ascii=False)}\n\n"

                # Tool'ları çalıştır
                try:
                    processed, tool_results = agent.execute_tool_calls(full_text, stop_signal=stop_signal)
                    
                    for tr in tool_results:
                        if tr['tool'] == 'generate_image':
                            res = tr.get('result', {}).get('result', {})
                            img_data = {
                                'type': 'image_result',
                                'url': res.get('image_url'),
                                'prompt': res.get('prompt', ''),
                                'seed': res.get('seed', '0')
                            }
                            yield f"data: {_json.dumps(img_data, ensure_ascii=False)}\n\n"

                    yield f"data: {_json.dumps({'type': 'tool_done', 'tools': [tr['tool'] for tr in tool_results]}, ensure_ascii=False)}\n\n"

                    # Tool sonuçlarını modele verip final metin al
                    msgs2 = messages.copy()
                    msgs2.append({"role": "assistant", "content": full_text})
                    msgs2.append({"role": "user", "content": f"ARAÇ SONUÇLARI:\n{_json.dumps(tool_results, ensure_ascii=False)}\n\nLütfen cevabını tamamla. (ÖNEMLİ: Eğer araç görsel ürettiyse, markdown formatında (örn: ![görsel](url)) KESİNLİKLE çıktı verme! Görsel zaten arayüzde otomatik yüklenmektedir. Sadece 'Görseliniz yükleniyor, lütfen bekleyin...' şeklinde kısa bir bilgi ver, 'üretildi' deme.)"})
                    
                    divider_payload = {'type': 'chunk', 'content': '\n\n---\n\n'}
                    yield f"data: {_json.dumps(divider_payload, ensure_ascii=False)}\n\n"

                    for chunk in agent.call_llm_stream(msgs2, system_prompt=prompt, stop_signal=should_stop):
                        if should_stop(): break
                        yield f"data: {_json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"
                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    yield f"data: {_json.dumps({'type': 'error', 'message': f'Tool Hatası: {str(e)}'}, ensure_ascii=False)}\n\n"

        except GeneratorExit:
            stop_signal.set()
        except Exception as e:
            import traceback
            traceback.print_exc()
            yield f"data: {_json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
        finally:
            if client_ip in active_requests and active_requests[client_ip] == stop_signal:
                del active_requests[client_ip]

    return Response(generate(), mimetype="text/event-stream")

if __name__ == "__main__":
    def open_browser():
        time.sleep(1.5)
        webbrowser.open("http://127.0.0.1:5000")

    threading.Thread(target=open_browser).start()
    app.run(host="0.0.0.0", port=5000, debug=False)
