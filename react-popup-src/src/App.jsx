import React, { useState, useEffect, useCallback } from 'react';
import ManageFlashcards from './ManageFlashcards'; // Import the child component
import SettingsPage from './SettingsPage';
// VVVV ADD THIS IMPORT VVVV
import { openDB, DB_NAME, STORE_NAME, DECKS_STORE_NAME, UNASSIGNED_DECK_ID } from './db.js'; // KEEP THIS LINE
let dbPromise = null;




function App() {
    // --- State ---
    const [view, setView] = useState('create'); // 'create', 'manage', or 'settings'
    const [selectedText, setSelectedText] = useState('');
    const [backText, setBackText] = useState('');
    const [selectedDeckId, setSelectedDeckId] = useState(''); // For create view dropdown selection
    const [decks, setDecks] = useState([]); // *** SOURCE OF TRUTH FOR DECKS (Lifted State) ***
    const [editingDeckId, setEditingDeckId] = useState(null); // State for inline edit in Manage view
    const [editingDeckName, setEditingDeckName] = useState(''); // State for inline edit name in Manage view
    const [isLoading, setIsLoading] = useState(true); // Combined loading state
    const [error, setError] = useState(''); // Combined error state
    const [feedback, setFeedback] = useState(''); // Shared feedback (primarily for deck ops)
    const [saveStatus, setSaveStatus] = useState(''); // Specific feedback for card saving
    const [isSuggesting, setIsSuggesting] = useState(false); // Is suggestion being fetched?
    const [suggestionError, setSuggestionError] = useState(''); // Error specific to suggestion fetching

    // --- Deck Data Fetching ---
    const fetchDecks = useCallback(async () => {
        // Don't clear general error here, let initial load handle that
        try {
            const db = await openDB();
            const transaction = db.transaction(DECKS_STORE_NAME, 'readonly');
            const store = transaction.objectStore(DECKS_STORE_NAME);
            const getAllDecksRequest = store.getAll();
            return new Promise((resolve, reject) => {
                getAllDecksRequest.onsuccess = () => {
                    setDecks(getAllDecksRequest.result || []);
                    resolve(); // Indicate success
                };
                getAllDecksRequest.onerror = (e) => {
                    console.error("App: Error fetching decks:", e.target.error);
                    setError(`Deck Fetch Error: ${e.target.error?.message}`); // Set error state
                    reject(e.target.error);
                };
                transaction.onerror = (e) => {
                    console.error('App: Deck read transaction error:', e.target.error);
                    // Avoid setting error if a more specific one exists
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
            setError(`Deck DB Error: ${err.message}`); // Set error state
            return Promise.reject(err);
        }
    }, [error]); // Re-run if general error changes? Maybe not needed. Consider removing error dependency.

    const fetchSuggestion = useCallback(async (textToSuggest) => {
        if (!textToSuggest || textToSuggest.trim().length === 0) {
            console.log("App: No text to suggest.");
            return; // Don't fetch if no text
        }

        console.log(`App: Fetching suggestion for "${textToSuggest.substring(0,50)}..."`);
        setIsSuggesting(true);
        setSuggestionError(''); // Clear previous suggestion errors
        setBackText(''); // Clear any manual input while fetching
        setSaveStatus(''); // Clear previous save status

        // Make sure your backend server is running on localhost:3001
        const backendUrl = 'http://localhost:3001/api/suggest';

        try {
            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: textToSuggest }),
            });

            if (!response.ok) {
                // Try to get error message from backend response body
                let errorMsg = `HTTP error! status: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                } catch (e) { /* Ignore parsing error */ }
                throw new Error(errorMsg);
            }

            const data = await response.json();

            if (data.suggestion) {
                console.log("App: Suggestion received:", data.suggestion);
                setBackText(data.suggestion); // <<< UPDATE backText state
            } else {
                 console.warn("App: Suggestion received but was empty/null.");
                 setSuggestionError("Received empty suggestion from backend.");
            }

        } catch (err) {
            console.error("App: Failed to fetch suggestion:", err);
            setSuggestionError(`Suggestion Error: ${err.message}`);
        } finally {
            setIsSuggesting(false);
        }
    }, []); // No dependencies needed here

    // --- Initial Data Loading ---
    useEffect(() => {
        let isMounted = true;
        const loadInitialData = async () => {
            if (!isMounted) return;
            setIsLoading(true); setError(''); setSelectedText(''); setFeedback(''); setSaveStatus('');
            setSuggestionError(''); setBackText(''); // Reset states

            // Promise to get selected text from background
            const textPromise = new Promise((resolve, reject) => {
                if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({ type: "GET_SELECTED_TEXT" }, (response) => {
                        if (!isMounted) return; // Check if component unmounted during async call
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message || "Unknown error fetching text"));
                        } else {
                            resolve(response?.text || '');
                        }
                    });
                } else {
                    reject(new Error("Extension runtime environment error."));
                }
            });

            try {
                // Fetch text and decks concurrently
                const [fetchedText] = await Promise.all([
                    textPromise,
                    fetchDecks() // Fetch decks using the function that updates state
                ]);
                if (isMounted) {
                    setSelectedText(fetchedText);
                    // --- Trigger suggestion fetch AFTER getting text ---
                    if (fetchedText) {
                         fetchSuggestion(fetchedText); // <<< CALL fetchSuggestion
                    }
                }
            } catch (err) { if (isMounted && !error) setError(err.message || "Failed initial load."); }
            finally { if (isMounted) setIsLoading(false); }
        };
        loadInitialData();
        return () => { isMounted = false; };
    }, [fetchDecks, fetchSuggestion]); // Rerun effect if fetchDecks function identity changes (it shouldn't with useCallback)

    // --- Flashcard Saving ---
    const handleSave = async () => {
        if (!selectedText || !backText.trim()) {
            setSaveStatus('Front or back text missing.');
            setTimeout(() => setSaveStatus(''), 3000); // Clear feedback after a delay
            return;
        }
        setSaveStatus('Saving...');
        const newFlashcard = {
            front: selectedText,
            back: backText.trim(),
            bucket: 1, // Default starting bucket
            createdAt: new Date().toISOString(),
            deckId: selectedDeckId ? parseInt(selectedDeckId, 10) : null, // Use selected ID
            notes: '', // Default empty notes/tags
            tags: []
        };
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(newFlashcard);

            request.onsuccess = () => {
                 console.log('Flashcard added successfully!', request.result);
                 setSaveStatus(`Card saved! (ID: ${request.result})`);
                 setBackText(''); // Clear form on success
                 setSelectedDeckId(''); // Reset dropdown
                 setTimeout(() => setSaveStatus(''), 2000); // Clear feedback
            };
            request.onerror = (event) => {
                 console.error('Error adding flashcard:', event.target.error);
                 setSaveStatus(`Error saving card: ${event.target.error?.message}`);
                 // Don't auto-clear error feedback
            };
            transaction.onerror = (event) => {
                 console.error('Save transaction error:', event.target.error);
                 if (!saveStatus.startsWith('Error')) {
                     setSaveStatus(`Card Save Tx Error: ${event.target.error?.message}`);
                 }
            };
             transaction.oncomplete = () => {
                 console.log("Save flashcard transaction complete.");
             };
        } catch (err) {
            console.error('Failed to open DB for saving:', err);
            setSaveStatus(`Card Save DB Error: ${err.message}`);
        }
    };

    // --- Deck Management Handlers (Live here in App) ---
    const handleCreateDeck = async (deckName, clearInputCallback) => {
        const trimmedName = deckName.trim();
        if (!trimmedName) { setFeedback("Deck name cannot be empty."); setTimeout(()=>setFeedback(''), 2000); return; }
        // Optional: Check if deck name already exists
        if (decks.some(deck => deck.name.toLowerCase() === trimmedName.toLowerCase())) {
             setFeedback(`Deck "${trimmedName}" already exists.`);
             setTimeout(()=>setFeedback(''), 3000);
             return;
        }
        setFeedback('Creating deck...');
        try {
            const db = await openDB(); const transaction = db.transaction(DECKS_STORE_NAME, 'readwrite'); const store = transaction.objectStore(DECKS_STORE_NAME);
            const newDeck = { name: trimmedName, createdAt: new Date().toISOString() }; const addRequest = store.add(newDeck);
            addRequest.onsuccess = async () => { setFeedback(`Deck "${trimmedName}" created.`); if (clearInputCallback) clearInputCallback(); await fetchDecks(); setTimeout(() => setFeedback(''), 2000); }; // Refresh deck list
            addRequest.onerror = (e) => { setFeedback(`Error creating deck: ${e.target.error?.message}`); setTimeout(() => setFeedback(''), 3000); };
            transaction.onerror = (e) => { if (!feedback.startsWith('Error')) setFeedback(`Deck Create Tx Error: ${e.target.error?.message}`); setTimeout(() => setFeedback(''), 3000); };
        } catch (err) { setFeedback(`Deck Create DB Error: ${err.message}`); setTimeout(() => setFeedback(''), 3000); }
    };

    const handleEditDeck = (deck) => { // Called by ManageFlashcards when Rename is clicked
        setEditingDeckId(deck.id);
        setEditingDeckName(deck.name);
        setFeedback(''); // Clear general feedback
    };

    const handleCancelEditDeck = () => { // Called by ManageFlashcards
        setEditingDeckId(null);
        setEditingDeckName('');
    };

    const handleSaveDeckName = async () => { // Called by ManageFlashcards
        const trimmedName = editingDeckName.trim();
        if (!trimmedName || !editingDeckId) return;
        const originalDeck = decks.find(d => d.id === editingDeckId);
        if (trimmedName === originalDeck?.name) { // No change
            setEditingDeckId(null); setEditingDeckName(''); return;
        }
        // Optional: Check if new name conflicts with another existing deck
        if (decks.some(deck => deck.id !== editingDeckId && deck.name.toLowerCase() === trimmedName.toLowerCase())) {
             setFeedback(`Another deck named "${trimmedName}" already exists.`);
             setTimeout(()=>setFeedback(''), 3000);
             return;
        }
        setFeedback(`Saving deck ${editingDeckId}...`);
        try {
            const db = await openDB(); const transaction = db.transaction(DECKS_STORE_NAME, 'readwrite'); const store = transaction.objectStore(DECKS_STORE_NAME);
            // Get original deck again from DB to be safe and preserve other potential fields
            const getReq = store.get(editingDeckId);
            getReq.onsuccess = () => {
                const deckToUpdate = getReq.result;
                if (!deckToUpdate) { setFeedback("Error: Deck not found to update."); return; }
                deckToUpdate.name = trimmedName; // Update the name
                const putReq = store.put(deckToUpdate); // Put the whole object back
                putReq.onsuccess = async () => { setFeedback(`Deck renamed to "${trimmedName}".`); setEditingDeckId(null); setEditingDeckName(''); await fetchDecks(); setTimeout(() => setFeedback(''), 2000); }; // Refresh deck list
                putReq.onerror = (e) => { setFeedback(`Error renaming deck: ${e.target.error?.message}`); };
            };
            getReq.onerror = (e) => { setFeedback(`Error fetching deck to rename: ${e.target.error?.message}`); };
            transaction.onerror = (e) => { if (!feedback.startsWith('Error')) setFeedback(`Tx Error: ${e.target.error?.message}`); };
        } catch (err) { setFeedback(`DB Error: ${err.message}`); }
    };

    const handleDeleteDeck = async (deckToDelete) => { // Called by ManageFlashcards
        if (!deckToDelete || !window.confirm(`DELETE DECK: "${deckToDelete.name}"?\n\nCards in this deck will become Unassigned.\n\nAre you sure?`)) return;
        setFeedback(`Deleting deck "${deckToDelete.name}"...`);
        try {
            const db = await openDB(); const transaction = db.transaction([STORE_NAME, DECKS_STORE_NAME], 'readwrite'); const flashcardsStore = transaction.objectStore(STORE_NAME); const decksStore = transaction.objectStore(DECKS_STORE_NAME); const flashcardsIndex = flashcardsStore.index('deckIdIndex');
            // --- Promise to update cards ---
            const cardsToUpdatePromise = new Promise((resolve, reject) => {
                const cursorRequest = flashcardsIndex.openCursor(IDBKeyRange.only(deckToDelete.id)); let cardsUpdated=0; let errors = [];
                cursorRequest.onsuccess = (e) => { const cursor = e.target.result; if (cursor) { try { const card = cursor.value; card.deckId = null; const updateRequest = cursor.update(card); updateRequest.onsuccess = () => cardsUpdated++; updateRequest.onerror = (ue) => errors.push(ue.target.error); } catch(updateErr) { errors.push(updateErr); } cursor.continue(); } else { if (errors.length > 0) reject(errors); else resolve(cardsUpdated); }}; // Resolve/reject when cursor finishes
                cursorRequest.onerror = (e) => reject([e.target.error]); // Reject if cursor creation fails
            });
            // --- Wait for card updates, then delete deck ---
            const numUpdated = await cardsToUpdatePromise;
            console.log(`Unassigned ${numUpdated} cards from deck ${deckToDelete.id}`);
            const deleteDeckRequest = decksStore.delete(deckToDelete.id);
            deleteDeckRequest.onsuccess = async () => { setFeedback(`Deck "${deckToDelete.name}" deleted.`); await fetchDecks(); setTimeout(() => setFeedback(''), 2000); }; // Refresh deck list
            deleteDeckRequest.onerror = (e) => { setFeedback(`Error deleting deck record: ${e.target.error?.message}`); };
            // --- Transaction handlers ---
            transaction.oncomplete = () => { console.log("Delete deck transaction complete in App."); /* Might need to refresh cards in Manage view if one was affected */ };
            transaction.onerror = (e) => { console.error("Delete deck transaction error:", e.target.error); if (!feedback.startsWith('Error')) { setFeedback(`Tx Error: ${e.target.error?.message}`); }};
        } catch (err) {
            console.error('Error during deck deletion process:', err);
            // Handle errors from the card update promise as well
             if (Array.isArray(err) && err.length > 0) { // Check if it's the array of errors from cursor
                 setFeedback(`Error unassigning cards: ${err[0]?.message}`);
             } else {
                 setFeedback(`DB Error: ${err.message}`);
             }
        }
    };


    // --- Render Logic ---
    const renderCreateView = () => {
        if (isLoading && !selectedText) return <div style={{textAlign:'center', padding: '20px'}}>Loading...</div>;
        if (error && error.includes("DB Error")) return <div style={{color: 'red', textAlign:'center', padding: '20px'}}>Error: {error}</div>;

        const inputStyle = { display: 'block', boxSizing: 'border-box', width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '1em' };
        const labelStyle = { fontWeight: 'bold', display: 'block', marginBottom: '4px', fontSize: '0.9em' };
        const detailBoxStyle = { border: '1px solid #ccc', padding: '8px', marginBottom: '10px', borderRadius: '4px', backgroundColor: '#f9f9f9', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordWrap: 'break-word' };
        const feedbackStyle = { marginTop: '10px', color: saveStatus.startsWith('Error') ? 'red' : 'green', minHeight: '1em', fontWeight: 'bold', textAlign: 'center'};
        const suggestionFeedbackStyle = {...feedbackStyle, color: suggestionError ? 'red' : '#666', fontWeight: 'normal'}; // Style for suggestion status

        return (
            <div style={{ padding: '0 10px 10px 10px' }}>
                 <h4>Create Flashcard</h4>
                 {error && !error.includes("DB Error") && <p style={{ color: 'red', textAlign:'center' }}>{error}</p>}

                 {selectedText ? (
                     <>
                         <label htmlFor="flashcard-front" style={labelStyle}>Front:</label>
                         <div id="flashcard-front" style={detailBoxStyle}>{selectedText}</div>

                         <label htmlFor="flashcard-back" style={labelStyle}>
                             Back (Translation/Definition):
                             {isSuggesting && <span style={{fontWeight:'normal', fontStyle:'italic', marginLeft: '5px'}}>(Getting suggestion...)</span>}
                             {suggestionError && <span style={{fontWeight:'normal', fontStyle:'italic', marginLeft: '5px', color:'red'}}>(Suggestion failed)</span>}
                         </label>
                         <textarea
                            id="flashcard-back"
                            rows="3"
                            value={backText} // Value is now controlled by state (updated by suggestion or typing)
                            onChange={(e) => {
                                 setBackText(e.target.value); // Allow override
                                 setSuggestionError(''); // Clear error on type
                                 setSaveStatus(''); // Clear status on type
                            }}
                            placeholder={isSuggesting ? "Loading suggestion..." : "Enter the back..."} // Dynamic placeholder
                            disabled={saveStatus === 'Saving...'}
                            style={inputStyle}
                          />
                          {/* Display suggestion error more prominently if needed */}
                          {suggestionError && <p style={{ marginTop: '-5px', marginBottom: '10px', color: 'red', fontSize: '0.85em' }}>{suggestionError}</p>}

                         <label htmlFor="deck-select" style={labelStyle}>Add to Deck:</label>
                         <select id="deck-select" value={String(selectedDeckId)} onChange={(e) => setSelectedDeckId(e.target.value === String(UNASSIGNED_DECK_ID) ? UNASSIGNED_DECK_ID 
                            : parseInt(e.target.value, 10))} disabled={isLoading || saveStatus === 'Saving...'} style={inputStyle} >
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
                     !error.includes("environment error") && <p>Select text on a page first.</p>
                 )}
            </div>
        );
    };

    // --- Main App Return ---
    return (
        // Increased width slightly, added padding
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '10px', width: '380px' }}>
            {/* Navigation Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-around', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '5px' }}>
            <button onClick={() => setView('create')} disabled={view === 'create'}>Create New</button>
            <button onClick={() => setView('manage')} disabled={view === 'manage'}>Manage Cards</button>
            {/* VVV ADD THIS BUTTON VVV */}
            <button onClick={() => setView('settings')} disabled={view === 'settings'}>Settings</button>
        </div>

            {/* Show General Feedback/Error from App State */}
            {feedback && <p style={{ marginTop: 0, marginBottom: 0, color: feedback.startsWith('Error') ? 'red' : 'green', textAlign:'center', fontWeight:'bold' }}>{feedback}</p>}
            {error && !feedback && <p style={{ marginTop: 0, marginBottom: 0, color: 'red', textAlign:'center' }}>Error: {error}</p>}


            {/* Conditional View Rendering - Pass state and handlers down */}
            {view === 'create' && renderCreateView()}
            {view === 'manage' && (
                <ManageFlashcards
                    // Pass deck state and handlers
                    decks={decks} // The master list
                    editingDeckId={editingDeckId}
                    setEditingDeckId={setEditingDeckId} // Allow Manage to set which deck is being edited
                    editingDeckName={editingDeckName}
                    setEditingDeckName={setEditingDeckName} // Allow Manage to update the temp edit name
                    onCreateDeck={handleCreateDeck} // Pass handler function
                    onEditDeck={handleEditDeck} // Pass handler function
                    onSaveDeckName={handleSaveDeckName} // Pass handler function
                    onCancelEditDeck={handleCancelEditDeck} // Pass handler function
                    onDeleteDeck={handleDeleteDeck} // Pass handler function
                    // Pass feedback state and setter (Manage might set card-specific feedback)
                    feedback={feedback}
                    setFeedback={setFeedback}
                    // Pass general loading/error state for consistency? Optional. Manage has its own card loading.
                    // isLoading={isLoading}
                    // error={error}
                />
            )}
            {view === 'settings' && <SettingsPage />}
        </div>
    );
}

export default App;