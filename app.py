"""
GaziGPT - Ana Flask Sunucusu
Sohbetler tarayıcıda (localStorage) tutulur.
Sunucu AI yanıtlarını ve tool çalıştırmayı yönetir (g4f üzerinden).
"""

import sys


def _configure_stdio():
    """Prevent Windows console encoding errors from breaking streams."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if not stream or not hasattr(stream, "reconfigure"):
            continue
        try:
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
        except (OSError, ValueError):
            try:
                stream.reconfigure(errors="backslashreplace")
            except (OSError, ValueError):
                pass


def _safe_error_text(error):
    text = str(error)
    return text.encode("utf-8", errors="backslashreplace").decode("utf-8")


_configure_stdio()

import os
import json
import time
import webbrowser
import threading
import asyncio
import edge_tts
from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agent import GaziAgent, LOGO

app = Flask(__name__, static_folder="static")
CORS(app)

# Agent başlat
print("\n>> GaziGPT Baslatiliyor...")
agent = GaziAgent()
print(f">> {len(agent.tool_manager.tools)} arac yuklendi!\n")


def _merge_current_user_message(messages, user_message, file_content=""):
    """Frontend son kullanıcı mesajını zaten gönderdiyse onu zenginleştir."""
    original_message = user_message
    if file_content:
        user_message += f"\n\n--- Ekli Dosya Icerigi ---\n{file_content}\n--- Dosya Sonu ---"

    if messages and messages[-1].get("role") == "user" and messages[-1].get("content", "").strip() == original_message:
        messages[-1] = {"role": "user", "content": user_message}
    else:
        messages.append({"role": "user", "content": user_message})
    return messages


# ─── ROUTES ───────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory("static", filename)


@app.route("/api/image-proxy")
def image_proxy():
    """Görsel URL'sini proxy'ler — kaynak domain gizlenir."""
    import requests as req_lib
    url = request.args.get("url", "")
    if not url:
        return jsonify({"error": "URL gerekli"}), 400
    try:
        resp = req_lib.get(url, timeout=60, stream=True)
        content_type = resp.headers.get("Content-Type", "image/png")
        return Response(
            resp.iter_content(chunk_size=8192),
            content_type=content_type,
            headers={"Cache-Control": "public, max-age=86400"}
        )
    except Exception as e:
        return jsonify({"error": _safe_error_text(e)}), 500


@app.route("/api/chat", methods=["POST"])
def api_chat():
    """Mesaj gönder, AI yanıtı al (non-stream fallback)."""
    data = request.json or {}
    messages = data.get("messages", [])
    user_message = data.get("message", "").strip()
    file_content = data.get("file_content", "")
    model_id = data.get("model", "GaziGPT")
    effort = data.get("effort", "low")

    if not user_message:
        return jsonify({"error": "Mesaj boş olamaz."}), 400

    messages = _merge_current_user_message(messages, user_message, file_content)
    response_text, tool_results = agent.chat(messages, model_id=model_id, effort=effort)

    return jsonify({
        "response": response_text,
        "tool_results": tool_results,
    })


@app.route("/api/chat/stream", methods=["POST"])
def api_chat_stream():
    """Streaming SSE endpoint — g4f üzerinden token token yanıt gönderir."""
    data = request.json or {}
    messages = data.get("messages", [])
    user_message = data.get("message", "").strip()
    file_content = data.get("file_content", "")
    image_ratio = data.get("image_ratio", "1:1")
    model_id = data.get("model", "GaziGPT")
    effort = data.get("effort", "low")

    if not user_message:
        return jsonify({"error": "Mesaj boş olamaz."}), 400

    messages = _merge_current_user_message(messages, user_message, file_content)
    prompt = agent.build_system_prompt(effort=effort)

    def generate():
        import json as _json
        full_text = ""
        chunk_count = 0

        try:
            # g4f stream akışı
            for chunk in agent.call_llm_stream(messages, system_prompt=prompt, model_id=model_id, effort=effort):
                full_text += chunk
                chunk_count += 1
                yield f"data: {_json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"

            print(f"[DEBUG] Stream bitti: {chunk_count} chunk, {len(full_text)} karakter")

            # Stream bitti — tool call var mı kontrol et
            tool_matches = agent.extract_tool_calls(full_text)
            print(f"[DEBUG] Tool matches: {len(tool_matches)}")

            if tool_matches:
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

                yield f"data: {_json.dumps({'type': 'tool_start', 'count': len(tool_names_start) or 1, 'tools': tool_names_start}, ensure_ascii=False)}\n\n"

                tool_results = []
                for m in tool_matches:
                    try:
                        parsed = _json.loads(m)
                        if isinstance(parsed, dict) and "tool" in parsed:
                            result = agent.tool_manager.execute_tool(parsed["tool"], parsed.get("params", {}))
                            tool_results.append({"tool": parsed["tool"], "params": parsed.get("params", {}), "result": result})
                    except:
                        pass
                
                if not tool_results:
                    processed, tool_results = agent.execute_tool_calls(full_text)

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

                has_image = any("generate_image" in tr.get("tool", "") for tr in tool_results)
                
                if has_image:
                    img_result = next((tr for tr in tool_results if tr["tool"] == "generate_image"), None)
                    if img_result:
                        img_prompt = img_result.get("params", {}).get("prompt", "")
                        confirm_msg = f"Görseliniz başarıyla oluşturuldu! 🎨"
                        if img_prompt:
                            confirm_msg += f"\n\n**Kullanılan prompt:** {img_prompt}"
                        
                        for word in confirm_msg.split(" "):
                            yield f"data: {_json.dumps({'type': 'chunk', 'content': word + ' '}, ensure_ascii=False)}\n\n"
                else:
                    msgs2 = messages.copy()
                    
                    processed_text = "Araç çalıştırıldı."
                    for tr in tool_results:
                        result_json = _json.dumps(tr["result"].get("result", tr["result"]), ensure_ascii=False)
                        processed_text += f"\n\n**{tr['tool']} aracı kullanıldı:**\n```json\n{result_json}\n```"
                    
                    msgs2.append({"role": "assistant", "content": processed_text})
                    msgs2.append({
                        "role": "user",
                        "content": (
                            "[Sistem: Tool sonuclari alindi. Kullaniciya kisa ve net sekilde sun. "
                            "Tekrar tool cagirma. Markdown gorsel formatini kullanma.]"
                        )
                    })

                    for chunk in agent.call_llm_stream(msgs2, system_prompt=prompt, model_id=model_id, effort=effort):
                        yield f"data: {_json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"

        except Exception as e:
            yield f"data: {_json.dumps({'type': 'error', 'message': _safe_error_text(e)}, ensure_ascii=False)}\n\n"

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
    return jsonify(agent.tool_manager.get_tool_info())


@app.route("/api/analyze-image", methods=["POST"])
def api_analyze_image():
    import base64
    import uuid
    import tempfile

    data = request.json or {}
    image_data = data.get("image_data", "")
    filename = data.get("filename", "image.png")

    if not image_data:
        return jsonify({"error": "Gorsel verisi bos"}), 400

    try:
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]

        img_bytes = base64.b64decode(image_data)
        upload_dir = tempfile.gettempdir()
        temp_filename = f"{uuid.uuid4().hex}_{filename}"
        filepath = os.path.join(upload_dir, temp_filename)

        with open(filepath, "wb") as f:
            f.write(img_bytes)

        from gradio_client import Client, handle_file
        client_vision = Client("gokaygokay/Florence-2")

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
            pass 

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
        return jsonify({"error": f"Gorsel analiz hatasi: {_safe_error_text(e)}"}), 500


@app.route("/api/voices", methods=["GET"])
def get_voices():
    try:
        extra_voices = [
            {'ShortName': 'en-AU-WilliamMultilingualNeural', 'FriendlyName': 'William', 'Locale': 'tr-TR', 'Gender': 'Male'},
            {'ShortName': 'en-US-AndrewMultilingualNeural', 'FriendlyName': 'Andrew', 'Locale': 'tr-TR', 'Gender': 'Male'},
            {'ShortName': 'en-US-AvaMultilingualNeural', 'FriendlyName': 'Ava', 'Locale': 'tr-TR', 'Gender': 'Female'},
            {'ShortName': 'en-US-BrianMultilingualNeural', 'FriendlyName': 'Brian', 'Locale': 'tr-TR', 'Gender': 'Male'},
            {'ShortName': 'en-US-EmmaMultilingualNeural', 'FriendlyName': 'Emma', 'Locale': 'tr-TR', 'Gender': 'Female'},
            {'ShortName': 'fr-FR-VivienneMultilingualNeural', 'FriendlyName': 'Vivienne', 'Locale': 'tr-TR', 'Gender': 'Female'},
            {'ShortName': 'fr-FR-RemyMultilingualNeural', 'FriendlyName': 'Remy', 'Locale': 'tr-TR', 'Gender': 'Male'},
            {'ShortName': 'de-DE-SeraphinaMultilingualNeural', 'FriendlyName': 'Seraphina', 'Locale': 'tr-TR', 'Gender': 'Female'},
            {'ShortName': 'de-DE-FlorianMultilingualNeural', 'FriendlyName': 'Florian', 'Locale': 'tr-TR', 'Gender': 'Male'},
            {'ShortName': 'it-IT-GiuseppeMultilingualNeural', 'FriendlyName': 'Giuseppe', 'Locale': 'tr-TR', 'Gender': 'Male'},
            {'ShortName': 'ko-KR-HyunsuMultilingualNeural', 'FriendlyName': 'Hyunsu', 'Locale': 'tr-TR', 'Gender': 'Male'},
            {'ShortName': 'pt-BR-ThalitaMultilingualNeural', 'FriendlyName': 'Thalita', 'Locale': 'tr-TR', 'Gender': 'Female'},
        ]
        return jsonify(extra_voices)
    except:
        return jsonify([])

@app.route("/api/tts")
def tts():
    text = request.args.get("text", "")
    voice = request.args.get("voice", "en-US-AvaMultilingualNeural")
    rate = request.args.get("rate", "+0%")
    pitch = request.args.get("pitch", "+0Hz")
    
    if not text:
        return Response("No text provided", status=400)

    v = voice
    r = rate
    p = pitch

    def generate():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            communicate = edge_tts.Communicate(text, v, rate=r, pitch=p)
            async_gen = communicate.stream()
            while True:
                try:
                    chunk = loop.run_until_complete(async_gen.__anext__())
                    if chunk["type"] == "audio":
                        yield chunk["data"]
                except StopAsyncIteration:
                    break
        except Exception as e:
            print(f"Streaming Error: {e}")
        finally:
            loop.close()

    return Response(stream_with_context(generate()), mimetype="audio/mpeg")


@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response


# ═══════════════════════════════════════════════════════════════
#  OpenAI UYUMLU API  — /v1/chat/completions
# ═══════════════════════════════════════════════════════════════

GAZIGPT_API_KEY = os.environ.get("GAZIGPT_API_KEY", "gazigpt")

API_MODELS = {
    "gazigpt": {
        "description": "GaziGPT Llama 3.1 70B — Dengeli hız ve kalite",
        "model_id": "GaziGPT"
    },
    "gazigpt-extended": {
        "description": "GaziGPT Extended — Opera Aria",
        "model_id": "GaziGPT Extended"
    },
    "gazigpt-hyper": {
        "description": "GaziGPT Hyper — YQCloud GPT-4",
        "model_id": "GaziGPT Hyper"
    },
}

def _check_api_key():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return False
    token = auth[7:].strip()
    return token == GAZIGPT_API_KEY


@app.route("/v1/models", methods=["GET"])
def api_v1_models():
    if not _check_api_key():
        return jsonify({"error": {"message": "Invalid API key", "type": "invalid_request_error", "code": "invalid_api_key"}}), 401

    model_list = []
    for model_id, info in API_MODELS.items():
        model_list.append({
            "id": model_id,
            "object": "model",
            "created": 1700000000,
            "owned_by": "gazigpt",
            "description": info["description"],
        })
    return jsonify({"object": "list", "data": model_list})


@app.route("/v1/chat/completions", methods=["POST"])
def api_v1_chat_completions():
    if not _check_api_key():
        return jsonify({"error": {"message": "Invalid API key. Use 'Authorization: Bearer gazigpt'", "type": "invalid_request_error", "code": "invalid_api_key"}}), 401

    data = request.json or {}
    model_name = data.get("model", "gazigpt").lower().strip()
    messages = data.get("messages", [])
    stream = data.get("stream", False)

    if model_name not in API_MODELS:
        return jsonify({"error": {"message": f"Model '{model_name}' not found. Available: {', '.join(API_MODELS.keys())}", "type": "invalid_request_error", "code": "model_not_found"}}), 404

    if not messages:
        return jsonify({"error": {"message": "messages is required", "type": "invalid_request_error"}}), 400

    model_config = API_MODELS[model_name]
    target_model_id = model_config["model_id"]

    # Varsayılan effort 'low' tutuldu
    prompt = agent.build_system_prompt(effort="low")
    request_id = f"chatcmpl-{int(time.time()*1000)}"

    if stream:
        def stream_openai():
            import json as _json

            for chunk in agent.call_llm_stream(messages, system_prompt=prompt, model_id=target_model_id, effort="low"):
                chunk_obj = {
                    "id": request_id,
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": model_name,
                    "choices": [{"index": 0, "delta": {"content": chunk}, "finish_reason": None}],
                }
                yield f"data: {_json.dumps(chunk_obj, ensure_ascii=False)}\n\n"

            done_obj = {
                "id": request_id,
                "object": "chat.completion.chunk",
                "created": int(time.time()),
                "model": model_name,
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            }
            yield f"data: {_json.dumps(done_obj, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

        return Response(
            stream_with_context(stream_openai()),
            content_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    else:
        full_text = ""
        for chunk in agent.call_llm_stream(messages, system_prompt=prompt, model_id=target_model_id, effort="low"):
            full_text += chunk

        return jsonify({
            "id": request_id,
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model_name,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": full_text},
                "finish_reason": "stop",
            }],
            "usage": {
                "prompt_tokens": sum(len(m.get("content", "").split()) for m in messages),
                "completion_tokens": len(full_text.split()),
                "total_tokens": sum(len(m.get("content", "").split()) for m in messages) + len(full_text.split()),
            },
        })


@app.route("/api/config", methods=["GET"])
def api_config():
    return jsonify({
        "logo": LOGO,
        "context_limits": {
            "GaziGPT": agent._get_model_context_limit("GaziGPT"),
            "GaziGPT Extended": agent._get_model_context_limit("GaziGPT Extended"),
            "GaziGPT Hyper": agent._get_model_context_limit("GaziGPT Hyper"),
        },
    })


# ─── BAŞLATMA ─────────────────────────────────────────────

def open_browser():
    time.sleep(1.5)
    webbrowser.open("http://localhost:5000")


if __name__ == "__main__":
    print("=" * 50)
    print("  GaziGPT - g4f Integration")
    print(f"  Aktif Araclar: {len(agent.tool_manager.tools)}")
    print("  Ctrl+C ile kapatin")
    print("=" * 50)

    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host="0.0.0.0", port=5000, debug=False)
