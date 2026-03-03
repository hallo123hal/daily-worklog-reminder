import React, { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';
import './App.css';

function App() {
    // State for configuration
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    
    // Configuration state
    const [config, setConfig] = useState({
        thresholdHours: 5,
        scanTime: '17:30',
        excludedUsers: [],
        emailRecipients: [],
        enabled: true
    });
    
    // SendGrid API key state
    const [sendGridApiKey, setSendGridApiKey] = useState('');
    const [maskedApiKey, setMaskedApiKey] = useState(null);
    const [showApiKeyInput, setShowApiKeyInput] = useState(false);
    
    // Form inputs
    const [newEmailRecipient, setNewEmailRecipient] = useState('');
    const [newExcludedUser, setNewExcludedUser] = useState('');
    
    // Last execution info
    const [lastExecution, setLastExecution] = useState(null);
    
    // Manual scan state
    const [scanning, setScanning] = useState(false);
    const [scanResult, setScanResult] = useState(null);

    // Load configuration on mount
    useEffect(() => {
        loadConfiguration();
    }, []);

    const loadConfiguration = async () => {
        try {
            setLoading(true);
            setError(null);
            
            // Load app config
            const appConfig = await invoke('getConfig');
            if (appConfig) {
                setConfig(appConfig);
                if (appConfig.lastExecution) {
                    setLastExecution(appConfig.lastExecution);
                }
            }
            
            // Load masked SendGrid API key
            const apiKeyData = await invoke('getSendGridApiKey');
            if (apiKeyData && apiKeyData.apiKey) {
                setMaskedApiKey(apiKeyData.apiKey);
            }
        } catch (err) {
            console.error('Error loading configuration:', err);
            setError(`Failed to load configuration: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveConfig = async () => {
        try {
            setSaving(true);
            setError(null);
            setSuccessMessage(null);
            
            // Validate configuration
            if (config.thresholdHours <= 0) {
                throw new Error('Threshold hours must be greater than 0');
            }
            
            if (config.emailRecipients.length === 0) {
                throw new Error('At least one email recipient is required');
            }
            
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            for (const email of config.emailRecipients) {
                if (!emailRegex.test(email)) {
                    throw new Error(`Invalid email format: ${email}`);
                }
            }
            
            // Validate time format (HH:mm)
            const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(config.scanTime)) {
                throw new Error('Scan time must be in HH:mm format (e.g., 17:30)');
            }
            
            // Save configuration
            await invoke('saveConfig', config);
            setSuccessMessage('Configuration saved successfully!');
            
            // Reload to get updated last execution if any
            setTimeout(() => {
                loadConfiguration();
            }, 500);
        } catch (err) {
            console.error('Error saving configuration:', err);
            setError(`Failed to save configuration: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveApiKey = async () => {
        try {
            setSaving(true);
            setError(null);
            setSuccessMessage(null);
            
            if (!sendGridApiKey || sendGridApiKey.trim() === '') {
                throw new Error('API key cannot be empty');
            }
            
            // Validate API key format (SendGrid keys start with SG.)
            if (!sendGridApiKey.startsWith('SG.')) {
                throw new Error('Invalid SendGrid API key format. Keys should start with "SG."');
            }
            
            await invoke('setSendGridApiKey', { apiKey: sendGridApiKey });
            setMaskedApiKey(`****${sendGridApiKey.slice(-4)}`);
            setSendGridApiKey('');
            setShowApiKeyInput(false);
            setSuccessMessage('SendGrid API key saved successfully!');
        } catch (err) {
            console.error('Error saving API key:', err);
            setError(`Failed to save API key: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleManualScan = async () => {
        try {
            setScanning(true);
            setError(null);
            setSuccessMessage(null);
            setScanResult(null);
            
            const result = await invoke('triggerManualScan');
            
            if (result.success) {
                setScanResult(result.result);
                const usersFound = result.result.usersFound || 0;
                if (usersFound > 0) {
                    setSuccessMessage(`Scan completed! Found ${usersFound} user(s) below threshold. Email sent to recipients.`);
                } else {
                    setSuccessMessage(`Scan completed! No users found below threshold (all users logged sufficient hours).`);
                }
                // Reload config to get updated last execution status
                setTimeout(() => {
                    loadConfiguration();
                }, 500);
            } else {
                setError(`Scan failed: ${result.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('Error triggering manual scan:', err);
            setError(`Failed to trigger scan: ${err.message}`);
        } finally {
            setScanning(false);
        }
    };

    const handleAddEmailRecipient = () => {
        if (newEmailRecipient.trim() === '') return;
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmailRecipient)) {
            setError('Invalid email format');
            return;
        }
        
        if (config.emailRecipients.includes(newEmailRecipient)) {
            setError('Email already in list');
            return;
        }
        
        setConfig({
            ...config,
            emailRecipients: [...config.emailRecipients, newEmailRecipient]
        });
        setNewEmailRecipient('');
        setError(null);
    };

    const handleRemoveEmailRecipient = (email) => {
        setConfig({
            ...config,
            emailRecipients: config.emailRecipients.filter(e => e !== email)
        });
    };

    const handleAddExcludedUser = () => {
        if (newExcludedUser.trim() === '') return;
        
        if (config.excludedUsers.includes(newExcludedUser)) {
            setError('User already in excluded list');
            return;
        }
        
        setConfig({
            ...config,
            excludedUsers: [...config.excludedUsers, newExcludedUser]
        });
        setNewExcludedUser('');
        setError(null);
    };

    const handleRemoveExcludedUser = (userId) => {
        setConfig({
            ...config,
            excludedUsers: config.excludedUsers.filter(u => u !== userId)
        });
    };

    const clearMessages = () => {
        setError(null);
        setSuccessMessage(null);
    };

    if (loading) {
        return (
            <div className="admin-container">
                <div className="loading">Loading configuration...</div>
            </div>
        );
    }

    return (
        <div className="admin-container">
            <div className="admin-header">
                <h1>Daily Worklog Reminder Configuration</h1>
                <p>Configure automatic daily worklog reminders for your Jira instance</p>
            </div>

            {error && (
                <div className="message error" onClick={clearMessages}>
                    <strong>Error:</strong> {error}
                </div>
            )}

            {successMessage && (
                <div className="message success" onClick={clearMessages}>
                    <strong>Success:</strong> {successMessage}
                </div>
            )}

            <div className="config-section">
                <h2>SendGrid API Configuration</h2>
                <div className="form-group">
                    <label>SendGrid API Key</label>
                    {maskedApiKey && !showApiKeyInput ? (
                        <div className="api-key-display">
                            <span className="masked-key">{maskedApiKey}</span>
                            <button 
                                type="button" 
                                className="btn-secondary"
                                onClick={() => setShowApiKeyInput(true)}
                            >
                                Change API Key
                            </button>
                        </div>
                    ) : (
                        <div className="api-key-input">
                            <input
                                type="password"
                                value={sendGridApiKey}
                                onChange={(e) => setSendGridApiKey(e.target.value)}
                                placeholder="Enter SendGrid API key (starts with SG.)"
                                className="input-field"
                            />
                            <div className="button-group">
                                <button 
                                    type="button" 
                                    className="btn-primary"
                                    onClick={handleSaveApiKey}
                                    disabled={saving}
                                >
                                    {saving ? 'Saving...' : 'Save API Key'}
                                </button>
                                {maskedApiKey && (
                                    <button 
                                        type="button" 
                                        className="btn-secondary"
                                        onClick={() => {
                                            setShowApiKeyInput(false);
                                            setSendGridApiKey('');
                                        }}
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    <small className="help-text">
                        Get your API key from <a href="https://app.sendgrid.com/settings/api_keys" target="_blank" rel="noopener noreferrer">SendGrid Settings</a>
                    </small>
                </div>
            </div>

            <div className="config-section">
                <h2>Worklog Reminder Settings</h2>
                
                <div className="form-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                        />
                        Enable Daily Worklog Reminder
                    </label>
                    <small className="help-text">
                        When enabled, the system will automatically scan worklogs daily at the configured time
                    </small>
                </div>

                <div className="form-group">
                    <label>Threshold Hours</label>
                    <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={config.thresholdHours}
                        onChange={(e) => setConfig({ ...config, thresholdHours: parseFloat(e.target.value) || 0 })}
                        className="input-field"
                    />
                    <small className="help-text">
                        Users with total logged hours below this threshold will be included in the reminder email
                    </small>
                </div>

                <div className="form-group">
                    <label>Daily Scan Time (UTC)</label>
                    <input
                        type="time"
                        value={config.scanTime}
                        onChange={(e) => setConfig({ ...config, scanTime: e.target.value })}
                        className="input-field"
                    />
                    <small className="help-text">
                        Time in UTC when the daily scan will run (format: HH:mm). Current schedule: {config.scanTime} UTC
                    </small>
                </div>

                <div className="form-group">
                    <label>Email Recipients</label>
                    <div className="list-input">
                        <input
                            type="email"
                            value={newEmailRecipient}
                            onChange={(e) => setNewEmailRecipient(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAddEmailRecipient()}
                            placeholder="Enter email address"
                            className="input-field"
                        />
                        <button 
                            type="button" 
                            className="btn-secondary"
                            onClick={handleAddEmailRecipient}
                        >
                            Add
                        </button>
                    </div>
                    {config.emailRecipients.length > 0 && (
                        <ul className="item-list">
                            {config.emailRecipients.map((email, index) => (
                                <li key={index}>
                                    <span>{email}</span>
                                    <button 
                                        type="button" 
                                        className="btn-remove"
                                        onClick={() => handleRemoveEmailRecipient(email)}
                                    >
                                        Remove
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <small className="help-text">
                        Email addresses that will receive daily worklog reminder reports
                    </small>
                </div>

                <div className="form-group">
                    <label>Excluded Users (Account IDs)</label>
                    <div className="list-input">
                        <input
                            type="text"
                            value={newExcludedUser}
                            onChange={(e) => setNewExcludedUser(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAddExcludedUser()}
                            placeholder="Enter user account ID (e.g., 557058:xxx-xxx-xxx)"
                            className="input-field"
                        />
                        <button 
                            type="button" 
                            className="btn-secondary"
                            onClick={handleAddExcludedUser}
                        >
                            Add
                        </button>
                    </div>
                    {config.excludedUsers.length > 0 && (
                        <ul className="item-list">
                            {config.excludedUsers.map((userId, index) => (
                                <li key={index}>
                                    <span>{userId}</span>
                                    <button 
                                        type="button" 
                                        className="btn-remove"
                                        onClick={() => handleRemoveExcludedUser(userId)}
                                    >
                                        Remove
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <small className="help-text">
                        Users in this list will be excluded from worklog scanning
                    </small>
                </div>
            </div>

            {lastExecution && (
                <div className="config-section">
                    <h2>Last Execution Status</h2>
                    <div className="execution-info">
                        <p><strong>Date:</strong> {lastExecution.date}</p>
                        <p><strong>Status:</strong> 
                            <span className={`status-badge ${lastExecution.status}`}>
                                {lastExecution.status.toUpperCase()}
                            </span>
                        </p>
                        <p><strong>Users Found Below Threshold:</strong> {lastExecution.usersFound}</p>
                        {lastExecution.errorMessage && (
                            <p><strong>Error:</strong> <span className="error-text">{lastExecution.errorMessage}</span></p>
                        )}
                    </div>
                </div>
            )}

            <div className="config-actions">
                <button 
                    type="button" 
                    className="btn-primary btn-save"
                    onClick={handleSaveConfig}
                    disabled={saving || scanning}
                >
                    {saving ? 'Saving...' : 'Save Configuration'}
                </button>
                <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={handleManualScan}
                    disabled={saving || scanning}
                >
                    {scanning ? 'Running Scan...' : 'Run Scan Now'}
                </button>
                <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={loadConfiguration}
                    disabled={saving || scanning}
                >
                    Reload
                </button>
            </div>
        </div>
    );
}

export default App;
