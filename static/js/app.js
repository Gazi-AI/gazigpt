/**
 * GaziGPT - Ana JavaScript
 * Tüm sohbet verisi tarayıcı localStorage'da tutulur.
 */

// ─── STATE ───────────────────────────────────
const state = {
    currentChatId: null,
    isLoading: false,
    deleteTargetId: null,
    attachedFile: null,   // { name, content }
    abortController: null, // streaming iptal için
};

// ─── STORAGE HELPERS ─────────────────────────
const STORAGE_KEY = 'gazigpt_chats';
const SETTINGS_KEY = 'gazigpt_settings';

function loadChatsFromStorage() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch { return {}; }
}
function saveChatsToStorage(chats) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}
function loadSettings() {
    try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch { return {}; }
}
function saveSettingsToStorage(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// ─── DOM HELPERS ─────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const DOM = {
    sidebar: $('#sidebar'),
    chatList: $('#chatList'),
    chatMessages: $('#chatMessages'),
    emptyState: $('#emptyState'),
    messageInput: $('#messageInput'),
    sendBtn: $('#sendBtn'),
    stopBtn: $('#stopBtn'),
    charCount: $('#charCount'),
    newChatBtn: $('#newChatBtn'),
    toggleSidebar: $('#toggleSidebar'),
    searchChats: $('#searchChats'),
    attachBtn: $('#attachBtn'),
    fileInput: $('#fileInput'),
    filePreview: $('#filePreview'),
    filePreviewName: $('#filePreviewName'),
    filePreviewRemove: $('#filePreviewRemove'),
    // Modals
    deleteModal: $('#deleteModal'),
    confirmDelete: $('#confirmDelete'),
    cancelDelete: $('#cancelDelete'),
    settingsModal: $('#settingsModal'),
    settingsBtn: $('#settingsBtn'),
    closeSettings: $('#closeSettings'),
    saveSettingsBtn: $('#saveSettingsBtn'),
    settingsFontSize: $('#settingsFontSize'),
    fontSizeValue: $('#fontSizeValue'),
    settingsEnterSend: $('#settingsEnterSend'),
    clearAllChatsBtn: $('#clearAllChatsBtn'),
    closeSidebar: $('#closeSidebar'),
    sidebarOverlay: $('#sidebarOverlay'),
};

// ─── INIT ────────────────────────────────────
let logoSrc = ''; // agent.py'deki LOGO değişkeninden gelir

document.addEventListener('DOMContentLoaded', () => {
    renderChatList();
    applySettings();
    setupEventListeners();
    loadLogo();
});

async function loadLogo() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        if (data.logo) {
            logoSrc = data.logo;
            applyLogoToEmptyState();
        }
    } catch (e) { /* logo yoksa varsayılan SVG kalır */ }
}

function applyLogoToEmptyState() {
    if (!logoSrc) return;
    const logoIcon = document.querySelector('.logo-icon');
    if (logoIcon) {
        logoIcon.innerHTML = `<img src="${logoSrc}" alt="GaziGPT" style="width:64px;height:64px;border-radius:14px;object-fit:cover;">`;
        logoIcon.style.background = 'transparent';
        logoIcon.style.border = 'none';
    }
}

// ─── CHAT LIST ───────────────────────────────
function getChatsSorted(filter = '') {
    const all = loadChatsFromStorage();
    let list = Object.values(all);
    if (filter) list = list.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()));
    list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    return list;
}

function renderChatList(filter = '') {
    const chats = getChatsSorted(filter);

    if (!chats.length) {
        DOM.chatList.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.82rem;">${filter ? 'Sonuç bulunamadı' : 'Henüz sohbet yok'}</div>`;
        return;
    }

    DOM.chatList.innerHTML = chats.map(c => `
        <div class="chat-item ${c.id === state.currentChatId ? 'active' : ''}" data-id="${c.id}" onclick="selectChat('${c.id}')">
            <div class="chat-item-icon">💬</div>
            <div class="chat-item-info">
                <div class="chat-item-title">${escapeHtml(c.title)}</div>
                <div class="chat-item-date">${formatDate(c.updated_at)}</div>
            </div>
            <button class="chat-item-delete" onclick="event.stopPropagation();showDeleteModal('${c.id}')" title="Sil">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        </div>
    `).join('');
}

