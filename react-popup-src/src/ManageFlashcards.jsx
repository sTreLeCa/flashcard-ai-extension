// react-popup-src/src/ManageFlashcards.jsx
import React, { useState, useEffect, useCallback } from 'react';
import ReviewFlashcards from './ReviewFlashcards'; // Import the review component
// --- CORRECTED: Ensure DB utilities are imported ---
import { openDB, STORE_NAME, UNASSIGNED_DECK_ID } from './db.js';

// Component Definition
function ManageFlashcards({
    decks,                  // Decks list (from App state)
    feedback,               // General feedback message (from App state)
    setFeedback,            // Function to set App's feedback message
    onCreateDeck,           // Function in App to create a deck
    onEditDeck,             // Function in App to start deck edit
    onSaveDeckName,         // Function in App to save renamed deck
    onCancelEditDeck,       // Function in App to cancel deck rename
    onDeleteDeck,           // Function in App to delete a deck
    editingDeckId,          // ID of deck being edited (from App state)
    setEditingDeckId,       // Function to set App's editingDeckId
    editingDeckName,        // Current edit name (from App state)
    setEditingDeckName      // Function to set App's editingDeckName
}) {
    // --- State ---
    const [activeTab, setActiveTab] = useState('manage');
    const [flashcards, setFlashcards] = useState([]);
    const [isLoadingCards, setIsLoadingCards] = useState(true);
    const [cardError, setCardError] = useState('');
    const [selectedCardId, setSelectedCardId] = useState(null);
    const [isEditingCard, setIsEditingCard] = useState(false);
    // --- UPDATED: Initial state includes hintImageUrl ---
    const [editCardFormData, setEditCardFormData] = useState({
        front: '',
        back: '',
        notes: '',
        tags: '',
        deckId: '', // Will be set to null or integer ID
        hintImageUrl: ''
    });
    const [newDeckName, setNewDeckName] = useState('');

    // --- Fetch Flashcards ---
    const fetchFlashcards = useCallback(async () => {
        setIsLoadingCards(true); setCardError(''); setFlashcards([]);
        setSelectedCardId(null); setIsEditingCard(false);
        try {
            // CORRECT: Uses imported openDB and STORE_NAME
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const getAllRequest = store.getAll();
            return new Promise((resolve, reject) => {
                 getAllRequest.onsuccess = () => { setFlashcards(getAllRequest.result || []); resolve(); };
                 getAllRequest.onerror = (e) => { setCardError(`Card Fetch Error: ${e.target.error?.message}`); reject(e.target.error); };
                 transaction.onerror = (e) => { setCardError(`Card Tx Error: ${e.target.error?.message}`); reject(e.target.error); };
            });
        } catch (err) { setCardError(`Card DB Error: ${err.message}`); return Promise.reject(err); }
         finally { setIsLoadingCards(false); }
    }, []);

    useEffect(() => {
        fetchFlashcards();
    }, [fetchFlashcards]);

    // --- Helper ---
    const selectedCard = flashcards.find(card => card?.id === selectedCardId);

    // --- Flashcard Event Handlers ---
    const handleViewDetails = (id) => { setSelectedCardId(id); setIsEditingCard(false); setFeedback(''); setEditingDeckId(null); };
    const handleCloseDetails = () => { setSelectedCardId(null); setIsEditingCard(false); setFeedback(''); };

    const handleEditCard = () => {
        if (!selectedCard) return;
        setFeedback('');
        // --- UPDATED: Initialize form data including hintImageUrl ---
        setEditCardFormData({
            front: selectedCard.front || '',
            back: selectedCard.back || '',
            notes: selectedCard.notes || '',
            tags: (selectedCard.tags || []).join(', '),
            // Use nullish coalescing to handle potential null/undefined deckId
            deckId: selectedCard.deckId ?? UNASSIGNED_DECK_ID,
            hintImageUrl: selectedCard.hintImageUrl || '' // Initialize with current value
        });
        setIsEditingCard(true);
    };

    const handleCancelEditCard = () => { setIsEditingCard(false); setFeedback(''); };

    // Generic change handler for form inputs (including hintImageUrl)
    const handleEditCardFormChange = (event) => {
        const { name, value } = event.target;
        // Handle deckId specifically: empty string from select means UNASSIGNED (null)
        const processedValue = name === 'deckId'
            ? (value === '' ? UNASSIGNED_DECK_ID : parseInt(value, 10))
            : value;
        setEditCardFormData(prevData => ({ ...prevData, [name]: processedValue }));
    };

    const handleSaveChangesCard = async () => {
        if (!selectedCard) return;
        setFeedback('Saving Card...');
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const getRequest = store.get(selectedCardId);

            getRequest.onsuccess = (event) => {
                const originalCard = event.target.result;
                if (!originalCard) { setFeedback("Error: Card not found."); return; }

                // --- UPDATED: Include hintImageUrl in the update ---
                const updatedCard = {
                    ...originalCard, // Preserve existing fields (like SRS data)
                    front: editCardFormData.front.trim(),
                    back: editCardFormData.back.trim(),
                    notes: editCardFormData.notes.trim(),
                    tags: editCardFormData.tags.split(',').map(t => t.trim()).filter(t => t !== ''),
                    deckId: editCardFormData.deckId, // Already null or integer in state
                    hintImageUrl: editCardFormData.hintImageUrl.trim() || null, // Save trimmed URL or null
                    lastModified: new Date().toISOString()
                };
                // ----------------------------------------------------

                const putRequest = store.put(updatedCard);
                putRequest.onsuccess = () => {
                    setFeedback('Card changes saved!');
                    setIsEditingCard(false);
                    // Update the card in the local state for immediate UI refresh
                    setFlashcards(prev => prev.map(c => c.id === selectedCardId ? updatedCard : c));
                    // --- ADDED: Re-select card to force detail view refresh ---
                    setSelectedCardId(selectedCardId);
                    // ----------------------------------------------------------
                    setTimeout(() => setFeedback(''), 2000);
                };
                putRequest.onerror = (e) => { setFeedback(`Error saving card: ${e.target.error?.message}`); };
            };
            getRequest.onerror = (e) => { setFeedback(`Error fetching card to save: ${e.target.error?.message}`); };
            transaction.onerror = (e) => { if (!feedback?.startsWith('Error')) setFeedback(`Card Save Tx Error: ${e.target.error?.message}`); };
        } catch (err) { setFeedback(`Card Save DB Error: ${err.message}`); }
    };

    const handleDeleteCard = async () => {
        if (!selectedCard || !window.confirm(`DELETE CARD: "${selectedCard.front}"?`)) return;
        setFeedback('Deleting Card...');
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const deleteRequest = store.delete(selectedCardId);
            deleteRequest.onsuccess = () => {
                setFeedback('Card deleted.');
                setFlashcards(prev => prev.filter(card => card.id !== selectedCardId));
                setSelectedCardId(null); // Deselect card
                setIsEditingCard(false); // Ensure edit mode is off
                setTimeout(() => setFeedback(''), 2000);
            };
            deleteRequest.onerror = (e) => { setFeedback(`Error deleting card: ${e.target.error?.message}`); };
            transaction.onerror = (e) => { if (!feedback?.startsWith('Error')) setFeedback(`Card Delete Tx Error: ${e.target.error?.message}`); };
        } catch (err) { setFeedback(`Card Delete DB Error: ${err.message}`); }
    };

    // --- Deck Management Handlers (Delegate to App) ---
    const handleInternalCreateDeck = () => { onCreateDeck(newDeckName, () => setNewDeckName('')); };
    const handleInternalEditDeck = (deck) => { onEditDeck(deck); };
    const handleInternalCancelEditDeck = () => { onCancelEditDeck(); };
    const handleInternalSaveDeckName = () => { onSaveDeckName(); };
    const handleInternalDeleteDeck = (deck) => { onDeleteDeck(deck); };


    // --- Render Logic ---
    // Styles...
    const baseStyle = { padding: '10px', marginBottom: '15px', borderRadius: '4px' };
    const sectionStyle = { ...baseStyle, border: '1px solid #eee' };
    const cardStyle = { ...baseStyle, border: '1px solid #ccc', backgroundColor: '#f9f9f9', marginBottom: '8px' };
    const detailAreaStyle = { ...baseStyle, border: '1px solid #ddd', backgroundColor: 'white', marginTop: '15px' };
    const inputStyle = { display: 'block', boxSizing: 'border-box', width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '3px' };
    const deckInputStyle = { flexGrow: 1, marginRight: '5px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px' };
    const labelStyle = { fontWeight: 'bold', display: 'block', marginBottom: '3px', fontSize: '0.9em' };
    const buttonGroupStyle = { marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-start' };
    const deckListItemStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #eee', gap: '10px' };
    const deckButtonGroupStyle = { display: 'flex', gap: '5px', flexShrink: 0 };
    const feedbackStyle = { marginTop: '10px', color: feedback?.startsWith('Error') ? 'red' : 'green', minHeight: '1em', fontWeight: 'bold', textAlign: 'center' };
    const tabsContainerStyle = { display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '20px' };
    const tabStyle = { padding: '10px 20px', cursor: 'pointer', backgroundColor: '#f1f1f1', border: '1px solid #ddd', borderBottomColor: '#f1f1f1', borderRadius: '5px 5px 0 0', marginRight: '5px' };
    const activeTabStyle = { ...tabStyle, backgroundColor: 'white', borderBottomColor: 'white', fontWeight: 'bold' };
    // --- NEW/UPDATED Styles ---
    const srsInfoStyle = { fontSize: '0.85em', color: '#444', marginTop: '8px', paddingTop: '8px', borderTop: '1px dotted #ccc' };
    const detailTextStyle = { margin: '2px 0 8px 0' }; // Consistent margin for detail paragraphs
    const imageUrlStyle = { fontSize: '0.8em', color: '#555', wordBreak: 'break-all', maxHeight: '4em', overflow: 'hidden' };

    return (
        <div>
            <h2>Flashcard Management</h2>
            {feedback && <p style={feedbackStyle}>{feedback}</p>}
            {cardError && <p style={{color:'red', textAlign: 'center'}}>{cardError}</p>}

            {/* Tab Navigation */}
            <div style={tabsContainerStyle}>
                <div style={activeTab === 'manage' ? activeTabStyle : tabStyle} onClick={() => setActiveTab('manage')}> Manage Cards & Decks </div>
                <div style={activeTab === 'review' ? activeTabStyle : tabStyle} onClick={() => setActiveTab('review')}> Review Cards </div>
            </div>

            {activeTab === 'manage' ? (
                // --- MANAGE TAB ---
                <div>
                    {/* Deck Management Section */}
                    {!selectedCardId && (
                        <div style={sectionStyle}>
                            {/* ... Deck UI remains the same ... */}
                            <h4>Decks</h4>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                <input type="text" value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} placeholder="Enter new deck name" style={{...inputStyle, width: 'auto', flexGrow: 1, marginBottom: 0}} />
                                <button onClick={handleInternalCreateDeck} disabled={!newDeckName.trim()}>Create Deck</button>
                            </div>
                            {decks.length > 0 ? (
                                <div style={{ maxHeight: '150px', overflowY: 'auto', borderTop: '1px solid #ddd', marginTop: '10px', paddingTop: '5px' }}>
                                    {decks.map(deck => (
                                        <div key={deck.id} style={deckListItemStyle}>
                                            {editingDeckId === deck.id ? ( <> <input type="text" value={editingDeckName} onChange={(e) => setEditingDeckName(e.target.value)} style={deckInputStyle} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleInternalSaveDeckName(); else if (e.key === 'Escape') handleInternalCancelEditDeck(); }}/> <div style={deckButtonGroupStyle}> <button onClick={handleInternalSaveDeckName} disabled={!editingDeckName.trim() || editingDeckName.trim() === deck.name}>Save</button> <button onClick={handleInternalCancelEditDeck}>Cancel</button> </div> </>
                                            ) : ( <> <span title={deck.name} style={{ marginRight: '10px', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck.name}</span> <div style={deckButtonGroupStyle}> <button onClick={() => handleInternalEditDeck(deck)} style={{padding: '2px 5px'}}>Rename</button> <button onClick={() => handleInternalDeleteDeck(deck)} style={{ backgroundColor: '#f44336', color: 'white', border: 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: '3px' }}>X</button> </div> </> )}
                                        </div>
                                    ))}
                                </div>
                            ) : <p style={{fontSize: '0.9em', color: '#666', marginTop: '10px'}}>No decks created yet.</p>}
                        </div>
                    )}

                    {/* Separator */}
                    {!selectedCardId && <hr style={{margin: '20px 0'}}/>}

                    {/* Card List Section */}
                    {!selectedCardId && (
                        <>
                             {/* ... Card list UI remains the same ... */}
                            <h4>Flashcards</h4>
                            {isLoadingCards && <p>Loading cards...</p>}
                            {cardError && <p style={{color: 'red'}}>Error loading cards: {cardError}</p>}
                            {!isLoadingCards && !cardError && flashcards.length === 0 && <p>No flashcards saved yet.</p>}
                            {!isLoadingCards && !cardError && flashcards.length > 0 && (
                                <ul style={{ listStyle: 'none', padding: 0, maxHeight: '300px', overflowY: 'auto' }}>
                                    {flashcards.map((card) => (
                                        <li key={card.id} style={cardStyle}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span title={card.front} style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '10px' }}>{card.front}</span>
                                                <button onClick={() => handleViewDetails(card.id)} style={{flexShrink: 0}}>View Details</button>
                                            </div>
                                            <p style={{fontSize: '0.8em', color: '#555', margin: '5px 0 0 0'}}>Deck: {decks.find(d => d.id === card.deckId)?.name || 'Unassigned'}</p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}

                    {/* Detail/Edit View Area for selected card */}
                    {selectedCard && (
                        <div style={detailAreaStyle}>
                            <h3>{isEditingCard ? 'Edit Flashcard' : 'Flashcard Details'} (ID: {selectedCard.id})</h3>
                            {!isEditingCard ? (
                                // --- Card View Mode (UPDATED) ---
                                <>
                                    <p style={detailTextStyle}><strong style={labelStyle}>Front:</strong> {selectedCard.front}</p>
                                    <p style={detailTextStyle}><strong style={labelStyle}>Back:</strong> {selectedCard.back}</p>
                                    {selectedCard.notes && <p style={detailTextStyle}><strong style={labelStyle}>Notes:</strong> <span style={{whiteSpace: 'pre-wrap'}}>{selectedCard.notes}</span></p>}
                                    {selectedCard.tags?.length > 0 && <p style={detailTextStyle}><strong style={labelStyle}>Tags:</strong> {selectedCard.tags.join(', ')}</p>}
                                    <p style={detailTextStyle}><strong style={labelStyle}>Deck:</strong> {decks.find(d => d.id === selectedCard.deckId)?.name || 'Unassigned'}</p>

                                    {/* --- UPDATED: Show Hint Image URL --- */}
                                    {selectedCard.hintImageUrl && (
                                        <p style={detailTextStyle}>
                                            <strong style={labelStyle}>Hint Image URL:</strong>
                                            {/* Display clickable link */}
                                            <a href={selectedCard.hintImageUrl} target="_blank" rel="noopener noreferrer" style={imageUrlStyle} title={selectedCard.hintImageUrl}>
                                                {selectedCard.hintImageUrl}
                                            </a>
                                        </p>
                                    )}
                                    {/* --------------------------------- */}

                                    {/* --- UPDATED: Show SRS Info --- */}
                                    <div style={srsInfoStyle}>
                                         <p style={{margin: '0 0 5px 0'}}><strong style={labelStyle}>Next Review:</strong> {selectedCard.nextReviewDate ? new Date(selectedCard.nextReviewDate).toLocaleDateString() : 'Not scheduled'}</p>
                                         <p style={{margin: 0}}><strong style={labelStyle}>Ease Factor:</strong> {selectedCard.easeFactor !== undefined ? selectedCard.easeFactor.toFixed(1) : 'N/A'}</p>
                                         {/* Optional: Display interval/repetitions */}
                                         {/* <p><strong style={labelStyle}>Interval (days):</strong> {selectedCard.interval ?? 'N/A'}</p> */}
                                         {/* <p><strong style={labelStyle}>Repetitions:</strong> {selectedCard.repetitions ?? 'N/A'}</p> */}
                                    </div>
                                    {/* ------------------------------ */}

                                    <p style={{fontSize: '0.8em', color: '#666', marginTop: '10px'}}>
                                        <strong style={labelStyle}>Created:</strong> {selectedCard.createdAt ? new Date(selectedCard.createdAt).toLocaleString() : 'N/A'} <br/>
                                        {selectedCard.lastModified && <> <strong style={labelStyle}>Modified:</strong> {new Date(selectedCard.lastModified).toLocaleString()} </> }
                                    </p>

                                    <div style={buttonGroupStyle}>
                                        <button onClick={handleEditCard}>Edit Card</button>
                                        <button onClick={handleDeleteCard} style={{backgroundColor: '#f44336', color: 'white'}}>Delete Card</button>
                                        <button onClick={handleCloseDetails} style={{marginLeft: 'auto'}}>Close Details</button>
                                    </div>
                                </>
                            ) : (
                                // --- Card Edit Mode (UPDATED) ---
                                <>
                                    <div><label htmlFor="edit-front" style={labelStyle}>Front:</label><textarea id="edit-front" name="front" value={editCardFormData.front} onChange={handleEditCardFormChange} rows="3" style={inputStyle} /></div>
                                    <div><label htmlFor="edit-back" style={labelStyle}>Back:</label><textarea id="edit-back" name="back" value={editCardFormData.back} onChange={handleEditCardFormChange} rows="3" style={inputStyle} /></div>
                                    <div><label htmlFor="edit-notes" style={labelStyle}>Notes:</label><textarea id="edit-notes" name="notes" value={editCardFormData.notes} onChange={handleEditCardFormChange} rows="2" style={inputStyle} placeholder="Optional notes..." /></div>
                                    <div><label htmlFor="edit-tags" style={labelStyle}>Tags (comma-separated):</label><input type="text" id="edit-tags" name="tags" value={editCardFormData.tags} onChange={handleEditCardFormChange} style={inputStyle} placeholder="e.g., vocabulary, chapter 1" /></div>

                                    {/* --- NEW: Hint Image URL Input in Edit Mode --- */}
                                    <div>
                                        <label htmlFor="edit-hint-image" style={labelStyle}>Hint Image URL (Optional):</label>
                                        <input
                                            type="url"
                                            id="edit-hint-image"
                                            name="hintImageUrl" // Matches state key
                                            value={editCardFormData.hintImageUrl || ''} // Controlled input
                                            onChange={handleEditCardFormChange}
                                            placeholder="https://example.com/image.png"
                                            style={inputStyle}
                                        />
                                    </div>
                                    {/* ------------------------------------------ */}

                                    <div>
                                        <label htmlFor="edit-deck" style={labelStyle}>Assign to Deck:</label>
                                        <select
                                            id="edit-deck"
                                            name="deckId"
                                            // Set value to empty string if deckId is null (UNASSIGNED)
                                            value={editCardFormData.deckId === UNASSIGNED_DECK_ID ? '' : editCardFormData.deckId}
                                            onChange={handleEditCardFormChange}
                                            style={inputStyle}
                                        >
                                            <option value="">-- Unassigned --</option>
                                            {decks.map(deck => (<option key={deck.id} value={deck.id}>{deck.name}</option>))}
                                        </select>
                                    </div>
                                    <div style={buttonGroupStyle}>
                                        <button onClick={handleSaveChangesCard}>Save Card Changes</button>
                                        <button onClick={handleCancelEditCard}>Cancel</button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                // --- REVIEW TAB ---
                <ReviewFlashcards
                    decks={decks}
                    // Pass openDB only if absolutely necessary, prefer importing within ReviewFlashcards
                    setFeedback={setFeedback}
                />
            )}
        </div>
    );
}

export default ManageFlashcards;