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
    selectedModel: 'GaziGPT', // Default model
    selectedEffort: 'no',
    contextLimits: {
        'GaziGPT': 128000,
        'GaziGPT Extended': 128000,
        'GaziGPT Hyper': 384000,
    },
    // Projects State
    projects: {},
    currentProjectId: null,
    activeProjectFile: 'index.html',
    projectTab: 'code',
    projectSearchQuery: '',
    projectFilter: 'all',
};

// ─── STORAGE HELPERS ─────────────────────────
const STORAGE_KEY = 'gazigpt_chats';
const SETTINGS_KEY = 'gazigpt_settings';
const PROJECTS_KEY = 'gazigpt_projects';

function loadChatsFromStorage() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch { return {}; }
}
function saveChatsToStorage(chats) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}
function loadProjectsFromStorage() {
    try {
        return JSON.parse(localStorage.getItem(PROJECTS_KEY)) || {};
    } catch { return {}; }
}
function saveProjectsToStorage(projects) {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
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
    contextMeter: $('#contextMeter'),
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
    settingsVoice: $('#settingsVoice'),
    clearAllChatsBtn: $('#clearAllChatsBtn'),
    closeSidebar: $('#closeSidebar'),
    sidebarOverlay: $('#sidebarOverlay'),

    // Projects Elements
    projectsDashboard: $('#projectsDashboard'),
    projectWorkspace: $('#projectWorkspace'),
    projectsSubmenu: $('#projectsSubmenu'),
    projectsArrow: $('#projectsArrow'),
    searchProjectsInput: $('#searchProjectsInput'),
    newProjectDashBtn: $('#newProjectDashBtn'),
    projectsDashContent: $('#projectsDashContent'),
    createProjectModal: $('#createProjectModal'),
    newProjectNameInput: $('#newProjectNameInput'),
    confirmCreateProjectBtn: $('#confirmCreateProjectBtn'),
    closeCreateProject: $('#closeCreateProject'),
    workspaceProjectName: $('#workspaceProjectName'),
    closeWorkspaceBtn: $('#closeWorkspaceBtn'),
    projectFileTree: $('#projectFileTree'),
    projectChatMessages: $('#projectChatMessages'),
    projectMessageInput: $('#projectMessageInput'),
    projectSendBtn: $('#projectSendBtn'),
    activeFileBadge: $('#activeFileBadge'),
    tabCodeBtn: $('#tabCodeBtn'),
    tabPreviewBtn: $('#tabPreviewBtn'),
    projectCodeContainer: $('#projectCodeContainer'),
    projectPreviewContainer: $('#projectPreviewContainer'),
    projectPreviewIframe: $('#projectPreviewIframe'),
    projectCodeBlock: $('#projectCodeBlock'),
};

// ─── INIT ────────────────────────────────────
let logoSrc = ''; // agent.py'deki LOGO değişkeninden gelir

document.addEventListener('DOMContentLoaded', () => {
    state.projects = loadProjectsFromStorage();
    renderChatList();
    renderProjectsSubmenu();
    applySettings();
    setupEventListeners();
    loadLogo();
    loadVoices();
    updateContextMeter();
});

async function loadLogo() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        if (data.logo) {
            logoSrc = data.logo;
            applyLogoToEmptyState();
        }
        if (data.context_limits) {
            state.contextLimits = { ...state.contextLimits, ...data.context_limits };
            updateContextMeter();
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
    updateContextMeter();
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
    updateContextMeter();
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
    updateContextMeter();
    showToast('Sohbet silindi', 'success');
}

function clearAllChats() {
    localStorage.removeItem(STORAGE_KEY);
    state.currentChatId = null;
    showEmptyState();
    renderChatList();
    updateContextMeter();
    showToast('Tüm sohbetler silindi', 'success');
}

// ─── VIEWS ───────────────────────────────────
function showChatView(messages) {
    if (DOM.projectsDashboard) DOM.projectsDashboard.style.display = 'none';
    if (DOM.projectWorkspace) DOM.projectWorkspace.style.display = 'none';
    const inputArea = $('#inputArea');
    if (inputArea) inputArea.style.display = 'flex';

    DOM.emptyState.style.display = 'none';
    DOM.chatMessages.style.display = 'flex';
    DOM.chatMessages.style.flexDirection = 'column';
    DOM.chatMessages.innerHTML = '';
    messages.forEach(m => {
        if (!m.is_system) appendMessage(m.role, m.content, m.timestamp, false);
    });
    scrollToBottom();
    updateContextMeter();
    DOM.messageInput.focus();
}

