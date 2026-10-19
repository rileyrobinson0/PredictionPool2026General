const RACES = [
  { id: 'senate-mi', label: 'Michigan', office: 'U.S. Senate', state: 'MI' },
  { id: 'senate-tx', label: 'Texas', office: 'U.S. Senate', state: 'TX' },
  { id: 'senate-ia', label: 'Iowa', office: 'U.S. Senate', state: 'IA' },
  { id: 'governor-wi', label: 'Wisconsin', office: 'Governor', state: 'WI' },
  { id: 'governor-oh', label: 'Ohio', office: 'Governor', state: 'OH' },
  { id: 'governor-ga', label: 'Georgia', office: 'Governor', state: 'GA' },
];

const formView = document.querySelector('#form-view');
const resultsView = document.querySelector('#results-view');
const raceGrid = document.querySelector('#race-grid');
const form = document.querySelector('#prediction-form');
const formMessage = document.querySelector('#form-message');
const navCount = document.querySelector('#nav-count');

function renderRaceInputs() {
  const template = document.querySelector('#race-card-template');
  RACES.forEach((race) => {
    const card = template.content.cloneNode(true);
    const article = card.querySelector('.race-card');
    const input = card.querySelector('.margin-input');
    const numberInput = card.querySelector('.margin-number');
    const label = card.querySelector('.sr-only');
    const valueOutput = card.querySelector('.margin-value');
    article.querySelector('.race-office').textContent = race.office;
    article.querySelector('.race-state').textContent = race.label;
    input.id = race.id;
    input.name = race.id;
    input.setAttribute('aria-label', `${race.label} ${race.office} Democratic margin in percentage points`);
    numberInput.id = `${race.id}-number`;
    numberInput.setAttribute('aria-label', `Enter ${race.label} ${race.office} Democratic margin in percentage points`);
    label.htmlFor = race.id;
    label.textContent = `${race.label} ${race.office} Democratic margin in percentage points`;
    input.addEventListener('input', () => {
      numberInput.value = input.value;
      updateMarginDisplay(input, valueOutput);
    });
    numberInput.addEventListener('input', () => {
      if (numberInput.value === '' || !numberInput.validity.valid) return;
      input.value = numberInput.value;
      updateMarginDisplay(input, valueOutput);
    });
    numberInput.addEventListener('change', () => {
      if (numberInput.value === '') numberInput.value = input.value;
      else if (!numberInput.validity.valid) numberInput.reportValidity();
      else input.value = numberInput.value;
    });
    updateMarginDisplay(input, valueOutput);
    raceGrid.append(card);
  });
}

function updateMarginDisplay(input, output) {
  const margin = Number(input.value);
  const lead = margin > 0 ? 'Democratic lead' : margin < 0 ? 'Republican lead' : 'tied';
  const value = `${formatMargin(margin)} pts · ${lead}`;
  output.value = value;
  output.textContent = value;
  input.setAttribute('aria-valuetext', `${formatMargin(margin)} percentage points, ${lead}`);
}

function setActiveNavigation(view) {
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const active = link.dataset.nav === view;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function formatMargin(value) {
  const number = Number(value);
  const rounded = Math.round(number * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function addText(parent, className, text, tag = 'div') {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function renderResults(records) {
  const resultList = document.querySelector('#results-list');
  resultList.replaceChildren();
  document.querySelector('#total-count').textContent = String(records.length);
  navCount.textContent = String(records.length);

  if (records.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    addText(empty, '', '✳', 'span');
    addText(empty, '', "You're first to the ballot.", 'h3');
    addText(empty, '', 'Add your prediction and kick off the community forecast.');
    const link = addText(empty, 'outline-button', 'Make the first prediction', 'a');
    link.href = '/';
    resultList.append(empty);
    return;
  }

  [...records].reverse().forEach((record) => {
    const row = document.createElement('article');
    row.className = 'result-row';
    const person = addText(row, 'result-person', '', 'div');
    addText(person, '', record.name, 'strong');
    addText(person, '', `Submitted ${formatDate(record.submittedAt)}`, 'span');
    RACES.forEach((race) => {
      const cell = addText(row, 'result-margin', '', 'div');
      addText(cell, '', `${race.state} · ${race.office === 'Governor' ? 'Gov.' : 'Sen.'}`, 'span');
      const margin = addText(cell, '', `${formatMargin(record.predictions[race.id])} pts`, 'strong');
      if (Number(record.predictions[race.id]) < 0) margin.classList.add('negative');
    });
    resultList.append(row);
  });
}

async function loadResults() {
  try {
    const response = await fetch('/api/predictions');
    if (!response.ok) throw new Error('Could not load results.');
    const data = await response.json();
    renderResults(data.predictions);
  } catch {
    const resultList = document.querySelector('#results-list');
    resultList.replaceChildren();
    addText(resultList, 'empty-state', 'Results could not be loaded. Please refresh to try again.');
  }
}

async function submitPrediction(event) {
  event.preventDefault();
  formMessage.textContent = '';
  if (!form.reportValidity()) return;

  const predictions = Object.fromEntries(RACES.map((race) => [race.id, Number(form.elements[race.id].value)]));
  const button = form.querySelector('.submit-button');
  button.disabled = true;
  button.querySelector('span:first-child').textContent = 'Submitting…';

  try {
    const response = await fetch('/api/predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.elements.name.value, predictions }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Your prediction could not be saved.');
    window.location.assign('/results');
  } catch (error) {
    formMessage.textContent = error.message || 'Something went wrong. Please try again.';
    button.disabled = false;
    button.querySelector('span:first-child').textContent = 'Submit predictions';
  }
}

renderRaceInputs();
form.addEventListener('submit', submitPrediction);

if (window.location.pathname === '/results') {
  formView.classList.add('hidden');
  resultsView.classList.remove('hidden');
  setActiveNavigation('results');
  loadResults();
} else {
  setActiveNavigation('form');
  fetch('/api/predictions')
    .then((response) => response.json())
    .then((data) => { navCount.textContent = String(data.predictions.length); })
    .catch(() => { navCount.textContent = '—'; });
}