// ─── CHAT CRUD (localStorage) ────────────────
function createChat() {
    state.currentChatId = null;
    showEmptyState();
    DOM.messageInput.focus();
}

function selectChat(chatId) {
    state.currentChatId = chatId;
    const all = loadChatsFromStorage();
    const chat = all[chatId];
    if (chat) {
        renderChatList();
        showChatView(chat.messages);
    }
    DOM.sidebar.classList.remove('open');
    DOM.sidebarOverlay.classList.remove('open');
}

function deleteChat(chatId) {
    const all = loadChatsFromStorage();
    delete all[chatId];
    saveChatsToStorage(all);
    if (state.currentChatId === chatId) {
        state.currentChatId = null;
        showEmptyState();
    }
    renderChatList();
    showToast('Sohbet silindi', 'success');
}

function clearAllChats() {
    localStorage.removeItem(STORAGE_KEY);
    state.currentChatId = null;
    showEmptyState();
    renderChatList();
    showToast('Tüm sohbetler silindi', 'success');
}

// ─── VIEWS ───────────────────────────────────
function showChatView(messages) {
    DOM.emptyState.style.display = 'none';
    DOM.chatMessages.style.display = 'flex';
    DOM.chatMessages.style.flexDirection = 'column';
    DOM.chatMessages.innerHTML = '';
    messages.forEach(m => {
        if (!m.is_system) appendMessage(m.role, m.content, m.timestamp, false);
    });
    scrollToBottom();
    DOM.messageInput.focus();
}

function showEmptyState() {
    DOM.emptyState.style.display = 'flex';
    DOM.chatMessages.style.display = 'none';
    state.currentChatId = null;
    renderChatList();
    applyLogoToEmptyState();
}

