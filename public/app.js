/**
 * ============================================================================
 * VIBERS AI - FRONTEND DASTURI (CORE CLIENT)
 * ============================================================================
 * Ushbu dastur backenddagi xavfsiz /api/chat tizimi bilan ishlaydi.
 * API kalitlar brauzerda ko'rinmaydi, ular .env faylida saqlanadi.
 * ============================================================================
 */

// ==========================================
// 1. AGENT PERSONA STANDARTLARI
// ==========================================
const DEFAULT_AGENTS = {
  general: {
    id: 'general',
    name: 'Vibers Universal',
    role: 'Universal Yordamchi',
    avatar: '✨',
    systemPrompt: `Siz o'zbek tilida mukammal muloqot qiluvchi "Vibers AI" universal sun'iy intellekt agentisiz.
Vazifangiz: Foydalanuvchiga har qanday mavzuda puxta, aniq, mantiqiy va go'zal tilda yordam berish.`,
    temperature: 0.7,
    model: 'gemini-3.8-flash',
    provider: 'gemini'
  },
  developer: {
    id: 'developer',
    name: 'Senior Dev Agent',
    role: 'Katta Dasturchi & Arxitektor',
    avatar: '💻',
    systemPrompt: `Siz 10+ yillik tajribaga ega Senior Full-Stack Dasturchi va Dasturiy Arxitektorsiz.
Siz Flutter, Python, JavaScript, TypeScript, React, Node.js, C++ va boshqa tillarda toza kodlar yozasiz.
Kodlarni to'liq, xatosiz, izohlari bilan taqdim eting.`,
    temperature: 0.3,
    model: 'gemini-3.8-flash',
    provider: 'gemini'
  },
  researcher: {
    id: 'researcher',
    name: 'Tahlilchi & Qidiruvchi',
    role: 'Deep Research & Analitika',
    avatar: '🔍',
    systemPrompt: `Siz chuqur tahlilchi va tadqiqotchi agentsiz. Murakkab mavzularni tahlil qilasiz va rejalar tuzasiz.`,
    temperature: 0.4,
    model: 'gemini-3.8-flash',
    provider: 'gemini'
  },
  writer: {
    id: 'writer',
    name: 'Matn Ustasi',
    role: 'Kopirayter & Muharrir',
    avatar: '✍️',
    systemPrompt: `Siz professional kopirayter va stilist-muharrirsiz. O'zbek tilida sifatli matnlar yozasiz.`,
    temperature: 0.8,
    model: 'gemini-3.8-flash',
    provider: 'gemini'
  },
  designer: {
    id: 'designer',
    name: 'UI/UX Dizayner',
    role: 'Frontend & Vizual Usta',
    avatar: '🎨',
    systemPrompt: `Siz minimalist UI/UX dizayner va Frontend mutaxassisisiz. Zamonaviy HTML/CSS va SVG yaratasiz.`,
    temperature: 0.5,
    model: 'gemini-3.8-flash',
    provider: 'gemini'
  }
};

// ==========================================
// 2. HOLAT (STATE)
// ==========================================
let currentAgent = DEFAULT_AGENTS.general;
let currentSessionId = localStorage.getItem('vibers_active_session') || 'sess_' + Date.now();
let sessions = loadSessions();
let isGenerating = false;
let thinkingEnabled = true;
let attachedFiles = [];

function loadSessions() {
  try {
    const data = localStorage.getItem('vibers_sessions');
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('Sessiyalarni yuklashda xato:', e);
  }
  return {
    [currentSessionId]: {
      id: currentSessionId,
      title: 'Yangi Suhbat',
      createdAt: Date.now(),
      messages: []
    }
  };
}

function saveSessions() {
  localStorage.setItem('vibers_sessions', JSON.stringify(sessions));
  localStorage.setItem('vibers_active_session', currentSessionId);
  renderHistoryList();
}

function getCurrentMessages() {
  if (!sessions[currentSessionId]) {
    sessions[currentSessionId] = {
      id: currentSessionId,
      title: 'Yangi Suhbat',
      createdAt: Date.now(),
      messages: []
    };
  }
  return sessions[currentSessionId].messages;
}

// ==========================================
// 3. API SO'ROV YUBORISH (BACKEND /api/chat ORQALI)
// ==========================================
async function callAIStream(prompt, conversationHistory, onChunk) {
  // file:// orqali ochilgan bo'lsa ham localhost:3000 ga murojaat qiladi
  const base = (window.location.protocol === 'file:' || !window.location.port && window.location.hostname === 'localhost')
    ? 'http://localhost:3000'
    : '';

  const res = await fetch(base + '/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: prompt,
      history: conversationHistory,
      agent: currentAgent,
      attachedFiles: attachedFiles
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Server xatosi: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = block.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      let evt;
      try { evt = JSON.parse(line.slice(5).trim()); } catch (_) { continue; }
      if (evt.error) throw new Error(evt.error);
      if (evt.text) { full += evt.text; onChunk(full); }
    }
  }
  return full;
}


