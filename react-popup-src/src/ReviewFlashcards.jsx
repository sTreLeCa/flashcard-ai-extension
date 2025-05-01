import React, { useState, useEffect, useCallback, useRef } from 'react';
// VVV Ensure TFJS imports are present VVV
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as knnClassifier from '@tensorflow-models/knn-classifier';
// VVV Ensure DB imports are present VVV
import { openDB, loadGestureModel, STORE_NAME, GESTURE_MODEL_STORE_NAME, UNASSIGNED_DECK_ID } from './db.js';

// Constants
// BUCKET_INTERVALS is no longer strictly needed for scheduling, but might be kept for reference or removed
// const BUCKET_INTERVALS = [0, 1, 3, 7, 14, 30];
const GESTURE_MODEL_LOADED_STATE = { IDLE: 'idle', LOADING: 'loading', LOADED: 'loaded', FAILED: 'failed' };
const GESTURE_CONFIDENCE_THRESHOLD = 0.85; // Confidence needed to trigger action

// react-popup-src/src/ReviewFlashcards.jsx

// ... other imports, constants, and component setup ...

function ReviewFlashcards({ decks, setFeedback }) {

    // ... state variables ...

    // --- Fetch cards for the selected deck (USING nextReviewDate) ---
    const fetchCardsForDeck = useCallback(async (deckId) => {
        setIsLoadingCards(true);
        setFeedback('Loading cards...');
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('deckIdIndex'); // Ensure this index exists
            // Use UNASSIGNED_DECK_ID (null) if deckId is empty/invalid
            const targetDeckId = deckId ? parseInt(deckId, 10) : UNASSIGNED_DECK_ID;
            const request = index.getAll(targetDeckId); // Fetch cards only for the target deck

            request.onsuccess = () => {
                const allCardsInDeck = request.result || [];
                const now = new Date();
                // Get today's date at midnight (local time) for accurate comparison
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                console.log(`Found ${allCardsInDeck.length} total cards in deck ID: ${targetDeckId}. Filtering for review based on nextReviewDate...`);

                // --- VVV THIS IS THE CORRECT FILTER LOGIC VVV ---
                const cardsForReview = allCardsInDeck.filter(card => {
                    // Always review cards that haven't been scheduled yet (e.g., new cards or migration issues)
                    if (!card.nextReviewDate) {
                        console.log(` -> Including Card ID ${card.id}: No nextReviewDate found.`);
                        return true;
                    }

                    try {
                        // Parse the stored nextReviewDate
                        const nextReview = new Date(card.nextReviewDate);
                        // Handle invalid dates stored in the DB
                        if (isNaN(nextReview.getTime())) {
                             console.log(` -> Including Card ID ${card.id}: Invalid nextReviewDate format (${card.nextReviewDate}).`);
                             return true;
                        }

                        // Normalize the review date to midnight (local time) for comparison
                        const nextReviewDay = new Date(nextReview.getFullYear(), nextReview.getMonth(), nextReview.getDate());

                        // Check if the card's next review day is today or in the past
                        const isDue = nextReviewDay <= today;

                        // Optional: More detailed debugging log
                        // console.log(` -> Card ID ${card.id}: Next Review Date (Raw): ${card.nextReviewDate}, Next Review Day (Normalized): ${nextReviewDay.toISOString()}, Today (Normalized): ${today.toISOString()}, isDue: ${isDue}`);

                        return isDue;

                    } catch (e) {
                        // Catch any other errors during date processing
                        console.error(`Error processing date for card ID ${card.id}:`, e);
                        console.log(` -> Including Card ID ${card.id} due to date processing error.`);
                        return true; // Include card if processing fails, to be safe
                    }
                });
                // --- ^^^ END OF CORRECT FILTER LOGIC ^^^ ---

                console.log(`Found ${cardsForReview.length} cards due for review after filtering.`);

                // Shuffle the cards ready for review
                const shuffledCards = [...cardsForReview].sort(() => Math.random() - 0.5);

                // Apply session limit
                let cardsForSession = shuffledCards;
                const limit = parseInt(sessionLimit, 10);
                if (limit > 0 && shuffledCards.length > limit) {
                    cardsForSession = shuffledCards.slice(0, limit);
                    setFeedback(`Showing ${limit} of ${shuffledCards.length} cards due for review.`);
                } else if (shuffledCards.length > 0) {
                     setFeedback(`Found ${shuffledCards.length} cards due for review.`);
                } else {
                     setFeedback('No cards currently due for review in this deck.');
                }

                // Update state
                setDeckCards(cardsForSession);
                setStats({ correct: 0, incorrect: 0, hard: 0, total: cardsForSession.length });
                setCurrentCardIndex(0);
                setShowAnswer(false);
                setHintUsed(false);
                setHintText('');
                setShowImageHint(false); // Also reset image hint here
                setReviewActive(cardsForSession.length > 0);
                setReviewComplete(cardsForSession.length === 0);
            };

            // DB Request/Transaction Handlers
            request.onerror = (e) => {
                setFeedback(`Error fetching cards: ${e.target.error?.message}`);
                console.error("Error fetching cards:", e.target.error);
                setIsLoadingCards(false);
            };
            transaction.oncomplete = () => {
                console.log("Fetch cards transaction complete.");
                setIsLoadingCards(false);
            };
            transaction.onerror = (e) => {
                setFeedback(`Transaction error fetching cards: ${e.target.error?.message}`);
                console.error("Transaction error fetching cards:", e.target.error);
                setIsLoadingCards(false);
            };

        } catch (err) {
            // Error opening DB
            setFeedback(`Database error: ${err.message}`);
            console.error("Database error:", err);
            setIsLoadingCards(false);
        }
    // Dependencies: sessionLimit triggers refetch if changed, setFeedback is used.
    // setIsLoadingCards, setDeckCards etc. are state setters, generally not needed as deps.
    }, [sessionLimit, setFeedback]);

   

    useEffect(() => {
        loadModelsAndData();
    }, [loadModelsAndData]);


    // --- Webcam Control Functions ---
    const startWebcam = useCallback(async () => {
        setWebcamError('');
        setIsVideoReady(false); // Use isVideoReady state
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' } });
            console.log("🎥 Webcam access granted:", mediaStream.id);
            setStream(mediaStream);
            return mediaStream;
        } catch (err) {
            console.error("❌ Webcam error:", err);
            setWebcamError(`Webcam error: ${err.message}`);
            setStream(null);
            return null;
        }
    }, []);

    const stopWebcam = useCallback(() => {
        if (predictionIntervalRef.current) { clearInterval(predictionIntervalRef.current); predictionIntervalRef.current = null; console.log("Review: Stopped prediction loop."); }
        if (stream) { console.log("Review: Stopping webcam."); stream.getTracks().forEach(track => track.stop()); setStream(null); if (videoRef.current) { videoRef.current.srcObject = null; } }
        setCurrentPrediction({ label: '...', confidence: 0 });
        setIsVideoReady(false); // Ensure video is marked not ready
    }, [stream]); // Depends only on stream

    useEffect(() => { return () => { stopWebcam(); }; }, [stopWebcam]); // Cleanup on unmount


    // --- Video Element Handling ---
     const videoRefCallback = useCallback((node) => {
        console.log(`Review: videoRefCallback called. Node: ${node ? 'Exists' : 'Null'}`);
        if (node) {
            setVideoElement(node);
            node.oncanplay = () => { console.log(">>> videoRefCallback: onCanPlay event fired <<<"); setIsVideoReady(true); };
            node.onerror = (e) => { console.error("Video Error in Callback Ref:", e); setIsVideoReady(false); setWebcamError("Video playback error."); };
            node.onstalled = () => { console.warn("Video Stalled in Callback Ref"); setIsVideoReady(false); };
            // Attempt to attach stream if stream exists when node mounts
            if (stream && node.srcObject !== stream) {
                 console.log(">>> videoRefCallback: Attaching existing stream to newly mounted node.");
                 node.srcObject = stream;
                 node.play().catch(e => console.error("Video play() failed in callback ref:", e));
            }
        } else {
            // Node is unmounting
            console.log(">>> videoRefCallback: Node is null (unmounting?), clearing videoElement state.");
            setVideoElement(null);
            setIsVideoReady(false);
        }
    }, [stream]); // Dependency on stream is important

    // Effect to link stream to video element if one arrives after the other
    useEffect(() => {
        if (stream && videoElement && videoElement.srcObject !== stream) {
            console.log(`>>> useEffect[stream, videoElement]: Attaching stream ${stream.id} to video element.`);
            videoElement.srcObject = stream;
            videoElement.play().catch(e => console.error(">>> useEffect[stream, videoElement]: Video play() failed:", e));
        } else if (!stream && videoElement && videoElement.srcObject) {
            console.log(">>> useEffect[stream, videoElement]: Stream is null, clearing srcObject.");
            videoElement.srcObject = null;
        }
    }, [stream, videoElement]);


    // --- Fetch cards for the selected deck (USING nextReviewDate) ---
    


    // --- Start Review Session ---
    const handleStartReview = async () => {
        if (!selectedDeckId) { setFeedback('Please select a deck first.'); return; }
        if (gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.LOADING) { setFeedback('Models loading...'); return; }
        if (gestureModelLoadState !== GESTURE_MODEL_LOADED_STATE.LOADED || !knn || knn.getNumClasses() === 0) { setFeedback('Models not loaded or no gestures trained yet.'); return; }

        setReviewComplete(false);
        setReviewActive(true);
        setFeedback('Starting webcam...');
        stopWebcam(); // Ensure clean state

        const streamStarted = await startWebcam();
        if (!streamStarted) { console.error("Review: Webcam failed to start in handleStartReview."); /* Error set in startWebcam */ }
        else { console.log("Review: Webcam started successfully."); await fetchCardsForDeck(selectedDeckId); }
    };


    // --- Prediction Loop ---
    const runPrediction = useCallback(async () => {
        if (!videoElement || !isVideoReady || videoElement.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA || !knn || !mobilenetModel || !stream) { return; }
        let logits = null;
        try {
             tf.tidy(() => { // Use tidy for automatic intermediate tensor cleanup
                 const frameTensor = tf.browser.fromPixels(videoElement);
                 logits = mobilenetModel.infer(frameTensor, true);
             }); // frameTensor is disposed here

             if (!logits || logits.isDisposed) { console.error("Prediction Error: Logits are null or disposed."); setCurrentPrediction({ label: 'Error', confidence: 0 }); if(logits && !logits.isDisposed) tf.dispose(logits); return; }

             const result = await knn.predictClass(logits, 3); // k=3 neighbors

             if (result?.label && result.confidences) {
                const confidenceScore = result.confidences[result.label] || 0;
                setCurrentPrediction({ label: result.label, confidence: confidenceScore });
             } else {
                setCurrentPrediction({ label: '...', confidence: 0 });
             }
        } catch (error) { console.error("Prediction error occurred:", error); setCurrentPrediction({ label: 'Error', confidence: 0 }); }
        finally { if (logits && !logits.isDisposed) { tf.dispose(logits); } } // Dispose logits after use
    }, [videoElement, isVideoReady, knn, mobilenetModel, stream, setCurrentPrediction]);

    // Effect to start/stop prediction loop
    useEffect(() => {
        if (reviewActive && !reviewComplete && stream && knn && mobilenetModel && knn.getNumClasses() > 0 && isVideoReady) {
            console.log(">>> Review: Starting prediction loop.");
            if (predictionIntervalRef.current) clearInterval(predictionIntervalRef.current);
            predictionIntervalRef.current = setInterval(runPrediction, 200); // Adjust interval as needed
        } else {
            if (predictionIntervalRef.current) { console.log(">>> Review: Stopping prediction loop."); clearInterval(predictionIntervalRef.current); predictionIntervalRef.current = null; }
        }
        return () => { if (predictionIntervalRef.current) { console.log(">>> Cleanup: Clearing prediction interval."); clearInterval(predictionIntervalRef.current); predictionIntervalRef.current = null; } };
    }, [reviewActive, reviewComplete, stream, knn, mobilenetModel, runPrediction, isVideoReady]);


    // --- Generate Text Hint ---
    const generateHint = (answerText) => {
        if (!answerText) return '';
        const words = answerText.split(' ');
        return words.map(word => {
            if (word.length <= 1 || word.match(/^[0-9.,$%()]+$/)) return word;
            return `${word[0]}${'_'.repeat(Math.min(word.length - 1, 5))}`;
        }).join(' ');
    };


    // --- Handle Hint Request (UPDATED for Image) ---
    const handleHint = () => {
        if (!showAnswer && currentCardIndex < deckCards.length) {
            const currentCard = deckCards[currentCardIndex];
            setHintUsed(true);
            setFeedback('Hint used! This may affect SRS calculation.');

            if (currentCard.hintImageUrl) { // Prioritize image
                setShowImageHint(true);
                setHintText('');
                console.log("Showing image hint for card:", currentCard.id);
            } else if (!hintText) { // No image, show text hint if not already shown
                setHintText(generateHint(currentCard.back));
                setShowImageHint(false); // Ensure image is hidden
                console.log("Showing text hint for card:", currentCard.id);
            } else { // Text hint already shown, reveal answer
                setShowAnswer(true);
                setShowImageHint(false); // Ensure image is hidden
                console.log("Revealing answer after text hint for card:", currentCard.id);
            }
        }
    };


    // --- Handle User Response (UPDATED with SRS Logic) ---
    const handleResponse = async (rating) => {
        if (!reviewActive || currentCardIndex >= deckCards.length) { console.warn("handleResponse called when review not active or finished."); return; }

        const effectiveRating = hintUsed ? 'hard' : rating;
        setFeedbackAnimation(rating); // Show visual feedback

        const currentCard = deckCards[currentCardIndex];

        // Update stats
        setStats(prev => ({ ...prev, correct: prev.correct + (rating === 'correct' ? 1 : 0), hard: prev.hard + (rating === 'hard' ? 1 : 0), incorrect: prev.incorrect + (rating === 'incorrect' ? 1 : 0) }));

        // --- Update Card in IndexedDB with SRS Calculation ---
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const getRequest = store.get(currentCard.id);

            await new Promise((resolve, reject) => {
                              // --- NEW getRequest.onsuccess with SRS Calculation ---
                              getRequest.onsuccess = (event) => {
                                const card = event.target.result;
                                if (!card) {
                                    console.error("Card not found for update:", currentCard.id);
                                    setFeedback('Error: Card not found in DB during update.');
                                    reject(new Error('Card not found'));
                                    return;
                                }
            
                                // --- VVV SRS Calculation (Simplified SM-2 Adaptation) VVV ---
            
                                // Get current SRS parameters, providing defaults if missing
                                let currentEF = card.easeFactor ?? 2.5; // Default ease factor
                                let repetitions = card.repetitions ?? 0;
                                let currentInterval = card.interval ?? 0; // Interval in days
            
                                // Map rating to SM-2 quality score (0-5)
                                let quality = 0;
                                switch (effectiveRating) { // effectiveRating already accounts for hintUsed
                                    case 'incorrect': quality = 0; break; // Complete failure
                                    case 'hard':      quality = 3; break; // Pass, but difficult
                                    case 'correct':   quality = 5; break; // Perfect recall
                                    default:          quality = 3; // Default case if rating is unexpected
                                }
            
                                // 1. Calculate new Ease Factor (EF) - Always calculated
                                // Formula: EF' = EF + [0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)]
                                let newEF = currentEF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
                                if (newEF < 1.3) {
                                    newEF = 1.3; // Clamp EF at minimum 1.3
                                }
            
                                // 2. Calculate new Repetitions and Interval based on quality
                                let newRepetitions;
                                let newInterval; // Interval in days
            
                                if (quality < 3) { // Failed recall (quality 0, 1, or 2 - we only have 0 mapped)
                                    newRepetitions = 0; // Reset repetition count
                                    newInterval = 1;    // Reschedule for the next day (can be set to 0 for same-day review if preferred)
                                    // Keep the adjusted newEF calculated above
                                } else { // Correct recall (quality >= 3 - includes 'hard' and 'correct')
                                    newRepetitions = repetitions + 1;
                                    if (newRepetitions === 1) {
                                        newInterval = 1; // First successful recall, review next day
                                    } else if (newRepetitions === 2) {
                                        newInterval = 6; // Second successful recall, review in 6 days (typical)
                                    } else {
                                        // Subsequent recalls: interval grows based on previous interval and *current* ease factor
                                        newInterval = Math.ceil(currentInterval * currentEF); // Use currentEF before it was updated this round
                                    }
                                }
            
                                // 3. Calculate the next review date
                                const today = new Date();
                                // Create a new date object for calculation to avoid modifying 'today' directly if needed elsewhere
                                const nextReviewDate = new Date(today);
                                nextReviewDate.setDate(today.getDate() + newInterval); // Add the calculated interval days
            
                                // 4. Construct the updated card object, preserving other fields
                                const updatedCard = {
                                    ...card, // Preserve front, back, notes, tags, deckId, hintImageUrl, createdAt etc.
                                    easeFactor: newEF,
                                    interval: newInterval,
                                    repetitions: newRepetitions,
                                    lastReviewed: new Date().toISOString(), // Record this review time
                                    nextReviewDate: nextReviewDate.toISOString(), // Store the calculated date
                                    // bucket: undefined // Explicitly remove the old bucket field if desired
                                };
                                // --- ^^^ END SRS Calculation ^^^ ---
            
            
                                // 5. Put the updated card back into the database
                                const putRequest = store.put(updatedCard);
            
                                putRequest.onsuccess = () => {
                                    // Log the relevant SRS updates
                                    console.log(`Card ${currentCard.id} updated. Rating: ${rating} (Quality: ${quality}). New EF: ${newEF.toFixed(2)}, New Interval: ${newInterval}d. Next Review: ${nextReviewDate.toLocaleDateString()}`);
                                    resolve(); // Resolve the outer promise on successful update
                                };
                                putRequest.onerror = (e) => {
                                    console.error("Error putting updated card:", e.target.error);
                                    setFeedback(`Error updating card: ${e.target.error?.message}`);
                                    reject(e.target.error); // Reject on put error
                                };
                            }; // --- END of NEW getRequest.onsuccess logic ---
                        }); // End await new Promise
                        // ... rest of handleResponse (moveToNextCard call) ...
                    } catch (err) {
                        // ... existing catch block ...
                    }
                };


    // --- Move to Next Card (UPDATED to reset image hint) ---
    const moveToNextCard = () => {
        const nextIndex = currentCardIndex + 1;
        if (nextIndex >= deckCards.length) {
            console.log("Review complete.");
            setReviewComplete(true);
            setReviewActive(false); // Stops webcam/prediction
            setFeedback('Review session completed!');
        } else {
            console.log(`Moving to card index ${nextIndex}`);
            setCurrentCardIndex(nextIndex);
            setShowAnswer(false);
            setHintUsed(false);
            setHintText('');
            setShowImageHint(false); // <<< RESET IMAGE HINT
        }
        setFeedbackAnimation(null); // Reset visual feedback flash
    };


    // --- Reset Review State (UPDATED to reset image hint) ---
    const handleResetReview = () => {
        console.log("ReviewFlashcards: Resetting review.");
        stopWebcam(); // Stop webcam and prediction
        setDeckCards([]);
        setCurrentCardIndex(0);
        setShowAnswer(false);
        setReviewActive(false);
        setReviewComplete(false);
        setStats({ correct: 0, incorrect: 0, hard: 0, total: 0 });
        setFeedback('');
        setFeedbackAnimation(null);
        setHintUsed(false);
        setHintText('');
        setShowImageHint(false); // <<< RESET IMAGE HINT
        setIsLoadingCards(false);
        setSelectedDeckId(''); // Optionally reset deck selection
    };


    // --- Keyboard Shortcuts ---
    useEffect(() => {
        if (!reviewActive) return;
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (!showAnswer) {
                if (e.code === 'Space') { e.preventDefault(); setShowAnswer(true); }
                else if (e.key === 'h' || e.key === 'H') { e.preventDefault(); handleHint(); }
            } else {
                if (e.code === 'ArrowRight' || e.key === '1') { handleResponse('correct'); }
                else if (e.code === 'ArrowDown' || e.key === '2') { handleResponse('hard'); }
                else if (e.code === 'ArrowLeft' || e.key === '3') { handleResponse('incorrect'); }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [reviewActive, showAnswer, currentCardIndex, deckCards, handleHint, handleResponse]); // Added handleHint/handleResponse


    // --- Gesture Handling ---
    useEffect(() => {
        if (!reviewActive || !knn || knn.getNumClasses() === 0 || !showAnswer) return; // Only act when answer is shown
        const { label, confidence } = currentPrediction;
        if (confidence >= GESTURE_CONFIDENCE_THRESHOLD) {
            console.log(`Review: Detected gesture "${label}" with confidence ${confidence.toFixed(2)}. Acting...`);
            setDetectedGesture(label);
            const feedbackTimer = setTimeout(() => setDetectedGesture(null), 500);
            let actionTaken = false;
            switch (label) {
                case 'yes': if (showAnswer) { handleResponse('correct'); actionTaken = true; } break;
                case 'no': if (showAnswer) { handleResponse('incorrect'); actionTaken = true; } break;
                // 'hint' gesture shouldn't trigger when answer is shown
                // case 'hint': if (!showAnswer) { handleHint(); actionTaken = true; } break;
                // Add 'hard' if trained
                default: console.log(`   Action: Gesture "${label}" has no action mapped when answer is shown.`); break;
            }
             if (actionTaken) { setCurrentPrediction({ label: '...', confidence: 0 }); } // Prevent re-trigger
             return () => clearTimeout(feedbackTimer);
        }
    }, [reviewActive, showAnswer, currentPrediction, handleResponse, knn, setDetectedGesture, setCurrentPrediction]); // Adjusted dependencies

    // Effect for 'hint' gesture (separate because it acts when answer is NOT shown)
    useEffect(() => {
        if (!reviewActive || !knn || knn.getNumClasses() === 0 || showAnswer) return; // Only act when answer is HIDDEN
        const { label, confidence } = currentPrediction;
         if (label === 'hint' && confidence >= GESTURE_CONFIDENCE_THRESHOLD) {
             console.log(`Review: Detected gesture "${label}" with confidence ${confidence.toFixed(2)}. Acting...`);
             setDetectedGesture(label);
             const feedbackTimer = setTimeout(() => setDetectedGesture(null), 500);
             handleHint(); // Call hint function
             setCurrentPrediction({ label: '...', confidence: 0 }); // Prevent re-trigger
              return () => clearTimeout(feedbackTimer);
         }
    }, [reviewActive, showAnswer, currentPrediction, handleHint, knn, setDetectedGesture, setCurrentPrediction]);


    // --- Styles ---
    const containerStyle = { padding: '15px' };
    const sectionStyle = { padding: '15px', border: '1px solid #eee', borderRadius: '4px', marginBottom: '15px' };
    const controlsStyle = { marginTop: '20px', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '10px' };
    const buttonStyle = { padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', border: '1px solid #ccc' };
    const correctButtonStyle = { ...buttonStyle, backgroundColor: '#4caf50', color: 'white', borderColor: '#388e3c' };
    const hardButtonStyle = { ...buttonStyle, backgroundColor: '#ff9800', color: 'white', borderColor: '#f57c00' };
    const incorrectButtonStyle = { ...buttonStyle, backgroundColor: '#f44336', color: 'white', borderColor: '#d32f2f' };
    const hintButtonStyle = {...buttonStyle, backgroundColor: '#2196f3', color: 'white', borderColor: '#1976d2'};
    const showAnswerButtonStyle = {...buttonStyle, backgroundColor: '#673ab7', color: 'white', borderColor: '#512da8'};
    const statsStyle = { marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px', textAlign: 'center', border: '1px solid #ddd' };
    const keyboardHintStyle = { fontSize: '0.8em', color: '#666', textAlign: 'center', marginTop: '15px', lineHeight: '1.4' };
    const hintTextStyle = { padding: '10px', backgroundColor: '#e3f2fd', border: '1px dashed #90caf9', borderRadius: '4px', marginTop: '15px', fontFamily: 'monospace', fontSize: '1.1em', textAlign: 'center' };
    const getCardStyle = () => { /* ... dynamic style based on feedbackAnimation ... */
        const baseStyle = { border: '1px solid #ddd', padding: '20px', borderRadius: '8px', marginTop: '15px', backgroundColor: '#f9f9f9', minHeight: '150px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', transition: 'background-color 0.3s ease, border-color 0.3s ease', overflowWrap: 'break-word', width: '100%', boxSizing: 'border-box' };
        switch (feedbackAnimation) { case 'correct': return { ...baseStyle, backgroundColor: '#e8f5e9', borderColor: '#a5d6a7' }; case 'hard': return { ...baseStyle, backgroundColor: '#fff3e0', borderColor: '#ffcc80' }; case 'incorrect': return { ...baseStyle, backgroundColor: '#ffebee', borderColor: '#ef9a9a' }; default: return baseStyle; }
    };
    const reviewVideoStyle = { width: '80%', maxWidth: '200px', border: '1px solid #ccc', display: 'block', margin: '10px auto', backgroundColor: '#333' };
    const predictionStyle = { fontSize: '0.9em', textAlign: 'center', marginTop: '5px', color: '#333', minHeight: '1.2em' };


    // --- Render Logic ---
    return (
        <div style={containerStyle}>
            <h3>Review Flashcards</h3>

            {/* Deck Selection & Setup */}
            {!reviewActive && !reviewComplete && (
                 <div style={sectionStyle}>
                     {/* ... select deck and session limit inputs ... */}
                     <label htmlFor="deck-select-review" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Select Deck:</label>
                     <select id="deck-select-review" value={selectedDeckId} onChange={(e) => setSelectedDeckId(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '15px', border: '1px solid #ccc', borderRadius: '3px' }} disabled={isLoadingCards} >
                         <option value="">-- Select a Deck --</option>
                         {decks.map(deck => (<option key={deck.id} value={deck.id}>{deck.name}</option>))}
                         {decks.length === 0 && <option disabled>No decks available</option>}
                     </select>
                     <label htmlFor="session-limit" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Cards per Session:</label>
                     <input id="session-limit" type="number" min="0" step="1" value={sessionLimit} onChange={(e) => setSessionLimit(Math.max(0, parseInt(e.target.value) || 0))} placeholder="0 for all due cards" style={{ width: '100%', padding: '8px', marginBottom: '15px', border: '1px solid #ccc', borderRadius: '3px' }} disabled={isLoadingCards} />
                     <button onClick={handleStartReview} disabled={!selectedDeckId || isLoadingCards} style={{ ...buttonStyle, backgroundColor: '#1976d2', color: 'white', width: '100%' }} > {isLoadingCards ? 'Loading...' : 'Start Review Session'} </button>
                 </div>
            )}

            {/* Review Session Active */}
            {reviewActive && !isLoadingCards && deckCards.length > 0 && currentCardIndex < deckCards.length && (
                <div style={sectionStyle}>
                    <h4>Card {currentCardIndex + 1} of {deckCards.length}</h4>

                    {/* Webcam & Prediction Display */}
                    <div style={{marginBottom: '15px'}}>
                        <video ref={videoRefCallback} autoPlay playsInline muted style={reviewVideoStyle} width="320" height="240" onStalled={() => setIsVideoReady(false)} onError={() => { setIsVideoReady(false); setWebcamError("Video playback error."); }} ></video>
                         {webcamError && <p style={{color: 'red', textAlign: 'center', fontSize: '0.9em'}}>{webcamError}</p>}
                         {gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.LOADING && <p style={{textAlign: 'center', fontSize: '0.9em'}}>Loading model...</p>}
                         {gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.FAILED && <p style={{color: 'red', textAlign: 'center', fontSize: '0.9em'}}>Model load failed.</p>}
                         {stream && knn && knn.getNumClasses() > 0 && (<p style={predictionStyle}> Detected: {currentPrediction.label} ({(currentPrediction.confidence * 100).toFixed(1)}%) </p>)}
                         {stream && knn && knn.getNumClasses() === 0 && gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.LOADED && (<p style={{...predictionStyle, color: 'orange'}}>No gestures trained yet!</p>)}
                    </div>

                    {/* Card Display */}
                    <div style={getCardStyle()}>
                        {/* Front */}
                        <div style={{ marginBottom: showAnswer ? '20px' : '0' }}>
                             <h5 style={{marginTop: 0, marginBottom: '10px', color: '#555'}}>Question:</h5>
                             <p style={{ fontSize: '1.2em', fontWeight: 'bold', margin: 0 }}>{deckCards[currentCardIndex].front}</p>
                        </div>

                        {/* --- UPDATED: Hint Display Area --- */}
                        {showImageHint && !showAnswer && deckCards[currentCardIndex]?.hintImageUrl && (
                            <div style={{ marginTop: '15px', borderTop: '1px dashed #ccc', paddingTop: '15px', textAlign: 'center' }}>
                                <h5 style={{ marginTop: 0, marginBottom: '5px', color: '#555' }}>Image Hint:</h5>
                                <img src={deckCards[currentCardIndex].hintImageUrl} alt="Hint" style={{ maxWidth: '90%', maxHeight: '150px', display: 'block', margin: '5px auto', border: '1px solid #eee', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; console.warn("Hint image failed to load:", e.target.src); }} />
                            </div>
                        )}
                        {hintText && !showImageHint && !showAnswer && (
                            <div style={hintTextStyle}>
                                <p style={{margin: 0}}><strong>Hint:</strong> {hintText}</p>
                            </div>
                        )}
                        {/* --------------------------------- */}

                        {/* Answer (Conditional) */}
                        {showAnswer && (
                            <div style={{ borderTop: '1px dashed #ccc', paddingTop: '20px', width: '100%' }}>
                                <h5 style={{marginTop: 0, marginBottom: '10px', color: '#555'}}>Answer:</h5>
                                <p style={{ fontSize: '1.2em', margin: 0 }}>{deckCards[currentCardIndex].back}</p>
                                {deckCards[currentCardIndex].notes && ( <div style={{ marginTop: '15px', fontSize: '0.9em', color: '#555', textAlign: 'left', background: '#eee', padding: '5px 10px', borderRadius: '3px' }}> <strong>Notes:</strong> {deckCards[currentCardIndex].notes} </div> )}
                            </div>
                        )}
                    </div>

                    {/* Controls */}
                    <div style={controlsStyle}>
                        {!showAnswer ? (
                            <>
                                <button onClick={handleHint} style={{...hintButtonStyle, border: detectedGesture === 'hint' ? '3px solid yellow' : hintButtonStyle.border, transform: detectedGesture === 'hint' ? 'scale(1.05)' : 'none', transition: 'border 0.1s ease-out, transform 0.1s ease-out'}} disabled={showImageHint}>Get Hint (H)</button> {/* Disable hint button if image is shown? Or let it reveal answer? */}
                                <button onClick={() => setShowAnswer(true)} style={showAnswerButtonStyle}>Show Answer (Space)</button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => handleResponse('correct')} style={{...correctButtonStyle, border: detectedGesture === 'yes' ? '3px solid yellow' : correctButtonStyle.border, transform: detectedGesture === 'yes' ? 'scale(1.05)' : 'none', transition: 'border 0.1s ease-out, transform 0.1s ease-out'}} >Correct (1 / →)</button>
                                <button onClick={() => handleResponse('hard')} style={hardButtonStyle}>Hard (2 / ↓)</button>
                                <button onClick={() => handleResponse('incorrect')} style={{...incorrectButtonStyle, border: detectedGesture === 'no' ? '3px solid yellow' : incorrectButtonStyle.border, transform: detectedGesture === 'no' ? 'scale(1.05)' : 'none', transition: 'border 0.1s ease-out, transform 0.1s ease-out'}}>Incorrect (3 / ←)</button>
                            </>
                        )}
                    </div>

                    {/* --- UPDATED: Progress Info --- */}
                    <div style={{ marginTop: '15px', textAlign: 'center', fontSize: '0.9em', color: '#555' }}>
                         {deckCards[currentCardIndex] && ( // Check for card existence
                             <p style={{ margin: '0 0 5px 0' }}>
                                 Next Review: {deckCards[currentCardIndex].nextReviewDate ? new Date(deckCards[currentCardIndex].nextReviewDate).toLocaleDateString() : 'N/A'}
                                  | Ease: {deckCards[currentCardIndex].easeFactor?.toFixed(1) ?? 'N/A'}
                                  {hintUsed && <span style={{color: 'orange', fontWeight: 'bold'}}> (Hint Used)</span>}
                             </p>
                         )}
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

            {/* Review Complete Summary */}
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
                     <div style={{ textAlign: 'center', marginTop: '20px' }}> <button onClick={handleResetReview} style={{ ...buttonStyle, backgroundColor: '#1976d2', color: 'white', width: '100%' }} > Review Another Deck / Start Over </button> </div>
                 </div>
            )}
        </div>
    );
}
        
        

        // --- useEffect to connect stream if video already exists ---
// Inside ReviewFlashcards.jsx
// Inside ReviewFlashcards.jsx
useEffect(() => {
    if (stream && videoElement) {
         // ---> ADD THIS LOG <---
         console.log(`>>> useEffect[stream, videoElement]: Attaching stream ${stream.id} to video element. Current srcObject:`, videoElement.srcObject);
        if (videoElement.srcObject !== stream) {
            videoElement.srcObject = stream;
            videoElement.play().catch(e => console.error(">>> useEffect[stream, videoElement]: Video play() failed:", e));
        }
    } else if (!stream && videoElement && videoElement.srcObject) {
        console.log(">>> useEffect[stream, videoElement]: Stream is null, clearing srcObject.");
        videoElement.srcObject = null;
    }
     // ---> ADD THIS LOG to see state values when hook runs <---
     console.log(`>>> useEffect[stream, videoElement] check: stream=${!!stream}, videoElement=${!!videoElement}`);

}, [stream, videoElement]);
        
        
        
        
        
    
        const stopWebcam = useCallback(() => {
            // Stop prediction interval first
            if (predictionIntervalRef.current) { clearInterval(predictionIntervalRef.current); predictionIntervalRef.current = null; console.log("Review: Stopped prediction loop."); }
            if (stream) { console.log("Review: Stopping webcam."); stream.getTracks().forEach(track => track.stop()); setStream(null); if (videoRef.current) 
                { videoRef.current.srcObject = null; }}
            setCurrentPrediction({ label: '...', confidence: 0 });
        }, [stream]);
    
        // --- Cleanup Webcam on Unmount ---
        useEffect(() => { return () => { stopWebcam(); }; }, [stopWebcam]);
    

        const videoRefCallback = useCallback((node) => {
            // Log entry point
            console.log(`Review: videoRefCallback called. Node: ${node ? 'Exists' : 'Null'}`);
        
            if (node) { // Node is MOUNTED
                // Log node received
                console.log(">>> videoRefCallback: Node received, setting videoElement state.", node);
                // Set videoElement state
                setVideoElement(node);
        
                // --- Attach Event Listeners Directly to the Node ---
                // Use function assignment for oncanplay, onerror, onstalled
                // This ensures previous handlers are replaced if the callback runs again for the same node (unlikely but safe)
                node.oncanplay = () => {
                    console.log(">>> videoRefCallback: onCanPlay event fired on node <<<");
                    setIsVideoReady(true);
                };
                node.onerror = (e) => {
                    console.error("Video Error in Callback Ref:", e);
                    setIsVideoReady(false); // Set not ready on error
                };
                node.onstalled = () => {
                    console.warn("Video Stalled in Callback Ref");
                    setIsVideoReady(false); // Set not ready if stalled
                };
                // Optional: If you still need handleVideoError for other purposes, keep addEventListener/removeEventListener pair
                // node.addEventListener('error', handleVideoError);
        
        
                // --- Attempt to attach stream IF stream is ready when node mounts ---
                // The useEffect hook will handle cases where the stream arrives later
                if (stream && node.srcObject !== stream) {
                    console.log(">>> videoRefCallback: Attaching existing stream to newly mounted node.");
                    node.srcObject = stream;
                    node.play().catch(e => console.error("Video play() failed in callback ref:", e));
                } else if (!stream) {
                     console.log(">>> videoRefCallback: Node mounted, but stream is not ready yet.");
                } else {
                     console.log(">>> videoRefCallback: Node mounted, stream already attached.");
                }
        
            } else { // Node is UNMOUNTED
                // Log unmount
                console.log("Review: videoRefCallback - Node unmounted.");
                // Log clearing state
                console.log(">>> videoRefCallback: Node is null (unmounting?), clearing videoElement state.");
        
                // --- Cleanup ---
                // Get the node from state *before* clearing it, if needed for listener removal
                // const currentVideoNode = videoElement;
                // if (currentVideoNode) {
                //     // Remove specific listeners if added with addEventListener
                //     // currentVideoNode.removeEventListener('error', handleVideoError);
                // }
        
                // Clear states
                setVideoElement(null);
                setIsVideoReady(false);
            }
        // Ensure stream is the only dependency needed here, as state setters don't need to be listed
        }, [stream]);
        
        

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
    }, [sessionLimit, setFeedback]); // Add sessionLimit dependency

    // Start the review session
    // Replace the existing handleStartReview with this:
