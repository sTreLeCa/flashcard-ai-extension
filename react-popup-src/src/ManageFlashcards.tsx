// react-popup-src/src/ManageFlashcards.tsx
import React, { useState, useEffect, useCallback } from 'react';
import ReviewFlashcards from './ReviewFlashcards';
import { openDB, STORE_NAME, DECKS_STORE_NAME, UNASSIGNED_DECK_ID } from './db';
import { Deck, Flashcard } from './App';

// Define interface for EditCardFormData
interface EditCardFormData {
  front: string;
  back: string;
  notes: string;
  tags: string;
  deckId: number | null;
}

// Define props interface
interface ManageFlashcardsProps {
    decks: Deck[];
    feedback: string;
    setFeedback: (message: string) => void;
    onCreateDeck: (name: string, callback?: () => void) => void; // Or Promise<void>
    onEditDeck: (deck: Deck) => void;
    onSaveDeckName: () => Promise<void>; // Or void
    onCancelEditDeck: () => void;
    onDeleteDeck: (deck: Deck) => Promise<void>; // Or void
    editingDeckId: number | null;
    setEditingDeckId: React.Dispatch<React.SetStateAction<number | null>>;
    editingDeckName: string;
    setEditingDeckName: React.Dispatch<React.SetStateAction<string>>;
  }

