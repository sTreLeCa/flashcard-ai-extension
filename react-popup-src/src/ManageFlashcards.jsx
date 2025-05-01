// react-popup-src/src/ManageFlashcards.jsx
import React, { useState, useEffect, useCallback} from 'react';
import ReviewFlashcards from './ReviewFlashcards'; // Import the review component

// --- IndexedDB Logic (Version 2 - Complete, but duplicated - Should match App.jsx) ---
// This section MUST be identical in App.jsx until refactored
const DB_NAME = 'flashcardDB';
const DB_VERSION = 4;
const STORE_NAME = 'flashcards';
const DECKS_STORE_NAME = 'decks';
let dbPromise = null;

function openDB() {
    // --- V2 openDB function (same as provided previously for App.jsx) ---
    if (dbPromise && dbPromise.readyState !== 'done') { return dbPromise; }
    console.log(`Manage: Opening/Requesting DB: ${DB_NAME} v${DB_VERSION}`);
    dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { return reject(new Error("IndexedDB not supported by this browser.")); }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
             const currentVersion = event.oldVersion; console.log(`Manage: DB upgrade needed from v${currentVersion} to v${DB_VERSION}.`);
             const tempDb = event.target.result; const transaction = event.target.transaction;
             if (!tempDb.objectStoreNames.contains(STORE_NAME)) {tempDb.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });console.log(`Manage: Created store ${STORE_NAME}`);}
             if (currentVersion < 2) {
                 if (!tempDb.objectStoreNames.contains(DECKS_STORE_NAME)) {tempDb.createObjectStore(DECKS_STORE_NAME, { keyPath: 'id', autoIncrement: true });console.log(`Manage: Created store ${DECKS_STORE_NAME}`);}
                 if (transaction && transaction.objectStoreNames.contains(STORE_NAME)) { try { const fs = transaction.objectStore(STORE_NAME); if (!fs.indexNames.contains('deckIdIndex')) {fs.createIndex('deckIdIndex', 'deckId', { unique: false });console.log(`Manage: Created index deckIdIndex`);}} catch(e) { console.error("Manage: Error creating index", e); }} else {console.warn("Manage: Tx inactive for index add");}
             }
             console.log('Manage: DB upgrade finished.');
        };
        request.onsuccess=(e)=>{const db=e.target.result;console.log(`Manage: DB "${DB_NAME}" opened (v${db.version}).`);db.onerror=(errEvent)=>{console.error("Manage: DB error:",errEvent.target.error);dbPromise=null;};db.onclose=()=>{console.warn('Manage: DB closed.');dbPromise=null;};resolve(db);};
        request.onerror=(e)=>{console.error("Manage: Error opening DB:",e.target.error);dbPromise=null;reject(e.target.error);};
        request.onblocked=(e)=>{console.warn("Manage: DB open blocked.");dbPromise=null;reject(new Error("DB blocked"));}
    });
    return dbPromise;
}
// --- End DB Logic ---


