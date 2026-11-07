const form = document.querySelector('#quote-form');
const input = document.querySelector('#quotes');
const list = document.querySelector('#file-list');
const error = document.querySelector('#error');
const zone = document.querySelector('#drop-zone');
let files = [];
document.querySelector('#year').textContent = new Date().getFullYear();
function renderFiles() {
  list.replaceChildren();
  files.forEach((file, index) => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = file.name;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.onclick = () => { files.splice(index, 1); renderFiles(); };
    item.append(name, remove); list.append(item);
  });
}
function addFiles(incoming) {
  const problems = [];
  for (const file of incoming) {
    if (files.length >= 5) { problems.push('You can add up to 5 quotes per submission.'); break; }
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name) || (file.type && !['application/pdf','image/jpeg','image/png'].includes(file.type))) {
      problems.push(`${file.name}: please use PDF, JPG or PNG.`); continue;
    }
    if (file.size > 20 * 1024 * 1024) { problems.push(`${file.name}: exceeds 20 MB.`); continue; }
    if (file.size === 0) { problems.push(`${file.name}: this file is empty.`); continue; }
    if (!files.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) files.push(file);
  }
  error.textContent = problems.join(' '); renderFiles();
}
input.onchange = () => { addFiles(input.files); input.value = ''; };
for (const event of ['dragenter', 'dragover']) zone.addEventListener(event, e => { e.preventDefault(); zone.classList.add('dragging'); });
zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragging'); addFiles(e.dataTransfer.files); });
form.addEventListener('submit', async e => {
  e.preventDefault();
  const phone = document.querySelector('#phone');
  let digits = phone.value.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
  if (!files.length) { error.textContent = 'Please add at least one quote.'; input.focus(); return; }
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) { error.textContent = 'Please enter a valid US phone number, including area code.'; phone.focus(); return; }
  if (!document.querySelector('#consent').checked) { error.textContent = 'Please authorize sharing your project details with matched contractors to continue.'; document.querySelector('#consent').focus(); return; }
  error.textContent = '';
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Sending your quotes…';
  const payload = new FormData();
  payload.append('phone', digits);
  payload.append('consent', 'true');
  payload.append('consentVersion', '2026-11-06-v1');
  files.forEach(file => payload.append('quotes', file));
  let receipt;
  try {
    const response = await fetch('/api/quotes', { method: 'POST', body: payload });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Unable to send your quotes. Please try again.');
    receipt = result;
  } catch (failure) {
    error.textContent = failure.message || 'Connection failed. Please try again.';
    return;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Find me a better deal →';
  }
  document.querySelector('#receipt-count').textContent = `${receipt.fileCount} ${receipt.fileCount === 1 ? 'quote' : 'quotes'} received · Reference ${receipt.id}`;
  document.querySelector('#success-view h2').textContent = files.length === 1 ? 'We’ve got your quote!' : 'We’ve got your quotes!';
  document.querySelector('#upload-view').hidden = true;
  const success = document.querySelector('#success-view'); success.hidden = false; success.focus();
});
document.querySelector('#reset').onclick = () => {
  files = []; renderFiles(); form.reset(); error.textContent = '';
  document.querySelector('#success-view').hidden = true;
  document.querySelector('#upload-view').hidden = false; input.focus();
};
