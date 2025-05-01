// react-popup-src/src/OnboardingModal.jsx
import React from 'react';

// --- Define the steps for the onboarding tutorial ---
// You can customize the title and content for each step
const steps = [
    {
        title: "Welcome to Flashcard AI!",
        content: "Let's quickly go over how to create and review flashcards with gestures."
    },
    {
        title: "1. Select Text",
        content: "On any webpage, highlight the text you want to use for the 'Front' of your flashcard."
    },
    {
        title: "2. Open the Extension",
        content: "Click the Flashcard AI icon in your browser's toolbar to open this popup."
    },
    {
        title: "3. Create Your Card",
        content: "The selected text appears as the 'Front'. An AI suggestion for the 'Back' might load automatically. Edit the 'Back' if needed, choose a deck (optional), and click 'Save Flashcard'."
    },
    {
        title: "4. Manage Cards & Decks",
        content: "Click the 'Manage Cards' button (or tab) to view all your saved cards. Here you can edit, delete, and organize cards into decks."
    },
    {
        title: "5. Review Your Cards",
        content: "In the 'Manage Cards' section, switch to the 'Review Cards' tab. Select a deck and click 'Start Review'. Use buttons, keyboard shortcuts (shown on screen), or gestures!"
    },
    {
        title: "6. Train Gestures (Optional)",
        content: "Go to the 'Settings' tab. Start your webcam and follow the prompts to train simple gestures (like 'Yes', 'No', 'Hint') for hands-free reviewing."
    },
    {
        title: "Ready to Go!",
        content: "You're all set to create and review flashcards. Happy learning!"
    }
];

// --- The Modal Component ---
function OnboardingModal({ currentStep, onNext, onFinish }) {

    // Check if the current step index is valid
    if (currentStep < 0 || currentStep >= steps.length) {
        console.warn("Invalid onboarding step index:", currentStep);
        // Optionally call onFinish immediately or render nothing
        // onFinish();
        return null;
    }

    const currentStepData = steps[currentStep];
    const isLastStep = currentStep >= steps.length - 1;

    // --- Basic Inline Styles ---
    // You can move these to a CSS file for better organization
    const backdropStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.6)', // Slightly darker backdrop
        zIndex: 999, // Ensure backdrop is behind modal
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
    };

    const modalStyle = {
        backgroundColor: '#fff', // Use light theme background for modal
        color: '#333',         // Dark text for readability
        padding: '20px 25px',
        borderRadius: '8px',
        boxShadow: '0 5px 20px rgba(0, 0, 0, 0.25)',
        zIndex: 1000, // Ensure modal is above backdrop
        width: '90%',
        maxWidth: '360px', // Max width suitable for extension popup
        boxSizing: 'border-box',
        textAlign: 'left', // Align text left for readability
    };

     const titleStyle = {
         marginTop: 0,
         marginBottom: '10px',
         fontSize: '1.2em',
         borderBottom: '1px solid #eee',
         paddingBottom: '8px',
         fontWeight: '600', // Bolder title
         display: 'flex',
         justifyContent: 'space-between',
         alignItems: 'center',
     };

     const stepCounterStyle = {
         fontSize: '0.85em',
         fontWeight: 'normal',
         color: '#666',
     };

    const contentStyle = {
        lineHeight: '1.5',
        marginBottom: '20px',
        fontSize: '0.95em',
    };

    const buttonContainerStyle = {
        display: 'flex',
        justifyContent: 'flex-end', // Align buttons to the right
        gap: '10px', // Space between buttons
        marginTop: '10px',
    };

    // Basic button style, customize as needed
    const buttonBaseStyle = {
        padding: '8px 16px',
        borderRadius: '5px',
        border: '1px solid transparent',
        cursor: 'pointer',
        fontWeight: '500',
        fontSize: '0.9em',
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
    };

    const primaryButtonStyle = {
        ...buttonBaseStyle,
        backgroundColor: '#1976d2', // Example primary color
        color: 'white',
        borderColor: '#1976d2',
    };

    const secondaryButtonStyle = {
        ...buttonBaseStyle,
        backgroundColor: '#f0f0f0',
        color: '#444',
        borderColor: '#ccc',
    };
    // -------------------------

    return (
        // Using a portal might be overkill for an extension popup modal
        // Direct rendering within App should be fine
        <div style={backdropStyle} onClick={onFinish}> {/* Click backdrop to finish */}
            <div style={modalStyle} onClick={(e) => e.stopPropagation()}> {/* Prevent clicks inside modal from closing it */}
                <h4 style={titleStyle}>
                    {currentStepData.title}
                    <span style={stepCounterStyle}>({currentStep + 1}/{steps.length})</span>
                </h4>
                <p style={contentStyle}>{currentStepData.content}</p>

                <div style={buttonContainerStyle}>
                    {/* Render Skip button only if not the last step */}
                    {!isLastStep && (
                        <button onClick={onFinish} style={secondaryButtonStyle} title="Skip Tutorial">
                            Skip
                        </button>
                    )}
                    {/* Render Next or Finish button */}
                    <button onClick={isLastStep ? onFinish : onNext} style={primaryButtonStyle}>
                        {isLastStep ? "Finish" : "Next"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default OnboardingModal;