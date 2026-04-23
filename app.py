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
    model_id = data.get("model", "GaziGPT")
    backend_model = "openai"
    system_prompt_ext = ""

    if model_id == "GaziGPT":
        backend_model = "openai-fast" # Hızlı model
    elif model_id == "GaziGPT Thinking":
        backend_model = "openai-fast"
        system_prompt_ext = (
            "Senin çok güçlü bir analitik 'İç Ses' (Düşünce) yeteneğin var. "
            "Kullanıcıya asıl cevabı vermeden önce her zaman içinden detaylıca düşün, durumu analiz et ve plan yap. "
            "Düşünce sürecin API tarafından otomatik ayrıştırılmaktadır, bu yüzden yanıtında kendin asla <think> veya </think> gibi etiketler KULLANMA. "
            "Sadece içinden özgürce düşün, ardından kullanıcıya doğrudan ve doğal bir şekilde asıl cevabını ver."
        )
    elif model_id == "GaziGPT Extended":
        backend_model = "openai-fast"
        system_prompt_ext = (
            "Senin adın GaziGPT. Sen bu modelin en gelişmiş versiyonusun. "
            "Kullanıcıya yanıt vermeden önce durum değerlendirmesi, çok derin ve kapsamlı bir 'İç Ses' analizi yapmalısın. "
            "Bu analiz süreci API tarafından otomatik olarak yönetilmektedir, bu yüzden yanıtında kendin asla <think> veya </think> gibi XML etiketleri KULLANMA. "
            "Sadece en derin analitik düşünceni yap, ardından kullanıcıya en detaylı, net ve nihai cevabını sun."
        )

    if not user_message:
        return jsonify({"error": "Mesaj boş olamaz."}), 400

    if file_content:
        user_message += f"\n\n--- Ekli Dosya İçeriği ---\n{file_content}\n--- Dosya Sonu ---"

    messages.append({"role": "user", "content": user_message})
    prompt = agent.build_system_prompt(system_prompt_ext)

    def generate():
        import json as _json
        full_text = ""
        chunk_count = 0

        try:
            # Stream yanıtı chunk chunk gönder
            for chunk in agent.call_llm_stream(messages, system_prompt=prompt, model_override=backend_model):
                if "pollinations" in chunk.lower():
                    continue
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
                
                # Önceki yanıtın içindeki düşünce etiketlerini sistem notuna çevir ki 
                # AI kendi düşüncesini 'normal cevap' sanmasın ve eğer think içinde tool çalıştıysa sonuçları silinmesin.
                import re
                processed_clean = re.sub(r'<think>', '\n[Sistem Notu: Kendi İç Ses / Düşünce Sürecin Başlangıcı]\n', processed, flags=re.IGNORECASE)
                processed_clean = re.sub(r'<\/think>', '\n[Sistem Notu: Kendi İç Ses / Düşünce Sürecin Bitişi]\n', processed_clean, flags=re.IGNORECASE)
                processed_clean = processed_clean.strip()
                
                msgs2.append({"role": "assistant", "content": processed_clean})
                
                second_user_msg = (
                    "[Sistem: Tool sonuclari basariyla alindi. "
                    "Sonuclari kullaniciya guzel, anlasilir ve detayli sekilde sun. "
                    "ONEMLI UYARI: Eger gorsel (image) uretildiyse, sistem gorseli zaten ekrana basti! "
                    "Bu yuzden yanitinda KESINLIKLE markdown gorsel formatini (![...](...)) KULLANMA. Sadece gorselin olusturuldugunu soyle ve detaylarindan bahset. "
                    "Tekrar tool cagirma. tool_call blogu kullanma. "
                    "En önemlisi: Yeni yanıtında da içinden durum değerlendirmesi yapabilirsin ama kendin asla <think> etiketi yazma, sadece doğal asıl cevabını ver!]"
                )
                
                msgs2.append({
                    "role": "user",
                    "content": second_user_msg
                })

                for chunk in agent.call_llm_stream(msgs2, system_prompt=prompt, model_override=backend_model):
                    if "pollinations" in chunk.lower():
                        continue
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
    """Gorsel analizi yap."""
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

        # Gorsel analiz motoru
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


@app.route("/api/voices", methods=["GET"])
def get_voices():
    try:
        # Multilingual voices from ai-by-chatgpt project
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

    # Handle variants
    v = voice
    r = rate
    p = pitch

    def generate():
        # Using a new loop for the streaming thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            # Edge-TTS Streaming
            communicate = edge_tts.Communicate(text, v, rate=r, pitch=p)
            
            # Helper to run the async generator
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


