// react-popup-src/src/ManageFlashcards.jsx
import React, { useState, useEffect } from 'react';

// --- Start: IndexedDB Logic (Remains the same) ---
const DB_NAME = 'flashcardDB';
const DB_VERSION = 1;
const STORE_NAME = 'flashcards';
let dbPromise = null;
function openDB() {
    if (dbPromise) return dbPromise;
    console.log(`Manage: Attempting to open DB: ${DB_NAME} version ${DB_VERSION}`);
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded=(e)=>{
            console.log('Manage: DB upgrade needed.');
            const tempDb=e.target.result;
            if(!tempDb.objectStoreNames.contains(STORE_NAME)){
                console.log(`Manage: Creating store: ${STORE_NAME}`);
                tempDb.createObjectStore(STORE_NAME,{keyPath:'id',autoIncrement:true});
                // Optionally add indexes here later if needed for decks etc.
                // tempDb.createObjectStore('decks', { keyPath: 'id', autoIncrement: true });
                // const flashcardStore = transaction.objectStore(STORE_NAME);
                // flashcardStore.createIndex('deckIdIndex', 'deckId', { unique: false });
                console.log('Manage: Store created.');
            }
        };
        request.onsuccess=(e)=>{
            const db=e.target.result;
            console.log(`Manage: DB "${DB_NAME}" opened (v${db.version}).`);
            db.onerror=(errEvent)=>{console.error("Manage: DB connection error:",errEvent.target.error);dbPromise=null;};
            db.onclose=()=>{console.warn('Manage: DB connection closed.');dbPromise=null;};
            resolve(db);
        };
        request.onerror=(e)=>{console.error("Manage: Error opening DB:",e.target.error);dbPromise=null;reject(e.target.error);};
        request.onblocked=(e)=>{console.warn("Manage: DB open blocked.");dbPromise=null;reject(new Error("DB blocked"));}
    });
    return dbPromise;
 }
// --- End: IndexedDB Logic ---


