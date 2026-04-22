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
print("\n>> GaziGPT Baslatiliyor...")
agent = GaziAgent()
print(f">> {len(agent.tool_manager.tools)} arac yuklendi!\n")


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
    image_ratio = data.get("image_ratio", "1:1")

    if not user_message:
        return jsonify({"error": "Mesaj boş olamaz."}), 400

    if file_content:
        user_message += f"\n\n--- Ekli Dosya İçeriği ---\n{file_content}\n--- Dosya Sonu ---"

    messages.append({"role": "user", "content": user_message})
    prompt = agent.build_system_prompt()

    def generate():
        import json as _json
        full_text = ""
        chunk_count = 0

        try:
            # Stream yanıtı chunk chunk gönder
            for chunk in agent.call_llm_stream(messages, system_prompt=prompt):
                full_text += chunk
                chunk_count += 1
                yield f"data: {_json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"

            print(f"[DEBUG] Stream bitti: {chunk_count} chunk, {len(full_text)} karakter")
            if full_text[:200]:
                print(f"[DEBUG] Ilk 200 karakter: {full_text[:200]}")

            # Stream bitti — tool call var mı kontrol et
            tool_matches = agent.extract_tool_calls(full_text)
            print(f"[DEBUG] Tool matches: {len(tool_matches)}")

            if tool_matches:
                # Tool isimlerini bulalım
                tool_names_start = []
                for m in tool_matches:
                    try:
                        parsed = _json.loads(m)
                        if isinstance(parsed, dict) and "tool" in parsed:
                            tool_names_start.append(parsed["tool"])
                        elif isinstance(parsed, list):
                            for d in parsed:
                                if isinstance(d, dict) and "tool" in d:
                                    tool_names_start.append(d["tool"])
                    except:
                        pass

                # Frontend'e tool başladığını bildir
                yield f"data: {_json.dumps({'type': 'tool_start', 'count': len(tool_names_start) or 1, 'tools': tool_names_start}, ensure_ascii=False)}\n\n"

                # Tool'ları çalıştır (image_ratio'yu inject et)
                agent._current_image_ratio = image_ratio
                processed, tool_results = agent.execute_tool_calls(full_text)

                # Tool sonuçlarını frontend'e gönder (image URL dahil)
                tool_names = [tr['tool'] for tr in tool_results]
                tool_data = []
                for tr in tool_results:
                    td = {"tool": tr["tool"]}
                    res = tr.get("result", {})
                    inner = res.get("result", res)
                    if isinstance(inner, dict) and "image_url" in inner:
                        td["image_url"] = inner["image_url"]
                    tool_data.append(td)

                yield f"data: {_json.dumps({'type': 'tool_done', 'tools': tool_names, 'results': tool_data}, ensure_ascii=False)}\n\n"

                # Tool sonuçlarını AI'a gönder ve ikinci yanıtı stream et
                msgs2 = messages.copy()
                msgs2.append({"role": "assistant", "content": processed})
                msgs2.append({
                    "role": "user",
                    "content": (
                        "[Sistem: Tool sonuclari basariyla alindi. "
                        "Sonuclari kullaniciya guzel, anlasilir ve detayli sekilde sun. "
                        "ONEMLI UYARI: Eger gorsel (image) uretildiyse, sistem gorseli zaten ekrana basti! "
                        "Bu yuzden yanitinda KESINLIKLE markdown gorsel formatini (![...](...)) KULLANMA. Sadece gorselin olusturuldugunu soyle ve detaylarindan bahset. "
                        "Tekrar tool cagirma. tool_call blogu kullanma.]"
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


@app.route("/api/image-proxy", methods=["GET"])
def api_image_proxy():
    """Pollinations gorsellerini proxy uzerinden sun (referrer sorunu icin)."""
    import requests as req
    url = request.args.get("url", "")
    if not url or "pollinations.ai" not in url:
        return jsonify({"error": "Gecersiz URL"}), 400

    try:
        resp = req.get(url, timeout=60, stream=True, headers={
            "User-Agent": "GaziGPT/2.0",
        })
        if resp.status_code == 200:
            return Response(
                resp.content,
                mimetype=resp.headers.get("Content-Type", "image/jpeg"),
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "Content-Disposition": "inline",
                },
            )
        return jsonify({"error": f"Pollinations hatasi: {resp.status_code}"}), resp.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/analyze-image", methods=["POST"])
def api_analyze_image():
    """Florence-2 ile gorsel analizi yap."""
    import base64
    import uuid
    import tempfile

    data = request.json or {}
    image_data = data.get("image_data", "")
    filename = data.get("filename", "image.png")

    if not image_data:
        return jsonify({"error": "Gorsel verisi bos"}), 400

    try:
        # Base64'ten dosyaya cevir
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]

        img_bytes = base64.b64decode(image_data)

        # Temp dosyaya yaz
        upload_dir = os.path.join(os.path.dirname(__file__), "static", "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        temp_filename = f"{uuid.uuid4().hex}_{filename}"
        filepath = os.path.join(upload_dir, temp_filename)

        with open(filepath, "wb") as f:
            f.write(img_bytes)

        # Florence-2 ile analiz
        from gradio_client import Client, handle_file

        client_vision = Client("gokaygokay/Florence-2")

        # Detayli Caption + OCR dene
        results = []

        try:
            caption_res = client_vision.predict(
                image=handle_file(filepath),
                task_prompt="Detailed Caption",
                text_input="",
                model_id="microsoft/Florence-2-large",
                api_name="/process_image"
            )
            if caption_res and caption_res[0]:
                results.append(f"[Gorsel Aciklamasi]\n{caption_res[0]}")
        except Exception as ce:
            results.append(f"[Caption hatasi: {str(ce)}]")

        try:
            ocr_res = client_vision.predict(
                image=handle_file(filepath),
                task_prompt="OCR",
                text_input="",
                model_id="microsoft/Florence-2-large",
                api_name="/process_image"
            )
            if ocr_res and ocr_res[0] and ocr_res[0].strip():
                results.append(f"[Gorseldeki Metin (OCR)]\n{ocr_res[0]}")
        except Exception as oe:
            pass  # OCR basarisiz olabilir, sorun degil

        # Temp dosyayi sil
        try:
            os.remove(filepath)
        except:
            pass

        description = "\n\n".join(results) if results else "Gorsel analiz edilemedi."

        return jsonify({
            "success": True,
            "description": description,
        })

    except Exception as e:
        return jsonify({"error": f"Gorsel analiz hatasi: {str(e)}"}), 500


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
    print("  GaziGPT - v2.0")
    print("  URL: http://localhost:5000")
    print(f"  Aktif Araclar: {len(agent.tool_manager.tools)}")
    print("  Ctrl+C ile kapatin")
    print("=" * 50)

    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host="0.0.0.0", port=5000, debug=False)
