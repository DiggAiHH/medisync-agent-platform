// Medical AI Extension - Sidebar JavaScript
(function() {
    const vscode = acquireVsCodeApi();

    // State
    let currentTab = 'analyze';
    let chatHistory = [];
    let isStreaming = false;
    let currentModel = 'llama3.2';
    let availableModels = [];
    let lastAnalysisResult = null;
    let lastAnalysisRequest = null; // Für Retry-Funktionalität

    // Timer State
    let processingStartTime = null;
    let processingTimerInterval = null;

    // DOM Elements
    const elements = {
        // Tabs
        tabButtons: document.querySelectorAll('.tab-btn'),
        tabContents: document.querySelectorAll('.tab-content'),
        
        // Status
        connectionStatus: document.getElementById('connectionStatus'),
        statusBar: document.getElementById('statusBar'),
        
        // Analyze Tab
        analyzeInput: document.getElementById('analyzeInput'),
        analyzeBtn: document.getElementById('analyzeBtn'),
        summarizeBtn: document.getElementById('summarizeBtn'),
        analyzeResult: document.getElementById('analyzeResult'),
        
        // Chat Tab
        chatHistory: document.getElementById('chatHistory'),
        chatInput: document.getElementById('chatInput'),
        sendBtn: document.getElementById('sendBtn'),
        stopBtn: document.getElementById('stopBtn'),
        
        // ICD-10 Tab
        icd10Input: document.getElementById('icd10Input'),
        icd10Btn: document.getElementById('icd10Btn'),
        icd10Result: document.getElementById('icd10Result'),

        // Model Selector
        modelSelector: document.getElementById('modelSelector')
    };

    /**
     * Kündigt eine Nachricht für Screenreader an
     * 
     * @param {string} message - Die anzukündigende Nachricht
     * @param {'polite' | 'assertive'} priority - Priorität (polite = wartet, assertive = unterbricht)
     * @param {boolean} clearAfter - Ob die Nachricht nach einiger Zeit gelöscht werden soll
     */
    function announceToScreenReader(message, priority = 'polite', clearAfter = true) {
        const regionId = priority === 'assertive' ? 'aria-live-assertive' : 'aria-live-polite';
        const region = document.getElementById(regionId);
        
        if (!region) {
            console.warn('ARIA Live Region nicht gefunden:', regionId);
            return;
        }
        
        // Clear first (wichtig für NVDA/JAWS)
        region.textContent = '';
        
        // Setze neue Nachricht nach kurzem Delay (für Screenreader-Erkennung)
        setTimeout(() => {
            region.textContent = message;
        }, 100);
        
        // Clear nach 1 Sekunde für Wiederholbarkeit
        if (clearAfter) {
            setTimeout(() => {
                region.textContent = '';
            }, 1000);
        }
    }

    /**
     * Setzt den Busy-Status für Screenreader
     */
    function setAriaBusy(isBusy, message = '') {
        const region = document.getElementById('aria-busy-indicator');
        const mainContainer = document.getElementById('main-container');
        
        if (mainContainer) {
            mainContainer.setAttribute('aria-busy', isBusy ? 'true' : 'false');
        }
        
        if (region) {
            region.textContent = isBusy ? (message || 'Wird bearbeitet...') : '';
        }
    }

    /**
     * Ankündigung mit Debounce (verhindert Spam)
     */
    const debouncedAnnounce = (() => {
        let timeoutId = null;
        return (message, priority = 'polite', delay = 300) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
                announceToScreenReader(message, priority);
                timeoutId = null;
            }, delay);
        };
    })();

    // Initialize
    function init() {
        setupEventListeners();
        checkConnection();
        loadModels();
        renderModelSelector();
        createTimerElement();
        
        // Initial screenreader announcement
        announceToScreenReader('Medical AI Assistent bereit', 'polite');
    }

    // ==================== PROCESSING TIMER ====================

    /**
     * Erstellt das Timer-Element im DOM
     */
    function createTimerElement() {
        // Suche nach dem Analyze-Tab Content
        const analyzeTab = document.getElementById('tab-analyze');
        if (!analyzeTab) return;

        // Prüfe ob Timer bereits existiert
        if (document.getElementById('processing-timer')) return;

        const timerContainer = document.createElement('div');
        timerContainer.id = 'processing-timer';
        timerContainer.className = 'processing-timer hidden';
        timerContainer.setAttribute('role', 'timer');
        timerContainer.setAttribute('aria-live', 'off');
        timerContainer.innerHTML = `
            <div class="timer-spinner"></div>
            <div class="timer-content">
                <span class="timer-label">Verarbeitung</span>
                <span id="timer-value" class="timer-value">0.0s</span>
            </div>
        `;

        // Füge Timer am Anfang des Analyze-Tabs ein
        const inputGroup = analyzeTab.querySelector('.input-group');
        if (inputGroup && inputGroup.parentNode) {
            inputGroup.parentNode.insertBefore(timerContainer, inputGroup.nextSibling);
        }

        // Erstelle auch Timer für ICD-10 Tab
        const icd10Tab = document.getElementById('tab-icd10');
        if (icd10Tab && !icd10Tab.querySelector('#icd10-timer')) {
            const icd10Timer = timerContainer.cloneNode(true);
            icd10Timer.id = 'icd10-timer';
            const icd10InputGroup = icd10Tab.querySelector('.input-group');
            if (icd10InputGroup && icd10InputGroup.parentNode) {
                icd10InputGroup.parentNode.insertBefore(icd10Timer, icd10InputGroup.nextSibling);
            }
        }
    }

    /**
     * Startet den Processing-Timer
     */
    function startProcessingTimer(containerId = 'processing-timer') {
        processingStartTime = Date.now();
        
        // Zeige Timer-Container
        const timerContainer = document.getElementById(containerId);
        if (timerContainer) {
            timerContainer.classList.remove('hidden');
            timerContainer.classList.add('active');
            timerContainer.classList.remove('completed');
        }
        
        // Update alle 100ms für smooth Animation
        processingTimerInterval = setInterval(() => {
            updateProcessingTimer(containerId);
        }, 100);
    }

    /**
     * Stoppt den Processing-Timer
     */
    function stopProcessingTimer(containerId = 'processing-timer') {
        if (processingTimerInterval) {
            clearInterval(processingTimerInterval);
            processingTimerInterval = null;
        }
        
        const timerContainer = document.getElementById(containerId);
        if (timerContainer) {
            timerContainer.classList.remove('active');
            timerContainer.classList.add('completed');
        }
        
        // Berechne finale Zeit
        const duration = processingStartTime ? Date.now() - processingStartTime : 0;
        processingStartTime = null;
        
        // Auto-hide nach 3 Sekunden
        setTimeout(() => {
            if (timerContainer) {
                timerContainer.classList.add('hidden');
                timerContainer.classList.remove('completed');
            }
        }, 3000);
        
        return duration;
    }

    /**
     * Aktualisiert die Timer-Anzeige
     */
    function updateProcessingTimer(containerId = 'processing-timer') {
        if (!processingStartTime) return;
        
        const elapsed = Date.now() - processingStartTime;
        const formatted = formatDuration(elapsed);
        
        const timerElement = document.getElementById(containerId === 'processing-timer' ? 'timer-value' : 'timer-value');
        if (timerElement) {
            // Finde den Timer-Value innerhalb des Containers
            const container = document.getElementById(containerId);
            if (container) {
                const valueEl = container.querySelector('.timer-value');
                if (valueEl) {
                    valueEl.textContent = formatted;
                }
            }
        }
    }

    /**
     * Formatiert Millisekunden in lesbares Format
     * @param {number} ms - Millisekunden
     * @returns {string} - Formatierte Zeit (z.B. "2.3s" oder "1:23.4")
     */
    function formatDuration(ms) {
        if (ms < 1000) {
            return `${ms}ms`;
        }
        
        const seconds = (ms / 1000).toFixed(1);
        if (ms < 60000) {
            return `${seconds}s`;
        }
        
        const minutes = Math.floor(ms / 60000);
        const remainingSeconds = ((ms % 60000) / 1000).toFixed(0);
        return `${minutes}:${remainingSeconds.padStart(2, '0')}min`;
    }

    // Event Listeners
    function setupEventListeners() {
        // Tab switching
        elements.tabButtons.forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // Analyze buttons
        elements.analyzeBtn.addEventListener('click', handleAnalyze);
        elements.summarizeBtn.addEventListener('click', handleSummarize);

        // Chat
        elements.sendBtn.addEventListener('click', handleSendMessage);
        if (elements.stopBtn) {
            elements.stopBtn.addEventListener('click', handleStopStreaming);
        }
        elements.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });

        // ICD-10
        elements.icd10Btn.addEventListener('click', handleICD10Search);

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboard);
    }

    // Tab Switching
    function switchTab(tabName) {
        currentTab = tabName;
        
        // Update buttons
        elements.tabButtons.forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            btn.setAttribute('tabindex', isActive ? '0' : '-1');
        });
        
        // Update content
        elements.tabContents.forEach(content => {
            const isActive = content.id === `tab-${tabName}`;
            content.classList.toggle('active', isActive);
        });
    }

    // Connection Check
    function checkConnection() {
        vscode.postMessage({ type: 'checkConnection' });
    }

    // Load Models
    function loadModels() {
        vscode.postMessage({ type: 'getModels' });
    }

    // Render Model Selector
    function renderModelSelector() {
        let selectorContainer = elements.modelSelector;
        
        // Create container if it doesn't exist (insert before tabs)
        if (!selectorContainer) {
            const tabs = document.querySelector('.tabs');
            if (tabs) {
                selectorContainer = document.createElement('div');
                selectorContainer.id = 'modelSelector';
                tabs.parentNode.insertBefore(selectorContainer, tabs);
                elements.modelSelector = selectorContainer;
            } else {
                return;
            }
        }

        selectorContainer.innerHTML = `
            <div class="model-selector">
                <label for="modelSelect">Modell:</label>
                <select id="modelSelect" aria-label="LLM Modell auswählen">
                    ${availableModels.map(m => `
                        <option value="${escapeHtml(m)}" ${m === currentModel ? 'selected' : ''}>
                            ${escapeHtml(m)}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;

        // Event Listener for model selection
        const select = selectorContainer.querySelector('#modelSelect');
        if (select) {
            select.addEventListener('change', (e) => {
                const selectedModel = e.target.value;
                
                // Zeige Loading State
                select.disabled = true;
                
                // Sende an Extension
                vscode.postMessage({ 
                    type: 'setModel', 
                    value: selectedModel 
                });
            });
        }
    }

    // Handle Analyze
    function handleAnalyze() {
        const text = elements.analyzeInput.value.trim();
        if (!text) {
            showStatus('Bitte Text eingeben', 'warning');
            announceToScreenReader('Bitte Text eingeben', 'assertive');
            return;
        }

        setAriaBusy(true, 'Analyse wird durchgeführt. Bitte warten...');
        announceToScreenReader('Analyse wird durchgeführt. Bitte warten...', 'polite');
        showLoading(elements.analyzeResult);
        startProcessingTimer('processing-timer');
        vscode.postMessage({
            type: 'analyze',
            value: text
        });
    }

    // Handle Summarize
    function handleSummarize() {
        const text = elements.analyzeInput.value.trim();
        if (!text) {
            showStatus('Bitte Text eingeben', 'warning');
            announceToScreenReader('Bitte Text eingeben', 'assertive');
            return;
        }

        setAriaBusy(true, 'Zusammenfassung wird erstellt...');
        announceToScreenReader('Zusammenfassung wird erstellt...', 'polite');
        showLoading(elements.analyzeResult);
        startProcessingTimer('processing-timer');
        vscode.postMessage({
            type: 'summarize',
            value: text
        });
    }

    // Handle Send Message
    function handleSendMessage() {
        if (isStreaming) return;

        const message = elements.chatInput.value.trim();
        if (!message) return;

        // Add user message to chat
        addChatMessage('user', message);
        
        // Clear input
        elements.chatInput.value = '';
        
        // UI State: Streaming
        setStreamingState(true);
        setAriaBusy(true, 'Antwort wird generiert...');
        announceToScreenReader('Nachricht gesendet. Antwort wird generiert...', 'polite');
        
        // Start Timer for chat
        startProcessingTimer('processing-timer');
        
        // Send to extension
        isStreaming = true;
        vscode.postMessage({
            type: 'chat',
            value: message
        });
    }

    // Handle Stop Streaming
    function handleStopStreaming() {
        if (!isStreaming) return;
        
        announceToScreenReader('Streaming wird abgebrochen...', 'polite');
        
        // Disable stop button and show feedback
        if (elements.stopBtn) {
            elements.stopBtn.disabled = true;
            elements.stopBtn.textContent = '⏹ Wird abgebrochen...';
        }
        
        vscode.postMessage({ type: 'cancelStreaming' });
    }

    // Set Streaming State UI
    function setStreamingState(streaming) {
        isStreaming = streaming;
        
        if (elements.chatInput) {
            elements.chatInput.disabled = streaming;
        }
        if (elements.sendBtn) {
            elements.sendBtn.classList.toggle('hidden', streaming);
        }
        if (elements.stopBtn) {
            elements.stopBtn.classList.toggle('hidden', !streaming);
            if (!streaming) {
                elements.stopBtn.disabled = false;
                elements.stopBtn.textContent = '⏹ Stop';
            }
        }
    }

    // Handle ICD-10 Search
    function handleICD10Search() {
        const diagnosis = elements.icd10Input.value.trim();
        if (!diagnosis) {
            showStatus('Bitte Diagnose eingeben', 'warning');
            announceToScreenReader('Bitte Diagnose eingeben', 'assertive');
            return;
        }

        setAriaBusy(true, 'Suche ICD-10 Codes...');
        announceToScreenReader('Suche ICD-10 Codes...', 'polite');
        showLoading(elements.icd10Result);
        startProcessingTimer('icd10-timer');
        vscode.postMessage({
            type: 'icd10',
            value: diagnosis
        });
    }

    // Add Chat Message
    function addChatMessage(role, content, isStreaming = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${role}`;
        
        const timestamp = new Date().toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageDiv.innerHTML = `
            <div class="content">${escapeHtml(content)}</div>
            <div class="timestamp">${timestamp}</div>
        `;
        
        elements.chatHistory.appendChild(messageDiv);
        elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
        
        if (!isStreaming) {
            chatHistory.push({ role, content, timestamp });
        }
        
        return messageDiv;
    }

    // Update last chat message (for streaming)
    function updateLastChatMessage(content) {
        const messages = elements.chatHistory.querySelectorAll('.chat-message.assistant');
        const lastMessage = messages[messages.length - 1];
        if (lastMessage) {
            const contentDiv = lastMessage.querySelector('.content');
            contentDiv.innerHTML = escapeHtml(content);
            elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
        }
    }

    // Show Loading
    function showLoading(container) {
        container.innerHTML = '<div class="loading"></div>';
    }

    // Show Status
    function showStatus(message, type = 'info') {
        elements.statusBar.textContent = message;
        elements.statusBar.className = 'status-bar';
        
        if (type === 'error') {
            elements.statusBar.style.color = 'var(--medical-critical)';
        } else if (type === 'success') {
            elements.statusBar.style.color = 'var(--medical-success)';
        } else if (type === 'warning') {
            elements.statusBar.style.color = 'var(--medical-warning)';
        }
        
        setTimeout(() => {
            elements.statusBar.textContent = '';
            elements.statusBar.style.color = '';
        }, 3000);
    }

    // Handle Keyboard Shortcuts
    function handleKeyboard(e) {
        // Ctrl/Cmd + Enter to send
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            if (currentTab === 'chat' && document.activeElement === elements.chatInput) {
                handleSendMessage();
                announceToScreenReader('Nachricht gesendet', 'polite');
            } else if (currentTab === 'analyze' && document.activeElement === elements.analyzeInput) {
                handleAnalyze();
                announceToScreenReader('Analyse gestartet', 'polite');
            }
        }

        // Enter to apply result when NOT focused on textarea/input
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            const activeElement = document.activeElement;
            if (activeElement.tagName !== 'TEXTAREA' && activeElement.tagName !== 'INPUT') {
                const applyBtn = document.querySelector('.action-btn-apply');
                if (applyBtn) {
                    e.preventDefault();
                    applyBtn.click();
                    announceToScreenReader('Ergebnis übernommen', 'polite');
                }
            }
        }
        
        // R = Retry (wenn nicht in Input Feld)
        if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
            const activeElement = document.activeElement;
            if (activeElement.tagName !== 'TEXTAREA' && activeElement.tagName !== 'INPUT') {
                const retryBtn = document.querySelector('.action-btn-retry');
                if (retryBtn) {
                    e.preventDefault();
                    retryBtn.click();
                }
            }
        }

        // Esc to close/cancel
        if (e.key === 'Escape') {
            if (isStreaming) {
                handleStopStreaming();
                announceToScreenReader('Streaming abgebrochen', 'polite');
            }
        }
        
        // F6 for quick tab cycling
        if (e.key === 'F6') {
            e.preventDefault();
            cycleTabs();
        }
    }
    
    // Cycle through tabs
    function cycleTabs() {
        const tabs = ['analyze', 'chat', 'icd10'];
        const currentIndex = tabs.indexOf(currentTab);
        const nextIndex = (currentIndex + 1) % tabs.length;
        const nextTab = tabs[nextIndex];
        switchTab(nextTab);
        announceToScreenReader(`${getTabLabel(nextTab)} Tab aktiviert`, 'polite');
    }
    
    // Get tab label for screenreader
    function getTabLabel(tabName) {
        const labels = {
            'analyze': 'Analyse',
            'chat': 'Chat',
            'icd10': 'ICD-10'
        };
        return labels[tabName] || tabName;
    }

    // Escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== TRUST INDICATORS ====================

    /**
     * Rendert einen Konfidenz-Indikator mit Progress-Bar
     * Basierend auf: Wang et al. (2022) - Trust Calibration
     * 
     * @param {number} confidence - Konfidenz-Wert (0-100)
     * @param {HTMLElement} container - Container-Element für den Indikator
     */
    function renderConfidenceIndicator(confidence, container) {
        // Bestimme Level und Farbe
        let level, colorClass, label;
        if (confidence >= 80) {
            level = 'high';
            colorClass = 'confidence-high';
            label = 'Hohe Zuversicht';
        } else if (confidence >= 50) {
            level = 'medium';
            colorClass = 'confidence-medium';
            label = 'Moderate Zuversicht';
        } else {
            level = 'low';
            colorClass = 'confidence-low';
            label = 'Niedrige Zuversicht';
        }
        
        const indicator = document.createElement('div');
        indicator.className = 'confidence-indicator';
        indicator.innerHTML = `
            <div class="confidence-header">
                <span class="confidence-badge ${colorClass}">
                    <span class="confidence-icon"></span>
                    ${label}
                </span>
                <span class="confidence-value">${confidence}%</span>
            </div>
            <div class="confidence-bar-container" role="progressbar" aria-valuenow="${confidence}" aria-valuemin="0" aria-valuemax="100" aria-label="Konfidenz: ${label}">
                <div class="confidence-bar-fill ${colorClass}" style="width: 0%"></div>
            </div>
            <div class="confidence-tooltip">
                Basierend auf Modell-Analyse. Bitte Ergebnis immer verifizieren.
            </div>
        `;
        
        container.appendChild(indicator);
        
        // Animation nach kurzem Delay
        setTimeout(() => {
            const fill = indicator.querySelector('.confidence-bar-fill');
            if (fill) {
                fill.style.width = `${confidence}%`;
            }
        }, 100);
    }

    // Render Trust Indicators
    function renderTrustIndicators(metadata = {}) {
        const confidence = metadata.confidence || metadata.confidenceScore || 0;
        const processingTime = metadata.processingTime || metadata.duration || 0;
        const model = metadata.model || currentModel;
        
        return `
            <div class="trust-bar" role="status" aria-label="Analyse-Metadaten">
                <span class="trust-badge success" aria-label="Analyse erfolgreich">
                    <span class="trust-icon">✓</span>
                    <span class="trust-text">Analyse abgeschlossen</span>
                </span>
                ${confidence > 0 ? `
                    <span class="trust-score" aria-label="Konfidenz ${confidence}%">
                        <span class="trust-label">Konfidenz:</span>
                        <span class="trust-value">${confidence}%</span>
                    </span>
                ` : ''}
                <span class="trust-time" aria-label="Verarbeitungszeit ${processingTime}s">
                    <span class="trust-icon">⏱️</span>
                    <span class="trust-value">${processingTime}s</span>
                </span>
                <span class="trust-model" aria-label="Verwendetes Modell ${model}">
                    <span class="trust-label">Modell:</span>
                    <span class="trust-value">${escapeHtml(model)}</span>
                </span>
            </div>
            ${renderModelInfo(model)}
        `;
    }

    /**
     * Rendert erweiterte Model-Information
     */
    function renderModelInfo(model) {
        if (!model) return '';
        
        return `
            <div class="model-info">
                <div class="model-badge">
                    <span class="model-icon">🤖</span>
                    <span class="model-name">${escapeHtml(model)}</span>
                </div>
                <span class="model-disclaimer">Lokale Verarbeitung</span>
            </div>
        `;
    }

    // ==================== ONE-CLICK ACTIONS ====================

    /**
     * Kopiert Text in die Zwischenablage
     * @param {string} text - Der zu kopierende Text
     * @param {string} resultType - Typ des Ergebnisses (für Status-Meldung)
     */
    async function copyToClipboard(text, resultType = 'Ergebnis') {
        try {
            // Verwende Clipboard API wenn verfügbar
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                showCopySuccess(resultType);
            } else {
                // Fallback für ältere VS Code Versionen
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-9999px';
                document.body.appendChild(textArea);
                textArea.select();
                
                try {
                    document.execCommand('copy');
                    showCopySuccess(resultType);
                } catch (err) {
                    console.error('Copy failed:', err);
                    showStatus('Kopieren fehlgeschlagen', 'error');
                } finally {
                    document.body.removeChild(textArea);
                }
            }
        } catch (error) {
            console.error('Clipboard error:', error);
            showStatus('Kopieren fehlgeschlagen', 'error');
        }
    }

    /**
     * Zeigt Erfolgsmeldung für Copy
     */
    function showCopySuccess(resultType) {
        showStatus(`✓ ${resultType} kopiert`, 'success');
        announceToScreenReader(`${resultType} in Zwischenablage kopiert`, 'polite');
    }

    /**
     * Wiederholt die letzte Analyse
     */
    function retryAnalysis() {
        if (!lastAnalysisRequest) {
            showStatus('Keine vorherige Analyse zum Wiederholen', 'error');
            announceToScreenReader('Keine vorherige Analyse zum Wiederholen', 'assertive');
            return;
        }
        
        // Prüfe ob der Text noch im Input ist
        let currentText = '';
        let inputElement = null;
        
        if (lastAnalysisRequest.type === 'icd10') {
            currentText = elements.icd10Input.value.trim();
            inputElement = elements.icd10Input;
        } else {
            currentText = elements.analyzeInput.value.trim();
            inputElement = elements.analyzeInput;
        }
        
        if (currentText !== lastAnalysisRequest.text) {
            // Text hat sich geändert - setze ihn zurück
            inputElement.value = lastAnalysisRequest.text;
        }
        
        // Starte neu basierend auf dem gespeicherten Typ
        showStatus('Analyse wird wiederholt...');
        announceToScreenReader('Analyse wird wiederholt', 'polite');
        
        switch(lastAnalysisRequest.type) {
            case 'analyze':
                handleAnalyze();
                break;
            case 'summarize':
                handleSummarize();
                break;
            case 'icd10':
                handleICD10Search();
                break;
        }
    }

    /**
     * Gibt lesbaren Label für Result-Typ
     */
    function getResultTypeLabel(type) {
        const labels = {
            'analysis': 'Analyse',
            'summary': 'Zusammenfassung',
            'icd10': 'ICD-10 Codes',
            'chat': 'Chat-Antwort'
        };
        return labels[type] || 'Ergebnis';
    }

    // Render One-Click Actions
    function renderOneClickActions(resultText, resultType = 'text') {
        return `
            <div class="one-click-actions" role="group" aria-label="Aktionen">
                <button class="action-btn action-btn-apply primary" 
                        data-action="apply" 
                        data-type="${resultType}"
                        aria-label="Übernehmen (Enter)"
                        tabindex="0">
                    <span class="action-icon">✓</span>
                    <span class="action-text">Übernehmen</span>
                    <span class="action-shortcut">Enter</span>
                </button>
                <button class="action-btn action-btn-copy" 
                        data-action="copy"
                        aria-label="In Zwischenablage kopieren"
                        tabindex="0">
                    <span class="action-icon">📋</span>
                    <span class="action-text">Kopieren</span>
                </button>
                <button class="action-btn action-btn-retry" 
                        data-action="retry"
                        aria-label="Neu analysieren (R)"
                        tabindex="0">
                    <span class="action-icon">↻</span>
                    <span class="action-text">Neu</span>
                </button>
            </div>
        `;
    }

    // Handle One-Click Action
    function handleOneClick(action, data, resultType) {
        switch(action) {
            case 'apply':
                vscode.postMessage({
                    type: 'applyResult',
                    value: data,
                    resultType: resultType
                });
                showStatus('Ergebnis übernommen', 'success');
                announceToScreenReader('Ergebnis in Editor übernommen', 'polite');
                break;
            case 'copy':
                copyToClipboard(data, getResultTypeLabel(resultType));
                break;
            case 'retry':
                retryAnalysis();
                break;
        }
    }

    // Setup One-Click Action Listeners
    function setupOneClickListeners(container, resultText, resultType) {
        setTimeout(() => {
            container.querySelectorAll('.action-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const action = e.currentTarget.dataset.action;
                    handleOneClick(action, resultText, resultType);
                });
            });
        }, 0);
    }

    // ==================== PROGRESSIVE DISCLOSURE ====================

    // Render Collapsible Section
    function renderCollapsible(title, content, isOpen = false, sectionId = '') {
        const id = sectionId || `section-${Math.random().toString(36).substr(2, 9)}`;
        return `
            <details class="progressive-section" ${isOpen ? 'open' : ''}>
                <summary id="${id}-summary" 
                         aria-expanded="${isOpen}" 
                         aria-controls="${id}-content"
                         tabindex="0">
                    <span class="summary-icon">▶</span>
                    <span class="summary-title">${escapeHtml(title)}</span>
                </summary>
                <div class="section-content" 
                     id="${id}-content" 
                     role="region" 
                     aria-labelledby="${id}-summary">
                    ${content}
                </div>
            </details>
        `;
    }

    // ==================== RESULT RENDERERS ====================

    // Render Analysis Result
    function renderAnalysisResult(result, metadata = {}) {
        lastAnalysisResult = result;
        
        let contentHtml = '<div class="analysis-result">';
        
        if (result.summary) {
            const summaryContent = `<div class="summary">${escapeHtml(result.summary)}</div>`;
            contentHtml += renderCollapsible('📝 Zusammenfassung', summaryContent, true, 'summary-section');
        }
        
        if (result.keyPoints && result.keyPoints.length > 0) {
            const keyPointsContent = `
                <ul class="key-points-list">
                    ${result.keyPoints.map(point => `
                        <li class="key-point-item">${escapeHtml(point)}</li>
                    `).join('')}
                </ul>
            `;
            contentHtml += renderCollapsible(`🔑 Schlüsselpunkte (${result.keyPoints.length})`, keyPointsContent, true, 'keypoints-section');
        }
        
        if (result.suggestions && result.suggestions.length > 0) {
            const suggestionsContent = `
                <ul class="suggestions-list">
                    ${result.suggestions.map(suggestion => `
                        <li class="suggestion-item">${escapeHtml(suggestion)}</li>
                    `).join('')}
                </ul>
            `;
            contentHtml += renderCollapsible(`💡 Vorschläge (${result.suggestions.length})`, suggestionsContent, false, 'suggestions-section');
        }
        
        if (result.details) {
            const detailsContent = `<div class="details">${escapeHtml(result.details)}</div>`;
            contentHtml += renderCollapsible('📄 Details', detailsContent, false, 'details-section');
        }
        
        contentHtml += '</div>';

        // Combine trust indicators, content, and actions
        const resultText = extractResultText(result);
        
        // Konfidenz-Indikator rendern falls vorhanden
        let confidenceHtml = '';
        if (metadata && metadata.confidence !== undefined) {
            const trustSection = document.createElement('div');
            trustSection.className = 'trust-section';
            renderConfidenceIndicator(metadata.confidence, trustSection);
            confidenceHtml = trustSection.innerHTML;
        }
        
        const fullHtml = `
            ${renderTrustIndicators(metadata)}
            ${confidenceHtml}
            ${contentHtml}
            ${renderOneClickActions(resultText, 'analysis')}
        `;

        // Setup action listeners after rendering
        setTimeout(() => {
            const container = elements.analyzeResult;
            setupOneClickListeners(container, resultText, 'analysis');
            setupCollapsibleListeners(container);
        }, 0);

        return fullHtml;
    }

    // Render Summary Result
    function renderSummaryResult(summary, metadata = {}) {
        lastAnalysisResult = { summary };
        
        const contentHtml = `
            <div class="analysis-result">
                ${renderCollapsible('📝 Zusammenfassung', `
                    <div class="summary">${escapeHtml(summary)}</div>
                `, true, 'summary-section')}
            </div>
        `;

        const fullHtml = `
            ${renderTrustIndicators(metadata)}
            ${contentHtml}
            ${renderOneClickActions(summary, 'summary')}
        `;

        setTimeout(() => {
            const container = elements.analyzeResult;
            setupOneClickListeners(container, summary, 'summary');
            setupCollapsibleListeners(container);
        }, 0);

        return fullHtml;
    }

    // Render ICD-10 Results
    function renderICD10Results(codes, metadata = {}) {
        if (!codes || codes.length === 0) {
            const noResultsHtml = `
                ${renderTrustIndicators({ ...metadata, confidence: 0 })}
                <div class="info-message">Keine Codes gefunden</div>
                ${renderOneClickActions('', 'icd10')}
            `;
            setTimeout(() => {
                setupOneClickListeners(elements.icd10Result, '', 'icd10');
            }, 0);
            return noResultsHtml;
        }
        
        const codesText = codes.join('\n');
        
        let codesHtml = '<ul class="icd10-list">';
        codes.forEach(code => {
            const [codePart, ...descParts] = code.split(' - ');
            const description = descParts.join(' - ');
            
            codesHtml += `
                <li class="icd10-item" data-code="${escapeHtml(codePart)}" tabindex="0">
                    <span class="code">${escapeHtml(codePart)}</span>
                    <span class="description">${escapeHtml(description || '')}</span>
                    <button class="copy-btn" 
                            title="Kopieren" 
                            aria-label="Code ${escapeHtml(codePart)} kopieren"
                            data-single-code="${escapeHtml(codePart)}">
                        📋
                    </button>
                </li>
            `;
        });
        codesHtml += '</ul>';

        const fullHtml = `
            ${renderTrustIndicators(metadata)}
            <div class="icd10-results">
                ${renderCollapsible(`🏥 ICD-10 Codes (${codes.length} gefunden)`, codesHtml, true, 'icd10-section')}
            </div>
            ${renderOneClickActions(codesText, 'icd10')}
        `;
        
        // Add copy handlers
        setTimeout(() => {
            const container = elements.icd10Result;
            
            // Individual code copy buttons
            container.querySelectorAll('.icd10-item .copy-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const code = e.currentTarget.dataset.singleCode;
                    navigator.clipboard.writeText(code).then(() => {
                        showStatus(`Code ${code} kopiert!`, 'success');
                    });
                });
            });

            // One-click actions
            setupOneClickListeners(container, codesText, 'icd10');
            setupCollapsibleListeners(container);
        }, 0);
        
        return fullHtml;
    }

    // Setup Collapsible Listeners for accessibility
    function setupCollapsibleListeners(container) {
        container.querySelectorAll('.progressive-section').forEach(details => {
            const summary = details.querySelector('summary');
            if (summary) {
                details.addEventListener('toggle', () => {
                    const isOpen = details.open;
                    summary.setAttribute('aria-expanded', isOpen);
                    const icon = summary.querySelector('.summary-icon');
                    if (icon) {
                        icon.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
                    }
                });
            }
        });
    }

    // Extract result text for apply/copy actions
    function extractResultText(result) {
        if (typeof result === 'string') {
            return result;
        }
        
        let text = '';
        if (result.summary) {
            text += result.summary + '\n\n';
        }
        if (result.keyPoints && result.keyPoints.length > 0) {
            text += 'Schlüsselpunkte:\n' + result.keyPoints.map(p => '• ' + p).join('\n') + '\n\n';
        }
        if (result.suggestions && result.suggestions.length > 0) {
            text += 'Vorschläge:\n' + result.suggestions.map(s => '• ' + s).join('\n') + '\n\n';
        }
        return text.trim();
    }

    // Handle Messages from Extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'connectionStatus':
                const statusDot = elements.connectionStatus.querySelector('.status-dot');
                const statusText = elements.connectionStatus.querySelector('.status-text');
                const connectionBadge = document.getElementById('connection-badge');
                
                if (message.value) {
                    statusDot.classList.add('connected');
                    statusDot.classList.remove('error');
                    statusText.textContent = 'Verbunden';
                    
                    // Update connection badge
                    if (connectionBadge) {
                        connectionBadge.className = 'connection-status connected';
                        connectionBadge.innerHTML = '<span>Ollama verbunden</span>';
                    }
                    
                    showStatus('Mit Ollama verbunden', 'success');
                    announceToScreenReader('Verbindungsstatus: Verbunden', 'polite');
                } else {
                    statusDot.classList.add('error');
                    statusDot.classList.remove('connected');
                    statusText.textContent = 'Nicht verbunden';
                    
                    // Update connection badge
                    if (connectionBadge) {
                        connectionBadge.className = 'connection-status disconnected';
                        connectionBadge.innerHTML = '<span>Nicht verbunden</span>';
                    }
                    
                    showStatus('Ollama nicht verfügbar', 'error');
                    announceToScreenReader('Verbindungsstatus: Nicht verbunden', 'assertive');
                }
                break;
                
            case 'modelsList':
                availableModels = message.value || [];
                console.log('Verfügbare Modelle:', availableModels);
                renderModelSelector();
                break;
                
            case 'analysisResult':
                const duration = stopProcessingTimer('processing-timer');
                const analysisMetadata = message.metadata || {
                    confidence: message.confidence || 85,
                    processingTime: (duration / 1000).toFixed(1),
                    model: message.model || currentModel
                };
                elements.analyzeResult.innerHTML = renderAnalysisResult(message.value, analysisMetadata);
                showStatus('Analyse abgeschlossen', 'success');
                
                // Screenreader-Ankündigung
                const resultCount = message.value?.keyPoints?.length || 0;
                announceToScreenReader(
                    `Analyse abgeschlossen. ${resultCount} Schlüsselpunkte gefunden.`,
                    'polite'
                );
                setAriaBusy(false);
                break;
                
            case 'summaryResult':
                const summaryDuration = stopProcessingTimer('processing-timer');
                const summaryMetadata = message.metadata || {
                    confidence: message.confidence || 90,
                    processingTime: (summaryDuration / 1000).toFixed(1),
                    model: message.model || currentModel
                };
                elements.analyzeResult.innerHTML = renderSummaryResult(message.value, summaryMetadata);
                showStatus('Zusammenfassung erstellt', 'success');
                announceToScreenReader('Zusammenfassung erstellt', 'polite');
                setAriaBusy(false);
                break;
                
            case 'icd10Result':
                const icd10Duration = stopProcessingTimer('icd10-timer');
                const icd10Metadata = message.metadata || {
                    confidence: message.confidence || 75,
                    processingTime: (icd10Duration / 1000).toFixed(1),
                    model: message.model || currentModel
                };
                elements.icd10Result.innerHTML = renderICD10Results(message.value, icd10Metadata);
                showStatus('ICD-10 Codes gefunden', 'success');
                
                const codeCount = message.value?.length || 0;
                announceToScreenReader(
                    `${codeCount} ICD-10 Codes gefunden.`,
                    'polite'
                );
                setAriaBusy(false);
                break;
                
            case 'chatResult':
                stopProcessingTimer('processing-timer');
                setStreamingState(false);
                addChatMessage('assistant', message.value);
                showStatus('Antwort erhalten', 'success');
                announceToScreenReader('Antwort erhalten.', 'polite');
                setAriaBusy(false);
                break;
                
            case 'chatStream':
                // For streaming, update the last message
                if (!elements.chatHistory.querySelector('.chat-message.assistant:last-child')) {
                    addChatMessage('assistant', message.value, true);
                } else {
                    const lastMsg = elements.chatHistory.querySelector('.chat-message.assistant:last-child .content');
                    lastMsg.textContent += message.value;
                    elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
                }
                // Debounced announcement für Streaming (nicht jedes Chunk)
                debouncedAnnounce('Empfange Antwort...', 'polite', 1000);
                break;
                
            case 'chatComplete':
                stopProcessingTimer('processing-timer');
                setStreamingState(false);
                showStatus('Antwort vollständig', 'success');
                announceToScreenReader('Antwort vollständig empfangen.', 'polite');
                setAriaBusy(false);
                break;
                
            case 'chatCancelled':
                setStreamingState(false);
                // Save partial response to history if any
                const assistantMsg = elements.chatHistory.querySelector('.chat-message.assistant:last-child');
                if (assistantMsg) {
                    const content = assistantMsg.querySelector('.content').textContent;
                    if (content.trim()) {
                        chatHistory.push({ 
                            role: 'assistant', 
                            content: content,
                            timestamp: new Date().toLocaleTimeString('de-DE', {
                                hour: '2-digit',
                                minute: '2-digit'
                            })
                        });
                    }
                }
                showStatus(message.value || 'Analyse abgebrochen', 'warning');
                break;
                
            case 'setInput':
                elements.analyzeInput.value = message.value;
                switchTab('analyze');
                break;
                
            case 'status':
                showStatus(message.value);
                // Status-Updates polite (nur wichtige)
                if (message.value && !message.value.includes('...')) {
                    announceToScreenReader(message.value, 'polite');
                }
                break;
                
            case 'error':
                // Stop Timer bei Fehler
                stopProcessingTimer('processing-timer');
                stopProcessingTimer('icd10-timer');
                
                setStreamingState(false);
                showStatus(message.value, 'error');
                
                // Re-enable model selector if model change failed
                if (message.metadata && message.metadata.code === 'MODEL_CHANGE_FAILED') {
                    const modelSelect = document.querySelector('#modelSelect');
                    if (modelSelect) {
                        modelSelect.disabled = false;
                    }
                }
                break;
                
            case 'undoAvailable':
                showUndoToast(message.value);
                announceToScreenReader(
                    `Rückgängig verfügbar: ${message.value.description}. 10 Minuten verfügbar.`,
                    'polite'
                );
                break;

            case 'undoCountdown':
                updateUndoCountdown(message.value);
                break;

            case 'undoExpired':
                hideUndoToast(message.value);
                break;

            case 'undoCompleted':
                hideUndoToast(message.value);
                showStatus('✓ Rückgängig gemacht', 'success');
                break;
                
            case 'modelChanged':
                const modelSelectChanged = document.querySelector('#modelSelect');
                if (modelSelectChanged) {
                    modelSelectChanged.disabled = false;
                    // Update das ausgewählte Modell
                    modelSelectChanged.value = message.value.model;
                }
                
                // Update current model
                currentModel = message.value.model;
                
                // Zeige Bestätigung im UI
                showStatus(`Modell gewechselt zu: ${message.value.model}`, 'success');
                break;
                
            case 'currentModel':
                // Initialisiere Selector mit aktuellem Modell
                const modelSelectInit = document.querySelector('#modelSelect');
                if (modelSelectInit && message.value) {
                    modelSelectInit.value = message.value;
                }
                // Update current model variable
                currentModel = message.value;
                break;
        }
    });

    // ==================== TIME-LIMITED UNDO SYSTEM ====================

    function showUndoToast(undoInfo) {
        let toast = document.getElementById('undo-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'undo-toast';
            toast.className = 'undo-toast';
            document.body.appendChild(toast);
        }
        
        toast.innerHTML = `
            <span class="undo-text">${escapeHtml(undoInfo.description)}</span>
            <button class="undo-button" data-undo-id="${escapeHtml(undoInfo.id)}">
                Rückgängig (${undoInfo.remainingTimeFormatted})
            </button>
        `;
        
        toast.classList.add('visible');
        
        // Event Listener
        const undoBtn = toast.querySelector('.undo-button');
        undoBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'undo', value: undoInfo.id });
        });
    }

    function updateUndoCountdown(undoInfo) {
        const toast = document.getElementById('undo-toast');
        if (!toast) return;
        
        const btn = toast.querySelector('.undo-button');
        if (btn && btn.dataset.undoId === undoInfo.id) {
            btn.textContent = `Rückgängig (${undoInfo.remainingTimeFormatted})`;
            
            // Visuelles Feedback bei wenig Zeit (< 2 Min)
            if (undoInfo.remainingTimeMs < 120000) {
                btn.classList.add('urgent');
            }
        }
    }

    function hideUndoToast(undoId) {
        const toast = document.getElementById('undo-toast');
        if (toast) {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }
    }

    // Initialize on load
    init();

    // ==================== TRUST BADGE INTERACTIONS ====================

    /**
     * Trust Badge Interactions - Touch Support & Screenreader
     */
    function initTrustBadges() {
        const localBadge = document.getElementById('local-processing-badge');
        const dsgvoBadge = document.getElementById('dsgvo-badge');
        
        // Optional: Click-to-expand für Touch-Geräte
        if (localBadge) {
            localBadge.addEventListener('click', (e) => {
                // Auf Touch-Geräten: Toggle tooltip
                if (window.matchMedia('(pointer: coarse)').matches) {
                    localBadge.classList.toggle('tooltip-visible');
                }
            });
        }
        
        // Ankündigung für Screenreader beim ersten Besuch
        setTimeout(() => {
            announceToScreenReader(
                'Medical AI Assistent geladen. Alle Daten werden lokal verarbeitet. DSGVO-konform.',
                'polite'
            );
        }, 1000);
    }

    // Initialize Trust Badges
    initTrustBadges();
})();
