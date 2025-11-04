import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getApiUrl } from '../lib/api';

const clampFontScale = (value) => Math.min(1.6, Math.max(0.7, value));
const applyFontScaleToDocument = (value) => {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--font-scale', value.toFixed(3));
  }
};

export default function Settings() {
  const [llmOptions, setLlmOptions] = useState({
    model: 'gpt-4o-mini', 
    language: 'English', 
    educationLevel: 'High school', 
    age: '16', 
    provider: 'openai', 
    length: 'brief' 
  });
  const [providerModels, setProviderModels] = useState([]);
  const [optionsHydrated, setOptionsHydrated] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('llmOptions');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate that model matches provider - fix mismatches
        const provider = (parsed.provider || 'openai').toLowerCase();
        const model = parsed.model || '';
        let correctedModel = model;
        
        if (provider === 'deepseek' && !/deepseek/i.test(model)) {
          correctedModel = 'deepseek-chat';
        } else if (provider === 'openai' && !/^gpt-/i.test(model)) {
          correctedModel = 'gpt-4o-mini';
        } else if (provider === 'anthropic' && !/^claude/i.test(model)) {
          correctedModel = 'claude-3-sonnet-20240229';
        } else if (provider === 'gemini' && !/^gemini/i.test(model)) {
          correctedModel = 'gemini-1.5-pro-latest';
        }
        
        if (correctedModel !== model) {
          parsed.model = correctedModel;
          try {
            localStorage.setItem('llmOptions', JSON.stringify(parsed));
          } catch {}
        }
        
        setLlmOptions(parsed);
      }
      const savedFontScale = localStorage.getItem('fontScale');
      if (savedFontScale !== null && savedFontScale !== '') {
        const val = parseFloat(savedFontScale);
        if (Number.isFinite(val)) {
          const clamped = clampFontScale(val);
          setFontScale(clamped);
          applyFontScaleToDocument(clamped);
        }
      }
      setOptionsHydrated(true);
    } catch (e) {
      setOptionsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return () => {};
    const handler = (e) => {
      const raw = e?.detail?.value;
      const val = typeof raw === 'number' ? raw : parseFloat(raw);
      if (Number.isFinite(val)) setFontScale(clampFontScale(val));
    };
    window.addEventListener('font-scale-updated', handler);
    return () => window.removeEventListener('font-scale-updated', handler);
  }, []);

  // Fetch available models when provider changes
  // Only validate after initial load from localStorage is complete
  useEffect(() => {
    if (!optionsHydrated) return; // Don't validate until we've loaded from localStorage
    
    const prov = (llmOptions.provider || 'openai').toLowerCase();
    fetch(getApiUrl(`/api/models?provider=${encodeURIComponent(prov)}`))
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data?.models) && data.models.length ? data.models : [];
        setProviderModels(list);
        // If current model is not in the list for this provider, reset to default
        // Only validate if we have models and the current model isn't valid for this provider
        if (list.length > 0) {
          setLlmOptions(prev => {
            // Don't change model if provider doesn't match (shouldn't happen, but be safe)
            const prevProvider = (prev.provider || 'openai').toLowerCase();
            if (prevProvider !== prov) {
              return prev; // Provider changed, let the provider change handler deal with it
            }
            // Check if current model is valid for this provider
            const modelMatchesProvider = (
              (prov === 'deepseek' && /deepseek/i.test(prev.model)) ||
              (prov === 'openai' && /^gpt-/i.test(prev.model)) ||
              (prov === 'anthropic' && /^claude/i.test(prev.model)) ||
              (prov === 'gemini' && /^gemini/i.test(prev.model))
            );
            // Only reset if model doesn't match provider AND isn't in the fetched list
            if (!modelMatchesProvider && !list.includes(prev.model)) {
              const defaultModel = list[0];
              const updated = { ...prev, model: defaultModel };
              try {
                localStorage.setItem('llmOptions', JSON.stringify(updated));
              } catch (e) {
                // Ignore
              }
              return updated;
            }
            return prev;
          });
        }
      })
      .catch(() => setProviderModels([]));
  }, [llmOptions.provider, optionsHydrated]);

  function defaultModelForProvider(p) {
    if (providerModels && providerModels.length) return providerModels[0];
    const prov = (p || 'openai').toLowerCase();
    if (prov === 'anthropic') return 'claude-3-sonnet-20240229';
    if (prov === 'deepseek') return 'deepseek-chat';
    if (prov === 'gemini') return 'gemini-1.5-pro-latest';
    return 'gpt-4o-mini';
  }

  const handleOptionChange = (key, value) => {
    const updated = { ...llmOptions, [key]: value };
    if (key === 'provider') {
      // When provider changes, set model to appropriate default
      // Use static defaults (not providerModels) since we're changing provider
      // The useEffect will validate once models are fetched
      const prov = (value || 'openai').toLowerCase();
      if (prov === 'deepseek') {
        updated.model = 'deepseek-chat';
      } else if (prov === 'anthropic') {
        updated.model = 'claude-3-sonnet-20240229';
      } else if (prov === 'gemini') {
        updated.model = 'gemini-1.5-pro-latest';
      } else {
        updated.model = 'gpt-4o-mini';
      }
    }
    setLlmOptions(updated);
    try {
      localStorage.setItem('llmOptions', JSON.stringify(updated));
    } catch (e) {
      // Ignore
    }
  };

  const handleRemoveAllExplanations = () => {
    setShowDeleteConfirm(true);
  };

  const actuallyRemoveAll = () => {
    try {
      localStorage.setItem('explanations', JSON.stringify({}));
      localStorage.setItem('forcedNotes', JSON.stringify([]));
      localStorage.setItem('noteThreshold', '100');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('note-threshold-set', { detail: { threshold: 100, density: 0 } }));
        window.dispatchEvent(new CustomEvent('note-threshold-updated', { detail: { threshold: 100, density: 0 } }));
      }
      setShowDeleteConfirm(false);
    } catch (e) {
      // Ignore
    }
  };

  const cancelRemoveAll = () => setShowDeleteConfirm(false);

  const handleFontScaleChange = (value) => {
    const next = clampFontScale(value);
    setFontScale(next);
    applyFontScaleToDocument(next);
    try {
      localStorage.setItem('fontScale', String(next));
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('font-scale-set', { detail: { value: next } }));
    }
  };

  return (
    <div className="settings-page">
      <Head>
        <title>Settings — Romeo and Juliet Explained</title>
        <meta name="description" content="Configure your AI provider, model, language preferences, and other settings for Romeo and Juliet Explained." />
      </Head>
      
      <div className="settings-content">
        <div className="page-header">
          <Link href="/" className="back-button">
            <span className="icon">←</span>
            Back to Play
          </Link>
        </div>
        <h1 className="settings-title">Settings</h1>
        
        <div className="settings-section">
          <h2>AI Provider & Model</h2>
          <p>Choose your preferred AI provider and model for generating explanations.</p>
          
          <div className="settings-form">
            <div className="form-group">
              <label htmlFor="provider">Provider</label>
              <select
                id="provider"
                value={llmOptions.provider || 'openai'}
                onChange={(e) => handleOptionChange('provider', e.target.value)}
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
                value={(providerModels.includes(llmOptions.model) ? llmOptions.model : defaultModelForProvider(llmOptions.provider))}
                onChange={(e) => handleOptionChange('model', e.target.value)}
              >
                {(providerModels.length ? providerModels : [defaultModelForProvider(llmOptions.provider)]).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h2>Explanation Preferences</h2>
          <p>Customize how explanations are generated and displayed.</p>
          
          <div className="settings-form">
            <div className="form-group">
              <label htmlFor="language">Language</label>
              <input
                id="language"
                type="text"
                value={llmOptions.language || ''}
                onChange={(e) => handleOptionChange('language', e.target.value)}
                placeholder="English"
              />
            </div>

            <div className="form-group">
              <label htmlFor="length">Default Length</label>
              <select
                id="length"
                value={llmOptions.length || 'brief'}
                onChange={(e) => handleOptionChange('length', e.target.value)}
              >
                <option value="brief">Brief</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="educationLevel">Education Level</label>
              <select
                id="educationLevel"
                value={llmOptions.educationLevel || 'High school'}
                onChange={(e) => handleOptionChange('educationLevel', e.target.value)}
              >
                <option value="Middle school">Middle school</option>
                <option value="High school">High school</option>
                <option value="Undergraduate">Undergraduate</option>
                <option value="Graduate">Graduate</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="age">Age</label>
              <input
                id="age"
                type="number"
                min="10"
                max="100"
                value={llmOptions.age || ''}
                onChange={(e) => handleOptionChange('age', e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="settings-section">
          <h2>Font Size</h2>
          <p>Adjust the size of the play text and explanations. You can also pinch on touch devices to resize instantly.</p>
          <div className="form-group">
            <label htmlFor="fontScale">Font size: <strong>{Math.round(fontScale * 100)}%</strong></label>
            <input
              id="fontScale"
              type="range"
              min="0.7"
              max="1.5"
              step="0.05"
              value={fontScale}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (Number.isFinite(val)) handleFontScaleChange(val);
              }}
              style={{ width: '100%' }}
            />
            <div className="button-group" style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[0.85, 1, 1.15, 1.3].map((val) => {
                const label = `${Math.round(val * 100)}%`;
                const isActive = Math.abs(fontScale - val) < 0.01;
                return (
                  <button
                    type="button"
                    key={label}
                    onClick={() => handleFontScaleChange(val)}
                    className={isActive ? 'active' : undefined}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="settings-section">
          <h2>Data Management</h2>
          <p>Manage your saved explanations and notes.</p>
          <div className="form-group">
            <button
              type="button"
              onClick={handleRemoveAllExplanations}
              className="danger-button"
            >
              Remove All Explanations
            </button>
            {showDeleteConfirm && (
              <div className="confirmation-panel">
                <p>Remove all saved explanations? This cannot be undone.</p>
                <div className="button-group">
                  <button type="button" onClick={actuallyRemoveAll} className="danger-button">Yes, remove all</button>
                  <button type="button" onClick={cancelRemoveAll}>Cancel</button>
                </div>
              </div>
            )}
            <p className="help-text">This will remove all saved explanations and reset notes.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