// ==========================================
// 4. UI INTERFEYS VA XABARLARNI CHIZISH
// ==========================================
function renderMessages() {
  const container = document.getElementById('messages-inner');
  if (!container) return;
  container.innerHTML = '';

  const msgs = getCurrentMessages();

  // Agar suhbat bo'sh bo'lsa: Sodda, toza va xushbichim boshlang'ich ko'rinish
  if (msgs.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;margin:auto 0;padding:60px 20px;color:var(--muted);">
        <div style="font-size:36px;margin-bottom:14px;color:var(--accent);">✨</div>
        <h2 class="ser" style="font-size:24px;color:var(--ink);font-weight:400;margin-bottom:8px;">Vibers AI bilan suhbatni boshlang</h2>
        <p style="font-size:14px;max-width:440px;margin:0 auto;line-height:1.6;">Savolingizni yoki topshirig'ingizni pastdagi maydonga yozing. Agent sizga yordam berishga tayyor.</p>
      </div>
    `;
    return;
  }

  msgs.forEach((msg, idx) => {
    const row = document.createElement('div');
    row.className = `message-row ${msg.role}`;

    const isUser = msg.role === 'user';
    const avatarContent = isUser ? 'Siz' : (msg.agentAvatar || currentAgent.avatar);
    const senderName = isUser ? 'Siz' : (msg.agentName || currentAgent.name);

    let thinkingHtml = '';
    if (msg.thinking) {
      thinkingHtml = `
        <div class="agent-thinking-box">
          <details ${idx === msgs.length - 1 ? 'open' : ''}>
            <summary class="thinking-summary">
              <span>🧠 Fikrlash bosqichlari & Reja</span>
            </summary>
            <div class="thinking-body">${escapeHtml(msg.thinking)}</div>
          </details>
        </div>
      `;
    }

    const formattedContent = formatMarkdown(msg.content);

    row.innerHTML = `
      <div class="message-avatar">${avatarContent}</div>
      <div class="message-content-wrap">
        <div class="message-header-line">
          <span class="message-sender">${escapeHtml(senderName)}</span>
          <span class="message-time">${msg.time || ''}</span>
        </div>
        ${thinkingHtml}
        <div class="message-bubble">${formattedContent}</div>
      </div>
    `;

    container.appendChild(row);
  });

  scrollChatToBottom();
}

function scrollChatToBottom() {
  const container = document.getElementById('messages-container');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

// Markdown formatlash va kod bloklarini chizish
function formatMarkdown(text) {
  if (!text) return '';

  let codeBlocks = [];
  let processed = text.replace(/```([a-zA-Z0-9_\-\+]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const id = 'code_' + Math.random().toString(36).substr(2, 8);
    codeBlocks.push({ id, lang: lang || 'matn', code: code.trim() });
    return `###CODE_BLOCK_${id}###`;
  });

  processed = escapeHtml(processed);
  processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');
  processed = processed.replace(/`([^`]+)`/g, '<code style="background:var(--card-alt);padding:2px 6px;border-radius:4px;font-family:var(--font-mono);font-size:12.5px;border:1px solid var(--line);">$1</code>');
  processed = processed.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>');
  processed = processed.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  processed = processed.split('\n\n').map(p => {
    if (p.includes('###CODE_BLOCK_') || p.startsWith('<ul>')) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  codeBlocks.forEach(block => {
    const canPreview = ['html', 'htm', 'svg', 'xml'].includes(block.lang.toLowerCase()) || block.code.includes('<!DOCTYPE html>') || block.code.includes('<html');
    const previewBtn = canPreview ? `<button class="code-btn" onclick="openCodePreview('${block.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Natijani ko'rish</button>` : '';

    const blockHtml = `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang-tag">${block.lang}</span>
          <div class="code-actions">
            ${previewBtn}
            <button class="code-btn" onclick="copyCode('${block.id}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Nusxa olish
            </button>
          </div>
        </div>
        <pre><code id="${block.id}">${escapeHtml(block.code)}</code></pre>
      </div>
    `;
    processed = processed.replace(`###CODE_BLOCK_${block.id}###`, blockHtml);
  });

  return processed;
}

window.copyCode = function(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText).then(() => {
    alert("Kod nusxalandi!");
  }).catch(() => {
    alert("Nusxalab bo'lmadi.");
  });
};