const handleStartReview = async () => {
    if (!selectedDeckId) {
        setFeedback('Please select a deck first.');
        return;
    }
    if (gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.LOADING) {
        setFeedback('Models loading...');
        return;
    }
    if (gestureModelLoadState !== GESTURE_MODEL_LOADED_STATE.LOADED || !knn || knn.getNumClasses() === 0) {
         // Also check if model is loaded and TRAINED, otherwise review makes no sense
         setFeedback('Models not loaded or no gestures trained yet.');
         console.warn("Review start blocked: Models not ready or not trained.");
        return;
    }

    setReviewComplete(false);
    setReviewActive(true); // Trigger re-render, which should mount the video element
    setFeedback('Starting webcam...');
    stopWebcam(); // Ensure clean start (stops previous stream & prediction loop)

    // --- Start webcam immediately ---
    const streamStarted = await startWebcam(); // Call startWebcam directly

    if (!streamStarted) {
        console.error("Review: Webcam failed to start in handleStartReview.");
        // Optionally reset state if webcam fails critically
        // setReviewActive(false);
        // setFeedback is likely set within startWebcam on error
    } else {
        console.log("Review: Webcam started successfully in handleStartReview. Component should re-render with stream.");
        // Fetch cards AFTER webcam is confirmed to start (or maybe even after video is ready?)
        // Let's fetch cards here for now, assuming webcam start is the main prerequisite
         await fetchCardsForDeck(selectedDeckId);
    }
};
    

    // Inside ReviewFlashcards.jsx component

