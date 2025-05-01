import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as knnClassifier from '@tensorflow-models/knn-classifier';
// VVV Ensure DB imports are present VVV
import { openDB, loadGestureModel, STORE_NAME, GESTURE_MODEL_STORE_NAME, UNASSIGNED_DECK_ID } from './db'; // Assuming V4 DB

import { Deck, Flashcard } from './App'; // Adjust path if needed


interface Stats {
    correct: number;
    incorrect: number;
    hard: number;
    total: number;
}

interface Prediction {
    label: string;
    confidence: number;
}

interface ReviewFlashcardsProps {
    decks: Deck[]; // <-- Use the imported Deck type (id: number)
    // openDB prop is not needed if openDB is imported directly
    setFeedback: (message: string) => void;
}

// Constants
const MIN_BUCKET = 0;
const MAX_BUCKET = 5;
const BUCKET_INTERVALS = [0, 1, 3, 7, 14, 30];
const GESTURE_MODEL_LOADED_STATE = {
    IDLE: 'idle',
    LOADING: 'loading',
    LOADED: 'loaded',
    FAILED: 'failed'
} as const;

type GestureModelLoadState = typeof GESTURE_MODEL_LOADED_STATE[keyof typeof GESTURE_MODEL_LOADED_STATE];
type FeedbackAnimationType = 'correct' | 'hard' | 'incorrect' | null;
type ResponseRating = 'correct' | 'hard' | 'incorrect';