// ─── SEND MESSAGE (STREAMING) ────────────────
async function sendMessage() {
    const message = DOM.messageInput.value.trim();
    if (!message || state.isLoading) return;

    state.isLoading = true;
    state.abortController = new AbortController();
    DOM.sendBtn.style.display = 'none';
    DOM.stopBtn.style.display = 'flex';
    DOM.messageInput.value = '';
    DOM.messageInput.style.height = 'auto';
    updateCharCount();

    // İlk mesajsa chat oluştur
    if (!state.currentChatId) {
        const id = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const chat = {
            id,
            title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
            messages: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        const all = loadChatsFromStorage();
        all[id] = chat;
        saveChatsToStorage(all);
        state.currentChatId = id;
    }

    // Boş state'den çık
    if (DOM.emptyState.style.display !== 'none') {
        DOM.emptyState.style.display = 'none';
        DOM.chatMessages.style.display = 'flex';
        DOM.chatMessages.style.flexDirection = 'column';
        DOM.chatMessages.innerHTML = '';
    }

    // Kullanıcı mesajını göster ve kaydet
    const ts = new Date().toISOString();
    appendMessage('user', message, ts);

    const all = loadChatsFromStorage();
    const chat = all[state.currentChatId];
    if (!chat) { state.isLoading = false; DOM.sendBtn.disabled = false; return; }

    chat.messages.push({ role: 'user', content: message, timestamp: ts });
    if (chat.messages.length === 1) {
        chat.title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
    }

    // Dosya eki
    const attachedFile = state.attachedFile;
    let fileContent = '';
    let imageAnalyzed = false;
    clearFileAttachment();

    // Eğer görsel eklenmişse önce analiz et
    if (attachedFile && attachedFile.isImage) {
        appendMessage('assistant', '🔍 Görsel analiz ediliyor (Florence-2)...', undefined, true);
        try {
            const analyzeRes = await fetch('/api/analyze-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_data: attachedFile.content, filename: attachedFile.name }),
            });
            const analyzeData = await analyzeRes.json();
            if (analyzeData.success) {
                fileContent = `\n\n--- Eklenen Gorsel Analizi (Florence-2) ---\n${analyzeData.description}\n--- Gorsel Analizi Sonu ---`;
                imageAnalyzed = true;
            } else {
                fileContent = `\n\n--- Gorsel analizi basarisiz: ${analyzeData.error || 'Bilinmeyen hata'} ---`;
            }
        } catch (err) {
            fileContent = `\n\n--- Gorsel analizi baglanti hatasi: ${err.message} ---`;
        }
        // Analiz mesajını kaldır
        const lastMsg = DOM.chatMessages.querySelector('.message-assistant:last-child');
        if (lastMsg && lastMsg.textContent.includes('Görsel analiz ediliyor')) {
            lastMsg.remove();
        }
    } else if (attachedFile) {
        fileContent = attachedFile.content;
    }

    // Typing göster
    showTypingIndicator();

    let fullText = '';
    const ats = new Date().toISOString();

    try {
        const res = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: chat.messages.filter(m => !m.is_system).map(m => ({ role: m.role, content: m.content })),
                message: message,
                file_content: fileContent,
                image_ratio: document.getElementById('imageRatio')?.value || '1:1',
            }),
            signal: state.abortController.signal,
        });

        if (!res.ok) {
            hideTypingIndicator();
            appendMessage('assistant', `❌ Sunucu hatası (${res.status}). Lütfen tekrar deneyin.`);
            state.isLoading = false;
            state.abortController = null;
            DOM.stopBtn.style.display = 'none';
            DOM.sendBtn.style.display = 'flex';
            return;
        }

        hideTypingIndicator();

        // Streaming mesaj kutusu oluştur
        let msgDiv = createStreamingMessage(ats);
        let bodyEl = msgDiv.querySelector('.message-body');
        let finalText = '';  // Son kaydedilecek metin
        let suffixHTML = ''; // Badge'ler burada tutulacak
        let prefixHTML = ''; // Görsel burada tutulacak

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) { console.log('[DEBUG] Stream done, fullText length:', fullText.length); break; }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const ev = JSON.parse(line.slice(6));
                    console.log('[DEBUG] SSE event:', ev.type, ev.type === 'chunk' ? ev.content?.substring(0,50) : '');

                    if (ev.type === 'chunk') {
                        fullText += ev.content;
                        bodyEl.innerHTML = prefixHTML + renderMarkdown(fullText) + suffixHTML;
                        bodyEl.querySelectorAll('pre code').forEach(b => {
                            if (!b.dataset.highlighted) {
                                hljs.highlightElement(b);
                                b.dataset.highlighted = 'true';
                            }
                        });
                        scrollToBottom();

                    } else if (ev.type === 'tool_start') {
                        const toolCount = ev.count || 1;
                        const tools = ev.tools || [];
                        
                        if (tools.includes('generate_image')) {
                            bodyEl.innerHTML = `
                                <div class="image-generating-box">
                                    <div class="image-gen-shimmer"></div>
                                    <div class="image-gen-content">
                                        <div class="image-gen-spinner"></div>
                                        <div class="image-gen-text">🎨 Görsel Üretiliyor...</div>
                                        <div class="image-gen-hint">Lütfen Bekleyin (Yaklaşık 10-20 saniye)</div>
                                    </div>
                                </div>
                            `;
                        } else {
                            bodyEl.innerHTML = `
                                <div class="tool-status" style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(99,102,241,0.08);border-radius:12px;margin:4px 0;">
                                    <div class="tool-spinner" style="width:20px;height:20px;border:2.5px solid rgba(99,102,241,0.2);border-top-color:rgb(99,102,241);border-radius:50%;animation:tool-spin 0.8s linear infinite;"></div>
                                    <span style="color:var(--text-secondary);font-size:0.9rem;">🔧 ${toolCount} araç çalıştırılıyor...</span>
                                </div>
                            `;
                        }
                        scrollToBottom();

                    } else if (ev.type === 'tool_done') {
                        // Tool bitti, ikinci stream başlayacak
                        const toolNames = ev.tools || [];
                        const toolResults = ev.results || [];
                        const toolBadges = toolNames.map(t => `<span style="background:rgba(99,102,241,0.1);color:rgb(129,140,248);padding:3px 10px;border-radius:6px;font-size:0.75rem;font-weight:500;border:1px solid rgba(99,102,241,0.2);">${t}</span>`).join(' ');
                        
                        // Görsel varsa prefix olarak ekle (kaybolmaması için)
                        prefixHTML = '';
                        for (const tr of toolResults) {
                            if (tr.image_url) {
                                prefixHTML += `<div class="generated-image-container">
<img src="${tr.image_url}" alt="Generated Image" loading="eager">
<div class="generated-image-actions">
<a href="${tr.image_url}" target="_blank" class="btn-fullscreen">🔍 Tam Ekran</a>
<a href="${tr.image_url}" download="gorsel.jpg" class="btn-download">💾 İndir</a>
</div>
</div>\n\n`;
                            }
                        }
                        
                        fullText = '';
                        suffixHTML = `<hr style="border-color:rgba(255,255,255,0.05);margin:16px 0 12px 0;">
<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
<span style="font-size:0.8rem;color:rgba(255,255,255,0.5);display:flex;align-items:center;gap:4px;"><span style="color:#10b981;">✅</span> Araçlar tamamlandı:</span>
${toolBadges}
</div>\n\n`;
                        
                        bodyEl.innerHTML = prefixHTML + suffixHTML + '<span class="stream-cursor">▊</span>';
                        scrollToBottom();

                    } else if (ev.type === 'error') {
                        bodyEl.innerHTML = `<div style="color:#ef4444;">❌ Hata: ${ev.message || 'Bilinmeyen hata'}</div>`;
                        scrollToBottom();

                    } else if (ev.type === 'done') {
                        // Stream cursor'u temizle
                        const cursor = bodyEl.querySelector('.stream-cursor');
                        if (cursor) cursor.remove();

                        // Son metni kaydet (Görsel ve Badge'leri dahil et)
                        finalText = (prefixHTML ? prefixHTML + "\n\n" : "") + fullText + (suffixHTML ? "\n\n" + suffixHTML : "");

                        // Kod bloklarına copy button ekle
                        bodyEl.querySelectorAll('pre').forEach(pre => {
                            if (!pre.querySelector('.code-header')) {
                                const code = pre.querySelector('code');
                                const lang = code?.className?.match(/language-(\w+)/)?.[1] || 'code';
                                const header = document.createElement('div');
                                header.className = 'code-header';
                                header.innerHTML = `<span>${lang}</span><button class="copy-btn" onclick="copyCode(this)">📋 Kopyala</button>`;
                                pre.insertBefore(header, pre.firstChild);
                            }
                        });
                    }
                } catch (e) { /* skip malformed SSE line */ }
            }
        }

        // Mesajı kaydet
        if (finalText || fullText) {
            chat.messages.push({ role: 'assistant', content: finalText || fullText, timestamp: ats });
        }

        // Son güvenlik: cursor kaldıysa temizle
        const leftoverCursor = bodyEl.querySelector('.stream-cursor');
        if (leftoverCursor) leftoverCursor.remove();

    } catch (err) {
        hideTypingIndicator();
        if (err.name === 'AbortError') {
            // Kullanıcı durdurdu — o ana kadar gelen metni kaydet
            if (fullText || prefixHTML || suffixHTML) {
                const partialText = (prefixHTML ? prefixHTML + "\n\n" : "") + fullText + (suffixHTML ? "\n\n" + suffixHTML : "");
                chat.messages.push({ role: 'assistant', content: partialText, timestamp: ats });
            }
            // Cursor temizle
            const cursorEl = document.querySelector('.message-assistant:last-child .stream-cursor');
            if (cursorEl) cursorEl.remove();
            showToast('Yanıt durduruldu', 'success');
        } else {
            appendMessage('assistant', '❌ Bağlantı hatası: ' + err.message);
        }
    }

    chat.updated_at = new Date().toISOString();
    all[state.currentChatId] = chat;
    saveChatsToStorage(all);
    renderChatList();

    state.isLoading = false;
    state.abortController = null;
    DOM.stopBtn.style.display = 'none';
    DOM.sendBtn.style.display = 'flex';
    DOM.messageInput.focus();
}