// Inside ReviewFlashcards.jsx component

// Inside ReviewFlashcards.jsx component

// Inside ReviewFlashcards.jsx -> runPrediction useCallback

const runPrediction = useCallback(async () => {
    // Guard clause remains essential
    if (!videoElement || !isVideoReady || videoElement.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA || !knn || !mobilenetModel || !stream) {
        // console.log("Skipping prediction: Prerequisites not met."); // Keep for debugging if needed
        return;
    }

    let frameTensor = null;
    let logits = null;
    let result = null;

    try {
        // 1. Get frame tensor
        frameTensor = tf.browser.fromPixels(videoElement);

        // 2. Get logits from MobileNet using the frame tensor
        logits = mobilenetModel.infer(frameTensor, true);

        // 3. Dispose the frameTensor immediately after inference.
        if (frameTensor) {
             tf.dispose(frameTensor);
             frameTensor = null;
        }

        // 4. Validate the logits tensor
        if (!logits || logits.isDisposed) {
             console.error("Prediction Error: Logits are null or disposed before KNN call.");
             setCurrentPrediction({ label: 'Error', confidence: 0 });
             if(logits && !logits.isDisposed) tf.dispose(logits);
             return;
        }

        // 5. Perform the KNN prediction using the logits tensor.
        // console.log(`>>> Before knn.predictClass: logits.isDisposed = ${logits.isDisposed}`); // Optional log
        result = await knn.predictClass(logits, 3); // k=3 neighbors
        // console.log(">>> After knn.predictClass returned."); // Optional log

        // 6. Process the prediction result.
        if (result?.label && result.confidences) {
            const confidenceScore = result.confidences[result.label] || 0;
            // console.log(`>>> Prediction Result: ${result.label} (${confidenceScore.toFixed(3)})`); // Optional log
            setCurrentPrediction({
                label: result.label,
                confidence: confidenceScore
            });
        } else {
            // console.log(">>> Prediction Result: Invalid or null."); // Optional log
            setCurrentPrediction({ label: '...', confidence: 0 });
        }

    } catch (error) {
        console.error("Prediction error occurred during REAL prediction:", error);
        setCurrentPrediction({ label: 'Error', confidence: 0 });
    } finally {
        // 7. Cleanup logits
        if (logits && !logits.isDisposed) {
            tf.dispose(logits);
        }
         // Double check frameTensor disposal
        if (frameTensor && !frameTensor.isDisposed) {
             tf.dispose(frameTensor);
        }
        // console.log(">>> Real prediction function finished."); // Optional log
    }
}, [videoElement, isVideoReady, knn, mobilenetModel, stream, setCurrentPrediction]);


    // --- Effect to Start/Stop Prediction Loop ---
    // Inside ReviewFlashcards.jsx

    // Inside ReviewFlashcards.jsx component

    // --- Effect to Start/Stop Prediction Loop ---
    // Inside ReviewFlashcards.jsx