function showEmptyState() {
    if (DOM.projectsDashboard) DOM.projectsDashboard.style.display = 'none';
    if (DOM.projectWorkspace) DOM.projectWorkspace.style.display = 'none';
    const inputArea = $('#inputArea');
    if (inputArea) inputArea.style.display = 'flex';

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
    updateContextMeter();
    if (chat.messages.length === 1) {
        chat.title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
    }

    // Dosya eki
    const attachedFile = state.attachedFile;
    let fileContent = '';
    let imageAnalyzed = false;
    
    // Save image data and clear preview
    const rawImageData = attachedFile && attachedFile.isImage ? attachedFile.content : "";
    clearFileAttachment();

    // Eğer görsel eklenmişse önce analiz et (sadece GaziGPT Hyper değilse)
    if (attachedFile && attachedFile.isImage) {
        const isOllama120b = (state.selectedModel === 'GaziGPT Hyper');
        if (isOllama120b) {
            fileContent = '';
        } else {
            appendMessage('assistant', '🔍 Görsel analiz ediliyor...', undefined, true);
            try {
                const analyzeRes = await fetch('/api/analyze-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image_data: rawImageData, filename: attachedFile.name }),
                });
                const analyzeData = await analyzeRes.json();
                if (analyzeData.success) {
                    fileContent = `\n\n--- Eklenen Gorsel Analizi ---\n${analyzeData.description}\n--- Gorsel Analizi Sonu ---`;
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
        }
    } else if (attachedFile) {
        fileContent = attachedFile.content;
    }

    // Typing göster
    showTypingIndicator();

    let fullText = '';
    const ats = new Date().toISOString();
    
    // Uzun süreli hafızayı localStorage'dan al
    const longTermMemory = JSON.parse(localStorage.getItem('gazigpt_long_term_memory') || '[]');

    try {
        const res = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: chat.messages.filter(m => !m.is_system).map(m => ({ role: m.role, content: m.content })),
                message: message,
                file_content: fileContent,
                image_data: rawImageData,
                image_ratio: document.getElementById('imageRatio')?.value || '1:1',
                model: state.selectedModel,
                effort: state.selectedEffort,
                long_term_memory: longTermMemory,
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
        let hasError = false;

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
                    const dataStr = line.slice(6).trim();
                    if (!dataStr) continue;
                    const ev = JSON.parse(dataStr);

                    if (ev.type === 'chunk') {
                        const chunk = ev.content || '';
                        fullText += chunk;
                        bodyEl.innerHTML = (prefixHTML ? prefixHTML + "\n\n" : "") + renderMarkdown(formatThinkTags(fullText)) + (suffixHTML ? "\n\n" + suffixHTML : "") + '<span class="stream-cursor">▊</span>';
                        scrollToBottom();

                    } else if (ev.type === 'extended_phase') {
                        const phaseId = ev.phase || '';
                        const phaseLabel = ev.label || '⏳ İşleniyor...';
                        const phaseColors = {
                            meta_prompt: '#e879f9',
                            semantic_memory: '#a78bfa',
                            memory: '#8b5cf6',
                            thinking: '#f59e0b',
                            ensemble: '#06b6d4',
                            synthesis: '#10b981',
                            verification: '#22c55e',
                        };
                        const color = phaseColors[phaseId] || '#6366f1';
                        
                        // Önceki aktif aşamayı tamamlandı yap
                        const prevPhase = bodyEl.querySelector('.extended-phase-active');
                        if (prevPhase) {
                            prevPhase.classList.remove('extended-phase-active');
                            prevPhase.querySelector('.phase-spinner')?.remove();
                            const checkMark = document.createElement('span');
                            checkMark.style.cssText = 'color:#22c55e;margin-right:6px;';
                            checkMark.textContent = '✓ ';
                            prevPhase.prepend(checkMark);
                            prevPhase.style.opacity = '0.6';
                        }
                        
                        // synthesis aşamasında eski aşamaları temizle
                        if (phaseId === 'synthesis') {
                            bodyEl.querySelectorAll('.extended-phase-indicator').forEach(el => el.remove());
                        }
                        
                        // Yeni aşama göstergesi ekle (synthesis ve sonrası hariç)
                        if (phaseId !== 'synthesis' && phaseId !== 'verification') {
                            const phaseEl = document.createElement('div');
                            phaseEl.className = 'extended-phase-indicator extended-phase-active';
                            phaseEl.style.cssText = `
                                display:flex; align-items:center; gap:10px; padding:10px 16px;
                                background:${color}15; border-left:3px solid ${color};
                                border-radius:0 10px 10px 0; margin:4px 0; font-size:0.88rem;
                                color:${color}; animation:fadeIn 0.3s ease;
                            `;
                            phaseEl.innerHTML = `
                                <div class="phase-spinner" style="width:16px;height:16px;border:2px solid ${color}40;border-top-color:${color};border-radius:50%;animation:tool-spin 0.7s linear infinite;"></div>
                                <span>${phaseLabel}</span>
                            `;
                            bodyEl.appendChild(phaseEl);
                        }
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
                        } else if (tools.includes('generate_video')) {
                            bodyEl.innerHTML = `
                                <div class="video-generating-box">
                                    <div class="video-gen-shimmer"></div>
                                    <div class="video-gen-content">
                                        <div class="video-gen-spinner"></div>
                                        <div class="video-gen-text">🎬 Video Üretiliyor...</div>
                                        <div class="video-gen-hint">Kuyruğa katılım bekleniyor...</div>
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
                        const toolNames = ev.tools || [];
                        const toolResults = ev.results || [];
                        
                        let toolBadges = '';
                        toolNames.forEach(t => {
                            let icon = '🔧';
                            if (t === 'generate_image') icon = '🎨';
                            if (t === 'generate_video') icon = '🎬';
                            toolBadges += `<span class="tool-badge" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:20px;font-size:0.8rem;color:var(--text-secondary);">${icon} ${t}</span>`;
                        });

                        const imgRes = toolResults.find(r => r.tool === 'generate_image');
                        const vidRes = toolResults.find(r => r.tool === 'generate_video');

                        if (imgRes && imgRes.image_url && !vidRes) {
                            const proxyUrl = imgRes.image_url; 
                            const uid = 'img_' + Math.random().toString(36).substring(2, 9);
                            prefixHTML += `
<div class="generated-image-container">
    <div id="loader_${uid}" class="image-generating-box" style="margin:0; max-width:none; border:none; border-radius:0; border-bottom:1px solid rgba(255,255,255,0.06);">
        <div class="image-gen-shimmer"></div>
        <div class="image-gen-content">
            <div class="image-gen-spinner"></div>
            <div class="image-gen-text">🎨 Görsel Yükleniyor...</div>
        </div>
    </div>
    <img id="img_${uid}" src="${proxyUrl}" alt="Generated Image" loading="eager" style="display:none;" onload="document.getElementById('loader_${uid}').style.display='none'; this.style.display='block';">
    <div class="generated-image-actions">
        <button onclick="openImageLightbox(document.getElementById('img_${uid}').src)" class="btn-fullscreen">🔍 Tam Ekran</button>
        <button onclick="downloadImage(document.getElementById('img_${uid}').src, 'gorsel.png')" class="btn-download">💾 İndir</button>
    </div>
</div>\n\n`;
                        }

                        if (vidRes) {
                            const uid = 'vid_' + Math.random().toString(36).substring(2, 9);
                            prefixHTML += `
<div class="generated-video-container" id="container_${uid}">
    <div id="loader_${uid}" class="video-generating-box" style="margin:0; max-width:none; border:none; border-radius:0; border-bottom:1px solid rgba(255,255,255,0.06);">
        <div class="video-gen-shimmer"></div>
        <div class="video-gen-content">
            <div class="video-gen-spinner"></div>
            <div class="video-gen-text" id="status_text_${uid}">🎬 Video hazırlanıyor...</div>
            <div class="video-gen-hint" id="status_hint_${uid}">Bağlantı kuruluyor...</div>
        </div>
    </div>
</div>\n\n`;
                            // Start client-side polling asynchronously
                            setTimeout(() => {
                                startVideoGeneration(vidRes.params?.prompt || 'Make this image come alive', uid);
                            }, 50);
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
                        hasError = true;
                    }



                    // Son metni kaydet
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
                } catch (e) {
                    console.error('SSE line error:', e);
                }
            }
        }

        // Final clean render to remove cursor and format thoughts properly
        if (!hasError) {
            if (!fullText.trim()) {
                bodyEl.innerHTML = `<div style="color:var(--text-muted);font-style:italic;">⚠️ Model yanıt vermedi veya boş cevap döndü. Güvenlik filtrelerine takılmış veya bağlantı kesilmiş olabilir. Lütfen sorunuzu farklı kelimelerle yazmayı veya başka bir model seçmeyi deneyin.</div>`;
            } else {
                bodyEl.innerHTML = (prefixHTML ? prefixHTML + "\n\n" : "") + renderMarkdown(formatThinkTags(fullText)) + (suffixHTML ? "\n\n" + suffixHTML : "");
            }
        }

        // Mesajı kaydet
        if (!hasError && fullText.trim() && (finalText || fullText)) {
            chat.messages.push({ role: 'assistant', content: finalText || fullText, timestamp: ats });
            updateContextMeter();
            
            // Uzun süreli hafızaya kaydet
            if (state.selectedModel === 'GaziGPT Extended') {
                longTermMemory.push({ user: message, ai: finalText || fullText });
                if (longTermMemory.length > 50) {
                    longTermMemory.shift();
                }
                localStorage.setItem('gazigpt_long_term_memory', JSON.stringify(longTermMemory));
            }
            
            // Action bar'ı göster ve innerHTML'ini doldur
            const actionsDiv = msgDiv.querySelector('.message-actions');
            if (actionsDiv) {
                actionsDiv.style.display = 'flex';
                actionsDiv.innerHTML = `
                    <button class="action-btn" onclick="copyMessageText(this)" title="Kopyala">
                        <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <button class="action-btn" onclick="likeMessage(this)" title="Beğen">
                        <svg viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                    </button>
                    <button class="action-btn" onclick="dislikeMessage(this)" title="Beğenme">
                        <svg viewBox="0 0 24 24"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>
                    </button>
                    <button class="action-btn" onclick="shareMessage(this)" title="Paylaş">
                        <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                    </button>
                    <button class="action-btn" onclick="regenerateMessage(this)" title="Yeniden Oluştur">
                        <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                    </button>
                    <button class="action-btn" onclick="playTTSMessage(this)" title="Okuma (TTS)">
                        <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                    </button>
                `;
            }
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
                updateContextMeter();
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
    updateContextMeter();

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
        <div class="message-actions" style="display:none;"></div>
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
function formatThinkTags(text) {
    if (!text) return '';
    // Normalize alternative brackets to standard <think> tags
    let normalized = text
        .replace(/[\(\[\{]\s*think(?:ing)?\s*[\)\]\}]/gi, '<think>')
        .replace(/[\(\[\{]\s*\/\s*think(?:ing)?\s*[\)\]\}]/gi, '</think>');

    if (!/<\/?think>/i.test(normalized)) return text;
    
    let thoughts = [];
    let answerText = normalized;
    
    // 1. Kapanmış tüm <think>...</think> bloklarını çıkar
    let closedPattern = /<think>([\s\S]*?)<\/think>/gi;
    let m;
    let replacements = [];
    while ((m = closedPattern.exec(normalized)) !== null) {
        thoughts.push(m[1].trim());
        replacements.push(m[0]);
    }
    for (const r of replacements) {
        answerText = answerText.replace(r, '');
    }
    
    // 2. Kapanmamış son <think>... bloğu (stream devam ediyor olabilir)
    let unclosedMatch = answerText.match(/<think>([\s\S]*)$/i);
    let isStillThinking = false;
    if (unclosedMatch) {
        thoughts.push(unclosedMatch[1].trim());
        answerText = answerText.replace(unclosedMatch[0], '');
        isStillThinking = true;
    }
    
    // Artık kalan stray etiketleri temizle
    answerText = answerText.replace(/<\/?think>/gi, '').trim();
    
    // Boş düşünceleri filtrele
    thoughts = thoughts.filter(t => t.length > 0);
    if (thoughts.length === 0) return answerText;
    
    let thoughtsText = thoughts.join('\n\n');
    let openAttr = isStillThinking ? 'open' : '';
    
    return `\n\n<details class="thinking-box" ${openAttr}><summary class="thinking-header"><span class="think-icon">🧠</span> Düşünce Süreci</summary><div class="thinking-content">\n\n${thoughtsText}\n\n</div></details>\n\n${answerText}`;
}

function appendMessage(role, content, timestamp, scroll = true) {
    const isUser = role === 'user';
    const time = timestamp ? formatTime(timestamp) : formatTime(new Date().toISOString());
    let renderedContent = content;
    
    if (!isUser) {
        renderedContent = formatThinkTags(renderedContent);
    }
    
    const rendered = isUser ? escapeHtml(renderedContent) : renderMarkdown(renderedContent);

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
    if (!isUser) {
        div.innerHTML += `
        <div class="message-actions">
            <button class="action-btn" onclick="copyMessageText(this)" title="Kopyala">
                <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="action-btn" onclick="likeMessage(this)" title="Beğen">
                <svg viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
            </button>
            <button class="action-btn" onclick="dislikeMessage(this)" title="Beğenme">
                <svg viewBox="0 0 24 24"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>
            </button>
            <button class="action-btn" onclick="shareMessage(this)" title="Paylaş">
                <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            </button>
            <button class="action-btn" onclick="regenerateMessage(this)" title="Yeniden Oluştur">
                <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            </button>
            <button class="action-btn" onclick="playTTSMessage(this)" title="Okuma (TTS)">
                <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            </button>
        </div>`;
    }
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
    const inProject = !!state.currentProjectId;

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
            
            if (inProject) {
                const nameEl = document.getElementById('projectFilePreviewName');
                const previewEl = document.getElementById('projectFilePreview');
                const previewImg = document.getElementById('projectFilePreviewImage');
                const previewThumb = document.getElementById('projectFilePreviewThumb');
                if (nameEl) nameEl.textContent = `🖼️ ${file.name}`;
                if (previewEl) previewEl.style.display = 'flex';
                if (previewImg && previewThumb) {
                    previewThumb.src = base64Data;
                    previewImg.style.display = 'block';
                }
            } else {
                DOM.filePreviewName.textContent = `🖼️ ${file.name}`;
                DOM.filePreview.style.display = 'flex';
                const previewImg = document.getElementById('filePreviewImage');
                const previewThumb = document.getElementById('filePreviewThumb');
                if (previewImg && previewThumb) {
                    previewThumb.src = base64Data;
                    previewImg.style.display = 'block';
                }
            }
            updateContextMeter();
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
            
            if (inProject) {
                const nameEl = document.getElementById('projectFilePreviewName');
                const previewEl = document.getElementById('projectFilePreview');
                const previewImg = document.getElementById('projectFilePreviewImage');
                if (nameEl) nameEl.textContent = `📎 ${file.name}`;
                if (previewEl) previewEl.style.display = 'flex';
                if (previewImg) previewImg.style.display = 'none';
            } else {
                DOM.filePreviewName.textContent = `📎 ${file.name}`;
                DOM.filePreview.style.display = 'flex';
                const previewImg = document.getElementById('filePreviewImage');
                if (previewImg) previewImg.style.display = 'none';
            }
            updateContextMeter();
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
    
    // Clear project preview
    const projectPreviewEl = document.getElementById('projectFilePreview');
    const projectNameEl = document.getElementById('projectFilePreviewName');
    const projectPreviewImg = document.getElementById('projectFilePreviewImage');
    if (projectPreviewEl) projectPreviewEl.style.display = 'none';
    if (projectNameEl) projectNameEl.textContent = '';
    if (projectPreviewImg) projectPreviewImg.style.display = 'none';
    
    updateContextMeter();
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
    DOM.settingsVoice.value = s.voice || "en-US-AvaMultilingualNeural";
    DOM.settingsModal.classList.add('show');
}
function hideSettingsModal() { DOM.settingsModal.classList.remove('show'); }

function saveSettings() {
    const s = {
        font_size: parseInt(DOM.settingsFontSize.value),
        send_with_enter: DOM.settingsEnterSend.checked,
        voice: DOM.settingsVoice.value,
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
    updateContextMeter();
    autoResize();
}
function estimateTokens(text) {
    if (!text) return 0;
    return Math.max(1, Math.ceil(String(text).length / 4));
}
function getContextLimit(modelName = state.selectedModel) {
    return state.contextLimits[modelName] || state.contextLimits.GaziGPT || 128000;
}
function getCurrentContextTokens() {
    let total = 0;
    const all = loadChatsFromStorage();
    const chat = state.currentChatId ? all[state.currentChatId] : null;
    if (chat && Array.isArray(chat.messages)) {
        chat.messages.forEach(m => {
            if (!m.is_system && m.content) total += estimateTokens(m.content) + 4;
        });
    }
    const draft = DOM.messageInput?.value || '';
    if (draft.trim()) total += estimateTokens(draft) + 4;
    if (state.attachedFile?.content) total += estimateTokens(state.attachedFile.content) + 4;
    return total;
}
function updateContextMeter() {
    if (!DOM.contextMeter) return;
    const used = getCurrentContextTokens();
    const limit = getContextLimit();
    const pct = Math.max(0, Math.min(100, (used / limit) * 100));
    const tooltip = `${used}/${limit} token`;
    DOM.contextMeter.style.setProperty('--context-fill', pct.toFixed(1) + '%');
    DOM.contextMeter.title = tooltip;
    DOM.contextMeter.dataset.tooltip = tooltip;
    DOM.contextMeter.setAttribute('aria-label', `Bağlam kullanımı: ${tooltip}`);
}
function updateCharCount() {
    DOM.charCount.textContent = DOM.messageInput.value.length;
    updateContextMeter();
}
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

// ─── ACTION BUTTON HANDLERS ──────────────────────
function copyMessageText(btn) {
    const msgDiv = btn.closest('.message').querySelector('.message-body');
    let clone = msgDiv.cloneNode(true);
    clone.querySelectorAll('.thinking-box').forEach(b => b.remove());
    const text = clone.innerText.replace(/📋 Kopyala/g, '').trim();
    navigator.clipboard.writeText(text).then(() => {
        showToast('Mesaj kopyalandı', 'success');
        btn.classList.add('active');
        setTimeout(() => btn.classList.remove('active'), 2000);
    });
}
function likeMessage(btn) {
    btn.classList.toggle('active');
    const dislikeBtn = btn.parentElement.querySelector('button[title="Beğenme"]');
    if (dislikeBtn) dislikeBtn.classList.remove('active');
    if (btn.classList.contains('active')) showToast('Mesaj beğenildi', 'success');
}
function dislikeMessage(btn) {
    btn.classList.toggle('active');
    const likeBtn = btn.parentElement.querySelector('button[title="Beğen"]');
    if (likeBtn) likeBtn.classList.remove('active');
    if (btn.classList.contains('active')) showToast('Mesaj beğenilmedi', 'success');
}
function shareMessage(btn) {
    const msgDiv = btn.closest('.message').querySelector('.message-body');
    let clone = msgDiv.cloneNode(true);
    clone.querySelectorAll('.thinking-box').forEach(b => b.remove());
    const text = clone.innerText.replace(/📋 Kopyala/g, '').trim();
    
    if (navigator.share) {
        navigator.share({
            title: 'GaziGPT Yanıtı',
            text: text
        }).catch(err => console.log('Share error:', err));
    } else {
        copyMessageText(btn);
        showToast('Paylaşma desteklenmiyor. Mesaj kopyalandı.', 'success');
    }
}
function regenerateMessage(btn) {
    if (!state.currentChatId || state.isLoading) return;
    const all = loadChatsFromStorage();
    const chat = all[state.currentChatId];
    if (!chat || chat.messages.length < 2) return;
    
    // Son asistan mesajını ve varsa hatalı/yarım mesajı kaldır
    while (chat.messages.length > 0 && chat.messages[chat.messages.length - 1].role !== 'user') {
        chat.messages.pop();
    }
    saveChatsToStorage(all);
    showChatView(chat.messages);
    
    // Son kullanıcı mesajını bul
    const lastUserMsg = chat.messages[chat.messages.length - 1];
    if (lastUserMsg) {
        // Yeniden oluşturmak için input'a alıp göndermeye gerek yok, doğrudan backend'i tetikleyebiliriz
        // ama mevcut sendMessage mantığını kullanmak daha kolay:
        DOM.messageInput.value = lastUserMsg.content;
        chat.messages.pop(); // user mesajını da çıkarıp tekrar ekleteceğiz
        saveChatsToStorage(all);
        showChatView(chat.messages);
        sendMessage();
    }
}

let isPlayingTTS = false;
let currentAudio = null;
let currentTTSBtn = null;

const ttsPlayIcon = `<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
const ttsStopIcon = `<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"></rect></svg>`;

function playTTSMessage(btn) {
    if (isPlayingTTS && currentAudio) {
        currentAudio.pause();
        currentAudio = null;
        isPlayingTTS = false;
        if (currentTTSBtn) {
            currentTTSBtn.classList.remove('active');
            currentTTSBtn.innerHTML = ttsPlayIcon;
            currentTTSBtn = null;
        }
        return;
    }
    
    // Eğer başka bir mesaj okunuyorsa onu durdur ve ikonunu düzelt
    if (currentAudio) {
        currentAudio.pause();
        if (currentTTSBtn) {
            currentTTSBtn.classList.remove('active');
            currentTTSBtn.innerHTML = ttsPlayIcon;
        }
    }
    
    const msgDiv = btn.closest('.message').querySelector('.message-body');
    let clone = msgDiv.cloneNode(true);
    clone.querySelectorAll('.thinking-box').forEach(b => b.remove());
    const text = clone.innerText.replace(/📋 Kopyala/g, '').trim();
    if (!text) return;

    currentTTSBtn = btn;
    btn.classList.add('active');
    btn.innerHTML = ttsStopIcon;
    
    const s = loadSettings();
    const voice = s.voice || "en-US-AvaMultilingualNeural";
    const audioUrl = `/api/tts?text=${encodeURIComponent(text.substring(0, 5000))}&voice=${encodeURIComponent(voice)}`;
    
    currentAudio = document.getElementById('ttsAudio');
    currentAudio.src = audioUrl;
    currentAudio.play().then(() => {
        isPlayingTTS = true;
        currentAudio.onended = () => {
            isPlayingTTS = false;
            if (currentTTSBtn === btn) {
                btn.classList.remove('active');
                btn.innerHTML = ttsPlayIcon;
                currentTTSBtn = null;
            }
        };
    }).catch(err => {
        showToast('Ses oynatılamadı.', 'error');
        btn.classList.remove('active');
        btn.innerHTML = ttsPlayIcon;
        isPlayingTTS = false;
        currentTTSBtn = null;
    });
}

async function loadVoices() {
    try {
        const res = await fetch('/api/voices');
        const voices = await res.json();
        DOM.settingsVoice.innerHTML = '';
        voices.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.ShortName;
            opt.textContent = v.FriendlyName;
            DOM.settingsVoice.appendChild(opt);
        });
        const s = loadSettings();
        if (s.voice) DOM.settingsVoice.value = s.voice;
    } catch (e) {
        DOM.settingsVoice.innerHTML = '<option value="">Sesler yüklenemedi</option>';
    }
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
                    updateContextMeter();
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

    // Projects Listeners
    if (DOM.projectsArrow) {
        DOM.projectsArrow.addEventListener('click', (e) => {
            e.stopPropagation();
            const isClosed = DOM.projectsSubmenu.style.display === 'none';
            DOM.projectsSubmenu.style.display = isClosed ? 'flex' : 'none';
            DOM.projectsArrow.classList.toggle('open', isClosed);
        });
    }
    
    const projectsBtn = $('#navProjectsBtn');
    if (projectsBtn) {
        projectsBtn.addEventListener('click', (e) => {
            if (e.target.id === 'projectsArrow' || e.target.closest('#projectsArrow')) return;
            openProjectsDashboard();
        });
    }

    const searchChatsBtn = $('#navSearchChatsBtn');
    if (searchChatsBtn) {
        searchChatsBtn.addEventListener('click', () => {
            const container = $('#sidebarSearchContainer');
            if (container) {
                const isHidden = container.style.display === 'none';
                container.style.display = isHidden ? 'block' : 'none';
                if (isHidden) $('#searchChats')?.focus();
            }
        });
    }

    if (DOM.newProjectDashBtn) DOM.newProjectDashBtn.addEventListener('click', showCreateProjectModal);
    if (DOM.searchProjectsInput) DOM.searchProjectsInput.addEventListener('input', (e) => {
        state.projectSearchQuery = e.target.value;
        renderProjectsDashboard();
    });

    const filterTabs = $$('.filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.projectFilter = tab.dataset.filter;
            renderProjectsDashboard();
        });
    });

    if (DOM.closeCreateProject) DOM.closeCreateProject.addEventListener('click', hideCreateProjectModal);
    if (DOM.createProjectModal) DOM.createProjectModal.addEventListener('click', (e) => {
        if (e.target === DOM.createProjectModal) hideCreateProjectModal();
    });
    if (DOM.confirmCreateProjectBtn) DOM.confirmCreateProjectBtn.addEventListener('click', () => {
        const name = DOM.newProjectNameInput.value.trim();
        if (name) {
            createProject(name);
            hideCreateProjectModal();
        } else {
            showToast('Lütfen proje ismi girin', 'error');
        }
    });

    if (DOM.closeWorkspaceBtn) DOM.closeWorkspaceBtn.addEventListener('click', closeProjectWorkspace);
    if (DOM.tabCodeBtn) DOM.tabCodeBtn.addEventListener('click', () => switchProjectTab('code'));
    if (DOM.tabPreviewBtn) DOM.tabPreviewBtn.addEventListener('click', () => switchProjectTab('preview'));

    if (DOM.projectSendBtn) DOM.projectSendBtn.addEventListener('click', sendProjectMessage);
    if (DOM.projectMessageInput) {
        DOM.projectMessageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendProjectMessage();
            }
        });
    }

    const projectAttachBtn = document.getElementById('projectAttachBtn');
    if (projectAttachBtn) {
        projectAttachBtn.addEventListener('click', () => DOM.fileInput.click());
    }

    const projectFilePreviewRemove = document.getElementById('projectFilePreviewRemove');
    if (projectFilePreviewRemove) {
        projectFilePreviewRemove.addEventListener('click', clearFileAttachment);
    }
}