/** Streaming yanıtı durdur */
function stopGeneration() {
    if (state.abortController) {
        state.abortController.abort();
    }
}

/** Streaming için boş assistant mesaj kutusu */
function createStreamingMessage(timestamp) {
    const time = formatTime(timestamp);
    const div = document.createElement('div');
    div.className = 'message message-assistant';
    div.innerHTML = `
        <div class="message-header">
            <div class="message-avatar">${getAssistantAvatar()}</div>
            <span class="message-sender">GaziGPT</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-body"><span class="stream-cursor">▊</span></div>
    `;
    DOM.chatMessages.appendChild(div);
    fixAvatarBg(div);
    scrollToBottom();
    return div;
}

/** Logo varsa img (arkas\u0131 transparent), yoksa emoji d\u00f6ner */
function getAssistantAvatar() {
    if (logoSrc) return `<img src="${logoSrc}" alt="GaziGPT" style="width:36px;height:36px;border-radius:8px;object-fit:cover;">`;
    return '✨';
}

/** Mesaj avatarlarında logo varsa arka planı kaldır */
function fixAvatarBg(el) {
    if (!logoSrc) return;
    const avatar = el.querySelector('.message-avatar');
    if (avatar) { avatar.style.background = 'transparent'; }
}

// ─── MESSAGE RENDERING ──────────────────────
function appendMessage(role, content, timestamp, scroll = true) {
    const isUser = role === 'user';
    const time = timestamp ? formatTime(timestamp) : formatTime(new Date().toISOString());
    const rendered = isUser ? escapeHtml(content) : renderMarkdown(content);

    const div = document.createElement('div');
    div.className = `message message-${role}`;
    div.innerHTML = `
        <div class="message-header">
            <div class="message-avatar">${isUser ? '👤' : getAssistantAvatar()}</div>
            <span class="message-sender">${isUser ? 'Sen' : 'GaziGPT'}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-body">${rendered}</div>
    `;
    DOM.chatMessages.appendChild(div);
    if (!isUser) fixAvatarBg(div);

    // Highlight code
    div.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));

    // Copy buttons
    div.querySelectorAll('pre').forEach(pre => {
        if (!pre.querySelector('.code-header')) {
            const code = pre.querySelector('code');
            const lang = code?.className?.match(/language-(\w+)/)?.[1] || 'code';
            const header = document.createElement('div');
            header.className = 'code-header';
            header.innerHTML = `<span>${lang}</span><button class="copy-btn" onclick="copyCode(this)">📋 Kopyala</button>`;
            pre.insertBefore(header, pre.firstChild);
        }
    });

    if (scroll) scrollToBottom();
}

