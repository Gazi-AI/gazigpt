# 🧠 GaziGPT: The Next-Gen Intelligent Agent System



> **GaziGPT**, Emir Özcan tarafından geliştirilen, karmaşık akıl yürütme (reasoning) yeteneklerine sahip, çok aşamalı bir yapay zeka asistanıdır. Standart chatbotların ötesine geçerek, **Tree of Thoughts**, **Chain of Verification** ve **Multi-Model Ensemble** gibi ileri düzey stratejileri kullanarak en doğru ve güvenilir yanıtları üretir.

---

## 🚀 Öne Çıkan Özellikler

| Özellik | Açıklama |
| :--- | :--- |
| **8 Aşamalı Pipeline** | Soru zenginleştirmeden doğrulamaya kadar uzanan devasa "Extended" akışı. |
| **UltraThink™ Motoru** | Yanıt vermeden önce derinlemesine analiz yapan iç ses (thinking) mekanizması. |
| **Semantik Hafıza** | Uzun süreli konuşmaları hatırlayan, kosinüs benzerliği tabanlı akıllı bellek. |
| **Gelişmiş Araç Seti** | Web araması, görsel üretimi|
| **OpenAI Uyumluluğu** | Mevcut tüm OpenAI SDK'ları ve uygulamalarıyla doğrudan API uyumluluğu. |
| **Premium UI/UX** | Gerçek zamanlı düşünme süreci görselleştirmesi ve modern, akıcı arayüz. |

---

## 🏗️ GaziGPT "Extended" Pipeline Nasıl Çalışır?

GaziGPT'nin en güçlü modu olan **Extended**, her mesaj için şu 8 kritik aşamadan geçer:

1.  **🧠 Meta-Prompting**: Kullanıcının sorusu analiz edilir ve daha net, detaylı bir forma dönüştürülür.
2.  **💾 Semantik Hafıza**: Geçmiş konuşmalardan ilgili bilgiler vektörel benzerlik ile geri çağrılır.
3.  **📚 Bağlam Özeti**: Uzun konuşma geçmişi, en önemli noktalar korunacak şekilde özetlenir.
4.  **🌳 Tree of Thoughts**: Problem, birden fazla perspektiften aynı anda (paralel) düşünülür.
5.  **🤖 Multi-Model Ensemble**: Farklı model yapılandırmalarıyla sıralı analizler yapılır.
6.  **⚡ Sentezleme**: Tüm perspektifler ve veriler birleştirilerek nihai, kusursuz cevap oluşturulur.
7.  **✅ Chain of Verification**: Üretilen cevap, mantıksal hatalara karşı son bir kez denetlenir.
8.  **💾 Hafıza Kaydı**: Yeni bilgiler bir sonraki etkileşim için yerel hafızaya güvenli bir şekilde kaydedilir.

---

## 📊 Benchmark Sonuçları

GaziGPT, akıl yürütme ve yanıt kalitesi testlerinde rakiplerine karşı üstün performans sergilemektedir. Aşağıda sistemin doğruluk ve hız performansını görebilirsiniz:

![GaziGPT Benchmark](gazigpt/gazigpt_benchmark.png)

---

## 🛠️ Araç Seti (Tools)

GaziGPT, dış dünya ile etkileşime girmek için zengin bir araç kütüphanesine sahiptir:

*   🎨 **Image Gen**: Flux tabanlı yüksek kaliteli görsel üretimi.
*   🔍 **Web Search**: Gerçek zamanlı internet araması ve veri sentezi.
*   💻 **Code Exec**: Karmaşık matematiksel ve mantıksal problemler için Python kodu yazma.
*   🖼️ **Vision**: Gelişmiş görsel analizi ve OCR (Florence-2).
*   💾 **Cloud Storage**: Puter.com entegrasyonu ile dosya okuma/yazma.
*   🗣️ **Voice (TTS)**: Doğal ve akıcı multilingual sesli yanıtlar (Edge-TTS).

---

## 💻 Teknik Kurulum

GaziGPT, Python tabanlı bir backend ve modern bir frontend ile çalışır.

### Gereksinimler
*   Python 3.10+
*   pip

### Kurulum Adımları
1.  Depoyu klonlayın:
    ```bash
    git clone https://github.com/emirozcn/gazigpt.git
    cd gazigpt
    ```
2.  Bağımlılıkları yükleyin:
    ```bash
    pip install -r gazigpt/requirements.txt
    ```
3.  Uygulamayı başlatın:
    ```bash
    python gazigpt/app.py
    ```

---

## 🔌 API Kullanımı (OpenAI Compatible)

GaziGPT'yi kendi projelerinize entegre etmek çok kolaydır.

**Base URL:** `http://localhost:5000/v1`  
**API Key:** `gazigpt`

```python
import openai

client = openai.OpenAI(
    base_url="http://localhost:5000/v1",
    api_key="gazigpt"
)

response = client.chat.completions.create(
    model="gazigpt-extended",
    messages=[{"role": "user", "content": "Kuantum bilgisayarları açıkla."}]
)

print(response.choices[0].message.content)
```

---

## 👨‍💻 Geliştirici

**Emir Özcan** - [GitHub](https://github.com/emirozcn)  
**Gazi AI Team**

---

> *"GaziGPT bir cevap makinesi değil, bir düşünce ortağıdır."*