// ─── MODEL SELECTOR ───────────────────────────
function setupModelSelector() {
    const btn = document.getElementById('modelSelectorBtn');
    const dropdown = document.getElementById('modelDropdown');
    const options = document.querySelectorAll('.model-option');
    const currentName = document.getElementById('currentModelName');

    if(!btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });

    options.forEach(opt => {
        opt.addEventListener('click', () => {
            options.forEach(o => {
                o.classList.remove('active');
                o.querySelector('.model-check').innerHTML = '';
            });
            opt.classList.add('active');
            opt.querySelector('.model-check').innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            
            const modelName = opt.dataset.model;
            currentName.textContent = modelName;
            state.selectedModel = modelName;
            dropdown.classList.remove('show');
            updateContextMeter();

            const effortSelect = document.getElementById('effortSelect');
            if (effortSelect) {
                if (modelName === 'GaziGPT') {
                    effortSelect.value = 'no';
                    state.selectedEffort = 'no';
                    Array.from(effortSelect.options).forEach(opt => {
                        if (opt.value !== 'no') {
                            opt.disabled = true;
                            opt.title = 'GaziGPT için diğer seçenekler kapalıdır.';
                        }
                    });
                    effortSelect.title = 'GaziGPT için diğer seçenekler kapalıdır.';
                } else {
                    Array.from(effortSelect.options).forEach(opt => {
                        opt.disabled = false;
                        opt.title = '';
                    });
                    effortSelect.title = '';
                    if (state.selectedEffort === 'no') {
                        effortSelect.value = 'low';
                        state.selectedEffort = 'low';
                    }
                }
            }
            
            showToast(modelName + ' seçildi', 'success');
        });
    });

    const effortSelect = document.getElementById('effortSelect');
    if (effortSelect) {
        effortSelect.addEventListener('change', (e) => {
            state.selectedEffort = e.target.value;
        });
    }
}
document.addEventListener('DOMContentLoaded', setupModelSelector);

