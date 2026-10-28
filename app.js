(() => {
  "use strict";

  const STORAGE_KEY = "shop-ledger-sales-v1";
  const HISTORY_KEY = "mk_history";
  const todayKey = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  };

  const state = {
    sales: loadSales(),
    history: loadHistory(),
    activeTab: "sales",
    entryType: "cash",
    isVoiceEntry: false,
    voiceTranscript: "",
    voiceDataUrl: null,
    recordingPromise: Promise.resolve(),
    recordingResolve: null,
    recorder: null,
    recorderStream: null,
    recorderChunks: [],
    recognition: null,
    toastTimer: null,
    playingAudio: null,
  };

  const el = (id) => document.getElementById(id);
  const salesTab = el("salesTab");
  const owingTab = el("owingTab");
  const ledgerContent = el("ledgerContent");
  const saleModal = el("saleModal");
  const saleForm = el("saleForm");
  const customerField = el("customerField");
  const customerInput = el("customerInput");
  const voiceStatus = el("voiceStatus");
  const voiceStatusTitle = el("voiceStatusTitle");
  const voiceStatusText = el("voiceStatusText");
  const retryVoiceButton = el("retryVoiceButton");
  const micButton = el("micButton");
  const voiceTypeChooser = el("voiceTypeChooser");
  const closeDayButton = el("closeDayButton");
  const historyModal = el("historyModal");
  const historyContent = el("historyContent");

  function loadSales() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(saved)
        ? saved.filter((sale) => sale && sale.id && sale.amount)
        : [];
    } catch (error) {
      return [];
    }
  }

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(saved)
        ? saved.filter((day) => day && day.date && Array.isArray(day.sales))
        : [];
    } catch (error) {
      return [];
    }
  }

  function persistHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
      return true;
    } catch (error) {
      showToast("History could not be saved on this phone.");
      return false;
    }
  }

  function persistSales() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sales));
      return true;
    } catch (error) {
      // A recording can be large on low-storage phones. Keep the sale even if the audio must be trimmed.
      try {
        state.sales = state.sales.map((sale) => ({
          ...sale,
          voiceDataUrl: null,
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sales));
        showToast("Sale saved. The phone could not keep the voice recording.");
      } catch (secondError) {
        showToast("Sale is visible, but phone storage is full.");
      }
      return false;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>'"]/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[character],
    );
  }

  function formatNaira(value) {
    return `₦${Math.round(Number(value) || 0).toLocaleString("en-NG")}`;
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat("en-NG", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(timestamp));
  }

  function formatDate() {
    return new Intl.DateTimeFormat("en-NG", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
  }

  function showToast(message) {
    const toast = el("toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 3000);
  }

  function playSavedSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        880,
        context.currentTime + 0.09,
      );
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.18,
      );
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
      oscillator.onended = () => context.close();
    } catch (error) {
      // Sound is a nice-to-have; the save itself never depends on it.
    }
  }

  function getTodaySales() {
    return state.sales
      .filter((sale) => sale.dateKey === todayKey() && !sale.archived)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function getOwingSales() {
    return state.sales.filter((sale) => sale.type === "debt" && !sale.paid);
  }

  function render() {
    const todaySales = getTodaySales();
    const owingSales = getOwingSales();
    const todayTotal = todaySales.reduce(
      (total, sale) => total + Number(sale.amount),
      0,
    );
    el("todayTotal").textContent = formatNaira(todayTotal);
    el("todayDate").textContent = formatDate();
    el("salesCount").textContent = String(todaySales.length);
    el("owingCount").textContent = String(owingSales.length);
    el("historyCount").textContent = String(state.history.length);
    salesTab.classList.toggle("is-active", state.activeTab === "sales");
    owingTab.classList.toggle("is-active", state.activeTab === "owing");
    salesTab.setAttribute(
      "aria-selected",
      state.activeTab === "sales" ? "true" : "false",
    );
    owingTab.setAttribute(
      "aria-selected",
      state.activeTab === "owing" ? "true" : "false",
    );
    ledgerContent.innerHTML =
      state.activeTab === "sales"
        ? renderSales(todaySales)
        : renderOwing(owingSales);
  }

  function renderHistory() {
    if (!state.history.length) {
      historyContent.innerHTML = renderEmpty(
        "No history yet",
        "Close shop at the end of a selling day and its total will appear here.",
      );
      return;
    }
    const history = state.history
      .map((day, index) => ({ day, index }))
      .reverse();
    historyContent.innerHTML = `<div class="history-list">${history
      .map(({ day, index }) => {
        const items = day.sales
          .map(
            (sale) =>
              `<div class="history-sale-row"><div><strong>${escapeHtml(sale.item)}</strong><small>${sale.type === "debt" ? `Owes ${escapeHtml(sale.customer)}` : "Cash sale"} · ${escapeHtml(sale.createdAt ? formatTime(sale.createdAt) : day.time)}</small></div><b>${formatNaira(sale.amount)}</b></div>`,
          )
          .join("");
        return `<article class="history-card"><button class="history-summary" type="button" data-history-index="${index}" aria-expanded="false"><span><strong>${escapeHtml(day.date)}</strong><small>Closed at ${escapeHtml(day.time)}</small></span><b>${formatNaira(day.total)}</b><span class="history-chevron" aria-hidden="true">⌄</span></button><div class="history-sales" hidden>${items || '<p class="history-empty">No sales recorded.</p>'}</div></article>`;
      })
      .join("")}</div>`;
  }

  function updateNetworkStatus() {
    const online = navigator.onLine;
    const dot = el("statusDot");
    dot.style.background = online ? "#16A34A" : "#D4A017";
    dot.style.boxShadow = online
      ? "0 0 0 4px rgba(22, 163, 74, .13)"
      : "0 0 0 4px rgba(212, 160, 23, .16)";
    el("statusText").textContent = online ? "Online" : "Offline";
  }

  function renderEmpty(title, description) {
    return `<div class="empty-state"><div class="empty-mark" aria-hidden="true">₦</div><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div></div>`;
  }

  function renderVoiceButton(sale) {
    if (!sale.voiceDataUrl) return "";
    return `<button class="play-button" type="button" data-play-id="${escapeHtml(sale.id)}" aria-label="Play original voice recording">▶</button>`;
  }

  function renderSales(sales) {
    if (!sales.length)
      return renderEmpty(
        "No sales yet today",
        "Tap Cash Sale, Debt Sale, or speak a sale to start your day.",
      );
    const cashTotal = sales
      .filter((sale) => sale.type === "cash")
      .reduce((total, sale) => total + Number(sale.amount), 0);
    const debtTotal = sales
      .filter((sale) => sale.type === "debt")
      .reduce((total, sale) => total + Number(sale.amount), 0);
    const list = sales
      .map(
        (sale) => `
      <article class="sale-card ${sale.type === "debt" ? "is-debt" : "is-cash"}">
        <span class="sale-marker" aria-hidden="true"></span>
        <div class="sale-copy">
          <div class="sale-topline"><span class="sale-item">${escapeHtml(sale.item)}</span><span class="sale-time">${escapeHtml(formatTime(sale.createdAt))}</span></div>
          <div class="sale-meta"><span class="sale-tag">${sale.type === "debt" ? `Owes ${escapeHtml(sale.customer)}` : "Paid now"}</span>${renderVoiceButton(sale)}</div>
        </div>
        <strong class="sale-amount">${formatNaira(sale.amount)}</strong>
      </article>`,
      )
      .join("");
    return `<div class="sale-list">${list}</div><div class="list-footer"><div class="stat-box"><span class="stat-label">Total cash sales</span><strong class="stat-value">${formatNaira(cashTotal)}</strong></div><div class="stat-box"><span class="stat-label">Total debt sales</span><strong class="stat-value">${formatNaira(debtTotal)}</strong></div></div>`;
  }

  function groupOwingSales(sales) {
    const groups = new Map();
    sales.forEach((sale) => {
      const key = String(sale.customer || "Unknown customer")
        .trim()
        .toLowerCase();
      if (!groups.has(key))
        groups.set(key, {
          name: sale.customer || "Unknown customer",
          sales: [],
        });
      groups.get(key).sales.push(sale);
    });
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function renderOwing(sales) {
    if (!sales.length)
      return renderEmpty(
        "Nobody owing today",
        "Unpaid debt sales will gather here by customer.",
      );
    const groups = groupOwingSales(sales);
    return `<div class="owing-list">${groups
      .map((group) => {
        const total = group.sales.reduce(
          (sum, sale) => sum + Number(sale.amount),
          0,
        );
        const groupIds = group.sales.map((sale) => sale.id).join("|");
        const items = group.sales
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .map(
            (sale) => `
        <div class="owed-item"><span>${escapeHtml(sale.item)} <small>· ${escapeHtml(formatTime(sale.createdAt))}</small></span><div class="owed-item-actions"><strong>${formatNaira(sale.amount)}</strong>${renderVoiceButton(sale)}</div></div>`,
          )
          .join("");
        return `<article class="customer-card"><div class="customer-header"><div><h3 class="customer-name">${escapeHtml(group.name)}</h3><p class="customer-summary">${group.sales.length} ${group.sales.length === 1 ? "item" : "items"} owing</p></div><strong class="customer-total">${formatNaira(total)}</strong></div><div class="owed-items">${items}</div><button class="mark-paid-button" type="button" data-paid-ids="${escapeHtml(groupIds)}">Mark all paid</button></article>`;
      })
      .join("")}</div>`;
  }

  function setEntryType(type) {
    state.entryType = type;
    customerField.hidden = type !== "debt";
    customerInput.required = type === "debt";
    el("voiceCashType").classList.toggle("is-selected", type === "cash");
    el("voiceDebtType").classList.toggle("is-selected", type === "debt");
    el("formHint").textContent =
      type === "debt"
        ? "This stays in Owing Me until the customer pays."
        : "Cash sales are saved instantly on this phone.";
  }

  function openSaleModal(type, fromVoice = false) {
    state.entryType = type;
    state.isVoiceEntry = fromVoice;
    state.voiceTranscript = "";
    state.voiceDataUrl = null;
    el("modalKicker").textContent = fromVoice ? "VOICE SALE" : "NEW SALE";
    el("modalTitle").textContent = fromVoice
      ? "Speak a sale"
      : type === "debt"
        ? "Debt sale"
        : "Cash sale";
    voiceTypeChooser.hidden = !fromVoice;
    voiceStatus.hidden = !fromVoice;
    voiceStatus.classList.remove("is-success");
    retryVoiceButton.hidden = !fromVoice;
    voiceStatusTitle.textContent = fromVoice ? "Listening…" : "";
    voiceStatusText.textContent = fromVoice
      ? "Say: Sold rice 2000 to Emeka debt"
      : "";
    saleForm.reset();
    setEntryType(type);
    saleModal.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => el("itemInput").focus(), 60);
  }

  function closeSaleModal() {
    stopVoiceCapture();
    saleModal.hidden = true;
    document.body.style.overflow = "";
    state.isVoiceEntry = false;
    state.voiceDataUrl = null;
    state.voiceTranscript = "";
    micButton.classList.remove("is-listening");
  }

  async function addSale() {
    const item = el("itemInput").value.trim();
    const amount = Number(el("amountInput").value);
    const customer = customerInput.value.trim();
    if (!item) {
      showToast("Add the item name first.");
      el("itemInput").focus();
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Add a valid amount.");
      el("amountInput").focus();
      return;
    }
    if (state.entryType === "debt" && !customer) {
      showToast("Add the customer name.");
      customerInput.focus();
      return;
    }
    await stopVoiceCapture();

    const sale = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: state.entryType,
      item,
      amount,
      customer: state.entryType === "debt" ? customer : "",
      createdAt: new Date().toISOString(),
      dateKey: todayKey(),
      archived: false,
      paid: false,
      voiceDataUrl: state.voiceDataUrl,
      transcript: state.voiceTranscript || "",
    };
    state.sales.push(sale);
    persistSales();
    closeSaleModal();
    render();
    playSavedSound();
    showToast("Saved! Sale added.");
  }

  function normalizeTranscript(transcript) {
    return transcript
      .replace(/[₦]/g, " ")
      .replace(/\bnaira\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseVoiceSale(transcript) {
    const normalized = normalizeTranscript(transcript);
    const amountMatch = normalized.match(/\d[\d,]*(?:\.\d+)?/);
    if (!amountMatch) return null;
    const amount = Number(amountMatch[0].replace(/,/g, ""));
    if (!amount) return null;

    // Check if the user said a keyword, OR if the app is already in debt mode
    const hasDebtKeyword = /\b(debt|credit|owe|owing)\b/i.test(normalized);
    const isDebt = hasDebtKeyword || state.entryType === "debt";

    let before = normalized.slice(0, amountMatch.index).trim();
    let after = normalized
      .slice(amountMatch.index + amountMatch[0].length)
      .trim();
    before = before
      .replace(/^(sold|sell|sale|add|record)\s+/i, "")
      .replace(/\s+(for|to)$/i, "")
      .trim();
    after = after
      .replace(/\b(debt|credit|owe|owing|cash|sale)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    let item = before;
    let customer = "";
    if (isDebt) {
      customer = after.replace(/^to\s+/i, "").trim();
      item = item.replace(/\s+to$/i, "").trim();

      // If the user says the name before the amount (e.g., "Sold rice to Emeka 2000")
      if (!customer && item.includes(" to ")) {
        const parts = item.split(" to ");
        customer = parts.pop().trim();
        item = parts.join(" to ").trim();
      }
    }
    return { amount, item, customer, type: isDebt ? "debt" : "cash" };
  }

  function updateVoiceStatus(title, text, success = false) {
    voiceStatusTitle.textContent = title;
    voiceStatusText.textContent = text;
    voiceStatus.classList.toggle("is-success", success);
  }

  function applyVoiceResult(transcript) {
    state.voiceTranscript = transcript;
    const parsed = parseVoiceSale(transcript);
    if (!parsed || !parsed.item) {
      updateVoiceStatus(
        "I heard you",
        "Please check the fields below and finish the sale.",
        false,
      );
      showToast("I could not find the item and amount. Please check the form.");
      return;
    }
    el("itemInput").value = parsed.item;
    el("amountInput").value = parsed.amount;
    if (parsed.type === "debt") {
      customerInput.value = parsed.customer;
      setEntryType("debt");
    } else {
      setEntryType("cash");
    }
    updateVoiceStatus("Sale details filled", `Heard: “${transcript}”`, true);
  }

  function isMobileBrowser() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  }

  function beginSpeechRecognition(recorderReady) {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      updateVoiceStatus(
        "Voice typing is not available here",
        recorderReady
          ? "Your recording is ready. Fill the fields below."
          : "Fill the fields below manually, or use Chrome or Safari with microphone support.",
      );
      micButton.classList.remove("is-listening");
      retryVoiceButton.hidden = true;
      return;
    }

    try {
      state.recognition = new SpeechRecognition();
      // en-US is supported more consistently than en-NG by mobile Web Speech engines.
      state.recognition.lang = "en-NG";
      state.recognition.interimResults = false;
      state.recognition.continuous = false;
      state.recognition.maxAlternatives = 1;
      updateVoiceStatus("Listening…", "Say: Sold rice 2000 to Emeka debt");
      state.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        applyVoiceResult(transcript);
        stopVoiceCapture();
      };
      state.recognition.onerror = (event) => {
        stopVoiceCapture();
        const messages = {
          "not-allowed":
            "Allow microphone access in your browser settings, then tap Retry.",
          "service-not-allowed":
            "Speech access is blocked by this browser. Try Chrome or Safari.",
          "audio-capture":
            "Another app is using the microphone. Close it, then tap Retry.",
          "no-speech":
            "No speech detected. Speak closer to the phone, then tap Retry.",
          network:
            "The browser voice service is unavailable. Check permission or use manual entry.",
        };
        updateVoiceStatus(
          "Could not hear that",
          messages[event.error] ||
            "Check microphone permission, then tap Try again.",
        );
        retryVoiceButton.hidden = false;
      };
      state.recognition.onend = () => {
        micButton.classList.remove("is-listening");
      };
      state.recognition.start();
    } catch (error) {
      updateVoiceStatus(
        "Microphone is ready",
        recorderReady
          ? "Your recording is kept. Tap Retry, then speak clearly."
          : "Tap Retry and speak clearly after the listening message appears.",
      );
      micButton.classList.remove("is-listening");
      retryVoiceButton.hidden = false;
    }
  }

  async function startVoiceCapture() {
    openSaleModal(state.activeTab === "owing" ? "debt" : "cash", true);
    micButton.classList.add("is-listening");
    // Mobile browsers often let MediaRecorder monopolize the microphone and starve SpeechRecognition.
    // Prioritize reliable voice-to-form capture on phones; desktop keeps the original playback recording.
    if (!isMobileBrowser()) {
      try {
        if (
          navigator.mediaDevices &&
          navigator.mediaDevices.getUserMedia &&
          window.MediaRecorder
        ) {
          state.recorderStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          const recordingStream = state.recorderStream;
          state.recorder = new MediaRecorder(recordingStream);
          const recordingMimeType = state.recorder.mimeType || "audio/webm";
          state.recorderChunks = [];
          state.recordingPromise = new Promise((resolve) => {
            state.recordingResolve = resolve;
          });
          state.recorder.ondataavailable = (event) => {
            if (event.data.size) state.recorderChunks.push(event.data);
          };
          state.recorder.onstop = () => {
            const finishRecording = () => {
              recordingStream.getTracks().forEach((track) => track.stop());
              if (state.recordingResolve) state.recordingResolve();
              state.recordingResolve = null;
            };
            if (state.recorderChunks.length) {
              const reader = new FileReader();
              reader.onloadend = () => {
                state.voiceDataUrl = reader.result;
                finishRecording();
              };
              reader.readAsDataURL(
                new Blob(state.recorderChunks, { type: recordingMimeType }),
              );
            } else {
              finishRecording();
            }
          };
          state.recorder.start();
          recorderReady = true;
        }
      } catch (error) {
        if (state.recordingResolve) state.recordingResolve();
        state.recordingResolve = null;
        if (state.recorderStream)
          state.recorderStream.getTracks().forEach((track) => track.stop());
        state.recordingPromise = Promise.resolve();
        state.recorder = null;
        state.recorderStream = null;
      }
    }
    beginSpeechRecognition(recorderReady);
  }

  function stopVoiceCapture() {
    const pendingRecording = state.recordingPromise || Promise.resolve();
    if (state.recognition) {
      try {
        state.recognition.stop();
      } catch (error) {
        /* already stopped */
      }
      state.recognition = null;
    }
    if (state.recorder && state.recorder.state !== "inactive") {
      try {
        state.recorder.stop();
      } catch (error) {
        /* already stopped */
      }
    }
    if (
      state.recorderStream &&
      (!state.recorder || state.recorder.state === "inactive")
    ) {
      state.recorderStream.getTracks().forEach((track) => track.stop());
    }
    state.recorder = null;
    state.recorderStream = null;
    micButton.classList.remove("is-listening");
    return pendingRecording;
  }

  function openHistory() {
    renderHistory();
    historyModal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeHistory() {
    historyModal.hidden = true;
    document.body.style.overflow = "";
  }

  function playRecording(sale, button) {
    if (!sale || !sale.voiceDataUrl) return;
    if (state.playingAudio) {
      state.playingAudio.pause();
      state.playingAudio = null;
      document
        .querySelectorAll(".play-button.is-playing")
        .forEach((node) => node.classList.remove("is-playing"));
    }
    const audio = new Audio(sale.voiceDataUrl);
    state.playingAudio = audio;
    button.classList.add("is-playing");
    audio.onended = () => {
      button.classList.remove("is-playing");
      state.playingAudio = null;
    };
    audio.onerror = () => {
      button.classList.remove("is-playing");
      state.playingAudio = null;
      showToast("This recording is no longer available.");
    };
    audio.play().catch(() => showToast("Tap again to play the recording."));
  }

  salesTab.addEventListener("click", () => {
    state.activeTab = "sales";
    render();
  });
  owingTab.addEventListener("click", () => {
    state.activeTab = "owing";
    render();
  });
  el("cashSaleButton").addEventListener("click", () => openSaleModal("cash"));
  el("debtSaleButton").addEventListener("click", () => openSaleModal("debt"));
  micButton.addEventListener("click", startVoiceCapture);
  retryVoiceButton.addEventListener("click", () => {
    stopVoiceCapture();
    state.voiceTranscript = "";
    state.voiceDataUrl = null;
    retryVoiceButton.hidden = false;
    micButton.classList.add("is-listening");
    beginSpeechRecognition(false);
  });
  el("closeModalButton").addEventListener("click", closeSaleModal);
  el("cancelModalButton").addEventListener("click", closeSaleModal);
  saleModal.addEventListener("click", (event) => {
    if (event.target === saleModal) closeSaleModal();
  });
  saleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addSale();
  });
  el("voiceCashType").addEventListener("click", () => setEntryType("cash"));
  el("voiceDebtType").addEventListener("click", () => setEntryType("debt"));
  closeDayButton.addEventListener("click", () => {
    const todaySales = getTodaySales();
    if (!todaySales.length) {
      showToast("There are no sales to clear today.");
      return;
    }
    if (
      !window.confirm(
        "Close shop and save today’s list to History? Unpaid debts will stay in Owing Me.",
      )
    )
      return;
    const now = new Date();
    const totalToday = todaySales.reduce(
      (total, sale) => total + Number(sale.amount),
      0,
    );
    state.history.push({
      date: now.toLocaleDateString("en-NG"),
      time: now.toLocaleTimeString(),
      total: totalToday,
      sales: todaySales.map((sale) => ({ ...sale })),
    });
    persistHistory();
    const today = todayKey();
    state.sales = state.sales.map((sale) =>
      sale.dateKey === today ? { ...sale, archived: true } : sale,
    );
    persistSales();
    render();
    showToast("Saved to History. Today is clear; unpaid debts are safe.");
  });
  el("historyButton").addEventListener("click", openHistory);
  el("closeHistoryButton").addEventListener("click", closeHistory);
  historyModal.addEventListener("click", (event) => {
    if (event.target === historyModal) closeHistory();
  });
  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);

  ledgerContent.addEventListener("click", (event) => {
    const playButton = event.target.closest("[data-play-id]");
    if (playButton) {
      const sale = state.sales.find(
        (item) => item.id === playButton.dataset.playId,
      );
      playRecording(sale, playButton);
      return;
    }
    const paidButton = event.target.closest("[data-paid-ids]");
    if (paidButton) {
      const ids = paidButton.dataset.paidIds.split("|");
      if (!window.confirm("Mark this customer’s debts as paid?")) return;
      state.sales = state.sales.map((sale) =>
        ids.includes(sale.id) ? { ...sale, paid: true } : sale,
      );
      persistSales();
      render();
      showToast("Marked as paid.");
    }
  });

  historyContent.addEventListener("click", (event) => {
    const summary = event.target.closest("[data-history-index]");
    if (!summary) return;
    const card = summary.closest(".history-card");
    const details = card.querySelector(".history-sales");
    const isOpen = !details.hidden;
    details.hidden = isOpen;
    summary.setAttribute("aria-expanded", String(!isOpen));
    card.classList.toggle("is-open", !isOpen);
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js?v=5", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {});
    });
  }

  updateNetworkStatus();
  render();
})();