// Receive props from App for deck management
function ManageFlashcards({
    decks,
    feedback,
    setFeedback,
    onCreateDeck,
    onEditDeck,
    onSaveDeckName,
    onCancelEditDeck,
    onDeleteDeck,
    editingDeckId,
    setEditingDeckId,
    editingDeckName,
    setEditingDeckName
}: ManageFlashcardsProps) {
    // --- Tab State ---
    const [activeTab, setActiveTab] = useState<'manage' | 'review'>('manage');

    // --- Local State for Card Management ---
    const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
    const [isLoadingCards, setIsLoadingCards] = useState<boolean>(true);
    const [cardError, setCardError] = useState<string>('');
    const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
    const [isEditingCard, setIsEditingCard] = useState<boolean>(false);
    const [editCardFormData, setEditCardFormData] = useState<EditCardFormData>({
        front: '',
        back: '',
        notes: '',
        tags: '',
        deckId: null // Initial state matches type number | null
    });
    const [newDeckName, setNewDeckName] = useState<string>('');

    // --- Fetch Flashcards (Local to this component) ---
    const fetchFlashcards = useCallback(async (): Promise<void> => {
        setIsLoadingCards(true);
        setCardError('');
        setFlashcards([]);
        setSelectedCardId(null);
        setIsEditingCard(false);
        
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const getAllRequest = store.getAll();
            
            return new Promise((resolve, reject) => {
                getAllRequest.onsuccess = () => {
                    setFlashcards(getAllRequest.result || []);
                    resolve();
                };
                getAllRequest.onerror = (e: Event) => {
                    const target = e.target as IDBRequest;
                    setCardError(`Card Fetch Error: ${target.error?.message}`);
                    reject(target.error);
                };
                transaction.onerror = (e: Event) => {
                    const target = e.target as IDBTransaction;
                    setCardError(`Card Tx Error: ${target.error?.message}`);
                    reject(target.error);
                };
            });
        } catch (err: any) {
            setCardError(`Card DB Error: ${err.message}`);
            return Promise.reject(err);
        } finally {
            setIsLoadingCards(false);
        }
    }, []);

    // Fetch cards when the component mounts
    useEffect(() => {
        fetchFlashcards();
    }, [fetchFlashcards]);

    // --- Helper ---
    const selectedCard = flashcards.find(card => card.id === selectedCardId);

    // --- Flashcard Event Handlers (Use local DB logic & state) ---
    const handleViewDetails = (id: number): void => { // <-- Accepts number
        setSelectedCardId(id); // <-- Set the number
        setIsEditingCard(false);
        setFeedback('');
        setEditingDeckId(null);
    };
    
    const handleCloseDetails = (): void => {
        setSelectedCardId(null); // <-- Set null
        setIsEditingCard(false);
        setFeedback('');
    };
    
    const handleEditCard = (): void => {
        if (!selectedCard) return;
        setFeedback('');
        setEditCardFormData({ // <-- Assigning to EditCardFormData
            front: selectedCard.front || '',
            back: selectedCard.back || '',
            notes: selectedCard.notes || '',
            tags: (selectedCard.tags || []).join(', '),
            deckId: selectedCard.deckId // <-- Assign number | null directly (Type is now compatible)
        });
        setIsEditingCard(true);
    };
    
    const handleCancelEditCard = (): void => {
        setIsEditingCard(false);
        setFeedback('');
    };
    
    const handleEditCardFormChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void => {
        const { name, value } = event.target;

        // VVVV FIX PARSING FOR deckId VVVV
        const processedValue = name === 'deckId'
            // Parse the string value from select into number or null
            ? (value === '' || value === String(UNASSIGNED_DECK_ID) ? null : parseInt(value, 10))
            : value;

        setEditCardFormData(prevData => ({ ...prevData, [name]: processedValue }));
    };
    
    const handleSaveChangesCard = async (): Promise<void> => {
        // selectedCardId is now number | null
        if (!selectedCard || selectedCardId === null || selectedCard.id === undefined) return;
        setFeedback('Saving Card...');

        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            // Use selectedCard.id (number)
            const getRequest = store.get(selectedCard.id);

            getRequest.onsuccess = (event: Event) => {
                const target = event.target as IDBRequest;
                const originalCard = target.result as Flashcard;

                if (!originalCard) {
                    setFeedback("Error: Card not found.");
                    return;
                }

                const updatedCard: Flashcard = {
                    ...originalCard,
                    id: selectedCard.id, // Ensure ID is preserved
                    front: editCardFormData.front.trim(),
                    back: editCardFormData.back.trim(),
                    notes: editCardFormData.notes.trim(),
                    tags: editCardFormData.tags.split(',').map(t => t.trim()).filter(t => t !== ''),
                    deckId: editCardFormData.deckId, // Assign number | null
                    lastModified: new Date().toISOString()
                };

                const putRequest = store.put(updatedCard);

                putRequest.onsuccess = () => {
                    setFeedback('Card changes saved!');
                    setIsEditingCard(false);
                    // VVVV Comparison should now work (number | undefined vs number | null) VVVV
                    setFlashcards(prev => prev.map(c => c.id === selectedCardId ? updatedCard : c));
                    // Refresh the selected card details if still viewing
                    if (selectedCardId === updatedCard.id) {
                         // setSelectedCardId(updatedCard.id); // Re-set maybe needed if ID could change? Unlikely with put.
                         // If you want the details view to update immediately, you might need
                         // to manually update a 'selectedCardDetails' state or refetch.
                         // For now, mapping flashcards array is the main thing.
                    }
                    setTimeout(() => setFeedback(''), 2000);
                };
                
                putRequest.onerror = (e: Event) => {
                    const target = e.target as IDBRequest;
                    setFeedback(`Error saving card: ${target.error?.message}`);
                };
            };
            
            getRequest.onerror = (e: Event) => {
                const target = e.target as IDBRequest;
                setFeedback(`Error fetching card to save: ${target.error?.message}`);
            };
            
            transaction.onerror = (e: Event) => {
                const target = e.target as IDBTransaction;
                if (!feedback?.startsWith('Error')) {
                    setFeedback(`Card Save Tx Error: ${target.error?.message}`);
                }
            };
        } catch (err: any) {
            setFeedback(`Card Save DB Error: ${err.message}`);
        }
    };
    
    const handleDeleteCard = async (): Promise<void> => {
        // selectedCardId is now number | null
        if (!selectedCard || selectedCardId === null || selectedCard.id === undefined || !window.confirm(/*...*/)) return;
        setFeedback('Deleting Card...');
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            // Use selectedCard.id (number)
            const deleteRequest = store.delete(selectedCard.id);
            
            deleteRequest.onsuccess = () => {
                setFeedback('Card deleted.');
                // Comparison works (number | undefined vs number | null)
                setFlashcards(prev => prev.filter(card => card.id !== selectedCardId));
                setSelectedCardId(null); // Set to null after deletion
                setIsEditingCard(false);
                setTimeout(() => setFeedback(''), 2000);
            };
            
            deleteRequest.onerror = (e: Event) => {
                const target = e.target as IDBRequest;
                setFeedback(`Error deleting card: ${target.error?.message}`);
            };
            
            transaction.onerror = (e: Event) => {
                const target = e.target as IDBTransaction;
                if (!feedback?.startsWith('Error')) {
                    setFeedback(`Card Delete Tx Error: ${target.error?.message}`);
                }
            };
        } catch (err: any) {
            setFeedback(`Card Delete DB Error: ${err.message}`);
        }
    };

    // --- Deck Management Handlers (Call props received from App) ---
    const handleInternalCreateDeck = (): void => {
        onCreateDeck(newDeckName, () => setNewDeckName(''));
    };
    
    const handleInternalEditDeck = (deck: Deck): void => {
        onEditDeck(deck);
    };
    
    const handleInternalCancelEditDeck = (): void => {
        onCancelEditDeck();
    };
    
    const handleInternalSaveDeckName = (): void => {
        onSaveDeckName();
    };
    
    const handleInternalDeleteDeck = (deck: Deck): void => {
        onDeleteDeck(deck);
    };

    // --- Styles (as React.CSSProperties types) ---
    const baseStyle: React.CSSProperties = { 
        padding: '10px', 
        marginBottom: '15px', 
        borderRadius: '4px' 
    };
    
    const sectionStyle: React.CSSProperties = { 
        ...baseStyle, 
        border: '1px solid #eee' 
    };
    
    const cardStyle: React.CSSProperties = { 
        ...baseStyle, 
        border: '1px solid #ccc', 
        backgroundColor: '#f9f9f9', 
        marginBottom: '8px' 
    };
    
    const detailAreaStyle: React.CSSProperties = { 
        ...baseStyle, 
        border: '1px solid #ddd', 
        backgroundColor: 'white', 
        marginTop: '15px' 
    };
    
    const inputStyle: React.CSSProperties = { 
        display: 'block', 
        boxSizing: 'border-box', 
        width: '100%', 
        padding: '8px', 
        marginBottom: '10px', 
        border: '1px solid #ccc', 
        borderRadius: '3px' 
    };
    
    const deckInputStyle: React.CSSProperties = { 
        flexGrow: 1, 
        marginRight: '5px', 
        padding: '4px', 
        border: '1px solid #ccc', 
        borderRadius: '3px' 
    };
    
    const labelStyle: React.CSSProperties = { 
        fontWeight: 'bold', 
        display: 'block', 
        marginBottom: '3px', 
        fontSize: '0.9em' 
    };
    
    const buttonGroupStyle: React.CSSProperties = { 
        marginTop: '15px', 
        display: 'flex', 
        gap: '10px', 
        flexWrap: 'wrap', 
        justifyContent: 'flex-start' 
    };
    
    const deckListItemStyle: React.CSSProperties = { 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '5px 0', 
        borderBottom: '1px solid #eee', 
        gap: '10px' 
    };
    
    const deckButtonGroupStyle: React.CSSProperties = { 
        display: 'flex', 
        gap: '5px', 
        flexShrink: 0 
    };
    
    const feedbackStyle: React.CSSProperties = { 
        marginTop: '10px', 
        color: feedback?.startsWith('Error') ? 'red' : 'green', 
        minHeight: '1em', 
        fontWeight: 'bold', 
        textAlign: 'center' 
    };
    
    // New styles for tabs
    const tabsContainerStyle: React.CSSProperties = { 
        display: 'flex', 
        borderBottom: '1px solid #ddd', 
        marginBottom: '20px' 
    };
    
    const tabStyle: React.CSSProperties = { 
        padding: '10px 20px',
        cursor: 'pointer', 
        backgroundColor: '#f1f1f1',
        border: '1px solid #ddd',
        borderBottomColor: '#f1f1f1',
        borderRadius: '5px 5px 0 0',
        marginRight: '5px'
    };
    
    const activeTabStyle: React.CSSProperties = {
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
                                <input 
                                    type="text" 
                                    value={newDeckName} 
                                    onChange={(e) => setNewDeckName(e.target.value)} 
                                    placeholder="Enter new deck name" 
                                    style={{...inputStyle, width: 'auto', flexGrow: 1, marginBottom: 0}} 
                                />
                                <button 
                                    onClick={handleInternalCreateDeck} 
                                    disabled={!newDeckName.trim()}
                                >
                                    Create Deck
                                </button>
                            </div>
                            {/* List Existing Decks */}
                            {decks.length > 0 ? (
                                <div style={{ maxHeight: '150px', overflowY: 'auto', borderTop: '1px solid #ddd', marginTop: '10px', paddingTop: '5px' }}>
                                    {decks.map(deck => (
                                        <div key={deck.id} style={deckListItemStyle}>
                                            {editingDeckId === deck.id ? (
                                                <>
                                                    <input 
                                                        type="text" 
                                                        value={editingDeckName} 
                                                        onChange={(e) => setEditingDeckName(e.target.value)} 
                                                        style={deckInputStyle} 
                                                        autoFocus 
                                                        onKeyDown={(e) => { 
                                                            if (e.key === 'Enter') handleInternalSaveDeckName(); 
                                                            else if (e.key === 'Escape') handleInternalCancelEditDeck(); 
                                                        }}
                                                    />
                                                    <div style={deckButtonGroupStyle}>
                                                        <button 
                                                            onClick={handleInternalSaveDeckName} 
                                                            disabled={!editingDeckName.trim() || editingDeckName.trim() === deck.name}
                                                        >
                                                            Save
                                                        </button>
                                                        <button onClick={handleInternalCancelEditDeck}>Cancel</button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <span 
                                                        title={deck.name} 
                                                        style={{ marginRight: '10px', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                    >
                                                        {deck.name}
                                                    </span>
                                                    <div style={deckButtonGroupStyle}>
                                                        <button 
                                                            onClick={() => handleInternalEditDeck(deck)} 
                                                            style={{padding: '2px 5px'}}
                                                        >
                                                            Rename
                                                        </button>
                                                        <button 
                                                            onClick={() => handleInternalDeleteDeck(deck)} 
                                                            style={{ backgroundColor: '#f44336', color: 'white', border: 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: '3px' }}
                                                        >
                                                            X
                                                        </button>
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
                                                <span 
                                                    title={card.front} 
                                                    style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '10px' }}
                                                >
                                                    {card.front}
                                                </span>
                                                <button
                onClick={() => {
                    // Only call handleViewDetails if card.id is a number
                    if (card.id !== undefined) {
                        handleViewDetails(card.id);
                    } else {
                        // Optional: Log an error or provide feedback if this happens
                        console.error("Attempted to view details for a card without an ID:", card);
                        setFeedback("Error: Cannot view details for card without ID.");
                    }
                }}
                style={{ flexShrink: 0 }}
                // Optionally disable the button if the id is undefined
                disabled={card.id === undefined}
            >
                View Details
            </button>
                                            </div>
                                            {/* Display deck name using decks prop */}
                                            <p style={{fontSize: '0.8em', color: '#555', margin: '5px 0 0 0'}}>
                                                Deck: {decks.find(d => d.id === card.deckId)?.name || 'Unassigned'}
                                            </p>
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
                                    <p><strong style={labelStyle}>Front:</strong> {selectedCard.front}</p>
                                    <p><strong style={labelStyle}>Back:</strong> {selectedCard.back}</p>
                                    {selectedCard.notes && <p><strong style={labelStyle}>Notes:</strong> <span style={{whiteSpace: 'pre-wrap'}}>{selectedCard.notes}</span></p>}
                                    {selectedCard.tags && selectedCard.tags.length > 0 && <p><strong style={labelStyle}>Tags:</strong> {selectedCard.tags.join(', ')}</p>}
                                    <p><strong style={labelStyle}>Deck:</strong> {decks.find(d => d.id === selectedCard.deckId)?.name || 'Unassigned'}</p>
                                    <p><strong style={labelStyle}>Bucket:</strong> {selectedCard.bucket !== undefined ? selectedCard.bucket : 'N/A'}</p>
                                    <p><strong style={labelStyle}>Created:</strong> {selectedCard.createdAt ? new Date(selectedCard.createdAt).toLocaleString() : 'N/A'}</p>
                                    {selectedCard.lastModified && <p><strong style={labelStyle}>Modified:</strong> {new Date(selectedCard.lastModified).toLocaleString()}</p> }
                                    <div style={buttonGroupStyle}>
                                        <button onClick={handleEditCard}>Edit Card</button>
                                        <button onClick={handleDeleteCard} style={{backgroundColor: '#f44336', color: 'white'}}>Delete Card</button>
                                        <button onClick={handleCloseDetails} style={{marginLeft: 'auto'}}>Close Details</button>
                                    </div>
                                </>
                            ) : (
                                // --- Card Edit Mode ---
                                <>
                                    <div>
                                        <label htmlFor="edit-front" style={labelStyle}>Front:</label>
                                        <textarea 
                                            id="edit-front" 
                                            name="front" 
                                            value={editCardFormData.front} 
                                            onChange={handleEditCardFormChange} 
                                            rows={3} 
                                            style={inputStyle} 
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="edit-back" style={labelStyle}>Back:</label>
                                        <textarea 
                                            id="edit-back" 
                                            name="back" 
                                            value={editCardFormData.back} 
                                            onChange={handleEditCardFormChange} 
                                            rows={3} 
                                            style={inputStyle} 
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="edit-notes" style={labelStyle}>Notes:</label>
                                        <textarea 
                                            id="edit-notes" 
                                            name="notes" 
                                            value={editCardFormData.notes} 
                                            onChange={handleEditCardFormChange} 
                                            rows={2} 
                                            style={inputStyle} 
                                            placeholder="Optional notes..." 
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="edit-tags" style={labelStyle}>Tags (comma-separated):</label>
                                        <input 
                                            type="text" 
                                            id="edit-tags" 
                                            name="tags" 
                                            value={editCardFormData.tags} 
                                            onChange={handleEditCardFormChange} 
                                            style={inputStyle} 
                                            placeholder="e.g., vocabulary, chapter 1" 
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="edit-deck" style={labelStyle}>Assign to Deck:</label>
                                        <select 
                                            id="edit-deck" 
                                            name="deckId" 
                                            value={editCardFormData.deckId === null ? '' : String(editCardFormData.deckId)} 
                                            onChange={handleEditCardFormChange} 
                                            style={inputStyle}
                                        >
                                            <option value="">-- Unassigned --</option>
                                            {decks.map(deck => (
                                                <option key={deck.id} value={deck.id}>{deck.name}</option>
                                            ))}
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
                // REVIEW TAB CONTENT - New functionality
                <ReviewFlashcards
                    decks={decks}
                    // XXX REMOVE THIS LINE XXX
                    // openDB={openDB}
                    setFeedback={setFeedback}
                />
            )}
        </div>
    );
}

export default ManageFlashcards;