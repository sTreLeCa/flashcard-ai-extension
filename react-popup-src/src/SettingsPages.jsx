// react-popup-src/src/SettingsPage.jsx
import React, { useState, useEffect, useRef } from 'react';

function SettingsPage() {
    // --- Webcam State & Ref (Moved here) ---
    const videoRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [webcamError, setWebcamError] = useState('');

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

    const stopWebcam = () => {
        if (stream) {
            console.log("Settings: Stopping webcam.");
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
            if (videoRef.current) { videoRef.current.srcObject = null; }
        }
    };

    // --- Cleanup webcam on component unmount ---
    useEffect(() => {
        // Stop webcam when the SettingsPage component unmounts
        return () => {
            stopWebcam();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stream]); // Effect depends on stream to know if cleanup is needed


    // Styles
    const sectionStyle = { padding: '10px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #eee' };
    const videoStyle = { width: '100%', maxWidth: '300px', border: '1px solid black', display: 'block', margin: '5px auto', backgroundColor: '#333' };

    return (
        <div>
            <h2>Settings & Gesture Training</h2>

            {/* Webcam Section */}
            <div style={sectionStyle}>
                <h4>Webcam Feed</h4>
                {webcamError && <p style={{color: 'red'}}>{webcamError}</p>}
                <video ref={videoRef} autoPlay playsInline muted style={videoStyle}>
                     Webcam stream not available.
                </video>
                <div style={{marginTop: '10px', display: 'flex', gap: '10px', justifyContent: 'center'}}>
                    {!stream ? (
                        <button onClick={startWebcam}>Start Webcam</button>
                    ) : (
                        <button onClick={stopWebcam}>Stop Webcam</button>
                    )}
                </div>
                {!stream && <p style={{fontSize: '0.8em', textAlign:'center', color:'#666'}}>Allow camera access to train gestures.</p>}
            </div>

            {/* Gesture Training Sections (Placeholders) */}
            <div style={sectionStyle}>
                <h4>Train Actions</h4>
                {/* Only enable training if webcam is active */}
                {!stream && <p style={{textAlign:'center', color: 'orange'}}>Start webcam to enable training.</p>}

                <div style={{ marginBottom: '15px', opacity: stream ? 1 : 0.5 }}>
                    <h5>Action: Yes / Correct</h5>
                    <p style={{fontSize: '0.9em'}}>Show the 'Yes' gesture/object clearly to the camera.</p>
                    {/* TODO: Add TFJS model loading and training button/logic */}
                    <button disabled={!stream}>Start Training 'Yes'</button>
                    <p style={{fontSize: '0.8em', color: '#666'}}>(Needs X samples)</p>
                </div>

                <div style={{ marginBottom: '15px', opacity: stream ? 1 : 0.5 }}>
                    <h5>Action: No / Incorrect</h5>
                    <p style={{fontSize: '0.9em'}}>Show the 'No' gesture/object clearly.</p>
                    <button disabled={!stream}>Start Training 'No'</button>
                     <p style={{fontSize: '0.8em', color: '#666'}}>(Needs X samples)</p>
               </div>

                <div style={{ marginBottom: '15px', opacity: stream ? 1 : 0.5 }}>
                    <h5>Action: Hard / Hint</h5>
                    <p style={{fontSize: '0.9em'}}>Show the 'Hard/Hint' gesture/object clearly.</p>
                    <button disabled={!stream}>Start Training 'Hard/Hint'</button>
                     <p style={{fontSize: '0.8em', color: '#666'}}>(Needs X samples)</p>
               </div>

               {/* Add 'Reveal Answer' training later if needed */}

               {/* Area to show trained models/clear data later */}
               {/* <div><h5>Trained Models: ... </h5></div> */}

            </div>

        </div>
    );
}

export default SettingsPage;