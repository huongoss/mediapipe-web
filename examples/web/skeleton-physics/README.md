# Live Human Skeleton Physics Demo

A cutting-edge demonstration of real-time human pose tracking with physics simulation, built using MediaPipe, Three.js, and Rapier3D. This demo showcases a **separated architecture** that cleanly divides skeleton detection, rendering, and physics systems - perfect for building complex interactive games and applications.

## 🚀 Features

- **Live Human Skeleton Tracking**: Real-time pose detection using MediaPipe Pose Landmarker
- **Separated Architecture**: Modular design with distinct providers, renderers, and physics systems
- **3D Physics Simulation**: Realistic physics using Rapier3D physics engine
- **Interactive Game Elements**: Physics objects that can interact with the skeleton
- **Two Rendering Modes**: 
  - Visualization Mode: Pure skeleton visualization
  - Physics Mode: Physics-driven skeleton with interactive objects
- **Extensible Design**: Easy to build complex games on top of this foundation

## 🏗️ Architecture

The demo is built with a clean separation of concerns:

### 1. **SkeletonProvider** (`src/providers/SkeletonProvider.ts`)
- Handles MediaPipe Pose Landmarker initialization and processing
- Provides skeleton data via subscription pattern
- Completely independent of rendering or physics
- Can be used with any visualization system

### 2. **ThreeSkeletonRenderer** (`src/renderers/ThreeSkeletonRenderer.ts`)
- Pure Three.js rendering of skeleton data
- Handles joints, bones, and optional labels
- Provides access to Three.js scene, camera, and renderer
- Can be extended for custom visual effects

### 3. **SkeletonPhysicsSystem** (`src/utils/SkeletonPhysicsSystem.ts`)
- Rapier3D physics simulation for skeleton joints
- Creates physics bodies and constraints for realistic movement
- Allows interaction with other physics objects
- Provides force application and collision detection

### 4. **PhysicsGameDemo** (`src/components/PhysicsGameDemo.tsx`)
- Demonstrates how to combine all components
- Includes a simple ball-hitting game
- Shows both visualization and physics modes
- Example of building games on this architecture

## 🎮 Game Mechanics

- **Visualization Mode**: See your skeleton tracked in real-time with smooth 3D rendering
- **Physics Mode**: Your skeleton becomes a physics object that can hit and interact with balls
- **Scoring System**: Hit balls to make them fall and score points
- **Interactive Objects**: Colorful balls with realistic physics responses
- **Force Application**: Apply random forces to skeleton joints for fun effects

## 🛠️ Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## 📋 Requirements

- **Camera**: Webcam access for live pose detection
- **Modern Browser**: Chrome, Firefox, Safari, or Edge with WebGL support
- **HTTPS**: Required for camera access (automatic in development)

## 🎯 Usage

1. **Start the Demo**: Run `npm run dev` and open the provided URL
2. **Allow Camera Access**: Grant camera permissions when prompted
3. **Start Tracking**: Click "Start Tracking" to begin pose detection
4. **Switch Modes**: Toggle between Visualization and Physics modes
5. **Play the Game**: In Physics mode, move your hands to hit the balls!

## 🔧 Customization

The modular architecture makes it easy to customize and extend:

### Adding New Renderers
```typescript
import { SkeletonData } from './providers/SkeletonProvider';

class CustomRenderer {
  updateSkeleton(data: SkeletonData) {
    // Your custom rendering logic
  }
}

// Subscribe to skeleton updates
skeletonProvider.subscribe((data) => {
  customRenderer.updateSkeleton(data);
});
```

### Creating Physics Games
```typescript
// Add custom physics objects
const { rigidBody } = physicsSystem.addPhysicsObject(
  new THREE.Vector3(0, 1, 0),
  'box',
  new THREE.Vector3(0.2, 0.2, 0.2),
  1.0
);

// Apply forces to skeleton joints
physicsSystem.applyForceToJoint(15, new THREE.Vector3(10, 0, 0)); // Left wrist
```

### Custom Skeleton Processing
```typescript
skeletonProvider.subscribe((skeletonData) => {
  if (skeletonData) {
    // Access individual joints
    const leftWrist = skeletonData.joints[15];
    const rightWrist = skeletonData.joints[16];
    
    // Custom game logic based on joint positions
    if (leftWrist.worldPosition.y > rightWrist.worldPosition.y) {
      // Left hand is higher - trigger some action
    }
  }
});
```

## 🎨 Joint Mapping

The skeleton uses MediaPipe's 33-point pose model:

```
Key Joints:
- 0: Nose
- 11, 12: Left/Right Shoulders  
- 13, 14: Left/Right Elbows
- 15, 16: Left/Right Wrists
- 23, 24: Left/Right Hips
- 25, 26: Left/Right Knees
- 27, 28: Left/Right Ankles
```

## 🔬 Technical Details

- **MediaPipe Pose**: 33 3D landmarks with visibility confidence
- **Three.js**: WebGL-based 3D rendering with shadows and lighting
- **Rapier3D**: High-performance physics simulation with constraints
- **React**: Component-based UI with hooks for state management
- **TypeScript**: Full type safety for robust development

## 🚀 Building Games

This architecture is designed for building sophisticated physics games:

1. **Sports Simulation**: Track athletic movements with realistic physics
2. **Gesture Games**: Detect specific poses and gestures for game actions
3. **Fitness Applications**: Monitor exercise form with physics feedback
4. **AR/VR Integration**: Use skeleton data for immersive experiences
5. **Dance Games**: Track rhythm and movement accuracy

## 🤝 Contributing

The modular design makes it easy to contribute:

- **New Renderers**: Canvas2D, WebGPU, or other rendering backends
- **Physics Extensions**: Soft bodies, advanced constraints, fluid simulation
- **Game Examples**: Sports, fitness, dance, or creative applications
- **Performance Optimizations**: Worker threads, WASM integration

## 📄 License

This project follows the MediaPipe license terms. See the main MediaPipe repository for details.

## 🙏 Acknowledgments

- **MediaPipe Team**: For the excellent pose detection technology
- **Rapier3D**: For the high-performance physics engine  
- **Three.js Community**: For the powerful 3D rendering library