window.openCodePreview = function(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const iframe = document.getElementById('sandbox-iframe');
  if (iframe) {
    iframe.srcdoc = el.innerText;
  }
  openModal('modal-sandbox');
};

// ==========================================
// 5. XABAR YUBORISH
// ==========================================
async function handleSendMessage() {
  if (isGenerating) return;

  const textarea = document.getElementById('chat-textarea');
  const prompt = textarea.value.trim();
  if (!prompt && attachedFiles.length === 0) return;

  const msgs = getCurrentMessages();
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  msgs.push({
    role: 'user',
    content: prompt,
    time: timeStr,
    files: [...attachedFiles]
  });

  textarea.value = '';
  textarea.style.height = 'auto';
  const oldFiles = [...attachedFiles];
  attachedFiles = [];
  renderAttachedFiles();
  renderMessages();

  isGenerating = true;
  document.getElementById('send-btn').disabled = true;
  showTypingIndicator();

  let thinkingSteps = '';
  if (thinkingEnabled) {
    thinkingSteps = `1. So'rov va uning konteksti tahlil qilindi.\n2. "${currentAgent.name}" roli va uslubi qo'llandi.\n3. Aniq va to'liq javob shakllantirildi.`;
  }

  try {
    // MUHIM: oxirgi (hozirgi) foydalanuvchi xabari tarixga qo'shilmaydi - server uni o'zi qo'shadi
    const history = msgs.slice(0, -1);

    let botMsg = null;
    let rafPending = false;

    await callAIStream(prompt, history, (fullText) => {
      if (!botMsg) {
        hideTypingIndicator();
        botMsg = {
          role: 'assistant',
          content: fullText,
          agentName: currentAgent.name,
          agentAvatar: currentAgent.avatar,
          thinking: thinkingEnabled ? thinkingSteps : null,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        msgs.push(botMsg);
        renderMessages();
        return;
      }
      botMsg.content = fullText;
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          const bubbles = document.querySelectorAll('#messages-inner .message-row.assistant .message-bubble');
          const last = bubbles[bubbles.length - 1];
          if (last) last.innerHTML = formatMarkdown(botMsg.content);
          scrollChatToBottom();
        });
      }
    });

    hideTypingIndicator();

    if (!botMsg) throw new Error("Bo'sh javob qaytdi.");

    if (msgs.length === 2 && sessions[currentSessionId]) {
      sessions[currentSessionId].title = prompt.substr(0, 30) + '...';
    }

    saveSessions();
    renderMessages();
  } catch (error) {
    hideTypingIndicator();
    alert("Xatolik: " + error.message);

    msgs.push({
      role: 'assistant',
      content: `⚠️ **Xatolik yuz berdi:** ${error.message}\n\n*Maslahat: .env faylida GEMINI_API_KEYS to'g'ri ko'rsatilganligini va server ishlab turganligini tekshiring.*`,
      agentName: 'Tizim',
      agentAvatar: '⚠️',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    saveSessions();
    renderMessages();
  } finally {
    isGenerating = false;
    document.getElementById('send-btn').disabled = false;
  }
}

function showTypingIndicator() {
  const container = document.getElementById('messages-inner');
  if (!container) return;

  const indicator = document.createElement('div');
  indicator.id = 'active-typing-indicator';
  indicator.className = 'message-row assistant';
  indicator.innerHTML = `
    <div class="message-avatar">${currentAgent.avatar}</div>
    <div class="message-content-wrap">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  container.appendChild(indicator);
  scrollChatToBottom();
}

function hideTypingIndicator() {
  const el = document.getElementById('active-typing-indicator');
  if (el) el.remove();
}

// ==========================================
// 6. MODALLAR VA AGENTLAR
// ==========================================
window.openModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
};

window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
};

function renderHistoryList() {
  const list = document.getElementById('history-list');
  if (!list) return;
  list.innerHTML = '';

  const arr = Object.values(sessions).sort((a, b) => b.createdAt - a.createdAt);
  arr.forEach(s => {
    const item = document.createElement('div');
    item.className = `history-item ${s.id === currentSessionId ? 'active' : ''}`;
    item.innerHTML = `
      <span class="history-title" onclick="switchSession('${s.id}')">${escapeHtml(s.title || 'Suhbat')}</span>
      <span class="history-del-btn" onclick="deleteSession('${s.id}', event)">✕</span>
    `;
    list.appendChild(item);
  });
}

window.createNewChat = function() {
  currentSessionId = 'sess_' + Date.now();
  sessions[currentSessionId] = {
    id: currentSessionId,
    title: 'Yangi Suhbat',
    createdAt: Date.now(),
    messages: []
  };
  saveSessions();
  renderMessages();
  closeMobileMenu();
};

window.switchSession = function(id) {
  currentSessionId = id;
  saveSessions();
  renderMessages();
  closeMobileMenu();
};

window.deleteSession = function(id, event) {
  event.stopPropagation();
  if (confirm("Ushbu suhbatni o'chirmoqchimisiz?")) {
    delete sessions[id];
    if (currentSessionId === id) {
      const keys = Object.keys(sessions);
      currentSessionId = keys.length ? keys[0] : 'sess_' + Date.now();
      if (!sessions[currentSessionId]) {
        sessions[currentSessionId] = { id: currentSessionId, title: 'Yangi Suhbat', createdAt: Date.now(), messages: [] };
      }
    }
    saveSessions();
    renderMessages();
  }
};

window.switchAgent = function(agentKey) {
  if (DEFAULT_AGENTS[agentKey]) {
    currentAgent = DEFAULT_AGENTS[agentKey];
    updateAgentHeaderUI();
    closeModal('modal-agents');
  }
};

function updateAgentHeaderUI() {
  const nameEl = document.getElementById('header-agent-name');
  const roleEl = document.getElementById('header-agent-role');
  const avatarEl = document.getElementById('header-agent-avatar');
  const modelEl = document.getElementById('header-agent-model');

  if (nameEl) nameEl.textContent = currentAgent.name;
  if (roleEl) roleEl.textContent = currentAgent.role;
  if (avatarEl) avatarEl.textContent = currentAgent.avatar;
  if (modelEl) modelEl.textContent = currentAgent.model;
}

// ==========================================
// 7. FAYLLAR VA OVOZLI KIRITISH
// ==========================================
function setupFileInput() {
  const fileInput = document.getElementById('file-upload-input');
  if (!fileInput) return;

  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        attachedFiles.push({
          name: file.name,
          content: event.target.result,
          size: file.size
        });
        renderAttachedFiles();
      };
      reader.readAsText(file);
    });
    fileInput.value = '';
  });
}

function renderAttachedFiles() {
  const container = document.getElementById('attached-files-row');
  if (!container) return;
  container.innerHTML = '';

  attachedFiles.forEach((file, index) => {
    const chip = document.createElement('div');
    chip.className = 'file-chip';
    chip.innerHTML = `
      <span>📄 ${escapeHtml(file.name)}</span>
      <span class="file-chip-remove" onclick="removeAttachedFile(${index})">✕</span>
    `;
    container.appendChild(chip);
  });
}

window.removeAttachedFile = function(index) {
  attachedFiles.splice(index, 1);
  renderAttachedFiles();
};

function setupVoiceInput() {
  const voiceBtn = document.getElementById('voice-input-btn');
  if (!voiceBtn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.style.display = 'none';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'uz-UZ';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const textarea = document.getElementById('chat-textarea');
    if (textarea) {
      textarea.value = (textarea.value + ' ' + transcript).trim();
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    }
  };

  recognition.onend = () => voiceBtn.classList.remove('recording');
  recognition.onerror = () => voiceBtn.classList.remove('recording');

  let isRec = false;
  voiceBtn.addEventListener('click', () => {
    if (isRec) {
      recognition.stop();
      isRec = false;
    } else {
      try {
        recognition.start();
        isRec = true;
        voiceBtn.classList.add('recording');
      } catch (err) {
        console.error(err);
      }
    }
  });
}

// ==========================================
// 8. MAVZU VA MOBIL MENYU
// ==========================================
function setupThemeToggle() {
  const toggleBtn = document.getElementById('theme-toggle-btn');
  const storedTheme = localStorage.getItem('vibers_theme') || 'light';
  applyTheme(storedTheme);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const newTheme = current === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme);
      localStorage.setItem('vibers_theme', newTheme);
    });
  }
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function setupMobileMenu() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');

  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
}

function closeMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar && window.innerWidth <= 900) {
    sidebar.classList.remove('open');
  }
}

// ==========================================
// 9. BOSHLANG'ICH YUKLANISH
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  setupThemeToggle();
  setupMobileMenu();
  setupFileInput();
  setupVoiceInput();
  updateAgentHeaderUI();
  renderHistoryList();
  renderMessages();

  const textarea = document.getElementById('chat-textarea');
  if (textarea) {
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 180) + 'px';
    });
  }

  const thinkingBtn = document.getElementById('toggle-thinking-btn');
  if (thinkingBtn) {
    thinkingBtn.addEventListener('click', () => {
      thinkingEnabled = !thinkingEnabled;
      thinkingBtn.classList.toggle('active', thinkingEnabled);
    });
  }

  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', handleSendMessage);
  }
});
