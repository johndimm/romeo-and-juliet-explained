import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';

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
  const [noteThreshold, setNoteThreshold] = useState(50);

  // Helper functions for notes density (inverted from perplexity threshold)
  // perplexity threshold: higher = fewer notes (0 = all notes, 100 = no notes)
  // notes density: higher = more notes (0 = no notes, 100 = all notes)
  const thresholdToDensity = (threshold) => 100 - threshold;
  const densityToThreshold = (density) => 100 - density;

  const getNotesLabel = (threshold) => {
    if (threshold >= 100) return 'none';
    if (threshold >= 70) return 'some';
    if (threshold >= 30) return 'more';
    return 'all';
  };

  const getNotesValue = (label) => {
    switch (label) {
      case 'none': return 100;
      case 'some': return 70;
      case 'more': return 30;
      case 'all': return 0;
      default: return 50;
    }
  };

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('llmOptions');
      if (saved) {
        const parsed = JSON.parse(saved);
        setLlmOptions(parsed);
      }
      const savedNoteThreshold = localStorage.getItem('noteThreshold');
      if (savedNoteThreshold !== null) {
        setNoteThreshold(parseInt(savedNoteThreshold, 10) || 50);
      }
    } catch (e) {
      // Use defaults
    }
  }, []);

  // Fetch available models when provider changes
  useEffect(() => {
    const prov = (llmOptions.provider || 'openai').toLowerCase();
    fetch(`/api/models?provider=${encodeURIComponent(prov)}`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data?.models) && data.models.length ? data.models : [];
        setProviderModels(list);
        // If current model is not in the list for this provider, reset to default
        if (list.length > 0) {
          setLlmOptions(prev => {
            if (!list.includes(prev.model)) {
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
  }, [llmOptions.provider]);

  function defaultModelForProvider(p) {
    if (providerModels && providerModels.length) return providerModels[0];
    const prov = (p || 'openai').toLowerCase();
    if (prov === 'anthropic') return 'claude-3-5-sonnet-20240620';
    if (prov === 'deepseek') return 'deepseek-chat';
    if (prov === 'gemini') return 'gemini-1.5-pro-latest';
    return 'gpt-4o-mini';
  }

  const handleOptionChange = (key, value) => {
    const updated = { ...llmOptions, [key]: value };
    if (key === 'provider') {
      updated.model = defaultModelForProvider(value);
    }
    setLlmOptions(updated);
    try {
      localStorage.setItem('llmOptions', JSON.stringify(updated));
    } catch (e) {
      // Ignore
    }
  };

  const handleNoteThresholdChange = (value) => {
    setNoteThreshold(value);
    try {
      localStorage.setItem('noteThreshold', String(value));
    } catch (e) {
      // Ignore
    }
  };

  const handleRemoveAllExplanations = () => {
    try {
      const ok = typeof window === 'undefined' ? true : window.confirm('Remove all saved explanations? This cannot be undone.');
      if (!ok) return;
    } catch {}
    try {
      localStorage.setItem('explanations', JSON.stringify({}));
      localStorage.setItem('forcedNotes', JSON.stringify([]));
      handleNoteThresholdChange(100);
      alert('All explanations have been removed.');
    } catch (e) {
      // Ignore
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
          <h2>Notes Display</h2>
          <p>Control how many prewritten notes are displayed based on difficulty (perplexity). Lower values show more notes.</p>
          
          <div className="form-group">
            <label htmlFor="noteThreshold">
              Notes Density: <strong>{thresholdToDensity(noteThreshold)}</strong> ({getNotesLabel(noteThreshold)})
            </label>
            <input
              id="noteThreshold"
              type="range"
              min="0"
              max="100"
              value={thresholdToDensity(noteThreshold)}
              onChange={(e) => {
                const density = parseInt(e.target.value, 10) || 0;
                handleNoteThresholdChange(densityToThreshold(density));
              }}
              style={{ width: '100%' }}
            />
            <div className="button-group" style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {['none', 'some', 'more', 'all'].map((label) => {
                const value = getNotesValue(label);
                const isSelected = getNotesLabel(noteThreshold) === label;
                return (
                  <label
                    key={label}
                    style={{
                      display: 'inline-block',
                      padding: '0.5rem 1rem',
                      border: '2px solid',
                      borderRadius: '6px',
                      background: isSelected ? '#e7d7b8' : '#f8f6f3',
                      borderColor: isSelected ? '#c9b99a' : '#d8d5d0',
                      color: '#3b3228',
                      fontWeight: isSelected ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      fontSize: '0.95rem',
                      textTransform: 'capitalize',
                      boxShadow: isSelected ? 'inset 0 2px 4px rgba(0,0,0,0.1)' : 'none',
                      transform: isSelected ? 'none' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = '#e7d7b8';
                        e.currentTarget.style.borderColor = '#c9b99a';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = '#f8f6f3';
                        e.currentTarget.style.borderColor = '#d8d5d0';
                      }
                    }}
                  >
                    <input
                      type="radio"
                      name="notesDensity"
                      value={value}
                      checked={isSelected}
                      onChange={() => handleNoteThresholdChange(value)}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                    />
                    {label}
                  </label>
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
            <p className="help-text">This will remove all saved explanations and reset notes. This action cannot be undone.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
