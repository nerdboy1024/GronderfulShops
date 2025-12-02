// ===========================
// PROGRESSIVE PROFILING MODAL
// Auto-prompts users to complete profile
// Include this in any page where you want to show profile prompts
// ===========================

const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5000/api'
    : 'https://YOUR_DOMAIN.com/api';

class ProfilePromptModal {
    constructor() {
        this.authToken = localStorage.getItem('authToken');
        this.modalElement = null;
        this.currentPrompt = null;
        this.hasShown = sessionStorage.getItem('profilePromptShown') === 'true';
    }

    async init() {
        // Don't show if not authenticated or already shown this session
        if (!this.authToken || this.hasShown) return;

        // Don't show on auth or preferences pages
        if (window.location.pathname.includes('auth.html') ||
            window.location.pathname.includes('preferences.html')) {
            return;
        }

        try {
            const response = await fetch(`${API_URL}/users/me/profile-prompt`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (!response.ok) return;

            const data = await response.json();

            if (data.completed) {
                // Profile is complete, no need to prompt
                return;
            }

            this.currentPrompt = data.prompt;

            // Show modal after a short delay (3 seconds)
            setTimeout(() => {
                this.show();
            }, 3000);

        } catch (error) {
            console.error('Profile prompt error:', error);
        }
    }

    show() {
        if (!this.currentPrompt) return;

        this.createModal();
        this.modalElement.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Mark as shown for this session
        sessionStorage.setItem('profilePromptShown', 'true');
        this.hasShown = true;
    }

    hide() {
        if (this.modalElement) {
            this.modalElement.style.display = 'none';
            document.body.style.overflow = '';
            this.modalElement.remove();
            this.modalElement = null;
        }
    }

    createModal() {
        // Create modal HTML
        const modal = document.createElement('div');
        modal.className = 'profile-prompt-modal';
        modal.innerHTML = `
            <div class="profile-prompt-overlay"></div>
            <div class="profile-prompt-content">
                <button class="profile-prompt-close">&times;</button>
                <div class="profile-prompt-header">
                    <h2>✨ ${this.currentPrompt.message}</h2>
                </div>
                <form class="profile-prompt-form" id="profilePromptForm">
                    ${this.renderFields()}
                    <div class="profile-prompt-actions">
                        <button type="button" class="profile-prompt-skip">Skip for now</button>
                        <button type="submit" class="profile-prompt-save">Save & Continue</button>
                    </div>
                </form>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .profile-prompt-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 10000;
                display: none;
                justify-content: center;
                align-items: center;
                animation: fadeIn 0.3s ease-out;
            }

            .profile-prompt-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(5px);
            }

            .profile-prompt-content {
                position: relative;
                background: linear-gradient(135deg, #1a0033 0%, #0a0014 100%);
                border: 2px solid #8b5cf6;
                border-radius: 20px;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                padding: 2.5rem;
                box-shadow: 0 20px 60px rgba(139, 92, 246, 0.4);
                animation: slideInUp 0.4s ease-out;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            @keyframes slideInUp {
                from {
                    transform: translateY(50px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }

            .profile-prompt-close {
                position: absolute;
                top: 1rem;
                right: 1rem;
                background: none;
                border: none;
                color: #9ca3af;
                font-size: 2rem;
                cursor: pointer;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.3s;
            }

            .profile-prompt-close:hover {
                background: rgba(139, 92, 246, 0.2);
                color: #8b5cf6;
            }

            .profile-prompt-header h2 {
                font-family: 'Cinzel', serif;
                font-size: 1.5rem;
                color: #f3f4f6;
                margin-bottom: 1.5rem;
                text-align: center;
            }

            .profile-prompt-form {
                display: flex;
                flex-direction: column;
                gap: 1.25rem;
            }

            .profile-field {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }

            .profile-field label {
                color: #d1d5db;
                font-size: 0.95rem;
                font-weight: 500;
            }

            .profile-field input[type="text"],
            .profile-field input[type="date"],
            .profile-field select {
                width: 100%;
                padding: 0.75rem;
                background: rgba(255, 255, 255, 0.05);
                border: 2px solid #374151;
                border-radius: 10px;
                color: #f3f4f6;
                font-size: 1rem;
                transition: all 0.3s;
            }

            .profile-field input:focus,
            .profile-field select:focus {
                outline: none;
                border-color: #8b5cf6;
                background: rgba(255, 255, 255, 0.08);
            }

            .profile-field small {
                color: #9ca3af;
                font-size: 0.85rem;
            }

            .profile-radio-group,
            .profile-checkbox-group {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }

            .profile-radio-item,
            .profile-checkbox-item {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.75rem;
                background: rgba(255, 255, 255, 0.03);
                border: 2px solid transparent;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.3s;
            }

            .profile-radio-item:hover,
            .profile-checkbox-item:hover {
                border-color: #8b5cf6;
                background: rgba(139, 92, 246, 0.1);
            }

            .profile-radio-item input,
            .profile-checkbox-item input {
                cursor: pointer;
            }

            .profile-radio-item label,
            .profile-checkbox-item label {
                margin: 0;
                cursor: pointer;
                color: #d1d5db;
                flex: 1;
            }

            .profile-prompt-actions {
                display: flex;
                gap: 1rem;
                margin-top: 1rem;
            }

            .profile-prompt-skip {
                flex: 1;
                padding: 0.75rem;
                background: transparent;
                border: 2px solid #374151;
                color: #9ca3af;
                border-radius: 10px;
                font-size: 1rem;
                cursor: pointer;
                transition: all 0.3s;
            }

            .profile-prompt-skip:hover {
                border-color: #6b7280;
                color: #d1d5db;
            }

            .profile-prompt-save {
                flex: 2;
                padding: 0.75rem;
                background: linear-gradient(135deg, #8b5cf6, #6d28d9);
                border: none;
                color: white;
                border-radius: 10px;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s;
            }

            .profile-prompt-save:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(139, 92, 246, 0.4);
            }

            .profile-prompt-save:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(modal);
        this.modalElement = modal;

        // Attach event listeners
        modal.querySelector('.profile-prompt-close').addEventListener('click', () => this.hide());
        modal.querySelector('.profile-prompt-overlay').addEventListener('click', () => this.hide());
        modal.querySelector('.profile-prompt-skip').addEventListener('click', () => this.hide());
        modal.querySelector('#profilePromptForm').addEventListener('submit', (e) => this.handleSubmit(e));
    }

    renderFields() {
        return this.currentPrompt.fields.map(field => {
            switch (field.type) {
                case 'radio':
                    return this.renderRadio(field);
                case 'multi-select':
                    return this.renderMultiSelect(field);
                case 'date':
                    return this.renderDate(field);
                case 'location':
                    return this.renderLocation(field);
                case 'boolean':
                    return this.renderBoolean(field);
                default:
                    return this.renderText(field);
            }
        }).join('');
    }

    renderRadio(field) {
        return `
            <div class="profile-field">
                <label>${field.label}</label>
                <div class="profile-radio-group">
                    ${field.options.map((option, index) => `
                        <div class="profile-radio-item">
                            <input type="radio" id="field_${field.name}_${index}" name="${field.name}" value="${option}" ${index === 0 ? 'checked' : ''}>
                            <label for="field_${field.name}_${index}">${option}</label>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderMultiSelect(field) {
        return `
            <div class="profile-field">
                <label>${field.label}</label>
                <div class="profile-checkbox-group">
                    ${field.options.map((option, index) => `
                        <div class="profile-checkbox-item">
                            <input type="checkbox" id="field_${field.name}_${index}" name="${field.name}" value="${option}">
                            <label for="field_${field.name}_${index}">${option}</label>
                        </div>
                    `).join('')}
                </div>
                ${field.privacy ? `<small>${field.privacy}</small>` : ''}
            </div>
        `;
    }

    renderDate(field) {
        return `
            <div class="profile-field">
                <label>${field.label}</label>
                <input type="text" name="${field.name}" placeholder="MM-DD (e.g., 07-14)">
                ${field.privacy ? `<small>${field.privacy}</small>` : ''}
            </div>
        `;
    }

    renderLocation(field) {
        return `
            <div class="profile-field">
                <label>City</label>
                <input type="text" name="location_city" placeholder="Your city">
            </div>
            <div class="profile-field">
                <label>Country</label>
                <input type="text" name="location_country" placeholder="Your country">
                ${field.privacy ? `<small>${field.privacy}</small>` : ''}
            </div>
        `;
    }

    renderBoolean(field) {
        return `
            <div class="profile-checkbox-item">
                <input type="checkbox" id="field_${field.name}" name="${field.name}">
                <label for="field_${field.name}">${field.label}</label>
            </div>
        `;
    }

    renderText(field) {
        return `
            <div class="profile-field">
                <label>${field.label}</label>
                <input type="text" name="${field.name}" placeholder="${field.label}">
            </div>
        `;
    }

    async handleSubmit(e) {
        e.preventDefault();

        const submitBtn = this.modalElement.querySelector('.profile-prompt-save');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';

        try {
            const formData = new FormData(e.target);
            const preferences = {};

            // Process form data based on field types
            this.currentPrompt.fields.forEach(field => {
                if (field.type === 'radio') {
                    preferences[field.name] = formData.get(field.name);
                } else if (field.type === 'multi-select') {
                    preferences[field.name] = formData.getAll(field.name);
                } else if (field.type === 'boolean') {
                    preferences[field.name] = formData.has(field.name);
                } else if (field.type === 'date') {
                    const dateValue = formData.get(field.name);
                    if (dateValue) {
                        const [month, day] = dateValue.split('-').map(Number);
                        preferences[field.name] = { month, day };
                    }
                } else if (field.type === 'location') {
                    preferences.location = {
                        city: formData.get('location_city') || '',
                        country: formData.get('location_country') || ''
                    };
                } else {
                    preferences[field.name] = formData.get(field.name);
                }
            });

            // Save preferences
            const response = await fetch(`${API_URL}/users/me/preferences`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify(preferences)
            });

            if (!response.ok) {
                throw new Error('Failed to save preferences');
            }

            // Show success and close
            this.showSuccessMessage();
            setTimeout(() => this.hide(), 1500);

        } catch (error) {
            console.error('Save error:', error);
            alert('Failed to save preferences. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save & Continue';
        }
    }

    showSuccessMessage() {
        const successDiv = document.createElement('div');
        successDiv.className = 'profile-prompt-success';
        successDiv.textContent = '✓ Preferences saved!';
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            padding: 1rem 2rem;
            border-radius: 10px;
            font-weight: 600;
            z-index: 10001;
            animation: slideInRight 0.3s ease-out;
        `;

        document.body.appendChild(successDiv);

        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    }
}

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const profilePrompt = new ProfilePromptModal();
    profilePrompt.init();
});

// Export for manual use
window.ProfilePromptModal = ProfilePromptModal;
