// pay.prim.sh — client-side funding page logic
(function () {
  "use strict";

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
    const parsed = parseFloat(urlAmount);
    if (parsed > 0) {
      selectedAmount = parsed;
      // Activate matching preset or fill custom input
      let matched = false;
      presetBtns.forEach(function (btn) {
        btn.classList.remove("active");
        if (parseInt(btn.dataset.amount, 10) === parsed) {
          btn.classList.add("active");
          matched = true;
        }
      });
      if (!matched) {
        customInput.value = parsed;
      }
    }
  }

  updateButtonLabel();

  // ── Amount selection ───────────────────────────────────────────────────
  presetBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      presetBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      customInput.value = "";
      selectedAmount = parseInt(btn.dataset.amount, 10);
      updateButtonLabel();
    });
  });

  customInput.addEventListener("input", function () {
    var val = parseFloat(customInput.value);
    if (val > 0) {
      presetBtns.forEach(function (b) { b.classList.remove("active"); });
      selectedAmount = val;
    } else {
      // Fall back to default if cleared
      selectedAmount = 10;
      presetBtns.forEach(function (b) {
        if (b.dataset.amount === "10") b.classList.add("active");
      });
    }
    updateButtonLabel();
  });

  function updateButtonLabel() {
    var display = selectedAmount % 1 === 0
      ? "$" + selectedAmount
      : "$" + selectedAmount.toFixed(2);
    fundBtn.textContent = "Add " + display + " to balance";
  }

  // ── Coinbase Onramp ────────────────────────────────────────────────────
  // Uses the Coinbase Onramp URL widget (no SDK dependency).
  // Docs: https://docs.cdp.coinbase.com/onramp/docs/getting-started

  var ONRAMP_APP_ID = "pay-prim-sh";

  fundBtn.addEventListener("click", function () {
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
    var addresses = {};
    addresses[toAddress] = ["base"];

    var onrampUrl = "https://pay.coinbase.com/buy/select-asset" +
      "?appId=" + encodeURIComponent(ONRAMP_APP_ID) +
      "&addresses=" + encodeURIComponent(JSON.stringify(addresses)) +
      "&assets=" + encodeURIComponent(JSON.stringify(["USDC"])) +
      "&defaultNetwork=base" +
      "&defaultExperience=buy" +
      "&presetFiatAmount=" + encodeURIComponent(selectedAmount.toString()) +
      "&fiatCurrency=USD";

    formSection.style.display = "none";
    onrampContainer.classList.add("visible");
    onrampIframe.src = onrampUrl;
  }

  // ── Message listener (iframe → parent communication) ───────────────────
  window.addEventListener("message", function (event) {
    // Coinbase Onramp posts messages on success/failure
    if (event.origin !== "https://pay.coinbase.com") return;

    var data = event.data;
    if (!data) return;

    if (data.eventName === "success" || data.type === "success") {
      showSuccess();
      notifyParent("success");
    }

    if (data.eventName === "exit" || data.type === "exit") {
      // User closed the widget — go back to form
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

    // Allow retry after 3s
    setTimeout(function () {
      resetToForm();
    }, 4000);
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
        { source: "pay.prim.sh", status: status, amount: selectedAmount },
        "*"
      );
    }
  }
})();
