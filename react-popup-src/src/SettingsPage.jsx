// react-popup-src/src/SettingsPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as knnClassifier from '@tensorflow-models/knn-classifier';

const GESTURE_CLASSES = ['yes', 'no', 'hint']; // Add more later like 'reveal' if needed
const REQUIRED_SAMPLES = 15; // Number of samples needed for training
function SettingsPage() {
    // --- Webcam State & Ref ---
    const videoRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [webcamError, setWebcamError] = useState('');

    // --- NEW: TFJS & Training State ---
    const [infoText, setInfoText] = useState('Loading models...'); // User feedback
    const [knn, setKnn] = useState(null); // KNN Classifier instance
    const [mobilenetModel, setMobilenetModel] = useState(null); // MobileNet model instance
    const [trainingClass, setTrainingClass] = useState(null); // Which class are we currently adding samples for?
    const [classExampleCounts, setClassExampleCounts] = useState({}); // e.g., {yes: 0, no: 5, hint: 10}
    const trainingIntervalRef = useRef(null); // Ref to hold setInterval ID for capturing

    // --- Function to Load Models ---
    const loadModels = useCallback(async () => {
        setInfoText('Loading MobileNet...');
        console.log("Loading MobileNet...");
        try {
            // Ensure TFJS backend is ready (WebGL is preferred)
            await tf.ready();
            console.log("TFJS Backend:", tf.getBackend());
            if (tf.getBackend() !== 'webgl') {
                 console.warn("WebGL backend not available, using CPU. Performance may suffer.");
            }

            const mobilenetInstance = await mobilenet.load();
            setMobilenetModel(mobilenetInstance);
            console.log("MobileNet loaded.");

            const knnInstance = knnClassifier.create();
            setKnn(knnInstance);
            console.log("KNN Classifier created.");

            // TODO LATER: Load existing KNN data from IndexedDB if available
            // setClassExampleCounts(loadedCounts); // Update counts from loaded data

            setInfoText('Models loaded. Start webcam to train.');

        } catch (error) {
            console.error("Error loading models:", error);
            setInfoText('Error loading models. Please refresh.');
            setWebcamError('Model loading failed.'); // Use webcam error state for model errors too for now
        }
    }, []); // useCallback because it doesn't depend on changing state/props

    // --- Load models on component mount ---
    useEffect(() => {
        loadModels();
    }, [loadModels]);

    // --- Webcam Control Functions (Moved here) ---
    const startWebcam = async () => {
        setWebcamError('');
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                console.log("Settings: Requesting webcam...");
                const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 } } });
                console.log("Settings: Webcam access granted.");
                setStream(mediaStream);
                if (videoRef.current) { videoRef.current.srcObject = mediaStream; }
            } catch (err) {
                console.error("Settings: Error accessing webcam:", err);
                let errMsg = "Error accessing webcam.";
                if (err.name === "NotAllowedError") { errMsg = "Permission denied."; }
                else if (err.name === "NotFoundError") { errMsg = "No webcam found."; }
                else { errMsg = `Webcam Error: ${err.message}`; }
                setWebcamError(errMsg); setStream(null);
            }
        } else { setWebcamError("Webcam access not supported."); setStream(null); }
    };

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

    const addTrainingSample = useCallback(async (classId) => {
        if (!mobilenetModel || !knn || !videoRef.current || videoRef.current.readyState < 3) {
            console.warn("Models or video not ready for training sample.");
            return; // Exit if models/video aren't ready
        }
         // Ensure video dimensions are available
         if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
            console.warn("Video dimensions not available yet.");
            return;
        }

        try {
            // Get image data from video element into a tensor
            const img = tf.browser.fromPixels(videoRef.current);
            // Get intermediate activation from MobileNet (the features)
            const logits = mobilenetModel.infer(img, true);
            // Add example to KNN classifier
            knn.addExample(logits, classId);
            // Update sample counts
            setClassExampleCounts(prevCounts => ({
                ...prevCounts,
                [classId]: (prevCounts[classId] || 0) + 1
            }));
            // Dispose tensors to free memory
            img.dispose();
            logits.dispose();
        } catch (error) {
            console.error("Error adding training sample:", error);
            setInfoText(`Error during sample capture: ${error.message}`);
        }

    }, [knn, mobilenetModel]);

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
    const saveModel = async () => {
         if (!knn || Object.keys(classExampleCounts).length === 0) {
              setInfoText("No training data to save.");
              return;
         }
         setInfoText("Saving model data...");
         // Get dataset from KNN
         const dataset = knn.getClassifierDataset();
         // Convert dataset tensors to plain objects/arrays for IndexedDB
         const serializableDataset = {};
         Object.entries(dataset).forEach(([classIndex, data]) => {
             // data is a Tensor, convert its data to a regular array
             let dataAsArray = Array.from(data.dataSync());
             serializableDataset[classIndex] = { data: dataAsArray, shape: data.shape };
             data.dispose(); // Dispose tensor after getting data
         });
         console.log("Serializable KNN dataset:", serializableDataset);

         // --- Save to IndexedDB (Needs DB logic) ---
         try {
              const db = await openDB(); // Need openDB from App or Manage? Refactor needed!
              const transaction = db.transaction('gestureModel', 'readwrite'); // Assumes 'gestureModel' store exists
              const store = transaction.objectStore('gestureModel');
              // Use a fixed key (e.g., 1) to always overwrite the saved model data
               const putRequest = store.put({ id: 1, dataset: serializableDataset, classCounts: classExampleCounts });
               putRequest.onsuccess = () => { setInfoText("Model saved successfully!"); console.log("Model saved to IndexedDB"); };
               putRequest.onerror = (e) => { setInfoText(`Error saving model: ${e.target.error?.message}`); console.error("Error saving model:", e.target.error); };
               transaction.onerror = (e) => { setInfoText(`Save Tx Error: ${e.target.error?.message}`); console.error("Save Tx Error:", e.target.error); };
         } catch (err) {
              setInfoText(`DB Error saving model: ${err.message}`); console.error("DB Error saving model", err);
         }
         // --- End Save Logic ---
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
                    <button onClick={saveModel} disabled={Object.keys(classExampleCounts).length === 0 || trainingClass !== null}>
                       Save Trained Gestures
                    </button>
                    {/* TODO LATER: Add Load / Clear Buttons */}
               </div>

            </div>
        </div>
    );
}

export default SettingsPage;