useEffect(() => {
    // Start loop ONLY if review is active, not complete, stream exists,
    // models are loaded/trained, AND video is ready
    if (reviewActive && !reviewComplete && stream && knn && mobilenetModel && knn.getNumClasses() > 0 && isVideoReady) {
        console.log(">>> Review: Starting prediction loop (Video Ready).");
        // Clear any existing interval before starting a new one
        if (predictionIntervalRef.current) {
            clearInterval(predictionIntervalRef.current);
        }
        // Start the prediction loop
        predictionIntervalRef.current = setInterval(runPrediction, 200); // Adjust interval (200ms = 5fps)
    } else {
        // Stop the loop if conditions are not met
        if (predictionIntervalRef.current) {
            console.log(">>> Review: Stopping prediction loop (Conditions not met).");
            clearInterval(predictionIntervalRef.current);
            predictionIntervalRef.current = null;
        }
    }
    // Cleanup interval on unmount or when dependencies change
    return () => {
        if (predictionIntervalRef.current) {
            console.log(">>> Cleanup: Clearing prediction interval.");
            clearInterval(predictionIntervalRef.current);
            predictionIntervalRef.current = null;
        }
    };
// Dependencies that control the loop start/stop
}, [reviewActive, reviewComplete, stream, knn, mobilenetModel, runPrediction, isVideoReady]);



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

   // react-popup-src/src/ReviewFlashcards.jsx