// ─── IMAGE LIGHTBOX (Tam Ekran Modal) ────────
function openImageLightbox(src) {
    let overlay = document.getElementById('imageLightboxOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'imageLightboxOverlay';
        overlay.style.cssText = `
            position:fixed; top:0; left:0; width:100vw; height:100vh;
            background:rgba(0,0,0,0.92); z-index:99999;
            display:flex; align-items:center; justify-content:center;
            cursor:zoom-out; opacity:0; transition:opacity 0.25s ease;
            backdrop-filter:blur(8px);
        `;
        overlay.innerHTML = `
            <button id="lightboxClose" style="
                position:absolute; top:20px; right:24px;
                background:rgba(255,255,255,0.12); border:none;
                color:#fff; font-size:28px; width:44px; height:44px;
                border-radius:50%; cursor:pointer; display:flex;
                align-items:center; justify-content:center;
                backdrop-filter:blur(4px); transition:background 0.2s;
            " onmouseover="this.style.background='rgba(255,255,255,0.25)'"
               onmouseout="this.style.background='rgba(255,255,255,0.12)'"
            >✕</button>
            <img id="lightboxImg" style="
                max-width:92vw; max-height:90vh;
                border-radius:12px; object-fit:contain;
                box-shadow:0 20px 60px rgba(0,0,0,0.6);
                transition:transform 0.3s ease;
            " alt="Görsel">
            <div style="
                position:absolute; bottom:24px; display:flex; gap:12px;
            ">
                <button onclick="downloadImage(document.getElementById('lightboxImg').src, 'gorsel.png')" style="
                    background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.15);
                    color:#fff; padding:10px 20px; border-radius:10px;
                    cursor:pointer; font-size:14px; backdrop-filter:blur(4px);
                    transition:background 0.2s;
                " onmouseover="this.style.background='rgba(255,255,255,0.25)'"
                   onmouseout="this.style.background='rgba(255,255,255,0.12)'"
                >💾 İndir</button>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // Kapatma eventleri
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.id === 'lightboxClose') {
                closeLightbox();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.style.display === 'flex') {
                closeLightbox();
            }
        });
    }
    
    const img = document.getElementById('lightboxImg');
    img.src = src;
    overlay.style.display = 'flex';
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });
}

function closeLightbox() {
    const overlay = document.getElementById('imageLightboxOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.style.display = 'none'; }, 250);
    }
}

// ─── IMAGE DOWNLOAD (URL gizli) ─────────────
async function downloadImage(src, filename) {
    try {
        const response = await fetch(src);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'gorsel.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Görsel indiriliyor...', 'success');
    } catch (err) {
        // Fallback: doğrudan aç
        window.open(src, '_blank');
    }
}

// ─── VIDEO GENERATION HELPERS ────────────────
async function startVideoGeneration(prompt, uid) {
    const statusText = document.getElementById('status_text_' + uid);
    const statusHint = document.getElementById('status_hint_' + uid);
    const container = document.getElementById('container_' + uid);

    try {
        // 1. Find the input image to animate
        let imageSrc = null;
        if (state.attachedFile && state.attachedFile.isImage) {
            imageSrc = state.attachedFile.content;
        } else {
            // Fallback: search DOM for the last generated image
            const lastImg = document.querySelector('.generated-image-container img');
            if (lastImg) {
                imageSrc = lastImg.src;
            }
        }

        if (!imageSrc) {
            if (statusText) statusText.textContent = '🎨 Başlangıç görseli oluşturuluyor...';
            if (statusHint) statusHint.textContent = 'Önce yapay zeka ile görsel çiziliyor...';
            const seed = Math.floor(Math.random() * 999999999) + 1;
            imageSrc = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&nologo=true&seed=${seed}&width=1024&height=1024`;
        }

        const spaces = [
            { id: 'lightricks-ltx-2-3', type: 'ltx' },
            { id: 'lightricks-ltx-video-fast', type: 'ltx' }
        ];

        let spaceIndex = 0;

        async function runGeneration() {
            if (spaceIndex >= spaces.length) {
                // FALLBACK: Perform browser-side canvas animation and compile to MP4/WebM using MediaRecorder
                if (statusText) statusText.textContent = '🎬 Sinematik video oluşturuluyor...';
                if (statusHint) statusHint.textContent = 'Tarayıcı tabanlı 3D Parallax render motoru devreye giriyor (ücretsiz)...';
                
                await generateClientSideVideo(imageSrc, container);
                return;
            }
            const currentSpace = spaces[spaceIndex];

            if (statusText) statusText.textContent = `📤 Görsel yükleniyor... (${spaceIndex + 1}/${spaces.length})`;
            if (statusHint) statusHint.textContent = `${currentSpace.id} sunucusuna görsel gönderiliyor...`;

            // 2. Upload to proxy
            const proxyRes = await fetch('/api/upload-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_data: imageSrc,
                    space: currentSpace.id,
                    filename: 'input_image.png'
                })
            });

            if (!proxyRes.ok) {
                console.warn(`Proxy upload failed for space ${currentSpace.id}, trying next space...`);
                spaceIndex++;
                return runGeneration();
            }

            const uploadData = await proxyRes.json();
            if (!uploadData || !uploadData[0]) {
                console.warn(`No server path returned for space ${currentSpace.id}, trying next space...`);
                spaceIndex++;
                return runGeneration();
            }
            const serverPath = uploadData[0];

            if (statusText) statusText.textContent = '⏳ Kuyruğa katılıyor...';
            if (statusHint) statusHint.textContent = `${currentSpace.id} video sırasına giriliyor...`;

            const sessionHash = Math.random().toString(36).substring(2, 13);
            const joinRes = await fetch(`https://${currentSpace.id}.hf.space/gradio_api/queue/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: [
                        { path: serverPath, orig_name: 'input_image.png', meta: { _type: "gradio.FileData" } },
                        prompt,
                        3.0,   // duration
                        false, // enhance prompt
                        10,    // seed
                        true,  // randomize seed
                        1024,  // height
                        1536   // width
                    ],
                    event_data: null,
                    fn_index: 2,
                    session_hash: sessionHash
                })
            });

            if (!joinRes.ok) {
                console.warn(`Queue join failed for space ${currentSpace.id}, trying next space...`);
                spaceIndex++;
                return runGeneration();
            }

            // Start listening to the SSE queue
            const eventSourceUrl = `https://${currentSpace.id}.hf.space/gradio_api/queue/data?session_hash=${sessionHash}`;
            const es = new EventSource(eventSourceUrl);

            const handleEvent = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.msg === 'estimation') {
                        const queuePosition = data.rank !== undefined ? data.rank : '?';
                        const eta = data.queue_eta ? Math.round(data.queue_eta) + ' sn' : 'bilinmiyor';
                        if (statusText) statusText.textContent = '⏳ Sırada bekleniyor...';
                        if (statusHint) statusHint.textContent = `Sıranız: ${queuePosition} | Sunucu: ${currentSpace.id} | Süre: ${eta}`;
                    } else if (data.msg === 'process_starts') {
                        if (statusText) statusText.textContent = '🎬 Video üretiliyor...';
                        if (statusHint) statusHint.textContent = 'Yapay zeka kareleri çiziyor (3-10 saniye)...';
                    } else if (data.msg === 'process_completed') {
                        es.close();
                        if (data.success && data.output && data.output.data && data.output.data[0]) {
                            const videoData = data.output.data[0];
                            const videoUrl = videoData.video ? videoData.video.path : (videoData.path || videoData);
                            const fullVideoUrl = videoUrl.startsWith('http') ? videoUrl : `https://${currentSpace.id}.hf.space/file=${videoUrl}`;
                            
                            renderFinishedVideo(container, fullVideoUrl);
                        } else {
                            throw new Error(data.output?.error || 'Video üretimi tamamlanamadı.');
                        }
                    } else if (data.msg === 'process_failed' || data.msg === 'queue_full') {
                        es.close();
                        throw new Error(data.message || 'HuggingFace kuyruk hatası veya kota sınırı.');
                    }
                } catch (err) {
                    es.close();
                    console.warn(`Space ${currentSpace.id} execution failed:`, err.message, `, trying next space...`);
                    spaceIndex++;
                    runGeneration().catch(fallbackErr => {
                        console.error('Fallback error:', fallbackErr);
                    });
                }
            };

            const gradioEvents = ['estimation', 'process_starts', 'process_completed', 'process_failed', 'queue_full', 'message'];
            gradioEvents.forEach(evt => {
                es.addEventListener(evt, handleEvent);
            });

            es.onerror = (err) => {
                es.close();
                console.warn(`EventSource connection failed for space ${currentSpace.id}, trying next space...`);
                spaceIndex++;
                runGeneration().catch(fallbackErr => {
                    console.error('Fallback error:', fallbackErr);
                });
            };
        }

        await runGeneration();

    } catch (err) {
        console.error(err);
        if (statusText) statusText.textContent = '🎬 Sinematik video oluşturuluyor...';
        if (statusHint) statusHint.textContent = 'Tarayıcı tabanlı 3D Parallax render motoru devreye giriyor (ücretsiz)...';
        await generateClientSideVideo(imageSrc, container);
    }
}

