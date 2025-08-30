import { PhysicsGameDemo } from './components/PhysicsGameDemo';
import './App.css';

function App() {
  // Use the pose landmarker model from MediaPipe
  const modelPath = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

  return (
    <div className="App">
      <PhysicsGameDemo modelPath={modelPath} />
    </div>
  );
}

export default App;