// Receive props from App for deck management
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
    // --- Tab State ---
    const [activeTab, setActiveTab] = useState('manage'); // 'manage' or 'review'

    // --- Local State for Card Management ---
    const [flashcards, setFlashcards] = useState([]); // Cards for display
    const [isLoadingCards, setIsLoadingCards] = useState(true); // Loading state for cards specifically
    const [cardError, setCardError] = useState(''); // Error state for cards specifically
    const [selectedCardId, setSelectedCardId] = useState(null); // Which card is selected
    const [isEditingCard, setIsEditingCard] = useState(false); // Is selected card being edited?
    const [editCardFormData, setEditCardFormData] = useState({ front: '', back: '', notes: '', tags: '', deckId: '' }); // Form data for card edit
    const [newDeckName, setNewDeckName] = useState(''); // Local state ONLY for the deck input field value

    // --- Fetch Flashcards (Local to this component) ---
    const fetchFlashcards = useCallback(async () => {
        setIsLoadingCards(true); setCardError(''); setFlashcards([]); // Reset card state
        setSelectedCardId(null); setIsEditingCard(false); // Reset view state too
        try {
            const db = await openDB(); const transaction = db.transaction(STORE_NAME, 'readonly'); const store = transaction.objectStore(STORE_NAME); const getAllRequest = store.getAll();
            return new Promise((resolve, reject) => {
                 getAllRequest.onsuccess=()=>{ setFlashcards(getAllRequest.result||[]); resolve(); };
                 getAllRequest.onerror=(e)=>{ setCardError(`Card Fetch Error: ${e.target.error?.message}`); reject(e.target.error); };
                 transaction.onerror=(e)=>{ setCardError(`Card Tx Error: ${e.target.error?.message}`); reject(e.target.error);};
            });
        } catch (err) { setCardError(`Card DB Error: ${err.message}`); return Promise.reject(err); }
         finally { setIsLoadingCards(false); } // Set loading false after fetch attempt
    }, []); // No dependencies needed if it only uses local state setters

    // Fetch cards when the component mounts
    useEffect(() => {
        fetchFlashcards();
        // No cleanup needed for isMounted as fetchFlashcards handles its own async logic
    }, [fetchFlashcards]); // Rerun if fetchFlashcards identity changes

    // --- Helper ---
    const selectedCard = flashcards.find(card => card.id === selectedCardId);

    // --- Flashcard Event Handlers (Use local DB logic & state) ---
    const handleViewDetails = (id) => { setSelectedCardId(id); setIsEditingCard(false); setFeedback(''); setEditingDeckId(null); /* Close deck edit if open */ };
    const handleCloseDetails = () => { setSelectedCardId(null); setIsEditingCard(false); setFeedback(''); };
    const handleEditCard = () => {
        if (!selectedCard) return; setFeedback('');
        setEditCardFormData({ front: selectedCard.front || '', back: selectedCard.back || '', notes: selectedCard.notes || '', tags: (selectedCard.tags || []).join(', '), deckId: selectedCard.deckId || '' });
        setIsEditingCard(true);
    };
    const handleCancelEditCard = () => { setIsEditingCard(false); setFeedback(''); };
    const handleEditCardFormChange = (event) => {
        const { name, value } = event.target; const processedValue = name === 'deckId' ? (value ? parseInt(value, 10) : '') : value;
        setEditCardFormData(prevData => ({ ...prevData, [name]: processedValue }));
    };
    const handleSaveChangesCard = async () => {
        if (!selectedCard) return; setFeedback('Saving Card...'); // Use the shared feedback setter
        try { const db = await openDB(); const transaction = db.transaction(STORE_NAME, 'readwrite'); const store = transaction.objectStore(STORE_NAME); const getRequest = store.get(selectedCardId);
            getRequest.onsuccess = (event) => { const originalCard = event.target.result; if (!originalCard) { setFeedback("Error: Card not found."); return; }
                 const updatedCard = { ...originalCard, front: editCardFormData.front.trim(), back: editCardFormData.back.trim(), notes: editCardFormData.notes.trim(), tags: editCardFormData.tags.split(',').map(t => t.trim()).filter(t => t !== ''), deckId: editCardFormData.deckId || null, lastModified: new Date().toISOString() };
                 const putRequest = store.put(updatedCard);
                 putRequest.onsuccess = () => { setFeedback('Card changes saved!'); setIsEditingCard(false); setFlashcards(prev => prev.map(c => c.id === selectedCardId ? updatedCard : c)); setTimeout(() => setFeedback(''), 2000); }; // Update local card state
                 putRequest.onerror = (e) => { setFeedback(`Error saving card: ${e.target.error?.message}`); }; };
            getRequest.onerror = (e) => { setFeedback(`Error fetching card to save: ${e.target.error?.message}`); };
            transaction.onerror = (e) => { if (!feedback?.startsWith('Error')) setFeedback(`Card Save Tx Error: ${e.target.error?.message}`); };
        } catch (err) { setFeedback(`Card Save DB Error: ${err.message}`); }
    };
    const handleDeleteCard = async () => {
        if (!selectedCard || !window.confirm(`DELETE CARD: "${selectedCard.front}"?`)) return; setFeedback('Deleting Card...');
        try { const db = await openDB(); const transaction = db.transaction(STORE_NAME, 'readwrite'); const store = transaction.objectStore(STORE_NAME); const deleteRequest = store.delete(selectedCardId);
             deleteRequest.onsuccess = () => { setFeedback('Card deleted.'); setFlashcards(prev => prev.filter(card => card.id !== selectedCardId)); setSelectedCardId(null); setIsEditingCard(false); setTimeout(() => setFeedback(''), 2000); }; // Update local card state
             deleteRequest.onerror = (e) => { setFeedback(`Error deleting card: ${e.target.error?.message}`); };
             transaction.onerror = (e) => { if (!feedback?.startsWith('Error')) setFeedback(`Card Delete Tx Error: ${e.target.error?.message}`); } ;
        } catch (err) { setFeedback(`Card Delete DB Error: ${err.message}`); }
    };

    // --- Deck Management Handlers (Call props received from App) ---
    const handleInternalCreateDeck = () => { onCreateDeck(newDeckName, () => setNewDeckName('')); }; // Clear local input via callback passed to App's handler
    const handleInternalEditDeck = (deck) => { onEditDeck(deck); }; // Call App's handler to start edit
    const handleInternalCancelEditDeck = () => { onCancelEditDeck(); }; // Call App's handler
    const handleInternalSaveDeckName = () => { onSaveDeckName(); }; // Call App's handler
    const handleInternalDeleteDeck = (deck) => { onDeleteDeck(deck); }; // Call App's handler


    // --- Render Logic ---
    // Use local isLoadingCards and cardError for card sections
    // Use props.feedback for general feedback

    // Styles...
    const baseStyle = { padding: '10px', marginBottom: '15px', borderRadius: '4px' };
    const sectionStyle = { ...baseStyle, border: '1px solid #eee' };
    const cardStyle = { ...baseStyle, border: '1px solid #ccc', backgroundColor: '#f9f9f9', marginBottom: '8px' }; // Adjusted margin
    const detailAreaStyle = { ...baseStyle, border: '1px solid #ddd', backgroundColor: 'white', marginTop: '15px' };
    const inputStyle = { display: 'block', boxSizing: 'border-box', width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '3px' };
    const deckInputStyle = { flexGrow: 1, marginRight: '5px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px' };
    const labelStyle = { fontWeight: 'bold', display: 'block', marginBottom: '3px', fontSize: '0.9em' };
    const buttonGroupStyle = { marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-start' };
    const deckListItemStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #eee', gap: '10px' };
    const deckButtonGroupStyle = { display: 'flex', gap: '5px', flexShrink: 0 };
    const feedbackStyle = { marginTop: '10px', color: feedback?.startsWith('Error') ? 'red' : 'green', minHeight: '1em', fontWeight: 'bold', textAlign: 'center' };
    
    // New styles for tabs
    const tabsContainerStyle = { 
        display: 'flex', 
        borderBottom: '1px solid #ddd', 
        marginBottom: '20px' 
    };
    
    const tabStyle = { 
        padding: '10px 20px',
        cursor: 'pointer', 
        backgroundColor: '#f1f1f1',
        border: '1px solid #ddd',
        borderBottomColor: '#f1f1f1',
        borderRadius: '5px 5px 0 0',
        marginRight: '5px'
    };
    
    const activeTabStyle = {
        ...tabStyle,
        backgroundColor: 'white',
        borderBottomColor: 'white',
        fontWeight: 'bold'
    };


    return (
        <div>
            <h2>Flashcard Management</h2>
            {/* Display feedback from App */}
            {feedback && <p style={feedbackStyle}>{feedback}</p>}
            {cardError && <p style={{color:'red', textAlign: 'center'}}>{cardError}</p>}

            {/* Tab Navigation */}
            <div style={tabsContainerStyle}>
                <div 
                    style={activeTab === 'manage' ? activeTabStyle : tabStyle}
                    onClick={() => setActiveTab('manage')}
                >
                    Manage Cards & Decks
                </div>
                <div 
                    style={activeTab === 'review' ? activeTabStyle : tabStyle}
                    onClick={() => setActiveTab('review')}
                >
                    Review Cards
                </div>
            </div>

            {/* Content based on active tab */}
            {activeTab === 'manage' ? (
                // MANAGE TAB CONTENT - Your original content
                <div>
                    {/* Deck Management Section */}
                    {!selectedCardId && ( // Only show deck mgmt when not viewing a card
                        <div style={sectionStyle}>
                            <h4>Decks</h4>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                <input type="text" value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} placeholder="Enter new deck name" style={{...inputStyle, width: 'auto', flexGrow: 1, marginBottom: 0}} />
                                <button onClick={handleInternalCreateDeck} disabled={!newDeckName.trim()}>Create Deck</button>
                            </div>
                            {/* List Existing Decks */}
                            {decks.length > 0 ? ( // Use decks prop
                                <div style={{ maxHeight: '150px', overflowY: 'auto', borderTop: '1px solid #ddd', marginTop: '10px', paddingTop: '5px' }}>
                                    {decks.map(deck => ( // Use decks prop
                                        <div key={deck.id} style={deckListItemStyle}>
                                            {editingDeckId === deck.id ? ( // Use editingDeckId prop
                                                <>
                                                    {/* Use editingDeckName prop and setEditingDeckName prop */}
                                                    <input type="text" value={editingDeckName} onChange={(e) => setEditingDeckName(e.target.value)} style={deckInputStyle} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleInternalSaveDeckName(); else if (e.key === 'Escape') handleInternalCancelEditDeck(); }}/>
                                                    <div style={deckButtonGroupStyle}>
                                                        <button onClick={handleInternalSaveDeckName} disabled={!editingDeckName.trim() || editingDeckName.trim() === deck.name}>Save</button>
                                                        <button onClick={handleInternalCancelEditDeck}>Cancel</button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <span title={deck.name} style={{ marginRight: '10px', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck.name}</span>
                                                    <div style={deckButtonGroupStyle}>
                                                        {/* Call internal handlers which call props from App */}
                                                        <button onClick={() => handleInternalEditDeck(deck)} style={{padding: '2px 5px'}}>Rename</button>
                                                        <button onClick={() => handleInternalDeleteDeck(deck)} style={{ backgroundColor: '#f44336', color: 'white', border: 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: '3px' }}>X</button>
                                                    </div>
                                                </>
                                            )}
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
                                            {/* Display deck name using decks prop */}
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
                                // --- Card View Mode ---
                                <>
                                    {/* Details use local selectedCard and decks prop */}
                                    <p><strong style={labelStyle}>Front:</strong> {selectedCard.front}</p>
                                    <p><strong style={labelStyle}>Back:</strong> {selectedCard.back}</p>
                                    {selectedCard.notes && <p><strong style={labelStyle}>Notes:</strong> <span style={{whiteSpace: 'pre-wrap'}}>{selectedCard.notes}</span></p>}
                                    {selectedCard.tags && selectedCard.tags.length > 0 && <p><strong style={labelStyle}>Tags:</strong> {selectedCard.tags.join(', ')}</p>}
                                    <p><strong style={labelStyle}>Deck:</strong> {decks.find(d => d.id === selectedCard.deckId)?.name || 'Unassigned'}</p>
                                    <p><strong style={labelStyle}>Bucket:</strong> {selectedCard.bucket !== undefined ? selectedCard.bucket : 'N/A'}</p>
                                    <p><strong style={labelStyle}>Created:</strong> {selectedCard.createdAt ? new Date(selectedCard.createdAt).toLocaleString() : 'N/A'}</p>
                                    {selectedCard.lastModified && <p><strong style={labelStyle}>Modified:</strong> {new Date(selectedCard.lastModified).toLocaleString()}</p> }
                                    {/* Buttons use local card handlers */}
                                    <div style={buttonGroupStyle}>
                                        <button onClick={handleEditCard}>Edit Card</button>
                                        <button onClick={handleDeleteCard} style={{backgroundColor: '#f44336', color: 'white'}}>Delete Card</button>
                                        <button onClick={handleCloseDetails} style={{marginLeft: 'auto'}}>Close Details</button>
                                    </div>
                                </>
                            ) : (
                                // --- Card Edit Mode ---
                                <>
                                    {/* Inputs controlled by local editCardFormData state */}
                                    <div><label htmlFor="edit-front" style={labelStyle}>Front:</label><textarea id="edit-front" name="front" value={editCardFormData.front} onChange={handleEditCardFormChange} rows="3" style={inputStyle} /></div>
                                    <div><label htmlFor="edit-back" style={labelStyle}>Back:</label><textarea id="edit-back" name="back" value={editCardFormData.back} onChange={handleEditCardFormChange} rows="3" style={inputStyle} /></div>
                                    <div><label htmlFor="edit-notes" style={labelStyle}>Notes:</label><textarea id="edit-notes" name="notes" value={editCardFormData.notes} onChange={handleEditCardFormChange} rows="2" style={inputStyle} placeholder="Optional notes..." /></div>
                                    <div><label htmlFor="edit-tags" style={labelStyle}>Tags (comma-separated):</label><input type="text" id="edit-tags" name="tags" value={editCardFormData.tags} onChange={handleEditCardFormChange} style={inputStyle} placeholder="e.g., vocabulary, chapter 1" /></div>
                                    <div>
                                        <label htmlFor="edit-deck" style={labelStyle}>Assign to Deck:</label>
                                        {/* Dropdown populated by decks prop, value controlled by local editCardFormData */}
                                        <select id="edit-deck" name="deckId" value={editCardFormData.deckId} onChange={handleEditCardFormChange} style={inputStyle}>
                                            <option value="">-- Unassigned --</option>
                                            {decks.map(deck => (<option key={deck.id} value={deck.id}>{deck.name}</option>))}
                                        </select>
                                    </div>
                                    {/* Buttons use local card handlers */}
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
                // REVIEW TAB CONTENT - New functionality
                <ReviewFlashcards 
                    decks={decks}
                    openDB={openDB}
                    setFeedback={setFeedback}
                />
            )}
        </div>
    );
}

export default ManageFlashcards;