// Global store for the last generated video blob so download works reliably
let _lastVideoBlob = null;

async function generateClientSideVideo(imageSrc, container) {
    return new Promise(async (resolve) => {
        // First, convert the image to a local data URL to avoid CORS tainting
        let safeImageSrc = imageSrc;
        try {
            safeImageSrc = await loadImageAsDataURL(imageSrc);
        } catch (e) {
            console.warn('Could not convert image to data URL, using original:', e);
        }

        const img = new Image();
        // Don't set crossOrigin when src is already a data URL
        if (!safeImageSrc.startsWith('data:')) {
            img.crossOrigin = 'anonymous';
        }
        img.src = safeImageSrc;
        img.onload = () => {
            // Create target canvas
            const canvas = document.createElement('canvas');
            canvas.width = 720;
            canvas.height = 720;
            const ctx = canvas.getContext('2d');

            // Draw initial frame immediately so the recorder starts with a valid frame
            drawImageCover(ctx, img, canvas.width, canvas.height);

            // Set up recording using MediaRecorder
            let stream;
            try {
                stream = canvas.captureStream(30); // 30 fps
            } catch (e) {
                stream = null;
            }

            const chunks = [];
            let recorder = null;
            if (stream) {
                const mimeTypes = [
                    'video/webm;codecs=vp9',
                    'video/webm;codecs=vp8',
                    'video/webm',
                    'video/mp4'
                ];
                for (const mime of mimeTypes) {
                    try {
                        if (MediaRecorder.isTypeSupported(mime)) {
                            recorder = new MediaRecorder(stream, { mimeType: mime });
                            break;
                        }
                    } catch (e) { /* try next */ }
                }
            }

            if (recorder) {
                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) chunks.push(e.data);
                };
                recorder.onstop = () => {
                    const mimeType = recorder.mimeType || 'video/webm';
                    const blob = new Blob(chunks, { type: mimeType });
                    _lastVideoBlob = blob;
                    const videoUrl = URL.createObjectURL(blob);
                    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
                    renderFinishedVideo(container, videoUrl, ext);
                    resolve();
                };
                // Use timeslice to get data chunks every 200ms for a more complete file
                recorder.start(200);
            }

            // Animation variables (sinematik pan-zoom & parallax & light sway)
            const duration = 4000; // 4 seconds video
            const startTime = performance.now();

            function drawFrame(now) {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);

                if (progress >= 1) {
                    // Draw the final frame
                    renderAnimationFrame(ctx, img, canvas, 1.0);
                    if (recorder && recorder.state === 'recording') {
                        // Small delay to ensure the last frame is captured
                        setTimeout(() => recorder.stop(), 100);
                    } else {
                        // No recording support fallback
                        canvas.toBlob((blob) => {
                            if (blob) {
                                _lastVideoBlob = blob;
                                const url = URL.createObjectURL(blob);
                                renderFinishedVideo(container, url, 'webp');
                            }
                            resolve();
                        }, 'image/webp');
                    }
                    return;
                }

                renderAnimationFrame(ctx, img, canvas, progress);
                requestAnimationFrame(drawFrame);
            }

            requestAnimationFrame(drawFrame);
        };
        img.onerror = () => {
            // Simple canvas error fallback
            const canvas = document.createElement('canvas');
            canvas.width = 500;
            canvas.height = 500;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#1e1e2e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ef4444';
            ctx.font = '20px sans-serif';
            ctx.fillText('Gorsel yuklenemedi', 150, 250);
            renderFinishedVideo(container, canvas.toDataURL(), 'png');
            resolve();
        };
    });
}

