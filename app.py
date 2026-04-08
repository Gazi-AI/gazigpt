"""
GaziGPT - Ana Flask Sunucusu
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
from agent import GaziAgent, LOGO

app = Flask(__name__, static_folder="static")
CORS(app)

# Agent başlat
print("\n🚀 GaziGPT Başlatılıyor...")
agent = GaziAgent()
print(f"✅ {len(agent.tool_manager.tools)} araç yüklendi!\n")


# ─── ROUTES ───────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory("static", filename)


@app.route("/api/chat", methods=["POST"])
def api_chat():
    """Mesaj gönder, AI yanıtı al (non-stream fallback)."""
    data = request.json or {}
    messages = data.get("messages", [])
    user_message = data.get("message", "").strip()
    file_content = data.get("file_content", "")

    if not user_message:
        return jsonify({"error": "Mesaj boş olamaz."}), 400

    if file_content:
        user_message += f"\n\n--- Ekli Dosya İçeriği ---\n{file_content}\n--- Dosya Sonu ---"

    messages.append({"role": "user", "content": user_message})
    response_text, tool_results = agent.chat(messages)

    return jsonify({
        "response": response_text,
        "tool_results": tool_results,
    })


@app.route("/api/chat/stream", methods=["POST"])
def api_chat_stream():
    """Streaming SSE endpoint — token token yanıt gönderir."""
    data = request.json or {}
    messages = data.get("messages", [])
    user_message = data.get("message", "").strip()
    file_content = data.get("file_content", "")

    if not user_message:
        return jsonify({"error": "Mesaj boş olamaz."}), 400

    if file_content:
        user_message += f"\n\n--- Ekli Dosya İçeriği ---\n{file_content}\n--- Dosya Sonu ---"

    messages.append({"role": "user", "content": user_message})
    prompt = agent.build_system_prompt()

    def generate():
        import json as _json
        full_text = ""

        try:
            # Stream yanıtı chunk chunk gönder
            for chunk in agent.call_llm_stream(messages, system_prompt=prompt):
                full_text += chunk
                yield f"data: {_json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"

            # Stream bitti — tool call var mı kontrol et
            tool_matches = agent.extract_tool_calls(full_text)

            if tool_matches:
                # Frontend'e tool başladığını bildir
                yield f"data: {_json.dumps({'type': 'tool_start', 'count': len(tool_matches)}, ensure_ascii=False)}\n\n"

                # Tool'ları çalıştır
                processed, tool_results = agent.execute_tool_calls(full_text)

                # Tool sonuçlarını kısaca bildir
                tool_names = [tr['tool'] for tr in tool_results]
                yield f"data: {_json.dumps({'type': 'tool_done', 'tools': tool_names}, ensure_ascii=False)}\n\n"

                # Tool sonuçlarını AI'a gönder ve ikinci yanıtı stream et
                msgs2 = messages.copy()
                msgs2.append({"role": "assistant", "content": processed})
                msgs2.append({
                    "role": "user",
                    "content": (
                        "[Sistem: Tool sonuçları başarıyla alındı. "
                        "Sonuçları kullanıcıya güzel, anlaşılır ve detaylı şekilde sun. "
                        "Tekrar tool çağırma. tool_call bloğu kullanma.]"
                    )
                })

                for chunk in agent.call_llm_stream(msgs2, system_prompt=prompt):
                    yield f"data: {_json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"

        except Exception as e:
            yield f"data: {_json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

        yield f"data: {_json.dumps({'type': 'done'})}\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "Transfer-Encoding": "chunked",
        },
    )


@app.route("/api/tools", methods=["GET"])
def api_tools():
    """Yüklü araç listesini döndür (bilgi amaçlı)."""
    return jsonify(agent.tool_manager.get_tool_info())


@app.route("/api/config", methods=["GET"])
def api_config():
    """Logo ve konfigürasyon bilgilerini döndür."""
    return jsonify({"logo": LOGO})


# ─── BAŞLATMA ─────────────────────────────────────────────

def open_browser():
    time.sleep(1.5)
    webbrowser.open("http://localhost:5000")


if __name__ == "__main__":
    print("=" * 50)
    print("  ✦ GaziGPT - v2.0")
    print("  🔗 http://localhost:5000")
    print(f"  🔧 Aktif Araçlar: {len(agent.tool_manager.tools)}")
    print("  📂 Ctrl+C ile kapatın")
    print("=" * 50)

    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host="0.0.0.0", port=5000, debug=False)
