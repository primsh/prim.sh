// pay.prim.sh — client-side funding page logic
(() => {
  // ── URL params ─────────────────────────────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const toAddress = params.get("to");
  const urlAmount = params.get("amount");

  // ── DOM refs ───────────────────────────────────────────────────────────
  const formSection = document.getElementById("form-section");
  const fundBtn = document.getElementById("fund-btn");
  const customInput = document.getElementById("custom-amount");
  const presetBtns = document.querySelectorAll(".amount-btn");
  const onrampContainer = document.getElementById("onramp-container");
  const onrampIframe = document.getElementById("onramp-iframe");
  const successState = document.getElementById("success-state");
  const errorState = document.getElementById("error-state");
  const errorMsg = document.getElementById("error-msg");

  // ── State ──────────────────────────────────────────────────────────────
  let selectedAmount = 10;

  // ── Init from URL params ───────────────────────────────────────────────
  if (urlAmount) {
    const parsed = Number.parseFloat(urlAmount);
    if (parsed > 0) {
      selectedAmount = parsed;
      let matched = false;
      for (const btn of presetBtns) {
        btn.classList.remove("active");
        if (Number.parseInt(btn.dataset.amount, 10) === parsed) {
          btn.classList.add("active");
          matched = true;
        }
      }
      if (!matched) {
        customInput.value = parsed;
      }
    }
  }

  updateButtonLabel();

  // ── Amount selection ───────────────────────────────────────────────────
  for (const btn of presetBtns) {
    btn.addEventListener("click", () => {
      for (const b of presetBtns) b.classList.remove("active");
      btn.classList.add("active");
      customInput.value = "";
      selectedAmount = Number.parseInt(btn.dataset.amount, 10);
      updateButtonLabel();
    });
  }

  customInput.addEventListener("input", () => {
    const val = Number.parseFloat(customInput.value);
    if (val > 0) {
      for (const b of presetBtns) b.classList.remove("active");
      selectedAmount = val;
    } else {
      selectedAmount = 10;
      for (const b of presetBtns) {
        if (b.dataset.amount === "10") b.classList.add("active");
      }
    }
    updateButtonLabel();
  });

  function updateButtonLabel() {
    const display =
      selectedAmount % 1 === 0 ? `$${selectedAmount}` : `$${selectedAmount.toFixed(2)}`;
    fundBtn.textContent = `Add ${display} to balance`;
  }

  // ── Coinbase Onramp ────────────────────────────────────────────────────
  const ONRAMP_APP_ID = "pay-prim-sh";

  fundBtn.addEventListener("click", () => {
    if (!toAddress) {
      showError("Missing wallet address. This page requires a ?to= parameter.");
      return;
    }
    if (selectedAmount <= 0) {
      showError("Please enter a valid amount.");
      return;
    }
    launchOnramp();
  });

  function launchOnramp() {
    const addresses = {};
    addresses[toAddress] = ["base"];

    const onrampUrl = `https://pay.coinbase.com/buy/select-asset?appId=${encodeURIComponent(ONRAMP_APP_ID)}&addresses=${encodeURIComponent(JSON.stringify(addresses))}&assets=${encodeURIComponent(JSON.stringify(["USDC"]))}&defaultNetwork=base&defaultExperience=buy&presetFiatAmount=${encodeURIComponent(selectedAmount.toString())}&fiatCurrency=USD`;

    formSection.style.display = "none";
    onrampContainer.classList.add("visible");
    onrampIframe.src = onrampUrl;
  }

  // ── Message listener (iframe → parent communication) ───────────────────
  window.addEventListener("message", (event) => {
    if (event.origin !== "https://pay.coinbase.com") return;

    const data = event.data;
    if (!data) return;

    if (data.eventName === "success" || data.type === "success") {
      showSuccess();
      notifyParent("success");
    }

    if (data.eventName === "exit" || data.type === "exit") {
      resetToForm();
    }

    if (data.eventName === "error" || data.type === "error") {
      showError(data.message || "Payment failed. Please try again.");
      notifyParent("error");
    }
  });

  // ── State transitions ──────────────────────────────────────────────────
  function showSuccess() {
    onrampContainer.classList.remove("visible");
    formSection.style.display = "none";
    successState.classList.add("visible");
    errorState.classList.remove("visible");
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    onrampContainer.classList.remove("visible");
    formSection.style.display = "none";
    errorState.classList.add("visible");
    successState.classList.remove("visible");
    setTimeout(() => resetToForm(), 4000);
  }

  function resetToForm() {
    onrampContainer.classList.remove("visible");
    onrampIframe.src = "";
    errorState.classList.remove("visible");
    successState.classList.remove("visible");
    formSection.style.display = "";
  }

  // ── Parent window communication (for iframe embed in chat.prim.sh) ─────
  function notifyParent(status) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { source: "pay.prim.sh", status, amount: selectedAmount },
        "*",
      );
    }
  }
})();