// ... other functions ...

    // --- Handle user response (UPDATED with SRS Logic) ---
    const handleResponse = async (rating) => {
        if (!reviewActive || currentCardIndex >= deckCards.length) {
             console.warn("handleResponse called when review not active or finished.");
             return;
        }

        const effectiveRating = hintUsed ? 'hard' : rating; // If hint was used, treat as "hard"
        setFeedbackAnimation(rating); // Show visual feedback

        const currentCard = deckCards[currentCardIndex];

        // Update stats (remains the same)
        setStats(prev => ({
            ...prev,
            correct: prev.correct + (rating === 'correct' ? 1 : 0),
            hard: prev.hard + (rating === 'hard' ? 1 : 0),
            incorrect: prev.incorrect + (rating === 'incorrect' ? 1 : 0)
        }));

        // --- Update Card in IndexedDB (UPDATED SRS Calculation) ---
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const getRequest = store.get(currentCard.id);

            await new Promise((resolve, reject) => {
                getRequest.onsuccess = (event) => {
                    const card = event.target.result;
                    if (!card) {
                        console.error("Card not found for update:", currentCard.id);
                        setFeedback('Error: Card not found in DB during update.');
                        reject(new Error('Card not found'));
                        return;
                    }

                    // --- VVV SRS Calculation (Simplified SM-2 Adaptation) VVV ---

                    // Get current SRS parameters, providing defaults if missing
                    let currentEF = card.easeFactor ?? 2.5; // Default ease factor
                    let repetitions = card.repetitions ?? 0;
                    let currentInterval = card.interval ?? 0; // Interval in days

                    // Map rating to SM-2 quality score (0-5)
                    let quality = 0;
                    switch (effectiveRating) {
                        case 'incorrect': quality = 0; break; // Complete failure
                        case 'hard':      quality = 3; break; // Pass, but difficult
                        case 'correct':   quality = 5; break; // Perfect recall
                        default:          quality = 3; // Default case
                    }

                    // 1. Calculate new Ease Factor (EF)
                    let newEF = currentEF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
                    if (newEF < 1.3) {
                        newEF = 1.3; // Minimum Ease Factor
                    }

                    // 2. Calculate new Repetitions and Interval
                    let newRepetitions;
                    let newInterval;

                    if (quality < 3) { // If recall quality is poor (Incorrect)
                        newRepetitions = 0; // Reset repetition count
                        newInterval = 1;    // Reschedule for the next day (or 0 for same day)
                        // Keep EF adjusted downwards from calculation above
                    } else { // If recall quality is good (Hard or Correct)
                        newRepetitions = repetitions + 1;
                        if (newRepetitions === 1) {
                            newInterval = 1; // First successful recall
                        } else if (newRepetitions === 2) {
                            newInterval = 6; // Second successful recall
                        } else {
                            // Subsequent recalls: interval based on previous interval and EF
                            newInterval = Math.ceil(currentInterval * currentEF);
                        }
                    }

                    // 3. Calculate the next review date
                    const today = new Date();
                    // Important: Calculate based on *today*, not lastReviewed, to avoid drift
                    const nextReviewDate = new Date(today.setDate(today.getDate() + newInterval));

                    // 4. Construct the updated card object
                    const updatedCard = {
                        ...card, // Preserve other fields (front, back, notes, tags, hintImageUrl, etc.)
                        easeFactor: newEF,
                        interval: newInterval,
                        repetitions: newRepetitions,
                        lastReviewed: new Date().toISOString(), // Record this review time
                        nextReviewDate: nextReviewDate.toISOString(), // Store the calculated date
                        // bucket: undefined // Optionally remove the old bucket field explicitly
                    };
                    // --- ^^^ END SRS Calculation ^^^ ---


                    // 5. Put the updated card back into the database
                    const putRequest = store.put(updatedCard);

                    putRequest.onsuccess = () => {
                        console.log(`Card ${currentCard.id} updated. Rating: ${rating} (Quality: ${quality}). New EF: ${newEF.toFixed(2)}, New Interval: ${newInterval} days. Next Review: ${nextReviewDate.toLocaleDateString()}`);
                        resolve(); // Resolve the promise on successful update
                    };
                    putRequest.onerror = (e) => {
                        console.error("Error putting updated card:", e.target.error);
                        setFeedback(`Error updating card: ${e.target.error?.message}`);
                        reject(e.target.error);
                    };
                }; // End getRequest.onsuccess

                getRequest.onerror = (e) => { /* ... get error handling ... */ reject(e.target.error); };
                transaction.onerror = (e) => { /* ... transaction error handling ... */ };
                transaction.oncomplete = () => { console.log("Card update transaction complete."); };

            }); // End Promise

            // Move to the next card AFTER the DB update attempt finishes
             moveToNextCard();

        } catch (err) {
            console.error("Error during handleResponse DB operations:", err);
            // Still move to next card even if DB update fails, to avoid getting stuck
            moveToNextCard();
        }
        // 'finally' block removed as feedback animation is handled by moveToNextCard
    };

    // ... rest of the component (moveToNextCard, generateHint, handleResetReview, JSX, etc.) ...
     // --- Move to the next card or end review ---
     // Constants

