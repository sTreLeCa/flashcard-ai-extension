import React, { useState, useEffect, useRef, useCallback } from 'react';
// VVV ENSURE THESE ARE PRESENT VVV
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as knnClassifier from '@tensorflow-models/knn-classifier';
import { openDB, saveGestureModel, loadGestureModel } from './db.js';

const GESTURE_CLASSES = ['yes', 'no', 'hint']; // Add more later like 'reveal' if needed
const REQUIRED_SAMPLES = 15; // Number of samples needed for training
function SettingsPage() {
    // --- Webcam State & Ref ---
    const videoRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [webcamError, setWebcamError] = useState('');
    const [videoReady, setVideoReady] = useState(false);
    // --- NEW: TFJS & Training State ---
    const [infoText, setInfoText] = useState('Loading models...'); // User feedback
    const [knn, setKnn] = useState(null); // KNN Classifier instance
    const [mobilenetModel, setMobilenetModel] = useState(null); // MobileNet model instance
    const [trainingClass, setTrainingClass] = useState(null); // Which class are we currently adding samples for?
    const [classExampleCounts, setClassExampleCounts] = useState({}); // e.g., {yes: 0, no: 5, hint: 10}
    const trainingIntervalRef = useRef(null); // Ref to hold setInterval ID for capturing
    const [isSavingModel, setIsSavingModel] = useState(false);

    


    // --- Function to Load Models ---
    const loadModel = useCallback(async (knnInstance) => {
        if (!knnInstance) {
             console.warn("loadModel called without KNN instance.");
             return {}; // Return empty object if no instance
        };
        setInfoText("Checking for saved gestures...");
        console.log("SettingsPage: Calling loadGestureModel util...");
        try {
            // Call the imported function from db.js
            const loadedCounts = await loadGestureModel(knnInstance);
            if (loadedCounts && Object.keys(loadedCounts).length > 0) {
                console.log("SettingsPage: Loaded counts received:", loadedCounts);
                setClassExampleCounts(loadedCounts); // <<< UPDATE STATE HERE
                setInfoText("Saved gestures loaded. Ready to train more or review.");
            } else {
                console.log("SettingsPage: No saved gesture data found or loaded.");
                setInfoText("No saved gestures found. Ready to train.");
                setClassExampleCounts({}); // Ensure counts are reset if nothing loaded
            }
            return loadedCounts || {}; // Return counts
        } catch (err) {
            console.error("SettingsPage: Error loading model via db util:", err);
            setInfoText(`Error loading gestures: ${err.message}`);
            setClassExampleCounts({}); // Reset counts on error
            return {}; // Return empty counts on error
        }
    }, [setClassExampleCounts, setInfoText]) // useCallback because it doesn't depend on changing state/props

    // --- Load models on component mount ---
    useEffect(() => {
        let isMounted = true;
        console.log("SettingsPage: Mount effect - Loading models...");
        setInfoText('Loading recognition models...');

        const initializeModels = async () => {
            let knnInstance = null;
            try {
                await tf.ready();
                console.log("SettingsPage: TFJS Backend:", tf.getBackend());
                const mobilenetInstance = await mobilenet.load();
                 if (!isMounted) return; // Check after await
                setMobilenetModel(mobilenetInstance);
                console.log("SettingsPage: MobileNet loaded.");

                knnInstance = knnClassifier.create();
                 if (!isMounted) return;
                setKnn(knnInstance);
                console.log("SettingsPage: KNN Classifier created.");

                // Now attempt to load saved data *after* KNN is created
                 if (knnInstance && isMounted) {
                    await loadModel(knnInstance); // Wait for loading attempt
                 }

            } catch (error) {
                console.error("SettingsPage: Error loading models:", error);
                 if (isMounted) {
                    setInfoText('Error loading models. Please refresh.');
                    setWebcamError('Model loading failed.');
                 }
            } finally {
                 if (isMounted && !infoText.startsWith('Error')) { // Avoid overwriting error message
                      // Info text should be set by loadModel now
                     // setInfoText('Models ready. Start webcam to train.');
                 }
            }
        };

        initializeModels();

         return () => { isMounted = false; console.log("SettingsPage: Unmounting.") }

    }, [loadModel]);

    // --- Webcam Control Functions (Moved here) ---
    const startWebcam = useCallback(async () => {
        setWebcamError('');
        setVideoReady(false); // Reset readiness state
    
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                console.log("Review: Requesting webcam...");
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 320 },
                        height: { ideal: 240 },
                        facingMode: 'user'
                    }
                });
    
                console.log("Review: Webcam stream obtained:", mediaStream.id);
                setStream(mediaStream);
    
                // 🔥 Attach stream directly to video element here
                if (videoRef.current) {
                    console.log("Review: Attaching stream to videoRef.");
                    videoRef.current.srcObject = mediaStream;
    
                    try {
                        await videoRef.current.play();
                        console.log("Review: videoRef.play() succeeded.");
                        setVideoReady(true);
                    } catch (e) {
                        console.error("Review: videoRef.play() failed:", e);
                        setWebcamError(`Playback error: ${e.message}`);
                    }
                } else {
                    console.warn("Review: videoRef.current is null — DOM may not be ready.");
                }
    
                return mediaStream;
            } catch (err) {
                console.error("Review: Webcam access error:", err);
                let errMsg = "Webcam Error";
                if (err.name === "NotAllowedError") errMsg = "Webcam permission denied.";
                else if (err.name === "NotFoundError") errMsg = "No webcam found.";
                else errMsg = `Webcam Error: ${err.message}`;
                setWebcamError(errMsg);
                setStream(null);
                return null;
            }
        } else {
            setWebcamError("Webcam access not supported in this browser.");
            setStream(null);
            return null;
        }
    }, []);
    

    const stopWebcam = useCallback(() => { // Make useCallback if needed elsewhere
        // Stop training interval if webcam stops
        if (trainingIntervalRef.current) {
            clearInterval(trainingIntervalRef.current);
            trainingIntervalRef.current = null;
            setTrainingClass(null); // Stop training mode
        }
        if (stream) {
             console.log("Settings: Stopping webcam.");
             stream.getTracks().forEach(track => track.stop());
             setStream(null);
             if (videoRef.current) { videoRef.current.srcObject = null; }
        }
    }, [stream]);

    // --- Cleanup webcam on component unmount ---
    useEffect(() => { return () => { stopWebcam(); }; }, [stopWebcam]);// Effect depends on stream to know if cleanup is needed


    // Inside SettingsPage.jsx