// Convert any image URL to a data URL to bypass CORS when drawing on canvas
async function loadImageAsDataURL(src) {
    // If it's already a data URL, return as-is
    if (src.startsWith('data:')) return src;
    
    // Try 1: Direct fetch with CORS
    try {
        const response = await fetch(src, { mode: 'cors' });
        if (response.ok) {
            const blob = await response.blob();
            if (blob.size > 0) {
                return await blobToDataURL(blob);
            }
        }
    } catch (e) {
        console.warn('Direct CORS fetch failed, trying server proxy...', e.message);
    }

    // Try 2: Use our server-side image proxy to bypass CORS
    try {
        const proxyUrl = '/api/image-proxy?url=' + encodeURIComponent(src);
        const proxyRes = await fetch(proxyUrl);
        if (proxyRes.ok) {
            const blob = await proxyRes.blob();
            if (blob.size > 0) {
                return await blobToDataURL(blob);
            }
        }
    } catch (e) {
        console.warn('Server proxy also failed:', e.message);
    }

    // Try 3: Load image via hidden img tag (no crossOrigin) and draw to canvas
    // This works for images that load in <img> but not via fetch
    try {
        return await loadImageViaImgTag(src);
    } catch (e) {
        console.warn('Img tag fallback also failed:', e.message);
    }

    throw new Error('All image loading methods failed for: ' + src);
}

function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Fallback: load image without CORS via <img> tag, draw to canvas to get data URL
// Note: This creates a tainted canvas but we extract the data URL before that matters
function loadImageViaImgTag(src) {
    return new Promise((resolve, reject) => {
        const tempImg = new Image();
        // Do NOT set crossOrigin - allows loading cross-origin images that don't support CORS
        tempImg.onload = () => {
            try {
                const c = document.createElement('canvas');
                c.width = tempImg.naturalWidth || tempImg.width;
                c.height = tempImg.naturalHeight || tempImg.height;
                const ctx2 = c.getContext('2d');
                ctx2.drawImage(tempImg, 0, 0);
                // This will throw if canvas is tainted
                const dataUrl = c.toDataURL('image/png');
                resolve(dataUrl);
            } catch (e) {
                reject(e);
            }
        };
        tempImg.onerror = () => reject(new Error('Image tag failed to load'));
        tempImg.src = src + (src.includes('?') ? '&' : '?') + '_t=' + Date.now();
    });
}

// Draw image covering the canvas (like CSS object-fit: cover)
function drawImageCover(ctx, img, cw, ch) {
    const iw = img.width;
    const ih = img.height;
    const scaleRatio = Math.max(cw / iw, ch / ih);
    const dw = iw * scaleRatio;
    const dh = ih * scaleRatio;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
}

// Render a single animation frame with Ken Burns effect
function renderAnimationFrame(ctx, img, canvas, progress) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Ken Burns: zoom 1.0 → 1.15, pan with sine wave
    const scale = 1.0 + progress * 0.15;
    const panX = Math.sin(progress * Math.PI) * 20;
    const panY = Math.cos(progress * Math.PI) * 10;

    ctx.save();
    ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
    ctx.scale(scale, scale);

    const iw = img.width;
    const ih = img.height;
    const scaleRatio = Math.max(canvas.width / iw, canvas.height / ih);
    const dw = iw * scaleRatio;
    const dh = ih * scaleRatio;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();

    // Cinematic ambient light flare
    const flareX = canvas.width * 0.2 + progress * 80;
    const flareY = canvas.height * 0.2 + progress * 40;
    const grad = ctx.createRadialGradient(flareX, flareY, 5, flareX, flareY, canvas.width * 0.5);
    grad.addColorStop(0, 'rgba(255, 235, 200, 0.15)');
    grad.addColorStop(0.5, 'rgba(255, 210, 180, 0.04)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

function renderFinishedVideo(container, videoUrl, ext) {
    ext = ext || 'webm';
    container.innerHTML = `
        <div class="video-header">Videonuz hazır!</div>
        <div class="video-wrapper" style="cursor:pointer; position:relative;">
            <video id="vid_player" src="${videoUrl}" loop playsinline muted style="width:100%; border-radius:12px; display:block;"></video>
            <button class="video-play-btn" onclick="event.stopPropagation(); togglePlay(this)">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <button class="video-download-btn" onclick="event.stopPropagation(); downloadVideoBlob('${ext}');" title="Videoyu İndir" style="
                position: absolute;
                top: 15px;
                right: 15px;
                background: rgba(0, 0, 0, 0.6);
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: #fff;
                width: 38px;
                height: 38px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 10;
                text-decoration: none;
                transition: background 0.2s, transform 0.1s;
            " onmouseover="this.style.background='rgba(0, 0, 0, 0.8)'; this.style.transform='scale(1.05)';" onmouseout="this.style.background='rgba(0, 0, 0, 0.6)'; this.style.transform='scale(1)';">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <div class="video-sparkle">✨</div>
        </div>
    `;
    // Auto-play the video when it's ready
    const vid = container.querySelector('video');
    if (vid) {
        vid.addEventListener('loadeddata', () => {
            vid.play().catch(() => {});
            const btn = container.querySelector('.video-play-btn');
            if (btn) {
                btn.classList.add('playing');
                btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
            }
        });
    }
}

function toggleVideoPlayback(wrapper) {
    const btn = wrapper.querySelector('.video-play-btn');
    if (btn) togglePlay(btn);
}

function togglePlay(btn) {
    const wrapper = btn.closest('.video-wrapper');
    const video = wrapper.querySelector('video');
    if (!video) return;
    
    if (video.paused) {
        video.muted = false;
        video.play().catch(() => {});
        btn.classList.add('playing');
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    } else {
        video.pause();
        btn.classList.remove('playing');
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    }
}

// Programmatic video download using the stored blob
function downloadVideoBlob(ext) {
    ext = ext || 'webm';
    if (_lastVideoBlob && _lastVideoBlob.size > 1000) {
        const url = URL.createObjectURL(_lastVideoBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gazi_video.' + ext;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast('Video indiriliyor...', 'success');
    } else {
        // Fallback: try to get the blob from the video element's src
        const vid = document.getElementById('vid_player');
        if (vid && vid.src) {
            fetch(vid.src)
                .then(r => r.blob())
                .then(blob => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'gazi_video.' + ext;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 5000);
                    showToast('Video indiriliyor...', 'success');
                })
                .catch(() => {
                    showToast('Video indirilemedi.', 'error');
                });
        } else {
            showToast('Video henüz hazır değil.', 'error');
        }
    }
}

// ─── PROJECTS MANAGEMENT ──────────────────────

function renderProjectsSubmenu() {
    if (!DOM.projectsSubmenu) return;
    const list = Object.values(state.projects);
    list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    
    if (list.length === 0) {
        DOM.projectsSubmenu.innerHTML = `<div style="padding: 4px 12px; font-size: 0.8rem; color: var(--text-muted); font-style: italic;">Henüz proje yok</div>`;
        return;
    }

    DOM.projectsSubmenu.innerHTML = list.map(p => `
        <div class="submenu-item ${p.id === state.currentProjectId ? 'active' : ''}" data-id="${p.id}" onclick="openProjectWorkspace('${p.id}')">
            <span style="font-size: 0.9rem;">📁</span>
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">${escapeHtml(p.name)}</span>
        </div>
    `).join('');
}

