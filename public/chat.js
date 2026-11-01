const tenantSelect = document.querySelector('#tenant');
const thread = document.querySelector('#thread');
const form = document.querySelector('#composer');
const questionInput = document.querySelector('#question');
const submitButton = form.querySelector('button[type="submit"]');
const formError = document.querySelector('#form-error');

let sending = false;

function showError(message) {
  formError.hidden = false;
  formError.textContent = message;
}

function clearError() {
  formError.hidden = true;
  formError.textContent = '';
}

function setBusy(busy) {
  sending = busy;
  submitButton.disabled = busy || tenantSelect.options.length === 0;
  questionInput.disabled = busy;
  tenantSelect.disabled = busy;
}

function scrollThread() {
  thread.scrollTop = thread.scrollHeight;
}

function appendUser(tenantId, question) {
  const item = document.createElement('li');
  item.className = 'user';

  const who = document.createElement('p');
  who.className = 'who';
  who.textContent = `You · ${tenantId}`;

  const text = document.createElement('p');
  text.className = 'text';
  text.textContent = question;

  item.append(who, text);
  thread.append(item);
  scrollThread();
}

function appendPending() {
  const item = document.createElement('li');
  item.className = 'assistant pending';

  const text = document.createElement('p');
  text.className = 'text';
  text.textContent = 'Searching the documents...';

  item.append(text);
  thread.append(item);
  scrollThread();
  return item;
}

function addHit(parent, label, hit) {
  const block = document.createElement('div');
  block.className = 'source';

  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = `${label}: ${hit.id}  tenant ${hit.tenantId}  similarity ${Number(hit.similarity).toFixed(3)}`;

  const text = document.createElement('p');
  text.className = 'source-text';
  text.textContent = hit.text;

  block.append(meta, text);
  parent.append(block);
}

function fillAnswer(item, answer) {
  item.className = 'assistant';
  item.replaceChildren();

  const who = document.createElement('p');
  who.className = 'who';
  who.textContent = 'Answer';

  const text = document.createElement('p');
  text.className = 'text';
  text.textContent = answer.answer;

  const called = document.createElement('p');
  called.className = 'meta';
  called.textContent = `Model called: ${answer.usedModel ? 'yes' : 'no'}`;

  item.append(who, text, called);

  if (answer.sources.length === 0) {
    const none = document.createElement('p');
    none.className = 'meta';
    none.textContent = 'sources: none';
    item.append(none);
  }

  for (const source of answer.sources) addHit(item, 'source', source);
  if (answer.closestMiss) addHit(item, 'closest miss', answer.closestMiss);
  scrollThread();
}

async function send(rawQuestion) {
  const question = rawQuestion.trim();
  const tenantId = tenantSelect.value;
  clearError();

  if (!tenantId) {
    showError('tenantId is required.');
    return;
  }
  if (!question) {
    showError('Question is required.');
    return;
  }

  document.querySelector('#empty')?.remove();
  appendUser(tenantId, question);
  questionInput.value = '';
  const pending = appendPending();
  setBusy(true);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId, question }),
    });
    const body = await response.json();
    if (!response.ok) {
      pending.remove();
      showError(typeof body.error === 'string' ? body.error : 'The request failed.');
      return;
    }
    fillAnswer(pending, body);
  } catch {
    pending.remove();
    showError('The request failed.');
  } finally {
    setBusy(false);
    questionInput.focus();
  }
}

async function loadTenants() {
  const response = await fetch('/api/tenants');
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Could not load tenants.');
  }

  for (const id of body.tenants) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    tenantSelect.append(option);
  }

  if (tenantSelect.options.length === 0) showError('No documents are loaded.');
  submitButton.disabled = tenantSelect.options.length === 0;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (sending) return;
  void send(questionInput.value);
});

questionInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

thread.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element) || sending) return;
  const button = target.closest('button[data-question]');
  if (!button) return;
  questionInput.value = button.dataset.question ?? '';
  form.requestSubmit();
});

loadTenants().catch((error) => {
  showError(error instanceof Error ? error.message : 'Could not load tenants.');
});