// ─── TYPING INDICATOR (message style) ───────
function showTypingIndicator() {
    const el = document.createElement('div');
    el.className = 'typing-message';
    el.id = 'typingIndicator';
    el.innerHTML = `
        <div class="message-header">
            <div class="message-avatar">${getAssistantAvatar()}</div>
            <span class="message-sender">GaziGPT</span>
            <span class="message-time">düşünüyor...</span>
        </div>
        <div class="typing-dots">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    DOM.chatMessages.appendChild(el);
    scrollToBottom();
}
function hideTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
}

// ─── FILE ATTACHMENT ─────────────────────────
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

function isImageFile(filename) {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return IMAGE_EXTENSIONS.includes(ext);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const isImage = isImageFile(file.name);

    if (isImage) {
        // Görsel dosya — max 10MB
        if (file.size > 10_000_000) {
            showToast('Gorsel dosya cok buyuk (maks 10MB)', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64Data = ev.target.result; // data:image/...;base64,...
            state.attachedFile = { name: file.name, content: base64Data, isImage: true };
            DOM.filePreviewName.textContent = `🖼️ ${file.name}`;
            DOM.filePreview.style.display = 'flex';
            // Önizleme göster
            const previewImg = document.getElementById('filePreviewImage');
            const previewThumb = document.getElementById('filePreviewThumb');
            if (previewImg && previewThumb) {
                previewThumb.src = base64Data;
                previewImg.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
    } else {
        // Metin dosya — max 500KB
        if (file.size > 500_000) {
            showToast('Dosya cok buyuk (maks 500KB)', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            state.attachedFile = { name: file.name, content: ev.target.result, isImage: false };
            DOM.filePreviewName.textContent = `📎 ${file.name}`;
            DOM.filePreview.style.display = 'flex';
            // Önizleme gizle
            const previewImg = document.getElementById('filePreviewImage');
            if (previewImg) previewImg.style.display = 'none';
        };
        reader.readAsText(file);
    }
    DOM.fileInput.value = ''; // reset
}

function clearFileAttachment() {
    state.attachedFile = null;
    DOM.filePreview.style.display = 'none';
    DOM.filePreviewName.textContent = '';
    const previewImg = document.getElementById('filePreviewImage');
    if (previewImg) previewImg.style.display = 'none';
}

// ─── DELETE MODAL ────────────────────────────
function showDeleteModal(chatId) {
    state.deleteTargetId = chatId;
    DOM.deleteModal.classList.add('show');
}
function hideDeleteModal() {
    DOM.deleteModal.classList.remove('show');
    state.deleteTargetId = null;
}
function confirmDeleteChat() {
    if (state.deleteTargetId) deleteChat(state.deleteTargetId);
    hideDeleteModal();
}

// ─── SETTINGS MODAL ─────────────────────────
function showSettingsModal() {
    const s = loadSettings();
    DOM.settingsFontSize.value = s.font_size || 14;
    DOM.fontSizeValue.textContent = s.font_size || 14;
    DOM.settingsEnterSend.checked = s.send_with_enter !== false;
    DOM.settingsModal.classList.add('show');
}
function hideSettingsModal() { DOM.settingsModal.classList.remove('show'); }

function saveSettings() {
    const s = {
        font_size: parseInt(DOM.settingsFontSize.value),
        send_with_enter: DOM.settingsEnterSend.checked,
    };
    saveSettingsToStorage(s);
    applySettings();
    showToast('Ayarlar kaydedildi', 'success');
    hideSettingsModal();
}

function applySettings() {
    const s = loadSettings();
    document.documentElement.style.setProperty('--font-size-base', `${s.font_size || 14}px`);
}

// ─── HELPERS ─────────────────────────────────
function openSidebar() {
    DOM.sidebar.classList.add('open');
    DOM.sidebarOverlay.classList.add('open');
}
function closeSidebar() {
    DOM.sidebar.classList.remove('open');
    DOM.sidebarOverlay.classList.remove('open');
}

function scrollToBottom() { DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight; }

function renderMarkdown(text) {
    if (!text) return '';
    marked.setOptions({
        breaks: true, gfm: true,
        highlight: (code, lang) => {
            if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
            return hljs.highlightAuto(code).value;
        },
    });
    return marked.parse(text);
}

function formatDate(d) {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 60000) return 'Az önce';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} dk önce`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} saat önce`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} gün önce`;
    return new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}
