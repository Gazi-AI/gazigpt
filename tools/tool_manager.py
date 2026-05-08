"""
Tool Manager - Tüm araçları yöneten merkezi sistem.
Claude benzeri tool calling altyapısı.
"""

import importlib
import os
import json
import traceback

class ToolManager:
    """Tüm araçları kaydeden, yöneten ve çalıştıran merkez."""
    
    def __init__(self):
        self.tools = {}
        self._load_all_tools()
    
    def _load_all_tools(self):
        """tools/ klasöründeki tüm araçları otomatik yükle."""
        tools_dir = os.path.dirname(os.path.abspath(__file__))
        
        for filename in os.listdir(tools_dir):
            if filename.endswith('.py') and filename not in ('__init__.py', 'tool_manager.py'):
                module_name = filename[:-3]
                try:
                    module = importlib.import_module(f'tools.{module_name}')
                    if hasattr(module, 'TOOL_DEFINITION') and hasattr(module, 'execute'):
                        tool_def = module.TOOL_DEFINITION
                        self.tools[tool_def['name']] = {
                            'definition': tool_def,
                            'execute': module.execute
                        }
                        print(f"  [OK] Tool yuklendi: {tool_def['name']}")
                except Exception as e:
                    print(f"  [ERROR] Tool yuklenemedi ({module_name}): {e}")
    
    def get_all_definitions(self):
        """Tüm tool tanımlarını döndür (AI'a gönderilecek format)."""
        return [t['definition'] for t in self.tools.values()]
    
    def get_tool_names(self):
        """Tüm tool isimlerini döndür."""
        return list(self.tools.keys())
    
    def get_tool_info(self):
        """Tüm tool'ların bilgilerini UI için döndür."""
        info = []
        for name, tool in self.tools.items():
            info.append({
                'name': name,
                'description': tool['definition'].get('description', ''),
                'emoji': tool['definition'].get('emoji', '🔧'),
                'parameters': tool['definition'].get('parameters', {})
            })
        return info
    
    def execute_tool(self, tool_name, parameters=None):
        """Belirtilen aracı çalıştır."""
        if tool_name not in self.tools:
            return {
                'success': False,
                'error': f"'{tool_name}' adında bir araç bulunamadı.",
                'available_tools': self.get_tool_names()
            }
        
        try:
            result = self.tools[tool_name]['execute'](parameters or {})
            return {
                'success': True,
                'tool': tool_name,
                'result': result
            }
        except Exception as e:
            return {
                'success': False,
                'tool': tool_name,
                'error': str(e),
                'traceback': traceback.format_exc()
            }
    
    def build_system_prompt(self):
        """AI'a gönderilecek tool bilgilerini içeren system prompt."""
        tools_info = []
        for name, tool in self.tools.items():
            t = tool['definition']
            tools_info.append(
                f"- **{t.get('emoji', '🔧')} {name}**: {t['description']}"
            )
        
        tools_text = "\n".join(tools_info)
        
        return f"""Sen GaziGPT adlı yapay zeka asistanısın. Kullanıcılara yardımcı olmak için çeşitli araçlara sahipsin.

Kullanılabilir araçlar:
{tools_text}

### 🛠️ ARAÇ KULLANIM PROTOKOLÜ:
1. DİKKAT: Sistemde yerleşik "Function Calling" veya "Tool Calling" API'si DEVRE DIŞIDIR! Araçları SADECE düz metin olarak, aşağıdaki kod bloğu formatında yazarak çağırabilirsin. Asla yerleşik tool/function çağrısı yapmaya çalışma.
2. Eğer bir görev için araç kullanman gerekiyorsa, yanıtın şu şekilde olmalıdır:
   - Kısa bir bilgilendirme cümlesi
   - Ardından hemen araç çağrısı blok(ları).
3. Araç çağrısı formatı (sadece düz metin olarak):
```gazi_tool
{{"tool": "araç_adı", "params": {{"parametre": "değer"}}}}
```
4. Düşünme (iç ses) aşaması bittikten sonra, mutlaka bu gazi_tool formatındaki araç çağrısını düz metin olarak yanıtına ekle. Yanıtını asla boş bırakma!
5. Araç sonucunu aldıktan sonra, kullanıcıya nihai cevabı sun.

Önemli kurallar:
- Birden fazla araç kullanabilirsin.
- Türkçe yanıt ver.
- Eğer bir araç hatası olursa kullanıcıya açıkla."""