function openProjectsDashboard() {
    // Hide regular chat views
    DOM.emptyState.style.display = 'none';
    DOM.chatMessages.style.display = 'none';
    $('#inputArea').style.display = 'none';
    DOM.projectWorkspace.style.display = 'none';

    // Show dashboard
    DOM.projectsDashboard.style.display = 'flex';
    state.currentChatId = null;
    state.currentProjectId = null;
    
    renderProjectsDashboard();
    renderProjectsSubmenu();
    closeSidebar();
}

function renderProjectsDashboard() {
    if (!DOM.projectsDashContent) return;
    
    let list = Object.values(state.projects);
    
    // Filter
    if (state.projectFilter === 'mine') {
        // Simple mock for "mine" vs "shared"
        list = list.filter((_, idx) => idx % 2 === 0);
    } else if (state.projectFilter === 'shared') {
        list = list.filter((_, idx) => idx % 2 !== 0);
    }

    // Search
    if (state.projectSearchQuery) {
        const query = state.projectSearchQuery.toLowerCase();
        list = list.filter(p => p.name.toLowerCase().includes(query));
    }

    list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    if (list.length === 0) {
        DOM.projectsDashContent.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:16px; margin:auto; text-align:center;">
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); width:72px; height:72px; border-radius:18px; display:flex; align-items:center; justify-content:center; font-size:2rem; margin-bottom:8px;">📁</div>
                <h3 style="margin:0; font-size:1.1rem; color:var(--text-primary);">Henüz proje yok</h3>
                <p style="margin:0; font-size:0.85rem; color:var(--text-muted); max-width:280px; line-height:1.4;">Yeni bir web sitesi veya kod projesi oluşturarak başlayın.</p>
                <button class="new-project-btn" onclick="showCreateProjectModal()" style="margin-top:8px;">Yeni</button>
            </div>
        `;
        return;
    }

    DOM.projectsDashContent.innerHTML = `
        <div class="projects-grid">
            ${list.map(p => `
                <div class="project-card" onclick="openProjectWorkspace('${p.id}')">
                    <div class="project-card-header">
                        <span class="project-card-icon">📁</span>
                        <button class="project-card-delete" onclick="event.stopPropagation(); deleteProject('${p.id}')" title="Projeyi Sil">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                    <h4 class="project-card-name">${escapeHtml(p.name)}</h4>
                    <span class="project-card-files">${Object.keys(p.files || {}).length} dosya</span>
                    <span class="project-card-date">${formatDate(p.updated_at)}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function showCreateProjectModal() {
    if (DOM.createProjectModal) {
        DOM.createProjectModal.classList.add('show');
        DOM.createProjectModal.style.display = 'flex';
        DOM.newProjectNameInput.value = '';
        DOM.newProjectNameInput.focus();
    }
}

function hideCreateProjectModal() {
    if (DOM.createProjectModal) {
        DOM.createProjectModal.classList.remove('show');
        DOM.createProjectModal.style.display = 'none';
    }
}

function createProject(name) {
    const id = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    
    // Default workspace files template
    const defaultFiles = {
        'index.html': `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="welcome-container">
        <h1>Welcome to ${name}!</h1>
        <p>GaziGPT ile oluşturulan yeni projeniz başarıyla hazırlandı.</p>
        <button id="counterBtn">Tıkla: 0</button>
    </div>
    <script src="app.js"></script>
</body>
</html>`,
        'style.css': `body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: #0f0f15;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    margin: 0;
}
.welcome-container {
    text-align: center;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 40px;
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
h1 {
    color: #a78bfa;
    margin-bottom: 8px;
}
p {
    color: #9b99b0;
    margin-bottom: 24px;
}
button {
    background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);
    border: none;
    color: white;
    padding: 10px 24px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s;
}
button:hover {
    transform: scale(1.05);
}`,
        'app.js': `// Basit interaktif sayaç
let count = 0;
const btn = document.getElementById('counterBtn');
if (btn) {
    btn.addEventListener('click', () => {
        count++;
        btn.textContent = 'Tıkla: ' + count;
    });
}`
    };

    const newProject = {
        id,
        name,
        files: defaultFiles,
        messages: [
            {
                role: 'assistant',
                content: `👋 **${name}** projesine hoş geldiniz! Sizin için temel \`index.html\`, \`style.css\` ve \`app.js\` dosyalarını oluşturdum. Bu projeyi geliştirmek için sol taraftaki sohbet panelinden bana direktifler verebilirsiniz.`,
                timestamp: new Date().toISOString()
            }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    state.projects[id] = newProject;
    saveProjectsToStorage(state.projects);
    
    // Auto enter workspace
    openProjectWorkspace(id);
    showToast('Proje oluşturuldu', 'success');
}

function deleteProject(projectId) {
    if (confirm('Bu projeyi silmek istediğinizden emin misiniz?')) {
        delete state.projects[projectId];
        saveProjectsToStorage(state.projects);
        if (state.currentProjectId === projectId) {
            openProjectsDashboard();
        } else {
            renderProjectsDashboard();
            renderProjectsSubmenu();
        }
        showToast('Proje silindi', 'success');
    }
}

function openProjectWorkspace(projectId) {
    state.currentProjectId = projectId;
    const project = state.projects[projectId];
    if (!project) return;

    // View toggles
    DOM.emptyState.style.display = 'none';
    DOM.chatMessages.style.display = 'none';
    $('#inputArea').style.display = 'none';
    DOM.projectsDashboard.style.display = 'none';
    DOM.projectWorkspace.style.display = 'flex';

    if (DOM.workspaceProjectName) {
        DOM.workspaceProjectName.textContent = project.name;
    }

    // Default select active file
    state.activeProjectFile = 'index.html';
    state.projectTab = 'code';

    renderFileTree();
    renderProjectChats();
    switchProjectTab('code');
    renderProjectCode();
    renderProjectsSubmenu();
    closeSidebar();
}

function closeProjectWorkspace() {
    openProjectsDashboard();
}

function renderFileTree() {
    if (!DOM.projectFileTree) return;
    const project = state.projects[state.currentProjectId];
    if (!project || !project.files) return;

    DOM.projectFileTree.innerHTML = Object.keys(project.files).map(fileName => `
        <div class="file-tree-item ${fileName === state.activeProjectFile ? 'active' : ''}" onclick="selectProjectFile('${fileName}')">
            <span>📄</span>
            <span>${fileName}</span>
        </div>
    `).join('');
}

function selectProjectFile(fileName) {
    state.activeProjectFile = fileName;
    renderFileTree();
    renderProjectCode();
}

function renderProjectCode() {
    if (!DOM.projectCodeBlock) return;
    const project = state.projects[state.currentProjectId];
    if (!project) return;

    const fileContent = project.files[state.activeProjectFile] || '';
    DOM.projectCodeBlock.textContent = fileContent;
    
    // Setup proper language badge
    if (DOM.activeFileBadge) {
        DOM.activeFileBadge.textContent = state.activeProjectFile;
    }

    const extension = state.activeProjectFile.split('.').pop();
    DOM.projectCodeBlock.className = `language-${extension === 'js' ? 'javascript' : extension}`;
    hljs.highlightElement(DOM.projectCodeBlock);
}

function switchProjectTab(tab) {
    state.projectTab = tab;
    
    if (tab === 'code') {
        DOM.tabCodeBtn.classList.add('active');
        DOM.tabPreviewBtn.classList.remove('active');
        DOM.projectCodeContainer.style.display = 'block';
        DOM.projectPreviewContainer.style.display = 'none';
    } else {
        DOM.tabPreviewBtn.classList.add('active');
        DOM.tabCodeBtn.classList.remove('active');
        DOM.projectCodeContainer.style.display = 'none';
        DOM.projectPreviewContainer.style.display = 'block';
        renderProjectPreview();
    }
}

let activeBlobUrls = [];
function clearActiveBlobUrls() {
    activeBlobUrls.forEach(url => URL.revokeObjectURL(url));
    activeBlobUrls = [];
}