function formatTime(d) {
    return new Date(d).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML.replace(/\n/g, '<br>');
}
function copyCode(btn) {
    const code = btn.closest('pre').querySelector('code');
    navigator.clipboard.writeText(code.textContent).then(() => {
        btn.textContent = '✅ Kopyalandı!';
        setTimeout(() => btn.textContent = '📋 Kopyala', 2000);
    });
}
function setQuickPrompt(text) {
    DOM.messageInput.value = text;
    DOM.messageInput.focus();
    updateCharCount();
    autoResize();
}
function updateCharCount() { DOM.charCount.textContent = DOM.messageInput.value.length; }
function autoResize() {
    DOM.messageInput.style.height = 'auto';
    DOM.messageInput.style.height = Math.min(DOM.messageInput.scrollHeight, 200) + 'px';
}

function showToast(msg, type = 'success') {
    let c = document.querySelector('.toast-container');
    if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span><span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ─── EVENT LISTENERS ─────────────────────────
function setupEventListeners() {
    DOM.newChatBtn.addEventListener('click', createChat);
    DOM.sendBtn.addEventListener('click', sendMessage);
    DOM.stopBtn.addEventListener('click', stopGeneration);

    DOM.messageInput.addEventListener('input', () => { updateCharCount(); autoResize(); });
    DOM.messageInput.addEventListener('keydown', (e) => {
        const s = loadSettings();
        if (e.key === 'Enter' && !e.shiftKey && s.send_with_enter !== false) {
            e.preventDefault();
            sendMessage();
        }
    });

    DOM.searchChats.addEventListener('input', (e) => renderChatList(e.target.value));
    DOM.toggleSidebar.addEventListener('click', () => openSidebar());
    DOM.closeSidebar.addEventListener('click', () => closeSidebar());
    DOM.sidebarOverlay.addEventListener('click', () => closeSidebar());

    // File
    DOM.attachBtn.addEventListener('click', () => DOM.fileInput.click());
    DOM.fileInput.addEventListener('change', handleFileSelect);
    DOM.filePreviewRemove.addEventListener('click', clearFileAttachment);

    // Clipboard paste — görsel yapıştırma
    DOM.messageInput.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (ev) => {
                    const base64Data = ev.target.result;
                    state.attachedFile = { name: 'yapistirilan-gorsel.png', content: base64Data, isImage: true };
                    DOM.filePreviewName.textContent = '🖼️ Yapıştırılan Görsel';
                    DOM.filePreview.style.display = 'flex';
                    const previewImg = document.getElementById('filePreviewImage');
                    const previewThumb = document.getElementById('filePreviewThumb');
                    if (previewImg && previewThumb) {
                        previewThumb.src = base64Data;
                        previewImg.style.display = 'block';
                    }
                    showToast('Gorsel yapistirild!', 'success');
                };
                reader.readAsDataURL(file);
                break; // sadece ilk görseli al
            }
        }
    });

    // Delete modal
    DOM.confirmDelete.addEventListener('click', confirmDeleteChat);
    DOM.cancelDelete.addEventListener('click', hideDeleteModal);
    DOM.deleteModal.addEventListener('click', (e) => { if (e.target === DOM.deleteModal) hideDeleteModal(); });

    // Settings
    DOM.settingsBtn.addEventListener('click', showSettingsModal);
    DOM.closeSettings.addEventListener('click', hideSettingsModal);
    DOM.settingsModal.addEventListener('click', (e) => { if (e.target === DOM.settingsModal) hideSettingsModal(); });
    DOM.saveSettingsBtn.addEventListener('click', saveSettings);
    DOM.settingsFontSize.addEventListener('input', (e) => { DOM.fontSizeValue.textContent = e.target.value; });
    DOM.clearAllChatsBtn.addEventListener('click', () => {
        if (confirm('Tüm sohbetler silinecek. Emin misiniz?')) clearAllChats();
    });

    // Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'n') { e.preventDefault(); createChat(); }
        if (e.key === 'Escape') { hideDeleteModal(); hideSettingsModal(); closeSidebar(); }
    });
}