function ManageFlashcards() {
    // --- State ---
    const [flashcards, setFlashcards] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState(''); // General feedback message
    const [selectedCardId, setSelectedCardId] = useState(null); // ID of the card being viewed/edited
    const [isEditing, setIsEditing] = useState(false); // Are we in edit mode for the selected card?
    const [editFormData, setEditFormData] = useState({ front: '', back: '', notes: '', tags: '' }); // Form data for editing
    const [newDeckName, setNewDeckName] = useState(''); // State for deck creation input
    // const [decks, setDecks] = useState([]); // State for actual decks (to be implemented)


    // --- Fetch Flashcards ---
    const fetchFlashcards = async () => {
        let isMounted = true; // Prevent state update on unmounted component if fetch is slow
        setIsLoading(true);
        setError('');
        setFlashcards([]);
        setSelectedCardId(null); // Reset view state when refetching
        setIsEditing(false);
        setFeedback(''); // Clear feedback on refetch
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = () => {
                if (isMounted) {
                    console.log("Fetched cards:", getAllRequest.result);
                    setFlashcards(getAllRequest.result || []);
                    setIsLoading(false);
                }
            };
            getAllRequest.onerror = (e) => {
                if (isMounted) {
                    console.error('Error fetching:', e.target.error);
                    setError(`Fetch Error: ${e.target.error.message}`);
                    setIsLoading(false);
                }
            };
            transaction.onerror = (e) => {
                if (isMounted && !error) {
                    console.error('Read transaction error:', e.target.error);
                    setError(`Tx Error: ${e.target.error.message}`);
                    setIsLoading(false);
                }
            };
        } catch (err) {
            if (isMounted) {
                console.error('Failed to open DB for fetching:', err);
                setError(`DB Error: ${err.message}`);
                setIsLoading(false);
            }
        }
        // Cleanup function for fetch effect - set isMounted false
        return () => { isMounted = false; console.log("Unmounting ManageFlashcards or fetch finished"); };
    };

    // Fetch on initial mount
    useEffect(() => {
        const cleanup = fetchFlashcards();
        // Explicitly return the cleanup function if fetchFlashcards returns one
        return cleanup;
    }, []); // Empty dependency array means run once on mount

    // --- Helper to find the selected card object ---
    const selectedCard = flashcards.find(card => card.id === selectedCardId);

    // --- Event Handlers ---
    const handleViewDetails = (id) => { setSelectedCardId(id); setIsEditing(false); setFeedback(''); };
    const handleCloseDetails = () => { setSelectedCardId(null); setIsEditing(false); setFeedback(''); };
    const handleEdit = () => {
        if (!selectedCard) return;
        setFeedback('');
        setEditFormData({
            front: selectedCard.front || '',
            back: selectedCard.back || '',
            notes: selectedCard.notes || '',
            tags: (selectedCard.tags || []).join(', ')
            // Add deckId here later if needed: deckId: selectedCard.deckId || ''
        });
        setIsEditing(true);
     };
    const handleCancelEdit = () => { setIsEditing(false); setFeedback(''); };
    const handleEditFormChange = (event) => {
         const { name, value } = event.target; setEditFormData(prevData => ({ ...prevData, [name]: value }));
     };

    const handleSaveChanges = async () => {
        if (!selectedCard) return;
        setFeedback('Saving...');
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const getRequest = store.get(selectedCardId);

            getRequest.onsuccess = (event) => {
                const originalCard = event.target.result;
                if (!originalCard) { setFeedback("Error: Card not found."); return; }

                const updatedCard = {
                    ...originalCard,
                    front: editFormData.front.trim(),
                    back: editFormData.back.trim(),
                    notes: editFormData.notes.trim(),
                    tags: editFormData.tags.split(',').map(tag => tag.trim()).filter(tag => tag !== ''),
                    lastModified: new Date().toISOString()
                    // Add deckId later: deckId: editFormData.deckId || null // Store null if no deck selected
                };

                const putRequest = store.put(updatedCard);
                putRequest.onsuccess = () => {
                    console.log("Card updated successfully:", updatedCard);
                    setFeedback('Changes saved!');
                    setIsEditing(false);
                    setFlashcards(prev => prev.map(c => c.id === selectedCardId ? updatedCard : c));
                    setTimeout(() => setFeedback(''), 2000);
                };
                putRequest.onerror = (e) => { console.error("Error updating card:", e.target.error); setFeedback(`Error saving: ${e.target.error.message}`); };
            };
             getRequest.onerror = (e) => { console.error("Error fetching card for update:", e.target.error); setFeedback(`Error fetching card: ${e.target.error.message}`); };
            transaction.onerror = (e) => { console.error("Update transaction error:", e.target.error); if (!feedback.startsWith('Error')) { setFeedback(`Tx Error: ${e.target.error.message}`); } };
        } catch (err) {
            console.error('Failed to open DB for saving:', err); setFeedback(`DB Error: ${err.message}`);
        }
    };

    const handleDelete = async () => {
        if (!selectedCard || !window.confirm(`Are you sure you want to delete the flashcard "${selectedCard.front}"?`)) {
             return;
        }
        setFeedback('Deleting...');
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const deleteRequest = store.delete(selectedCardId);

            deleteRequest.onsuccess = () => {
                console.log("Card deleted successfully:", selectedCardId);
                setFeedback('Flashcard deleted.');
                setFlashcards(prev => prev.filter(card => card.id !== selectedCardId));
                setSelectedCardId(null);
                setIsEditing(false);
                setTimeout(() => setFeedback(''), 2000);
            };
            deleteRequest.onerror = (e) => { console.error("Error deleting card:", e.target.error); setFeedback(`Error deleting: ${e.target.error.message}`); };
            transaction.onerror = (e) => { console.error("Delete transaction error:", e.target.error); if (!feedback.startsWith('Error')) { setFeedback(`Tx Error: ${e.target.error.message}`); } };
        } catch (err) {
            console.error('Failed to open DB for deletion:', err); setFeedback(`DB Error: ${err.message}`);
        }
     };

    const handleCreateDeck = () => { // Placeholder
        if (!newDeckName.trim()) return;
        console.log("Creating deck:", newDeckName.trim());
        alert("Deck creation functionality not implemented yet.");
        setNewDeckName('');
        // Later: Save deck to storage and update decks list
    };

    // --- Render Logic ---
    if (isLoading) return <div>Loading flashcards...</div>;
    if (error) return <div style={{ color: 'red' }}>Error loading flashcards: {error}</div>;

    // --- Styles ---
    const cardStyle = { border: '1px solid #ccc', padding: '10px', marginBottom: '8px', borderRadius: '4px', backgroundColor: '#f9f9f9' };
    const detailAreaStyle = { marginTop: '15px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px', backgroundColor: 'white' };
    const inputStyle = { display: 'block', width: '95%', padding: '6px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '3px' }; // Make inputs block for labels
    const labelStyle = { fontWeight: 'bold', display: 'block', marginBottom: '3px' };
    const buttonGroupStyle = { marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }; // Allow buttons to wrap
    const feedbackStyle = { marginTop: '10px', color: feedback.startsWith('Error') ? 'red' : 'green', minHeight: '1em', fontWeight: 'bold' };

    return (
        <div>
            <h2>Manage Flashcards</h2>
            {feedback && <p style={feedbackStyle}>{feedback}</p>}

            {/* Deck Creation UI (Placeholder) */}
            {!selectedCardId && ( // Only show when not viewing details
                <div style={{ border: '1px solid #eee', padding: '10px', marginBottom: '15px', borderRadius: '4px' }}>
                    <h4>Create New Deck</h4>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input
                            type="text"
                            value={newDeckName}
                            onChange={(e) => setNewDeckName(e.target.value)}
                            placeholder="Enter new deck name"
                            style={{ flexGrow: 1, padding: '6px' }}
                        />
                        <button onClick={handleCreateDeck} disabled={!newDeckName.trim()}>
                            Create Deck
                        </button>
                    </div>
                    {/* Add deck list/management here later */}
                </div>
            )}

            {/* Card List */}
            {!selectedCardId && flashcards.length === 0 && <p>No flashcards saved yet.</p>}
            {!selectedCardId && flashcards.length > 0 && (
                 <ul style={{ listStyle: 'none', padding: 0, maxHeight: '300px', overflowY: 'auto' }}>
                    {flashcards.map((card) => (
                        <li key={card.id} style={cardStyle}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span title={card.front} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '10px' }}>{card.front}</span>
                              <button onClick={() => handleViewDetails(card.id)} style={{flexShrink: 0}}>View Details</button>
                           </div>
                        </li>
                    ))}
                 </ul>
             )}

            {/* Detail/Edit View Area */}
            {selectedCard && (
                <div style={detailAreaStyle}>
                    <h3>{isEditing ? 'Edit Flashcard' : 'Flashcard Details'} (ID: {selectedCard.id})</h3>

                    {!isEditing ? (
                        // --- View Mode ---
                        <>
                             <p><strong style={labelStyle}>Front:</strong> {selectedCard.front}</p>
                             <p><strong style={labelStyle}>Back:</strong> {selectedCard.back}</p>
                             {selectedCard.notes && <p><strong style={labelStyle}>Notes:</strong> <span style={{whiteSpace: 'pre-wrap'}}>{selectedCard.notes}</span></p>}
                             {selectedCard.tags && selectedCard.tags.length > 0 && <p><strong style={labelStyle}>Tags:</strong> {selectedCard.tags.join(', ')}</p>}
                             <p><strong style={labelStyle}>Bucket:</strong> {selectedCard.bucket !== undefined ? selectedCard.bucket : 'N/A'}</p>
                             <p><strong style={labelStyle}>Created:</strong> {selectedCard.createdAt ? new Date(selectedCard.createdAt).toLocaleString() : 'N/A'}</p>
                             {selectedCard.lastModified && <p><strong style={labelStyle}>Modified:</strong> {new Date(selectedCard.lastModified).toLocaleString()}</p> }

                            <div style={buttonGroupStyle}>
                                <button onClick={handleEdit}>Edit</button>
                                <button onClick={handleDelete} style={{backgroundColor: '#f44336', color: 'white'}}>Delete</button>
                                <button onClick={handleCloseDetails} style={{marginLeft: 'auto'}}>Close</button>
                            </div>
                        </>
                    ) : (
                        // --- Edit Mode ---
                        <>
                             <div><label htmlFor="edit-front" style={labelStyle}>Front:</label><textarea id="edit-front" name="front" value={editFormData.front} onChange={handleEditFormChange} rows="3" style={inputStyle} /></div>
                             <div><label htmlFor="edit-back" style={labelStyle}>Back:</label><textarea id="edit-back" name="back" value={editFormData.back} onChange={handleEditFormChange} rows="3" style={inputStyle} /></div>
                             <div><label htmlFor="edit-notes" style={labelStyle}>Notes:</label><textarea id="edit-notes" name="notes" value={editFormData.notes} onChange={handleEditFormChange} rows="2" style={inputStyle} placeholder="Optional notes..." /></div>
                             <div><label htmlFor="edit-tags" style={labelStyle}>Tags (comma-separated):</label><input type="text" id="edit-tags" name="tags" value={editFormData.tags} onChange={handleEditFormChange} style={inputStyle} placeholder="e.g., vocabulary, chapter 1" /></div>

                             {/* Deck Assignment UI (Placeholder) */}
                             <div>
                                 <label htmlFor="edit-deck" style={labelStyle}>Assign to Deck:</label>
                                 <select id="edit-deck" name="deck" /* value={editFormData.deckId || ''} onChange={handleEditFormChange} */ disabled style={inputStyle}>
                                     <option value="">-- Select Deck --</option>
                                     {/* Later: Populate with options from decks state */}
                                     <option value="placeholder1">Placeholder Deck 1</option>
                                     <option value="placeholder2">Placeholder Deck 2</option>
                                 </select>
                             </div>

                            <div style={buttonGroupStyle}>
                                <button onClick={handleSaveChanges}>Save Changes</button>
                                <button onClick={handleCancelEdit}>Cancel</button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default ManageFlashcards;