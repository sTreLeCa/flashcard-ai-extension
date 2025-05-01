// react-popup-src/src/App.jsx
import React, { useState, useEffect, useCallback } from 'react';
import ManageFlashcards from './ManageFlashcards'; // Import the child component
import SettingsPage from './SettingsPage';
// --- CORRECT: Import centralized DB utilities and constants ---
import { openDB, STORE_NAME, DECKS_STORE_NAME, UNASSIGNED_DECK_ID } from './db.js';

// --- REMOVED: Local DB logic and constants are gone ---

function App() {
    // --- State ---
    const [view, setView] = useState('create');
    const [selectedText, setSelectedText] = useState('');
    const [backText, setBackText] = useState('');
    // --- UPDATED: Initialize selectedDeckId to null (or the imported UNASSIGNED_DECK_ID) for clarity ---
    const [selectedDeckId, setSelectedDeckId] = useState(UNASSIGNED_DECK_ID); // Use the constant for initial state
    const [decks, setDecks] = useState([]);
    const [editingDeckId, setEditingDeckId] = useState(null);
    const [editingDeckName, setEditingDeckName] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');
    const [saveStatus, setSaveStatus] = useState('');
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [suggestionError, setSuggestionError] = useState('');

    // --- Deck Data Fetching ---
    const fetchDecks = useCallback(async () => {
        //setError(''); // Clear previous errors before fetching
        try {
            // CORRECT: Uses imported openDB
            const db = await openDB();
            // CORRECT: Uses imported DECKS_STORE_NAME
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
                    if (!error?.includes('Deck Fetch Error')) { // Avoid overwriting more specific errors
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
    }, [error]); // Dependency array verified

    // --- Suggestion Fetching ---
    const fetchSuggestion = useCallback(async (textToSuggest) => {
        // ... (fetchSuggestion code remains unchanged, no DB interaction here) ...
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
    }, []); // No DB dependencies

    // --- Initial Data Loading ---
    useEffect(() => {
        // ... (useEffect logic remains largely unchanged) ...
         let isMounted = true;
        const loadInitialData = async () => {
            if (!isMounted) return;
            setIsLoading(true); setError(''); setSelectedText(''); setFeedback(''); setSaveStatus('');
            setSuggestionError(''); setBackText(''); // Reset states
            setSelectedDeckId(UNASSIGNED_DECK_ID); // Reset selection to default

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
    }, [fetchDecks, fetchSuggestion]); // Dependencies verified

    // --- Flashcard Saving ---
    const handleSave = async () => {
        if (!selectedText || !backText.trim()) {
            setSaveStatus('Front or back text missing.');
            setTimeout(() => setSaveStatus(''), 3000);
            return;
        }
        setSaveStatus('Saving...');

        // --- UPDATED: Directly use selectedDeckId state ---
        // The state now correctly holds `null` (UNASSIGNED_DECK_ID) or the integer ID.
        const newFlashcard = {
            front: selectedText,
            back: backText.trim(),
            bucket: 1, // Default starting bucket
            createdAt: new Date().toISOString(),
            deckId: selectedDeckId, // Use the state variable directly
            notes: '', // Default empty notes/tags
            tags: [] // Default empty tags
        };
        // ---------------------------------------------------

        try {
            // CORRECT: Uses imported openDB
            const db = await openDB();
            // CORRECT: Uses imported STORE_NAME
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(newFlashcard);

            request.onsuccess = () => {
                 console.log('Flashcard added successfully!', request.result);
                 setSaveStatus(`Card saved! (ID: ${request.result})`);
                 setBackText(''); // Clear form on success
                 // --- UPDATED: Reset dropdown selection to UNASSIGNED ---
                 setSelectedDeckId(UNASSIGNED_DECK_ID); // Reset dropdown to default
                 // ----------------------------------------------------
                 setTimeout(() => setSaveStatus(''), 2000); // Clear feedback
            };
            request.onerror = (event) => {
                 console.error('Error adding flashcard:', event.target.error);
                 setSaveStatus(`Error saving card: ${event.target.error?.message}`);
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

    // --- Deck Management Handlers ---
    const handleCreateDeck = async (deckName, clearInputCallback) => {
        // ... (validation logic) ...
        if (!deckName.trim()) { /* ... */ return; }
        if (decks.some(deck => deck.name.toLowerCase() === deckName.trim().toLowerCase())) { /* ... */ return; }

        setFeedback('Creating deck...');
        try {
            // CORRECT: Uses imported openDB and DECKS_STORE_NAME
            const db = await openDB();
            const transaction = db.transaction(DECKS_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(DECKS_STORE_NAME);
            const newDeck = { name: deckName.trim(), createdAt: new Date().toISOString() };
            const addRequest = store.add(newDeck);
            // ... (onsuccess, onerror handlers remain the same) ...
             addRequest.onsuccess = async () => { setFeedback(`Deck "${deckName.trim()}" created.`); if (clearInputCallback) clearInputCallback(); await fetchDecks(); setTimeout(() => setFeedback(''), 2000); };
             addRequest.onerror = (e) => { setFeedback(`Error creating deck: ${e.target.error?.message}`); setTimeout(() => setFeedback(''), 3000); };
             transaction.onerror = (e) => { if (!feedback.startsWith('Error')) setFeedback(`Deck Create Tx Error: ${e.target.error?.message}`); setTimeout(() => setFeedback(''), 3000); };
        } catch (err) { setFeedback(`Deck Create DB Error: ${err.message}`); setTimeout(() => setFeedback(''), 3000); }
    };

    const handleEditDeck = (deck) => {
        setEditingDeckId(deck.id);
        setEditingDeckName(deck.name);
        setFeedback('');
    };

    const handleCancelEditDeck = () => {
        setEditingDeckId(null);
        setEditingDeckName('');
    };

    const handleSaveDeckName = async () => {
        // ... (validation logic) ...
        const trimmedName = editingDeckName.trim();
        if (!trimmedName || !editingDeckId) return;
        const originalDeck = decks.find(d => d.id === editingDeckId);
        if (trimmedName === originalDeck?.name) { setEditingDeckId(null); setEditingDeckName(''); return; }
        if (decks.some(deck => deck.id !== editingDeckId && deck.name.toLowerCase() === trimmedName.toLowerCase())) { /* ... */ return; }


        setFeedback(`Saving deck ${editingDeckId}...`);
        try {
            // CORRECT: Uses imported openDB and DECKS_STORE_NAME
            const db = await openDB();
            const transaction = db.transaction(DECKS_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(DECKS_STORE_NAME);
            // ... (get/put logic remains the same) ...
            const getReq = store.get(editingDeckId);
            getReq.onsuccess = () => {
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
            // CORRECT: Uses imported openDB, STORE_NAME, DECKS_STORE_NAME
            const db = await openDB();
            const transaction = db.transaction([STORE_NAME, DECKS_STORE_NAME], 'readwrite');
            const flashcardsStore = transaction.objectStore(STORE_NAME);
            const decksStore = transaction.objectStore(DECKS_STORE_NAME);
            const flashcardsIndex = flashcardsStore.index('deckIdIndex'); // Index name is literal

            const cardsToUpdatePromise = new Promise((resolve, reject) => {
                const cursorRequest = flashcardsIndex.openCursor(IDBKeyRange.only(deckToDelete.id));
                let cardsUpdated = 0;
                let errors = [];
                cursorRequest.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        try {
                            const card = cursor.value;
                            // --- UPDATED: Use imported constant ---
                            card.deckId = UNASSIGNED_DECK_ID; // Set to null
                            // ------------------------------------
                            const updateRequest = cursor.update(card);
                            updateRequest.onsuccess = () => cardsUpdated++;
                            updateRequest.onerror = (ue) => errors.push(ue.target.error);
                        } catch (updateErr) {
                            errors.push(updateErr);
                        }
                        cursor.continue();
                    } else {
                        if (errors.length > 0) reject(errors); else resolve(cardsUpdated);
                    }
                };
                cursorRequest.onerror = (e) => reject([e.target.error]);
            });

            // ... (rest of the delete logic remains the same) ...
            const numUpdated = await cardsToUpdatePromise;
            console.log(`Unassigned ${numUpdated} cards from deck ${deckToDelete.id}`);
            const deleteDeckRequest = decksStore.delete(deckToDelete.id);
            deleteDeckRequest.onsuccess = async () => { setFeedback(`Deck "${deckToDelete.name}" deleted.`); await fetchDecks(); setTimeout(() => setFeedback(''), 2000); };
            deleteDeckRequest.onerror = (e) => { setFeedback(`Error deleting deck record: ${e.target.error?.message}`); };
            transaction.oncomplete = () => { console.log("Delete deck transaction complete in App."); };
            transaction.onerror = (e) => { console.error("Delete deck transaction error:", e.target.error); if (!feedback.startsWith('Error')) { setFeedback(`Tx Error: ${e.target.error?.message}`); }};

        } catch (err) {
             console.error('Error during deck deletion process:', err);
             if (Array.isArray(err) && err.length > 0) {
                 setFeedback(`Error unassigning cards: ${err[0]?.message}`);
             } else {
                 setFeedback(`DB Error: ${err.message}`);
             }
        }
    };


    // --- Render Logic ---
    const renderCreateView = () => {
        // ... (styles remain the same) ...
        if (isLoading && !selectedText) return <div style={{textAlign:'center', padding: '20px'}}>Loading...</div>;
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
                        {/* Front and Back Textarea remain the same */}
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
                            value={backText}
                            onChange={(e) => {
                                 setBackText(e.target.value);
                                 setSuggestionError('');
                                 setSaveStatus('');
                            }}
                            placeholder={isSuggesting ? "Loading suggestion..." : "Enter the back..."}
                            disabled={saveStatus === 'Saving...'}
                            style={inputStyle}
                          />
                          {suggestionError && <p style={{ marginTop: '-5px', marginBottom: '10px', color: 'red', fontSize: '0.85em' }}>{suggestionError}</p>}


                         <label htmlFor="deck-select" style={labelStyle}>Add to Deck:</label>
                         {/* --- CORRECT: Dropdown uses imported UNASSIGNED_DECK_ID --- */}
                         <select
                             id="deck-select"
                             // Use String(null) for value comparison if UNASSIGNED_DECK_ID is null
                             value={selectedDeckId === null ? String(null) : selectedDeckId}
                             onChange={(e) => setSelectedDeckId(
                                 // Compare dropdown value ("null" or ID string)
                                 e.target.value === String(UNASSIGNED_DECK_ID)
                                 ? UNASSIGNED_DECK_ID // Set state to actual null constant
                                 : parseInt(e.target.value, 10) // Parse to integer
                              )}
                             disabled={isLoading || saveStatus === 'Saving...'}
                             style={inputStyle}
                         >
                             {/* Option value is String(null) which becomes "null" */}
                             <option value={String(UNASSIGNED_DECK_ID)}>-- Unassigned --</option>
                             {decks.map(deck => (<option key={deck.id} value={deck.id}>{deck.name}</option>))}
                             {decks.length === 0 && <option disabled>No decks available</option>}
                         </select>
                         {/* -------------------------------------------------------------- */}


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
        // ... (JSX structure remains the same) ...
         <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '10px', width: '380px' }}>
            {/* Navigation Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-around', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '5px' }}>
            <button onClick={() => setView('create')} disabled={view === 'create'}>Create New</button>
            <button onClick={() => setView('manage')} disabled={view === 'manage'}>Manage Cards</button>
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
                    // isLoading={isLoading} // Optional pass-through
                    // error={error} // Optional pass-through
                />
            )}
            {view === 'settings' && <SettingsPage />}
        </div>
    );
}

export default App;