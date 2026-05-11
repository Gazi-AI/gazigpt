# 🧠 GaziGPT: The Next-Gen Intelligent Agent System

> **GaziGPT** is a multi-stage AI assistant with complex reasoning capabilities, developed by Emir Özcan. Going beyond standard chatbots, it produces the most accurate and reliable responses by using advanced strategies such as **Tree of Thoughts**, **Chain of Verification**, and **Multi-Model Ensemble**.

Built with passion by a 13-year-old independent developer. GaziGPT is a solo-driven effort to push the boundaries of autonomous AI.

---

## 🚀 Key Features

| Feature | Description |
| :--- | :--- |
| **8-Stage Pipeline** | A massive "Extended" workflow ranging from prompt enrichment to verification. |
| **UltraThink™ Engine** | An "inner voice" (thinking) mechanism that performs in-depth analysis before responding. |
| **Semantic Memory** | Smart cosine-similarity-based memory that remembers long-term conversations. |
| **Advanced Toolset** | Web search, image generation, vision analysis, and more. |
| **OpenAI Compatibility** | Direct API compatibility with all existing OpenAI SDKs and applications. |
| **Premium UI/UX** | Real-time visualization of the thinking process with a modern, fluid interface. |

---

## 🏗️ How the GaziGPT "Extended" Pipeline Works?

GaziGPT's most powerful mode, **Extended**, goes through 8 critical stages for every message:

1.  **🧠 Meta-Prompting**: The user's question is analyzed and transformed into a clearer, more detailed form.
2.  **💾 Semantic Memory**: Relevant information from past conversations is recalled using vector similarity.
3.  **📚 Context Summary**: Long conversation history is summarized while preserving the most important points.
4.  **🌳 Tree of Thoughts**: Problems are considered from multiple perspectives simultaneously (in parallel).
5.  **🤖 Multi-Model Ensemble**: Sequential analyses are performed with different model configurations.
6.  **⚡ Synthesis**: All perspectives and data are combined to create the final, flawless answer.
7.  **✅ Chain of Verification**: The generated response is checked one last time against logical errors.
8.  **💾 Memory Storage**: New information is securely saved to local memory for the next interaction.

---

## 📊 Benchmark Results

GaziGPT demonstrates superior performance against competitors in reasoning and response quality tests. Below you can see the accuracy and speed performance of the system:

![GaziGPT Benchmark](gazigpt/gazigpt_benchmark.png)

---

## 🛠️ Toolset

GaziGPT has a rich library of tools to interact with the outside world:

*   🎨 **Image Gen**: High-quality artistic image generation.
*   🔍 **Web Search**: Real-time internet search and data synthesis.
*   💻 **Code Exec**: Writing Python code for complex mathematical and logical problems.
*   🖼️ **Vision**: Advanced image analysis.
*   💾 **Memory Systems**: Secure storage for long-term context and conversation history.
*   🗣️ **Voice (TTS)**: Natural and fluent multilingual voice responses (Edge-TTS).

---

## 💻 Technical Setup

GaziGPT works with a Python-based backend and a modern frontend.

### Requirements
*   Python 3.10+
*   pip

### Installation Steps
1.  Clone the repository:
    ```bash
    git clone https://github.com/Gazi-AI/gazigpt
    cd gazigpt
    ```
2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
3.  Start the application:
    ```bash
    python app.py
    ```

---

## 🔌 API Usage (OpenAI Compatible)

Integrating GaziGPT into your own projects is very easy.

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
    messages=[{"role": "user", "content": "Explain quantum computers."}]
)

print(response.choices[0].message.content)
```

---

## 👨‍💻 Developer

**Emir Özcan** - [GitHub](https://github.com/Gazi-AI)

---

> *"GaziGPT is not an answer machine, it is a thought partner."*