@app.route("/api/chat/fast", methods=["POST"])
def api_chat_fast():
    """Hizli yanit endpoint'i - dusunmeden hizlica cevap verir."""
    data = request.json or {}
    user_message = data.get("message", "").strip()

    if not user_message:
        return jsonify({"error": "Mesaj bos olamaz."}), 400

    prompt = agent.build_system_prompt()

    def generate():
        import json as _json
        full_text = ""
        try:
            for chunk in agent.call_llm_fast_stream(user_message, system_prompt=prompt):
                if "pollinations" in chunk.lower():
                    continue
                full_text += chunk
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
        },
    )


@app.after_request
def add_cors_headers(response):
    """Her istege CORS basliklari ekle (Harici uygulamalarin API'ye erisebilmesi icin)."""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.route("/v1/models", methods=["GET", "OPTIONS"])
def openai_v1_models():
    """Harici uygulamalarin model listesini cekebilmesi icin sahte model listesi."""
    return jsonify({
        "object": "list",
        "data": [
            {
                "id": "gazigpt",
                "object": "model",
                "created": 1686935002,
                "owned_by": "gazi-ai"
            },
            {
                "id": "gazigpt-fast",
                "object": "model",
                "created": 1686935002,
                "owned_by": "gazi-ai"
            },
            {
                "id": "gazigpt-image",
                "object": "model",
                "created": 1686935002,
                "owned_by": "gazi-ai"
            }
        ]
    })

@app.route("/v1/chat/completions", methods=["POST", "GET", "OPTIONS"])
def openai_v1_chat_completions():
    """OpenAI API formatinda calisan endpoint (Diger uygulamalar icin)."""
    if request.method == "OPTIONS":
        return Response(status=200)
        
    if request.method == "GET":
        return jsonify({"error": "Bu endpoint sadece POST isteklerini kabul eder. Lutfen API dokumanina bakin."}), 400

    data = request.json or {}
    messages = data.get("messages", [])
    stream = data.get("stream", False)
    requested_model = data.get("model", "gazigpt")
    
    # Eger gazigpt-fast istenmisse, arka planda openai-fast cagir
    backend_model = "openai"
    if requested_model == "gazigpt-fast":
        backend_model = "openai-fast"

    # Tool'lar deaktif, sadece standart LLM konusmasi
    prompt = agent.build_system_prompt()
    
    if stream:
        def generate_openai_stream():
            import uuid
            import json as _json
            import time
            chat_id = f"chatcmpl-{uuid.uuid4().hex}"
            created = int(time.time())
            
            for chunk in agent.call_llm_stream(messages, system_prompt=prompt, model_override=backend_model):
                # Reklam kelimesini stream icinde engellemek zor ama basit bir kontrol
                if "pollinations.ai" in chunk.lower() or "pollinations" in chunk.lower():
                    continue
                
                resp = {
                    "id": chat_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": requested_model,
                    "choices": [{"delta": {"content": chunk}, "index": 0, "finish_reason": None}]
                }
                yield f"data: {_json.dumps(resp)}\n\n"
            
            # Bitis
            yield f"data: {_json.dumps({'id': chat_id, 'object': 'chat.completion.chunk', 'created': created, 'model': requested_model, 'choices': [{'delta': {}, 'index': 0, 'finish_reason': 'stop'}]})}\n\n"
            yield "data: [DONE]\n\n"

        return Response(generate_openai_stream(), mimetype="text/event-stream")
    else:
        # Non-stream
        response_text = agent.call_llm(messages, system_prompt=prompt, model_override=backend_model)
        
        import uuid
        import time
        return jsonify({
            "id": f"chatcmpl-{uuid.uuid4().hex}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": requested_model,
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": response_text
                },
                "finish_reason": "stop"
            }]
        })

@app.route("/v1/images/generations", methods=["POST", "OPTIONS"])
def openai_v1_images_generations():
    """OpenAI uyumlu gorsel uretme endpoint'i."""
    if request.method == "OPTIONS":
        return Response(status=200)

    data = request.json or {}
    prompt = data.get("prompt", "")
    if not prompt:
        return jsonify({"error": "Prompt gerekli"}), 400

    import urllib.parse
    import time
    
    # Pollinations (Flux tabanli) gorsel uretme URL'si
    # OpenAI bazi dondurme formati bekler, url donmemiz lazim
    safe_prompt = urllib.parse.quote(prompt)
    seed = int(time.time() * 1000) % 1000000
    
    image_url = f"https://image.pollinations.ai/prompt/{safe_prompt}?model=flux&nologo=true&seed={seed}"
    
    return jsonify({
        "created": int(time.time()),
        "data": [
            {
                "url": image_url
            }
        ]
    })

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