const addTrainingSample = useCallback(async (classId) => {
    if (!mobilenetModel || !knn || !videoRef.current || videoRef.current.readyState < 3) {
        console.warn("Models or video not ready for training sample.");
        return;
    }
    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
        console.warn("Video dimensions not available yet.");
        return;
    }

    let img = null; // Declare outside try
    let logits = null;

    try {
        // Use tf.tidy to handle the temporary 'img' tensor
        logits = tf.tidy(() => {
            img = tf.browser.fromPixels(videoRef.current);
            return mobilenetModel.infer(img, true); // Return logits to keep it
        });

        // *** CRITICAL: DO NOT DISPOSE logits here ***
        // Pass the valid logits tensor directly to addExample.
        // The KNN library is responsible for handling this tensor internally.
        knn.addExample(logits, classId);

        // Update sample counts (this is fine)
        setClassExampleCounts(prevCounts => ({
            ...prevCounts,
            [classId]: (prevCounts[classId] || 0) + 1
        }));

        // Let logits be disposed later, perhaps when the component unmounts
        // or if explicitly cleared. For now, we let KNN manage it.
        // If you find memory leaks LATER, you might need to manage disposal
        // more carefully, potentially by cloning before addExample, but
        // try this simpler approach first.

    } catch (error) {
        console.error("Error adding training sample:", error);
        setInfoText(`Error during sample capture: ${error.message}`);
        // Dispose tensors if an error occurred before addExample
        if (img && !img.isDisposed) tf.dispose(img); // Should be handled by tidy
        if (logits && !logits.isDisposed) tf.dispose(logits);
    }
    // No finally block needed if tidy handles intermediate tensors

}, [knn, mobilenetModel, setClassExampleCounts, setInfoText]); // Add dependencies

    const startTraining = (classId) => {
        if (!stream || trainingIntervalRef.current) return; // Need webcam, don't start if already training
        console.log(`Starting training for: ${classId}`);
        setTrainingClass(classId);
        setInfoText(`Adding samples for "${classId}"... Hold gesture/object steady!`);

        // Capture samples repeatedly every X milliseconds
         trainingIntervalRef.current = setInterval(() => {
            addTrainingSample(classId);
        }, 100); // Capture 10 samples per second
    };

    const stopTraining = () => {
         if (trainingIntervalRef.current) {
             console.log("Stopping training interval.");
             clearInterval(trainingIntervalRef.current);
             trainingIntervalRef.current = null;
         }
         const currentClass = trainingClass; // Get class before clearing state
         setTrainingClass(null);
         setInfoText(`Stopped training for "${currentClass}". Add more or train another action.`);
          // TODO LATER: Trigger saving KNN data to IndexedDB after stopping? Or have separate save button?
    };

    // TODO LATER: Function to save KNN dataset to IndexedDB
   // Replace the ENTIRE existing saveModel function body with this:
const saveModel = async () => {
    // Prevent re-entry if already saving
    if (isSavingModel) {
        console.log("SettingsPage: Already saving model, skipping.");
        return;
    }
    if (!knn || knn.getNumClasses() === 0) {
         setInfoText("No training data recorded yet to save.");
         setTimeout(() => setInfoText(''), 2000);
         return;
    }

    setIsSavingModel(true); // <<< SET SAVING FLAG
    setInfoText("Saving model data...");
    console.log("SettingsPage: Calling imported saveGestureModel from db.js...");

    try {
         // Call the imported function from db.js
         await saveGestureModel(knn, classExampleCounts); // <<< THE ACTUAL CALL
         setInfoText("Gestures saved successfully!");
         setTimeout(() => setInfoText(''), 2000); // Clear feedback on success
    } catch (err) {
         // Handle errors thrown by the saveGestureModel utility
         setInfoText(`Error saving model: ${err.message}`);
         console.error("SettingsPage: Error saving model via db util:", err);
         // Feedback will remain showing the error
    } finally {
         setIsSavingModel(false); // <<< UNSET SAVING FLAG (in finally)
    }
};




    // Styles
    const sectionStyle = { padding: '10px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #eee' };
    const videoStyle = { width: '100%', maxWidth: '300px', border: '1px solid black', display: 'block', margin: '5px auto', backgroundColor: '#333' };

    return (
        <div style={{ padding: '0 10px 10px 10px' }}>
            <h2 style={{marginTop: 0}}>Settings & Gesture Training</h2>
             {/* Info text area */}
             <p style={{ minHeight: '1.5em', textAlign: 'center', fontWeight: 'bold', color: infoText.startsWith('Error') ? 'red' : 'inherit' }}>
                 {infoText}
             </p>

            {/* Webcam Section */}
            <div style={sectionStyle}>
                <h4 style={{marginTop: 0}}>Webcam Feed</h4>
                {webcamError && <p style={{color: 'red'}}>{webcamError}</p>}
                <video ref={videoRef} autoPlay playsInline muted style={videoStyle} />
                <div style={{marginTop: '10px', display: 'flex', gap: '10px', justifyContent: 'center'}}>
                    {/* Disable start if models haven't loaded */}
                    {!stream ? (
                        <button onClick={startWebcam} disabled={!mobilenetModel || !knn}>Start Webcam</button>
                    ) : (
                        <button onClick={stopWebcam}>Stop Webcam</button>
                    )}
                </div>
                {!stream && mobilenetModel && knn && <p style={{fontSize: '0.8em', textAlign:'center', color:'#666', marginTop: '5px'}}>Camera needed to train gestures.</p>}
            </div>

            {/* Gesture Training Sections */}
            <div style={sectionStyle}>
                <h4 style={{marginTop: 0}}>Train Actions</h4>
                {!stream && <p style={{textAlign:'center', color: 'orange'}}>Start webcam to enable training.</p>}

                {GESTURE_CLASSES.map(className => (
                    <div key={className} style={{ marginBottom: '15px', padding: '10px', border: trainingClass === className ? '2px solid blue' : '1px solid #eee', borderRadius:'4px', opacity: stream ? 1 : 0.5 }}>
                         {/* Capitalize class name for display */}
                         <h5 style={{marginTop: 0, marginBottom: '5px'}}>Action: {className.charAt(0).toUpperCase() + className.slice(1)}</h5>
                         <p style={{fontSize: '0.9em', margin: '0 0 8px 0'}}>Show the '{className}' gesture/object clearly.</p>
                         {/* VVV Training Buttons VVV */}
                         {trainingClass !== className ? (
                             <button onClick={() => startTraining(className)} disabled={!stream || !knn || !mobilenetModel || trainingClass !== null}>
                                 Start Training '{className}'
                             </button>
                         ) : (
                             <button onClick={stopTraining} style={{backgroundColor: '#ffc107'}}>
                                 Stop Training '{className}'
                             </button>
                         )}
                          {/* VVV Display Sample Count VVV */}
                         <p style={{fontSize: '0.8em', color: '#666', margin: '5px 0 0 0'}}>
                             Samples: {classExampleCounts[className] || 0} / {REQUIRED_SAMPLES}
                         </p>
                    </div>
                ))}

               {/* VVV Add Save Button VVV */}
               <div style={{marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '10px', textAlign: 'center'}}>
                    <button onClick={saveModel} disabled={Object.keys(classExampleCounts).length === 0 
                        || trainingClass !== null || isSavingModel}>
                        {isSavingModel ? 'Saving...' : 'Save Trained Gestures'} {/* Show saving text */}
                     </button>
                     {/* TODO LATER: Add Load / Clear Buttons */}
                </div>

            </div>
        </div>
    );
}

export default SettingsPage;