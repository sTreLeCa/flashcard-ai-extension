// react-popup-src/src/ReviewFlashcards.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
// VVV Ensure TFJS imports are present VVV
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as knnClassifier from '@tensorflow-models/knn-classifier';
// VVV Ensure DB imports are present VVV
import { openDB, loadGestureModel, STORE_NAME, GESTURE_MODEL_STORE_NAME, UNASSIGNED_DECK_ID } from './db.js'; // Assuming V4 DB


// Constants
const MIN_BUCKET = 0; /* ... */ const MAX_BUCKET = 5; /* ... */ const BUCKET_INTERVALS = [0, 1, 3, 7, 14, 30];
const GESTURE_MODEL_LOADED_STATE = { IDLE: 'idle', LOADING: 'loading', LOADED: 'loaded', FAILED: 'failed' };

// Component Definition
function ReviewFlashcards({ decks, setFeedback }) { // Use setFeedback prop from App

    const GESTURE_CONFIDENCE_THRESHOLD = 0.85;
    const [detectedGesture, setDetectedGesture] = useState(null);

    // --- State Variables ---
    // Keep existing review state...
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
    // Add with other state
    const [isVideoReady, setIsVideoReady] = useState(false);

// Add with other state
const [videoElement, setVideoElement] = useState(null);
    // --- State/Refs for Webcam and TFJS (Copied/Adapted from SettingsPage) ---
    const videoRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [videoReady, setVideoReady] = useState(false);
    const [webcamError, setWebcamError] = useState('');
    // <<< ADD
    const [knn, setKnn] = useState(null); // <<< ADD
    const [mobilenetModel, setMobilenetModel] = useState(null); // <<< ADD
    const [gestureModelLoadState, setGestureModelLoadState] = useState(GESTURE_MODEL_LOADED_STATE.IDLE); // <<< ADD
    const [loadedClassCounts, setLoadedClassCounts] = useState({}); // <<< ADD (To know if model is trained)
    const predictionIntervalRef = useRef(null); // <<< ADD
    const [currentPrediction, setCurrentPrediction] = useState({ label: '...', confidence: 0 }); // <<< ADD

    // --- Load Models (MobileNet & KNN) ---
        // --- Load Models (MobileNet & KNN Data) ---
        const loadModelsAndData = useCallback(async () => {
            if (gestureModelLoadState !== GESTURE_MODEL_LOADED_STATE.IDLE) return;
            setGestureModelLoadState(GESTURE_MODEL_LOADED_STATE.LOADING);
            console.log("Review: Loading models...");
            setFeedback("Loading recognition models..."); // Update shared feedback
    
            let knnInstance = null; // Temporary instance
    
            try {
                // console.log("Attempting to set TFJS backend to CPU...");
                // await tf.setBackend('cpu');
                // await tf.ready(); // Wait for backend to be ready
                // console.log(">>> Review: TFJS Backend explicitly set to:", tf.getBackend());
                const mobilenetLoadPromise = mobilenet.load(); // Start loading mobilenet
                knnInstance = knnClassifier.create(); // Create KNN instance
                setKnn(knnInstance); // Set state early
                console.log("Review: KNN Classifier created.");
    
                // Load saved KNN data into the instance
                const loadedCounts = await loadGestureModel(knnInstance); // Call imported function
                setLoadedClassCounts(loadedCounts || {});
                console.log("Review: KNN Classifier data loaded. Counts:", loadedCounts);
    
                // Wait for mobilenet to finish loading
                const mobilenetInstance = await mobilenetLoadPromise;
                setMobilenetModel(mobilenetInstance);
                console.log("Review: MobileNet loaded.");
    
                setGestureModelLoadState(GESTURE_MODEL_LOADED_STATE.LOADED);
                setFeedback("Recognition models ready.");
                setTimeout(() => setFeedback(''), 1500);
    
            } catch (error) {
                console.error("Review: Error loading models/data:", error);
                setFeedback(`Error loading models: ${error.message}`);
                setGestureModelLoadState(GESTURE_MODEL_LOADED_STATE.FAILED);
                setMobilenetModel(null); setKnn(null); // Reset on failure
            }
        }, [gestureModelLoadState, setFeedback]); // Dependencies
    
        // Load models when component first mounts
        useEffect(() => {
            loadModelsAndData();
        }, [loadModelsAndData]); // Run once

    // --- Webcam Control Functions ---
        // --- Webcam Control Functions ---
        const startWebcam = useCallback(async () => {
            setWebcamError('');
            setVideoReady(false);
        
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 320 },
                        height: { ideal: 240 },
                        facingMode: 'user'
                    }
                });
                console.log("🎥 Webcam access granted:", mediaStream.id);
         setStream(mediaStream); // Set stream state triggers re-render
         return mediaStream;
            } catch (err) {
                console.error("❌ Webcam error:", err);
                setWebcamError(`Webcam error: ${err.message}`);
                setStream(null);
                return null; // <<< RETURN NULL on failure
            }
        }, []);
        
        

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

    // Handle user response to a card (Correct, Hard, Incorrect)
    const handleResponse = async (rating) => { // rating: 'correct', 'hard', 'incorrect'
        if (!reviewActive || currentCardIndex >= deckCards.length) return;

        const effectiveRating = hintUsed ? 'hard' : rating; // If hint was used, treat response as "hard" (less severe than incorrect)

        // Show visual feedback animation based on the *button pressed*, not effective rating
        setFeedbackAnimation(rating);
        setTimeout(async () => {
            const webcamStream = await startWebcam();
            
            if (webcamStream) {
                console.log("Review: Webcam started successfully, loading cards...");
                setFeedback('Loading cards...');
                fetchCardsForDeck(selectedDeckId);
            } else {
                console.error("Review: Webcam failed to start:", webcamError);
                setFeedback(`Webcam error: ${webcamError || 'Could not start webcam.'}`);
            }
        }, 400); // was 100ms
         // Clear animation

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
        console.log("ReviewFlashcards: Resetting review.");
        stopWebcam(); // <<< Ensure webcam stops on reset
        // setSelectedDeckId(''); // Optionally reset deck selection
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
        setIsLoadingCards(false);
    };
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

    useEffect(() => {
    if (!reviewActive || !knn || knn.getNumClasses() === 0) return;
    const { label, confidence } = currentPrediction;

    if (confidence >= GESTURE_CONFIDENCE_THRESHOLD) {
        console.log(`Review: Detected gesture "${label}" with confidence ${confidence}. Acting...`);
        setDetectedGesture(label); // <<< Set the detected gesture state
        setTimeout(() => setDetectedGesture(null), 500);
    
            // Actions triggered based on label
            switch (label) {
                case 'yes':
                    if (showAnswer) { // Only trigger response if answer is shown
                        handleResponse('correct');
                        setCurrentPrediction({ label: '...', confidence: 0 }); // Reset prediction after acting
                    }
                    break;
                case 'no':
                     if (showAnswer) { // Only trigger response if answer is shown
                        handleResponse('incorrect');
                         setCurrentPrediction({ label: '...', confidence: 0 }); // Reset prediction after acting
                     }
                    break;
                case 'hint':
                    if (!showAnswer) { // Only trigger hint if answer is NOT shown
                        handleHint();
                        setCurrentPrediction({ label: '...', confidence: 0 }); // Reset prediction after acting
                    }
                    break;
                // Add cases for other gestures if trained (e.g., 'reveal'?)
                default:
                    // Optional: Log if a trained gesture isn't mapped
                    // console.log(`Review: Unmapped gesture detected: ${label}`);
                    break;
            }
        }
        // Add dependencies: reviewActive, showAnswer, currentPrediction, handleResponse, handleHint, knn
    }, [reviewActive, showAnswer, currentPrediction, handleResponse, handleHint, knn]);


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

            {/* --- No Cards Available Message --- */}
            {/* This condition is implicitly handled by the feedback message after fetch now */}
        </div>
    );
}

export default ReviewFlashcards;