function ReviewFlashcards({ decks, setFeedback }) {

    // --- State Variables ---
    const [selectedDeckId, setSelectedDeckId] = useState('');
    const [deckCards, setDeckCards] = useState([]);
    const [isLoadingCards, setIsLoadingCards] = useState(false);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [showAnswer, setShowAnswer] = useState(false);
    const [reviewActive, setReviewActive] = useState(false);
    const [reviewComplete, setReviewComplete] = useState(false);
    const [stats, setStats] = useState({ correct: 0, incorrect: 0, hard: 0, total: 0 });
    const [sessionLimit, setSessionLimit] = useState(20);
    const [feedbackAnimation, setFeedbackAnimation] = useState(null);
    const [hintUsed, setHintUsed] = useState(false);
    const [hintText, setHintText] = useState('');
    const [showImageHint, setShowImageHint] = useState(false); // State for image hint
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [videoElement, setVideoElement] = useState(null);
    const videoRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [webcamError, setWebcamError] = useState('');
    const [knn, setKnn] = useState(null);
    const [mobilenetModel, setMobilenetModel] = useState(null);
    const [gestureModelLoadState, setGestureModelLoadState] = useState(GESTURE_MODEL_LOADED_STATE.IDLE);
    const [loadedClassCounts, setLoadedClassCounts] = useState({});
    const predictionIntervalRef = useRef(null);
    const [currentPrediction, setCurrentPrediction] = useState({ label: '...', confidence: 0 });
    const [detectedGesture, setDetectedGesture] = useState(null);
    // --- End State Variables ---


    // --- Load Models (MobileNet & KNN Data) ---
    const loadModelsAndData = useCallback(async () => {
        // ... (function logic as before) ...
         if (gestureModelLoadState !== GESTURE_MODEL_LOADED_STATE.IDLE) return;
         setGestureModelLoadState(GESTURE_MODEL_LOADED_STATE.LOADING); /* ... */
         try { /* ... */ } catch (error) { /* ... */ }
    }, [gestureModelLoadState, setFeedback]);

    useEffect(() => { loadModelsAndData(); }, [loadModelsAndData]);


    // --- Webcam Control Functions ---
    const startWebcam = useCallback(async () => { /* ... logic ... */ }, []);
    const stopWebcam = useCallback(() => { /* ... logic ... */ }, [stream]);
    useEffect(() => { return () => { stopWebcam(); }; }, [stopWebcam]);


    // --- Video Element Handling ---
     const videoRefCallback = useCallback((node) => { /* ... logic ... */ }, [stream]);
    useEffect(() => { /* ... logic to attach stream ... */ }, [stream, videoElement]);


    // --- Fetch cards for the selected deck (USING nextReviewDate) ---
    const fetchCardsForDeck = useCallback(async (deckId) => { /* ... logic ... */ }, [sessionLimit, setFeedback]);


    // --- Start Review Session ---
    const handleStartReview = async () => { /* ... logic ... */ };


    // --- Prediction Loop ---
    const runPrediction = useCallback(async () => { /* ... logic ... */ }, [/* dependencies */]);
    useEffect(() => { /* ... logic to start/stop interval ... */ }, [/* dependencies */]);


    // --- Generate Text Hint ---
    const generateHint = (answerText) => { /* ... logic ... */ };


    // --- Handle Hint Request (UPDATED for Image) ---
    const handleHint = () => { /* ... logic as updated previously ... */ };


    // --- Handle User Response (UPDATED with SRS Logic) ---
    const handleResponse = async (rating) => { /* ... logic as updated previously ... */ };


    // --- Move to Next Card (CORRECT Version - Includes Image Hint Reset) ---
    const moveToNextCard = () => {
        const nextIndex = currentCardIndex + 1;
        if (nextIndex >= deckCards.length) {
            console.log("Review complete. No more cards in this session.");
            setReviewComplete(true);
            setReviewActive(false); // Stop webcam/prediction
            setFeedback('Review session completed!');
        } else {
            console.log(`Moving to card index ${nextIndex}`);
            setCurrentCardIndex(nextIndex);
            setShowAnswer(false);
            setHintUsed(false);
            setHintText('');
            setShowImageHint(false); // <<< RESET IMAGE HINT (This is the correct place)
        }
        setFeedbackAnimation(null); // Reset visual feedback flash
    };
    // --- END CORRECT moveToNextCard ---


    // --- Reset Review State (CORRECT Version - Includes Image Hint Reset) ---
    const handleResetReview = () => {
        console.log("ReviewFlashcards: Resetting review.");
        stopWebcam(); // Stop webcam and prediction
        setDeckCards([]);
        setCurrentCardIndex(0);
        setShowAnswer(false);
        setReviewActive(false);
        setReviewComplete(false);
        setStats({ correct: 0, incorrect: 0, hard: 0, total: 0 });
        setFeedback('');
        setFeedbackAnimation(null);
        setHintUsed(false);
        setHintText('');
        setShowImageHint(false); // <<< RESET IMAGE HINT (This is the correct place)
        setIsLoadingCards(false);
        setSelectedDeckId(''); // Optionally reset deck selection
    };
    // --- END CORRECT handleResetReview ---


    // --- Keyboard Shortcuts ---
    useEffect(() => { /* ... logic ... */ }, [/* dependencies */]);


    // --- Gesture Handling ---
    useEffect(() => { /* ... logic for yes/no gestures ... */ }, [/* dependencies */]);
    useEffect(() => { /* ... logic for hint gesture ... */ }, [/* dependencies */]);


    // --- Styles ---
    // ... (All style objects as before) ...
    const containerStyle = { /*...*/ }; const sectionStyle = { /*...*/ };
    const controlsStyle = { /*...*/ }; const buttonStyle = { /*...*/ };
    const correctButtonStyle = { /*...*/ }; const hardButtonStyle = { /*...*/ };
    const incorrectButtonStyle = { /*...*/ }; const hintButtonStyle = { /*...*/ };
    const showAnswerButtonStyle = { /*...*/ }; const statsStyle = { /*...*/ };
    const keyboardHintStyle = { /*...*/ }; const hintTextStyle = { /*...*/ };
    const getCardStyle = () => { /*...*/ }; const reviewVideoStyle = { /*...*/ };
    const predictionStyle = { /*...*/ };


    // --- Render Logic ---
    return (
        <div style={containerStyle}>
            <h3>Review Flashcards</h3>

             {/* Deck Selection & Setup */}
             {!reviewActive && !reviewComplete && (
                 <div style={sectionStyle}>
                     {/* ... select deck and session limit inputs ... */}
                 </div>
            )}

            {/* Review Session Active */}
            {reviewActive && !isLoadingCards && deckCards.length > 0 && currentCardIndex < deckCards.length && (
                <div style={sectionStyle}>
                    <h4>Card {currentCardIndex + 1} of {deckCards.length}</h4>

                    {/* Webcam & Prediction Display */}
                    <div style={{marginBottom: '15px'}}>
                        {/* ... video and prediction elements ... */}
                    </div>

                    {/* Card Display */}
                    <div style={getCardStyle()}>
                        {/* Front */}
                        <div style={{ marginBottom: showAnswer ? '20px' : '0' }}>
                             {/* ... */}
                             <p style={{ fontSize: '1.2em', fontWeight: 'bold', margin: 0 }}>{deckCards[currentCardIndex].front}</p>
                        </div>

                         {/* --- UPDATED: Hint Display Area --- */}
                         {showImageHint && !showAnswer && deckCards[currentCardIndex]?.hintImageUrl && (
                             <div style={{ marginTop: '15px', borderTop: '1px dashed #ccc', paddingTop: '15px', textAlign: 'center' }}>
                                 <h5 style={{ marginTop: 0, marginBottom: '5px', color: '#555' }}>Image Hint:</h5>
                                 <img src={deckCards[currentCardIndex].hintImageUrl} alt="Hint" style={{ maxWidth: '90%', maxHeight: '150px', display: 'block', margin: '5px auto', border: '1px solid #eee', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; console.warn("Hint image failed to load:", e.target.src); }} />
                             </div>
                         )}
                         {hintText && !showImageHint && !showAnswer && (
                             <div style={hintTextStyle}>
                                 <p style={{margin: 0}}><strong>Hint:</strong> {hintText}</p>
                             </div>
                         )}
                         {/* --------------------------------- */}


                        {/* Answer (Conditional) */}
                        {showAnswer && (
                            <div style={{ borderTop: '1px dashed #ccc', paddingTop: '20px', width: '100%' }}>
                                {/* ... answer and notes ... */}
                            </div>
                        )}
                    </div>

                     {/* Controls */}
                     <div style={controlsStyle}>
                         {/* ... buttons ... */}
                     </div>

                     {/* --- UPDATED: Progress Info --- */}
                     <div style={{ marginTop: '15px', textAlign: 'center', fontSize: '0.9em', color: '#555' }}>
                         {deckCards[currentCardIndex] && (
                             <p style={{ margin: '0 0 5px 0' }}>
                                 Next Review: {deckCards[currentCardIndex].nextReviewDate ? new Date(deckCards[currentCardIndex].nextReviewDate).toLocaleDateString() : 'N/A'}
                                  | Ease: {deckCards[currentCardIndex].easeFactor?.toFixed(1) ?? 'N/A'}
                                  {hintUsed && <span style={{color: 'orange', fontWeight: 'bold'}}> (Hint Used)</span>}
                             </p>
                         )}
                         {/* Progress Bar */}
                         <div style={{ backgroundColor: '#ddd', height: '10px', borderRadius: '5px', overflow: 'hidden', marginTop: '5px' }}>
                             <div style={{ width: `${((currentCardIndex + 1) / deckCards.length) * 100}%`, height: '100%', backgroundColor: '#2196f3', transition: 'width 0.3s ease' }}></div>
                         </div>
                     </div>
                     <div style={keyboardHintStyle}>
                        {/* ... */}
                     </div>
                </div>
            )}

             {/* Review Complete Summary */}
             {reviewComplete && (
                 <div style={sectionStyle}>
                    {/* ... stats and reset button ... */}
                 </div>
             )}
        </div>
    );

} // <<< END OF COMPONENT FUNCTION
    useEffect(() => {
        console.log("🔍 Render cycle - videoRef.current is:", videoRef.current);
      });
      
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

        // Inside ReviewFlashcards.jsx component

    // Effect Hook: Acts on recognized gestures stored in currentPrediction state
    useEffect(() => {
        // Define the confidence threshold required to act on a prediction
        const GESTURE_CONFIDENCE_THRESHOLD = 0.85; // Adjust this value as needed (0.0 to 1.0)

        // Guard clauses: Only proceed if...
        // 1. The review session is currently active.
        // 2. The KNN model instance exists.
        // 3. The KNN model has been trained with at least one class.
        if (!reviewActive || !knn || knn.getNumClasses() === 0) {
            return; // Exit if conditions aren't met
        }

        // Destructure the label and confidence from the current prediction state
        const { label, confidence } = currentPrediction;

        // Check if the prediction confidence meets or exceeds the threshold
        if (confidence >= GESTURE_CONFIDENCE_THRESHOLD) {

            // Log the detected gesture and confidence level
            console.log(`Review: Detected gesture "${label}" with high confidence (${confidence.toFixed(2)}). Acting...`);

            // Trigger visual feedback (e.g., button highlight)
            setDetectedGesture(label);
            // Set a timer to clear the visual feedback after a short duration (e.g., 500ms)
            const feedbackTimer = setTimeout(() => setDetectedGesture(null), 500);

            let actionTaken = false; // Flag to track if an action was triggered by this detection

            // Determine which action to take based on the predicted label
            switch (label) {
                case 'yes':
                    // Trigger 'correct' response ONLY if the answer is currently shown
                    if (showAnswer) {
                        console.log(`   Action: Triggering handleResponse('correct')`);
                        handleResponse('correct');
                        actionTaken = true; // Mark that an action was taken
                    } else {
                         console.log(`   Action: 'yes' detected, but answer not shown. No action.`);
                    }
                    break;

                case 'no':
                    // Trigger 'incorrect' response ONLY if the answer is currently shown
                    if (showAnswer) {
                         console.log(`   Action: Triggering handleResponse('incorrect')`);
                        handleResponse('incorrect');
                        actionTaken = true; // Mark that an action was taken
                    } else {
                         console.log(`   Action: 'no' detected, but answer not shown. No action.`);
                    }
                    break;

                case 'hint':
                    // Trigger hint action ONLY if the answer is NOT currently shown
                    if (!showAnswer) {
                         console.log(`   Action: Triggering handleHint()`);
                        handleHint(); // Assuming handleHint doesn't cause immediate loops
                        actionTaken = true; // Mark that an action was taken
                    } else {
                         console.log(`   Action: 'hint' detected, but answer already shown. No action.`);
                    }
                    break;

                // Add cases for other potential gestures ('reveal', 'hard', etc.) if trained
                default:
                     console.log(`   Action: Gesture "${label}" detected, but no action mapped.`);
                    break; // No action for unmapped but recognized gestures
            }

            // --- CRITICAL STEP TO PREVENT RAPID RE-TRIGGERING ---
            // If an action was taken based on this prediction, reset the
            // currentPrediction state immediately. This prevents the same prediction
            // object from triggering the action again on the next component render
            // before a new prediction comes in.
            if (actionTaken) {
                 console.log(`   Resetting currentPrediction state after acting on "${label}".`);
                 setCurrentPrediction({ label: '...', confidence: 0 });
            }

             // Cleanup timer for visual feedback when effect re-runs or component unmounts
             return () => clearTimeout(feedbackTimer);
        }

    // Dependencies for this useEffect hook:
    // It needs to re-run whenever these values change.
    }, [
        reviewActive,           // Is the review session active?
        showAnswer,             // Is the answer currently visible?
        currentPrediction,      // The prediction state itself (label and confidence)
        handleResponse,         // The function to call for correct/incorrect
        handleHint,             // The function to call for hints
        knn,                    // The KNN model instance (to check if ready)
        setDetectedGesture,     // State setter for visual feedback
        setCurrentPrediction    // State setter to reset prediction after action
    ]); // Make sure all used variables/functions from component scope are listed


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
    const reviewVideoStyle = { 
        width: '80%', 
        maxWidth: '200px', 
        border: '1px solid #ccc', 
        display: 'block', 
        margin: '10px auto', 
        backgroundColor: '#333' 
        };
    const predictionStyle = { fontSize: '0.9em', textAlign: 'center', marginTop: '5px', color: '#333', minHeight: '1.2em' };

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
           {/* --- Loading Indicator --- */}
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
            {reviewActive && !isLoadingCards && deckCards.length > 0 && currentCardIndex < deckCards.length && (
                <div style={sectionStyle}>
                    <h4>Card {currentCardIndex + 1} of {deckCards.length}</h4>

                    {/* VVV Add Webcam & Prediction Display VVV */}
                    <div style={{marginBottom: '15px'}}>

                    
                    <video
    ref={videoRefCallback} // <<< *** THIS IS THE MOST IMPORTANT PART ***
    autoPlay
    playsInline
    muted
    style={reviewVideoStyle}
    width="320" // Keep dimensions
    height="240"
    // Event handlers like onError/onStalled are good,
    // onCanPlay is handled inside videoRefCallback in the code we wrote
                            // Add listener for stalls or errors after playback starts
                            onStalled={() => {
                                console.warn("Review: Video stalled.");
                                setIsVideoReady(false); // Consider video not ready if stalled
                            }}
                            onError={(e) => {
                                console.error("Review: Video playback error:", e);
                                setIsVideoReady(false);
                                setWebcamError("Video playback error.");
                            }}
                        ></video>
                         {webcamError && <p style={{color: 'red', textAlign: 'center', fontSize: '0.9em'}}>{webcamError}</p>}
                         {gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.LOADING && <p style={{textAlign: 'center', fontSize: '0.9em'}}>Loading model...</p>}
                         {gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.FAILED && <p style={{color: 'red', textAlign: 'center', fontSize: '0.9em'}}>Model load failed.</p>}
                         {stream && knn && knn.getNumClasses() > 0 && (
                             <p style={predictionStyle}>
                                 Detected: {currentPrediction.label} ({(currentPrediction.confidence * 100).toFixed(1)}%)
                             </p>
                         )}
                         {stream && knn && knn.getNumClasses() === 0 && gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.LOADED && (
                             <p style={{...predictionStyle, color: 'orange'}}>No gestures trained yet!</p>
                         )}
                    </div>
                    {/* ^^^ End Webcam & Prediction Display ^^^ */}
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
                                    <button
                                        onClick={() => handleResponse('correct')}
                                        style={{
                                            ...correctButtonStyle,
                                            // Add conditional styling for feedback
                                            border: detectedGesture === 'yes' ? '3px solid yellow' : correctButtonStyle.border,
                                            transform: detectedGesture === 'yes' ? 'scale(1.05)' : 'none',
                                            transition: 'border 0.1s ease-out, transform 0.1s ease-out' // Smooth transition
                                        }}
                                    >
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

           
        </div>
    );


export default ReviewFlashcards;