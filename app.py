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
        return jsonify({"error": str(e)}), 500


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
    long_term_memory = data.get("long_term_memory", [])
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
        backend_model = "extended"  # Özel pipeline kullanılacak
        system_prompt_ext = (
            "Senin adın GaziGPT Extended. Sen en gelişmiş, en akıllı yapay zeka modelisin. "
            "Cevaplarını verirken:\n"
            "1. Soruyu birden fazla perspektiften analiz et\n"
            "2. Mantık zincirini adım adım kur\n"
            "3. Olası hataları kontrol et\n"
            "4. En doğru ve kapsamlı cevabı oluştur\n"
            "5. Türkçe, akıcı ve profesyonel yanıt ver\n"
            "Düşünce sürecin API tarafından yönetilmektedir, yanıtında kendin <think> veya </think> etiketleri KULLANMA."
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
            # ── GaziGPT Extended: Çok aşamalı akıllı pipeline ──
            if backend_model == "extended":
                phase_labels = {
                    "meta_prompt": "🧠 Soru zenginleştiriliyor...",
                    "semantic_memory": "💾 Uzun süreli hafıza taranıyor...",
                    "memory": "📚 Bağlam analiz ediliyor...",
                    "thinking": "🌳 Çoklu perspektiflerden düşünülüyor...",
                    "ensemble": "🤖 Çoklu analiz doğrulanıyor...",
                    "synthesis": "⚡ Sentez oluşturuluyor...",
                    "verification": "✅ Doğrulama yapılıyor...",
                }
                
                verification_text = ""  # Son cevap, doğrulama için
                used_fallback = False
                
                for event_type, event_data in agent.extended_pipeline_stream(messages, system_prompt=prompt, memory_list=long_term_memory):
                    if event_type == "phase":
                        label = phase_labels.get(event_data, f"⏳ {event_data}...")
                        yield f"data: {_json.dumps({'type': 'extended_phase', 'phase': event_data, 'label': label}, ensure_ascii=False)}\n\n"
                    
                    elif event_type == "ping":
                        # Send a valid data event to ensure the SSE buffer flushes and connection stays alive
                        yield f"data: {_json.dumps({'type': 'ping'})}\n\n"
                    
                    elif event_type == "chunk":
                        if "pollinations" in event_data.lower():
                            continue
                        full_text += event_data
                        verification_text += event_data
                        chunk_count += 1
                        yield f"data: {_json.dumps({'type': 'chunk', 'content': event_data}, ensure_ascii=False)}\n\n"
                    
                    elif event_type == "fallback":
                        used_fallback = True
                        # Pipeline başarısız — normal stream'e geç
                        for chunk in agent.call_llm_stream(messages, system_prompt=prompt, model_override="openai"):
                            if "pollinations" in chunk.lower():
                                continue
                            full_text += chunk
                            chunk_count += 1
                            yield f"data: {_json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"
                    
                    elif event_type == "done":
                        # Chain of Verification (Aşama 5)
                        # Optimizasyon: Sentezleme aşaması zaten çok güçlü olduğu için, 10 saniyelik gecikmeyi 
                        # önlemek adına son doğrulama çağrısı kaldırıldı.
                        pass
                
                # Extended pipeline bitti — tool check yap
                # (aşağıdaki normal tool check akışına düşecek)
                
            else:
                # ── Normal model akışı (GaziGPT ve Thinking) ──
                for chunk in agent.call_llm_stream(messages, system_prompt=prompt, model_override=backend_model):
                    if "pollinations" in chunk.lower():
                        continue
                    full_text += chunk
                    chunk_count += 1
                    yield f"data: {_json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"

            print(f"[DEBUG] Stream bitti: {chunk_count} chunk, {len(full_text)} karakter")
            if full_text[:200]:
                try:
                    print(f"[DEBUG] Ilk 200 karakter: {full_text[:200]}")
                except UnicodeEncodeError:
                    print("[DEBUG] Ilk 200 karakter (Yazdirilamayan karakterler iceriyor)")

            # Stream bitti — tool call var mı kontrol et
            tool_matches = agent.extract_tool_calls(full_text)
            print(f"[DEBUG] Tool matches: {len(tool_matches)}")

            # ── FALLBACK: Thinking model düşüncede tool planladı ama content boş kaldıysa ──
            if not tool_matches:
                import re as _re
                # Düşünme içeriğini ve asıl content'i ayır
                think_match = _re.search(r'<think>([\s\S]*?)</think>', full_text, _re.IGNORECASE)
                content_only = _re.sub(r'<think>[\s\S]*?</think>', '', full_text, flags=_re.IGNORECASE).strip()
                
                if think_match and len(content_only) < 20:
                    think_text = think_match.group(1).lower()
                    registered_tools = list(agent.tool_manager.tools.keys())
                    
                    for tool_name in registered_tools:
                        if tool_name in think_text:
                            print(f"[DEBUG] FALLBACK: Thinking model '{tool_name}' aracini planlamis ama content bos. Otomatik calistiriliyor...")
                            
                            # generate_image için özel işlem
                            if tool_name == "generate_image":
                                # Kullanıcının mesajından İngilizce prompt üret
                                eng_prompt = ""
                                
                                # Öncelik 1: Modelin düşünce sürecinden İngilizce anahtar kelimeleri çıkar
                                try:
                                    import re as _re2
                                    think_content = _re.search(r'<think>([\s\S]*?)</think>', full_text, _re.IGNORECASE)
                                    if think_content:
                                        t = think_content.group(1)
                                        # Düşüncede "want a X image/picture" veya "X image" kalıbını ara
                                        patterns = [
                                            r'(?:description|prompt)[:\s]+["\']([^"\']{5,})["\']',
                                            r'(?:want|need|generate|produce|create)\s+(?:a|an)\s+(.+?)(?:\.|,|image|picture|photo)',
                                            r'(?:they want|user wants?)\s+(?:a|an)\s+(.+?)(?:\.|,|image|picture)',
                                        ]
                                        for pattern in patterns:
                                            match = _re2.search(pattern, t, _re2.IGNORECASE)
                                            if match:
                                                candidate = match.group(1).strip().strip('"').strip("'")
                                                if len(candidate) >= 3 and not any(c in candidate for c in "çşğüöıÇŞĞÜÖİ"):
                                                    # "cat" → "a cute cat, digital art, high quality"
                                                    eng_prompt = f"{candidate}, digital art, highly detailed, beautiful lighting, 8K"
                                                    print(f"[DEBUG] Dusunceden prompt: {eng_prompt[:80]}")
                                                    break
                                except Exception:
                                    pass
                                
                                # Öncelik 2: Kullanıcının Türkçe mesajından anahtar kelimeyi çıkar ve basit çeviri yap
                                if not eng_prompt or len(eng_prompt) < 10:
                                    # Türkçe çizim/üretim fiillerini kaldır, kalan kısım konuyu verir
                                    clean_msg = user_message.lower()
                                    for remove_word in ["bana", "bir", "resim", "resmi", "çiz", "çizer", "misin", "lütfen",
                                                        "görsel", "oluştur", "üret", "yap", "fotoğraf", "tablo", "en", 
                                                        "olsun", "şirin", "tatlı", "güzel", "harika", "muhteşem"]:
                                        clean_msg = clean_msg.replace(remove_word, "")
                                    clean_msg = " ".join(clean_msg.split()).strip()
                                    
                                    if clean_msg and len(clean_msg) >= 2:
                                        eng_prompt = f"{clean_msg}, digital art, highly detailed, beautiful composition, 8K quality"
                                    else:
                                        eng_prompt = "a beautiful artistic digital illustration, vibrant colors, 8K"
                                
                                # Pollinations reklamlarını temizle
                                for bad in ["pollinations", "http://", "https://", "Pollinations"]:
                                    eng_prompt = eng_prompt.replace(bad, "")
                                eng_prompt = eng_prompt.strip().strip('"').strip("'")
                                if len(eng_prompt) < 10:
                                    eng_prompt = "a beautiful artistic digital illustration"
                                
                                try:
                                    print(f"[DEBUG] FALLBACK gorsel promptu: {eng_prompt[:100]}")
                                except UnicodeEncodeError:
                                    pass
                                
                                # Synthetic tool call oluştur
                                synthetic_tool_json = _json.dumps({"tool": "generate_image", "params": {"prompt": eng_prompt, "ratio": image_ratio}})
                                tool_matches = [synthetic_tool_json]
                            else:
                                # Diğer tool'lar için basit fallback
                                synthetic_tool_json = _json.dumps({"tool": tool_name, "params": {}})
                                tool_matches = [synthetic_tool_json]
                            break

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

                # Eğer synthetic tool call ise, doğrudan çalıştır
                tool_results = []
                for m in tool_matches:
                    try:
                        parsed = _json.loads(m)
                        if isinstance(parsed, dict) and "tool" in parsed:
                            result = agent.tool_manager.execute_tool(parsed["tool"], parsed.get("params", {}))
                            tool_results.append({"tool": parsed["tool"], "params": parsed.get("params", {}), "result": result})
                    except:
                        pass
                
                # Normal tool extraction fallback
                if not tool_results:
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

                # Tool sonuçlarını kullanıcıya sun
                # İkinci LLM çağrısı yerine doğrudan cevap oluştur (thinking model boş content sorunu)
                has_image = any("generate_image" in tr.get("tool", "") for tr in tool_results)
                
                if has_image:
                    # Görsel üretildiyse, basit bir onay mesajı gönder
                    img_result = next((tr for tr in tool_results if tr["tool"] == "generate_image"), None)
                    if img_result:
                        img_prompt = img_result.get("params", {}).get("prompt", "")
                        confirm_msg = f"Görseliniz başarıyla oluşturuldu! 🎨"
                        if img_prompt:
                            confirm_msg += f"\n\n**Kullanılan prompt:** {img_prompt}"
                        
                        # Chunk chunk gönder (frontend'in alışık olduğu format)
                        for word in confirm_msg.split(" "):
                            yield f"data: {_json.dumps({'type': 'chunk', 'content': word + ' '}, ensure_ascii=False)}\n\n"
                else:
                    # Diğer tool'lar için basit bir 'openai' (non-thinking) model ile özet yap
                    msgs2 = messages.copy()
                    
                    import re
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

                    # Non-thinking model kullan (openai, openai-fast değil)
                    for chunk in agent.call_llm_stream(msgs2, system_prompt=prompt, model_override="openai"):
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

# ═══════════════════════════════════════════════════════════════
#  OpenAI UYUMLU API  — /v1/chat/completions
# ═══════════════════════════════════════════════════════════════

# API anahtarı çevre değişkeninden alınır, yoksa varsayılan 'gazigpt' kullanılır.
GAZIGPT_API_KEY = os.environ.get("GAZIGPT_API_KEY", "gazigpt")

# Model haritası: API model adı → (backend_model, system_prompt_ekleri)
API_MODELS = {
    "gazigpt": {
        "backend": "openai",
        "description": "GaziGPT Standart — Dengeli hız ve kalite",
        "system_ext": "",
    },
    "gazigpt-fast": {
        "backend": "openai-fast",
        "description": "GaziGPT Fast — En hızlı yanıt",
        "system_ext": "",
    },
    "gazigpt-thinking": {
        "backend": "openai-fast",
        "description": "GaziGPT Thinking — Derin düşünme + analiz",
        "system_ext": (
            "Senin çok güçlü bir analitik 'İç Ses' (Düşünce) yeteneğin var. "
            "Kullanıcıya asıl cevabı vermeden önce her zaman içinden detaylıca düşün, durumu analiz et ve plan yap. "
            "Düşünce sürecin API tarafından otomatik ayrıştırılmaktadır, bu yüzden yanıtında kendin asla <think> veya </think> gibi etiketler KULLANMA. "
            "Sadece içinden özgürce düşün, ardından kullanıcıya doğrudan ve doğal bir şekilde asıl cevabını ver."
            "\nKİMLİK KURALI: Sen Emir Özcan tarafından geliştirilmiş GaziGPT'sin. Başka bir kimlik asla belirtme."
        ),
    },
    "gazigpt-extended": {
        "backend": "extended",
        "description": "GaziGPT Extended — 8 aşamalı akıllı pipeline",
        "system_ext": (
            "Senin adın GaziGPT Extended. Sen en gelişmiş, en akıllı yapay zeka modelisin. "
            "Cevaplarını verirken:\n"
            "1. Soruyu birden fazla perspektiften analiz et\n"
            "2. Mantık zincirini adım adım kur\n"
            "3. Olası hataları kontrol et\n"
            "4. En doğru ve kapsamlı cevabı oluştur\n"
            "5. Türkçe, akıcı ve profesyonel yanıt ver\n"
            "Düşünce sürecin API tarafından yönetilmektedir, yanıtında kendin <think> veya </think> etiketleri KULLANMA.\n"
            "KİMLİK KURALI: Sen Emir Özcan tarafından geliştirilmiş GaziGPT'sin. Başka bir kimlik asla belirtme."
        ),
    },
}


def _check_api_key():
    """Authorization header'dan Bearer token kontrolü."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return False
    token = auth[7:].strip()
    return token == GAZIGPT_API_KEY


@app.route("/v1/models", methods=["GET"])
def api_v1_models():
    """OpenAI uyumlu /v1/models — Kullanılabilir modelleri listeler."""
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
    """OpenAI uyumlu /v1/chat/completions endpoint'i.
    
    Desteklenen modeller: gazigpt, gazigpt-fast, gazigpt-thinking, gazigpt-extended
    API Key: Bearer gazigpt
    Streaming: stream=true/false
    """
    # ── API Key kontrolü ──
    if not _check_api_key():
        return jsonify({"error": {"message": "Invalid API key. Use 'Authorization: Bearer gazigpt'", "type": "invalid_request_error", "code": "invalid_api_key"}}), 401

    data = request.json or {}
    model_id = data.get("model", "gazigpt").lower().strip()
    messages = data.get("messages", [])
    stream = data.get("stream", False)
    long_term_memory = data.get("long_term_memory", [])
    temperature = data.get("temperature", None)
    max_tokens = data.get("max_tokens", None)

    # ── Model doğrulama ──
    if model_id not in API_MODELS:
        return jsonify({"error": {"message": f"Model '{model_id}' not found. Available: {', '.join(API_MODELS.keys())}", "type": "invalid_request_error", "code": "model_not_found"}}), 404

    if not messages:
        return jsonify({"error": {"message": "messages is required", "type": "invalid_request_error"}}), 400

    model_config = API_MODELS[model_id]
    backend_model = model_config["backend"]
    system_ext = model_config["system_ext"]

    # System prompt'u oluştur
    prompt = agent.build_system_prompt(system_ext)

    request_id = f"chatcmpl-{int(time.time()*1000)}"

    # ── STREAMING MODU ──
    if stream:
        def stream_openai():
            import json as _json

            if backend_model == "extended":
                # Extended pipeline
                for event_type, event_data in agent.extended_pipeline_stream(messages, system_prompt=prompt, memory_list=long_term_memory):
                    if event_type == "chunk":
                        chunk_obj = {
                            "id": request_id,
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": model_id,
                            "choices": [{"index": 0, "delta": {"content": event_data}, "finish_reason": None}],
                        }
                        yield f"data: {_json.dumps(chunk_obj, ensure_ascii=False)}\n\n"
                    elif event_type == "done":
                        done_obj = {
                            "id": request_id,
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": model_id,
                            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                        }
                        yield f"data: {_json.dumps(done_obj, ensure_ascii=False)}\n\n"
                        yield "data: [DONE]\n\n"
                    elif event_type == "fallback":
                        for chunk in agent.call_llm_stream(messages, system_prompt=prompt, model_override="openai"):
                            chunk_obj = {
                                "id": request_id,
                                "object": "chat.completion.chunk",
                                "created": int(time.time()),
                                "model": model_id,
                                "choices": [{"index": 0, "delta": {"content": chunk}, "finish_reason": None}],
                            }
                            yield f"data: {_json.dumps(chunk_obj, ensure_ascii=False)}\n\n"
                        done_obj = {
                            "id": request_id,
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": model_id,
                            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                        }
                        yield f"data: {_json.dumps(done_obj, ensure_ascii=False)}\n\n"
                        yield "data: [DONE]\n\n"
            else:
                # Normal model stream
                for chunk in agent.call_llm_stream(messages, system_prompt=prompt, model_override=backend_model):
                    chunk_obj = {
                        "id": request_id,
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": model_id,
                        "choices": [{"index": 0, "delta": {"content": chunk}, "finish_reason": None}],
                    }
                    yield f"data: {_json.dumps(chunk_obj, ensure_ascii=False)}\n\n"

                done_obj = {
                    "id": request_id,
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": model_id,
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                }
                yield f"data: {_json.dumps(done_obj, ensure_ascii=False)}\n\n"
                yield "data: [DONE]\n\n"

        return Response(
            stream_with_context(stream_openai()),
            content_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # ── NON-STREAMING MODU ──
    else:
        full_text = ""

        if backend_model == "extended":
            for event_type, event_data in agent.extended_pipeline_stream(messages, system_prompt=prompt, memory_list=long_term_memory):
                if event_type == "chunk":
                    full_text += event_data
                elif event_type == "fallback":
                    for chunk in agent.call_llm_stream(messages, system_prompt=prompt, model_override="openai"):
                        full_text += chunk
        else:
            for chunk in agent.call_llm_stream(messages, system_prompt=prompt, model_override=backend_model):
                full_text += chunk

        return jsonify({
            "id": request_id,
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model_id,
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
    """Logo ve konfigürasyon bilgilerini döndür."""
    return jsonify({"logo": LOGO})


# ─── BAŞLATMA ─────────────────────────────────────────────

def open_browser():
    time.sleep(1.5)
    webbrowser.open("http://localhost:5000")


if __name__ == "__main__":
    print("=" * 50)
    print("  GaziGPT - v2.0")
    print("  URL: https://gazigpt.onrender.com")
    print(f"  Aktif Araclar: {len(agent.tool_manager.tools)}")
    print("  Ctrl+C ile kapatin")
    print("=" * 50)

    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host="0.0.0.0", port=5000, debug=False)
