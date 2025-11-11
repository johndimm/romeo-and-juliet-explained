import { useEffect, useMemo, useState } from 'react';
import { getApiUrl } from '../lib/api';

const defaultOptions = {
  model: 'gpt-4o-mini',
  language: 'English',
  educationLevel: 'High school',
  age: '16',
  provider: 'openai',
  length: 'brief',
};

const clampFontScale = (value) => Math.min(1.6, Math.max(0.7, value));

const applyFontScaleToDocument = (value) => {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--font-scale', value.toFixed(3));
  }
};

async function fetchWithErrorHandling(url, options = {}) {
  try {
    const resolvedUrl = url.startsWith('http')
      ? url
      : (typeof window !== 'undefined' ? new URL(url, window.location.origin).href : url);
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';
    const asJson = contentType.includes('application/json');
    const data = asJson ? await response.json() : await response.text();

    if (!response.ok) {
      const message = asJson
        ? data?.detail || data?.error || response.statusText
        : `${response.status}: ${response.statusText} — ${String(data).slice(0, 120)}`;
      throw new Error(message);
    }

    if (!asJson) {
      throw new Error(`Expected JSON but received ${contentType}`);
    }

    return data;
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export default function SettingsPanel({
  options,
  onOptionsChange,
  fontScale: externalFontScale = 1,
  onFontScaleChange,
}) {
  const [llmOptions, setLlmOptions] = useState(options || defaultOptions);
  const [providerModels, setProviderModels] = useState([]);
  const [fontScale, setFontScale] = useState(externalFontScale);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setLlmOptions(options || defaultOptions);
  }, [options]);

  useEffect(() => {
    setFontScale(externalFontScale);
  }, [externalFontScale]);

  useEffect(() => {
    const provider = (llmOptions.provider || 'openai').toLowerCase();
    const controller = new AbortController();

    fetchWithErrorHandling(getApiUrl(`/api/models?provider=${encodeURIComponent(provider)}`), {
      signal: controller.signal,
    })
      .then((data) => {
        const models = Array.isArray(data?.models) ? data.models : [];
        setProviderModels(models);
        if (models.length && !models.includes(llmOptions.model)) {
          const fallback = models[0];
          setLlmOptions((prev) => {
            const next = { ...prev, model: fallback };
            onOptionsChange?.(next);
            try {
              localStorage.setItem('llmOptions', JSON.stringify(next));
            } catch {}
            return next;
          });
        }
      })
      .catch(() => setProviderModels([]));

    return () => controller.abort();
  }, [llmOptions.provider, llmOptions.model, onOptionsChange]);

  const defaultModelForProvider = useMemo(() => {
    return (prov) => {
      if (providerModels.length) return providerModels[0];
      const normalized = (prov || 'openai').toLowerCase();
      if (normalized === 'anthropic') return 'claude-3-sonnet-20240229';
      if (normalized === 'deepseek') return 'deepseek-chat';
      if (normalized === 'gemini') return 'gemini-1.5-pro-latest';
      return 'gpt-4o-mini';
    };
  }, [providerModels]);

  const handleOptionChange = (key, value) => {
    const updated = { ...llmOptions, [key]: value };
    if (key === 'provider') {
      const provider = (value || 'openai').toLowerCase();
      if (provider === 'deepseek') updated.model = 'deepseek-chat';
      else if (provider === 'anthropic') updated.model = 'claude-3-sonnet-20240229';
      else if (provider === 'gemini') updated.model = 'gemini-1.5-pro-latest';
      else updated.model = 'gpt-4o-mini';
    }
    setLlmOptions(updated);
    onOptionsChange?.(updated);
    try {
      localStorage.setItem('llmOptions', JSON.stringify(updated));
    } catch {}
  };

  const handleFontScaleChange = (value) => {
    const next = clampFontScale(value);
    setFontScale(next);
    applyFontScaleToDocument(next);
    onFontScaleChange?.(next);
    try {
      localStorage.setItem('fontScale', String(next));
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('font-scale-set', { detail: { value: next } }));
    }
  };

  const removeAllSavedData = () => {
    try {
      localStorage.removeItem('explanations');
      localStorage.removeItem('forcedNotes');
      localStorage.removeItem('noteThreshold');
      localStorage.removeItem('printAct');
      localStorage.removeItem('printScene');
      localStorage.removeItem('last-pos');
      localStorage.removeItem('last-scroll');
      localStorage.removeItem('last-scrollHeight');
      localStorage.removeItem('last-scroll-container');
      localStorage.removeItem('llmOptions');
      localStorage.removeItem('fontScale');
    } catch {}
    setShowDeleteConfirm(false);
    setLlmOptions(defaultOptions);
    onOptionsChange?.(defaultOptions);
    handleFontScaleChange(1);
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-content">
        <h1 className="settings-title">Settings</h1>

        <div className="settings-section">
          <h2>AI Provider &amp; Model</h2>
          <p>Choose your preferred AI provider and model for generating explanations.</p>
          <div className="settings-form">
            <div className="form-group">
              <label htmlFor="provider">Provider</label>
              <select
                id="provider"
                value={llmOptions.provider || 'openai'}
                onChange={(event) => handleOptionChange('provider', event.target.value)}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="deepseek">DeepSeek</option>
                <option value="gemini">Gemini</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="model">Model</label>
              <select
                id="model"
                value={providerModels.includes(llmOptions.model) ? llmOptions.model : defaultModelForProvider(llmOptions.provider)}
                onChange={(event) => handleOptionChange('model', event.target.value)}
              >
                {(providerModels.length ? providerModels : [defaultModelForProvider(llmOptions.provider)]).map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="length">Default explanation length</label>
              <select
                id="length"
                value={llmOptions.length || 'brief'}
                onChange={(event) => handleOptionChange('length', event.target.value)}
              >
                <option value="brief">Brief (2–3 sentences)</option>
                <option value="medium">Medium (short paragraph)</option>
                <option value="large">Detailed</option>
              </select>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h2>Language &amp; Education</h2>
          <p>Tell us about your background so explanations match your reading level.</p>
          <div className="settings-form">
            <div className="form-group">
              <label htmlFor="language">Preferred explanation language</label>
              <input
                id="language"
                type="text"
                value={llmOptions.language || ''}
                onChange={(event) => handleOptionChange('language', event.target.value)}
                placeholder="e.g. English, Español, Français"
              />
            </div>
            <div className="form-group">
              <label htmlFor="educationLevel">Top education level completed</label>
              <input
                id="educationLevel"
                type="text"
                value={llmOptions.educationLevel || ''}
                onChange={(event) => handleOptionChange('educationLevel', event.target.value)}
                placeholder="e.g. High school, Undergraduate, Middle school"
              />
            </div>
            <div className="form-group">
              <label htmlFor="age">Age (optional)</label>
              <input
                id="age"
                type="number"
                min="10"
                max="120"
                value={llmOptions.age || ''}
                onChange={(event) => handleOptionChange('age', event.target.value)}
                placeholder="16"
              />
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h2>Font Size</h2>
          <p>Adjust the size of the play text and explanations. Pinch on touch devices to resize instantly.</p>
          <div className="font-scale-control">
            <div className="font-scale-value" aria-live="polite">
              Current scale: {fontScale.toFixed(2)}×
            </div>
            <input
              type="range"
              min="0.7"
              max="1.6"
              step="0.01"
              value={fontScale}
              onChange={(event) => handleFontScaleChange(parseFloat(event.target.value))}
              aria-label="Font scale"
            />
            <div className="font-scale-buttons">
              <button type="button" onClick={() => handleFontScaleChange(fontScale - 0.05)}>
                −
              </button>
              <button type="button" onClick={() => handleFontScaleChange(fontScale + 0.05)}>
                +
              </button>
              <button type="button" onClick={() => handleFontScaleChange(1)}>
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h2>Privacy &amp; saved explanations</h2>
          <p>Everything is stored locally in your browser. Want to start over? Remove saved explanations and notes from this device.</p>
          {showDeleteConfirm ? (
            <div className="delete-confirm">
              <p>Remove all local data for this app?</p>
              <div className="delete-confirm-actions">
                <button type="button" className="danger" onClick={removeAllSavedData}>
                  Yes, remove everything
                </button>
                <button type="button" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowDeleteConfirm(true)}>
              Remove saved explanations and settings from this device
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