// Component Definition
function ReviewFlashcards({ decks, setFeedback }: ReviewFlashcardsProps) {

    const GESTURE_CONFIDENCE_THRESHOLD = 0.85;
    const [detectedGesture, setDetectedGesture] = useState<string | null>(null);

    // --- State Variables ---
    const [selectedDeckId, setSelectedDeckId] = useState<string>('');
    const [deckCards, setDeckCards] = useState<Flashcard[]>([]);
    const [isLoadingCards, setIsLoadingCards] = useState<boolean>(false);
    const [currentCardIndex, setCurrentCardIndex] = useState<number>(0);
    const [showAnswer, setShowAnswer] = useState<boolean>(false);
    const [reviewActive, setReviewActive] = useState<boolean>(false);
    const [reviewComplete, setReviewComplete] = useState<boolean>(false);
    const [stats, setStats] = useState<Stats>({ correct: 0, incorrect: 0, hard: 0, total: 0 });
    const [sessionLimit, setSessionLimit] = useState<number>(20);
    const [feedbackAnimation, setFeedbackAnimation] = useState<FeedbackAnimationType>(null);
    const [hintUsed, setHintUsed] = useState<boolean>(false);
    const [hintText, setHintText] = useState<string>('');
    // Add with other state
    const [isVideoReady, setIsVideoReady] = useState<boolean>(false);
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

    // --- State/Refs for Webcam and TFJS ---
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [videoReady, setVideoReady] = useState<boolean>(false);
    const [webcamError, setWebcamError] = useState<string>('');
    const [knn, setKnn] = useState<knnClassifier.KNNClassifier | null>(null);
    const [mobilenetModel, setMobilenetModel] = useState<mobilenet.MobileNet | null>(null);
    const [gestureModelLoadState, setGestureModelLoadState] = useState<GestureModelLoadState>(GESTURE_MODEL_LOADED_STATE.IDLE);
    const [loadedClassCounts, setLoadedClassCounts] = useState<Record<string, number>>({});
    const predictionIntervalRef = useRef<number | null>(null);
    const [currentPrediction, setCurrentPrediction] = useState<Prediction>({ label: '...', confidence: 0 });

    // --- Load Models (MobileNet & KNN Data) ---
    const loadModelsAndData = useCallback(async () => {
        if (gestureModelLoadState !== GESTURE_MODEL_LOADED_STATE.IDLE) return;
        setGestureModelLoadState(GESTURE_MODEL_LOADED_STATE.LOADING);
        console.log("Review: Loading models...");
        setFeedback("Loading recognition models...");

        let knnInstance: knnClassifier.KNNClassifier | null = null;

        try {
            const mobilenetLoadPromise = mobilenet.load();
            knnInstance = knnClassifier.create();
            setKnn(knnInstance);
            console.log("Review: KNN Classifier created.");

            // Load saved KNN data into the instance
            const loadedCounts = await loadGestureModel(knnInstance);
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
            setFeedback(`Error loading models: ${error instanceof Error ? error.message : String(error)}`);
            setGestureModelLoadState(GESTURE_MODEL_LOADED_STATE.FAILED);
            setMobilenetModel(null);
            setKnn(null);
        }
    }, [gestureModelLoadState, setFeedback]);

    // Load models when component first mounts
    useEffect(() => {
        loadModelsAndData();
    }, [loadModelsAndData]);

    // --- Webcam Control Functions ---
    const startWebcam = useCallback(async (): Promise<MediaStream | null> => {
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
            setStream(mediaStream);
            return mediaStream;
        } catch (err) {
            console.error("❌ Webcam error:", err);
            setWebcamError(`Webcam error: ${err instanceof Error ? err.message : String(err)}`);
            setStream(null);
            return null;
        }
    }, []);

    // --- useEffect to connect stream if video already exists ---
    useEffect(() => {
        if (stream && videoElement) {
            console.log(`>>> useEffect[stream, videoElement]: Attaching stream ${stream.id} to video element. Current srcObject:`, videoElement.srcObject);
            if (videoElement.srcObject !== stream) {
                videoElement.srcObject = stream;
                videoElement.play().catch(e => console.error(">>> useEffect[stream, videoElement]: Video play() failed:", e));
            }
        } else if (!stream && videoElement && videoElement.srcObject) {
            console.log(">>> useEffect[stream, videoElement]: Stream is null, clearing srcObject.");
            videoElement.srcObject = null;
        }
        console.log(`>>> useEffect[stream, videoElement] check: stream=${!!stream}, videoElement=${!!videoElement}`);
    }, [stream, videoElement]);

    const stopWebcam = useCallback(() => {
        // Stop prediction interval first
        if (predictionIntervalRef.current) {
            clearInterval(predictionIntervalRef.current);
            predictionIntervalRef.current = null;
            console.log("Review: Stopped prediction loop.");
        }
        if (stream) {
            console.log("Review: Stopping webcam.");
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        }
        setCurrentPrediction({ label: '...', confidence: 0 });
    }, [stream]);

    // --- Cleanup Webcam on Unmount ---
    useEffect(() => {
        return () => {
            stopWebcam();
        };
    }, [stopWebcam]);

    const videoRefCallback = useCallback((node: HTMLVideoElement | null) => {
        // Log entry point
        console.log(`Review: videoRefCallback called. Node: ${node ? 'Exists' : 'Null'}`);

        if (node) { // Node is MOUNTED
            // Log node received
            console.log(">>> videoRefCallback: Node received, setting videoElement state.", node);
            // Set videoElement state
            setVideoElement(node);

            // --- Attach Event Listeners Directly to the Node ---
            node.oncanplay = () => {
                console.log(">>> videoRefCallback: onCanPlay event fired on node <<<");
                setIsVideoReady(true);
            };
            node.onerror = (e) => {
                console.error("Video Error in Callback Ref:", e);
                setIsVideoReady(false);
            };
            node.onstalled = () => {
                console.warn("Video Stalled in Callback Ref");
                setIsVideoReady(false);
            };

            // --- Attempt to attach stream IF stream is ready when node mounts ---
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

            // Clear states
            setVideoElement(null);
            setIsVideoReady(false);
        }
    }, [stream]);

    // Fetch cards for the selected deck
    const fetchCardsForDeck = useCallback(async (deckId: string) => { // Accepts string ID from state/select
        setIsLoadingCards(true);
        setFeedback('Loading cards...');
        setDeckCards([]); // Clear previous cards
        setReviewActive(false); // Ensure review isn't active while loading
        setReviewComplete(false);
    
        // --- 1. Validate and Parse Deck ID ---
        let numericDeckId: number | undefined;
        if (deckId && deckId !== String(UNASSIGNED_DECK_ID)) { // Handle potential "unassigned" selection if needed
            numericDeckId = parseInt(deckId, 10);
            if (isNaN(numericDeckId)) {
                const errorMsg = `Error: Invalid deck ID selected ("${deckId}"). Please select a valid deck.`;
                console.error(errorMsg);
                setFeedback(errorMsg);
                setIsLoadingCards(false);
                return; // Stop execution if ID is invalid
            }
        } else {
            // If deckId is empty or represents "unassigned", perhaps fetch unassigned cards?
            // For now, we assume a valid numeric ID is required to fetch for *review*.
            // If you want to review unassigned cards, the query below needs adjustment (e.g., index.getAll(null)).
            // Let's assume for review, a specific deck ID (number) is needed.
             setFeedback('Please select a specific deck to review.');
             setIsLoadingCards(false);
             return;
        }
    
        console.log(`ReviewFlashcards: Fetching cards for numeric Deck ID: ${numericDeckId}`);
    
        try {
            // --- 2. Access IndexedDB ---
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            // Ensure 'deckIdIndex' exists on the STORE_NAME object store in your db setup
            const index = store.index('deckIdIndex');
    
            // --- 3. Query Cards by Numeric Deck ID ---
            // getAll() retrieves all records matching the key (numericDeckId)
            const request = index.getAll(numericDeckId);
    
            // Using event handlers as IndexedDB API is event-driven
            request.onsuccess = () => {
                // Result should be Flashcard[] matching the imported type
                const allCards: Flashcard[] = request.result || [];
                console.log(`ReviewFlashcards: Found ${allCards.length} total cards in deck ${numericDeckId}. Filtering for review...`);
    
                const now = new Date();
                // Reset time to midnight for consistent day comparison
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
                // --- 4. Filter Cards Based on SRS Logic ---
                const cardsForReview = allCards.filter(card => {
                    // Default bucket to 0 if undefined/null or outside valid range for SRS calculation
                    const bucket = (card.bucket !== undefined && card.bucket !== null && card.bucket >= MIN_BUCKET && card.bucket <= MAX_BUCKET)
                        ? Number(card.bucket)
                        : MIN_BUCKET; // Default to minimum bucket (e.g., 0)
    
                    // Debug logging for each card's review status
                    // console.log(`  -> Filtering Card ID: ${card.id}, Front: "${card.front.substring(0, 20)}...", Bucket: ${bucket}, LastReviewed: ${card.lastReviewed || 'Never'}`);
    
                    // a) Handle cards never reviewed
                    if (card.lastReviewed === undefined || card.lastReviewed === null) {
                        // console.log(`    - Including Card ID ${card.id}: Never reviewed.`);
                        return true; // Always review cards that haven't been reviewed yet
                    }
    
                    // b) Handle cards that have been reviewed
                    try {
                        const lastReviewDate = new Date(card.lastReviewed);
                        // Check if the date string was valid
                        if (isNaN(lastReviewDate.getTime())) {
                            console.warn(`    - Including Card ID ${card.id}: Invalid date format in lastReviewed ("${card.lastReviewed}"). Treating as due.`);
                            return true; // Include if date is invalid, treat as due
                        }
    
                        // Reset last review time to midnight for day comparison
                        const lastReviewDay = new Date(lastReviewDate.getFullYear(), lastReviewDate.getMonth(), lastReviewDate.getDate());
    
                        // Calculate the difference in time (milliseconds) and convert to full days
                        const timeDiff = today.getTime() - lastReviewDay.getTime();
                        const daysSinceReview = Math.floor(timeDiff / (1000 * 60 * 60 * 24)); // Use floor for whole days
    
                        // Get the required interval based on the card's current bucket
                        const requiredInterval = BUCKET_INTERVALS[bucket] ?? BUCKET_INTERVALS[BUCKET_INTERVALS.length - 1]; // Use max interval if bucket out of range? Or 0?
    
                        const isDue = daysSinceReview >= requiredInterval;
    
                        // Debug the calculation
                        // console.log(`    - Card ID ${card.id}: Days since review: ${daysSinceReview}, Required interval for bucket ${bucket}: ${requiredInterval}, isDue: ${isDue}`);
    
                        return isDue;
    
                    } catch (e) {
                        console.error(`    - Error processing date for card ID ${card.id}:`, e);
                        console.warn(`    - Including Card ID ${card.id} due to date processing error. Treating as due.`);
                        return true; // Include card if date processing fails, to be safe
                    }
                });
    
                console.log(`ReviewFlashcards: Found ${cardsForReview.length} cards ready for review after filtering.`);
    
                // --- 5. Shuffle and Limit Cards for Session ---
                // Shuffle the cards ready for review
                const shuffledCards = [...cardsForReview].sort(() => Math.random() - 0.5);
    
                // Apply session limit if set (and > 0)
                let cardsForSession = shuffledCards;
                const limit = parseInt(sessionLimit.toString(), 10); // Ensure it's a number
                if (limit > 0 && shuffledCards.length > limit) {
                    cardsForSession = shuffledCards.slice(0, limit);
                    setFeedback(`Showing ${limit} of ${shuffledCards.length} due cards from this deck.`);
                } else if (shuffledCards.length > 0) {
                    setFeedback(`Reviewing ${shuffledCards.length} due cards from this deck.`);
                } else {
                    setFeedback('No cards currently due for review in this deck.');
                }
    
                // --- 6. Update Component State ---
                setDeckCards(cardsForSession); // cardsForSession is Flashcard[]
                setStats({ correct: 0, incorrect: 0, hard: 0, total: cardsForSession.length });
                setCurrentCardIndex(0);
                setShowAnswer(false);
                setHintUsed(false);
                setHintText('');
                // Only set reviewActive if there are cards to review
                setReviewActive(cardsForSession.length > 0);
                setReviewComplete(cardsForSession.length === 0); // Mark complete if no cards found
            };
    
            request.onerror = (e) => {
                const target = e.target as IDBRequest;
                const errorMsg = `Error fetching cards: ${target.error?.message || 'Unknown DB error'}`;
                console.error(errorMsg, target.error);
                setFeedback(errorMsg);
                // Don't set loading false here, finally block will handle it
            };
    
            transaction.oncomplete = () => {
                console.log("ReviewFlashcards: Fetch cards transaction complete.");
                // Loading state handled in finally
            };
    
            transaction.onerror = (e) => {
                const target = e.target as IDBTransaction;
                const errorMsg = `Transaction error fetching cards: ${target.error?.message || 'Unknown DB transaction error'}`;
                console.error(errorMsg, target.error);
                // Remove the check for the 'feedback' variable.
                // Just set the transaction error feedback. If request.onerror already fired,
                // this might overwrite it, but transaction errors are important too.
                setFeedback(errorMsg);
                // Loading state handled in finally block
            };
    
        } catch (err: any) {
            const errorMsg = `Database error during card fetch: ${err.message || String(err)}`;
            console.error(errorMsg, err);
            setFeedback(errorMsg);
        } finally {
            // --- 7. Reset Loading State ---
            // Ensures loading is set to false regardless of success or failure
            setIsLoadingCards(false);
            console.log("ReviewFlashcards: fetchCardsForDeck finished.");
        }
    // Dependencies for useCallback: sessionLimit influences the logic, setFeedback is used.
    // Other state setters (setDeckCards, setStats etc.) are stable from useState. openDB should be stable.
    }, [sessionLimit, setFeedback]);

    // Start the review session
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
            setFeedback('Models not loaded or no gestures trained yet.');
            console.warn("Review start blocked: Models not ready or not trained.");
            return;
        }

        setReviewComplete(false);
        setReviewActive(true);
        setFeedback('Starting webcam...');
        stopWebcam();

        // --- Start webcam immediately ---
        const streamStarted = await startWebcam();

        if (!streamStarted) {
            console.error("Review: Webcam failed to start in handleStartReview.");
        } else {
            console.log("Review: Webcam started successfully in handleStartReview. Component should re-render with stream.");
            await fetchCardsForDeck(selectedDeckId);
        }
    };

    // Inside ReviewFlashcards.tsx -> runPrediction useCallback
    // Inside ReviewFlashcards.tsx component

    const runPrediction = useCallback(async () => {
        // --- 1. Guard Clauses: Check Prerequisites ---
        if (
            !videoElement ||
            !isVideoReady ||
            videoElement.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA ||
            !knn ||
            !mobilenetModel ||
            knn.getNumClasses() === 0 ||
            !stream
        ) {
            return; // Exit if prerequisites are not met
        }
    
        // Declare logits variable outside try block so it's accessible in finally
        let logits: tf.Tensor | null = null; // Still okay to type outer variable as potentially null
    
        try {
            // --- 2. Tensor Creation and Inference - Return Tensor | undefined from tf.tidy ---
            // Assign the result returned by tf.tidy. It will be tf.Tensor | undefined.
            const tidyResult = tf.tidy(() => {
                // a) Get image frame from video element
                const frameTensor = tf.browser.fromPixels(videoElement);
    
                // b) Validate frameTensor
                // Check for null/undefined/disposed state
                if (!frameTensor || frameTensor.isDisposed) {
                    console.error("Prediction Error inside tidy: frameTensor is invalid or disposed.");
                     // Explicitly dispose just in case, though tidy should handle it on exit
                     if (frameTensor && !frameTensor.isDisposed) tf.dispose(frameTensor);
                    // VVVV CHANGE HERE: Implicitly return undefined instead of null VVVV
                    return; // Exit the tidy callback; tf.tidy will return undefined
                }
    
                // c) Infer logits using the valid frameTensor
                const resultLogits = mobilenetModel.infer(frameTensor, true);
    
                // frameTensor will be disposed automatically by tidy here
    
                // Return the Tensor if successful
                return resultLogits;
            }); // End of tf.tidy scope
    
            // --- 3. Assign and Validate Logits Tensor ---
            // Assign the result (Tensor | undefined) to our outer variable
            logits = tidyResult ?? null; // Use nullish coalescing to assign null if tidyResult was undefined
    
            // Check if logits is null (meaning frameTensor failed inside tidy)
            if (!logits) {
                console.error("Prediction Error: Logits are null (likely frameTensor issue inside tidy).");
                setCurrentPrediction({ label: 'Error', confidence: 0 });
                // logits is already null, no need to dispose
                return; // Exit if logits are invalid
            }
    
            // Double-check if the tensor is disposed (less likely but for safety)
            // At this point, TypeScript knows logits is a tf.Tensor, so .isDisposed is valid
            if (logits.isDisposed) {
                 console.error("Prediction Error: Logits tensor was disposed unexpectedly.");
                 setCurrentPrediction({ label: 'Error', confidence: 0 });
                 // No need to dispose again if already disposed
                 return; // Exit
            }
    
            // --- 4. Perform KNN Prediction ---
            // Logits is now a valid, non-disposed Tensor
            const k = 3; // Number of neighbors
            const result = await knn.predictClass(logits, k);
    
            // --- 5. Process Prediction Result ---
            if (result?.label && result.confidences && typeof result.confidences === 'object') {
                const confidenceScore = result.confidences[result.label] ?? 0;
                setCurrentPrediction({
                    label: result.label,
                    confidence: confidenceScore
                });
            } else {
                console.warn("KNN prediction did not return the expected structure:", result);
                setCurrentPrediction({ label: 'Unknown', confidence: 0 });
            }
    
        } catch (error) {
            // --- 6. Catch Errors ---
            console.error("Error occurred during prediction execution:", error);
            setCurrentPrediction({ label: 'Error', confidence: 0 });
    
        } finally {
            // --- 7. Tensor Cleanup ---
            // Clean up the logits tensor IF it exists AND is not already disposed.
            if (logits && !logits.isDisposed) {
                tf.dispose(logits);
                // console.log("Disposed logits tensor."); // Optional log
            }
        }
    // --- 8. useCallback Dependencies ---
    }, [
        videoElement,
        isVideoReady,
        knn,
        mobilenetModel,
        stream,
        setCurrentPrediction
    ]); // End of useCallback

    // --- Effect to Start/Stop Prediction Loop ---
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
            predictionIntervalRef.current = window.setInterval(runPrediction, 200); // Adjust interval (200ms = 5fps)
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
    const generateHint = (answerText: string): string => {
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
    const handleResponse = async (rating: ResponseRating) => {
        // --- 1. Guard Clauses: Check Review State ---
        if (!reviewActive || currentCardIndex >= deckCards.length) {
            console.warn("handleResponse called when review not active or finished.");
            return; // Exit if review isn't active or no card is present
        }
    
        // --- 2. Get Current Card and Validate ID ---
        const currentCard = deckCards[currentCardIndex]; // Type is Flashcard
        if (currentCard.id === undefined) {
            // This should ideally not happen for cards being reviewed if fetched correctly
            console.error("Critical Error: Attempting to handle response for a card without an ID.", currentCard);
            setFeedback("Error: Cannot update card state - missing ID.");
            moveToNextCard(); // Still move to the next card to avoid getting stuck
            return;
        }
        const currentCardId = currentCard.id; // Now guaranteed to be a number
    
        // --- 3. Determine Effective Rating (Account for Hint) ---
        const effectiveRating = hintUsed ? 'hard' : rating; // If hint was used, treat as "hard" for SRS
    
        // --- 4. Trigger Visual Feedback ---
        setFeedbackAnimation(rating); // Show visual feedback based on actual button/gesture intent
    
        // --- 5. Update Session Statistics ---
        setStats(prev => ({
            ...prev,
            correct: prev.correct + (rating === 'correct' ? 1 : 0),
            hard: prev.hard + (rating === 'hard' ? 1 : 0),
            incorrect: prev.incorrect + (rating === 'incorrect' ? 1 : 0)
            // total remains the same
        }));
    
        // --- 6. Update Card in IndexedDB ---
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
    
            // Use a Promise to handle the async nature of DB get/put within handleResponse
            await new Promise<void>((resolve, reject) => {
                // Get the latest version of the card from DB to ensure we have the correct current bucket
                const getRequest = store.get(currentCardId); // Use the numeric ID
    
                getRequest.onsuccess = (event) => {
                    const target = event.target as IDBRequest;
                    const cardFromDb = target.result as Flashcard | undefined; // Card from DB might be undefined
    
                    if (!cardFromDb) {
                        // Card wasn't found in the DB, which is unexpected here
                        console.error(`Error: Card with ID ${currentCardId} not found in DB during update.`);
                        setFeedback(`Error: Card ${currentCardId} not found in DB.`);
                        reject(new Error(`Card ${currentCardId} not found in DB`)); // Reject the promise
                        return;
                    }
    
                    // --- Calculate SRS Bucket ---
                    // Safely get old bucket, default to MIN_BUCKET if invalid/missing
                    let oldBucket = (cardFromDb.bucket !== undefined && cardFromDb.bucket !== null && cardFromDb.bucket >= MIN_BUCKET && cardFromDb.bucket <= MAX_BUCKET)
                        ? Number(cardFromDb.bucket)
                        : MIN_BUCKET;
    
                    let newBucket;
                    switch (effectiveRating) {
                        case 'correct':
                            newBucket = Math.min(MAX_BUCKET, oldBucket + 1);
                            break;
                        case 'hard':
                            // Example: decrease by 1, but not below MIN_BUCKET
                            newBucket = Math.max(MIN_BUCKET, oldBucket - 1);
                            break;
                        case 'incorrect':
                        default:
                            newBucket = MIN_BUCKET; // Reset to the lowest bucket
                            break;
                    }
    
                    // --- Prepare Updated Card Data ---
                    const updatedCardData: Flashcard = {
                        ...cardFromDb, // Spread the latest data from DB
                        bucket: newBucket,
                        lastReviewed: new Date().toISOString() // Set review timestamp
                        // id remains cardFromDb.id (which matches currentCardId)
                    };
    
                    // --- Put Updated Card Back into DB ---
                    const putRequest = store.put(updatedCardData);
    
                    putRequest.onsuccess = () => {
                        console.log(`ReviewFlashcards: Card ${currentCardId} updated. Old Bucket: ${oldBucket}, New Bucket: ${newBucket}, Rating: ${rating} (Effective: ${effectiveRating})`);
                        resolve(); // Resolve the promise on successful update
                    };
    
                    putRequest.onerror = (e) => {
                        const target = e.target as IDBRequest;
                        const errorMsg = `Error saving updated card ${currentCardId}: ${target.error?.message || 'Unknown DB error'}`;
                        console.error(errorMsg, target.error);
                        setFeedback(errorMsg);
                        reject(target.error || new Error(errorMsg)); // Reject on put error
                    };
                }; // end getRequest.onsuccess
    
                getRequest.onerror = (e) => {
                    const target = e.target as IDBRequest;
                    const errorMsg = `Error retrieving card ${currentCardId} for update: ${target.error?.message || 'Unknown DB error'}`;
                    console.error(errorMsg, target.error);
                    setFeedback(errorMsg);
                    reject(target.error || new Error(errorMsg)); // Reject on get error
                };
    
                // Transaction error handler (less likely to be the primary source here if get/put fail)
                transaction.onerror = (e) => {
                    const target = e.target as IDBTransaction;
                    const errorMsg = `DB Transaction error during card update: ${target.error?.message || 'Unknown DB transaction error'}`;
                    console.error(errorMsg, target.error);
                    setFeedback(errorMsg);
                    reject(target.error || new Error(errorMsg));
                };
    
                transaction.oncomplete = () => {
                     console.log(`ReviewFlashcards: Card update transaction for ID ${currentCardId} complete.`);
                     // Promise should have already resolved via putRequest.onsuccess
                };
    
            }); // End of await new Promise
    
            // --- 7. Move to Next Card (After DB attempt completes) ---
            // This runs if the Promise resolved (DB update succeeded)
            console.log(`ReviewFlashcards: DB update for card ${currentCardId} successful, moving to next card.`);
            moveToNextCard();
    
        } catch (err) {
            // This catches errors from await openDB() or promise rejections from DB operations
            console.error(`ReviewFlashcards: Error during handleResponse DB operations for card ${currentCardId}:`, err);
            // Feedback should have been set by the specific onerror handler that rejected
            // Still try to move to the next card even if DB update failed,
            // otherwise the user gets stuck. The error feedback is already set.
            console.log(`ReviewFlashcards: DB update for card ${currentCardId} failed, but moving to next card anyway.`);
            moveToNextCard();
        } finally {
            // --- 8. Reset Visual Feedback (Delayed slightly) ---
            // Clear animation slightly after moving to next card feels smoother
            // Or clear it immediately in moveToNextCard - depends on desired effect
            // setTimeout(() => setFeedbackAnimation(null), 100); // Optional delay
        }
    };

    // Move to the next card or end review
    const moveToNextCard = () => {
        const nextIndex = currentCardIndex + 1; // Calculate index of the next card

        // Check if the next index is beyond the available cards in the current deck/session
        if (nextIndex >= deckCards.length) {
            // --- End of Review Session ---
            console.log("Review complete. No more cards in this session.");
            setReviewComplete(true); // Mark the review as complete
            setReviewActive(false);  // Mark the review session as inactive
                                     // (This will trigger useEffect to stop webcam/prediction loop)
            setFeedback('Review session completed!'); // Provide user feedback
        } else {
            // --- Move to the Next Card ---
            console.log(`Moving from card index ${currentCardIndex} to ${nextIndex}`);
            setCurrentCardIndex(nextIndex); // Update the index state to show the next card

            // Reset states specific to the card being displayed:
            setShowAnswer(false);      // Hide the answer for the new card
            setHintUsed(false);        // Reset hint usage status for the new card
            setHintText('');           // Clear any hint text shown for the previous card
            // (Feedback is usually set by handleResponse/handleHint)
        }

        // --- Reset Visual Feedback ---
        // Clear any visual feedback animation (like background color flash)
        // regardless of whether moving to next card or completing the review.
        setFeedbackAnimation(null);
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
    
useEffect(() => {
    if (!reviewActive) return; // Only listen when review is active

    const handleKeyDown = (e: KeyboardEvent) => {
        // Ignore keyboard input if focus is inside an input/textarea (e.g., session limit)
        if (e.target instanceof HTMLElement && 
            (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
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
}, [reviewActive, showAnswer, handleHint, handleResponse]); // Updated dependencies

// Gesture recognition effect hook
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

// Dependencies for this useEffect hook
}, [
    reviewActive,           // Is the review session active?
    showAnswer,             // Is the answer currently visible?
    currentPrediction,      // The prediction state itself (label and confidence)
    handleResponse,         // The function to call for correct/incorrect
    handleHint,             // The function to call for hints
    knn,                    // The KNN model instance (to check if ready)
    setDetectedGesture,     // State setter for visual feedback
    setCurrentPrediction    // State setter to reset prediction after action
]);

// --- Styles ---
const containerStyle: React.CSSProperties = { padding: '15px' };
const sectionStyle: React.CSSProperties = { padding: '15px', border: '1px solid #eee', borderRadius: '4px', marginBottom: '15px' };
const controlsStyle: React.CSSProperties = {
    marginTop: '20px',
    display: 'flex',
    justifyContent: 'center', // Center buttons
    flexWrap: 'wrap', // Allow wrapping on small screens
    gap: '10px'
};
const buttonStyle: React.CSSProperties = { padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', border: '1px solid #ccc' };
const correctButtonStyle: React.CSSProperties = { ...buttonStyle, backgroundColor: '#4caf50', color: 'white', borderColor: '#388e3c' };
const hardButtonStyle: React.CSSProperties = { ...buttonStyle, backgroundColor: '#ff9800', color: 'white', borderColor: '#f57c00' }; // Orange for Hard
const incorrectButtonStyle: React.CSSProperties = { ...buttonStyle, backgroundColor: '#f44336', color: 'white', borderColor: '#d32f2f' };
const hintButtonStyle: React.CSSProperties = {...buttonStyle, backgroundColor: '#2196f3', color: 'white', borderColor: '#1976d2'};
const showAnswerButtonStyle: React.CSSProperties = {...buttonStyle, backgroundColor: '#673ab7', color: 'white', borderColor: '#512da8'};
const statsStyle: React.CSSProperties = {
    marginTop: '20px',
    padding: '10px',
    backgroundColor: '#f0f0f0', // Neutral background
    borderRadius: '4px',
    textAlign: 'center',
    border: '1px solid #ddd'
};
const keyboardHintStyle: React.CSSProperties = {
    fontSize: '0.8em',
    color: '#666',
    textAlign: 'center',
    marginTop: '15px', // Increased margin
    lineHeight: '1.4'
};
const hintStyle: React.CSSProperties = {
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
const getCardStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
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
const reviewVideoStyle: React.CSSProperties = { 
    width: '80%', 
    maxWidth: '200px', 
    border: '1px solid #ccc', 
    display: 'block', 
    margin: '10px auto', 
    backgroundColor: '#333' 
};
const predictionStyle: React.CSSProperties = { fontSize: '0.9em', textAlign: 'center', marginTop: '5px', color: '#333', minHeight: '1.2em' };

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
                    value={selectedDeckId} // Controlled component: value is string from state
                    onChange={(e) => setSelectedDeckId(e.target.value)} // Sets string state
                    style={{ width: '100%', padding: '8px', marginBottom: '15px', border: '1px solid #ccc', borderRadius: '3px' }}
                    disabled={isLoadingCards || gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.LOADING}
                >
                    <option value="">-- Select a Deck --</option>
                    {/* Use decks prop (Deck[] where id is number) */}
                    {decks.map(deck => (
                         // Use deck.id (number) for the value; React handles conversion
                        <option key={deck.id} value={String(deck.id)}>
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
                    disabled={isLoadingCards || gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.LOADING}
                />

                {/* Display Model Loading State */}
                 {gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.LOADING && <p style={{textAlign: 'center', fontStyle: 'italic', color: '#555'}}>Loading recognition models...</p>}
                 {gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.FAILED && <p style={{textAlign: 'center', color: 'red'}}>Failed to load recognition models.</p>}

                <button
                    onClick={handleStartReview}
                    disabled={
                        !selectedDeckId ||
                        isLoadingCards ||
                        gestureModelLoadState !== GESTURE_MODEL_LOADED_STATE.LOADED ||
                        !knn || // <-- Check if knn is null/undefined first
                        knn.getNumClasses() === 0 // <-- Only check getNumClasses if knn exists (due to short-circuiting)
                    }
                    style={{ ...buttonStyle, backgroundColor: '#1976d2', color: 'white', width: '100%' }} // Primary action color
                    title={
                        !selectedDeckId ? "Select a deck first" :
                        isLoadingCards ? "Loading cards..." :
                        gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.LOADING ? "Models loading..." :
                        gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.FAILED ? "Models failed to load" :
                        (knn && knn.getNumClasses() === 0) ? "No gestures trained yet (Train in Settings)" :
                        "Start Review"
                     }
                >
                    {isLoadingCards ? 'Loading...' : 'Start Review Session'}
                </button>
                 {(gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.LOADED && knn && knn.getNumClasses() === 0) && (
                    <p style={{fontSize: '0.8em', color: 'orange', textAlign: 'center', marginTop: '5px'}}>
                        Note: No gestures trained yet. Train gestures in Settings.
                    </p>
                 )}
            </div>
        )}

        {/* --- Review Session Active --- */}
        {reviewActive && !isLoadingCards && deckCards.length > 0 && currentCardIndex < deckCards.length && (
            <div style={sectionStyle}>
                <h4>Card {currentCardIndex + 1} of {deckCards.length}</h4>

                {/* --- Webcam & Prediction Display --- */}
                <div style={{marginBottom: '15px'}}>
                    <video
                        ref={videoRefCallback} // Use the callback ref
                        autoPlay
                        playsInline
                        muted
                        style={reviewVideoStyle}
                        width="320" // Explicit width/height attributes recommended
                        height="240"
                        // Event listeners attached via callback ref or useEffect
                    ></video>
                    {webcamError && <p style={{color: 'red', textAlign: 'center', fontSize: '0.9em'}}>{webcamError}</p>}
                    {/* Only show prediction info if webcam is active and model is ready */}
                    {stream && knn && knn.getNumClasses() > 0 && gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.LOADED && (
                        <p style={predictionStyle}>
                             {/* Display current prediction */}
                            Detected: {currentPrediction.label} ({(currentPrediction.confidence * 100).toFixed(1)}%)
                        </p>
                    )}
                    {/* Message if model loaded but no gestures trained */}
                    {stream && knn && knn.getNumClasses() === 0 && gestureModelLoadState === GESTURE_MODEL_LOADED_STATE.LOADED && (
                        <p style={{...predictionStyle, color: 'orange'}}>No gestures trained yet!</p>
                    )}
                </div>
                {/* --- End Webcam & Prediction Display --- */}

                {/* --- Card Display Area --- */}
                <div style={getCardStyle()}>
                    {/* Front / Question */}
                    <div style={{ marginBottom: showAnswer ? '20px' : '0', width: '100%' }}> {/* Add space if answer is shown */}
                        <h5 style={{marginTop: 0, marginBottom: '10px', color: '#555'}}>Question:</h5>
                        <p style={{ fontSize: '1.2em', fontWeight: 'bold', margin: 0 }}>{deckCards[currentCardIndex].front}</p>
                    </div>

                    {/* Hint Display (if available and used) */}
                    {hintText && !showAnswer && (
                        <div style={hintStyle}>
                            <p style={{margin: 0}}><strong>Hint:</strong> {hintText}</p>
                        </div>
                    )}

                    {/* Answer Section (Conditional) */}
                    {showAnswer && (
                        <div style={{ borderTop: '1px dashed #ccc', paddingTop: '20px', width: '100%' }}>
                            <h5 style={{marginTop: 0, marginBottom: '10px', color: '#555'}}>Answer:</h5>
                            <p style={{ fontSize: '1.2em', margin: 0 }}>{deckCards[currentCardIndex].back}</p>

                            {/* Notes Display */}
                            {deckCards[currentCardIndex].notes && (
                                <div style={{ marginTop: '15px', fontSize: '0.9em', color: '#555', textAlign: 'left', background: '#eee', padding: '5px 10px', borderRadius: '3px', whiteSpace: 'pre-wrap' }}>
                                    <strong>Notes:</strong> {deckCards[currentCardIndex].notes}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                {/* --- End Card Display Area --- */}


                {/* --- Controls --- */}
                <div style={controlsStyle}>
                    {!showAnswer ? (
                        <>
                            <button onClick={handleHint} style={hintButtonStyle} disabled={hintUsed}>
                                {hintUsed ? 'Hint Used' : 'Get Hint (H)'}
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
                                    // Add conditional styling for gesture feedback
                                    border: detectedGesture === 'yes' ? '3px solid yellow' : correctButtonStyle.border,
                                    transform: detectedGesture === 'yes' ? 'scale(1.05)' : 'none',
                                    transition: 'border 0.1s ease-out, transform 0.1s ease-out'
                                }}
                            >
                                Correct (1 / →)
                            </button>
                            <button
                                onClick={() => handleResponse('hard')}
                                style={{
                                     ...hardButtonStyle,
                                     // Add conditional styling for gesture feedback (if 'hard' gesture exists)
                                     // border: detectedGesture === 'hard' ? '3px solid yellow' : hardButtonStyle.border,
                                     // transform: detectedGesture === 'hard' ? 'scale(1.05)' : 'none',
                                     // transition: 'border 0.1s ease-out, transform 0.1s ease-out'
                                }}
                            >
                                Hard (2 / ↓)
                            </button>
                            <button
                                onClick={() => handleResponse('incorrect')}
                                style={{
                                    ...incorrectButtonStyle,
                                     // Add conditional styling for gesture feedback
                                    border: detectedGesture === 'no' ? '3px solid yellow' : incorrectButtonStyle.border,
                                    transform: detectedGesture === 'no' ? 'scale(1.05)' : 'none',
                                    transition: 'border 0.1s ease-out, transform 0.1s ease-out'
                                }}
                            >
                                Incorrect (3 / ←)
                            </button>
                        </>
                    )}
                </div>
                {/* --- End Controls --- */}


                {/* --- Progress Information & Keyboard Hints --- */}
                <div style={{ marginTop: '15px', textAlign: 'center', fontSize: '0.9em', color: '#555' }}>
                     {/* Display current bucket safely */}
                    <p style={{ margin: '0 0 5px 0' }}>
                        Current Bucket: {deckCards[currentCardIndex]?.bucket !== undefined ? deckCards[currentCardIndex].bucket : 'N/A'}
                        {hintUsed && <span style={{color: 'orange', fontWeight: 'bold'}}> (Hint Used - Counts as 'Hard')</span>}
                    </p>
                    {/* Progress Bar */}
                    {deckCards.length > 0 && ( // Avoid division by zero
                        <div style={{ backgroundColor: '#ddd', height: '10px', borderRadius: '5px', overflow: 'hidden', marginTop: '5px' }}>
                            <div style={{ width: `${((currentCardIndex + 1) / deckCards.length) * 100}%`, height: '100%', backgroundColor: '#2196f3', transition: 'width 0.3s ease' }}></div>
                        </div>
                    )}
                </div>
                <div style={keyboardHintStyle}>
                    {!showAnswer ? 'Press H for hint or Space to show answer.' : 'Use Arrows (→ Correct, ↓ Hard, ← Incorrect) or Numbers (1, 2, 3).'}
                </div>
                {/* --- End Progress --- */}

            </div>
        )} {/* End Review Session Active */}


        {/* --- Review Complete Summary --- */}
        {reviewComplete && (
            <div style={sectionStyle}>
                <h3 style={{ textAlign: 'center' }}>Review Session Complete!</h3>
                 {/* Display stats only if total is greater than 0 */}
                {(stats.correct + stats.hard + stats.incorrect) > 0 ? (
                    <div style={statsStyle}>
                        <h4>Session Statistics</h4>
                        <p>Total Cards Reviewed: {stats.correct + stats.hard + stats.incorrect}</p>
                        <p style={{color: 'green'}}>Correct: {stats.correct} ({stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0}%)</p>
                        <p style={{color: 'orange'}}>Hard (or Hint Used): {stats.hard}</p>
                        <p style={{color: 'red'}}>Incorrect: {stats.incorrect}</p>
                    </div>
                ) : (
                    <p style={{textAlign: 'center', marginTop: '15px'}}>No cards were reviewed in this session.</p>
                )}
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <button
                        onClick={handleResetReview} // Reuse reset function
                        style={{ ...buttonStyle, backgroundColor: '#1976d2', color: 'white', width: '100%' }}
                    >
                        Review Another Deck / Start Over
                    </button>
                </div>
            </div>
        )} {/* End Review Complete Summary */}


        {/* --- No Cards Available Message (after selection and fetch attempt) --- */}
        {!reviewActive && !reviewComplete && !isLoadingCards && selectedDeckId && deckCards.length === 0 && (
            <div style={sectionStyle}>
                <p style={{textAlign: 'center'}}>No cards are currently due for review in the selected deck ('{decks.find(d => String(d.id) === selectedDeckId)?.name || selectedDeckId}').</p>
                 <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <button
                        onClick={handleResetReview} // Allow resetting to choose another deck
                        style={{ ...buttonStyle, backgroundColor: '#aaa', color: 'white' }}
                    >
                        Choose Different Deck
                    </button>
                </div>
            </div>
        )}

    </div> // End main container div
); // End component return
}
export default ReviewFlashcards;