function renderProjectPreview() {
    if (!DOM.projectPreviewIframe) return;
    const project = state.projects[state.currentProjectId];
    if (!project || !project.files) return;

    clearActiveBlobUrls();

    // Map of original filename to blob URL
    const fileUrls = {};

    // 1. First, create blob URLs for all non-HTML files
    Object.entries(project.files).forEach(([fileName, content]) => {
        if (fileName === 'index.html') return;
        
        let type = 'text/plain';
        if (fileName.endsWith('.css')) type = 'text/css';
        else if (fileName.endsWith('.js')) type = 'text/javascript';
        else if (fileName.endsWith('.json')) type = 'application/json';
        else if (fileName.endsWith('.svg')) type = 'image/svg+xml';
        
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        activeBlobUrls.push(url);
        fileUrls[fileName] = url;
    });

    // 2. Get index.html content
    let htmlContent = project.files['index.html'] || '';

    // 3. Replace references of all other files in index.html
    Object.entries(fileUrls).forEach(([fileName, url]) => {
        // Escape filename for RegExp matching (e.g. style.css -> style\.css)
        const escapedName = fileName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        
        // Match href="...", src="..." or similar pointing to this file.
        // It matches style.css, ./style.css, /style.css, and folders static/css/style.css
        const regexStr = `(href|src|data)\\s*=\\s*["'](?:[^"']*/)?` + escapedName + `["']`;
        const regex = new RegExp(regexStr, 'gi');
        htmlContent = htmlContent.replace(regex, `$1="${url}"`);
    });

    const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
    const htmlUrl = URL.createObjectURL(htmlBlob);
    activeBlobUrls.push(htmlUrl);

    DOM.projectPreviewIframe.src = htmlUrl;
}

function renderProjectChats() {
    if (!DOM.projectChatMessages) return;
    const project = state.projects[state.currentProjectId];
    if (!project) return;

    DOM.projectChatMessages.innerHTML = '';
    project.messages.forEach(m => {
        const isUser = m.role === 'user';
        const msgDiv = document.createElement('div');
        msgDiv.className = `message message-${m.role}`;
        msgDiv.style.padding = '10px';
        msgDiv.style.borderRadius = '8px';
        msgDiv.style.margin = '4px 0';
        msgDiv.style.background = isUser ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)';
        msgDiv.style.border = '1px solid ' + (isUser ? 'rgba(124, 58, 237, 0.15)' : 'rgba(255,255,255,0.04)');
        
        const contentHtml = isUser ? escapeHtml(m.content) : renderMarkdown(formatThinkTags(m.content));
        
        msgDiv.innerHTML = `
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px; font-weight:600;">${isUser ? 'Kullanıcı' : 'GaziGPT'}</div>
            <div class="message-body" style="font-size:0.85rem;">${contentHtml}</div>
        `;
        DOM.projectChatMessages.appendChild(msgDiv);
    });
    
    DOM.projectChatMessages.scrollTop = DOM.projectChatMessages.scrollHeight;
}

async function sendProjectMessage() {
    const text = DOM.projectMessageInput.value.trim();
    if ((!text && !state.attachedFile) || state.isLoading) return;

    state.isLoading = true;
    DOM.projectSendBtn.disabled = true;
    DOM.projectMessageInput.value = '';

    const project = state.projects[state.currentProjectId];
    if (!project) { state.isLoading = false; DOM.projectSendBtn.disabled = false; return; }

    // Dosya eki
    const attachedFile = state.attachedFile;
    let fileContent = '';
    
    // Save image data and clear preview
    const rawImageData = attachedFile && attachedFile.isImage ? attachedFile.content : "";
    clearFileAttachment();

    // Save user message with attachment preview indicator if needed
    let userMsgContent = text;
    if (attachedFile) {
        userMsgContent = `${attachedFile.isImage ? '🖼️ [Görsel: ' : '📎 [Dosya: '}${attachedFile.name}]\n\n${text}`;
    }

    project.messages.push({
        role: 'user',
        content: userMsgContent,
        timestamp: new Date().toISOString()
    });
    saveProjectsToStorage(state.projects);
    renderProjectChats();

    // Show temporary typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.id = 'projectTypingIndicator';
    typingDiv.style.cssText = 'padding:10px; opacity:0.6; font-size:0.8rem;';
    typingDiv.textContent = 'GaziGPT yazıyor...';
    DOM.projectChatMessages.appendChild(typingDiv);
    DOM.projectChatMessages.scrollTop = DOM.projectChatMessages.scrollHeight;

    // Eğer görsel eklenmişse önce analiz et (sadece GaziGPT Hyper değilse)
    if (attachedFile && attachedFile.isImage) {
        const isOllama120b = (state.selectedModel === 'GaziGPT Hyper');
        if (isOllama120b) {
            fileContent = '';
        } else {
            typingDiv.textContent = '🔍 Görsel analiz ediliyor...';
            try {
                const analyzeRes = await fetch('/api/analyze-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image_data: rawImageData, filename: attachedFile.name }),
                });
                const analyzeData = await analyzeRes.json();
                if (analyzeData.success) {
                    fileContent = `\n\n--- Eklenen Gorsel Analizi ---\n${analyzeData.description}\n--- Gorsel Analizi Sonu ---`;
                } else {
                    fileContent = `\n\n--- Gorsel analizi basarisiz: ${analyzeData.error || 'Bilinmeyen hata'} ---`;
                }
            } catch (err) {
                fileContent = `\n\n--- Gorsel analizi baglanti hatasi: ${err.message} ---`;
            }
        }
    } else if (attachedFile) {
        fileContent = attachedFile.content;
    }

    typingDiv.textContent = 'GaziGPT yazıyor...';

    let fullText = '';
    state.abortController = new AbortController();

    try {
        const res = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: project.messages.map(m => ({ role: m.role, content: m.content })),
                message: text,
                file_content: fileContent,
                image_data: rawImageData,
                model: state.selectedModel,
                effort: state.selectedEffort,
            }),
            signal: state.abortController.signal,
        });

        typingDiv.remove();

        if (!res.ok) {
            throw new Error(`Server returned error status ${res.status}`);
        }

        // Setup streaming block
        const responseDiv = document.createElement('div');
        responseDiv.className = 'message message-assistant';
        responseDiv.style.cssText = 'padding:10px; border-radius:8px; margin:4px 0; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04);';
        responseDiv.innerHTML = `
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px; font-weight:600;">GaziGPT</div>
            <div class="message-body" style="font-size:0.85rem;"></div>
        `;
        DOM.projectChatMessages.appendChild(responseDiv);
        const bodyEl = responseDiv.querySelector('.message-body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const dataStr = line.slice(6).trim();
                    if (!dataStr) continue;
                    const ev = JSON.parse(dataStr);

                    if (ev.type === 'chunk') {
                        fullText += (ev.content || '');
                        bodyEl.innerHTML = renderMarkdown(formatThinkTags(fullText));
                        DOM.projectChatMessages.scrollTop = DOM.projectChatMessages.scrollHeight;
                        
                        // Parse files dynamically on chunks to show real-time update
                        extractAndSaveCodeBlocks(fullText);
                    }
                } catch (e) {}
            }
        }

        // Final save
        project.messages.push({
            role: 'assistant',
            content: fullText,
            timestamp: new Date().toISOString()
        });
        project.updated_at = new Date().toISOString();
        state.projects[project.id] = project;
        saveProjectsToStorage(state.projects);

        // Highlight any code
        responseDiv.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        
        // Final code rendering on completion
        extractAndSaveCodeBlocks(fullText);
        renderProjectCode();
        if (state.projectTab === 'preview') {
            renderProjectPreview();
        }

    } catch (err) {
        typingDiv.remove();
        showToast('Bağlantı hatası: ' + err.message, 'error');
    }

    state.isLoading = false;
    DOM.projectSendBtn.disabled = false;
}

function extractAndSaveCodeBlocks(text) {
    if (!text) return;
    const project = state.projects[state.currentProjectId];
    if (!project) return;

    // RegEx to find markdown code blocks: ```[lang]\n[code]```
    const regex = /```(html|css|js|javascript|xml)?\s*\n([\s\S]*?)(?:```|$)/gi;
    let match;
    let updated = false;

    while ((match = regex.exec(text)) !== null) {
        const lang = (match[1] || '').toLowerCase();
        let code = match[2] || '';

        // Determine filename
        let filename = '';
        
        // 1. Look for explicit comment header like "/* File: style.css */" or "<!-- File: index.html -->"
        const fileCommentMatch = code.match(/(?:\/\*|<!--|\/\/)\s*File:\s*([a-zA-Z0-9_\-\.]+)\s*(?:\*\/|-->)?/i);
        if (fileCommentMatch && fileCommentMatch[1]) {
            filename = fileCommentMatch[1].trim();
        } else {
            // 2. Default fallback based on language type
            if (lang === 'html' || lang === 'xml') {
                filename = 'index.html';
            } else if (lang === 'css') {
                filename = 'style.css';
            } else if (lang === 'js' || lang === 'javascript') {
                filename = 'app.js';
            }
        }

        if (filename && code.trim().length > 0) {
            // Clean up any stray comments indicating the file path if it was match-based
            project.files[filename] = code;
            updated = true;
        }
    }

    if (updated) {
        state.projects[project.id] = project;
        saveProjectsToStorage(state.projects);
    }
}
