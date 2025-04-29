// react-popup-src/src/ReviewFlashcards.jsx
import React, { useState, useEffect, useCallback } from 'react';

// Constants for spaced repetition
const STORE_NAME = 'flashcards';
const MIN_BUCKET = 0;
const MAX_BUCKET = 5; // Maximum bucket number for spaced repetition
// Days between reviews for each bucket (Index corresponds to bucket number)
// Bucket 0: Review immediately/same day (interval 0)
// Bucket 1: Review after 1 day
// Bucket 2: Review after 3 days
// Bucket 3: Review after 7 days
// Bucket 4: Review after 14 days
// Bucket 5: Review after 30 days (or consider 'graduated')
const BUCKET_INTERVALS = [0, 1, 3, 7, 14, 30];

function ReviewFlashcards({ decks, openDB, setFeedback }) {
    // States for review functionality
    const [selectedDeckId, setSelectedDeckId] = useState('');
    const [deckCards, setDeckCards] = useState([]);
    const [isLoadingCards, setIsLoadingCards] = useState(false);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [showAnswer, setShowAnswer] = useState(false);
    const [reviewActive, setReviewActive] = useState(false);
    const [reviewComplete, setReviewComplete] = useState(false);
    const [stats, setStats] = useState({ correct: 0, incorrect: 0, hard: 0, total: 0 }); // Added hard to stats
    const [sessionLimit, setSessionLimit] = useState(20); // Default limit to 20, 0 means no limit
    const [feedbackAnimation, setFeedbackAnimation] = useState(null); // 'correct', 'incorrect', 'hard', or null
    const [hintUsed, setHintUsed] = useState(false); // Track if hint was used for the current card
    const [hintText, setHintText] = useState(''); // Store generated hint text

    // Fetch cards for the selected deck
    const fetchCardsForDeck = useCallback(async (deckId) => {
        setIsLoadingCards(true);
        setFeedback('Loading cards...'); // Provide loading feedback
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('deckIdIndex');
            // Ensure deckId is parsed correctly if it's coming from a select value
            const request = index.getAll(deckId ? parseInt(deckId, 10) : undefined); // Handle potential empty deckId

            request.onsuccess = () => {
                const allCards = request.result || [];
                const now = new Date();
                // Reset time to midnight for consistent day comparison
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                console.log(`Found ${allCards.length} total cards in deck ${deckId}. Filtering for review...`);

                const cardsForReview = allCards.filter(card => {
                    // Default bucket to 0 if undefined (for SRS calculation)
                    const bucket = (card.bucket !== undefined && card.bucket !== null) ? Number(card.bucket) : 0;
                    const isValidBucket = bucket >= MIN_BUCKET && bucket <= MAX_BUCKET;

                    // Debug logging for each card's review status
                    console.log(`Card ID: ${card.id}, Front: "${card.front.substring(0, 20)}...", Bucket: ${bucket}, LastReviewed: ${card.lastReviewed || 'Never'}`);

                    // 1. Handle cards never reviewed or with undefined bucket/lastReviewed
                    if (card.lastReviewed === undefined || card.lastReviewed === null || !isValidBucket) {
                        console.log(` -> Including Card ID ${card.id}: Never reviewed or invalid bucket.`);
                        return true; // Always review cards that haven't been reviewed yet or have bad data
                    }

                    // 2. Handle cards that have been reviewed
                    try {
                        // Parse the lastReviewed date properly
                        const lastReviewDate = new Date(card.lastReviewed);
                        if (isNaN(lastReviewDate.getTime())) {
                            console.log(` -> Including Card ID ${card.id}: Invalid date format in lastReviewed.`);
                            return true; // Include if date is invalid
                        }
                        
                        // Reset last review time to midnight for day comparison
                        const lastReviewDay = new Date(lastReviewDate.getFullYear(), lastReviewDate.getMonth(), lastReviewDate.getDate());

                        // Calculate full days between review date and today
                        const daysSinceReview = Math.round((today - lastReviewDay) / (1000 * 60 * 60 * 24));
                        const requiredInterval = BUCKET_INTERVALS[bucket];

                        const isDue = daysSinceReview >= requiredInterval;

                        // Debug the calculation
                        console.log(` -> Card ID ${card.id}: Days since review: ${daysSinceReview}, Required interval for bucket ${bucket}: ${requiredInterval}, isDue: ${isDue}`);
                        
                        return isDue;

                    } catch (e) {
                        console.error(`Error processing date for card ID ${card.id}:`, e);
                        console.log(` -> Including Card ID ${card.id} due to date processing error.`);
                        return true; // Include card if date parsing fails, to be safe
                    }
                });

                console.log(`Found ${cardsForReview.length} cards ready for review after filtering.`);

                // Shuffle the cards ready for review
                const shuffledCards = [...cardsForReview].sort(() => Math.random() - 0.5);

                // Apply session limit if set (and > 0)
                let cardsForSession = shuffledCards;
                const limit = parseInt(sessionLimit, 10); // Ensure it's a number
                if (limit > 0 && shuffledCards.length > limit) {
                    cardsForSession = shuffledCards.slice(0, limit);
                    setFeedback(`Showing ${limit} of ${shuffledCards.length} cards ready for review.`);
                } else if (shuffledCards.length > 0) {
                     setFeedback(`Found ${shuffledCards.length} cards ready for review.`);
                } else {
                     setFeedback('No cards currently due for review in this deck.');
                }

                setDeckCards(cardsForSession);
                setStats({ correct: 0, incorrect: 0, hard: 0, total: cardsForSession.length });
                setCurrentCardIndex(0);
                setShowAnswer(false);
                setHintUsed(false); // Reset hint status
                setHintText(''); // Clear any previous hint
                setReviewActive(cardsForSession.length > 0);
                setReviewComplete(cardsForSession.length === 0);
            };

            request.onerror = (e) => {
                setFeedback(`Error fetching cards: ${e.target.error?.message}`);
                console.error("Error fetching cards:", e.target.error);
                setIsLoadingCards(false); // Ensure loading stops on error
            };

            transaction.oncomplete = () => {
                console.log("Fetch cards transaction complete.");
                setIsLoadingCards(false); // Ensure loading stops on completion
            };
            transaction.onerror = (e) => {
                 setFeedback(`Transaction error fetching cards: ${e.target.error?.message}`);
                 console.error("Transaction error fetching cards:", e.target.error);
                 setIsLoadingCards(false); // Ensure loading stops on error
            };


        } catch (err) {
            setFeedback(`Database error: ${err.message}`);
            console.error("Database error:", err);
            setIsLoadingCards(false); // Ensure loading stops on error
        }
        // Removed finally block as loading state is handled in callbacks now
    }, [openDB, sessionLimit]); // Add sessionLimit dependency

    // Start the review session
    const handleStartReview = () => {
        if (!selectedDeckId) {
            setFeedback('Please select a deck first.');
            return;
        }
        // Fetch cards using the useCallback version
        fetchCardsForDeck(selectedDeckId);
    };

    // Generate hint from answer text
    const generateHint = (answerText) => {
        // Simple hint generation - show first letter of each word and blanks for rest
        if (!answerText) return '';
        
        const words = answerText.split(' ');
        return words.map(word => {
            if (word.length <= 1) return word; // Keep single characters as is
            if (word.match(/^[0-9.,$%()]+$/)) return word; // Keep numbers and common symbols as is
            return `${word[0]}${'_'.repeat(Math.min(word.length - 1, 5))}`;
        }).join(' ');
    };

    // Handle showing hint
    const handleHint = () => {
        if (!showAnswer && currentCardIndex < deckCards.length) {
            const currentCard = deckCards[currentCardIndex];
            
            // If it's the first time requesting a hint, generate one
            if (!hintText) {
                setHintText(generateHint(currentCard.back));
            } else {
                // If hint already shown, reveal the answer
                setShowAnswer(true);
            }
            
            setHintUsed(true);
            setFeedback('Hint used! This will affect your SRS progress.');
        }
    };

    // Handle user response to a card (Correct, Hard, Incorrect)
    const handleResponse = async (rating) => { // rating: 'correct', 'hard', 'incorrect'
        if (!reviewActive || currentCardIndex >= deckCards.length) return;

        const effectiveRating = hintUsed ? 'hard' : rating; // If hint was used, treat response as "hard" (less severe than incorrect)

        // Show visual feedback animation based on the *button pressed*, not effective rating
        setFeedbackAnimation(rating);
        setTimeout(() => setFeedbackAnimation(null), 800); // Clear animation

        const currentCard = deckCards[currentCardIndex];

        // Update statistics based on actual rating (not effective rating)
        setStats(prev => ({
            ...prev,
            correct: prev.correct + (rating === 'correct' ? 1 : 0),
            hard: prev.hard + (rating === 'hard' ? 1 : 0),
            incorrect: prev.incorrect + (rating === 'incorrect' ? 1 : 0)
        }));

        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const getRequest = store.get(currentCard.id);

            getRequest.onsuccess = (event) => {
                const card = event.target.result;
                if (!card) {
                    setFeedback('Error: Card not found in database during update.');
                    console.error("Card not found for update:", currentCard.id);
                    moveToNextCard(); // Try to proceed gracefully
                    return;
                }

                // Determine the current bucket, defaulting to 0 if undefined/invalid
                let oldBucket = (card.bucket !== undefined && card.bucket >= MIN_BUCKET && card.bucket <= MAX_BUCKET) ? Number(card.bucket) : 0;
                let newBucket;

                // --- SRS Logic based on effective rating ---
                switch (effectiveRating) {
                    case 'correct':
                        newBucket = Math.min(MAX_BUCKET, oldBucket + 1);
                        break;
                    case 'hard':
                        // Move down one bucket, but stay at least at MIN_BUCKET
                        newBucket = Math.max(MIN_BUCKET, oldBucket - 1);
                        break;
                    case 'incorrect':
                    default:
                        // Reset to bucket 0 on incorrect
                        newBucket = 0;
                        break;
                }
                // --- End SRS Logic ---

                const updatedCard = {
                    ...card,
                    bucket: newBucket,
                    lastReviewed: new Date().toISOString() // Update last reviewed time
                };

                const putRequest = store.put(updatedCard);

                putRequest.onsuccess = () => {
                    console.log(`Card ${currentCard.id} updated. Old Bucket: ${oldBucket}, New Bucket: ${newBucket}, Rating: ${rating} (Effective: ${effectiveRating})`);
                    moveToNextCard(); // Proceed after successful update
                };

                putRequest.onerror = (e) => {
                    setFeedback(`Error updating card: ${e.target.error?.message}`);
                    console.error("Error putting updated card:", e.target.error);
                    moveToNextCard(); // Try to proceed even if update fails
                };
            };

            getRequest.onerror = (e) => {
                setFeedback(`Error retrieving card for update: ${e.target.error?.message}`);
                console.error("Error getting card for update:", e.target.error);
                moveToNextCard(); // Try to proceed
            };

             transaction.onerror = (e) => {
                 // Don't overwrite specific error messages if already set
                 if (!feedback.includes('Error updating card') && !feedback.includes('Error retrieving card')) {
                     setFeedback(`Transaction error during card update: ${e.target.error?.message}`);
                 }
                 console.error("Transaction error during card update:", e.target.error);
             };
             transaction.oncomplete = () => {
                 console.log("Card update transaction complete.");
             };

        } catch (err) {
            setFeedback(`Database error during card update: ${err.message}`);
            console.error("Database error during update:", err);
            moveToNextCard(); // Try to proceed
        }
    };

    // Move to the next card or end review
    const moveToNextCard = () => {
        const nextIndex = currentCardIndex + 1;
        if (nextIndex >= deckCards.length) {
            setReviewComplete(true);
            setReviewActive(false);
            setFeedback('Review session completed!');
        } else {
            setCurrentCardIndex(nextIndex);
            setShowAnswer(false);
            setHintUsed(false); // Reset hint status for the new card
            setHintText(''); // Clear hint text for the new card
            setFeedbackAnimation(null); // Ensure animation is cleared
        }
    };

    // Reset the review state
    const handleResetReview = () => {
        // Keep selected deck for convenience
        setDeckCards([]);
        setCurrentCardIndex(0);
        setShowAnswer(false);
        setReviewActive(false);
        setReviewComplete(false);
        setStats({ correct: 0, incorrect: 0, hard: 0, total: 0 });
        setFeedback(''); // Clear feedback
        setFeedbackAnimation(null);
        setHintUsed(false);
        setHintText(''); // Clear hint text
        setIsLoadingCards(false); // Ensure loading state is reset
    };

    // Handle keyboard shortcuts
    useEffect(() => {
        if (!reviewActive) return; // Only listen when review is active

        const handleKeyDown = (e) => {
            // Ignore keyboard input if focus is inside an input/textarea (e.g., session limit)
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            if (!showAnswer) {
                // Space bar to show answer
                if (e.code === 'Space') {
                    e.preventDefault();
                    setShowAnswer(true);
                }
                // 'H' key for hint
                else if (e.key === 'h' || e.key === 'H') {
                    e.preventDefault();
                    handleHint();
                }
            } else {
                // Arrow keys or number keys for response when answer is shown
                if (e.code === 'ArrowRight' || e.key === '1') { // Right Arrow or '1' for Correct
                    handleResponse('correct');
                } else if (e.code === 'ArrowDown' || e.key === '2') { // Down Arrow or '2' for Hard
                    handleResponse('hard');
                } else if (e.code === 'ArrowLeft' || e.key === '3') { // Left Arrow or '3' for Incorrect
                    handleResponse('incorrect');
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [reviewActive, showAnswer, currentCardIndex, deckCards, hintText, hintUsed]); // Updated dependencies


    // --- Styles ---
    const containerStyle = { padding: '15px' };
    const sectionStyle = { padding: '15px', border: '1px solid #eee', borderRadius: '4px', marginBottom: '15px' };
    const controlsStyle = {
        marginTop: '20px',
        display: 'flex',
        justifyContent: 'center', // Center buttons
        flexWrap: 'wrap', // Allow wrapping on small screens
        gap: '10px'
    };
    const buttonStyle = { padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', border: '1px solid #ccc' };
    const correctButtonStyle = { ...buttonStyle, backgroundColor: '#4caf50', color: 'white', borderColor: '#388e3c' };
    const hardButtonStyle = { ...buttonStyle, backgroundColor: '#ff9800', color: 'white', borderColor: '#f57c00' }; // Orange for Hard
    const incorrectButtonStyle = { ...buttonStyle, backgroundColor: '#f44336', color: 'white', borderColor: '#d32f2f' };
    const hintButtonStyle = {...buttonStyle, backgroundColor: '#2196f3', color: 'white', borderColor: '#1976d2'};
    const showAnswerButtonStyle = {...buttonStyle, backgroundColor: '#673ab7', color: 'white', borderColor: '#512da8'};
    const statsStyle = {
        marginTop: '20px',
        padding: '10px',
        backgroundColor: '#f0f0f0', // Neutral background
        borderRadius: '4px',
        textAlign: 'center',
        border: '1px solid #ddd'
    };
    const keyboardHintStyle = {
        fontSize: '0.8em',
        color: '#666',
        textAlign: 'center',
        marginTop: '15px', // Increased margin
        lineHeight: '1.4'
    };
    const hintStyle = {
        padding: '10px',
        backgroundColor: '#e3f2fd', // Light blue background
        border: '1px dashed #90caf9',
        borderRadius: '4px',
        marginTop: '15px',
        fontFamily: 'monospace',
        fontSize: '1.1em',
        textAlign: 'center'
    };

    // Dynamic card style based on feedback animation
    const getCardStyle = () => {
        const baseStyle = {
            border: '1px solid #ddd',
            padding: '20px',
            borderRadius: '8px',
            marginTop: '15px',
            backgroundColor: '#f9f9f9',
            minHeight: '150px', // Ensure minimum height
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            transition: 'background-color 0.3s ease, border-color 0.3s ease', // Added border transition
            overflowWrap: 'break-word', // Prevent long text overflow
            width: '100%', // Ensure it takes full width within section
            boxSizing: 'border-box'
        };

        switch (feedbackAnimation) {
            case 'correct': return { ...baseStyle, backgroundColor: '#e8f5e9', borderColor: '#a5d6a7' }; // Light green
            case 'hard': return { ...baseStyle, backgroundColor: '#fff3e0', borderColor: '#ffcc80' }; // Light orange
            case 'incorrect': return { ...baseStyle, backgroundColor: '#ffebee', borderColor: '#ef9a9a' }; // Light red
            default: return baseStyle;
        }
    };

    return (
        <div style={containerStyle}>
            <h3>Review Flashcards</h3>

            {/* --- Deck Selection & Setup --- */}
            {!reviewActive && !reviewComplete && (
                <div style={sectionStyle}>
                    <label htmlFor="deck-select-review" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Select Deck:
                    </label>
                    <select
                        id="deck-select-review" // Unique ID
                        value={selectedDeckId}
                        onChange={(e) => setSelectedDeckId(e.target.value)}
                        style={{ width: '100%', padding: '8px', marginBottom: '15px', border: '1px solid #ccc', borderRadius: '3px' }}
                        disabled={isLoadingCards}
                    >
                        <option value="">-- Select a Deck --</option>
                        {decks.map(deck => (
                            <option key={deck.id} value={deck.id}>
                                {deck.name}
                            </option>
                        ))}
                        {decks.length === 0 && <option disabled>No decks available</option>}
                    </select>

                    <label htmlFor="session-limit" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Cards per Session:
                    </label>
                    <input
                        id="session-limit"
                        type="number"
                        min="0"
                        step="1"
                        value={sessionLimit}
                        onChange={(e) => setSessionLimit(Math.max(0, parseInt(e.target.value) || 0))} // Ensure non-negative
                        placeholder="0 for all due cards"
                        style={{ width: '100%', padding: '8px', marginBottom: '15px', border: '1px solid #ccc', borderRadius: '3px' }}
                        disabled={isLoadingCards}
                    />

                    <button
                        onClick={handleStartReview}
                        disabled={!selectedDeckId || isLoadingCards}
                        style={{ ...buttonStyle, backgroundColor: '#1976d2', color: 'white', width: '100%' }} // Primary action color
                    >
                        {isLoadingCards ? 'Loading...' : 'Start Review Session'}
                    </button>
                </div>
            )}

            {/* --- Review Session Active --- */}
            {reviewActive && deckCards.length > 0 && currentCardIndex < deckCards.length && (
                <div style={sectionStyle}>
                    <h4>Card {currentCardIndex + 1} of {deckCards.length}</h4>

                    <div style={getCardStyle()}>
                        {/* --- Front / Question --- */}
                        <div style={{ marginBottom: showAnswer ? '20px' : '0' }}> {/* Add space if answer is shown */}
                             <h5 style={{marginTop: 0, marginBottom: '10px', color: '#555'}}>Question:</h5>
                             <p style={{ fontSize: '1.2em', fontWeight: 'bold', margin: 0 }}>{deckCards[currentCardIndex].front}</p>
                        </div>

                        {/* --- Hint Display (if available and used) --- */}
                        {hintText && !showAnswer && (
                            <div style={hintStyle}>
                                <p style={{margin: 0}}><strong>Hint:</strong> {hintText}</p>
                            </div>
                        )}

                        {/* --- Answer Section (Conditional) --- */}
                        {showAnswer && (
                            <div style={{ borderTop: '1px dashed #ccc', paddingTop: '20px', width: '100%' }}>
                                <h5 style={{marginTop: 0, marginBottom: '10px', color: '#555'}}>Answer:</h5>
                                <p style={{ fontSize: '1.2em', margin: 0 }}>{deckCards[currentCardIndex].back}</p>

                                {/* Notes */}
                                {deckCards[currentCardIndex].notes && (
                                    <div style={{ marginTop: '15px', fontSize: '0.9em', color: '#555', textAlign: 'left', background: '#eee', padding: '5px 10px', borderRadius: '3px' }}>
                                        <strong>Notes:</strong> {deckCards[currentCardIndex].notes}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                     {/* --- Controls --- */}
                     <div style={controlsStyle}>
                            {!showAnswer ? (
                                <>
                                    <button onClick={handleHint} style={hintButtonStyle}>
                                        Get Hint (H)
                                    </button>
                                    <button onClick={() => setShowAnswer(true)} style={showAnswerButtonStyle}>
                                        Show Answer (Space)
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button onClick={() => handleResponse('correct')} style={correctButtonStyle}>
                                        Correct (1 / →)
                                    </button>
                                    <button onClick={() => handleResponse('hard')} style={hardButtonStyle}>
                                        Hard (2 / ↓)
                                    </button>
                                    <button onClick={() => handleResponse('incorrect')} style={incorrectButtonStyle}>
                                        Incorrect (3 / ←)
                                    </button>
                                </>
                            )}
                        </div>


                    {/* Progress Information & Keyboard Hints */}
                    <div style={{ marginTop: '15px', textAlign: 'center', fontSize: '0.9em', color: '#555' }}>
                        <p style={{ margin: '0 0 5px 0' }}>
                             Current Bucket: {deckCards[currentCardIndex].bucket !== undefined ? deckCards[currentCardIndex].bucket : 'New'}
                             {hintUsed && <span style={{color: 'orange', fontWeight: 'bold'}}> (Hint Used)</span>}
                        </p>
                        {/* Progress Bar */}
                        <div style={{ backgroundColor: '#ddd', height: '10px', borderRadius: '5px', overflow: 'hidden', marginTop: '5px' }}>
                            <div style={{ width: `${((currentCardIndex + 1) / deckCards.length) * 100}%`, height: '100%', backgroundColor: '#2196f3', transition: 'width 0.3s ease' }}></div>
                        </div>
                    </div>
                     <div style={keyboardHintStyle}>
                         {!showAnswer ? 'Press H for hint or Space to show answer.' : 'Use Arrows (→ Correct, ↓ Hard, ← Incorrect) or Numbers (1, 2, 3).'}
                     </div>

                </div>
            )}

            {/* --- Review Complete Summary --- */}
            {reviewComplete && (
                <div style={sectionStyle}>
                    <h3 style={{ textAlign: 'center' }}>Review Session Complete!</h3>
                    <div style={statsStyle}>
                        <h4>Session Statistics</h4>
                        <p>Total Cards Reviewed: {stats.correct + stats.hard + stats.incorrect}</p>
                        <p style={{color: 'green'}}>Correct: {stats.correct} ({stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0}%)</p>
                        <p style={{color: 'orange'}}>Hard: {stats.hard}</p>
                        <p style={{color: 'red'}}>Incorrect: {stats.incorrect}</p>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '20px' }}>
                        <button
                            onClick={handleResetReview} // Reuse reset function
                             style={{ ...buttonStyle, backgroundColor: '#1976d2', color: 'white', width: '100%' }}
                        >
                            Review Another Deck / Start Over
                        </button>
                    </div>
                </div>
            )}

            {/* --- No Cards Available Message --- */}
            {/* This condition is implicitly handled by the feedback message after fetch now */}
        </div>
    );
}

export default ReviewFlashcards;