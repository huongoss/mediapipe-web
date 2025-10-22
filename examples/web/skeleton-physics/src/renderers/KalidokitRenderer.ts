import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';
import * as Kalidokit from 'kalidokit';
import { SkeletonData, SkeletonJoint, SkeletonProvider } from '../providers/SkeletonProvider';

type RiggedPose = ReturnType<typeof Kalidokit.Pose.solve>;
type RiggedFace = ReturnType<typeof Kalidokit.Face.solve>;

const DEFAULT_MODEL_URL = '/models/29e07830-2317-4b15-a044-135e73c7f840_Ashtra.vrm';

export interface KalidokitRendererOptions {
  modelUrl?: string;
  autoRotate?: boolean;
}

export class KalidokitRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls | null = null;
  private skeletonGroup: THREE.Group;
  private animationId: number | null = null;
  private isRunning = true;
  private vrm: VRM | null = null;
  private clock = new THREE.Clock();
  private resizeHandler: (() => void) | null = null;
  private targetGroupX = 0;
  private followXSmoothing = 0.2;
  private lastSkeleton: SkeletonData | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private avatarScale = 1.6;
  private skeletonLines: THREE.LineSegments | null = null;
  private skeletonLinePositions: Float32Array | null = null;
  private readonly poseConnections = SkeletonProvider.getPoseConnections();

  constructor(container: HTMLElement | HTMLCanvasElement, options: KalidokitRendererOptions = {}) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x10121c);

    this.skeletonGroup = new THREE.Group();
    this.scene.add(this.skeletonGroup);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 1.4, 3.2);

    this.renderer = new THREE.WebGLRenderer({
      canvas: container instanceof HTMLCanvasElement ? container : undefined,
      antialias: true,
      alpha: false
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    if (!(container instanceof HTMLCanvasElement)) {
      container.appendChild(this.renderer.domElement);
    }

    this.setupLights();
    this.setupEnvironment();
    this.setupControls(options.autoRotate ?? false);
    this.loadVRM(options.modelUrl ?? DEFAULT_MODEL_URL);
    this.createSkeletonLines();

    this.resizeHandler = () => this.handleResize();
    window.addEventListener('resize', this.resizeHandler);

    this.animate();
  }

  setVideoElement(video: HTMLVideoElement | null): void {
    this.videoElement = video;
  }

  updateSkeleton(skeletonData: SkeletonData | null): void {
    this.lastSkeleton = skeletonData;

    if (!skeletonData || !this.vrm) {
      return;
    }

    this.updateGroupOffsetXFromImageSpace(skeletonData.joints);

    const poseLandmarks2D = skeletonData.poseLandmarks2D;
    const poseLandmarks3D = skeletonData.poseLandmarks3D;

    let riggedPose: RiggedPose | null = null;
    if (poseLandmarks3D && poseLandmarks3D.length > 0 && poseLandmarks2D && poseLandmarks2D.length > 0) {
      riggedPose = Kalidokit.Pose.solve(poseLandmarks3D as any, poseLandmarks2D as any, {
        runtime: 'mediapipe',
        enableLegs: true,
        video: this.videoElement ?? undefined
      });
      this.applyPose(riggedPose);
    }

    let riggedFace: RiggedFace | null = null;
    if (skeletonData.faceLandmarks && skeletonData.faceLandmarks.length > 0) {
      riggedFace = Kalidokit.Face.solve(skeletonData.faceLandmarks as any, {
        runtime: 'mediapipe',
        video: this.videoElement ?? undefined
      });
    }

    this.applyHead(riggedFace, riggedPose);
    this.updateSkeletonLines(skeletonData);
  }

  pause(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  resume(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.animate();
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  getSkeletonGroup(): THREE.Group {
    return this.skeletonGroup;
  }

  getBoneWorldSegments(): Array<{ fromId: number; toId: number; start: THREE.Vector3; end: THREE.Vector3 }> {
    if (!this.lastSkeleton) return [];

    const segments: Array<{ fromId: number; toId: number; start: THREE.Vector3; end: THREE.Vector3 }> = [];
    const joints = this.lastSkeleton.joints;
    const scale = this.skeletonGroup.scale.x;
    const offset = this.skeletonGroup.position.clone();

    const toWorldVector = (joint: SkeletonJoint) => {
      const vector = new THREE.Vector3(
        joint.worldPosition.x,
        -joint.worldPosition.y,
        joint.worldPosition.z
      );
      vector.multiplyScalar(scale);
      vector.add(offset);
      return vector;
    };

    for (const [fromId, toId] of this.poseConnections) {
      const fromJoint = joints[fromId];
      const toJoint = joints[toId];
      if (!fromJoint || !toJoint) continue;
      if (fromJoint.visibility < 0.5 || toJoint.visibility < 0.5) continue;

      segments.push({
        fromId,
        toId,
        start: toWorldVector(fromJoint),
        end: toWorldVector(toJoint)
      });
    }

    return segments;
  }

  getBoneRadius(): number {
    return 0.05 * this.skeletonGroup.scale.x;
  }

  dispose(): void {
    this.pause();

    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    if (this.vrm) {
      this.skeletonGroup.remove(this.vrm.scene);
      (this.vrm as unknown as { dispose?: () => void }).dispose?.();
      this.vrm = null;
    }

    if (this.skeletonLines) {
      this.skeletonGroup.remove(this.skeletonLines);
      this.skeletonLines.geometry.dispose();
      (this.skeletonLines.material as THREE.Material).dispose();
      this.skeletonLines = null;
      this.skeletonLinePositions = null;
    }

    this.controls?.dispose();
    this.renderer.dispose();
  }

  private animate(): void {
    if (!this.isRunning) {
      return;
    }

    this.animationId = requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();
    if (this.vrm) {
      this.vrm.update(delta);
    }

    this.renderer.render(this.scene, this.camera);
    this.controls?.update();
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(1, 1.5, 1);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x88aaff, 0.3);
    fillLight.position.set(-2, 1.2, -1);
    this.scene.add(fillLight);
  }

  private setupEnvironment(): void {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.5, 48),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.1, roughness: 0.7 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.85;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const helper = new THREE.GridHelper(4, 16, 0x1f2937, 0x1f2937);
    helper.position.y = -0.85 + 0.001;
    this.scene.add(helper);

    this.skeletonGroup.scale.setScalar(this.avatarScale);
    this.skeletonGroup.position.set(0, -0.9, 0);
  }

  private setupControls(autoRotate: boolean): void {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.9, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.autoRotate = autoRotate;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 6;
    this.controls.maxPolarAngle = Math.PI * 0.75;
    this.controls.minPolarAngle = Math.PI * 0.2;
  }

  private handleResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private loadVRM(url: string): void {
    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));

    loader.load(
      url,
      (gltf) => {
        VRMUtils.removeUnnecessaryJoints(gltf.scene);
        const vrm = gltf.userData.vrm as VRM;

        if (vrm.meta?.metaVersion === '0') {
          VRMUtils.rotateVRM0(vrm);
        }

        vrm.scene.traverse((obj: THREE.Object3D) => {
          obj.frustumCulled = false;
          obj.castShadow = true;
        });

        vrm.scene.position.set(0, 0, 0);
        vrm.scene.rotation.y = Math.PI;

        this.vrm = vrm;
        this.skeletonGroup.add(vrm.scene);
        console.log('✅ VRM model loaded for Kalidokit renderer');
      },
      undefined,
      (error) => {
        console.error('❌ Failed to load VRM model:', error);
      }
    );
  }

  private applyPose(riggedPose: RiggedPose | null): void {
    if (!riggedPose || !this.vrm) return;

    const pose = riggedPose as any;

    if (pose.Hips?.position) {
      const hipsPosition = {
        x: -pose.Hips.position.x,
        y: pose.Hips.position.y + 1.0,
        z: pose.Hips.position.z + 0.1
      };
      this.rigPosition('hips', hipsPosition, 1, 0.07);
    }

    const hipPos = pose.Hips?.position;
    if (pose.Hips?.rotation) {
      const hipsRotation = {
        x: pose.Hips.rotation.x,
        y: pose.Hips.rotation.y + (hipPos?.x ?? 0) * 1.5,
        z: pose.Hips.rotation.z
      };
      this.rigRotation('hips', hipsRotation, 0.7, 0.15);
    }

    this.rigRotation('spine', pose.Spine, 0.25, 0.3);
    this.rigRotation('chest', pose.Spine, 0.35, 0.3);
    this.rigRotation('upperChest', pose.Spine, 0.4, 0.3);

    this.rigRotation('rightUpperLeg', pose.RightUpperLeg, 1, 0.3);
    this.rigRotation('rightLowerLeg', pose.RightLowerLeg, 1, 0.3);
    this.rigRotation('leftUpperLeg', pose.LeftUpperLeg, 1, 0.3);
    this.rigRotation('leftLowerLeg', pose.LeftLowerLeg, 1, 0.3);

    this.rigRotation('rightUpperArm', pose.RightUpperArm, 1, 0.3);
    this.rigRotation('rightLowerArm', pose.RightLowerArm, 1, 0.3);
    this.rigRotation('rightHand', pose.RightHand, 1, 0.3);
    this.rigRotation('leftUpperArm', pose.LeftUpperArm, 1, 0.3);
    this.rigRotation('leftLowerArm', pose.LeftLowerArm, 1, 0.3);
    this.rigRotation('leftHand', pose.LeftHand, 1, 0.3);
  }

  private applyHead(riggedFace: RiggedFace | null, riggedPose: RiggedPose | null): void {
    if (!this.vrm) return;

    const poseFallback = (riggedPose as any) || {};
    const fallback = poseFallback.Head ?? poseFallback.Neck ?? poseFallback.Spine ?? { x: 0, y: 0, z: 0 };
    const headRotation = riggedFace?.head ?? fallback;
    const neckRotation = riggedFace?.head ?? fallback;

    this.rigRotation('neck', neckRotation, 0.7, 0.3);
    this.rigRotation('head', headRotation, 0.9, 0.3);
  }

  private rigRotation(
    boneName: string,
    rotation?: { x?: number; y?: number; z?: number },
    dampener: number = 1,
    lerpAmount: number = 0.3
  ): void {
    if (!rotation || !this.vrm?.humanoid) return;
    const node = this.getHumanoidBone(boneName);
    if (!node) return;

    const euler = new THREE.Euler(
      (rotation.x ?? 0) * dampener,
      (rotation.y ?? 0) * dampener,
      (rotation.z ?? 0) * dampener,
      'XYZ'
    );
    const quaternion = new THREE.Quaternion().setFromEuler(euler);
    node.quaternion.slerp(quaternion, lerpAmount);
  }

  private rigPosition(
    boneName: string,
    position?: { x?: number; y?: number; z?: number },
    dampener: number = 1,
    lerpAmount: number = 0.3
  ): void {
    if (!position || !this.vrm?.humanoid) return;
    const node = this.getHumanoidBone(boneName);
    if (!node) return;

    const target = new THREE.Vector3(
      (position.x ?? 0) * dampener,
      (position.y ?? 0) * dampener,
      -(position.z ?? 0) * dampener
    );

    node.position.lerp(target, lerpAmount);
  }

  private updateGroupOffsetXFromImageSpace(joints: SkeletonJoint[]): void {
    const pickX = (idx: number) => {
      const j = joints[idx];
      if (!j) return null;
      const vis = j.visibility ?? 0;
      if (vis < 0.4) return null;
      const x = j.position?.x;
      if (typeof x !== 'number') return null;
      return x;
    };

    const lHip = pickX(23);
    const rHip = pickX(24);

    let centerX: number | null = null;
    if (lHip !== null && rHip !== null) {
      centerX = (lHip + rHip) * 0.5;
    } else {
      const lSh = pickX(11);
      const rSh = pickX(12);
      if (lSh !== null && rSh !== null) {
        centerX = (lSh + rSh) * 0.5;
      } else {
        const nose = pickX(0);
        if (nose !== null) centerX = nose;
      }
    }

    if (centerX === null) return;

    const mapped = THREE.MathUtils.clamp((centerX - 0.5) * 2, -1, 1);
    this.targetGroupX = mapped;

    const alpha = THREE.MathUtils.clamp(this.followXSmoothing, 0, 1);
    this.skeletonGroup.position.x = THREE.MathUtils.lerp(this.skeletonGroup.position.x, this.targetGroupX, alpha);
  }

  private getHumanoidBone(boneName: string): THREE.Object3D | null {
    if (!this.vrm?.humanoid) return null;
    const humanoid = this.vrm.humanoid as any;
    if (typeof humanoid.getNormalizedBoneNode === 'function') {
      const node = humanoid.getNormalizedBoneNode(boneName);
      if (node) return node;
    }
    if (typeof humanoid.getRawBoneNode === 'function') {
      const node = humanoid.getRawBoneNode(boneName);
      if (node) return node;
    }
    if (typeof humanoid.getBoneNode === 'function') {
      return humanoid.getBoneNode(boneName) ?? null;
    }
    return null;
  }

  private createSkeletonLines(): void {
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x49c1ff, transparent: true, opacity: 0.6 });
    const positionArray = new Float32Array(this.poseConnections.length * 2 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));

    this.skeletonLines = new THREE.LineSegments(geometry, lineMaterial);
    this.skeletonLines.visible = false;
    this.skeletonGroup.add(this.skeletonLines);
    this.skeletonLinePositions = positionArray;
  }

  private updateSkeletonLines(skeletonData: SkeletonData | null): void {
    if (!this.skeletonLines || !this.skeletonLinePositions) return;

    if (!skeletonData) {
      this.skeletonLines.visible = false;
      return;
    }

    const joints = skeletonData.joints;
    const scale = this.skeletonGroup.scale.x;
    const offset = this.skeletonGroup.position;

    let idx = 0;
    let anyVisible = false;
    this.poseConnections.forEach(([from, to]) => {
      const a = joints[from];
      const b = joints[to];
      if (!a || !b || a.visibility < 0.45 || b.visibility < 0.45) {
        this.skeletonLinePositions![idx++] = Number.NaN;
        this.skeletonLinePositions![idx++] = Number.NaN;
        this.skeletonLinePositions![idx++] = Number.NaN;
        this.skeletonLinePositions![idx++] = Number.NaN;
        this.skeletonLinePositions![idx++] = Number.NaN;
        this.skeletonLinePositions![idx++] = Number.NaN;
        return;
      }

      const ax = a.worldPosition.x * scale + offset.x;
      const ay = -a.worldPosition.y * scale + offset.y;
      const az = a.worldPosition.z * scale + offset.z;

      const bx = b.worldPosition.x * scale + offset.x;
      const by = -b.worldPosition.y * scale + offset.y;
      const bz = b.worldPosition.z * scale + offset.z;

      this.skeletonLinePositions![idx++] = ax;
      this.skeletonLinePositions![idx++] = ay;
      this.skeletonLinePositions![idx++] = az;
      this.skeletonLinePositions![idx++] = bx;
      this.skeletonLinePositions![idx++] = by;
      this.skeletonLinePositions![idx++] = bz;
      anyVisible = true;
    });

    const positionAttr = this.skeletonLines.geometry.getAttribute('position');
    positionAttr.needsUpdate = true;
    this.skeletonLines.visible = anyVisible;
  }
}
