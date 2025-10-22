import { PhysicsGameDemo } from './components/PhysicsGameDemo';
import './App.css';

function App() {
  // Use the holistic landmarker model from MediaPipe (latest float16 release)
  const modelPath = "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task";

  return (
    <div className="App">
      <PhysicsGameDemo modelPath={modelPath} />
    </div>
  );
}

export default App;
