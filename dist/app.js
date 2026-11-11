const form = document.querySelector("#quote-form"),
  input = document.querySelector("#quotes"),
  list = document.querySelector("#file-list");
const error = document.querySelector("#error"),
  zone = document.querySelector("#drop-zone");
let files = [],
  busy = false,
  state = null;
const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();
function renderFiles() {
  list.replaceChildren();
  files.forEach((file, index) => {
    const item = document.createElement("li"),
      name = document.createElement("span"),
      remove = document.createElement("button");
    name.textContent = file.name;
    remove.type = "button";
    remove.textContent = "×";
    remove.disabled = Boolean(state) || busy;
    remove.setAttribute("aria-label", `Remove ${file.name}`);
    remove.onclick = () => {
      files.splice(index, 1);
      renderFiles();
    };
    item.append(name, remove);
    list.append(item);
  });
}
function addFiles(incoming) {
  if (busy) return;
  const problems = [];
  for (const file of incoming) {
    if (files.length >= 5) {
      problems.push("Add up to 5 files for one quote.");
      break;
    }
    if (
      !/\.(pdf|jpe?g|png)$/i.test(file.name) ||
      !["application/pdf", "image/jpeg", "image/png"].includes(file.type)
    ) {
      problems.push(`${file.name}: use PDF, JPG or PNG.`);
      continue;
    }
    if (file.size < 1 || file.size > 20 * 1024 * 1024) {
      problems.push(`${file.name}: use a nonempty file up to 20 MB.`);
      continue;
    }
    if (!files.some((f) => f.name === file.name && f.size === file.size))
      files.push(file);
  }
  error.textContent = problems.join(" ");
  renderFiles();
}
input.onchange = () => {
  addFiles(input.files);
  input.value = "";
};
for (const event of ["dragenter", "dragover"])
  zone.addEventListener(event, (e) => {
    e.preventDefault();
    zone.classList.add("dragging");
  });
zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
zone.addEventListener("drop", (e) => {
  e.preventDefault();
  zone.classList.remove("dragging");
  addFiles(e.dataTransfer.files);
});
async function api(endpoint, { body, method = "POST" } = {}) {
  const multipart = body instanceof FormData;
  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${state.token}`,
      ...(!multipart && body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const failure = new Error(
      result.error || "Unable to continue. Please try again.",
    );
    failure.status = response.status;
    throw failure;
  }
  return result;
}
function show(view) {
  for (const name of ["upload", "verification", "success"])
    document.querySelector(`#${name}-view`).hidden = name !== view;
  document.querySelector(`#${view}-view`).focus();
}
function finish(receipt) {
  document.querySelector("#receipt-count").textContent =
    `1 quote · ${receipt.fileCount} ${receipt.fileCount === 1 ? "file" : "files"} · Reference ${receipt.id}`;
  show("success");
  state = null;
  window.trackSiteEvent?.("quote_uploaded");
}
async function sendCode() {
  const button = document.querySelector("#resend-code"),
    message = document.querySelector("#verification-error");
  button.disabled = true;
  message.textContent = "";
  try {
    await api(`/api/quotes/${state.id}/verification/send`);
    document.querySelector("#code-help").textContent =
      "We sent a six-digit code. It expires in 5 minutes.";
    let remaining = 60;
    button.textContent = `Resend code in ${remaining}s`;
    const timer = setInterval(() => {
      remaining--;
      button.textContent = remaining
        ? `Resend code in ${remaining}s`
        : "Resend code";
      if (!remaining) {
        clearInterval(timer);
        button.disabled = false;
      }
    }, 1000);
  } catch (failure) {
    message.textContent = failure.message;
    button.disabled = false;
  }
}
async function nextScreen(receipt, send = false) {
  if (receipt.status === "queued") {
    finish(receipt);
    return;
  }
  if (receipt.verificationRequired) {
    show("verification");
    if (send) await sendCode();
    document.querySelector("#verification-code").focus();
  }
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const phone = document.querySelector("#phone"),
    consent = document.querySelector("#consent"),
    submit = form.querySelector("[type=submit]");
  if (!files.length) {
    error.textContent = "Please add at least one file for your quote.";
    input.focus();
    return;
  }
  if (!phone.value.trim()) {
    error.textContent = "Enter your US phone number.";
    phone.focus();
    return;
  }
  if (!consent.checked) {
    error.textContent = "Please accept the contractor-sharing consent.";
    consent.focus();
    return;
  }
  busy = true;
  submit.disabled = true;
  input.disabled = phone.disabled = consent.disabled = true;
  document.querySelector('#start-new').disabled = true;
  renderFiles();
  error.textContent = "";
  submit.textContent = "Uploading your quote…";
  try {
    const body = new FormData();
    body.append("phone", phone.value);
    body.append("consent", "true");
    body.append("consentVersion", "2026-11-10-have-a-guru-v3");
    files.forEach((file) => body.append("quotes", file));
    const response = await fetch("/api/quotes", { method: "POST", body });
    const receipt = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        "Upload failed. Please select your files and upload everything again.",
      );
    state = { id: receipt.id, token: receipt.verificationToken };
    await nextScreen(receipt, true);
  } catch {
    reset();
    error.textContent =
      "Upload failed. Please select your files and upload everything again.";
    window.trackSiteEvent?.("quote_upload_failed");
  } finally {
    busy = false;
    submit.disabled = false;
    input.disabled = phone.disabled = consent.disabled = false;
    document.querySelector('#start-new').disabled = false;
    submit.textContent = "Find me a better deal →";
    renderFiles();
  }
});
document
  .querySelector("#verification-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("[type=submit]"),
      message = document.querySelector("#verification-error");
    button.disabled = true;
    message.textContent = "";
    try {
      const receipt = await api(`/api/quotes/${state.id}/verification/check`, {
        body: {
          code: document.querySelector("#verification-code").value.trim(),
        },
      });
      await nextScreen(receipt);
    } catch (failure) {
      message.textContent = failure.message;
    } finally {
      button.disabled = false;
    }
  });
document.querySelector("#resend-code").onclick = sendCode;
function reset() {
  state = null;
  files = [];
  form.reset();
  document.querySelector("#phone").disabled = false;
  document.querySelector("#consent").disabled = false;
  error.textContent = "";
  renderFiles();
  show("upload");
}
document.querySelector("#reset").onclick = reset;
document.querySelector("#start-new").onclick = reset;
