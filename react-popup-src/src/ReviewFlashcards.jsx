// react-popup-src/src/ReviewFlashcards.jsx
import React, { useState, useEffect, useCallback } from 'react';

// Constants for spaced repetition
const STORE_NAME = 'flashcards';
const MIN_BUCKET = 0;
const MAX_BUCKET = 5; // Maximum bucket number for spaced repetition
const BUCKET_INTERVALS = [0, 1, 3, 7, 14, 30]; // Days between reviews for each bucket

function ReviewFlashcards({ decks, openDB, setFeedback }) {
    // States for review functionality
    const [selectedDeckId, setSelectedDeckId] = useState(''); // Store selected deck ID
    const [deckCards, setDeckCards] = useState([]); // Cards from selected deck
    const [isLoadingCards, setIsLoadingCards] = useState(false);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [showAnswer, setShowAnswer] = useState(false);
    const [reviewActive, setReviewActive] = useState(false);
    const [reviewComplete, setReviewComplete] = useState(false);
    const [stats, setStats] = useState({ correct: 0, incorrect: 0, total: 0 });
    const [sessionLimit, setSessionLimit] = useState(0); // 0 means no limit
    const [feedbackAnimation, setFeedbackAnimation] = useState(null); // 'correct', 'incorrect', or null
    
    // Fetch cards for the selected deck
    const fetchCardsForDeck = async (deckId) => {
        setIsLoadingCards(true);
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            
            // Use the index we created in the DB setup to get cards by deckId
            const index = store.index('deckIdIndex');
            const request = index.getAll(parseInt(deckId, 10));
            
            request.onsuccess = () => {
                // Filter cards ready for review based on bucket and lastReviewed
                const allCards = request.result || [];
                const now = new Date();
                const cardsForReview = allCards.filter(card => {
                    // If the card has never been reviewed or doesn't have a bucket, it's ready
                    if (card.lastReviewed === undefined || card.bucket === undefined) {
                        return true;
                    }
                    
                    // Calculate days since last review
                    const lastReviewDate = new Date(card.lastReviewed);
                    const daysSinceReview = Math.floor((now - lastReviewDate) / (1000 * 60 * 60 * 24));
                    
                    // Check if enough days have passed based on the card's bucket
                    const bucket = Math.min(MAX_BUCKET, Math.max(MIN_BUCKET, card.bucket));
                    return daysSinceReview >= BUCKET_INTERVALS[bucket];
                });
                
                // Shuffle the cards for review
                const shuffledCards = [...cardsForReview].sort(() => Math.random() - 0.5);
                
                // Apply session limit if set
                let cardsForSession = shuffledCards;
                if (sessionLimit > 0 && shuffledCards.length > sessionLimit) {
                    cardsForSession = shuffledCards.slice(0, sessionLimit);
                    setFeedback(`Showing ${sessionLimit} of ${shuffledCards.length} available cards.`);
                } else {
                    setFeedback(shuffledCards.length > 0 
                        ? `Found ${shuffledCards.length} cards ready for review.` 
                        : 'No cards ready for review in this deck.');
                }
                
                setDeckCards(cardsForSession);
                setStats({ correct: 0, incorrect: 0, total: cardsForSession.length });
                setCurrentCardIndex(0);
                setShowAnswer(false);
                setReviewActive(cardsForSession.length > 0);
                setReviewComplete(cardsForSession.length === 0);
            };
            
            request.onerror = (e) => {
                setFeedback(`Error fetching cards: ${e.target.error?.message}`);
            };
            
        } catch (err) {
            setFeedback(`Database error: ${err.message}`);
        } finally {
            setIsLoadingCards(false);
        }
    };
    
    // Start the review session
    const handleStartReview = () => {
        if (!selectedDeckId) {
            setFeedback('Please select a deck first.');
            return;
        }
        fetchCardsForDeck(selectedDeckId);
    };
    
    // Handle user response to a card
    const handleResponse = async (correct) => {
        if (!reviewActive || currentCardIndex >= deckCards.length) return;
        
        // Show visual feedback animation
        setFeedbackAnimation(correct ? 'correct' : 'incorrect');
        
        // Clear feedback after animation completes
        setTimeout(() => setFeedbackAnimation(null), 800);
        
        const currentCard = deckCards[currentCardIndex];
        
        // Update statistics
        setStats(prev => ({ 
            ...prev, 
            correct: prev.correct + (correct ? 1 : 0),
            incorrect: prev.incorrect + (correct ? 0 : 1)
        }));
        
        try {
            // Update card in database (spaced repetition logic)
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const getRequest = store.get(currentCard.id);
            
            getRequest.onsuccess = (event) => {
                const card = event.target.result;
                if (!card) {
                    setFeedback('Error: Card not found in database.');
                    return;
                }
                
                // Update bucket based on response
                let newBucket = card.bucket !== undefined ? card.bucket : 0;
                
                if (correct) {
                    // Move up a bucket if correct (cap at MAX_BUCKET)
                    newBucket = Math.min(MAX_BUCKET, newBucket + 1);
                } else {
                    // Move back to bucket 0 if incorrect
                    newBucket = 0;
                }
                
                // Update the card with new bucket and lastReviewed date
                const updatedCard = {
                    ...card,
                    bucket: newBucket,
                    lastReviewed: new Date().toISOString()
                };
                
                const putRequest = store.put(updatedCard);
                
                putRequest.onsuccess = () => {
                    // Move to next card or end review
                    moveToNextCard();
                };
                
                putRequest.onerror = (e) => {
                    setFeedback(`Error updating card: ${e.target.error?.message}`);
                };
            };
            
            getRequest.onerror = (e) => {
                setFeedback(`Error retrieving card: ${e.target.error?.message}`);
            };
            
        } catch (err) {
            setFeedback(`Database error: ${err.message}`);
        }
    };
    
    // Move to the next card or end review if no more cards
    const moveToNextCard = () => {
        const nextIndex = currentCardIndex + 1;
        if (nextIndex >= deckCards.length) {
            // End of review session
            setReviewComplete(true);
            setReviewActive(false);
            setFeedback('Review session completed!');
        } else {
            // Move to next card
            setCurrentCardIndex(nextIndex);
            setShowAnswer(false);
        }
    };
    
    // Reset the review state for a new session
    const handleResetReview = () => {
        setSelectedDeckId('');
        setDeckCards([]);
        setCurrentCardIndex(0);
        setShowAnswer(false);
        setReviewActive(false);
        setReviewComplete(false);
        setStats({ correct: 0, incorrect: 0, total: 0 });
        setFeedback('');
        setFeedbackAnimation(null);
    };
    
    // Handle hint (simplified for now - just shows answer)
    const handleHint = () => {
        setShowAnswer(true);
        // You could implement a more sophisticated hint system here
    };
    
    // Handle keyboard shortcuts
    useEffect(() => {
        // Only attach keyboard events when review is active
        if (reviewActive) {
            const handleKeyDown = (e) => {
                // Space bar to show answer
                if (e.code === 'Space' && !showAnswer) {
                    e.preventDefault(); // Prevent page scrolling
                    setShowAnswer(true);
                    return;
                }
                
                // Only process these keys if answer is showing
                if (showAnswer) {
                    // Right arrow for correct
                    if (e.code === 'ArrowRight') {
                        handleResponse(true);
                    } 
                    // Left arrow for incorrect
                    else if (e.code === 'ArrowLeft') {
                        handleResponse(false);
                    }
                }
            };
    
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [reviewActive, showAnswer]);
    
    // Dynamic card style based on feedback animation
    const getCardStyle = () => {
        const baseStyle = { 
            border: '1px solid #ddd', 
            padding: '20px', 
            borderRadius: '8px', 
            marginTop: '15px',
            backgroundColor: '#f9f9f9',
            minHeight: '150px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            transition: 'background-color 0.3s ease'
        };
    
        if (feedbackAnimation === 'correct') {
            return { ...baseStyle, backgroundColor: '#e8f5e9' }; // Light green
        } else if (feedbackAnimation === 'incorrect') {
            return { ...baseStyle, backgroundColor: '#ffebee' }; // Light red
        }
        
        return baseStyle;
    };
    
    // Styles for the component
    const containerStyle = { padding: '15px' };
    const sectionStyle = { padding: '15px', border: '1px solid #eee', borderRadius: '4px', marginBottom: '15px' };
    const controlsStyle = { 
        marginTop: '20px', 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '10px' 
    };
    const buttonStyle = { padding: '8px 15px' };
    const correctButtonStyle = { ...buttonStyle, backgroundColor: '#4caf50', color: 'white' };
    const incorrectButtonStyle = { ...buttonStyle, backgroundColor: '#f44336', color: 'white' };
    const statsStyle = { 
        marginTop: '20px', 
        padding: '10px', 
        backgroundColor: '#e8f5e9', 
        borderRadius: '4px',
        textAlign: 'center'
    };
    const keyboardHintStyle = { 
        fontSize: '0.8em', 
        color: '#666', 
        textAlign: 'center', 
        marginTop: '10px' 
    };
    
    return (
        <div style={containerStyle}>
            <h3>Review Flashcards</h3>
            
            {/* Deck Selection Section */}
            {!reviewActive && !reviewComplete && (
                <div style={sectionStyle}>
                    <label htmlFor="deck-select" style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
                        Select a Deck to Review:
                    </label>
                    <select
                        id="deck-select"
                        value={selectedDeckId}
                        onChange={(e) => setSelectedDeckId(e.target.value)}
                        style={{ width: '100%', padding: '8px', marginBottom: '15px' }}
                    >
                        <option value="">-- Select a Deck --</option>
                        {decks.map(deck => (
                            <option key={deck.id} value={deck.id}>
                                {deck.name}
                            </option>
                        ))}
                    </select>
                    
                    {/* Session limit control */}
                    <div style={{ marginTop: '15px', marginBottom: '15px' }}>
                        <label htmlFor="session-limit" style={{ display: 'block', marginBottom: '5px' }}>
                            Cards per session (0 for all available cards):
                        </label>
                        <input
                            id="session-limit"
                            type="number"
                            min="0"
                            step="1"
                            value={sessionLimit}
                            onChange={(e) => setSessionLimit(parseInt(e.target.value) || 0)}
                            style={{ width: '100%', padding: '8px' }}
                        />
                    </div>
                    
                    <button 
                        onClick={handleStartReview} 
                        disabled={!selectedDeckId || isLoadingCards}
                        style={{ padding: '8px 15px', backgroundColor: '#2196f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        Start Review Session
                    </button>
                </div>
            )}
            
            {/* Loading Indicator */}
            {isLoadingCards && <p>Loading cards for review...</p>}
            
            {/* Review Session Active */}
            {reviewActive && deckCards.length > 0 && currentCardIndex < deckCards.length && (
                <div style={sectionStyle}>
                    <h4>Card {currentCardIndex + 1} of {deckCards.length}</h4>
                    
                    {/* Front of Card */}
                    <div style={getCardStyle()}>
                        <h3>Question:</h3>
                        <p style={{ fontSize: '1.2em', fontWeight: 'bold' }}>{deckCards[currentCardIndex].front}</p>
                        
                        {/* Show Answer Button */}
                        {!showAnswer && (
                            <button 
                                onClick={() => setShowAnswer(true)}
                                style={{ ...buttonStyle, marginTop: '20px' }}
                            >
                                Show Answer
                            </button>
                        )}
                        
                        {/* Answer Section */}
                        {showAnswer && (
                            <div style={{ marginTop: '20px', borderTop: '1px dashed #ccc', paddingTop: '20px', width: '100%' }}>
                                <h3>Answer:</h3>
                                <p style={{ fontSize: '1.2em' }}>{deckCards[currentCardIndex].back}</p>
                                
                                {/* Notes if available */}
                                {deckCards[currentCardIndex].notes && (
                                    <div style={{ marginTop: '15px', fontSize: '0.9em', color: '#555' }}>
                                        <h4>Notes:</h4>
                                        <p>{deckCards[currentCardIndex].notes}</p>
                                    </div>
                                )}
                                
                                {/* Response Controls */}
                                <div style={controlsStyle}>
                                    <button onClick={() => handleResponse(true)} style={correctButtonStyle}>
                                        Correct (I knew it)
                                    </button>
                                    <button onClick={() => handleResponse(false)} style={incorrectButtonStyle}>
                                        Incorrect (Didn't know)
                                    </button>
                                    {!showAnswer && (
                                        <button onClick={handleHint} style={buttonStyle}>
                                            Get Hint
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Keyboard shortcuts info */}
                    <div style={keyboardHintStyle}>
                        Keyboard shortcuts: {!showAnswer ? 'Space (Show Answer)' : 'Right Arrow (Correct), Left Arrow (Incorrect)'}
                    </div>
                    
                    {/* Progress Information */}
                    <div style={{ marginTop: '10px', textAlign: 'center' }}>
                        <p>Current Bucket: {deckCards[currentCardIndex].bucket !== undefined ? deckCards[currentCardIndex].bucket : 'New'}</p>
                        <div style={{ 
                            backgroundColor: '#ddd', 
                            height: '10px', 
                            borderRadius: '5px', 
                            overflow: 'hidden',
                            marginTop: '5px'
                        }}>
                            <div style={{ 
                                width: `${(currentCardIndex / deckCards.length) * 100}%`, 
                                height: '100%', 
                                backgroundColor: '#2196f3'
                            }}></div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Review Complete Summary */}
            {reviewComplete && (
                <div style={sectionStyle}>
                    <h3>Review Session Complete!</h3>
                    
                    <div style={statsStyle}>
                        <h4>Session Statistics</h4>
                        <p>Total Cards Reviewed: {stats.correct + stats.incorrect}</p>
                        <p>Correct: {stats.correct} ({stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0}%)</p>
                        <p>Incorrect: {stats.incorrect}</p>
                    </div>
                    
                    <div style={{ textAlign: 'center', marginTop: '20px' }}>
                        <button 
                            onClick={handleResetReview}
                            style={{ padding: '10px 20px', backgroundColor: '#2196f3', color: 'white', border: 'none', borderRadius: '4px' }}
                        >
                            Start New Review Session
                        </button>
                    </div>
                </div>
            )}
            
            {/* No Cards Available */}
            {reviewActive && deckCards.length === 0 && (
                <div style={sectionStyle}>
                    <p>No cards available for review in this deck.</p>
                    <button onClick={handleResetReview} style={{ marginTop: '10px' }}>
                        Select Another Deck
                    </button>
                </div>
            )}
        </div>
    );
}

export default ReviewFlashcards;