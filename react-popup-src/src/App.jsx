// react-popup-src/src/App.jsx
import React, { useState, useEffect, useCallback } from 'react';
import ManageFlashcards from './ManageFlashcards'; // Import the child component
import SettingsPage from './SettingsPage';
import OnboardingModal from './OnboardingModal'; // <<< Import Onboarding Modal
// --- CORRECT: Import centralized DB utilities and constants ---
import { openDB, STORE_NAME, DECKS_STORE_NAME, UNASSIGNED_DECK_ID } from './db.js';


function App() {
    // --- State ---
    const [view, setView] = useState('create');
    const [selectedText, setSelectedText] = useState('');
    const [backText, setBackText] = useState('');
    const [selectedDeckId, setSelectedDeckId] = useState(UNASSIGNED_DECK_ID);
    // --- NEW: State for Hint Image URL ---
    const [hintImageUrl, setHintImageUrl] = useState('');
    // ------------------------------------
    const [decks, setDecks] = useState([]);
    const [editingDeckId, setEditingDeckId] = useState(null);
    const [editingDeckName, setEditingDeckName] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');
    const [saveStatus, setSaveStatus] = useState('');
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [suggestionError, setSuggestionError] = useState('');
    // --- NEW: State for Onboarding ---
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [onboardingStep, setOnboardingStep] = useState(0);
    // -------------------------------

    // --- Deck Data Fetching ---
    const fetchDecks = useCallback(async () => {
        //setError('');
        try {
            const db = await openDB();
            const transaction = db.transaction(DECKS_STORE_NAME, 'readonly');
            const store = transaction.objectStore(DECKS_STORE_NAME);
            const getAllDecksRequest = store.getAll();

            return new Promise((resolve, reject) => {
                getAllDecksRequest.onsuccess = () => {
                    setDecks(getAllDecksRequest.result || []);
                    resolve();
                };
                getAllDecksRequest.onerror = (e) => {
                    console.error("App: Error fetching decks:", e.target.error);
                    setError(`Deck Fetch Error: ${e.target.error?.message}`);
                    reject(e.target.error);
                };
                transaction.onerror = (e) => {
                    console.error('App: Deck read transaction error:', e.target.error);
                    if (!error?.includes('Deck Fetch Error')) {
                        setError(`Deck Tx Error: ${e.target.error?.message}`);
                    }
                    reject(e.target.error);
                };
                 transaction.oncomplete = () => {
                     console.log("App: Fetch decks transaction complete.");
                 };
            });
        } catch (err) {
            console.error('App: Failed to open DB for fetching decks:', err);
            setError(`Deck DB Error: ${err.message}`);
            return Promise.reject(err);
        }
    }, [error]);

    // --- Suggestion Fetching ---
    const fetchSuggestion = useCallback(async (textToSuggest) => {
         if (!textToSuggest || textToSuggest.trim().length === 0) { return; }
        console.log(`App: Fetching suggestion for "${textToSuggest.substring(0,50)}..."`);
        setIsSuggesting(true);
        setSuggestionError('');
        setBackText('');
        setSaveStatus('');
        const backendUrl = 'http://localhost:3001/api/suggest';
        try {
            const response = await fetch(backendUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify({ text: textToSuggest }), });
            if (!response.ok) { let errorMsg = `HTTP error! status: ${response.status}`; try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; } catch (e) { /* Ignore */ } throw new Error(errorMsg); }
            const data = await response.json();
            if (data.suggestion) { setBackText(data.suggestion); } else { setSuggestionError("Received empty suggestion from backend."); }
        } catch (err) { console.error("App: Failed to fetch suggestion:", err); setSuggestionError(`Suggestion Error: ${err.message}`); }
        finally { setIsSuggesting(false); }
    }, []);

    // --- Initial Data Loading ---
    useEffect(() => {
         let isMounted = true;
        const loadInitialData = async () => {
            if (!isMounted) return;
            setIsLoading(true);
            // Reset states
            setError(''); setSelectedText(''); setFeedback(''); setSaveStatus('');
            setSuggestionError(''); setBackText('');
            setSelectedDeckId(UNASSIGNED_DECK_ID);
            setHintImageUrl(''); // <<< Reset hint image URL
            setShowOnboarding(false); // <<< Reset onboarding visibility initially

            // Promise to get selected text from background
            const textPromise = new Promise((resolve, reject) => {
                if (chrome?.runtime?.sendMessage) {
                    chrome.runtime.sendMessage({ type: "GET_SELECTED_TEXT" }, (response) => {
                        if (!isMounted) return;
                        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message || "Unknown error fetching text")); }
                        else { resolve(response?.text || ''); }
                    });
                } else { reject(new Error("Extension runtime environment error.")); }
            });

            try {
                // Fetch text and decks concurrently
                const [fetchedText] = await Promise.all([
                    textPromise,
                    fetchDecks()
                ]);

                if (isMounted) {
                    setSelectedText(fetchedText);
                    if (fetchedText) { fetchSuggestion(fetchedText); }

                    // --- NEW: Check Onboarding Status ---
                    if (chrome?.storage?.local) {
                        try {
                            const result = await chrome.storage.local.get(['hasCompletedOnboarding']);
                            if (!result.hasCompletedOnboarding && isMounted) {
                                console.log("First time user detected, starting onboarding.");
                                setShowOnboarding(true); // Show the modal
                                setOnboardingStep(0);    // Start at the first step
                            } else {
                                console.log("User has completed onboarding previously or storage unavailable.");
                            }
                        } catch (storageError) {
                            console.error("Error checking onboarding status:", storageError);
                            // Continue without onboarding if storage fails
                        }
                    } else {
                         console.warn("chrome.storage.local not available, skipping onboarding check.");
                    }
                    // ----------------------------------
                }
            } catch (err) { if (isMounted && !error) setError(err.message || "Failed initial load."); }
            finally { if (isMounted) setIsLoading(false); }
        };
        loadInitialData();
        return () => { isMounted = false; };
    }, [fetchDecks, fetchSuggestion]); // Dependencies verified

    // --- Flashcard Saving ---
    const handleSave = async () => {
        if (!selectedText || !backText.trim()) {
            setSaveStatus('Front or back text missing.');
            setTimeout(() => setSaveStatus(''), 3000);
            return;
        }
        setSaveStatus('Saving...');

        // --- ADDED: Include hintImageUrl and potential SRS fields ---
        // Assuming you might add SRS fields later based on Phase 5 todo
        const newFlashcard = {
            front: selectedText,
            back: backText.trim(),
            // Default SRS fields (adjust if implementing refined SRS later)
            easeFactor: 2.5,
            interval: 0,
            repetitions: 0,
            nextReviewDate: new Date().toISOString(), // Default to review now/soon
            lastReviewed: null,
            // -------------------------------------------------------
            createdAt: new Date().toISOString(),
            deckId: selectedDeckId, // Correctly uses state (null or integer)
            notes: '',
            tags: [],
            // --- NEW: Add hintImageUrl ---
            hintImageUrl: hintImageUrl.trim() || null, // Save trimmed URL or null
            // --------------------------
        };
        // -----------------------------------------------------------

        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(newFlashcard);

            request.onsuccess = () => {
                 console.log('Flashcard added successfully!', request.result);
                 setSaveStatus(`Card saved! (ID: ${request.result})`);
                 setBackText('');
                 setSelectedDeckId(UNASSIGNED_DECK_ID);
                 // --- NEW: Clear hint image URL input ---
                 setHintImageUrl('');
                 // --------------------------------------
                 setTimeout(() => setSaveStatus(''), 2000);
            };
            request.onerror = (event) => { /* ... */ setSaveStatus(`Error saving card: ${event.target.error?.message}`); };
            transaction.onerror = (event) => { /* ... */ if (!saveStatus.startsWith('Error')) { setSaveStatus(`Card Save Tx Error: ${event.target.error?.message}`); }};
            transaction.oncomplete = () => { console.log("Save flashcard transaction complete."); };
        } catch (err) { console.error('Failed to open DB for saving:', err); setSaveStatus(`Card Save DB Error: ${err.message}`); }
    };

    // --- Deck Management Handlers ---
    const handleCreateDeck = async (deckName, clearInputCallback) => {
        const trimmedName = deckName.trim();
        if (!trimmedName) { setFeedback("Deck name cannot be empty."); setTimeout(()=>setFeedback(''), 2000); return; }
        if (decks.some(deck => deck.name.toLowerCase() === trimmedName.toLowerCase())) { setFeedback(`Deck "${trimmedName}" already exists.`); setTimeout(()=>setFeedback(''), 3000); return; }
        setFeedback('Creating deck...');
        try {
            const db = await openDB(); const transaction = db.transaction(DECKS_STORE_NAME, 'readwrite'); const store = transaction.objectStore(DECKS_STORE_NAME);
            const newDeck = { name: trimmedName, createdAt: new Date().toISOString() }; const addRequest = store.add(newDeck);
            addRequest.onsuccess = async () => { setFeedback(`Deck "${trimmedName}" created.`); if (clearInputCallback) clearInputCallback(); await fetchDecks(); setTimeout(() => setFeedback(''), 2000); };
            addRequest.onerror = (e) => { setFeedback(`Error creating deck: ${e.target.error?.message}`); setTimeout(() => setFeedback(''), 3000); };
            transaction.onerror = (e) => { if (!feedback.startsWith('Error')) setFeedback(`Deck Create Tx Error: ${e.target.error?.message}`); setTimeout(() => setFeedback(''), 3000); };
        } catch (err) { setFeedback(`Deck Create DB Error: ${err.message}`); setTimeout(() => setFeedback(''), 3000); }
    };

    const handleEditDeck = (deck) => { /* ... */ setEditingDeckId(deck.id); setEditingDeckName(deck.name); setFeedback(''); };
    const handleCancelEditDeck = () => { /* ... */ setEditingDeckId(null); setEditingDeckName(''); };

    const handleSaveDeckName = async () => {
        const trimmedName = editingDeckName.trim();
        if (!trimmedName || !editingDeckId) return;
        const originalDeck = decks.find(d => d.id === editingDeckId);
        if (trimmedName === originalDeck?.name) { setEditingDeckId(null); setEditingDeckName(''); return; }
        if (decks.some(deck => deck.id !== editingDeckId && deck.name.toLowerCase() === trimmedName.toLowerCase())) { setFeedback(`Another deck named "${trimmedName}" already exists.`); setTimeout(()=>setFeedback(''), 3000); return; }
        setFeedback(`Saving deck ${editingDeckId}...`);
        try {
            const db = await openDB(); const transaction = db.transaction(DECKS_STORE_NAME, 'readwrite'); const store = transaction.objectStore(DECKS_STORE_NAME);
            const getReq = store.get(editingDeckId);
            getReq.onsuccess = () => { /* ... get/put logic ... */
                 const deckToUpdate = getReq.result;
                 if (!deckToUpdate) { setFeedback("Error: Deck not found to update."); return; }
                 deckToUpdate.name = trimmedName;
                 const putReq = store.put(deckToUpdate);
                 putReq.onsuccess = async () => { setFeedback(`Deck renamed to "${trimmedName}".`); setEditingDeckId(null); setEditingDeckName(''); await fetchDecks(); setTimeout(() => setFeedback(''), 2000); };
                 putReq.onerror = (e) => { setFeedback(`Error renaming deck: ${e.target.error?.message}`); };
             };
            getReq.onerror = (e) => { setFeedback(`Error fetching deck to rename: ${e.target.error?.message}`); };
            transaction.onerror = (e) => { if (!feedback.startsWith('Error')) setFeedback(`Tx Error: ${e.target.error?.message}`); };
        } catch (err) { setFeedback(`DB Error: ${err.message}`); }
    };

    const handleDeleteDeck = async (deckToDelete) => {
        if (!deckToDelete || !window.confirm(`DELETE DECK: "${deckToDelete.name}"?\n\nCards in this deck will become Unassigned.\n\nAre you sure?`)) return;
        setFeedback(`Deleting deck "${deckToDelete.name}"...`);
        try {
            const db = await openDB();
            const transaction = db.transaction([STORE_NAME, DECKS_STORE_NAME], 'readwrite');
            const flashcardsStore = transaction.objectStore(STORE_NAME);
            const decksStore = transaction.objectStore(DECKS_STORE_NAME);
            const flashcardsIndex = flashcardsStore.index('deckIdIndex');

            const cardsToUpdatePromise = new Promise((resolve, reject) => { /* ... cursor logic ... */
                 const cursorRequest = flashcardsIndex.openCursor(IDBKeyRange.only(deckToDelete.id));
                 let cardsUpdated = 0; let errors = [];
                 cursorRequest.onsuccess = (e) => { const cursor = e.target.result; if (cursor) { try { const card = cursor.value; card.deckId = UNASSIGNED_DECK_ID; const updateRequest = cursor.update(card); updateRequest.onsuccess = () => cardsUpdated++; updateRequest.onerror = (ue) => errors.push(ue.target.error); } catch(updateErr) { errors.push(updateErr); } cursor.continue(); } else { if (errors.length > 0) reject(errors); else resolve(cardsUpdated); }};
                 cursorRequest.onerror = (e) => reject([e.target.error]);
             });

            const numUpdated = await cardsToUpdatePromise;
            console.log(`Unassigned ${numUpdated} cards from deck ${deckToDelete.id}`);
            const deleteDeckRequest = decksStore.delete(deckToDelete.id);
            deleteDeckRequest.onsuccess = async () => { setFeedback(`Deck "${deckToDelete.name}" deleted.`); await fetchDecks(); setTimeout(() => setFeedback(''), 2000); };
            deleteDeckRequest.onerror = (e) => { setFeedback(`Error deleting deck record: ${e.target.error?.message}`); };
            transaction.oncomplete = () => { console.log("Delete deck transaction complete in App."); };
            transaction.onerror = (e) => { console.error("Delete deck transaction error:", e.target.error); if (!feedback.startsWith('Error')) { setFeedback(`Tx Error: ${e.target.error?.message}`); }};

        } catch (err) { /* ... error handling ... */
              console.error('Error during deck deletion process:', err);
              if (Array.isArray(err) && err.length > 0) { setFeedback(`Error unassigning cards: ${err[0]?.message}`); }
              else { setFeedback(`DB Error: ${err.message}`); }
        }
    };

     // --- NEW: Onboarding Handlers ---
     const handleNextOnboarding = () => {
        setOnboardingStep(prev => prev + 1);
    };

    const handleFinishOnboarding = () => {
        if (chrome?.storage?.local) {
            chrome.storage.local.set({ hasCompletedOnboarding: true }, () => {
                console.log("Onboarding flag set in storage.");
                setShowOnboarding(false); // Hide the modal
            });
        } else {
            console.warn("Cannot set onboarding flag: chrome.storage.local not available.");
            setShowOnboarding(false); // Hide modal anyway
        }
    };
    // ------------------------------


    // --- Render Logic ---
    const renderCreateView = () => {
        // ... (styles remain the same) ...
        if (isLoading && !selectedText && !error) return <div style={{textAlign:'center', padding: '20px'}}>Loading...</div>; // Improved loading check
        if (error && error.includes("DB Error")) return <div style={{color: 'red', textAlign:'center', padding: '20px'}}>Error: {error}</div>;

        const inputStyle = { display: 'block', boxSizing: 'border-box', width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '1em' };
        const labelStyle = { fontWeight: 'bold', display: 'block', marginBottom: '4px', fontSize: '0.9em' };
        const detailBoxStyle = { border: '1px solid #ccc', padding: '8px', marginBottom: '10px', borderRadius: '4px', backgroundColor: '#f9f9f9', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordWrap: 'break-word' };
        const feedbackStyle = { marginTop: '10px', color: saveStatus.startsWith('Error') ? 'red' : 'green', minHeight: '1em', fontWeight: 'bold', textAlign: 'center'};
        const suggestionFeedbackStyle = {...feedbackStyle, color: suggestionError ? 'red' : '#666', fontWeight: 'normal'};


        return (
            <div style={{ padding: '0 10px 10px 10px' }}>
                 <h4>Create Flashcard</h4>
                 {error && !error.includes("DB Error") && <p style={{ color: 'red', textAlign:'center' }}>{error}</p>}

                 {selectedText ? (
                     <>
                        {/* Front Text */}
                        <label htmlFor="flashcard-front" style={labelStyle}>Front:</label>
                         <div id="flashcard-front" style={detailBoxStyle}>{selectedText}</div>

                        {/* Back Text */}
                         <label htmlFor="flashcard-back" style={labelStyle}>
                             Back (Translation/Definition):
                             {isSuggesting && <span style={{fontWeight:'normal', fontStyle:'italic', marginLeft: '5px'}}>(Getting suggestion...)</span>}
                             {suggestionError && <span style={{fontWeight:'normal', fontStyle:'italic', marginLeft: '5px', color:'red'}}>(Suggestion failed)</span>}
                         </label>
                         <textarea id="flashcard-back" rows="3" value={backText} onChange={(e) => { setBackText(e.target.value); setSuggestionError(''); setSaveStatus(''); }} placeholder={isSuggesting ? "Loading suggestion..." : "Enter the back..."} disabled={saveStatus === 'Saving...'} style={inputStyle} />
                         {suggestionError && <p style={{ marginTop: '-5px', marginBottom: '10px', color: 'red', fontSize: '0.85em' }}>{suggestionError}</p>}

                         {/* --- NEW: Hint Image URL Input --- */}
                         <label htmlFor="flashcard-hint-image" style={labelStyle}>Hint Image URL (Optional):</label>
                         <input
                             type="url" // Basic browser validation for URL format
                             id="flashcard-hint-image"
                             value={hintImageUrl} // Controlled component
                             onChange={(e) => setHintImageUrl(e.target.value)}
                             placeholder="https://example.com/image.png"
                             disabled={saveStatus === 'Saving...'}
                             style={inputStyle}
                         />
                         {/* ------------------------------ */}

                         {/* Deck Selection */}
                         <label htmlFor="deck-select" style={labelStyle}>Add to Deck:</label>
                         <select id="deck-select" value={selectedDeckId === null ? String(null) : selectedDeckId} onChange={(e) => setSelectedDeckId( e.target.value === String(UNASSIGNED_DECK_ID) ? UNASSIGNED_DECK_ID : parseInt(e.target.value, 10) )} disabled={isLoading || saveStatus === 'Saving...'} style={inputStyle} >
                             <option value={String(UNASSIGNED_DECK_ID)}>-- Unassigned --</option>
                             {decks.map(deck => (<option key={deck.id} value={deck.id}>{deck.name}</option>))}
                             {decks.length === 0 && <option disabled>No decks available</option>}
                         </select>

                         <button onClick={handleSave} disabled={!backText.trim() || saveStatus === 'Saving...'}>
                             {saveStatus === 'Saving...' ? 'Saving...' : 'Save Flashcard'}
                         </button>
                         {saveStatus && <p style={feedbackStyle}>{saveStatus}</p>}
                     </>
                 ) : (
                      // Show error only if it's not the generic extension env error
                     error && !error.includes("environment error")
                        ? <p style={{ color: 'red', textAlign:'center' }}>Error fetching selected text.</p>
                        : <p style={{ textAlign: 'center', padding: '15px 0' }}>Select text on a webpage first.</p>
                 )}
            </div>
        );
    };

    // --- Main App Return ---
    return (
         <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '10px', width: '380px' }}>
            {/* --- NEW: Onboarding Modal Render --- */}
            {showOnboarding && !isLoading && ( // Render only if showOnboarding is true and initial load is done
                <OnboardingModal
                    currentStep={onboardingStep}
                    onNext={handleNextOnboarding}
                    onFinish={handleFinishOnboarding}
                />
            )}
            {/* --------------------------------- */}

            {/* Navigation Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-around', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '5px' }}>
                 <button onClick={() => setView('create')} disabled={view === 'create'}>Create New</button>
                 <button onClick={() => setView('manage')} disabled={view === 'manage'}>Manage Cards</button>
                 <button onClick={() => setView('settings')} disabled={view === 'settings'}>Settings</button>
             </div>

             {/* General Feedback/Error Area */}
             {feedback && <p style={{ marginTop: 0, marginBottom: 0, color: feedback.startsWith('Error') ? 'red' : 'green', textAlign:'center', fontWeight:'bold' }}>{feedback}</p>}
             {error && !feedback && <p style={{ marginTop: 0, marginBottom: 0, color: 'red', textAlign:'center' }}>Error: {error}</p>}


            {/* Conditional View Rendering */}
            {view === 'create' && renderCreateView()}
            {view === 'manage' && (
                <ManageFlashcards
                    decks={decks}
                    editingDeckId={editingDeckId}
                    setEditingDeckId={setEditingDeckId}
                    editingDeckName={editingDeckName}
                    setEditingDeckName={setEditingDeckName}
                    onCreateDeck={handleCreateDeck}
                    onEditDeck={handleEditDeck}
                    onSaveDeckName={handleSaveDeckName}
                    onCancelEditDeck={handleCancelEditDeck}
                    onDeleteDeck={handleDeleteDeck}
                    feedback={feedback}
                    setFeedback={setFeedback}
                    // Pass hintImageUrl state/setter IF ManageFlashcards needs to edit it directly
                    // (Current setup edits via editCardFormData locally in ManageFlashcards)
                />
            )}
            {view === 'settings' && <SettingsPage />}
        </div>
    );
}

export default App;